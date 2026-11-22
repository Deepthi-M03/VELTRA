// Composes services and HTTP handling. `createApp` is used by the server entry point and the tests.
import { createServer } from 'node:http';
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { openDatabase, migrate } from '../../../packages/database/db.js';
import { createProvider } from '../../../packages/market-engine/providers/index.js';
import { MarketDataService } from '../../../packages/market-engine/service.js';
import { AIEngine } from '../../../packages/ai-engine/index.js';
import { createGateway } from '../../../packages/payments/index.js';
import { ROOT } from './config.js';
import { Router, HttpError, readBody, parseCookies, securityHeaders, sendJson, RateLimiter, serveStatic, clientIp, unauthorized, forbidden } from './http/core.js';
import { AuthService } from './services/auth.js';
import { Audit, ErrorLog, Mailer, Notifier } from './services/support.js';
import { SubscriptionService, FeatureFlags } from './services/subscriptions.js';
import { Intelligence } from './services/intelligence.js';
import authRoutes, { SESSION_COOKIE } from './routes/auth.js';
import marketRoutes from './routes/market.js';
import userRoutes from './routes/user.js';
import billingRoutes from './routes/billing.js';
import adminRoutes from './routes/admin.js';

const WEB_ROOT = join(ROOT, 'apps', 'web', 'public');
const CSRF_EXEMPT = new Set(['/api/payments/webhook']);
const PUBLIC_POSTS = new Set(['/api/auth/login', '/api/auth/register', '/api/auth/forgot-password', '/api/auth/reset-password', '/api/auth/verify-email', '/api/contact']);

