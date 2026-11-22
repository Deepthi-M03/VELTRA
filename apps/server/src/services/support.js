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

// No SMTP provider is configured by default: emails are queued in email_outbox and written to
// data/outbox/*.log so password-reset/verification links can be used in development.
// Wire SMTP_* or a transactional email API in `deliver()` for production.
export class Mailer {
  constructor(db, { dir, quiet = false } = {}) { this.db = db; this.dir = dir; this.quiet = quiet; if (dir) mkdirSync(dir, { recursive: true }); }
  send(to, subject, body) {
    this.db.run('INSERT INTO email_outbox (to_email, subject, body) VALUES (?,?,?)', to, subject, body);
    if (this.dir) appendFileSync(join(this.dir, 'emails.log'), `--- ${new Date().toISOString()}\nTo: ${to}\nSubject: ${subject}\n\n${body}\n\n`);
    if (!this.quiet) console.log(`[mail queued] to=${to} subject="${subject}" (see data/outbox/emails.log)`);
  }
}

export const NOTIFICATION_TYPES = ['price_alert', 'market_open', 'market_move', 'recommendation', 'subscription_expiry', 'payment', 'system'];

export class Notifier {
  constructor(db, bus) { this.db = db; this.bus = bus; }
  prefs(userId) {
    const rows = this.db.all('SELECT * FROM notification_preferences WHERE user_id = ?', userId);
    return NOTIFICATION_TYPES.map((type) => {
      const r = rows.find((x) => x.type === type);
      return { type, inApp: r ? !!r.in_app : true, browser: r ? !!r.browser : true, push: r ? !!r.push : false, email: r ? !!r.email : false };
    });
  }
  setPref(userId, p) {
    this.db.run(`INSERT INTO notification_preferences (user_id, type, in_app, browser, push, email) VALUES (?,?,?,?,?,?)
      ON CONFLICT(user_id, type) DO UPDATE SET in_app=excluded.in_app, browser=excluded.browser, push=excluded.push, email=excluded.email`,
    userId, p.type, p.inApp ? 1 : 0, p.browser ? 1 : 0, p.push ? 1 : 0, p.email ? 1 : 0);
  }
  notify(userId, type, title, body, link = null) {
    if (userId) {
      const pref = this.prefs(userId).find((x) => x.type === type);
      if (pref && !pref.inApp && !pref.browser) return null;
    }
    const r = this.db.run('INSERT INTO notifications (user_id, type, title, body, link) VALUES (?,?,?,?,?)', userId, type, title, body, link);
    const n = { id: Number(r.lastInsertRowid), userId, type, title, body, link, createdAt: new Date().toISOString() };
    this.bus.emit('notification', n);
    // Android push: send via FCM here when FCM credentials are configured (see SETUP.md).
    return n;
  }
  broadcast(type, title, body, link = null) { return this.notify(null, type, title, body, link); }
}
