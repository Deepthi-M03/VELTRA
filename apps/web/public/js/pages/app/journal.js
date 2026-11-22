import { html, render, $, $$ } from '../../lib/dom.js';
import { api } from '../../lib/api.js';
import { enter, countTo } from '../../lib/motion.js';
import { loader, errToast, empty, modal, formData, submitting, confirmDialog, tabs, toast } from '../../lib/ui.js';
import { price, ist, cls, signed } from '../../lib/format.js';
import { icon } from '../../lib/icons.js';
import { head } from './common.js';
import { pickInstrument } from './alerts.js';
import { paperDialog } from './studio.js';

export default async function journal(root) {
  let kind = 'all';
  render(root, html`${head('Workspace', 'Trade Journal', html`<div class="row"><div class="tabs" id="k"><button class="on" data-v="all">All</button><button data-v="paper">Paper (simulated)</button><button data-v="actual">Actual</button></div><button class="btn btn-sm" id="np">Paper trade</button><button class="btn btn-primary btn-sm" id="na">${icon('plus', 'width="14" height="14"')} Log actual trade</button></div>`)}<div id="j">${loader()}</div>`);
  async function load() {
    const d = await api.get('/api/journal');
    const rows = d.rows.filter((r) => kind === 'all' || r.kind === kind);
    const S = d.summary;
    const card = (t, s) => html`<div class="glass stat-card"><div class="lbl">${t}</div><div class="val ${cls(s.realizedPnl)}" data-v2="${s.realizedPnl}">—</div><div class="small muted">${s.closed} closed · ${s.open} open · win rate ${s.winRate == null ? '—' : (s.winRate * 100).toFixed(0) + '%'}</div></div>`;
    render($('#j', root), html`<div class="g-2">${card('Paper P&L (simulated, realised)', S.paper)}${card('Actual P&L (self-reported, realised)', S.actual)}</div>
      <section class="glass card" style="margin-top:16px">${rows.length ? html`<div class="table-wrap"><table class="t"><thead><tr><th>Type</th><th>Instrument</th><th>Side</th><th class="r">Qty</th><th class="r">Entry</th><th class="r">Exit / Mark</th><th class="r">P&amp;L</th><th>Opened</th><th>Notes</th><th></th></tr></thead><tbody>
        ${rows.map((r) => html`<tr><td><span class="chip">${r.kind === 'paper' ? 'SIMULATED' : 'ACTUAL'}</span></td><td class="sym">${r.symbol}</td><td><span class="dir dir-${r.side === 'BUY' ? 'LONG' : 'SHORT'}">${r.side}</span></td><td class="r num">${r.quantity}</td><td class="r num">${price(r.entry_price)}</td>
          <td class="r num">${price(r.markPrice)}${r.exit_price == null ? html`<div class="tiny muted">mark · ${r.markDataStatus}</div>` : ''}</td><td class="r num ${cls(r.pnl)}">${signed(r.pnl)}</td><td class="small muted">${ist(r.opened_at)}</td><td class="small" style="max-width:220px;white-space:normal">${r.notes || ''}</td>
          <td class="r">${r.exit_price == null ? html`<button class="btn btn-sm" data-close-id="${r.id}" data-kind="${r.kind}">Close</button>` : html`<span class="tiny muted">closed ${ist(r.closed_at)}</span>`}${r.kind === 'actual' ? html` <button class="btn btn-sm btn-danger" data-del="${r.id}" aria-label="Delete">${icon('trash', 'width="13" height="13"')}</button>` : ''}</td></tr>`)}</tbody></table></div>`
        : empty('No trades recorded', 'Paper-trade from AI Trade Studio, or log your actual trades here to measure your own performance.')}</section>
      <p class="tiny muted" style="margin-top:10px">Paper trades fill at the platform's recorded price at the moment you place and close them, and cannot be deleted — so simulated results can't be cherry-picked. Actual trades are self-reported and exclude brokerage and taxes unless you include them.</p>`);
    $$('[data-v2]', root).forEach((e) => countTo(e, +e.dataset.v2, { format: (v) => signed(v) }));
    enter($$('.stat-card, .card', root));
  }
  tabs($('#k', root), (v) => { kind = v; load(); });
  root.addEventListener('click', async (e) => {
    const c = e.target.closest('[data-close-id]'), del = e.target.closest('[data-del]');
    try {
      if (c) {
        if (c.dataset.kind === 'paper') { await api.post(`/api/journal/${c.dataset.closeId}/close`, {}); toast('Paper trade closed at market', '', 'ok'); load(); }
        else modal(html`<h3>Close trade</h3><form id="cf"><div class="field"><label for="ce">Exit price</label><input class="input" id="ce" name="exitPrice" type="number" step="any" min="0" required></div><p class="form-error" id="cerr"></p><div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary">Close trade</button></div></form>`, {
          onMount: (box, close) => box.querySelector('#cf').addEventListener('submit', async (ev) => { ev.preventDefault(); try { await api.post(`/api/journal/${c.dataset.closeId}/close`, { exitPrice: Number(formData(ev.currentTarget).exitPrice) }); close(); load(); } catch (x) { box.querySelector('#cerr').textContent = x.message; } }) });
      }
      if (del && await confirmDialog('Delete this entry?', 'Actual-trade entries can be deleted. This cannot be undone.', { confirm: 'Delete', danger: true })) { await api.del(`/api/journal/${del.dataset.del}`); load(); }
      if (e.target.closest('#np')) pickInstrument((q) => paperDialog(q, null));
      if (e.target.closest('#na')) pickInstrument((q) => actualDialog(q, load));
    } catch (x) { errToast(x); }
  });
  await load();
}

function actualDialog(q, done) {
  modal(html`<h3>Log actual trade · ${q.symbol}</h3><form id="tf"><div class="g-2"><div class="field"><label for="ts">Side</label><select class="input" id="ts" name="side"><option>BUY</option><option>SELL</option></select></div><div class="field"><label for="tq">Quantity</label><input class="input" id="tq" name="quantity" type="number" min="0" step="any" required></div>
    <div class="field"><label for="te">Entry price</label><input class="input" id="te" name="entryPrice" type="number" min="0" step="any" required></div><div class="field"><label for="tsl">Stop-loss</label><input class="input" id="tsl" name="stopLoss" type="number" step="any"></div></div>
    <div class="field"><label for="tn">Notes</label><textarea class="input" id="tn" name="notes" style="min-height:70px"></textarea></div><p class="form-error" id="terr"></p><div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary">Save</button></div></form>`, {
    onMount: (box, close) => box.querySelector('#tf').addEventListener('submit', async (e) => {
      e.preventDefault(); const d = formData(e.currentTarget);
      const body = { instrumentId: q.id, kind: 'actual', side: d.side, quantity: Number(d.quantity), entryPrice: Number(d.entryPrice), notes: d.notes || undefined };
      if (d.stopLoss) body.stopLoss = Number(d.stopLoss);
      try { await submitting(e.submitter, () => api.post('/api/journal', body)); close(); done(); } catch (x) { box.querySelector('#terr').textContent = x.message; }
    }),
  });
}
