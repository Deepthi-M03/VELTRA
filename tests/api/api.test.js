import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, client, makeAdmin } from './helpers.js';
import { hmacHex } from '../../packages/payments/index.js';

let T;
before(async () => { T = await startTestApp(); await T.ctx.intel.scan(); });
after(async () => { await T.stop(); });

const PW = 'Crimson-Dynasty-2026';

test('security headers and static hardening', async () => {
  const c = client(T.base);
  const r = await c.get('/');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  const trav = await fetch(T.base + '/..%2f..%2fpackage.json');
  assert.notEqual((await trav.text()).includes('"name": "veltra"'), true);
  assert.equal((await c.get('/api/nope')).status, 404);
});

test('registration, session, logout, login', async () => {
  const c = client(T.base);
  assert.equal((await c.get('/api/market/overview')).status, 401);
  let r = await c.post('/api/auth/register', { email: 'Asha@Example.com', password: PW, name: 'Asha', acceptTerms: true });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.user.email, 'asha@example.com');
  assert.equal(r.body.user.role, 'user');
  r = await c.get('/api/auth/me'); assert.equal(r.body.user.name, 'Asha');
  assert.equal((await c.post('/api/auth/register', { email: 'asha@example.com', password: PW, name: 'Dup', acceptTerms: true })).status, 409);
  assert.equal((await client(T.base).post('/api/auth/register', { email: 'weak@example.com', password: 'short', name: 'Weak', acceptTerms: true })).status, 400);
  assert.equal((await client(T.base).post('/api/auth/register', { email: 'not-an-email', password: PW, name: 'X', acceptTerms: true })).status, 400);
  assert.equal((await c.post('/api/auth/logout')).status, 200);
  assert.equal((await c.get('/api/auth/me')).body.user, null);
  assert.equal((await c.post('/api/auth/login', { email: 'asha@example.com', password: 'wrong-password-1' })).status, 401);
  assert.equal((await c.post('/api/auth/login', { email: 'asha@example.com', password: PW })).status, 200);
});

test('CSRF token required for authenticated writes; cross-origin public writes rejected', async () => {
  const c = client(T.base);
  await c.post('/api/auth/register', { email: 'csrf@example.com', password: PW, name: 'Csrf', acceptTerms: true });
  const good = c.csrf; c.csrf = '';
  assert.equal((await c.post('/api/watchlists', { name: 'x' })).status, 403);
  c.csrf = good;
  assert.equal((await c.post('/api/watchlists', { name: 'x' })).status, 200);
  const evil = await client(T.base).post('/api/auth/login', { email: 'a@b.co', password: 'x' }, { origin: 'https://evil.example' });
  assert.equal(evil.status, 403);
});

test('rate limiting on auth endpoints', async () => {
  const L = await startTestApp({ rateLimitScale: 1 });
  try {
    const x = client(L.base); let last;
    for (let i = 0; i < 11; i++) last = await x.post('/api/auth/login', { email: 'rl@example.com', password: 'whatever-123' });
    assert.equal(last.status, 429);
  } finally { await L.stop(); }
});

test('account lockout after repeated failures', async () => {
  const c = client(T.base);
  await c.post('/api/auth/register', { email: 'lock@example.com', password: PW, name: 'Lock', acceptTerms: true });
  const x = client(T.base);
  for (let i = 0; i < 5; i++) await x.post('/api/auth/login', { email: 'lock@example.com', password: 'bad-password-9' });
  assert.equal((await x.post('/api/auth/login', { email: 'lock@example.com', password: PW })).status, 423);
});

test('password reset via emailed token; token single-use; sessions revoked', async () => {
  const c = client(T.base);
  await c.post('/api/auth/register', { email: 'reset@example.com', password: PW, name: 'Reset', acceptTerms: true });
  const r = await client(T.base).post('/api/auth/forgot-password', { email: 'reset@example.com' });
  assert.equal(r.status, 200);
  assert.equal((await client(T.base).post('/api/auth/forgot-password', { email: 'nobody@example.com' })).body.ok, true); // no enumeration
  const mail = T.ctx.db.get(`SELECT body FROM email_outbox WHERE to_email = 'reset@example.com' AND subject LIKE 'Reset%' ORDER BY id DESC`);
  const token = mail.body.match(/token=([\w-]+)/)[1];
  const n = client(T.base);
  assert.equal((await n.post('/api/auth/reset-password', { token, password: 'New-Dynasty-2027' })).status, 200);
  assert.equal((await n.post('/api/auth/reset-password', { token, password: 'Other-Dynasty-2028' })).status, 400);
  assert.equal((await c.get('/api/auth/me')).body.user, null, 'old session revoked');
  assert.equal((await n.post('/api/auth/login', { email: 'reset@example.com', password: 'New-Dynasty-2027' })).status, 200);
});

