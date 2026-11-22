import { html, raw, render, $, $$, store } from '../../lib/dom.js';
import { api, session } from '../../lib/api.js';
import { animate, stagger, revealOnScroll, tilt, countTo, reduced, EASE } from '../../lib/motion.js';
import { badge } from '../../lib/ui.js';
import { icon } from '../../lib/icons.js';
import { price, pct, cls, compact } from '../../lib/format.js';
import { CATEGORIES, PRICE_PER_DAY_PAISE } from '/js/shared/constants.js';

const CREST = `<svg class="crest" viewBox="0 0 120 120" aria-hidden="true"><defs><linearGradient id="im" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F2C9B9"/><stop offset=".5" stop-color="#D9A18F"/><stop offset="1" stop-color="#8E5A4C"/></linearGradient><linearGradient id="ic" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#D0324F"/><stop offset="1" stop-color="#5C1426"/></linearGradient></defs>
<path class="s1" d="M60 4 L108 30 L108 78 L60 116 L12 78 L12 30 Z" fill="none" stroke="url(#im)" stroke-width="3"/>
<path class="s2" d="M42 26 L48 34 L54 24 L60 32 L66 24 L72 34 L78 26" fill="none" stroke="url(#im)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
<path class="fillv" d="M30 42 L52 42 L60 70 L68 42 L90 42 L64 96 L56 96 Z" fill="url(#ic)" opacity="0"/>
<path class="s3" d="M26 82 L44 70 L54 76 L74 56 L94 48" fill="none" stroke="url(#im)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

async function intro() {
  if (reduced() || store.sget('intro')) return;
  store.sset('intro', '1');
  const ov = document.createElement('div'); ov.className = 'intro';
  render(ov, html`<div class="intro-inner">${raw(CREST)}<div class="word metal-text">${[...'VELTRA'].map((c) => html`<span>${c}</span>`)}</div><div class="tag">INTELLIGENCE BEYOND THE MARKET.</div></div><button class="btn btn-ghost btn-sm skip">Skip intro</button>`);
  document.body.append(ov);
  let skipped = false; const finish = () => { skipped = true; };
  ov.querySelector('.skip').onclick = finish;
  const draw = (sel, delay) => animate(ov.querySelector(sel), [{ strokeDashoffset: 600 }, { strokeDashoffset: 0 }], { duration: 1400, delay, easing: EASE.inOut });
  await Promise.race([Promise.all([draw('.s1', 0), draw('.s2', 350), draw('.s3', 700),
    animate(ov.querySelector('.fillv'), [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 900, delay: 900 }),
    stagger(ov.querySelectorAll('.word span'), [{ opacity: 0, transform: 'translateY(30px)', filter: 'blur(12px)', letterSpacing: '1em' }, { opacity: 1, transform: 'none', filter: 'blur(0)', letterSpacing: '0' }], { duration: 900, each: 80, delay: 1000, easing: EASE.silk }),
    animate(ov.querySelector('.tag'), [{ opacity: 0, letterSpacing: '1em' }, { opacity: 1, letterSpacing: '.5em' }], { duration: 1200, delay: 1700 })]).then(() => new Promise((r) => setTimeout(r, 450))),
  new Promise((r) => { const i = setInterval(() => { if (skipped) { clearInterval(i); r(); } }, 50); })]);
  await animate(ov, [{ clipPath: 'inset(0 0 0 0)', opacity: 1 }, { clipPath: 'inset(0 0 100% 0)', opacity: 1 }], { duration: 900, easing: EASE.inOut });
  ov.remove();
}

export default async function home(root) {
  const cats = CATEGORIES;
  render(root, html`
  <section class="hero" aria-labelledby="hero-title">
    <div class="orbit layer" data-depth="0.2" aria-hidden="true"></div>
    <div class="layer" data-depth="0.6" style="position:relative;z-index:2">
      <div class="eyebrow" style="margin-bottom:26px">Crimson Dynasty · Indian Markets</div>
      <h1 id="hero-title" class="hero-title" aria-label="VELTRA">${[...'VELTRA'].map((c) => html`<span class="ch metal-text" aria-hidden="true">${c}</span>`)}</h1>
      <div class="tagline">INTELLIGENCE BEYOND THE MARKET.</div>
      <p class="lede">A cinematic intelligence terminal for NSE equities, F&amp;O, MCX commodities and currency derivatives — where every signal is computed from validated data, every level is traceable, and every result, including the losses, stays on the record.</p>
      <div class="ctas">${session.user ? html`<a class="btn btn-primary btn-lg" href="/app">Enter the Terminal</a>` : html`<a class="btn btn-primary btn-lg" href="/register">Begin your dynasty</a><a class="btn btn-ghost btn-lg" href="#demo">See it think</a>`}</div>
    </div>
    <div class="float-card glass fc1 layer" data-depth="1.4"><div class="lbl row">NIFTY 50 <span id="fc1b"></span></div><div class="val" id="fc1v">—</div><div class="small" id="fc1c">—</div></div>
    <div class="float-card glass fc2 layer" data-depth="1.1"><div class="lbl">BANK NIFTY</div><div class="val" id="fc2v">—</div><div class="small" id="fc2c">—</div></div>
    <div class="float-card glass fc3 layer" data-depth="0.9"><div class="lbl">Signal pipeline</div><div class="val" style="font-size:1rem">Data → Rules → AI</div><div class="small muted">Guardrail-verified narratives</div></div>
    <div class="float-card glass fc4 layer" data-depth="1.6"><div class="lbl">Access</div><div class="val">₹${PRICE_PER_DAY_PAISE / 100}<span class="small muted"> / day / category</span></div><div class="small muted">No lock-in. Pay per day.</div></div>
    <div class="scroll-cue" aria-hidden="true">SCROLL<i></i></div>
  </section>

  <div class="ticker" aria-label="Market preview ticker"><div class="ticker-track" id="ticker"></div></div>

  <section class="section">
    <div class="wrap">
      <div class="section-head"><span class="eyebrow">The Platform</span><h2 data-split>An intelligence dynasty, built on evidence</h2><p class="reveal">Five market workspaces. One disciplined engine. Nothing invented, nothing hidden.</p></div>
      <div class="constellation">
        <article class="glass c-a reveal" data-tilt><div class="icon-orb">${icon('studio')}</div><h3>AI Trade Studio</h3><p>Open any instrument into a full analysis workspace: interactive candlesticks across five timeframes, EMA, VWAP, Bollinger Bands, RSI and MACD, with entry zone, stop-loss and targets drawn on the chart and a risk/reward map beside it.</p><p>The AI explains <em>why</em> — in plain language — and a numeric guardrail rejects any sentence that cites a figure the engine didn't compute.</p></article>
        <article class="glass c-b reveal" data-tilt data-delay="120"><div class="icon-orb">${icon('data')}</div><h3>Honest data, always labelled</h3><p>Every number carries its provenance: <strong>LIVE</strong>, <strong>DELAYED</strong>, <strong>DEMO</strong> or <strong>UNAVAILABLE</strong>. Stale feeds are detected and flagged within seconds. Sample data is never passed off as the market.</p></article>
        <article class="glass c-c reveal" data-tilt><div class="icon-orb">${icon('options')}</div><h3>Options &amp; Futures</h3><p>Option chains with OI walls, PCR, max pain and Greeks; futures with basis, OI and momentum.</p></article>
        <article class="glass c-d reveal" data-tilt data-delay="100"><div class="icon-orb">${icon('commodity')}</div><h3>MCX &amp; Currency</h3><p>Dedicated workspaces for Gold, Silver, Crude, Natural Gas, Copper and USD/INR, EUR/INR, GBP/INR, JPY/INR.</p></article>
        <article class="glass c-e reveal" data-tilt data-delay="200"><div class="icon-orb">${icon('performance')}</div><h3>The full record</h3><p>Every setup is tracked to target, stop or expiry — and none are deleted. Paper trades are labelled as simulated.</p></article>
      </div>
    </div>
  </section>

  <section class="section" style="padding-top:40px">
    <div class="wrap">
      <div class="section-head"><span class="eyebrow">How VELTRA Thinks</span><h2 data-split>From raw tick to explained setup</h2></div>
      <div class="pipeline" id="pipeline">
        ${[['I', 'Ingest', 'Licensed feed, polled within the 09:10–15:30 IST monitoring window, holiday-aware.'], ['II', 'Validate', 'Out-of-order, future-dated and malformed quotes are rejected — never repaired.'], ['III', 'Compute', 'EMA, RSI, MACD, VWAP, ATR, Bollinger, swing support/resistance, relative strength.'], ['IV', 'Screen', 'Weighted, configurable rules. Trend must align. Risk/reward must clear 1.5.'], ['V', 'Explain', 'AI narrates the numbers — and is blocked from citing any it was not given.']].map(([n, t, d]) => html`<div class="step reveal"><div class="node metal-text">${n}</div><h4>${t}</h4><p>${d}</p></div>`)}
      </div>
    </div>
  </section>

  <section class="section" id="demo">
    <div class="wrap">
      <div class="section-head"><span class="eyebrow">Interactive Demonstration</span><h2 data-split>Watch the engine read a chart</h2><p class="reveal">Select an instrument. The preview runs on the platform's configured data source — its status is shown on every row.</p></div>
      <div class="glass demo reveal">
        <div class="demo-list" id="demo-list"><div class="loader"><div class="loader-crest"></div></div></div>
        <div class="demo-stage">
          <div class="row"><div><div class="sym" id="d-sym" style="font-size:1.2rem">—</div><div class="small muted" id="d-name"></div></div><div class="spacer"></div><span id="d-badge"></span><div class="num" id="d-ltp" style="font-size:1.4rem">—</div></div>
          <canvas id="d-chart" aria-label="Price chart preview"></canvas>
          <div class="row small" id="d-ind"></div>
        </div>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="wrap">
      <div class="section-head"><span class="eyebrow">Access</span><h2 data-split>Pay only for the intelligence you use</h2><p class="reveal">₹${PRICE_PER_DAY_PAISE / 100} per day, per category. Combine any of the five. Renewals extend your current access.</p></div>
      <div class="price-grid">${cats.map((c, i) => html`<div class="glass price-card reveal" data-delay="${i * 80}"><span class="eyebrow">${c.segment.replace('_', ' ')}</span><h3>${c.name}</h3><div class="amt metal-text">₹50<small> / day</small></div><a class="btn ${i === 0 ? 'btn-primary' : ''}" href="/pricing">Details</a></div>`)}</div>
    </div>
  </section>

  <section class="section" style="padding-top:20px">
    <div class="wrap band">
      ${[['100%', 'of setups retained in the record — wins, losses and expiries'], ['4', 'data labels on every price: live, delayed, demo, unavailable'], ['0', 'figures an AI narrative may cite that the engine did not compute'], ['₹50', 'per day per category — no annual lock-in']].map(([v, l], i) => html`<div class="glass stat reveal" data-delay="${i * 90}"><div class="v metal-text">${v}</div><p class="small" style="margin:0">${l}</p></div>`)}
    </div>
  </section>

  <section class="section"><div class="wrap"><div class="glass cta-final reveal"><span class="eyebrow">Your terminal awaits</span><h2 style="margin-top:18px" data-split>Rule the market with clarity</h2><p style="max-width:560px;margin:0 auto 28px">Create a free account to explore the terminal, market overview and AI Trade Studio. Subscribe only to the categories you want.</p><a class="btn btn-primary btn-lg" href="${session.user ? '/app' : '/register'}">${session.user ? 'Open Terminal' : 'Create free account'}</a><p class="tiny muted" style="margin-top:22px">Analysis is informational and is not investment advice. Read the <a href="/risk">risk disclosures</a>.</p></div></div></section>
  `);

  await intro();
  // Hero choreography
  stagger($$('.hero-title .ch', root), [{ opacity: 0, transform: 'translateY(60%) rotateX(-70deg)', filter: 'blur(14px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 1300, each: 90, easing: EASE.silk });
  animate($('.hero .tagline', root), [{ opacity: 0, letterSpacing: '1.1em' }, { opacity: 1, letterSpacing: '.58em' }], { duration: 1600, delay: 500 });
  stagger([$('.hero .lede', root), $('.hero .ctas', root)], [{ opacity: 0, transform: 'translateY(20px)' }, { opacity: 1, transform: 'none' }], { duration: 1000, delay: 800, each: 160 });
  stagger($$('.float-card', root), [{ opacity: 0, transform: 'translateY(40px) scale(.9)' }, { opacity: 1, transform: 'none' }], { duration: 1200, delay: 1100, each: 140, easing: EASE.silk });
  revealOnScroll(root); tilt(root);

  // Parallax (pointer + scroll), rAF-throttled.
  const layers = $$('.hero .layer', root); let px = 0, py = 0, ticking = false;
  const apply = () => { ticking = false; const sy = scrollY; layers.forEach((l) => { const d = +l.dataset.depth; l.style.translate = `${px * d * 18}px ${py * d * 14 - sy * d * 0.25}px`; }); };
  const onMove = (e) => { px = e.clientX / innerWidth - 0.5; py = e.clientY / innerHeight - 0.5; if (!ticking) { ticking = true; requestAnimationFrame(apply); } };
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(apply); } };
  if (!reduced()) { addEventListener('pointermove', onMove, { passive: true }); addEventListener('scroll', onScroll, { passive: true }); }

  // Pipeline sequential lighting.
  const steps = $$('#pipeline .step', root); let k = 0;
  const pipeTimer = setInterval(() => { steps.forEach((s, i) => s.classList.toggle('lit', i === k % steps.length)); k++; }, 1300);

  // Live preview data.
  let timer;
  const load = async () => {
    try {
      const p = await api.get('/api/market/preview');
      const n = p.indices.find((i) => i.symbol === 'NIFTY 50'), b = p.indices.find((i) => i.symbol === 'NIFTY BANK');
      const set = (id, q) => { if (!q) return; countTo($(`#${id}v`, root), q.ltp, { format: (v) => price(v) }); const c = $(`#${id}c`, root); c.textContent = `${pct(q.changePct)}`; c.className = 'small ' + cls(q.changePct); };
      set('fc1', n); set('fc2', b); render($('#fc1b', root), badge(p.dataStatus));
      const items = [...p.indices, ...p.top];
      const row = items.map((q) => html`<span class="ticker-item"><span class="sym">${q.symbol}</span><span class="num">${price(q.ltp)}</span><span class="num ${cls(q.changePct)}">${pct(q.changePct)}</span>${badge(q.dataStatus)}</span>`);
      render($('#ticker', root), html`${row}${row}`);
      if (!$('#demo-list button', root)) initDemo(root, items);
    } catch { render($('#ticker', root), html`<span class="ticker-item">${badge('UNAVAILABLE')} Market preview unavailable</span>`); }
  };
  await load(); timer = setInterval(load, 8000);

  return () => { clearInterval(timer); clearInterval(pipeTimer); removeEventListener('pointermove', onMove); removeEventListener('scroll', onScroll); };
}

