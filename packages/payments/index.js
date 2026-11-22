// Payment-gateway abstraction. A payment is only ever marked paid after server-side verification
// (signature check + amount/order match), or via an authenticated webhook. Browser "success" is ignored.
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

export const hmacHex = (secret, data) => createHmac('sha256', secret).update(data).digest('hex');
export function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length || !/^[0-9a-f]+$/i.test(a)) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

export class RazorpayGateway {
  constructor({ keyId, keySecret, webhookSecret }) { this.keyId = keyId; this.keySecret = keySecret; this.webhookSecret = webhookSecret; }
  get name() { return 'razorpay'; }
  get configured() { return !!(this.keyId && this.keySecret); }
  get isSandbox() { return this.keyId.startsWith('rzp_test_'); }
  #auth() { return 'Basic ' + Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64'); }
  async createOrder({ amountPaise, receipt, notes }) {
    if (!this.configured) throw new Error('Razorpay is not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET).');
    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { authorization: this.#auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt, notes }),
    });
    if (!res.ok) throw new Error(`Razorpay order creation failed: HTTP ${res.status}`);
    const j = await res.json();
    return { orderId: j.id, amountPaise: j.amount, checkout: { provider: 'razorpay', keyId: this.keyId, orderId: j.id, amount: j.amount, currency: 'INR' } };
  }
  // https://razorpay.com/docs/payments/server-integration/nodejs/payment-gateway/build-integration/#verify-payment-signature
  verifyCheckoutSignature({ orderId, paymentId, signature }) {
    return safeEqualHex(hmacHex(this.keySecret, `${orderId}|${paymentId}`), signature);
  }
  // Second check: fetch the payment from Razorpay and confirm it is captured/authorized for this order & amount.
  async confirmPayment({ paymentId, orderId, amountPaise }) {
    const res = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, { headers: { authorization: this.#auth() }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { ok: false, reason: `fetch payment HTTP ${res.status}` };
    const p = await res.json();
    const ok = p.order_id === orderId && p.amount === amountPaise && p.currency === 'INR' && ['captured', 'authorized'].includes(p.status);
    return { ok, reason: ok ? null : `payment status ${p.status}, amount ${p.amount}`, status: p.status };
  }
  verifyWebhook(rawBody, signature) {
    if (!this.webhookSecret) return false;
    return safeEqualHex(hmacHex(this.webhookSecret, rawBody), signature);
  }
  parseWebhook(body) {
    const p = body?.payload?.payment?.entity;
    return { eventId: body?.id || `${body?.event}:${p?.id}`, event: body?.event, orderId: p?.order_id, paymentId: p?.id, amountPaise: p?.amount,
      paid: body?.event === 'payment.captured' || body?.event === 'order.paid', failed: body?.event === 'payment.failed', reason: p?.error_description };
  }
}

// Sandbox gateway: mirrors Razorpay's signature model exactly, with a local "hosted checkout" page that
// plays the gateway's role. It lets the whole flow (order → pay/fail → server verification → webhook)
// be tested end-to-end without credentials. Disabled in production by config.
export class SandboxGateway {
  constructor({ secret }) { this.secret = secret; this.orders = new Map(); }
  get name() { return 'sandbox'; }
  get configured() { return true; }
  get isSandbox() { return true; }
  async createOrder({ amountPaise }) {
    const orderId = 'order_sbx_' + randomBytes(9).toString('hex');
    this.orders.set(orderId, { amountPaise });
    return { orderId, amountPaise, checkout: { provider: 'sandbox', orderId, amount: amountPaise, currency: 'INR', url: `/sandbox-checkout?order=${orderId}` } };
  }
  // Called by the sandbox checkout page (acting as the gateway) — returns what a gateway would hand the browser.
  simulate(orderId, outcome) {
    if (!this.orders.has(orderId)) throw new Error('unknown sandbox order');
    const paymentId = 'pay_sbx_' + randomBytes(9).toString('hex');
    if (outcome !== 'success') return { orderId, paymentId, error: 'Card declined (sandbox)' };
    this.orders.get(orderId).paymentId = paymentId;
    return { orderId, paymentId, signature: hmacHex(this.secret, `${orderId}|${paymentId}`) };
  }
  verifyCheckoutSignature({ orderId, paymentId, signature }) { return safeEqualHex(hmacHex(this.secret, `${orderId}|${paymentId}`), signature); }
  async confirmPayment({ paymentId, orderId, amountPaise }) {
    const o = this.orders.get(orderId);
    const ok = !!o && o.paymentId === paymentId && o.amountPaise === amountPaise;
    return { ok, reason: ok ? null : 'sandbox order/payment mismatch', status: ok ? 'captured' : 'unknown' };
  }
  verifyWebhook(rawBody, signature) { return safeEqualHex(hmacHex(this.secret, rawBody), signature); }
  parseWebhook(body) { return new RazorpayGateway({}).parseWebhook(body); }
}

export function createGateway(cfg) {
  if (cfg.provider === 'razorpay') return new RazorpayGateway({ keyId: cfg.razorpayKeyId, keySecret: cfg.razorpayKeySecret, webhookSecret: cfg.razorpayWebhookSecret });
  if (cfg.provider === 'sandbox') return new SandboxGateway({ secret: cfg.sandboxSecret });
  throw new Error(`Unknown payment provider ${cfg.provider}`);
}
