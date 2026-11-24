// Subscriptions & payments. â‚¹50 per day per category. Entitlements are computed from the
// subscriptions table only â€” never from client state.
import { CATEGORY_IDS, CATEGORIES, PRICE_PER_DAY_PAISE, MAX_SUBSCRIPTION_DAYS } from '../../../../packages/shared/constants.js';

export function quote(items) {
  const seen = new Set();
  const lines = items.map(({ category, days }) => {
    if (!CATEGORY_IDS.includes(category)) throw new Error(`Unknown category ${category}`);
    if (seen.has(category)) throw new Error(`Duplicate category ${category}`);
    seen.add(category);
    if (!Number.isInteger(days) || days < 1 || days > MAX_SUBSCRIPTION_DAYS) throw new Error(`days must be 1â€“${MAX_SUBSCRIPTION_DAYS}`);
    return { category, days, name: CATEGORIES.find((c) => c.id === category).name, amountPaise: days * PRICE_PER_DAY_PAISE };
  });
  return { lines, totalPaise: lines.reduce((a, l) => a + l.amountPaise, 0), pricePerDayPaise: PRICE_PER_DAY_PAISE };
}

export class SubscriptionService {
  constructor({ db, gateway, audit, notifier, flags }) { this.db = db; this.gateway = gateway; this.audit = audit; this.notifier = notifier; this.flags = flags; }

  active(userId, at = new Date()) {
    const iso = at.toISOString();
    // Renewals are stored as future-dated periods that start when the current one ends, so
    // "active until" is the latest end among unexpired periods, provided one has already started.
    return this.db.all(`SELECT category, MIN(starts_at) AS starts_at, MAX(ends_at) AS ends_at FROM subscriptions
      WHERE user_id = ? AND status = 'active' AND ends_at > ? GROUP BY category HAVING MIN(starts_at) <= ?`, userId, iso, iso);
  }
  hasAccess(user, category) {
    if (user?.role === 'admin') return true;
    return this.active(user.id).some((s) => s.category === category);
  }
  history(userId) {
    return this.db.all('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 200', userId);
  }

