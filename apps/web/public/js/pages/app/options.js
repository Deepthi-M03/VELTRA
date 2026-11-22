import { html, render, $, $$ } from '../../lib/dom.js';
import { api } from '../../lib/api.js';
import { enter, countTo } from '../../lib/motion.js';
import { badge, loader } from '../../lib/ui.js';
import { price, compact, cls, pct, ist } from '../../lib/format.js';
import { head, dataBanner } from './common.js';
import { icon } from '../../lib/icons.js';

export default async function options(root, params, query) {
  const { rows: unders } = await api.get('/api/intel/options/underlyings');
  let u = query.u && unders.includes(query.u) ? query.u : unders[0], expiry = '';
  render(root, html`${head('NSE F&O · Options', 'Options Intelligence', html`<div class="row"><label class="sr-only" for="ou">Underlying</label><select class="input sm" id="ou" style="width:160px">${unders.map((x) => html`<option ${x === u ? 'selected' : ''}>${x}</option>`)}</select><label class="sr-only" for="oe">Expiry</label><select class="input sm" id="oe" style="width:150px"></select></div>`)}<div id="body">${loader()}</div>`);
  async function load() {
    const body = $('#body', root);
    try {
      const c = await api.get(`/api/intel/options/chain?underlying=${encodeURIComponent(u)}${expiry ? `&expiry=${expiry}` : ''}`);
      expiry = c.expiry;
      render($('#oe', root), html`${c.expiries.map((e) => html`<option ${e === c.expiry ? 'selected' : ''}>${e}</option>`)}`);
      const maxOi = Math.max(...c.rows.flatMap((r) => [r.CE.oi, r.PE.oi]));
      const atm = c.rows.reduce((a, r) => (Math.abs(r.strike - c.spot) < Math.abs(a.strike - c.spot) ? r : a), c.rows[0]).strike;
      const S = c.stats;
      render(body, html`${dataBanner(c.dataStatus)}
        <div class="g-4">
          <div class="glass stat-card"><div class="lbl"><span>${u} spot</span>${badge(c.dataStatus)}</div><div class="val" id="spot">—</div><div class="tiny muted">${ist(new Date(c.ts).toISOString(), { second: '2-digit' })} IST</div></div>
          <div class="glass stat-card"><div class="lbl">Put–call ratio (OI)</div><div class="val">${S.pcr?.toFixed(2) ?? '—'}</div><div class="chg"><span class="dir dir-${c.bias}">${c.bias}</span></div></div>
          <div class="glass stat-card"><div class="lbl">Max pain</div><div class="val">${price(S.maxPain, 0)}</div><div class="tiny muted">Strike minimising option-writer payout</div></div>
          <div class="glass stat-card"><div class="lbl">OI walls</div><div class="val" style="font-size:1.2rem"><span class="up">S ${price(S.oiSupport, 0)}</span> · <span class="down">R ${price(S.oiResistance, 0)}</span></div><div class="tiny muted">Highest PE / CE open interest</div></div>
        </div>
        <div class="g-main" style="margin-top:16px">
          <section class="glass card"><div class="card-title"><h3>Option chain · ${c.expiry}</h3><span class="tiny muted">Greeks: ${c.rows[0]?.CE?.greeksSource === 'computed' ? 'computed (Black–Scholes from IV)' : 'provider'}</span></div>
            <div class="table-wrap"><table class="t chain"><thead><tr><th class="r">OI</th><th class="r">ΔOI</th><th class="r">Vol</th><th class="r">IV</th><th class="r">Δ</th><th class="r">LTP</th><th style="text-align:center">CALLS · STRIKE · PUTS</th><th class="r">LTP</th><th class="r">Δ</th><th class="r">IV</th><th class="r">Vol</th><th class="r">ΔOI</th><th class="r">OI</th></tr></thead><tbody>
            ${c.rows.map((r) => html`<tr class="${r.strike === atm ? 'atm' : ''}">
              <td class="r num oi-bar ${r.strike < c.spot ? 'itm' : ''}"><i style="right:0;width:${(r.CE.oi / maxOi) * 100}%;background:var(--ruby)"></i>${compact(r.CE.oi)}</td><td class="r num ${cls(r.CE.oiChange)} ${r.strike < c.spot ? 'itm' : ''}">${compact(r.CE.oiChange)}</td><td class="r num ${r.strike < c.spot ? 'itm' : ''}">${compact(r.CE.volume)}</td><td class="r num ${r.strike < c.spot ? 'itm' : ''}">${r.CE.iv?.toFixed(1)}</td><td class="r num ${r.strike < c.spot ? 'itm' : ''}">${r.CE.delta?.toFixed(2)}</td><td class="r num ${r.strike < c.spot ? 'itm' : ''}"><b>${price(r.CE.ltp)}</b></td>
              <td class="strike num">${price(r.strike, 0)}</td>
              <td class="r num ${r.strike > c.spot ? 'itm' : ''}"><b>${price(r.PE.ltp)}</b></td><td class="r num ${r.strike > c.spot ? 'itm' : ''}">${r.PE.delta?.toFixed(2)}</td><td class="r num ${r.strike > c.spot ? 'itm' : ''}">${r.PE.iv?.toFixed(1)}</td><td class="r num ${r.strike > c.spot ? 'itm' : ''}">${compact(r.PE.volume)}</td><td class="r num ${cls(r.PE.oiChange)} ${r.strike > c.spot ? 'itm' : ''}">${compact(r.PE.oiChange)}</td><td class="r num oi-bar ${r.strike > c.spot ? 'itm' : ''}"><i style="left:0;width:${(r.PE.oi / maxOi) * 100}%;background:var(--emerald)"></i>${compact(r.PE.oi)}</td></tr>`)}
            </tbody></table></div></section>
          <aside class="grid">
            <section class="glass card"><div class="card-title"><h3>Options setup</h3></div>${c.setupLocked ? html`<div class="lock-overlay">${icon('lock', 'width="28" height="28"')}<p>Setups for options require an Options Intelligence subscription.</p><a class="btn btn-primary btn-sm" href="/app/subscription?c=options">Subscribe · ₹50/day</a></div>`
              : c.setup ? html`<div class="row"><span class="sym" style="font-size:1.1rem">${c.setup.instrument}</span><span class="dir dir-${c.bias}">${c.bias}</span></div>
                <dl class="kv" style="margin-top:12px"><dt>Entry (premium)</dt><dd>${price(c.setup.entry)}</dd><dt>Stop-loss</dt><dd class="down">${price(c.setup.stopLoss)}</dd><dt>Target 1</dt><dd class="up">${price(c.setup.target1)}</dd><dt>Target 2</dt><dd class="up">${price(c.setup.target2)}</dd><dt>Risk/reward</dt><dd>${c.setup.riskReward.toFixed(2)}</dd><dt>Underlying support</dt><dd>${price(S.oiSupport, 0)}</dd><dt>Underlying resistance</dt><dd>${price(S.oiResistance, 0)}</dd></dl>
                <p class="small" style="margin-top:12px">${c.setup.reasoning}</p><p class="tiny muted">${c.setup.method}</p>`
              : html`<p class="small">Positioning is neutral (PCR between 0.8 and 1.2) — no directional options setup.</p>`}</section>
            <section class="glass card"><h3>Reading the chain</h3><p class="small">Large call OI marks strikes where writers expect resistance; large put OI marks support. A rising PCR with rising price suggests put writing (bullish support). Greeks shown are per one unit of the underlying; theta is per calendar day.</p></section>
          </aside>
        </div>`);
      countTo($('#spot', root), c.spot, { format: (v) => price(v) });
      enter($$('.stat-card, .card', body)); enter($$('tbody tr', body), { each: 14, duration: 380 });
    } catch (e) { render(body, html`<div class="glass card">${badge('UNAVAILABLE')} ${e.message}</div>`); }
  }
  $('#ou', root).onchange = (e) => { u = e.target.value; expiry = ''; load(); };
  $('#oe', root).onchange = (e) => { expiry = e.target.value; load(); };
  await load();
  const t = setInterval(load, 30000);
  return () => clearInterval(t);
}
void pct;