test('email verification', async () => {
  const c = client(T.base);
  await c.post('/api/auth/register', { email: 'verify@example.com', password: PW, name: 'Verify', acceptTerms: true });
  const mail = T.ctx.db.get(`SELECT body FROM email_outbox WHERE to_email = 'verify@example.com' AND subject LIKE 'Verify%'`);
  const token = mail.body.match(/token=([\w-]+)/)[1];
  assert.equal((await c.post('/api/auth/verify-email', { token })).status, 200);
  assert.equal((await c.get('/api/auth/me')).body.user.emailVerified, true);
});

test('market data endpoints return DEMO-labelled data, top 10 lists sorted', async () => {
  const c = client(T.base);
  await c.post('/api/auth/register', { email: 'mkt@example.com', password: PW, name: 'Mkt', acceptTerms: true });
  const o = (await c.get('/api/market/overview')).body;
  assert.equal(o.dataStatus, 'DEMO');
  assert.ok(o.indices.find((i) => i.symbol === 'NIFTY 50'));
  assert.ok(o.breadth.advancers + o.breadth.decliners > 0);
  assert.ok(o.sentiment.method);
  for (const [path, field] of [['/api/market/top-volume', 'volume'], ['/api/market/top-value', 'tradedValue']]) {
    const t = (await c.get(path)).body;
    assert.equal(t.rows.length, 10);
    for (let i = 1; i < 10; i++) assert.ok(t.rows[i - 1][field] >= t.rows[i][field]);
    assert.ok(t.rows.every((r) => r.dataStatus === 'DEMO' && r.timestamp && r.symbol && r.name));
  }
  const inst = (await c.get('/api/instruments?category=equity&search=RELI')).body.rows[0];
  assert.equal(inst.symbol, 'RELIANCE');
  for (const tf of ['1m', '5m', '15m', '1h', '1d']) {
    const b = (await c.get(`/api/instruments/${inst.id}/bars?timeframe=${tf}&limit=50`)).body.bars;
    assert.ok(b.length > 10, tf);
    assert.ok(b.every((x) => x.high >= x.low));
  }
  assert.equal((await c.get(`/api/instruments/${inst.id}/bars?timeframe=7m`)).status, 400);
});

