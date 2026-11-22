import { html, render, $, $$, store, debounce } from '../../lib/dom.js';
import { api, stream } from '../../lib/api.js';
import { enter, countTo, animate, stagger, EASE } from '../../lib/motion.js';
import { badge, loader, modal, toast, errToast, tabs, formData, submitting } from '../../lib/ui.js';
import { CandleChart } from '../../lib/chart.js';
import { price, pct, cls, compact, ist, statusLabel } from '../../lib/format.js';
import { head, dataBanner, scoreRing } from './common.js';
import { icon } from '../../lib/icons.js';

const OVERLAYS = [['ema20', 'EMA 20', '#F2C9B9'], ['ema50', 'EMA 50', '#C9294B'], ['vwap', 'VWAP', '#E8B85A'], ['bb', 'Bollinger', '#D9A18F'], ['volume', 'Volume', '#8F7A74'], ['rsi', 'RSI', '#D9A18F'], ['macd', 'MACD', '#F2C9B9']];

export default async function studio(root, params) {
  let id = params.id ? Number(params.id) : null;
  if (!id) return picker(root);
  let tf = store.get('studio-tf', '15m'), data = null, chart = null, refreshT = null;
  const opts = store.get('studio-overlays', { ema20: true, ema50: true, vwap: true, bb: false, volume: true, rsi: true, macd: true });

  render(root, html`${head('AI Trade Studio', html`<span id="title">—</span>`, html`<div class="row"><div class="search" style="position:relative;width:240px"><input class="input sm" id="sw" placeholder="Switch instrument…" aria-label="Switch instrument" autocomplete="off"><div class="search-results glass" id="swr" hidden></div></div><div id="recent" class="row"></div></div>`)}
    <div id="banner"></div>
    <div class="studio">
      <section class="glass chart-card">
        <div class="chart-toolbar"><div class="tabs" id="tf">${['1m', '5m', '15m', '1h', '1d'].map((t) => html`<button class="${t === tf ? 'on' : ''}" data-v="${t}">${t.toUpperCase()}</button>`)}</div>
          <div class="row" id="ov">${OVERLAYS.map(([k, l, c]) => html`<span class="toggle ${opts[k] ? 'on' : ''}" data-k="${k}" role="switch" aria-checked="${!!opts[k]}" tabindex="0"><i style="background:${c}"></i>${l}</span>`)}</div>
          <span class="spacer"></span><button class="btn btn-sm btn-icon" id="zin" aria-label="Zoom in">+</button><button class="btn btn-sm btn-icon" id="zout" aria-label="Zoom out">−</button><button class="btn btn-sm" id="zreset">Reset</button></div>
        <div class="chart-host" id="chart"><div class="chart-legend" id="legend"></div></div>
        <p class="tiny muted" style="margin:8px 4px 0">Drag to pan · scroll or pinch to zoom · double-click to reset. Chart uses the configured provider's data; status shown above.</p>
      </section>
      <aside class="grid" id="side">${loader()}</aside>
    </div>`);

  chart = new CandleChart($('#chart', root), { onHover: (b, i, s) => legend(b, i, s) });
  chart.setOptions(opts);
  function legend(b, i, s) {
    const L = $('#legend', root); if (!L) return;
    if (!b) { b = data?.bars?.at(-1); i = data?.bars?.length - 1; s = data?.series; } if (!b) return;
    render(L, html`<span>${new Date(b.ts).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span><span>O <b>${price(b.open)}</b></span><span>H <b>${price(b.high)}</b></span><span>L <b>${price(b.low)}</b></span><span>C <b class="${b.close >= b.open ? 'up' : 'down'}">${price(b.close)}</b></span><span>V <b>${compact(b.volume)}</b></span>${s?.rsi14?.[i] != null ? html`<span>RSI <b>${s.rsi14[i].toFixed(1)}</b></span>` : ''}${s?.ema20?.[i] != null ? html`<span style="color:#F2C9B9">EMA20 ${price(s.ema20[i])}</span>` : ''}`);
  }

  async function load({ keepView = false, swap = false } = {}) {
    try {
      if (swap) animate($('#side', root), [{ opacity: 1 }, { opacity: 0.35, filter: 'blur(3px)' }], { duration: 180 });
      data = await api.get(`/api/studio/${id}?timeframe=${tf}`);
      chart.setData(data.bars, data.series, { keepView });
      chart.setLevels(data.recommendation ? { ...data.recommendation } : data.indicators ? { support: data.indicators.support, resistance: data.indicators.resistance } : null);
      legend();
      if (!keepView) renderSide(); else patchQuote();
      render($('#banner', root), dataBanner(data.instrument.dataStatus, data.instrument.provider));
      $('#title', root).textContent = `${data.instrument.symbol}`;
      document.title = `VELTRA — ${data.instrument.symbol} · Studio`;
      remember(data.instrument);
    } catch (e) { render($('#side', root), html`<div class="glass card">${badge('UNAVAILABLE')} ${e.message}</div>`); }
  }

  function renderSide() {
    const q = data.instrument, r = data.recommendation, a = data.analysis, ind = data.indicators || {};
    const side = $('#side', root);
    render(side, html`
      <section class="glass card"><div class="card-title"><div><div class="sym" style="font-size:1.3rem">${q.symbol}</div><div class="small muted">${q.name}</div></div>${badge(q.dataStatus)}</div>
        <div class="row" style="align-items:baseline"><span class="num" style="font-size:2rem" id="s-ltp">—</span><span class="num ${cls(q.changePct)}" id="s-chg">${pct(q.changePct)} (${price(q.change)})</span></div>
        <dl class="kv" style="margin-top:12px"><dt>Open</dt><dd>${price(q.open)}</dd><dt>High / Low</dt><dd>${price(q.high)} / ${price(q.low)}</dd><dt>Prev. close</dt><dd>${price(q.prevClose)}</dd><dt>Volume</dt><dd>${compact(q.volume)}</dd>${q.oi != null ? html`<dt>Open interest</dt><dd>${compact(q.oi)}</dd>` : ''}${q.expiry ? html`<dt>Expiry</dt><dd>${q.expiry}</dd>` : ''}${q.lotSize ? html`<dt>Lot size</dt><dd>${q.lotSize}</dd>` : ''}<dt>Exchange · segment</dt><dd>${q.exchange} · ${q.segment}</dd><dt>Updated</dt><dd>${ist(q.timestamp, { second: '2-digit' })}</dd></dl>
        <div class="row" style="margin-top:14px"><button class="btn btn-sm" id="a-watch">${icon('watchlist', 'width="14" height="14"')} Watch</button><button class="btn btn-sm" id="a-alert">${icon('alerts', 'width="14" height="14"')} Alert</button><button class="btn btn-sm btn-primary" id="a-paper">Paper trade</button></div></section>

      <section class="glass card"><div class="card-title"><h3>Trade setup</h3>${r ? scoreRing(r.score) : ''}</div>
        ${r ? html`<div class="row"><span class="dir dir-${r.direction}">${r.direction}</span><span class="chip">${r.horizon}</span><span class="chip">${statusLabel(r.status)}</span></div>
          ${rrVisual(r, q.ltp)}
          <dl class="kv"><dt>Entry zone</dt><dd>${price(r.entryLow)} – ${price(r.entryHigh)}</dd><dt>Stop-loss</dt><dd class="down">${price(r.stopLoss)}</dd><dt>Target 1</dt><dd class="up">${price(r.target1)}</dd><dt>Target 2</dt><dd class="up">${price(r.target2)}</dd><dt>Support / Resistance</dt><dd>${price(r.support)} / ${price(r.resistance)}</dd><dt>Risk / reward (T1)</dt><dd>${r.riskReward.toFixed(2)}</dd><dt>Data source</dt><dd>${r.provider} · ${r.dataStatus}</dd><dt>Generated</dt><dd>${ist(r.createdAt)}</dd></dl>
          <details style="margin-top:12px"><summary class="small" style="cursor:pointer;color:var(--rose-gold)">Confidence methodology & factors</summary>
            <p class="tiny muted" style="margin-top:8px">${r.confidence.method}</p>
            ${Object.entries(r.confidence.factors).map(([k, f]) => html`<div class="finding" style="display:grid;grid-template-columns:110px 1fr 44px;gap:8px;font-size:.8rem;padding:6px 0;border-bottom:1px solid rgba(217,161,143,.07)"><span class="muted">${k}</span><span>${f.detail}</span><span class="num r ${f.value > 0 ? 'up' : f.value < 0 ? 'down' : ''}">${f.value.toFixed(2)}</span></div>`)}
          </details>`
        : data.recommendationLocked ? html`<div class="lock-overlay">${icon('lock', 'width="28" height="28"')}<p>A setup is active for ${q.symbol}. Subscribe to ${q.category} intelligence to view entry, stop-loss and targets.</p><a class="btn btn-primary btn-sm" href="/app/subscription?c=${q.category}">Subscribe · ₹50/day</a></div>`
        : html`<p class="small">No active setup — ${q.symbol} does not currently meet the screening rules. The chart still shows computed support (${price(ind.support)}) and resistance (${price(ind.resistance)}).</p>`}
      </section>

      <section class="glass card ai-panel"><div class="card-title"><h3>AI analysis</h3>${a ? html`<span class="chip">${a.narrativeIsModelGenerated ? 'Model: ' + a.provider : 'Deterministic engine'}</span>` : ''}</div>
        ${a ? html`<div class="eyebrow" style="margin-bottom:6px">Data-based findings</div>
          ${a.findings.map((f) => html`<div class="finding"><span class="k">${f.type}</span><span>${f.text}</span></div>`)}
          <div class="eyebrow" style="margin:16px 0 8px">${a.narrativeIsModelGenerated ? 'Model-generated interpretation' : 'Interpretation'}</div>
          <div class="narrative">${a.narrative}</div>
          <p class="tiny muted" style="margin-top:8px">Guardrail: ${a.guardrail.checked || 0} figures checked against inputs${a.guardrail.fallback ? ` · fell back to deterministic text (${a.guardrail.reason})` : ' · passed'}. ${ist(a.createdAt)}</p>
          <div class="eyebrow" style="margin:14px 0 6px">Risk factors</div><ul class="small" style="margin:0;padding-left:18px">${a.risks.map((x) => html`<li>${x}</li>`)}</ul>`
        : html`<p class="small">Not enough history on this timeframe to analyse.</p>`}
        <p class="tiny muted" style="margin-top:12px">Informational analysis, not investment advice. <a href="/risk">Risk disclosures</a>.</p>
      </section>`);
    countTo($('#s-ltp', side), q.ltp, { format: (v) => price(v) });
    stagger($$('.card', side), [{ opacity: 0, transform: 'translateX(24px)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { each: 90, duration: 600, easing: EASE.silk });
    $('#a-watch', side).onclick = () => addToWatchlist(id);
    $('#a-alert', side).onclick = () => alertDialog(q);
    $('#a-paper', side).onclick = () => paperDialog(q, r);
  }
  function patchQuote() { const q = data.instrument; countTo($('#s-ltp', root), q.ltp, { format: (v) => price(v), duration: 500 }); const c = $('#s-chg', root); if (c) { c.textContent = `${pct(q.changePct)} (${price(q.change)})`; c.className = `num ${cls(q.changePct)}`; } }

  // timeframe & overlays
  tabs($('#tf', root), (v) => { tf = v; store.set('studio-tf', v); load(); });
  $('#ov', root).addEventListener('click', (e) => { const t = e.target.closest('.toggle'); if (!t) return; const k = t.dataset.k; opts[k] = !opts[k]; t.classList.toggle('on', opts[k]); t.setAttribute('aria-checked', opts[k]); chart.setOptions({ [k]: opts[k] }); store.set('studio-overlays', opts); });
  $('#ov', root).addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.target.closest('.toggle')?.click(); } });
  $('#zin', root).onclick = () => chart.zoom(1 / 1.3); $('#zout', root).onclick = () => chart.zoom(1.3); $('#zreset', root).onclick = () => chart.reset();

  // instrument switching without reloading the app or the chart
  const sw = $('#sw', root), swr = $('#swr', root);
  sw.addEventListener('input', debounce(async () => {
    const s = sw.value.trim(); if (!s) { swr.hidden = true; return; }
    const { rows } = await api.get(`/api/instruments?search=${encodeURIComponent(s)}`);
    render(swr, html`${rows.slice(0, 10).map((r) => html`<button data-id="${r.id}"><span class="sym">${r.symbol}</span><span class="small muted" style="flex:1">${r.name}</span></button>`)}`); swr.hidden = !rows.length;
  }, 150));
  swr.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { swr.hidden = true; sw.value = ''; switchTo(+b.dataset.id); } });
  $('#recent', root).addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if (b) switchTo(+b.dataset.id); });
  async function switchTo(n) { if (n === id) return; id = n; history.replaceState({}, '', `/app/studio/${id}`); await load({ swap: true }); }
  function remember(q) {
    const list = [{ id: q.id, symbol: q.symbol }, ...store.get('recent-instruments', []).filter((x) => x.id !== q.id)].slice(0, 5);
    store.set('recent-instruments', list);
    render($('#recent', root), html`${list.filter((x) => x.id !== id).slice(0, 4).map((x) => html`<button class="chip" data-id="${x.id}" style="cursor:pointer">${x.symbol}</button>`)}`);
  }

  await load();
  // live: patch quote on ticks, refetch bars periodically (keeps view position)
  const off = stream('quotes', ({ rows }) => { const r = rows.find((x) => x[0] === id); if (r && data) { data.instrument.ltp = r[1]; data.instrument.changePct = r[2]; patchQuote(); } });
  refreshT = setInterval(() => load({ keepView: true }), 15000);
  return () => { off(); clearInterval(refreshT); chart.destroy(); };
}

