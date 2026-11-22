import { html, render, $, $$ } from '../../lib/dom.js';
import { api, refreshSession } from '../../lib/api.js';
import { enter, countTo, animate, EASE } from '../../lib/motion.js';
import { loader, toast, errToast, empty, modal } from '../../lib/ui.js';
import { rupees, ist } from '../../lib/format.js';
import { head } from './common.js';
import { icon } from '../../lib/icons.js';

export default async function subscription(root, params, query) {
  render(root, html`${head('Account', 'Subscription Management')}<div id="s">${loader()}</div>`);
  if (query.payment === 'success') toast('Payment verified', `Receipt ${query.receipt || ''} — your access is active.`, 'ok');
  if (query.payment === 'failed') toast('Payment failed', 'No money was taken. You can try again.', 'err');
  const [pricing, subs] = await Promise.all([api.get('/api/pricing'), api.get('/api/subscriptions')]);
  await refreshSession().catch(() => {});
  document.dispatchEvent(new CustomEvent('veltra:subs-changed'));
  const activeBy = Object.fromEntries(subs.active.map((s) => [s.category, s]));
  const cart = new Map(query.c ? [[query.c, 1]] : []);
  render($('#s', root), html`
    ${!pricing.checkout.ok ? html`<div class="data-banner UNAVAILABLE"><span class="badge badge-UNAVAILABLE">CHECKOUT OFF</span><span>${pricing.checkout.reason}</span></div>` : pricing.sandbox ? html`<div class="data-banner"><span class="badge badge-DEMO">SANDBOX</span><span>Payments run against the ${pricing.gateway} sandbox — no real money moves.</span></div>` : ''}
    <div class="reco-grid">${pricing.categories.map((c) => { const a = activeBy[c.id]; return html`<article class="glass sub-card ${cart.has(c.id) ? 'on' : ''}" data-c="${c.id}" tabindex="0" role="checkbox" aria-checked="${cart.has(c.id)}">
      <div class="row"><span class="eyebrow">${c.segment.replace('_', ' ')}</span><span class="spacer"></span>${a ? html`<span class="badge badge-LIVE">ACTIVE</span>` : ''}</div>
      <h3 style="margin:0">${c.name}</h3>
      <div class="small muted">${a ? html`Active until <b>${ist(a.ends_at)}</b> IST` : 'Not subscribed'}</div>
      <div class="row" style="margin-top:auto"><span class="metal-text" style="font:600 1.6rem var(--font-display)">₹${pricing.pricePerDayPaise / 100}</span><span class="small muted">/ day</span><span class="spacer"></span>
        <div class="stepper"><button class="btn btn-sm btn-icon" data-d="-1" aria-label="Fewer days">−</button><input class="input sm num" type="number" min="1" max="${pricing.maxDays}" value="${cart.get(c.id) || 1}" aria-label="Days for ${c.name}"><button class="btn btn-sm btn-icon" data-d="1" aria-label="More days">+</button></div></div>
      <span class="tiny muted">${a ? 'Selecting extends your current access.' : 'Click the card to add it to your order.'}</span></article>`; })}</div>
    <div class="glass summary-bar"><div><div class="tiny muted">ORDER TOTAL</div><div class="total metal-text" id="total">₹0.00</div></div><div class="small muted" id="lines">Select one or more categories.</div><span class="spacer"></span><button class="btn btn-primary btn-lg" id="pay" ${pricing.checkout.ok ? '' : 'disabled'}>Proceed to secure payment</button></div>
    <section class="glass card" style="margin-top:22px"><h3>Payment history</h3>${subs.payments.length ? html`<div class="table-wrap"><table class="t"><thead><tr><th>Date</th><th>Items</th><th class="r">Amount</th><th>Status</th><th>Receipt</th></tr></thead><tbody>
      ${subs.payments.map((p) => html`<tr><td class="small">${ist(p.created_at)}</td><td class="small">${p.items.map((i) => `${i.category} × ${i.days}d`).join(', ')}</td><td class="r num">${rupees(p.amount_paise)}</td><td><span class="${p.status === 'paid' ? 'up' : p.status === 'failed' ? 'down' : 'muted'}">${p.status}</span>${p.failure_reason ? html`<div class="tiny muted">${p.failure_reason}</div>` : ''}</td><td>${p.status === 'paid' ? html`<button class="btn btn-sm" data-r="${p.id}">${p.receipt_no}</button>` : '—'}</td></tr>`)}</tbody></table></div>` : empty('No payments yet')}</section>`);
  enter($$('.sub-card', root), { each: 70 });

  const recalc = () => {
    let total = 0; const lines = [];
    for (const [c, d] of cart) { total += d * pricing.pricePerDayPaise; lines.push(`${pricing.categories.find((x) => x.id === c).name} × ${d} day${d > 1 ? 's' : ''}`); }
    countTo($('#total', root), total / 100, { format: (v) => rupees(v * 100), duration: 500 });
    $('#lines', root).textContent = lines.length ? lines.join(' · ') : 'Select one or more categories.';
    $('#pay', root).disabled = !lines.length || !pricing.checkout.ok;
  };
  const setCard = (card, on) => { card.classList.toggle('on', on); card.setAttribute('aria-checked', on); animate(card, [{ transform: 'scale(.98)' }, { transform: 'scale(1)' }], { duration: 300, easing: EASE.back }); };
  root.addEventListener('click', (e) => {
    const card = e.target.closest('.sub-card'); if (!card) return; const c = card.dataset.c, inp = card.querySelector('input');
    const step = e.target.closest('[data-d]');
    if (step) { const v = Math.max(1, Math.min(pricing.maxDays, (+inp.value || 1) + +step.dataset.d)); inp.value = v; cart.set(c, v); setCard(card, true); recalc(); return; }
    if (e.target.closest('input')) return;
    if (cart.has(c)) cart.delete(c); else cart.set(c, Math.max(1, +inp.value || 1)); setCard(card, cart.has(c)); recalc();
  });
  root.addEventListener('input', (e) => { const card = e.target.closest('.sub-card'); if (!card) return; const v = Math.max(1, Math.min(pricing.maxDays, Math.round(+e.target.value) || 1)); cart.set(card.dataset.c, v); setCard(card, true); recalc(); });
  root.addEventListener('click', async (e) => { const r = e.target.closest('[data-r]'); if (r) showReceipt(r.dataset.r); });
  $('#pay', root).onclick = async () => {
    try {
      const o = await api.post('/api/payments/order', { items: [...cart].map(([category, days]) => ({ category, days })) });
      if (o.checkout.provider === 'sandbox') { window.veltraNavigate(`/sandbox-checkout?order=${encodeURIComponent(o.checkout.orderId)}&amount=${o.checkout.amount}`); return; }
      await razorpay(o.checkout);
    } catch (x) { errToast(x); }
  };
  recalc();
}

