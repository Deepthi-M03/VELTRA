import { html, render, $, $$ } from '../../lib/dom.js';
import { api, session } from '../../lib/api.js';
import { enter, countTo, animate } from '../../lib/motion.js';
import { badge, loader, toast } from '../../lib/ui.js';
import { sparkline } from '../../lib/chart.js';
import { price, pct, cls, ist } from '../../lib/format.js';
import { head, dataBanner, quoteTable, liveRows, rowClicks } from './common.js';

export default async function overview(root, params, query) {
  render(root, html`${head('Market Overview', `Good ${greeting()}, ${session.user.name.split(' ')[0]}`, html`<span id="asof" class="small muted"></span>`)}<div id="ov">${loader()}</div>`);
  if (query.welcome) toast('Welcome to VELTRA', 'Explore the terminal freely. Subscribe to a category to unlock its setups.', 'ok');
  let o, vol, val;
  try { [o, vol, val] = await Promise.all([api.get('/api/market/overview'), api.get('/api/market/top-volume'), api.get('/api/market/top-value')]); }
  catch (e) { render($('#ov', root), html`<div class="glass card">${badge('UNAVAILABLE')} <span class="small">${e.message}</span></div>`); return; }
  const indices = o.indices.slice(0, 8);
  render($('#asof', root), html`${badge(o.dataStatus)} as of ${ist(o.asOf, { second: '2-digit' })} IST`);
  const s = o.sentiment, b = o.breadth;
  render($('#ov', root), html`
    ${dataBanner(o.dataStatus, o.provider)}
    <div class="g-4">${indices.map((q) => html`<a class="glass stat-card" href="/app/studio/${q.id}" data-id="${q.id}"><div class="lbl"><span>${q.name}</span>${badge(q.dataStatus)}</div><div class="val" data-ltp="${q.ltp}">—</div><div class="chg ${cls(q.changePct)}">${pct(q.changePct)} <span class="muted">(${price(q.change)})</span></div><canvas class="spark" data-spark="${q.id}"></canvas></a>`)}</div>
    <div class="g-3" style="margin-top:16px">
      <section class="glass card"><div class="card-title"><h3>Market breadth</h3><span class="chip">${b.advancers + b.decliners + b.unchanged} stocks</span></div>
        <div class="breadth-bar"><i style="width:0;background:var(--emerald)" data-w="${(b.advancers / Math.max(1, b.advancers + b.decliners + b.unchanged)) * 100}"></i><i style="width:0;background:var(--text-3)" data-w="${(b.unchanged / Math.max(1, b.advancers + b.decliners + b.unchanged)) * 100}"></i><i style="width:0;background:var(--ruby)" data-w="${(b.decliners / Math.max(1, b.advancers + b.decliners + b.unchanged)) * 100}"></i></div>
        <div class="row small"><span class="up">▲ ${b.advancers} advancing</span><span class="spacer"></span><span class="down">▼ ${b.decliners} declining</span></div>
        <p class="small muted" style="margin:10px 0 0">A/D ratio <b class="num">${b.ratio ? b.ratio.toFixed(2) : '—'}</b></p></section>
      <section class="glass card"><div class="card-title"><h3>Sentiment</h3><span class="chip">${s?.label || '—'}</span></div>${gauge(s?.score ?? 0)}<p class="tiny muted" style="margin:6px 0 0">${s?.method || ''}</p></section>
      <section class="glass card"><div class="card-title"><h3>Volatility</h3>${o.vix ? badge(o.vix.dataStatus) : ''}</div><div class="val num" style="font-size:2.2rem" id="vix">—</div><p class="small ${cls(o.vix?.changePct)}">${o.vix ? pct(o.vix.changePct) : ''} · India VIX</p><p class="tiny muted">VIX above 20 historically coincides with wider intraday ranges; size positions accordingly.</p></section>
    </div>
    <div class="g-main" style="margin-top:16px">
      <div class="grid">
        <section class="glass card"><div class="card-title"><h3>Top 10 · Highest traded volume</h3>${badge(vol.dataStatus)}</div>${quoteTable(vol.rows, { cols: ['symbol', 'ltp', 'volume', 'chg', 'chgPct', 'volMove', 'dir', 'time'] })}</section>
        <section class="glass card"><div class="card-title"><h3>Top 10 · Highest traded value</h3>${badge(val.dataStatus)}</div>${quoteTable(val.rows, { cols: ['symbol', 'ltp', 'value', 'chgPct', 'volMove', 'dir', 'time'] })}</section>
      </div>
      <section class="glass card"><div class="card-title"><h3>Sector performance</h3></div>${o.sectors.map((x) => html`<div class="sector-row"><span class="small">${x.sector}</span><span class="bar"><i data-pct="${x.changePct}" style="background:${x.changePct >= 0 ? 'var(--emerald)' : 'var(--ruby)'}"></i></span><span class="num small r ${cls(x.changePct)}" style="text-align:right">${pct(x.changePct)}</span></div>`)}</section>
    </div>`);
  enter($$('.stat-card, .card', root));
  $$('.val[data-ltp]', root).forEach((e) => countTo(e, +e.dataset.ltp, { format: (v) => price(v), duration: 1200 }));
  countTo($('#vix', root), o.vix?.ltp, { format: (v) => v.toFixed(2) });
  setTimeout(() => { $$('.breadth-bar i', root).forEach((i) => { i.style.width = i.dataset.w + '%'; }); const mx = Math.max(0.5, ...o.sectors.map((x) => Math.abs(x.changePct))); $$('.sector-row .bar i', root).forEach((i) => { const p = +i.dataset.pct, w = (Math.abs(p) / mx) * 50; i.style.width = w + '%'; i.style.left = p >= 0 ? '50%' : 50 - w + '%'; }); }, 200);
  animate($('.gauge .needle', root), [{ transform: 'rotate(-90deg)' }, { transform: `rotate(${((s?.score ?? 0) / 100) * 90}deg)` }], { duration: 1600, delay: 300 });
  for (const c of $$('canvas[data-spark]', root)) api.get(`/api/instruments/${c.dataset.spark}/bars?timeframe=5m&limit=60`).then((d) => sparkline(c, d.bars.map((x) => x.close), d.bars.at(-1)?.close >= d.bars[0]?.close ? '#28B889' : '#F05268')).catch(() => {});
  rowClicks(root);
  const off = liveRows(root);
  return () => off();
}
const greeting = () => { const h = +new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }); return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'; };
function gauge(score) {
  return html`<svg class="gauge" viewBox="0 0 200 120" aria-label="Sentiment ${score}"><defs><linearGradient id="gg" x1="0" x2="1"><stop offset="0" stop-color="#F05268"/><stop offset=".5" stop-color="#D9A18F"/><stop offset="1" stop-color="#28B889"/></linearGradient></defs>
    <path d="M20 105 A80 80 0 0 1 180 105" fill="none" stroke="rgba(217,161,143,.12)" stroke-width="14" stroke-linecap="round"/><path d="M20 105 A80 80 0 0 1 180 105" fill="none" stroke="url(#gg)" stroke-width="4" stroke-linecap="round"/>
    <g class="needle" style="transform-origin:100px 105px"><line x1="100" y1="105" x2="100" y2="38" stroke="#F2C9B9" stroke-width="2.5" stroke-linecap="round"/><circle cx="100" cy="105" r="7" fill="#A51E3D" stroke="#F2C9B9" stroke-width="2"/></g>
    <text x="100" y="92" text-anchor="middle" fill="#F6E7E0" font-size="20" font-family="monospace">${score > 0 ? '+' : ''}${score}</text></svg>`;
}