function rrVisual(r, ltp) {
  const vals = [r.stopLoss, r.entryLow, r.entryHigh, r.target1, r.target2, ltp].filter((v) => v != null);
  const lo = Math.min(...vals), hi = Math.max(...vals), Y = (v) => (1 - (v - lo) / (hi - lo || 1)) * 100;
  const mid = (r.entryLow + r.entryHigh) / 2, long = r.direction === 'LONG';
  const zone = (a, b, bg, label, color) => html`<div class="zone" style="top:${Math.min(Y(a), Y(b))}%;height:${Math.abs(Y(a) - Y(b))}%;background:${bg};color:${color}">${label}</div>`;
  return html`<div class="rr-visual" aria-label="Risk and reward map">${zone(mid, r.stopLoss, 'rgba(240,82,104,.18)', 'RISK', '#F05268')}${zone(mid, r.target2 ?? r.target1, 'rgba(40,184,137,.14)', 'REWARD', '#28B889')}${zone(r.entryLow, r.entryHigh, 'rgba(217,161,143,.3)', 'ENTRY', '#F2C9B9')}
    ${ltp != null ? html`<div style="position:absolute;left:0;right:0;top:${Y(ltp)}%;border-top:1px dashed #F2C9B9"><span class="tiny num" style="position:absolute;left:8px;top:-16px;color:#F2C9B9">LTP ${price(ltp)}</span></div>` : ''}</div>
    <p class="tiny muted" style="margin-top:-4px">${long ? 'Long' : 'Short'}: risk ${price(Math.abs(mid - r.stopLoss))} per unit to make ${price(Math.abs(r.target1 - mid))} (T1) or ${price(Math.abs((r.target2 ?? r.target1) - mid))} (T2).</p>`;
}