test('subscription gating, sandbox payment, server-side verification, receipts', async () => {
  const c = client(T.base);
  await c.post('/api/auth/register', { email: 'buyer@example.com', password: PW, name: 'Buyer', acceptTerms: true });
  let recos = (await c.get('/api/intel/equity/recommendations')).body;
  assert.equal(recos.access, false);
  assert.ok(recos.rows.every((r) => r.locked && r.stopLoss === undefined), 'levels hidden without subscription');

  // tampered signature must fail
  let order = (await c.post('/api/payments/order', { items: [{ category: 'equity', days: 2 }, { category: 'options', days: 1 }] })).body;
  assert.equal(order.quote.totalPaise, 15000);
  const fake = await c.post('/api/payments/verify', { orderId: order.checkout.orderId, paymentId: 'pay_fake', signature: 'a'.repeat(64) });
  assert.equal(fake.status, 400);
  assert.equal((await c.get('/api/subscriptions')).body.active.length, 0);

  // proper sandbox flow
  order = (await c.post('/api/payments/order', { items: [{ category: 'equity', days: 2 }] })).body;
  const sim = (await c.post('/api/sandbox-gateway/pay', { orderId: order.checkout.orderId, outcome: 'success' })).body;
  const v = await c.post('/api/payments/verify', { orderId: sim.orderId, paymentId: sim.paymentId, signature: sim.signature });
  assert.equal(v.status, 200, v.text);
  assert.match(v.body.receipt, /^VLT-R-/);
  const again = await c.post('/api/payments/verify', { orderId: sim.orderId, paymentId: sim.paymentId, signature: sim.signature });
  assert.equal(again.status, 200);
  const subs = (await c.get('/api/subscriptions')).body;
  assert.equal(subs.active.length, 1); assert.equal(subs.active[0].category, 'equity');
  const days = (Date.parse(subs.active[0].ends_at) - Date.now()) / 86400000;
  assert.ok(days > 1.99 && days <= 2.01, `expected 2 days, got ${days}`);
  assert.equal(subs.history.length, 1, 'idempotent: no double grant');
  recos = (await c.get('/api/intel/equity/recommendations')).body;
  assert.equal(recos.access, true);
  if (recos.rows.length) { const r = recos.rows[0]; assert.ok(r.stopLoss && r.target1 && r.confidence.method && r.technicalExplanation && r.ai?.narrative && r.dataStatus); }
  assert.equal((await c.get('/api/intel/futures/recommendations')).body.access, false, 'other categories still locked');

  const paid = subs.payments.find((p) => p.status === 'paid');
  const rc = (await c.get(`/api/payments/${paid.id}/receipt`)).body;
  assert.equal(rc.amountPaise, 10000); assert.equal(rc.lines[0].days, 2);
  assert.equal((await client(T.base).get(`/api/payments/${paid.id}/receipt`)).status, 401);

  // renewal stacks on top of existing period
  const o2 = (await c.post('/api/payments/order', { items: [{ category: 'equity', days: 1 }] })).body;
  const s2 = (await c.post('/api/sandbox-gateway/pay', { orderId: o2.checkout.orderId, outcome: 'success' })).body;
  await c.post('/api/payments/verify', { orderId: s2.orderId, paymentId: s2.paymentId, signature: s2.signature });
  const end2 = (await c.get('/api/subscriptions')).body.active[0].ends_at;
  assert.ok((Date.parse(end2) - Date.now()) / 86400000 > 2.99);

  // failure path
  const o3 = (await c.post('/api/payments/order', { items: [{ category: 'currency', days: 1 }] })).body;
  const f3 = (await c.post('/api/sandbox-gateway/pay', { orderId: o3.checkout.orderId, outcome: 'failure' })).body;
  assert.ok(!f3.signature);
  await c.post('/api/payments/failed', { orderId: o3.checkout.orderId, reason: f3.error });
  const p3 = (await c.get('/api/subscriptions')).body.payments.find((p) => p.provider_order_id === o3.checkout.orderId);
  assert.equal(p3.status, 'failed');
});

test('webhooks: signature required, idempotent, activates subscription', async () => {
  const c = client(T.base);
  await c.post('/api/auth/register', { email: 'hook@example.com', password: PW, name: 'Hook', acceptTerms: true });
  const o = (await c.post('/api/payments/order', { items: [{ category: 'futures', days: 3 }] })).body;
  const body = JSON.stringify({ id: 'evt_test_1', event: 'payment.captured', payload: { payment: { entity: { id: 'pay_hook_1', order_id: o.checkout.orderId, amount: 15000 } } } });
  const send = (sig) => fetch(T.base + '/api/payments/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-razorpay-signature': sig }, body });
  assert.equal((await send('0'.repeat(64))).status, 401);
  const bodyB = body.replace('evt_test_1', 'evt_test_2');
  const ok = await fetch(T.base + '/api/payments/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-razorpay-signature': hmacHex(T.ctx.config.payments.sandboxSecret, bodyB) }, body: bodyB });
  assert.equal(ok.status, 200);
  const dup = await fetch(T.base + '/api/payments/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-razorpay-signature': hmacHex(T.ctx.config.payments.sandboxSecret, bodyB) }, body: bodyB });
  assert.equal(dup.status, 200);
  const s = (await c.get('/api/subscriptions')).body;
  assert.equal(s.active[0].category, 'futures'); assert.equal(s.history.length, 1);
});

