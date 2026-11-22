// Sandbox hosted-checkout page. It plays the payment gateway's role in development so the full
// order → payment → signature → server verification → webhook flow can be exercised without real money.
import { html, render, $ } from '../../lib/dom.js';
import { api } from '../../lib/api.js';
import { rupees } from '../../lib/format.js';
import { submitting } from '../../lib/ui.js';

export const bare = true;
export async function mount(root) { return { outlet: root }; }

export default async function sandbox(root, params, query) {
  const order = query.order || '', amount = Number(query.amount || 0);
  render(root, html`<div class="atmos"><div class="nebula n1"></div><div class="nebula n2"></div><div class="vignette"></div></div>
  <div class="auth-stage"><div class="glass auth-card">
    <span class="badge badge-DEMO" style="margin:0 auto 14px;display:flex;width:max-content">SANDBOX — NO REAL MONEY</span>
    <h1>Test checkout</h1><p class="sub">Order <span class="mono">${order}</span><br>Amount <strong>${amount ? rupees(amount) : '—'}</strong></p>
    <p class="small">This simulated gateway returns a signed result exactly like a real gateway. Your subscription activates only after VELTRA's server verifies the signature.</p>
    <p class="form-error" id="err" role="alert"></p>
    <div class="grid"><button class="btn btn-primary" data-o="success">Simulate successful payment</button><button class="btn btn-danger" data-o="failure">Simulate declined card</button><a class="btn btn-ghost" href="/app/subscription">Cancel</a></div>
  </div></div>`);
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-o]'); if (!b) return;
    const err = $('#err', root); err.textContent = '';
    try {
      await submitting(b, async () => {
        const sim = await api.post('/api/sandbox-gateway/pay', { orderId: order, outcome: b.dataset.o });
        if (!sim.signature) { await api.post('/api/payments/failed', { orderId: order, reason: sim.error }); window.veltraNavigate('/app/subscription?payment=failed'); return; }
        const v = await api.post('/api/payments/verify', { orderId: sim.orderId, paymentId: sim.paymentId, signature: sim.signature });
        window.veltraNavigate(`/app/subscription?payment=success&receipt=${encodeURIComponent(v.receipt)}`);
      });
    } catch (x) { err.textContent = x.message; }
  });
}