function initDemo(root, items) {
  const list = $('#demo-list', root);
  render(list, html`${items.map((q, i) => html`<button data-id="${q.id}" class="${i === 0 ? 'on' : ''}"><span><span class="sym">${q.symbol}</span><br><span class="tiny muted">${q.name}</span></span><span class="num ${cls(q.changePct)}">${pct(q.changePct)}</span></button>`)}`);
  list.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; list.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); show(+b.dataset.id); });
  const canvas = $('#d-chart', root);
  async function show(id) {
    try {
      const d = await api.get(`/api/market/preview/${id}/bars`);
      $('#d-sym', root).textContent = d.quote.symbol; $('#d-name', root).textContent = d.quote.name;
      render($('#d-badge', root), badge(d.quote.dataStatus)); countTo($('#d-ltp', root), d.quote.ltp, { format: (v) => price(v) });
      drawDemo(canvas, d.bars, d.ema20);
      const i = d.indicators || {};
      render($('#d-ind', root), html`${[['RSI 14', i.rsi14?.toFixed(1)], ['EMA 20', price(i.ema20)], ['EMA 50', price(i.ema50)], ['MACD hist', i.macdHist?.toFixed(3)], ['Vol / avg', i.volumeRatio ? i.volumeRatio.toFixed(2) + '×' : '—'], ['ATR %', i.atrPct?.toFixed(2)]].map(([k, v]) => html`<span class="chip">${k} <b class="num">${v ?? '—'}</b></span>`)}`);
      stagger($$('#d-ind .chip', root), [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { each: 50, duration: 500 });
    } catch { render($('#d-ind', root), html`${badge('UNAVAILABLE')}`); }
  }
  show(items[0].id);
}