test('AI Trade Studio payload: chart, indicators, AI analysis, gating', async () => {
  const c = client(T.base);
  await c.post('/api/auth/register', { email: 'studio@example.com', password: PW, name: 'Studio', acceptTerms: true });
  const reco = T.ctx.db.get(`SELECT instrument_id FROM recommendations WHERE category = 'equity' AND status = 'open' LIMIT 1`);
  const id = reco?.instrument_id ?? (await c.get('/api/instruments?category=equity')).body.rows[5].id;
  const s = (await c.get(`/api/studio/${id}?timeframe=15m`)).body;
  assert.ok(s.bars.length > 50 && s.series.ema20.length === s.bars.length && s.series.rsi14.length === s.bars.length);
  assert.ok(s.analysis.findings.length && s.analysis.narrative && s.analysis.guardrail.passed);
  assert.equal(s.analysis.inputs.dataStatus, 'DEMO');
  if (reco) { assert.equal(s.recommendation, null); assert.equal(s.recommendationLocked, true); assert.equal(s.analysis.inputs.recommendation, null); }
  const s2 = (await c.get(`/api/studio/${id}?timeframe=1h`)).body;
  assert.equal(s2.timeframe, '1h');
});

test('options chain: Greeks, PCR, max pain; setup locked without subscription', async () => {
  const c = client(T.base);
  await c.post('/api/auth/register', { email: 'opt@example.com', password: PW, name: 'Opt', acceptTerms: true });
  const ch = (await c.get('/api/intel/options/chain?underlying=NIFTY')).body;
  assert.ok(ch.rows.length > 10 && ch.expiries.length >= 1 && ch.spot > 0);
  const atm = ch.rows[12];
  assert.ok(atm.CE.delta > 0.3 && atm.CE.delta < 0.7 && atm.PE.delta < 0);
  assert.ok(ch.stats.pcr > 0 && ch.stats.maxPain);
  assert.equal(ch.setup, null);
  assert.equal((await c.get('/api/intel/options/chain?underlying=<script>')).status, 400);
});

test('watchlists, alerts (trigger), journal (paper fills at market), notifications', async () => {
  const c = client(T.base);
  await c.post('/api/auth/register', { email: 'tools@example.com', password: PW, name: 'Tools', acceptTerms: true });
  const inst = (await c.get('/api/instruments?category=equity&search=TCS')).body.rows[0];
  const wl = (await c.post('/api/watchlists', { name: 'Core' })).body;
  assert.equal((await c.post(`/api/watchlists/${wl.id}/items`, { instrumentId: inst.id })).status, 200);
  let lists = (await c.get('/api/watchlists')).body.rows;
  assert.equal(lists[0].items[0].symbol, 'TCS');
  assert.equal((await c.del(`/api/watchlists/${wl.id}/items/${inst.id}`)).status, 200);
  // another user cannot touch this watchlist
  const other = client(T.base); await other.post('/api/auth/register', { email: 'other@example.com', password: PW, name: 'Other', acceptTerms: true });
  assert.equal((await other.post(`/api/watchlists/${wl.id}/items`, { instrumentId: inst.id })).status, 404);

  const a = (await c.post('/api/alerts', { instrumentId: inst.id, condition: 'above', value: 0.01 })).body;
  assert.ok(a.id);
  T.ctx.intel.evaluateAlerts();
  const al = (await c.get('/api/alerts')).body.rows.find((x) => x.id === a.id);
  assert.equal(al.status, 'triggered');
  const notes = (await c.get('/api/notifications')).body;
  assert.ok(notes.rows.some((n) => n.type === 'price_alert'));
  assert.equal((await c.post('/api/notifications/read-all')).status, 200);
  assert.equal((await c.get('/api/notifications')).body.unread, 0);

  const j = (await c.post('/api/journal', { instrumentId: inst.id, kind: 'paper', side: 'BUY', quantity: 10, entryPrice: 1 })).body;
  assert.equal(j.entryPrice, inst.ltp > 0 ? j.entryPrice : null);
  assert.notEqual(j.entryPrice, 1, 'paper trades ignore client-supplied price');
  assert.equal((await c.post(`/api/journal/${j.id}/close`, {})).status, 200);
  assert.equal((await c.del(`/api/journal/${j.id}`)).status, 400, 'paper trades cannot be deleted');
  const act = (await c.post('/api/journal', { instrumentId: inst.id, kind: 'actual', side: 'SELL', quantity: 5, entryPrice: 100 })).body;
  await c.post(`/api/journal/${act.id}/close`, { exitPrice: 90 });
  const jr = (await c.get('/api/journal')).body;
  assert.equal(jr.summary.actual.realizedPnl, 50);
  assert.equal(jr.summary.paper.closed, 1);

  const prefs = (await c.put('/api/notifications/preferences', { rows: [{ type: 'market_move', inApp: false, browser: false }] })).body.rows;
  assert.equal(prefs.find((p) => p.type === 'market_move').inApp, false);
});

