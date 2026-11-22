import { t, validate } from '../http/validate.js';
import { bad, HttpError, notFound } from '../http/core.js';
import { CATEGORIES, CATEGORY_IDS, PRICE_PER_DAY_PAISE, MAX_SUBSCRIPTION_DAYS } from '../../../../packages/shared/constants.js';
import { quote } from '../services/subscriptions.js';
import { hmacHex } from '../../../../packages/payments/index.js';

const itemsSpec = t.array(t.object({ category: t.enum(CATEGORY_IDS), days: t.int({ min: 1, max: MAX_SUBSCRIPTION_DAYS }) }), { min: 1, max: 5 });

export default function billingRoutes(r, { requireAuth, limit }) {
  r.get('/api/pricing', async (req, res, ctx) => ({ categories: CATEGORIES, pricePerDayPaise: PRICE_PER_DAY_PAISE, maxDays: MAX_SUBSCRIPTION_DAYS,
    gateway: ctx.gateway.name, sandbox: ctx.gateway.isSandbox, checkout: ctx.subs.checkoutAllowed() }));

  r.post('/api/subscriptions/quote', requireAuth, async (req) => {
    const b = validate({ items: itemsSpec }, req.body);
    try { return quote(b.items); } catch (e) { throw bad(e.message); }
  });

  r.get('/api/subscriptions', requireAuth, async (req, res, ctx) => ({ active: ctx.subs.active(req.user.id), history: ctx.subs.history(req.user.id), payments: ctx.subs.payments(req.user.id) }));

  r.post('/api/payments/order', requireAuth, limit('pay', 20, 60 * 60000), async (req, res, ctx) => {
    const b = validate({ items: itemsSpec }, req.body);
    let out; try { out = await ctx.subs.createOrder(req.user, b.items); } catch (e) { throw bad(e.message); }
    if (out.error) throw new HttpError(403, out.error);
    return out;
  });

  r.post('/api/payments/verify', requireAuth, limit('pay', 30, 60 * 60000), async (req, res, ctx) => {
    const b = validate({ orderId: t.string({ max: 80 }), paymentId: t.string({ max: 80 }), signature: t.string({ max: 200 }) }, req.body);
    const out = await ctx.subs.verifyCheckout(req.user, b);
    if (out.error) throw new HttpError(out.pending ? 202 : 400, out.error);
    return { ok: true, receipt: out.payment.receipt_no, grants: out.grants, active: ctx.subs.active(req.user.id) };
  });

  r.post('/api/payments/failed', requireAuth, async (req, res, ctx) => {
    const b = validate({ orderId: t.string({ max: 80 }), reason: t.string({ optional: true, max: 200 }) }, req.body);
    ctx.subs.recordFailure(req.user, b.orderId, b.reason); return { ok: true };
  });

  r.get('/api/payments/:id/receipt', requireAuth, async (req, res, ctx) => {
    const p = ctx.db.get('SELECT * FROM payments WHERE id = ? AND user_id = ?', Number(req.params.id), req.user.id);
    if (!p || p.status !== 'paid') throw notFound('Receipt not found');
    const items = JSON.parse(p.items_json);
    return { receiptNo: p.receipt_no, paidAt: p.paid_at, provider: p.provider, providerPaymentId: p.provider_payment_id, orderId: p.provider_order_id,
      billedTo: { name: req.user.name, email: req.user.email }, amountPaise: p.amount_paise, currency: p.currency,
      lines: items.map((i) => ({ ...i, name: CATEGORIES.find((c) => c.id === i.category)?.name, unitPaise: PRICE_PER_DAY_PAISE, amountPaise: i.days * PRICE_PER_DAY_PAISE })),
      ...gstBlock(ctx.config.seller, p.amount_paise) };
  });

  // Gateway webhook — authenticated by HMAC signature, CSRF-exempt, raw body required.
  r.post('/api/payments/webhook', async (req, res, ctx) => {
    const out = ctx.subs.handleWebhook(req.rawBody, req.headers['x-razorpay-signature']);
    res.writeHead(out.status, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: out.status === 200 }));
  });

  // ---- Sandbox gateway (development only): plays the role of the hosted checkout. ----
  r.post('/api/sandbox-gateway/pay', requireAuth, async (req, res, ctx) => {
    if (ctx.gateway.name !== 'sandbox') throw notFound();
    const b = validate({ orderId: t.string({ max: 80 }), outcome: t.enum(['success', 'failure']) }, req.body);
    const p = ctx.db.get('SELECT * FROM payments WHERE provider_order_id = ? AND user_id = ?', b.orderId, req.user.id);
    if (!p) throw notFound('Order not found');
    const sim = ctx.gateway.simulate(b.orderId, b.outcome);
    // Like a real gateway, also deliver a signed webhook (async, server-to-server).
    if (b.outcome === 'success') setTimeout(() => {
      const body = JSON.stringify({ id: `evt_sbx_${sim.paymentId}`, event: 'payment.captured', payload: { payment: { entity: { id: sim.paymentId, order_id: b.orderId, amount: p.amount_paise, currency: 'INR', status: 'captured' } } } });
      ctx.subs.handleWebhook(body, hmacHex(ctx.config.payments.sandboxSecret, body));
    }, 1500).unref();
    return sim;
  });
}

// Prices are GST-inclusive. With SELLER_GSTIN configured the receipt carries tax-invoice details;
// the CGST+SGST vs IGST split depends on the buyer's place of supply — confirm with your CA.
export function gstBlock(seller = {}, amountPaise) {
  if (!seller.gstin) return { seller: seller.legalName ? { name: seller.legalName, address: seller.address } : null, gst: null,
    note: 'Receipt only — not a tax invoice. Configure SELLER_GSTIN to issue GST tax invoices.' };
  const rate = seller.gstRate || 18;
  const taxable = Math.round(amountPaise / (1 + rate / 100));
  return { seller: { name: seller.legalName, address: seller.address, gstin: seller.gstin, stateCode: seller.stateCode },
    gst: { ratePct: rate, taxablePaise: taxable, taxPaise: amountPaise - taxable, sacCode: '998399' },
    note: 'Tax invoice. Prices inclusive of GST. CGST+SGST or IGST applies according to place of supply.' };
}