export async function createApp(config, { log = console, quietMail = false } = {}) {
  const db = openDatabase(config.dbFile);
  migrate(db, (m) => log.info?.(m));
  const bus = new EventEmitter(); bus.setMaxListeners(10000);
  const audit = new Audit(db), errors = new ErrorLog(db, log);
  const mailer = new Mailer(db, { dir: config.dbFile === ':memory:' ? null : join(ROOT, 'data', 'outbox'), quiet: quietMail });
  const notifier = new Notifier(db, bus);
  const flags = new FeatureFlags(db);
  const provider = createProvider(config.market.provider, config.market);
  const market = new MarketDataService({ db, provider, config, log });
  const ai = new AIEngine({ db, config, log });
  const gateway = createGateway(config.payments);
  const subs = new SubscriptionService({ db, gateway, audit, notifier, flags });
  const auth = new AuthService({ db, config, audit, mailer });
  const intel = new Intelligence({ db, market, ai, notifier, errors, log });
  const stats = { requests: 0, errors5xx: 0, rateLimited: 0, byStatus: {} };
  const ctx = { config, db, bus, audit, errors, mailer, notifier, flags, market, ai, gateway, subs, auth, intel, stats };

  const limiter = new RateLimiter();
  const limit = (bucket, max, windowMs) => async (req) => {
    const r = limiter.hit(`${bucket}:${req.ip}`, Math.ceil(max * (config.rateLimitScale || 1)), windowMs);
    if (!r.allowed) { stats.rateLimited++; throw new HttpError(429, 'Too many requests. Please wait and try again.'); }
  };
  const requireAuth = async (req) => { if (!req.user) throw unauthorized(); };
  const requireAdmin = async (req) => { if (!req.user) throw unauthorized(); if (req.user.role !== 'admin') { audit.log(req.user.id, 'security.admin_denied', req.path, {}, req.ip); throw forbidden('Administrator access required'); } };

  const router = new Router();
  const mw = { requireAuth, requireAdmin, limit };
  authRoutes(router, mw); marketRoutes(router, mw); userRoutes(router, mw); billingRoutes(router, mw); adminRoutes(router, mw);
  router.get('/api/health', async () => ({ ok: true, time: new Date().toISOString() }));

  // Server-sent events: live quote ticks + this user's notifications.
  router.get('/api/stream', requireAuth, async (req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    res.write(`retry: 3000\n\n`);
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const onQuotes = (ids) => send('quotes', { dataStatus: market.dataStatus, rows: ids.map((id) => { const q = market.quoteView(market.instrument(id)); return [id, q.ltp, q.changePct, q.volume, q.dataStatus, q.timestamp]; }) });
    const onNotif = (n) => { if (n.userId === null || n.userId === req.user.id) send('notification', n); };
    market.on('quotes', onQuotes); bus.on('notification', onNotif);
    const ping = setInterval(() => res.write(': ping\n\n'), 20000);
    req.on('close', () => { clearInterval(ping); market.off('quotes', onQuotes); bus.off('notification', onNotif); });
    return null;
  });

  async function handle(req, res) {
    stats.requests++;
    securityHeaders(res, { isProd: config.isProd });
    const url = new URL(req.url, 'http://local');
    req.path = url.pathname; req.query = Object.fromEntries(url.searchParams); req.ip = clientIp(req, config.trustProxy);
    req.cookies = parseCookies(req.headers.cookie);
    try {
      if (!req.path.startsWith('/api/')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');
        if (req.path === '/js/shared/constants.js') { await serveStatic(join(ROOT, 'packages', 'shared'), '/constants.js', res); return; }
        if (await serveStatic(WEB_ROOT, req.path, res)) return;
        throw new HttpError(404, 'Not found');
      }
      await limit('api', 600, 60000)(req);
      const sess = auth.resolveSession(req.cookies[SESSION_COOKIE]);
      if (sess) { req.session = sess; req.user = sess.user; }
      const m = router.match(req.method, req.path);
      if (!m) throw new HttpError(404, 'API route not found');
      req.params = m.params;
      if (req.method !== 'GET') {
        req.rawBody = await readBody(req);
        if (!CSRF_EXEMPT.has(req.path)) {
          if (req.rawBody && !String(req.headers['content-type'] || '').includes('application/json')) throw new HttpError(415, 'Content-Type must be application/json');
          try { req.body = req.rawBody ? JSON.parse(req.rawBody) : {}; } catch { throw new HttpError(400, 'Invalid JSON body'); }
          // CSRF: authenticated writes need the per-session token; public writes need a same-origin Origin.
          if (req.user && !PUBLIC_POSTS.has(req.path)) {
            if (req.headers['x-csrf-token'] !== req.session.csrf) throw new HttpError(403, 'Invalid or missing CSRF token');
          } else {
            const origin = req.headers.origin;
            if (origin && new URL(origin).host !== req.headers.host && origin !== config.publicUrl) throw new HttpError(403, 'Cross-origin request rejected');
          }
        }
      }
      let result;
      for (const h of m.handlers) { result = await h(req, res, ctx); if (res.headersSent) return; }
      if (result === null) return;
      sendJson(res, 200, result ?? { ok: true });
      stats.byStatus[200] = (stats.byStatus[200] || 0) + 1;
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
      if (status >= 500) { stats.errors5xx++; errors.record('http', e, { path: req.path, method: req.method }); }
      if (res.headersSent) { res.end(); return; }
      if (status === 404 && !req.path.startsWith('/api/')) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found'); return; }
      sendJson(res, status, { error: status >= 500 && config.isProd ? 'Internal server error' : e.message, details: e.details });
    }
  }

  const server = createServer(handle);
  server.headersTimeout = 20000; server.requestTimeout = 30000;

  // Background jobs.
  const jobs = [];
  function startJobs() {
    market.on('quotes', () => { try { intel.track(); intel.evaluateAlerts(); intel.marketEvents(); } catch (e) { errors.record('jobs', e); } });
    jobs.push(setInterval(() => intel.scan().catch((e) => errors.record('scanner', e)), 60000));
    jobs.push(setInterval(() => { try { subs.remindExpiring(); db.run('DELETE FROM sessions WHERE expires_at < ?', new Date().toISOString()); } catch (e) { errors.record('jobs', e); } }, 10 * 60000));
    jobs.forEach((j) => j.unref());
  }

  return {
    ctx, server,
    async start({ jobs: withJobs = true } = {}) {
      await market.start();
      if (withJobs) { startJobs(); await intel.scan(); }
      await new Promise((r) => server.listen(config.port, config.host, r));
      return server.address();
    },
    async stop() { jobs.forEach(clearInterval); market.stop(); await new Promise((r) => server.close(r)); server.closeAllConnections?.(); db.close(); },
  };
}