test('performance analytics keeps losses and expired setups', async () => {
  const c = client(T.base);
  await c.post('/api/auth/register', { email: 'perf@example.com', password: PW, name: 'Perf', acceptTerms: true });
  const r = T.ctx.db.get(`SELECT * FROM recommendations WHERE status = 'open' LIMIT 1`);
  T.ctx.db.run(`UPDATE recommendations SET status = 'stopped', entered_at = created_at, closed_at = ?, exit_price = stop_loss WHERE id = ?`, new Date().toISOString(), r.id);
  const p = (await c.get('/api/performance')).body;
  assert.ok(p.stopped >= 1 && p.total >= p.closed && p.note.includes('losses'));
  assert.ok(p.recent.some((x) => x.id === r.id && x.status === 'stopped'));
});

test('admin: forbidden for users, full access for admins, guarded flags', async () => {
  const u = client(T.base);
  await u.post('/api/auth/register', { email: 'plain@example.com', password: PW, name: 'Plain', acceptTerms: true });
  for (const p of ['/api/admin/summary', '/api/admin/users', '/api/admin/health', '/api/admin/audit', '/api/admin/payments']) assert.equal((await u.get(p)).status, 403, p);
  assert.equal((await client(T.base).get('/api/admin/summary')).status, 401);
  assert.ok(T.ctx.db.get(`SELECT 1 FROM audit_logs WHERE action = 'security.admin_denied'`));

  const cred = await makeAdmin(T.ctx);
  const a = client(T.base);
  assert.equal((await a.post('/api/auth/login', cred)).status, 200);
  const sum = (await a.get('/api/admin/summary')).body; assert.ok(sum.users >= 5);
  const h = (await a.get('/api/admin/health')).body;
  assert.equal(h.market.dataStatus, 'DEMO'); assert.equal(h.payments.sandbox, true); assert.ok(h.ai.provider);
  const users = (await a.get('/api/admin/users?search=plain')).body.rows; assert.equal(users.length, 1);
  assert.equal((await a.post('/api/admin/subscriptions', { userId: users[0].id, category: 'commodity', days: 5 })).status, 200);
  assert.equal((await u.get('/api/intel/commodity/recommendations')).body.access, true);
  assert.equal((await a.patch(`/api/admin/users/${users[0].id}`, { status: 'suspended' })).status, 200);
  assert.equal((await u.get('/api/auth/me')).body.user, null, 'suspended user session revoked');
  const self = (await a.get('/api/auth/me')).body.user.id;
  assert.equal((await a.patch(`/api/admin/users/${self}`, { role: 'user' })).status, 400);
  assert.equal((await a.put('/api/admin/flags/paid_recommendations', { enabled: true })).status, 400);
  assert.equal((await a.put('/api/admin/flags/paid_recommendations', { enabled: true, confirm: 'I confirm SEBI registration is in place' })).status, 200);
  assert.equal((await a.post('/api/admin/holidays', { date: '2026-12-31', exchange: 'NSE', description: 'Test holiday', kind: 'holiday' })).status, 200);
  assert.ok((await a.get('/api/admin/holidays')).body.rows.some((x) => x.date === '2026-12-31'));
  assert.equal((await a.put('/api/admin/rules', { minScore: 75 })).body.rules.minScore, 75);
  assert.equal((await a.post('/api/admin/notifications', { title: 'Maintenance', body: 'Tonight 11pm IST' })).status, 200);
  assert.ok((await a.get('/api/admin/audit')).body.rows.some((x) => x.action === 'admin.flag_changed'));
});

test('input validation and contact form', async () => {
  const c = client(T.base);
  assert.equal((await c.post('/api/contact', { name: 'Ravi', email: 'ravi@example.com', subject: 'Hello', message: 'I would like to know more.' })).status, 200);
  assert.equal((await c.post('/api/contact', { name: 'R', email: 'x', subject: '', message: '' })).status, 400);
  const raw = await fetch(T.base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad json' });
  assert.equal(raw.status, 400);
  const big = await fetch(T.base + '/api/contact', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'x'.repeat(200000) }) });
  assert.equal(big.status, 413);
});
