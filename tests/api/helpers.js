import { loadConfig } from '../../apps/server/src/config.js';
import { createApp } from '../../apps/server/src/app.js';
import { hashPassword } from '../../apps/server/src/services/auth.js';

export async function startTestApp(overrides = {}) {
  const config = loadConfig({ skipDotEnv: true, port: 0, host: '127.0.0.1', dbFile: ':memory:', env: 'test', isProd: false, cookieSecure: false, rateLimitScale: 50, ...overrides });
  const app = await createApp(config, { log: {}, quietMail: true });
  const addr = await app.start({ jobs: false });
  const base = `http://127.0.0.1:${addr.port}`;
  return { app, base, ctx: app.ctx, stop: () => app.stop() };
}

// Minimal cookie-jar client that sends the CSRF token automatically.
export function client(base) {
  let cookie = '', csrf = '';
  async function req(method, path, body, headers = {}) {
    const res = await fetch(base + path, {
      method, redirect: 'manual',
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...(csrf && method !== 'GET' ? { 'x-csrf-token': csrf } : {}), ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const sc = res.headers.getSetCookie?.() || [];
    for (const c of sc) if (c.startsWith('veltra_sid=')) cookie = c.split(';')[0].endsWith('=') ? '' : c.split(';')[0];
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    if (json?.csrfToken) csrf = json.csrfToken;
    return { status: res.status, body: json, text, headers: res.headers };
  }
  return {
    get: (p, h) => req('GET', p, undefined, h), post: (p, b = {}, h) => req('POST', p, b, h), put: (p, b, h) => req('PUT', p, b, h),
    patch: (p, b, h) => req('PATCH', p, b, h), del: (p, h) => req('DELETE', p, undefined, h),
    get csrf() { return csrf; }, set csrf(v) { csrf = v; }, get cookie() { return cookie; },
  };
}

export async function makeAdmin(ctx, email = 'admin@veltra.test', password = 'Admin-Password-2026') {
  ctx.db.run(`INSERT INTO users (email, password_hash, name, role, email_verified_at) VALUES (?,?,?,'admin',?)`, email, await hashPassword(password), 'Admin', new Date().toISOString());
  return { email, password };
}
