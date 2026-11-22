import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyNumbers, buildFindings, deterministicNarrative } from '../../packages/ai-engine/index.js';
import { RazorpayGateway, SandboxGateway, hmacHex } from '../../packages/payments/index.js';
import { quote } from '../../apps/server/src/services/subscriptions.js';
import { hashPassword, verifyPassword, passwordProblems } from '../../apps/server/src/services/auth.js';

const inputs = { symbol: 'TEST', dataStatus: 'DEMO', indicators: { close: 1523.4, rsi14: 61.2, ema20: 1500.1, ema50: 1480.5, vwap: 1519.9, volumeRatio: 1.42, macdHist: 0.8, macdHistPrev: 0.5 },
  recommendation: { direction: 'LONG', horizon: 'intraday', score: 78.5, entryLow: 1520, entryHigh: 1526.8, stopLoss: 1504.2, target1: 1551.3, target2: 1570, riskReward: 1.5 } };

test('AI guardrail rejects numbers not present in the inputs', () => {
  assert.equal(verifyNumbers('Price 1523.40 is above EMA20 at 1500.1 with RSI 61.2.', inputs).passed, true);
  const bad = verifyNumbers('A move to 1650 is likely, a 12.5% gain.', inputs);
  assert.equal(bad.passed, false); assert.deepEqual(bad.unverified, [1650, 12.5]);
});

test('Deterministic narrative only cites input numbers and states DEMO', () => {
  const f = buildFindings(inputs);
  const text = deterministicNarrative(inputs, f);
  assert.ok(verifyNumbers(text, inputs).passed, text);
  assert.ok(f.risks.some((r) => r.includes('DEMO')));
  assert.ok(f.findings.every((x) => Array.isArray(x.basis) && x.basis.length));
});

test('Razorpay signature verification (HMAC-SHA256 of order|payment)', () => {
  const g = new RazorpayGateway({ keyId: 'rzp_test_x', keySecret: 'secret123', webhookSecret: 'wh' });
  const sig = hmacHex('secret123', 'order_1|pay_1');
  assert.equal(g.verifyCheckoutSignature({ orderId: 'order_1', paymentId: 'pay_1', signature: sig }), true);
  assert.equal(g.verifyCheckoutSignature({ orderId: 'order_1', paymentId: 'pay_2', signature: sig }), false);
  assert.equal(g.verifyCheckoutSignature({ orderId: 'order_1', paymentId: 'pay_1', signature: 'zz' }), false);
  const body = '{"event":"payment.captured"}';
  assert.equal(g.verifyWebhook(body, hmacHex('wh', body)), true);
  assert.equal(g.verifyWebhook(body + ' ', hmacHex('wh', body)), false);
  assert.equal(g.isSandbox, true);
});

test('Sandbox gateway: failed outcome yields no signature', async () => {
  const g = new SandboxGateway({ secret: 's' });
  const o = await g.createOrder({ amountPaise: 5000 });
  const fail = g.simulate(o.orderId, 'failure'); assert.ok(!fail.signature);
  const ok = g.simulate(o.orderId, 'success');
  assert.equal(g.verifyCheckoutSignature({ orderId: o.orderId, paymentId: ok.paymentId, signature: ok.signature }), true);
  assert.equal((await g.confirmPayment({ orderId: o.orderId, paymentId: ok.paymentId, amountPaise: 5000 })).ok, true);
  assert.equal((await g.confirmPayment({ orderId: o.orderId, paymentId: ok.paymentId, amountPaise: 1 })).ok, false);
});

test('Pricing: ₹50/day/category, multi-category, limits enforced', () => {
  const q = quote([{ category: 'equity', days: 1 }, { category: 'options', days: 7 }]);
  assert.equal(q.totalPaise, 5000 + 35000);
  assert.throws(() => quote([{ category: 'equity', days: 1 }, { category: 'equity', days: 2 }]), /Duplicate/);
  assert.throws(() => quote([{ category: 'crypto', days: 1 }]), /Unknown/);
  assert.throws(() => quote([{ category: 'equity', days: 0 }]));
});

test('Password hashing and policy', async () => {
  const h = await hashPassword('Correct horse 42');
  assert.ok(h.startsWith('scrypt$'));
  assert.equal(await verifyPassword('Correct horse 42', h), true);
  assert.equal(await verifyPassword('wrong', h), false);
  assert.ok(passwordProblems('short1').length);
  assert.ok(passwordProblems('alllettersnodigits').length);
  assert.equal(passwordProblems('Crimson-Dynasty-2026').length, 0);
});