async function addToWatchlist(instrumentId) {
  try {
    let { rows } = await api.get('/api/watchlists');
    if (!rows.length) { await api.post('/api/watchlists', { name: 'My Watchlist' }); rows = (await api.get('/api/watchlists')).rows; }
    if (rows.length === 1) { await api.post(`/api/watchlists/${rows[0].id}/items`, { instrumentId }); toast('Added to watchlist', rows[0].name, 'ok'); return; }
    modal(html`<h3>Add to watchlist</h3><div class="grid">${rows.map((w) => html`<button class="btn" data-w="${w.id}">${w.name}</button>`)}</div><div class="modal-actions"><button class="btn btn-ghost" data-close>Cancel</button></div>`, {
      onMount: (box, close) => box.addEventListener('click', async (e) => { const b = e.target.closest('[data-w]'); if (!b) return; await api.post(`/api/watchlists/${b.dataset.w}/items`, { instrumentId }); toast('Added to watchlist', b.textContent, 'ok'); close(); }),
    });
  } catch (e) { errToast(e); }
}

export function alertDialog(q) {
  modal(html`<h3>Price alert · ${q.symbol}</h3><p class="small">Current ${price(q.ltp)} (${q.dataStatus}). Alerts trigger once and notify you in-app and by browser notification.</p>
    <form id="af"><div class="field"><label for="ac">Condition</label><select class="input" id="ac" name="condition"><option value="above">Price rises to or above</option><option value="below">Price falls to or below</option><option value="pct_change_above">Day change % at or above</option><option value="pct_change_below">Day change % at or below</option></select></div>
    <div class="field"><label for="av">Value</label><input class="input" id="av" name="value" type="number" step="any" required value="${q.ltp ? (q.ltp * 1.01).toFixed(2) : ''}"></div><p class="form-error" id="ae"></p>
    <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" type="submit">Create alert</button></div></form>`, {
    onMount: (box, close) => box.querySelector('#af').addEventListener('submit', async (e) => {
      e.preventDefault(); const d = formData(e.currentTarget);
      try { await submitting(e.submitter, () => api.post('/api/alerts', { instrumentId: q.id, condition: d.condition, value: Number(d.value) })); toast('Alert created', `${q.symbol} ${d.condition.replace(/_/g, ' ')} ${d.value}`, 'ok'); close(); maybeAskNotify(); }
      catch (x) { box.querySelector('#ae').textContent = x.message; }
    }),
  });
}
function maybeAskNotify() { try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch { /* unsupported */ } }