// Self-drawing mini candlestick chart with EMA20.
function drawDemo(canvas, bars, ema) {
  const dpr = Math.min(2, devicePixelRatio || 1), r = canvas.getBoundingClientRect();
  canvas.width = r.width * dpr; canvas.height = r.height * dpr; const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const lo = Math.min(...bars.map((b) => b.low)), hi = Math.max(...bars.map((b) => b.high)), W = r.width, H = r.height, bw = W / bars.length;
  const Y = (v) => 8 + (1 - (v - lo) / (hi - lo)) * (H - 16);
  const t0 = performance.now(), dur = reduced() ? 1 : 1400;
  const frame = (now) => {
    const p = Math.min(1, (now - t0) / dur), n = Math.floor(bars.length * (1 - Math.pow(1 - p, 3)));
    g.clearRect(0, 0, W, H);
    for (let i = 0; i < n; i++) { const b = bars[i], up = b.close >= b.open, x = i * bw + bw / 2; g.strokeStyle = up ? '#28B889' : '#F05268'; g.beginPath(); g.moveTo(x, Y(b.high)); g.lineTo(x, Y(b.low)); g.stroke(); g.fillStyle = up ? 'rgba(40,184,137,.85)' : 'rgba(240,82,104,.85)'; g.fillRect(x - bw * 0.32, Math.min(Y(b.open), Y(b.close)), bw * 0.64, Math.max(1, Math.abs(Y(b.open) - Y(b.close)))); }
    g.strokeStyle = '#F2C9B9'; g.lineWidth = 1.5; g.beginPath(); let s = false;
    for (let i = 0; i < n; i++) { if (ema[i] == null) continue; const x = i * bw + bw / 2; s ? g.lineTo(x, Y(ema[i])) : (g.moveTo(x, Y(ema[i])), s = true); }
    g.stroke(); g.lineWidth = 1;
    if (p < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
