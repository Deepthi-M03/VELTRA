// Audit log, error log, mailer (outbox) and notification services.
import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

export class Audit {
  constructor(db) { this.db = db; }
  log(actorId, action, target = null, meta = {}, ip = null) {
    this.db.run('INSERT INTO audit_logs (actor_id, action, target, meta_json, ip) VALUES (?,?,?,?,?)', actorId ?? null, action, target, JSON.stringify(meta), ip);
  }
}

export class ErrorLog {
  constructor(db, log = console) { this.db = db; this.log = log; }
  record(source, err, meta = {}) {
    try { this.db.run('INSERT INTO error_logs (source, level, message, meta_json) VALUES (?,?,?,?)', source, 'error', String(err?.message || err).slice(0, 1000), JSON.stringify({ ...meta, stack: err?.stack?.split('\n').slice(0, 4).join(' | ') })); }
    catch { /* never throw from the error logger */ }
    this.log.error?.(`[${source}]`, err?.message || err);
  }
}

// Email: every message is recorded in email_outbox (and data/outbox/emails.log in development).
// When EMAIL_PROVIDER is set (resend | sendgrid | postmark) it is also delivered over the provider's HTTPS API
// and the outbox row is marked sent/failed.
export class Mailer {
  constructor(db, { dir, quiet = false, email = {}, fetchImpl = fetch } = {}) {
    this.db = db; this.dir = dir; this.quiet = quiet; this.email = email; this.fetch = fetchImpl;
    if (dir) mkdirSync(dir, { recursive: true });
    this.health = { provider: email.provider || 'outbox-only', sent: 0, failed: 0, lastError: null };
  }
  send(to, subject, body) {
    const r = this.db.run('INSERT INTO email_outbox (to_email, subject, body) VALUES (?,?,?)', to, subject, body);
    if (this.dir) appendFileSync(join(this.dir, 'emails.log'), `--- ${new Date().toISOString()}\nTo: ${to}\nSubject: ${subject}\n\n${body}\n\n`);
    if (!this.email.provider) { if (!this.quiet) console.log(`[mail queued] to=${to} subject="${subject}" (see data/outbox/emails.log)`); return Promise.resolve(); }
    return this.deliver(Number(r.lastInsertRowid), to, subject, body);
  }
  async deliver(id, to, subject, text) {
    const { provider, apiKey, from } = this.email;
    const req = {
      resend: () => ['https://api.resend.com/emails', { authorization: `Bearer ${apiKey}` }, { from, to: [to], subject, text }],
      sendgrid: () => ['https://api.sendgrid.com/v3/mail/send', { authorization: `Bearer ${apiKey}` }, { personalizations: [{ to: [{ email: to }] }], from: { email: from }, subject, content: [{ type: 'text/plain', value: text }] }],
      postmark: () => ['https://api.postmarkapp.com/email', { 'x-postmark-server-token': apiKey }, { From: from, To: to, Subject: subject, TextBody: text }],
    }[provider];
    try {
      if (!req) throw new Error(`Unknown EMAIL_PROVIDER ${provider}`);
      const [url, auth, payload] = req();
      const res = await this.fetch(url, { method: 'POST', signal: AbortSignal.timeout(10000), headers: { 'content-type': 'application/json', accept: 'application/json', ...auth }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(`${provider} HTTP ${res.status}`);
      this.db.run(`UPDATE email_outbox SET status = 'sent' WHERE id = ?`, id); this.health.sent++;
    } catch (e) {
      this.db.run(`UPDATE email_outbox SET status = 'failed' WHERE id = ?`, id); this.health.failed++; this.health.lastError = e.message;
      if (!this.quiet) console.warn(`[mail] delivery failed: ${e.message}`);
    }
  }
}

export const NOTIFICATION_TYPES = ['price_alert', 'market_open', 'market_move', 'recommendation', 'subscription_expiry', 'payment', 'system'];

const PUSH_DEFAULT = new Set(['price_alert', 'recommendation', 'payment', 'subscription_expiry', 'market_open']);

export class Notifier {
  constructor(db, bus, pusher = null) { this.db = db; this.bus = bus; this.pusher = pusher; }
  prefs(userId) {
    const rows = this.db.all('SELECT * FROM notification_preferences WHERE user_id = ?', userId);
    return NOTIFICATION_TYPES.map((type) => {
      const r = rows.find((x) => x.type === type);
      return { type, inApp: r ? !!r.in_app : true, browser: r ? !!r.browser : true, push: r ? !!r.push : PUSH_DEFAULT.has(type), email: r ? !!r.email : false };
    });
  }
  setPref(userId, p) {
    this.db.run(`INSERT INTO notification_preferences (user_id, type, in_app, browser, push, email) VALUES (?,?,?,?,?,?)
      ON CONFLICT(user_id, type) DO UPDATE SET in_app=excluded.in_app, browser=excluded.browser, push=excluded.push, email=excluded.email`,
    userId, p.type, p.inApp ? 1 : 0, p.browser ? 1 : 0, p.push ? 1 : 0, p.email ? 1 : 0);
  }
  notify(userId, type, title, body, link = null) {
    let pref = null;
    if (userId) {
      pref = this.prefs(userId).find((x) => x.type === type);
      if (pref && pref.push && this.pusher?.configured) this.pusher.sendToUser(userId, { title, body, type, link }).catch(() => {});
      if (pref && !pref.inApp && !pref.browser) return null;
    }
    const r = this.db.run('INSERT INTO notifications (user_id, type, title, body, link) VALUES (?,?,?,?,?)', userId, type, title, body, link);
    const n = { id: Number(r.lastInsertRowid), userId, type, title, body, link, createdAt: new Date().toISOString() };
    this.bus.emit('notification', n);
    return n;
  }
  broadcast(type, title, body, link = null) { return this.notify(null, type, title, body, link); }
}
