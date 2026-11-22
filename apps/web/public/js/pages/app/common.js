import { html, $$ } from '../../lib/dom.js';
import { stream } from '../../lib/api.js';
import { badge } from '../../lib/ui.js';
import { flash } from '../../lib/motion.js';
import { price, pct, cls, compact, statusLabel, ist } from '../../lib/format.js';
import { icon } from '../../lib/icons.js';

export const head = (eyebrow, title, right = '') => html`<div class="page-head"><div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1></div><div class="spacer"></div>${right}</div>`;

export function dataBanner(status, provider) {
  if (status === 'LIVE') return '';
  const msg = { DEMO: 'You are viewing DEMO data — synthetic prices generated for demonstration. They are not market prices and must not be used for trading. Connect a licensed provider to see live data.',
    DELAYED: `Data from ${provider} is delayed. Live prices may differ.`, UNAVAILABLE: 'Market data is currently unavailable or stale. Values shown may be out of date and setups are paused.' }[status];
  return html`<div class="data-banner ${status}">${badge(status)}<span>${msg}</span></div>`;
}

// Quote table. Rows carry data-id so the live stream can patch them in place.
export function quoteTable(rows, { cols = ['symbol', 'ltp', 'chg', 'chgPct', 'volume', 'status'], clickable = true } = {}) {
  const H = { symbol: 'Instrument', ltp: 'LTP', chg: 'Change', chgPct: '% Chg', volume: 'Volume', value: 'Traded value', status: 'Data', time: 'Time (IST)', dir: 'Direction', volMove: 'Vol. momentum', oi: 'OI', expiry: 'Expiry', lot: 'Lot' };
  const C = {
    symbol: (r) => html`<td><div class="sym">${r.symbol}</div><div class="tiny muted">${r.name}</div></td>`,
    ltp: (r) => html`<td class="r num" data-f="ltp">${price(r.ltp)}</td>`,
    chg: (r) => html`<td class="r num ${cls(r.change)}">${price(r.change)}</td>`,
    chgPct: (r) => html`<td class="r num ${cls(r.changePct)}" data-f="pct">${pct(r.changePct)}</td>`,
    volume: (r) => html`<td class="r num" data-f="vol">${compact(r.volume)}</td>`,
    value: (r) => html`<td class="r num">₹${compact(r.tradedValue)}</td>`,
    status: (r) => html`<td data-f="st">${badge(r.dataStatus)}</td>`,
    time: (r) => html`<td class="num small muted">${r.timestamp ? ist(r.timestamp, { day: undefined, month: undefined, second: '2-digit' }) : '—'}</td>`,
    dir: (r) => html`<td><span class="dir dir-${r.direction}">${r.direction}</span></td>`,
    volMove: (r) => html`<td class="r num">${r.volumeMovement ? r.volumeMovement.toFixed(2) + '×' : '—'}</td>`,
    oi: (r) => html`<td class="r num">${compact(r.oi)}</td>`,
    expiry: (r) => html`<td class="num small">${r.expiry || '—'}</td>`,
    lot: (r) => html`<td class="r num">${r.lotSize ?? '—'}</td>`,
  };
  const right = new Set(['ltp', 'chg', 'chgPct', 'volume', 'value', 'volMove', 'oi', 'lot']);
  return html`<div class="table-wrap"><table class="t"><thead><tr>${cols.map((c) => html`<th class="${right.has(c) ? 'r' : ''}">${H[c]}</th>`)}</tr></thead>
    <tbody>${rows.map((r) => html`<tr data-id="${r.id}" class="${clickable ? 'clickable' : ''}" tabindex="${clickable ? 0 : -1}">${cols.map((c) => C[c](r))}</tr>`)}</tbody></table></div>`;
}

