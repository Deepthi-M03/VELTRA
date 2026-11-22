import { html, render, $, $$ } from '../../lib/dom.js';
import { api } from '../../lib/api.js';
import { enter } from '../../lib/motion.js';
import { badge, loader, tabs, empty } from '../../lib/ui.js';
import { head, dataBanner, quoteTable, liveRows, rowClicks, recoCard, recoClicks } from './common.js';

const META = {
  equity: { eyebrow: 'NSE Cash Market', horizons: [['intraday', 'Intraday'], ['delivery', 'Delivery']], universe: [['all', 'All eligible'], ['nifty50', 'NIFTY 50'], ['banknifty', 'BANK NIFTY']], cols: ['symbol', 'ltp', 'chg', 'chgPct', 'volume', 'value', 'status'] },
  futures: { eyebrow: 'NSE F&O · Futures', horizons: [['intraday', 'Intraday']], cols: ['symbol', 'expiry', 'ltp', 'chgPct', 'oi', 'volume', 'status'] },
  commodity: { eyebrow: 'MCX', horizons: [['intraday', 'Intraday']], cols: ['symbol', 'expiry', 'lot', 'ltp', 'chgPct', 'oi', 'status'] },
  currency: { eyebrow: 'NSE Currency Derivatives', horizons: [['intraday', 'Intraday']], cols: ['symbol', 'expiry', 'lot', 'ltp', 'chgPct', 'oi', 'status'] },
};

export default async function category(root, params, query, route) {
  const cat = route.category, M = META[cat];
  let horizon = M.horizons[0][0], index = 'all', statusF = 'active';
  render(root, html`${head(M.eyebrow, route.title, html`<div class="tabs" id="st"><button class="on" data-v="active">Active</button><button data-v="closed">History</button></div>`)}
    <div id="banner"></div>
    <section class="glass card"><div class="card-title"><h3>Setups</h3>${M.horizons.length > 1 ? html`<div class="tabs" id="hz">${M.horizons.map(([v, l], i) => html`<button class="${i === 0 ? 'on' : ''}" data-v="${v}">${l}</button>`)}</div>` : ''}</div><div id="recos">${loader()}</div></section>
    <section class="glass card" style="margin-top:16px"><div class="card-title"><h3>Instrument universe</h3>${M.universe ? html`<div class="tabs" id="ix">${M.universe.map(([v, l], i) => html`<button class="${i === 0 ? 'on' : ''}" data-v="${v}">${l}</button>`)}</div>` : ''}</div><div id="uni">${loader()}</div></section>`);

  async function loadRecos() {
    const box = $('#recos', root); render(box, loader());
    try {
      const d = await api.get(`/api/intel/${cat}/recommendations?status=${statusF}${M.horizons.length > 1 ? `&horizon=${horizon}` : ''}`);
      render($('#banner', root), dataBanner(d.dataStatus));
      const upsell = !d.access ? html`<div class="data-banner" style="margin-bottom:14px"><span class="badge badge-plain" style="color:var(--rose-gold);border-color:var(--line-2)">LOCKED</span><span>Setup levels and AI analysis for this category require a subscription (₹50/day).</span><span class="spacer"></span><a class="btn btn-primary btn-sm" href="/app/subscription?c=${cat}">Subscribe</a></div>` : '';
      render(box, d.rows.length ? html`${upsell}<div class="reco-grid">${d.rows.map(recoCard)}</div>` : html`${upsell}${empty(statusF === 'active' ? 'No qualifying setups right now' : 'No closed setups yet', statusF === 'active' ? 'The scanner runs every minute during the session. Most instruments, most of the time, should not qualify.' : 'Closed setups — targets, stops and expiries — will appear here.')}`);
      enter($$('.reco', box), { each: 40 });
    } catch (e) { render(box, html`${badge('UNAVAILABLE')} ${e.message}`); }
  }
  async function loadUniverse() {
    const box = $('#uni', root);
    try {
      const d = await api.get(`/api/intel/${cat}/universe${M.universe ? `?index=${index}` : ''}`);
      render(box, d.rows.length ? quoteTable(d.rows, { cols: M.cols }) : empty('No instruments', 'The configured provider returned no instruments for this category.'));
      enter($$('tbody tr', box), { each: 12, duration: 400 });
    } catch (e) { render(box, html`${badge('UNAVAILABLE')} ${e.message}`); }
  }
  tabs($('#st', root), (v) => { statusF = v; loadRecos(); });
  if ($('#hz', root)) tabs($('#hz', root), (v) => { horizon = v; loadRecos(); });
  if ($('#ix', root)) tabs($('#ix', root), (v) => { index = v; loadUniverse(); });
  recoClicks(root); rowClicks(root);
  await Promise.all([loadRecos(), loadUniverse()]);
  const off = liveRows(root); const t = setInterval(loadRecos, 60000);
  return () => { off(); clearInterval(t); };
}
