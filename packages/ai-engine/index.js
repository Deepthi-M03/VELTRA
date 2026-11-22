// AI intelligence service. Two layers, always kept separate in storage and in the UI:
//   findings  — deterministic, computed from validated numbers (always present)
//   narrative — model-generated interpretation (optional; must pass the numeric guardrail)
// The model only ever receives the `inputs` object, and any number it writes that is not traceable
// to `inputs` causes the narrative to be rejected and replaced by the deterministic narrative.

const fmt = (x, d = 2) => (x == null || !Number.isFinite(x) ? 'n/a' : Number(x).toFixed(d));

export function buildFindings(inputs) {
  const i = inputs.indicators || {};
  const out = [];
  const add = (type, text, basis) => out.push({ type, text, basis });
  if (i.ema20 && i.ema50) {
    if (i.close > i.ema20 && i.ema20 > i.ema50) add('trend', 'Price is above EMA20, and EMA20 is above EMA50 — an established up-trend structure.', ['close', 'ema20', 'ema50']);
    else if (i.close < i.ema20 && i.ema20 < i.ema50) add('trend', 'Price is below EMA20, and EMA20 is below EMA50 — an established down-trend structure.', ['close', 'ema20', 'ema50']);
    else add('trend', 'Moving averages are mixed — no clean trend structure.', ['close', 'ema20', 'ema50']);
  }
  if (i.rsi14 != null) add('momentum', i.rsi14 > 70 ? `RSI14 at ${fmt(i.rsi14, 1)} is in overbought territory; momentum is strong but stretched.` : i.rsi14 < 30 ? `RSI14 at ${fmt(i.rsi14, 1)} is oversold; selling pressure is extended.` : `RSI14 at ${fmt(i.rsi14, 1)} is in the neutral-to-${i.rsi14 >= 50 ? 'positive' : 'negative'} zone.`, ['rsi14']);
  if (i.macdHist != null) add('momentum', `MACD histogram is ${i.macdHist > 0 ? 'positive' : 'negative'} (${fmt(i.macdHist, 3)}) and ${i.macdHistPrev != null && i.macdHist > i.macdHistPrev ? 'rising' : 'falling'}.`, ['macdHist', 'macdHistPrev']);
  if (i.vwap) add('intraday', `Price is ${i.close >= i.vwap ? 'above' : 'below'} session VWAP (${fmt(i.vwap)}).`, ['close', 'vwap']);
  if (i.volumeRatio != null) add('volume', `Latest bar volume is ${fmt(i.volumeRatio)}× its 20-bar average${i.volumeRatio > 1.5 ? ' — unusual participation' : ''}.`, ['volumeRatio']);
  if (i.bbUpper && i.bbLower) {
    const w = ((i.bbUpper - i.bbLower) / i.bbMid) * 100;
    add('volatility', `Bollinger band width is ${fmt(w)}% of the mid-band${i.close > i.bbUpper ? '; price is outside the upper band' : i.close < i.bbLower ? '; price is outside the lower band' : ''}.`, ['bbUpper', 'bbLower', 'bbMid']);
  }
  if (i.atrPct != null) add('risk', `Average true range is ${fmt(i.atrPct)}% of price; position size should reflect this volatility.`, ['atrPct']);
  if (i.support && i.resistance) add('levels', `Nearest swing support ${fmt(i.support)}, resistance ${fmt(i.resistance)}.`, ['support', 'resistance']);
  if (i.relativeStrength20 != null) add('relative', `${i.relativeStrength20 >= 0 ? 'Outperforming' : 'Underperforming'} NIFTY 50 by ${fmt(Math.abs(i.relativeStrength20))} percentage points over 20 bars.`, ['relativeStrength20']);
  const risks = [];
  if (i.rsi14 > 70 || i.rsi14 < 30) risks.push('Momentum is stretched; mean-reversion moves are common from these RSI levels.');
  if (i.atrPct > 2) risks.push('Elevated volatility widens both stop distance and potential slippage.');
  if (i.volumeRatio != null && i.volumeRatio < 0.8) risks.push('Below-average volume — moves may lack follow-through.');
  if (inputs.dataStatus === 'DEMO') risks.push('This analysis is computed on DEMO (synthetic) data and has no bearing on real markets.');
  if (inputs.dataStatus === 'DELAYED') risks.push('Inputs are delayed; live prices may differ.');
  risks.push('Events (results, policy, global cues) can override technical structure without warning.');
  return { findings: out, risks };
}

export function deterministicNarrative(inputs, { findings, risks }) {
  const r = inputs.recommendation;
  const head = r
    ? `${inputs.symbol} screens as a ${r.direction} ${r.horizon} setup with a rule score of ${fmt(r.score, 1)}. The entry zone is ${fmt(r.entryLow)}–${fmt(r.entryHigh)}, stop-loss ${fmt(r.stopLoss)}, first target ${fmt(r.target1)} (risk/reward ${fmt(r.riskReward)}).`
    : `${inputs.symbol} does not currently meet the screening rules${inputs.reason ? ` (${inputs.reason})` : ''}.`;
  const body = findings.slice(0, 5).map((f) => f.text).join(' ');
  return `${head} ${body} Key risks: ${risks.slice(0, 2).join(' ')}`;
}