function razorpay(co) {
  return new Promise((resolve, reject) => {
    const open = () => {
      const rz = new window.Razorpay({ key: co.keyId, order_id: co.orderId, amount: co.amount, currency: co.currency, name: 'VELTRA', description: 'Category intelligence access', prefill: co.prefill, theme: { color: '#A51E3D' },
        handler: async (resp) => {
          // The browser's success callback is NOT trusted: the server verifies the signature and re-fetches the payment.
          try { const v = await api.post('/api/payments/verify', { orderId: resp.razorpay_order_id, paymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature }); window.veltraNavigate(`/app/subscription?payment=success&receipt=${encodeURIComponent(v.receipt)}`); resolve(); }
          catch (x) { toast('Verification pending', x.message, 'err'); reject(x); }
        },
        modal: { ondismiss: () => resolve() } });
      rz.on('payment.failed', (r) => { api.post('/api/payments/failed', { orderId: co.orderId, reason: r.error?.description }).catch(() => {}); toast('Payment failed', r.error?.description || '', 'err'); });
      rz.open();
    };
    if (window.Razorpay) return open();
    const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js'; s.onload = open; s.onerror = () => reject(new Error('Could not load the payment gateway.')); document.head.append(s);
  });
}

async function showReceipt(id) {
  try {
    const r = await api.get(`/api/payments/${id}/receipt`);
    modal(html`<div id="rc"><div class="row"><img src="/assets/logo.svg" alt="" width="36"><h3 style="margin:0">${r.gst ? 'Tax invoice' : 'Receipt'}</h3><span class="spacer"></span><span class="mono small">${r.receiptNo}</span></div><hr class="hr">
      <dl class="kv"><dt>Billed to</dt><dd>${r.billedTo.name} · ${r.billedTo.email}</dd><dt>Paid</dt><dd>${ist(r.paidAt)} IST</dd><dt>Gateway</dt><dd>${r.provider}</dd><dt>Payment ID</dt><dd>${r.providerPaymentId}</dd><dt>Order ID</dt><dd>${r.orderId}</dd></dl><hr class="hr">
      ${r.lines.map((l) => html`<div class="row small"><span>${l.name} · ${l.days} day(s) × ${rupees(l.unitPaise)}</span><span class="spacer"></span><span class="num">${rupees(l.amountPaise)}</span></div>`)}<hr class="hr">
      ${r.gst ? html`<div class="row small"><span>Taxable value</span><span class="spacer"></span><span class="num">${rupees(r.gst.taxablePaise)}</span></div><div class="row small"><span>GST @ ${r.gst.ratePct}% (included) · SAC ${r.gst.sacCode}</span><span class="spacer"></span><span class="num">${rupees(r.gst.taxPaise)}</span></div><hr class="hr">` : ''}
      <div class="row"><b>Total</b><span class="spacer"></span><b class="num">${rupees(r.amountPaise)}</b></div>
      ${r.seller ? html`<p class="tiny muted" style="margin-top:10px">${r.seller.name}${r.seller.address ? ` · ${r.seller.address}` : ''}${r.seller.gstin ? ` · GSTIN ${r.seller.gstin}` : ''}</p>` : ''}<p class="tiny muted" style="margin-top:12px">${r.note}</p></div>
      <div class="modal-actions"><button class="btn" id="print">${icon('journal', 'width="14" height="14"')} Print</button><button class="btn btn-primary" data-close>Close</button></div>`, { onMount: (box) => { box.querySelector('#print').onclick = () => window.print(); } });
  } catch (x) { errToast(x); }
}
