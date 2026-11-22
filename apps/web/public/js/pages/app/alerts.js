import { html, render, $, $$ } from '../../lib/dom.js';
import { api } from '../../lib/api.js';
import { enter } from '../../lib/motion.js';
import { loader, errToast, empty, badge, modal } from '../../lib/ui.js';
import { price, ist } from '../../lib/format.js';
import { icon } from '../../lib/icons.js';
import { head } from './common.js';
import { alertDialog } from './studio.js';

const COND = { above: 'Price ≥', below: 'Price ≤', pct_change_above: 'Day change ≥', pct_change_below: 'Day change ≤' };

export default async function alerts(root) {
  render(root, html`${head('Workspace', 'Price Alerts', html`<button class="btn btn-primary btn-sm" id="new">${icon('plus', 'width="14" height="14"')} New alert</button>`)}<div id="al">${loader()}</div>`);
  async function load() {
    const { rows } = await api.get('/api/alerts');
    const active = rows.filter((a) => a.status === 'active'), past = rows.filter((a) => a.status !== 'active');
    const table = (list, actions) => html`<div class="table-wrap"><table class="t"><thead><tr><th>Instrument</th><th>Condition</th><th class="r">Current</th><th>Data</th><th>Created</th><th>Status</th>${actions ? html`<th></th>` : ''}</tr></thead><tbody>
      ${list.map((a) => html`<tr><td class="sym">${a.symbol}</td><td>${COND[a.condition]} <b class="num">${a.condition.startsWith('pct') ? a.value + '%' : price(a.value)}</b></td><td class="r num">${price(a.quote?.ltp)}</td><td>${badge(a.quote?.dataStatus)}</td><td class="small muted">${ist(a.created_at)}</td>
        <td>${a.status === 'triggered' ? html`<span class="up small">Triggered ${ist(a.triggered_at)} @ ${price(a.triggered_price)}</span>` : html`<span class="small">${a.status}</span>`}</td>${actions ? html`<td class="r"><button class="btn btn-sm btn-danger" data-x="${a.id}">Cancel</button></td>` : ''}</tr>`)}</tbody></table></div>`;
    render($('#al', root), html`<section class="glass card"><div class="card-title"><h3>Active</h3><span class="chip">${active.length}</span></div>${active.length ? table(active, true) : empty('No active alerts', 'Create alerts here or from AI Trade Studio.')}</section>
      <section class="glass card" style="margin-top:16px"><div class="card-title"><h3>History</h3></div>${past.length ? table(past, false) : empty('Nothing yet')}</section>
      <p class="tiny muted" style="margin-top:12px">Alerts are evaluated on every validated price update. Data marked UNAVAILABLE never triggers an alert. Enable browser notifications in your profile to be notified when VELTRA is in the background.</p>`);
    enter($$('.card', root));
  }
  root.addEventListener('click', async (e) => {
    const x = e.target.closest('[data-x]');
    if (x) { try { await api.del(`/api/alerts/${x.dataset.x}`); load(); } catch (er) { errToast(er); } }
    if (e.target.closest('#new')) pickInstrument((q) => alertDialog(q));
  });
  await load();
  const t = setInterval(load, 20000);
  return () => clearInterval(t);
}

export function pickInstrument(cb) {
  modal(html`<h3>Choose instrument</h3><input class="input" id="pi" placeholder="Search…" autocomplete="off"><div id="pr" class="grid" style="margin-top:12px;max-height:320px;overflow:auto"></div><div class="modal-actions"><button class="btn btn-ghost" data-close>Cancel</button></div>`, {
    onMount: (box, close) => {
      let t; box.querySelector('#pi').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(async () => { const { rows } = await api.get(`/api/instruments?search=${encodeURIComponent(e.target.value)}`); box._rows = rows; render(box.querySelector('#pr'), html`${rows.slice(0, 12).map((r) => html`<button class="btn" style="justify-content:space-between" data-i="${r.id}"><span class="sym">${r.symbol}</span><span class="num small">${price(r.ltp)}</span></button>`)}`); }, 150); });
      box.querySelector('#pr').addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (!b) return; const q = box._rows.find((r) => r.id === +b.dataset.i); close(); setTimeout(() => cb(q), 280); });
    },
  });
}
