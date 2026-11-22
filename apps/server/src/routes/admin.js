import { t, validate } from '../http/validate.js';
import { bad, notFound } from '../http/core.js';
import { CATEGORY_IDS } from '../../../../packages/shared/constants.js';
import { NOTIFICATION_TYPES } from '../services/support.js';

export default function adminRoutes(r, { requireAdmin }) {
  const A = requireAdmin;
  const page = (q) => validate({ search: t.string({ optional: true, max: 80 }), limit: t.int({ optional: true, default: 50, min: 1, max: 500 }), offset: t.int({ optional: true, default: 0, min: 0 }) }, q);

  r.get('/api/admin/summary', A, async (req, res, ctx) => {
    const c = (sql, ...p) => ctx.db.get(sql, ...p).c;
    const since = new Date(Date.now() - 86400000).toISOString();
    return {
      users: c('SELECT COUNT(*) c FROM users'), newUsers24h: c('SELECT COUNT(*) c FROM users WHERE created_at > ?', since),
      activeSessions: c('SELECT COUNT(*) c FROM sessions WHERE expires_at > ?', new Date().toISOString()),
      activeSubscriptions: c(`SELECT COUNT(*) c FROM subscriptions WHERE status='active' AND ends_at > ?`, new Date().toISOString()),
      revenuePaise24h: ctx.db.get(`SELECT COALESCE(SUM(amount_paise),0) c FROM payments WHERE status='paid' AND paid_at > ?`, since).c,
      revenuePaiseTotal: ctx.db.get(`SELECT COALESCE(SUM(amount_paise),0) c FROM payments WHERE status='paid'`).c,
      failedPayments24h: c(`SELECT COUNT(*) c FROM payments WHERE status='failed' AND created_at > ?`, since),
      openRecommendations: c(`SELECT COUNT(*) c FROM recommendations WHERE status IN ('open','entered','target1_hit')`),
      errors24h: c('SELECT COUNT(*) c FROM error_logs WHERE at > ?', since),
      newContactMessages: c(`SELECT COUNT(*) c FROM contact_messages WHERE status='new'`),
    };
  });

  r.get('/api/admin/health', A, async (req, res, ctx) => ({
    market: { ...ctx.market.health, dataStatus: ctx.market.dataStatus, instruments: ctx.market.instruments.size, sessions: ['NSE_EQ', 'NSE_FO', 'NSE_CD', 'MCX'].map((s) => ctx.market.sessionStatus(s)) },
    ai: ctx.ai.health,
    payments: { provider: ctx.gateway.name, configured: ctx.gateway.configured, sandbox: ctx.gateway.isSandbox, checkout: ctx.subs.checkoutAllowed(),
      webhooks24h: ctx.db.get('SELECT COUNT(*) c FROM payment_webhooks WHERE received_at > ?', new Date(Date.now() - 86400000).toISOString()).c,
      invalidWebhookSignatures: ctx.db.get('SELECT COUNT(*) c FROM payment_webhooks WHERE signature_valid = 0').c },
    scanner: { lastScanAt: ctx.intel.lastScanAt },
    push: { ...ctx.pusher.health, androidDevices: ctx.db.get(`SELECT COUNT(*) c FROM push_devices WHERE platform = 'android'`).c },
    email: ctx.mailer.health,
    server: { uptimeSec: Math.round(process.uptime()), node: process.version, memoryMb: Math.round(process.memoryUsage().rss / 1048576), env: ctx.config.env },
    api: { requests: ctx.stats.requests, errors5xx: ctx.stats.errors5xx, rateLimited: ctx.stats.rateLimited, byStatus: ctx.stats.byStatus },
  }));

  // ---- Users ----
  r.get('/api/admin/users', A, async (req, res, ctx) => {
    const q = page(req.query); const s = q.search ? `%${q.search}%` : null;
    const rows = ctx.db.all(`SELECT id, email, name, role, status, email_verified_at, created_at, (google_sub IS NOT NULL) AS google FROM users
      WHERE (? IS NULL OR email LIKE ? OR name LIKE ?) ORDER BY id DESC LIMIT ? OFFSET ?`, s, s, s, q.limit, q.offset);
    return { rows: rows.map((u) => ({ ...u, subscriptions: ctx.subs.active(u.id) })), total: ctx.db.get('SELECT COUNT(*) c FROM users').c };
  });
  r.patch('/api/admin/users/:id', A, async (req, res, ctx) => {
    const id = Number(req.params.id); const u = ctx.db.get('SELECT * FROM users WHERE id = ?', id); if (!u) throw notFound();
    const b = validate({ role: t.enum(['user', 'admin'], { optional: true }), status: t.enum(['active', 'suspended'], { optional: true }) }, req.body);
    if (id === req.user.id && (b.role === 'user' || b.status === 'suspended')) throw bad('You cannot demote or suspend your own account.');
    if (b.role) ctx.db.run('UPDATE users SET role = ? WHERE id = ?', b.role, id);
    if (b.status) { ctx.db.run('UPDATE users SET status = ? WHERE id = ?', b.status, id); if (b.status === 'suspended') ctx.auth.destroyAllSessions(id); }
    ctx.audit.log(req.user.id, 'admin.user_updated', `user:${id}`, b, req.ip);
    return { ok: true };
  });

  // ---- Subscriptions & payments ----
  r.get('/api/admin/subscriptions', A, async (req, res, ctx) => ({
    rows: ctx.db.all(`SELECT s.*, u.email FROM subscriptions s JOIN users u ON u.id = s.user_id ORDER BY s.created_at DESC LIMIT 300`),
  }));
  r.post('/api/admin/subscriptions', A, async (req, res, ctx) => {
    const b = validate({ userId: t.int({ min: 1 }), category: t.enum(CATEGORY_IDS), days: t.int({ min: 1, max: 365 }) }, req.body);
    if (!ctx.db.get('SELECT 1 FROM users WHERE id = ?', b.userId)) throw notFound('User not found');
    return ctx.subs.adminGrant(req.user.id, b.userId, b.category, b.days);
  });
  r.delete('/api/admin/subscriptions/:id', A, async (req, res, ctx) => { ctx.subs.adminRevoke(req.user.id, Number(req.params.id)); return { ok: true }; });
  r.get('/api/admin/payments', A, async (req, res, ctx) => ({
    rows: ctx.db.all(`SELECT p.id, p.provider, p.provider_order_id, p.provider_payment_id, p.amount_paise, p.status, p.failure_reason, p.receipt_no, p.verified_via, p.created_at, p.paid_at, u.email
      FROM payments p JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC LIMIT 300`),
    webhooks: ctx.db.all('SELECT id, provider, event_id, event, signature_valid, received_at FROM payment_webhooks ORDER BY id DESC LIMIT 100'),
  }));

  // ---- Recommendations, rules, performance ----
  r.get('/api/admin/recommendations', A, async (req, res, ctx) => ({ rows: ctx.intel.recommendations({ status: 'all', limit: 300 }), performance: ctx.intel.performance(), rules: ctx.intel.rules() }));
  r.put('/api/admin/rules', A, async (req, res, ctx) => {
    const b = validate({ minScore: t.number({ optional: true, min: 50, max: 95 }), minRiskReward: t.number({ optional: true, min: 1, max: 5 }), stopAtrMultiple: t.number({ optional: true, min: 0.5, max: 5 }),
      target1R: t.number({ optional: true, min: 0.5, max: 5 }), target2R: t.number({ optional: true, min: 1, max: 10 }), volumeRatioMin: t.number({ optional: true, min: 0.5, max: 5 }) }, req.body);
    const patch = Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined));
    const rules = ctx.intel.setRules(patch);
    ctx.audit.log(req.user.id, 'admin.rules_updated', 'rules', patch, req.ip);
    return { rules };
  });
  r.post('/api/admin/scan', A, async (req, res, ctx) => { const out = await ctx.intel.scan(); ctx.audit.log(req.user.id, 'admin.scan_triggered', 'scanner', out); return out; });

  // ---- Configuration: feature flags & holidays ----
  r.get('/api/admin/flags', A, async (req, res, ctx) => ({ rows: ctx.flags.all() }));
  r.put('/api/admin/flags/:key', A, async (req, res, ctx) => {
    const b = validate({ enabled: t.bool(), confirm: t.string({ optional: true, max: 100 }) }, req.body);
    const key = req.params.key;
    if (!ctx.flags.all().some((f) => f.key === key)) throw notFound();
    if (key === 'paid_recommendations' && b.enabled && b.confirm !== 'I confirm SEBI registration is in place')
      throw bad('Enabling paid recommendations requires confirm: "I confirm SEBI registration is in place".');
    ctx.flags.set(key, b.enabled, req.user.id);
    ctx.audit.log(req.user.id, 'admin.flag_changed', `flag:${key}`, { enabled: b.enabled }, req.ip);
    return { rows: ctx.flags.all() };
  });
  r.get('/api/admin/holidays', A, async (req, res, ctx) => ({ rows: ctx.db.all('SELECT * FROM market_holidays ORDER BY date') }));
  r.post('/api/admin/holidays', A, async (req, res, ctx) => {
    const b = validate({ date: t.string({ pattern: /^\d{4}-\d{2}-\d{2}$/ }), exchange: t.enum(['NSE', 'MCX']), description: t.string({ min: 2, max: 120 }),
      kind: t.enum(['holiday', 'special_session']), openTime: t.string({ optional: true, pattern: /^\d{2}:\d{2}$/ }), closeTime: t.string({ optional: true, pattern: /^\d{2}:\d{2}$/ }) }, req.body);
    ctx.db.run(`INSERT INTO market_holidays (date, exchange, description, kind, open_time, close_time) VALUES (?,?,?,?,?,?)
      ON CONFLICT(date, exchange) DO UPDATE SET description=excluded.description, kind=excluded.kind, open_time=excluded.open_time, close_time=excluded.close_time`,
    b.date, b.exchange, b.description, b.kind, b.openTime ?? null, b.closeTime ?? null);
    ctx.market.reloadHolidays(); ctx.audit.log(req.user.id, 'admin.holiday_upsert', `holiday:${b.date}`, b, req.ip);
    return { ok: true };
  });
  r.delete('/api/admin/holidays/:exchange/:date', A, async (req, res, ctx) => {
    ctx.db.run('DELETE FROM market_holidays WHERE exchange = ? AND date = ?', req.params.exchange, req.params.date);
    ctx.market.reloadHolidays(); ctx.audit.log(req.user.id, 'admin.holiday_delete', `holiday:${req.params.date}`, {}, req.ip);
    return { ok: true };
  });

  // ---- Notifications ----
  r.post('/api/admin/notifications', A, async (req, res, ctx) => {
    const b = validate({ title: t.string({ min: 3, max: 120 }), body: t.string({ min: 3, max: 1000 }), type: t.enum(NOTIFICATION_TYPES, { optional: true, default: 'system' }), userId: t.int({ optional: true }) }, req.body);
    const n = b.userId ? ctx.notifier.notify(b.userId, b.type, b.title, b.body) : ctx.notifier.broadcast(b.type, b.title, b.body);
    ctx.audit.log(req.user.id, 'admin.notification_sent', b.userId ? `user:${b.userId}` : 'broadcast', { title: b.title }, req.ip);
    return n;
  });

  // ---- Logs ----
  r.get('/api/admin/audit', A, async (req, res, ctx) => {
    const q = page(req.query); const s = q.search ? `%${q.search}%` : null;
    return { rows: ctx.db.all(`SELECT a.*, u.email AS actor_email FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id WHERE (? IS NULL OR a.action LIKE ? OR a.target LIKE ?) ORDER BY a.id DESC LIMIT ? OFFSET ?`, s, s, s, q.limit, q.offset) };
  });
  r.get('/api/admin/errors', A, async (req, res, ctx) => ({ rows: ctx.db.all('SELECT * FROM error_logs ORDER BY id DESC LIMIT 300') }));
  r.get('/api/admin/contact', A, async (req, res, ctx) => ({ rows: ctx.db.all('SELECT * FROM contact_messages ORDER BY id DESC LIMIT 200') }));
  r.get('/api/admin/outbox', A, async (req, res, ctx) => ({ rows: ctx.db.all('SELECT id, to_email, subject, status, created_at FROM email_outbox ORDER BY id DESC LIMIT 100') }));
}
