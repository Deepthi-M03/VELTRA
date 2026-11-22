// Configuration loader. Reads ./.env (if present) without overriding real environment variables.
// Secrets are only ever read from the environment — never from the database or the frontend.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));

function loadDotEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

const bool = (v, d = false) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(v));

export function loadConfig(overrides = {}) {
  if (!overrides.skipDotEnv) loadDotEnv(join(ROOT, '.env'));
  const e = process.env;
  const env = e.NODE_ENV || 'development';
  const cfg = {
    env,
    isProd: env === 'production',
    port: Number(e.PORT || 4000),
    host: e.HOST || '127.0.0.1',
    publicUrl: e.PUBLIC_URL || `http://localhost:${e.PORT || 4000}`,
    dbFile: e.DATABASE_FILE ? resolve(ROOT, e.DATABASE_FILE) : join(ROOT, 'data', 'veltra.db'),
    trustProxy: bool(e.TRUST_PROXY),
    rateLimitScale: Number(e.RATE_LIMIT_SCALE || 1),
    sessionDays: Number(e.SESSION_DAYS || 7),
    cookieSecure: bool(e.COOKIE_SECURE, env === 'production'),
    market: {
      provider: e.MARKET_PROVIDER || 'demo',          // demo | http-feed
      pollMs: Number(e.MARKET_POLL_MS || 3000),
      staleAfterMs: Number(e.MARKET_STALE_AFTER_MS || 15000),
      monitorStart: e.MARKET_MONITOR_START || '09:10',
      monitorEnd: e.MARKET_MONITOR_END || '15:30',
      feedUrl: e.MARKET_FEED_URL || '',
      feedApiKey: e.MARKET_FEED_API_KEY || '',
      feedIsDelayed: bool(e.MARKET_FEED_DELAYED),
      demoAlwaysOpen: bool(e.DEMO_ALWAYS_OPEN, true),
    },
    ai: {
      provider: e.AI_PROVIDER || 'deterministic',     // deterministic | anthropic
      anthropicApiKey: e.ANTHROPIC_API_KEY || '',
      anthropicModel: e.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
      timeoutMs: Number(e.AI_TIMEOUT_MS || 20000),
      maxRetries: Number(e.AI_MAX_RETRIES || 2),
      ratePerMinute: Number(e.AI_RATE_PER_MINUTE || 30),
    },
    payments: {
      provider: e.PAYMENT_PROVIDER || 'sandbox',      // sandbox | razorpay
      razorpayKeyId: e.RAZORPAY_KEY_ID || '',
      razorpayKeySecret: e.RAZORPAY_KEY_SECRET || '',
      razorpayWebhookSecret: e.RAZORPAY_WEBHOOK_SECRET || '',
      sandboxSecret: e.SANDBOX_PAYMENT_SECRET || 'veltra-sandbox-not-for-production',
    },
    google: {
      clientId: e.GOOGLE_CLIENT_ID || '',
      clientSecret: e.GOOGLE_CLIENT_SECRET || '',
    },
    vapidPublicKey: e.VAPID_PUBLIC_KEY || '',
    ...overrides,
  };
  if (cfg.isProd) {
    if (cfg.payments.provider === 'sandbox') throw new Error('PAYMENT_PROVIDER=sandbox is not allowed in production.');
    if (!cfg.cookieSecure) throw new Error('COOKIE_SECURE must be true in production.');
  }
  return cfg;
}
