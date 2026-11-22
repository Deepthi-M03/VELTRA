import { html, render, $, $$ } from '../../lib/dom.js';
import { api } from '../../lib/api.js';
import { enter, countTo } from '../../lib/motion.js';
import { loader, badge, empty } from '../../lib/ui.js';
import { price, ist, statusLabel } from '../../lib/format.js';
import { head } from './common.js';
import { CATEGORIES } from '/js/shared/constants.js';

export default async function performance(root) {
  let cat = '';
  render(root, html`${head('Workspace', 'Performance Analytics', html`<select class="input sm" id="c" style="width:220px" aria-label="Category"><option value="">All categories</option>${CATEGORIES.filter((c) => c.id !== 'options').map((c) => html`<option value="${c.id}">${c.name}</option>`)}</select>`)}<div id="p">${loader()}</div>`);
  async function load() {
    const p = await api.get(`/api/performance${cat ? `?category=${cat}` : ''}`);
    const tile = (l, v, fmt, sub = '') => html`<div class="glass stat-card"><div class="lbl">${l}</div><div class="val" data-n="${v ?? ''}" data-f="${fmt}">—</div><div class="small muted">${sub}</div></div>`;
    render($('#p', root), html`
      <div class="data-banner"><span class="badge badge-plain" style="color:var(--peach);border-color:var(--line-2)">SIMULATED</span><span>${p.note} Data mix: ${Object.entries(p.dataStatusMix).map(([k, v]) => `${k} ${v}`).join(' · ') || '—'}.</span></div>
      <div class="g-4">${tile('Setups published', p.total, 'int', `${p.open} open · ${p.closed} closed`)}${tile('Target 1 reached', p.target1Hit, 'int', `${p.target2Hit} reached Target 2`)}${tile('Stopped out', p.stopped, 'int', `${p.expired} expired · ${p.neverEntered} never entered`)}${tile('Win rate (entered & closed)', p.winRate == null ? null : p.winRate * 100, 'pct', `avg return ${p.avgReturnPct == null ? '—' : p.avgReturnPct.toFixed(2) + '%'} · avg R:R ${p.avgRiskReward?.toFixed(2) ?? '—'}`)}</div>
      <div class="g-2" style="margin-top:16px">${['byCategory', 'byHorizon'].map((k) => html`<section class="glass card"><h3>${k === 'byCategory' ? 'By category' : 'By horizon'}</h3>${p[k].length ? html`<div class="table-wrap"><table class="t"><thead><tr><th></th><th class="r">Total</th><th class="r">Open</th><th class="r">T1</th><th class="r">T2</th><th class="r">Stopped</th><th class="r">Expired</th></tr></thead><tbody>${p[k].map((r) => html`<tr><td class="sym">${r.key}</td><td class="r num">${r.total}</td><td class="r num">${r.open}</td><td class="r num up">${r.target1}</td><td class="r num up">${r.target2}</td><td class="r num down">${r.stopped}</td><td class="r num muted">${r.expired}</td></tr>`)}</tbody></table></div>` : empty('No data yet')}</section>`)}</div>
      <section class="glass card" style="margin-top:16px"><h3>Recently closed — wins and losses</h3>${p.recent.length ? html`<div class="table-wrap"><table class="t"><thead><tr><th>Instrument</th><th>Dir</th><th>Horizon</th><th class="r">Entry</th><th class="r">Stop</th><th class="r">T1</th><th class="r">Exit</th><th>Outcome</th><th>Data</th><th>Closed</th></tr></thead><tbody>
        ${p.recent.map((r) => html`<tr><td class="sym">${r.symbol}</td><td><span class="dir dir-${r.direction}">${r.direction}</span></td><td>${r.horizon}</td><td class="r num">${price(r.entryLow)}–${price(r.entryHigh)}</td><td class="r num">${price(r.stopLoss)}</td><td class="r num">${price(r.target1)}</td><td class="r num">${price(r.exitPrice)}</td><td class="${r.status === 'stopped' ? 'down' : r.status === 'target2_hit' ? 'up' : 'muted'}">${statusLabel(r.status)}</td><td>${badge(r.dataStatus)}</td><td class="small muted">${ist(r.closedAt)}</td></tr>`)}</tbody></table></div>` : empty('No closed setups yet', 'Setups close when they hit Target 2, the stop-loss, or expire.')}</section>`);
    $$('[data-n]', root).forEach((e) => { if (e.dataset.n === '') { e.textContent = '—'; return; } countTo(e, +e.dataset.n, { format: (v) => (e.dataset.f === 'pct' ? v.toFixed(1) + '%' : Math.round(v).toString()) }); });
    enter($$('.stat-card, .card', root));
  }
  $('#c', root).onchange = (e) => { cat = e.target.value; load(); };
  await load();
}