  // Extends from the later of now or the current end, so renewals stack.
  #grant(db, userId, category, days, paymentId = null, grantedBy = null) {
    const now = new Date();
    const cur = db.get(`SELECT MAX(ends_at) AS e FROM subscriptions WHERE user_id = ? AND category = ? AND status = 'active' AND ends_at > ?`, userId, category, now.toISOString());
    const start = cur?.e ? new Date(cur.e) : now;
    const end = new Date(start.getTime() + days * 86400000);
    db.run('INSERT INTO subscriptions (user_id, category, starts_at, ends_at, payment_id, granted_by) VALUES (?,?,?,?,?,?)', userId, category, start.toISOString(), end.toISOString(), paymentId, grantedBy);
    return { category, startsAt: start.toISOString(), endsAt: end.toISOString() };
  }
  adminGrant(adminId, userId, category, days) {
    const r = this.db.tx((db) => this.#grant(db, userId, category, days, null, adminId));
    this.audit.log(adminId, 'admin.subscription_grant', `user:${userId}`, { category, days });
    return r;
  }
  adminRevoke(adminId, subscriptionId) {
    this.db.run(`UPDATE subscriptions SET status = 'revoked' WHERE id = ?`, subscriptionId);
    this.audit.log(adminId, 'admin.subscription_revoke', `subscription:${subscriptionId}`);
  }

  checkoutAllowed() {
    if (this.gateway.disabled) return { ok: false, reason: 'Payments are not configured for this demo.' };
    if (this.gateway.isSandbox) return { ok: true };
    if (!this.flags.get('live_payments')) return { ok: false, reason: 'Live payments are disabled by the administrator.' };
    if (!this.flags.get('paid_recommendations')) return { ok: false, reason: 'Paid intelligence is not yet available: regulatory registration is pending.' };
    return { ok: true };
  }

  async createOrder(user, items) {
    const allowed = this.checkoutAllowed();
    if (!allowed.ok) return { error: allowed.reason, code: 'CHECKOUT_DISABLED' };
    const q = quote(items);
    const receipt = `VLT-${Date.now().toString(36).toUpperCase()}-${user.id}`;
    const order = await this.gateway.createOrder({ amountPaise: q.totalPaise, receipt, notes: { userId: String(user.id) } });
    if (order.amountPaise !== q.totalPaise) throw new Error('Gateway amount mismatch');
    const r = this.db.run('INSERT INTO payments (user_id, provider, provider_order_id, amount_paise, items_json) VALUES (?,?,?,?,?)',
      user.id, this.gateway.name, order.orderId, q.totalPaise, JSON.stringify(q.lines.map(({ category, days }) => ({ category, days }))));
    this.audit.log(user.id, 'payment.order_created', `payment:${r.lastInsertRowid}`, { amountPaise: q.totalPaise, provider: this.gateway.name });
    return { paymentId: Number(r.lastInsertRowid), quote: q, checkout: { ...order.checkout, name: 'VELTRA', prefill: { email: user.email, name: user.name } } };
  }

  // Marks a payment paid exactly once (idempotent) and activates subscriptions atomically.
  #markPaid(payment, providerPaymentId, via) {
    return this.db.tx((db) => {
      const cur = db.get('SELECT * FROM payments WHERE id = ?', payment.id);
      if (cur.status === 'paid') return { already: true, payment: cur };
      const receipt = `VLT-R-${new Date().getFullYear()}-${String(cur.id).padStart(6, '0')}`;
      db.run(`UPDATE payments SET status = 'paid', provider_payment_id = ?, paid_at = ?, receipt_no = ?, verified_via = ?, failure_reason = NULL WHERE id = ?`,
        providerPaymentId, new Date().toISOString(), receipt, via, cur.id);
      const grants = JSON.parse(cur.items_json).map((it) => this.#grant(db, cur.user_id, it.category, it.days, cur.id));
      return { already: false, grants, payment: db.get('SELECT * FROM payments WHERE id = ?', cur.id) };
    });
  }

  async verifyCheckout(user, { orderId, paymentId, signature }) {
    if (this.gateway.disabled) return { error: 'Payments are disabled.' };
    const p = this.db.get('SELECT * FROM payments WHERE provider_order_id = ? AND user_id = ?', orderId, user.id);
    if (!p) return { error: 'Order not found.' };
    if (p.status === 'paid') return { ok: true, payment: p, already: true };
    if (!this.gateway.verifyCheckoutSignature({ orderId, paymentId, signature })) {
      this.db.run(`UPDATE payments SET status = 'failed', failure_reason = 'invalid signature' WHERE id = ? AND status = 'created'`, p.id);
      this.audit.log(user.id, 'payment.signature_invalid', `payment:${p.id}`);
      return { error: 'Payment verification failed. If money was debited it will be reconciled via the gateway webhook.' };
    }
    const confirm = await this.gateway.confirmPayment({ paymentId, orderId, amountPaise: p.amount_paise });
    if (!confirm.ok) {
      this.audit.log(user.id, 'payment.confirm_failed', `payment:${p.id}`, { reason: confirm.reason });
      return { error: 'Payment not yet confirmed by the gateway. Your subscription will activate automatically once it is.', pending: true };
    }
    const r = this.#markPaid(p, paymentId, 'signature');
    this.audit.log(user.id, 'payment.paid', `payment:${p.id}`, { via: 'signature' });
    if (!r.already) this.notifier.notify(user.id, 'payment', 'Payment confirmed', `Receipt ${r.payment.receipt_no} â€” â‚¹${(p.amount_paise / 100).toFixed(2)}. Your subscriptions are active.`, '/app/subscription');
    return { ok: true, payment: r.payment, grants: r.grants };
  }

  recordFailure(user, orderId, reason) {
    const p = this.db.get('SELECT * FROM payments WHERE provider_order_id = ? AND user_id = ?', orderId, user.id);
    if (!p || p.status !== 'created') return;
    this.db.run(`UPDATE payments SET status = 'failed', failure_reason = ? WHERE id = ?`, String(reason || 'failed').slice(0, 200), p.id);
    this.audit.log(user.id, 'payment.failed', `payment:${p.id}`, { reason });
  }

  // Webhook: authenticated by HMAC over the raw body; idempotent on event id.
  handleWebhook(rawBody, signature) {
    if (this.gateway.disabled) return { status: 404 };
    const valid = this.gateway.verifyWebhook(rawBody, signature || '');
    let body; try { body = JSON.parse(rawBody); } catch { return { status: 400 }; }
    const ev = this.gateway.parseWebhook(body);
    try {
      this.db.run('INSERT INTO payment_webhooks (provider, event_id, event, signature_valid, payload, received_at) VALUES (?,?,?,?,?,?)',
        this.gateway.name, String(ev.eventId), String(ev.event), valid ? 1 : 0, rawBody.slice(0, 20000), new Date().toISOString());
    } catch (e) { if (String(e.message).includes('UNIQUE')) return { status: 200, duplicate: true }; throw e; }
    if (!valid) return { status: 401 };
    const p = ev.orderId && this.db.get('SELECT * FROM payments WHERE provider_order_id = ?', ev.orderId);
    if (!p) return { status: 200, ignored: 'unknown order' };
    if (ev.paid) {
      if (ev.amountPaise !== p.amount_paise) { this.audit.log(null, 'payment.webhook_amount_mismatch', `payment:${p.id}`, { got: ev.amountPaise }); return { status: 200 }; }
      const r = this.#markPaid(p, ev.paymentId, 'webhook');
      if (!r.already) this.notifier.notify(p.user_id, 'payment', 'Payment confirmed', `Receipt ${r.payment.receipt_no}. Your subscriptions are active.`, '/app/subscription');
      this.audit.log(null, 'payment.paid', `payment:${p.id}`, { via: 'webhook' });
    } else if (ev.failed && p.status === 'created') {
      this.db.run(`UPDATE payments SET status = 'failed', failure_reason = ? WHERE id = ?`, ev.reason || 'payment.failed', p.id);
    }
    return { status: 200 };
  }

  payments(userId) {
    return this.db.all('SELECT id, provider, provider_order_id, provider_payment_id, amount_paise, items_json, status, failure_reason, receipt_no, created_at, paid_at FROM payments WHERE user_id = ? ORDER BY created_at DESC', userId)
      .map((p) => ({ ...p, items: JSON.parse(p.items_json), items_json: undefined }));
  }

  // Expiry reminders (run by scheduler).
  remindExpiring() {
    const soon = new Date(Date.now() + 24 * 3600000).toISOString(), now = new Date().toISOString();
    const rows = this.db.all(`SELECT s.user_id, s.category, MAX(s.ends_at) AS ends_at FROM subscriptions s WHERE s.status='active' GROUP BY s.user_id, s.category HAVING ends_at > ? AND ends_at <= ?`, now, soon);
    for (const r of rows) {
      const key = `sub-exp:${r.user_id}:${r.category}:${r.ends_at.slice(0, 13)}`;
      if (this.db.get('SELECT 1 FROM notifications WHERE user_id = ? AND type = ? AND link = ?', r.user_id, 'subscription_expiry', `/app/subscription#${key}`)) continue;
      const name = CATEGORIES.find((c) => c.id === r.category)?.name;
      this.notifier.notify(r.user_id, 'subscription_expiry', `${name} expires soon`, `Your access ends ${new Date(r.ends_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST. Renew to keep access.`, `/app/subscription#${key}`);
    }
  }
}

export class FeatureFlags {
  constructor(db) { this.db = db; }
  all() { return this.db.all('SELECT key, enabled, description, updated_at FROM feature_flags ORDER BY key').map((f) => ({ ...f, enabled: !!f.enabled })); }
  get(key) { return !!this.db.get('SELECT enabled FROM feature_flags WHERE key = ?', key)?.enabled; }
  set(key, enabled, by) { this.db.run('UPDATE feature_flags SET enabled = ?, updated_by = ?, updated_at = ? WHERE key = ?', enabled ? 1 : 0, by, new Date().toISOString(), key); }
}
