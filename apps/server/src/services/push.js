// Android push via Firebase Cloud Messaging HTTP v1 API, using a service account and an RS256 JWT
// (signed with node:crypto — no Firebase SDK needed). Inactive unless FCM credentials are configured.
import { createSign } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';

const b64url = (buf) => Buffer.from(buf).toString('base64url');

export function signJwt(claims, privateKeyPem) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(claims));
  const sig = createSign('RSA-SHA256').update(`${header}.${body}`).sign(privateKeyPem);
  return `${header}.${body}.${b64url(sig)}`;
}

export function loadServiceAccount(cfg) {
  if (cfg.serviceAccountFile && existsSync(cfg.serviceAccountFile)) {
    const j = JSON.parse(readFileSync(cfg.serviceAccountFile, 'utf8'));
    return { projectId: j.project_id, clientEmail: j.client_email, privateKey: j.private_key };
  }
  if (cfg.projectId && cfg.clientEmail && cfg.privateKey) return { projectId: cfg.projectId, clientEmail: cfg.clientEmail, privateKey: cfg.privateKey.replace(/\\n/g, '\n') };
  return null;
}

export class FcmPusher {
  constructor({ db, account, log = console, fetchImpl = fetch }) {
    this.db = db; this.account = account; this.log = log; this.fetch = fetchImpl;
    this.token = null; this.tokenExp = 0;
    this.health = { configured: !!account, sent: 0, failed: 0, removedTokens: 0, lastError: null };
  }
  get configured() { return !!this.account; }

  async accessToken() {
    if (this.token && Date.now() < this.tokenExp - 60000) return this.token;
    const now = Math.floor(Date.now() / 1000);
    const assertion = signJwt({ iss: this.account.clientEmail, scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }, this.account.privateKey);
    const res = await this.fetch('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
    if (!res.ok) throw new Error(`FCM auth failed (${res.status})`);
    const j = await res.json();
    this.token = j.access_token; this.tokenExp = Date.now() + (j.expires_in || 3600) * 1000;
    return this.token;
  }

  // Sends to every Android device registered by the user. Invalid tokens are removed.
  async sendToUser(userId, { title, body, type, link }) {
    if (!this.configured) return { sent: 0, skipped: 'not configured' };
    const devices = this.db.all(`SELECT id, token FROM push_devices WHERE user_id = ? AND platform = 'android'`, userId);
    if (!devices.length) return { sent: 0 };
    let sent = 0;
    try {
      const at = await this.accessToken();
      for (const d of devices) {
        const res = await this.fetch(`https://fcm.googleapis.com/v1/projects/${this.account.projectId}/messages:send`, {
          method: 'POST', signal: AbortSignal.timeout(10000),
          headers: { authorization: `Bearer ${at}`, 'content-type': 'application/json' },
          body: JSON.stringify({ message: { token: d.token, notification: { title, body },
            data: { type: String(type || 'system'), path: link && link.startsWith('/') ? link.split('#')[0] : '/app', title, body },
            android: { priority: 'HIGH', notification: { channel_id: ['payment', 'subscription_expiry'].includes(type) ? 'veltra_account' : 'veltra_alerts' } } } }),
        });
        if (res.ok) { sent++; this.health.sent++; continue; }
        this.health.failed++;
        const txt = await res.text().catch(() => '');
        if (res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(txt)) { this.db.run('DELETE FROM push_devices WHERE id = ?', d.id); this.health.removedTokens++; }
        else this.health.lastError = `FCM ${res.status}`;
      }
    } catch (e) { this.health.failed++; this.health.lastError = e.message; this.log.warn?.(`[push] ${e.message}`); }
    return { sent };
  }
}
