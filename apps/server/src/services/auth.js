// Authentication: scrypt password hashing, opaque session tokens (stored hashed), CSRF tokens,
// account lockout, password-reset / email-verification tokens.
import { scrypt as _scrypt, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(_scrypt);

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
export const token = (bytes = 32) => randomBytes(bytes).toString('base64url');

export async function hashPassword(pw) {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}
export async function verifyPassword(pw, stored) {
  if (!stored) return false;
  const [alg, N, r, p, salt, key] = stored.split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(key, 'base64');
  const got = await scrypt(pw, Buffer.from(salt, 'base64'), expected.length, { N: +N, r: +r, p: +p });
  return timingSafeEqual(expected, got);
}

export function passwordProblems(pw, email = '') {
  const p = [];
  if (typeof pw !== 'string' || pw.length < 10) p.push('at least 10 characters');
  if (pw && pw.length > 128) p.push('at most 128 characters');
  if (!/[A-Za-z]/.test(pw || '') || !/\d/.test(pw || '')) p.push('letters and numbers');
  const local = (email || '').split('@')[0].toLowerCase();
  if (local.length >= 4 && pw && pw.toLowerCase().includes(local)) p.push('not containing your email name');
  return p;
}

const LOCK_AFTER = 5, LOCK_MINUTES = 15;

export class AuthService {
  constructor({ db, config, audit, mailer }) { this.db = db; this.cfg = config; this.audit = audit; this.mailer = mailer; }

  publicUser(u) {
    return u && { id: u.id, email: u.email, name: u.name, phone: u.phone, role: u.role, emailVerified: !!u.email_verified_at,
      hasPassword: !!u.password_hash, googleLinked: !!u.google_sub, createdAt: u.created_at };
  }

  async register({ email, password, name }, ip) {
    const problems = passwordProblems(password, email);
    if (problems.length) return { error: `Password must have ${problems.join(', ')}.` };
    if (this.db.get('SELECT 1 FROM users WHERE email = ?', email)) return { error: 'An account with this email already exists.', code: 'EMAIL_TAKEN' };
    const hash = await hashPassword(password);
    const r = this.db.run('INSERT INTO users (email, password_hash, name) VALUES (?,?,?)', email, hash, name);
    const id = Number(r.lastInsertRowid);
    this.audit.log(id, 'user.register', `user:${id}`, {}, ip);
    this.sendVerification(id);
    return { user: this.db.get('SELECT * FROM users WHERE id = ?', id) };
  }

  async login({ email, password }, ip) {
    const u = this.db.get('SELECT * FROM users WHERE email = ?', email);
    // Run a hash even for unknown users to keep timing uniform.
    if (!u) { await verifyPassword(password, 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(86) + '=='); return { error: 'Invalid email or password.' }; }
    if (u.locked_until && Date.parse(u.locked_until) > Date.now()) return { error: 'Too many failed attempts. Try again in a few minutes or reset your password.', code: 'LOCKED' };
    if (u.status !== 'active') return { error: 'This account is suspended. Contact support.' };
    const ok = await verifyPassword(password, u.password_hash);
    if (!ok) {
      const fails = u.failed_logins + 1;
      const lock = fails >= LOCK_AFTER ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null;
      this.db.run('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?', lock ? 0 : fails, lock, u.id);
      this.audit.log(u.id, 'user.login_failed', `user:${u.id}`, { locked: !!lock }, ip);
      return { error: 'Invalid email or password.' };
    }
    this.db.run('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?', u.id);
    this.audit.log(u.id, 'user.login', `user:${u.id}`, {}, ip);
    return { user: u };
  }

  createSession(userId, { ip, userAgent }) {
    const raw = token(32), csrf = token(24);
    const expires = new Date(Date.now() + this.cfg.sessionDays * 86400000).toISOString();
    this.db.run('INSERT INTO sessions (id, user_id, csrf_token, ip, user_agent, expires_at) VALUES (?,?,?,?,?,?)', sha256(raw), userId, csrf, ip, (userAgent || '').slice(0, 300), expires);
    return { token: raw, csrf, expires };
  }
  resolveSession(raw) {
    if (!raw || raw.length > 100) return null;
    const s = this.db.get(`SELECT s.*, u.email, u.name, u.role, u.status, u.phone, u.email_verified_at, u.password_hash, u.google_sub, u.created_at AS user_created
      FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`, sha256(raw));
    if (!s) return null;
    if (Date.parse(s.expires_at) < Date.now() || s.status !== 'active') { this.db.run('DELETE FROM sessions WHERE id = ?', s.id); return null; }
    if (Date.now() - Date.parse(s.last_seen_at) > 60000) this.db.run('UPDATE sessions SET last_seen_at = ? WHERE id = ?', new Date().toISOString(), s.id);
    return { sessionId: s.id, csrf: s.csrf_token, user: { id: s.user_id, email: s.email, name: s.name, role: s.role, phone: s.phone,
      email_verified_at: s.email_verified_at, password_hash: s.password_hash, google_sub: s.google_sub, created_at: s.user_created } };
  }
  destroySession(sessionId) { this.db.run('DELETE FROM sessions WHERE id = ?', sessionId); }
  destroyAllSessions(userId, exceptId = '') { this.db.run('DELETE FROM sessions WHERE user_id = ? AND id != ?', userId, exceptId); }

  #issueToken(userId, purpose, minutes) {
    const raw = token(32);
    this.db.run('UPDATE auth_tokens SET used_at = ? WHERE user_id = ? AND purpose = ? AND used_at IS NULL', new Date().toISOString(), userId, purpose);
    this.db.run('INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at) VALUES (?,?,?,?)', userId, purpose, sha256(raw), new Date(Date.now() + minutes * 60000).toISOString());
    return raw;
  }
  #consumeToken(raw, purpose) {
    if (typeof raw !== 'string' || raw.length > 100) return null;
    const t = this.db.get('SELECT * FROM auth_tokens WHERE token_hash = ? AND purpose = ?', sha256(raw), purpose);
    if (!t || t.used_at || Date.parse(t.expires_at) < Date.now()) return null;
    this.db.run('UPDATE auth_tokens SET used_at = ? WHERE id = ?', new Date().toISOString(), t.id);
    return t.user_id;
  }

  sendVerification(userId) {
    const u = this.db.get('SELECT * FROM users WHERE id = ?', userId);
    if (!u || u.email_verified_at) return;
    const raw = this.#issueToken(userId, 'email_verify', 60 * 24);
    this.mailer.send(u.email, 'Verify your VELTRA account', `Welcome to VELTRA, ${u.name}.\n\nConfirm your email: ${this.cfg.publicUrl}/verify-email?token=${raw}\n\nThis link expires in 24 hours.`);
  }
  verifyEmail(raw) {
    const uid = this.#consumeToken(raw, 'email_verify');
    if (!uid) return false;
    this.db.run('UPDATE users SET email_verified_at = ? WHERE id = ?', new Date().toISOString(), uid);
    this.audit.log(uid, 'user.email_verified', `user:${uid}`);
    return true;
  }
  requestPasswordReset(email, ip) {
    const u = this.db.get('SELECT * FROM users WHERE email = ?', email);
    if (!u) return; // do not reveal whether the email exists
    const raw = this.#issueToken(u.id, 'password_reset', 30);
    this.mailer.send(u.email, 'Reset your VELTRA password', `A password reset was requested for your account.\n\nReset it here: ${this.cfg.publicUrl}/reset-password?token=${raw}\n\nThis link expires in 30 minutes. If you did not request this, ignore this email.`);
    this.audit.log(u.id, 'user.password_reset_requested', `user:${u.id}`, {}, ip);
  }
  async resetPassword(raw, password, ip) {
    const t = typeof raw === 'string' ? this.db.get('SELECT * FROM auth_tokens WHERE token_hash = ? AND purpose = ?', sha256(raw), 'password_reset') : null;
    const u = t && this.db.get('SELECT * FROM users WHERE id = ?', t.user_id);
    const problems = passwordProblems(password, u?.email);
    if (problems.length) return { error: `Password must have ${problems.join(', ')}.` };
    const uid = this.#consumeToken(raw, 'password_reset');
    if (!uid) return { error: 'This reset link is invalid or has expired.' };
    this.db.run('UPDATE users SET password_hash = ?, failed_logins = 0, locked_until = NULL, updated_at = ? WHERE id = ?', await hashPassword(password), new Date().toISOString(), uid);
    this.destroyAllSessions(uid);
    this.audit.log(uid, 'user.password_reset', `user:${uid}`, {}, ip);
    return { ok: true };
  }
  async changePassword(user, current, next, sessionId) {
    const u = this.db.get('SELECT * FROM users WHERE id = ?', user.id);
    if (u.password_hash && !(await verifyPassword(current || '', u.password_hash))) return { error: 'Current password is incorrect.' };
    const problems = passwordProblems(next, u.email);
    if (problems.length) return { error: `Password must have ${problems.join(', ')}.` };
    this.db.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', await hashPassword(next), new Date().toISOString(), u.id);
    this.destroyAllSessions(u.id, sessionId);
    this.audit.log(u.id, 'user.password_changed', `user:${u.id}`);
    return { ok: true };
  }

  // ----- Google OAuth 2.0 (authorization-code flow). Active only when GOOGLE_CLIENT_ID/SECRET are set. -----
  get googleEnabled() { return !!(this.cfg.google.clientId && this.cfg.google.clientSecret); }
  googleAuthUrl(state) {
    const q = new URLSearchParams({ client_id: this.cfg.google.clientId, redirect_uri: `${this.cfg.publicUrl}/api/auth/google/callback`,
      response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account' });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  }
  async googleExchange(code, ip) {
    const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: this.cfg.google.clientId, client_secret: this.cfg.google.clientSecret,
        redirect_uri: `${this.cfg.publicUrl}/api/auth/google/callback`, grant_type: 'authorization_code' }) });
    if (!res.ok) throw new Error(`Google token exchange failed (${res.status})`);
    const { id_token } = await res.json();
    // Validate the ID token with Google's tokeninfo endpoint (checks signature & expiry server-side).
    const info = await (await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(id_token)}`, { signal: AbortSignal.timeout(10000) })).json();
    if (info.aud !== this.cfg.google.clientId || !['accounts.google.com', 'https://accounts.google.com'].includes(info.iss)) throw new Error('Invalid Google ID token');
    if (info.email_verified !== 'true' && info.email_verified !== true) throw new Error('Google email not verified');
    const email = String(info.email).toLowerCase();
    let u = this.db.get('SELECT * FROM users WHERE google_sub = ?', info.sub) || this.db.get('SELECT * FROM users WHERE email = ?', email);
    if (u && !u.google_sub) this.db.run('UPDATE users SET google_sub = ?, email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?', info.sub, new Date().toISOString(), u.id);
    if (!u) {
      const r = this.db.run('INSERT INTO users (email, name, google_sub, email_verified_at) VALUES (?,?,?,?)', email, info.name || email.split('@')[0], info.sub, new Date().toISOString());
      u = { id: Number(r.lastInsertRowid) };
      this.audit.log(u.id, 'user.register_google', `user:${u.id}`, {}, ip);
    }
    u = this.db.get('SELECT * FROM users WHERE id = ?', u.id);
    if (u.status !== 'active') throw new Error('Account suspended');
    this.audit.log(u.id, 'user.login_google', `user:${u.id}`, {}, ip);
    return u;
  }
}