// Guardrail: every number in the narrative must match a number in inputs (±0.6% or exact for small ints).
export function verifyNumbers(text, inputs) {
  const allowed = [];
  const walk = (v) => { if (typeof v === 'number' && Number.isFinite(v)) allowed.push(v); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  walk(inputs);
  const found = [...text.matchAll(/(?<![A-Za-z0-9.])-?\d[\d,]*(?:\.\d+)?/g)].map((m) => Number(m[0].replace(/,/g, '')));
  const unverified = [];
  const PERIODS = [1, 2, 3, 9, 10, 12, 14, 20, 26, 50, 100, 200]; // indicator periods / ordinals in prose
  for (const n of found) {
    if (PERIODS.includes(Math.abs(n))) continue;
    const ok = allowed.some((a) => (a === 0 ? n === 0 : Math.abs(n - a) / Math.abs(a) <= 0.006 || Math.abs(n - a) < 0.051));
    if (!ok) unverified.push(n);
  }
  return { passed: unverified.length === 0, checked: found.length, unverified };
}

class RateLimiter {
  constructor(perMinute) { this.per = perMinute; this.hits = []; }
  take() { const now = Date.now(); this.hits = this.hits.filter((t) => now - t < 60000); if (this.hits.length >= this.per) return false; this.hits.push(now); return true; }
}

export class AnthropicNarrator {
  constructor({ apiKey, model, timeoutMs = 20000, maxRetries = 2, ratePerMinute = 30 }) {
    this.apiKey = apiKey; this.model = model; this.timeoutMs = timeoutMs; this.maxRetries = maxRetries;
    this.limiter = new RateLimiter(ratePerMinute);
    this.name = 'anthropic';
  }
  get configured() { return !!this.apiKey; }
  async narrate(inputs, findings) {
    if (!this.configured) throw new Error('ANTHROPIC_API_KEY not set');
    if (!this.limiter.take()) throw new Error('AI rate limit reached');
    const system = 'You are the analysis writer for VELTRA, a market-intelligence tool. Write 4–6 sentences of plain-English interpretation of the technical data provided. Rules: (1) Only use numbers that appear verbatim in the INPUT JSON; never introduce prices, levels, percentages or facts not present. (2) Never predict profit or certainty; use conditional language. (3) Mention at least one risk. (4) If dataStatus is DEMO, state the data is synthetic. (5) No investment advice or calls to action.';
    const body = { model: this.model, max_tokens: 400, system,
      messages: [{ role: 'user', content: `INPUT JSON:\n${JSON.stringify(inputs)}\n\nDATA FINDINGS:\n${findings.findings.map((f) => '- ' + f.text).join('\n')}` }] };
    let lastErr;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST', signal: AbortSignal.timeout(this.timeoutMs),
          headers: { 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.status === 429 || res.status >= 500) throw new Error(`AI HTTP ${res.status}`);
        if (!res.ok) { const t = await res.text(); throw Object.assign(new Error(`AI HTTP ${res.status}: ${t.slice(0, 200)}`), { fatal: true }); }
        const j = await res.json();
        return { text: j.content?.map((c) => c.text || '').join('').trim(), model: j.model };
      } catch (e) {
        lastErr = e; if (e.fatal) break;
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      }
    }
    throw lastErr;
  }
}

export class AIEngine {
  constructor({ db, config, log = console }) {
    this.db = db; this.log = log;
    this.narrator = config.ai.provider === 'anthropic' ? new AnthropicNarrator({ apiKey: config.ai.anthropicApiKey, model: config.ai.anthropicModel,
      timeoutMs: config.ai.timeoutMs, maxRetries: config.ai.maxRetries, ratePerMinute: config.ai.ratePerMinute }) : null;
    this.health = { provider: this.narrator ? 'anthropic' : 'deterministic', configured: this.narrator ? this.narrator.configured : true,
      calls: 0, failures: 0, guardrailRejections: 0, lastError: null, lastSuccessAt: null };
  }

  async analyze({ kind, instrumentId = null, recommendationId = null, inputs, useModel = true }) {
    const f = buildFindings(inputs);
    let narrative = deterministicNarrative(inputs, f), provider = 'deterministic', model = null;
    let guard = { passed: true, checked: 0, unverified: [], fallback: false };
    if (this.narrator && useModel) {
      this.health.calls++;
      try {
        const out = await this.narrator.narrate(inputs, f);
        const v = verifyNumbers(out.text, inputs);
        if (v.passed) { narrative = out.text; provider = 'anthropic'; model = out.model; guard = { ...v, fallback: false }; this.health.lastSuccessAt = new Date().toISOString(); }
        else { this.health.guardrailRejections++; guard = { ...v, fallback: true, reason: 'model cited numbers not present in inputs' }; }
      } catch (e) {
        this.health.failures++; this.health.lastError = e.message;
        guard = { passed: true, checked: 0, unverified: [], fallback: true, reason: `model unavailable: ${e.message}` };
      }
    }
    const created = new Date().toISOString();
    const r = this.db.run(`INSERT INTO ai_analyses (instrument_id, recommendation_id, kind, provider, model, inputs_json, findings_json, narrative, guardrail_json, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`, instrumentId, recommendationId, kind, provider, model, JSON.stringify(inputs), JSON.stringify(f), narrative, JSON.stringify(guard), created);
    return { id: Number(r.lastInsertRowid), kind, provider, model, findings: f.findings, risks: f.risks, narrative,
      narrativeIsModelGenerated: provider !== 'deterministic', guardrail: guard, inputs, createdAt: created };
  }
}