export function paperDialog(q, r) {
  modal(html`<h3>Paper trade · ${q.symbol}</h3><p class="small">Paper trades fill at the current recorded price (${price(q.ltp)}, ${q.dataStatus}) and are always labelled <b>simulated</b> in your journal.</p>
    <form id="pf"><div class="g-2"><div class="field"><label for="ps">Side</label><select class="input" id="ps" name="side"><option ${r?.direction !== 'SHORT' ? 'selected' : ''}>BUY</option><option ${r?.direction === 'SHORT' ? 'selected' : ''}>SELL</option></select></div>
    <div class="field"><label for="pq">Quantity</label><input class="input" id="pq" name="quantity" type="number" min="1" step="any" value="${q.lotSize || 1}" required></div>
    <div class="field"><label for="psl">Stop-loss (optional)</label><input class="input" id="psl" name="stopLoss" type="number" step="any" value="${r?.stopLoss ?? ''}"></div>
    <div class="field"><label for="pt">Target (optional)</label><input class="input" id="pt" name="target" type="number" step="any" value="${r?.target1 ?? ''}"></div></div>
    <div class="field"><label for="pn">Notes</label><textarea class="input" id="pn" name="notes" maxlength="2000" style="min-height:70px"></textarea></div><p class="form-error" id="pe"></p>
    <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" type="submit">Place paper trade</button></div></form>`, {
    onMount: (box, close) => box.querySelector('#pf').addEventListener('submit', async (e) => {
      e.preventDefault(); const d = formData(e.currentTarget);
      const body = { instrumentId: q.id, kind: 'paper', side: d.side, quantity: Number(d.quantity), notes: d.notes || undefined, recommendationId: r?.id };
      if (d.stopLoss) body.stopLoss = Number(d.stopLoss); if (d.target) body.target = Number(d.target);
      try { const x = await submitting(e.submitter, () => api.post('/api/journal', body)); toast('Paper trade recorded', `${d.side} ${d.quantity} ${q.symbol} @ ${price(x.entryPrice)}`, 'ok'); close(); }
      catch (err) { box.querySelector('#pe').textContent = err.message; }
    }),
  });
}

async function picker(root) {
  render(root, html`${head('AI Trade Studio', 'Choose an instrument')}<div id="pk">${loader()}</div>`);
  const [eq, fu, co, cu] = await Promise.all(['equity', 'futures', 'commodity', 'currency'].map((c) => api.get(`/api/intel/${c}/universe`).catch(() => ({ rows: [] }))));
  const recent = store.get('recent-instruments', []);
  const group = (t, rows) => html`<section class="glass card"><h3>${t}</h3><div class="row">${rows.map((r) => html`<a class="chip" href="/app/studio/${r.id}">${r.symbol}</a>`)}</div></section>`;
  render($('#pk', root), html`<div class="grid">${recent.length ? group('Recent', recent) : ''}${group('Equities', eq.rows.slice(0, 30))}${group('Futures', fu.rows)}${group('Commodities', co.rows)}${group('Currencies', cu.rows)}</div>`);
  enter($$('.card', root));
}