// Patch visible rows on each streamed tick; flash on change.
export function liveRows(root) {
  return stream('quotes', ({ rows }) => {
    for (const [id, ltp, chp, vol, st] of rows) {
      for (const tr of $$(`tr[data-id="${id}"]`, root)) {
        const l = tr.querySelector('[data-f=ltp]'); if (!l) continue;
        const prev = parseFloat(l.dataset.v ?? 'NaN');
        if (prev !== ltp) { l.textContent = price(ltp); l.dataset.v = ltp; if (!Number.isNaN(prev)) flash(tr, ltp > prev); }
        const p = tr.querySelector('[data-f=pct]'); if (p) { p.textContent = pct(chp); p.className = `r num ${cls(chp)}`; }
        const v = tr.querySelector('[data-f=vol]'); if (v) v.textContent = compact(vol);
      }
    }
  });
}
export function rowClicks(root, fn = (id) => window.veltraNavigate(`/app/studio/${id}`)) {
  root.addEventListener('click', (e) => { const tr = e.target.closest('tr.clickable[data-id]'); if (tr) fn(tr.dataset.id); });
  root.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const tr = e.target.closest('tr.clickable[data-id]'); if (tr) fn(tr.dataset.id); } });
}

export function scoreRing(score) {
  const r = 18, c = 2 * Math.PI * r, off = c * (1 - Math.min(100, score) / 100);
  return html`<svg class="score-ring" viewBox="0 0 44 44" aria-label="Rule score ${score}"><circle cx="22" cy="22" r="${r}" fill="none" stroke="rgba(217,161,143,.15)" stroke-width="3"/><circle cx="22" cy="22" r="${r}" fill="none" stroke="url(#sg)" stroke-width="3" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}" transform="rotate(-90 22 22)"/><defs><linearGradient id="sg"><stop offset="0" stop-color="#C9294B"/><stop offset="1" stop-color="#F2C9B9"/></linearGradient></defs><text x="22" y="26" text-anchor="middle" font-size="11" fill="#F6E7E0" font-family="monospace">${Math.round(score)}</text></svg>`;
}

export function recoCard(r) {
  if (r.locked) return html`<article class="glass reco locked" data-inst="${r.instrumentId}"><div class="top"><span class="sym">${r.symbol}</span><span class="chip">${r.horizon}</span><span class="spacer"></span><span class="lock-pill">${icon('lock', 'width="14" height="14"')} Subscribe to view</span></div><p class="small muted" style="margin:0">${r.name} · ${statusLabel(r.status)}</p></article>`;
  const risk = Math.abs((r.entryLow + r.entryHigh) / 2 - r.stopLoss), rew = Math.abs(r.target1 - (r.entryLow + r.entryHigh) / 2);
  return html`<article class="glass reco" data-inst="${r.instrumentId}" tabindex="0">
    <div class="top"><span class="sym">${r.symbol}</span><span class="dir dir-${r.direction}">${r.direction}</span><span class="chip">${r.horizon}</span>${scoreRing(r.score)}</div>
    <div class="small muted">${r.name}</div>
    <div class="levels"><div><div class="k">Entry</div><div class="v">${price(r.entryLow)}–${price(r.entryHigh)}</div></div><div><div class="k">Stop</div><div class="v down">${price(r.stopLoss)}</div></div><div><div class="k">Target 1</div><div class="v up">${price(r.target1)}</div></div></div>
    <div class="rr-bar" title="Risk vs reward to Target 1"><span class="risk" style="flex:${risk}"></span><span class="rew" style="flex:${rew}"></span></div>
    <div class="row small" style="margin-top:10px"><span>R:R <b class="num">${r.riskReward.toFixed(2)}</b></span><span class="muted">${statusLabel(r.status)}</span><span class="spacer"></span>${badge(r.dataStatus)}</div>
    <p class="tiny muted" style="margin:10px 0 0">${ist(r.createdAt)} · ${r.provider} · rules ${r.ruleSet}</p></article>`;
}
export function recoClicks(root) {
  root.addEventListener('click', (e) => { const c = e.target.closest('.reco[data-inst]'); if (!c) return; if (c.classList.contains('locked')) window.veltraNavigate('/app/subscription'); else window.veltraNavigate(`/app/studio/${c.dataset.inst}`); });
}
