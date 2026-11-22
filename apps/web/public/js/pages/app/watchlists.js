import { html, render, $, $$ } from '../../lib/dom.js';
import { api } from '../../lib/api.js';
import { enter, animate } from '../../lib/motion.js';
import { loader, modal, toast, errToast, confirmDialog, empty, formData } from '../../lib/ui.js';
import { icon } from '../../lib/icons.js';
import { head, quoteTable, liveRows, rowClicks } from './common.js';

export default async function watchlists(root) {
  render(root, html`${head('Workspace', 'Watchlists', html`<button class="btn btn-primary btn-sm" id="new">${icon('plus', 'width="14" height="14"')} New watchlist</button>`)}<div id="wl">${loader()}</div>`);
  async function load() {
    const { rows } = await api.get('/api/watchlists');
    const box = $('#wl', root);
    render(box, rows.length ? html`<div class="grid">${rows.map((w) => html`<section class="glass card" data-w="${w.id}"><div class="card-title"><h3>${w.name}</h3><span class="chip">${w.items.length} instruments</span><span class="spacer"></span><button class="btn btn-sm" data-act="add" data-w="${w.id}">${icon('plus', 'width="14" height="14"')} Add</button><button class="btn btn-sm" data-act="rename" data-w="${w.id}" data-name="${w.name}">Rename</button><button class="btn btn-sm btn-danger" data-act="del" data-w="${w.id}" aria-label="Delete ${w.name}">${icon('trash', 'width="14" height="14"')}</button></div>
      ${w.items.length ? html`${quoteTable(w.items, { cols: ['symbol', 'ltp', 'chg', 'chgPct', 'volume', 'status'] })}<div class="row tiny muted" style="margin-top:8px">Click a row to open it in AI Trade Studio.</div>` : empty('Empty watchlist', 'Add instruments here, or from AI Trade Studio.')}
      <div class="row" style="margin-top:10px">${w.items.map((i) => html`<button class="chip" data-act="rm" data-w="${w.id}" data-i="${i.id}" style="cursor:pointer" title="Remove ${i.symbol}">${i.symbol} ✕</button>`)}</div></section>`)}</div>`
      : empty('No watchlists yet', 'Create one to track instruments with live prices.', html`<button class="btn btn-primary" data-act="create">Create watchlist</button>`));
    enter($$('.card, tbody tr', box), { each: 30 });
  }
  const nameDialog = (title, initial, onSave) => modal(html`<h3>${title}</h3><form id="nf"><div class="field"><label for="nn">Name</label><input class="input" id="nn" name="name" required maxlength="40" value="${initial}"></div><p class="form-error" id="ne"></p><div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary">Save</button></div></form>`, {
    onMount: (box, close) => box.querySelector('#nf').addEventListener('submit', async (e) => { e.preventDefault(); try { await onSave(formData(e.currentTarget).name); close(); load(); } catch (x) { box.querySelector('#ne').textContent = x.message; } }),
  });
  const addDialog = (wid) => modal(html`<h3>Add instrument</h3><div class="field"><label for="as">Search</label><input class="input" id="as" placeholder="e.g. RELIANCE, GOLD, USDINR" autocomplete="off"></div><div id="ar" class="grid" style="max-height:300px;overflow:auto"></div><div class="modal-actions"><button class="btn btn-ghost" data-close>Done</button></div>`, {
    onMount: (box) => {
      let t; box.querySelector('#as').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(async () => { const { rows } = await api.get(`/api/instruments?search=${encodeURIComponent(e.target.value)}`); render(box.querySelector('#ar'), html`${rows.slice(0, 12).map((r) => html`<button class="btn" style="justify-content:space-between" data-i="${r.id}"><span class="sym">${r.symbol}</span><span class="small muted">${r.name}</span></button>`)}`); }, 150); });
      box.querySelector('#ar').addEventListener('click', async (e) => { const b = e.target.closest('[data-i]'); if (!b) return; try { await api.post(`/api/watchlists/${wid}/items`, { instrumentId: +b.dataset.i }); animate(b, [{ background: 'rgba(40,184,137,.3)' }, { background: 'transparent' }], { duration: 600 }); toast('Added', b.querySelector('.sym').textContent, 'ok'); load(); } catch (x) { errToast(x); } });
    },
  });
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]') || (e.target.closest('#new') && { dataset: { act: 'create' } }); if (!b) return;
    const { act, w, i, name } = b.dataset;
    try {
      if (act === 'create') nameDialog('New watchlist', '', (n) => api.post('/api/watchlists', { name: n }));
      if (act === 'rename') nameDialog('Rename watchlist', name, (n) => api.patch(`/api/watchlists/${w}`, { name: n }));
      if (act === 'add') addDialog(w);
      if (act === 'rm') { e.stopPropagation(); await api.del(`/api/watchlists/${w}/items/${i}`); load(); }
      if (act === 'del' && await confirmDialog('Delete watchlist?', 'This removes the list. Instruments and alerts are not affected.', { confirm: 'Delete', danger: true })) { await api.del(`/api/watchlists/${w}`); load(); }
    } catch (x) { errToast(x); }
  });
  rowClicks(root);
  await load();
  const off = liveRows(root);
  return () => off();
}
