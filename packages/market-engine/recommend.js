// Rule-based recommendation engine. Inputs are validated bars only; every output number is derived
// from them by the formulas below and the full factor breakdown is stored with the recommendation.
import { computeAll } from './indicators.js';

export const RULE_SET_VERSION = 'crimson-1.0';

// Configurable screening rules (admin can override via provider_configs kind='market' name='rules').
export const DEFAULT_RULES = Object.freeze({
  minBars: 60,
  minScore: 70,            // composite 0–100 needed to publish
  requireTrendAlignment: true, // EMA structure must fully agree with direction
  minRiskReward: 1.5,
  maxAtrPct: { intraday: 2.5, delivery: 6, positional: 6 },
  minAtrPct: 0.05,
  entryAtrFraction: 0.25,  // entry zone = close ± this × ATR
  stopAtrMultiple: 1.5,
  target1R: 1.5, target2R: 2.5,
  weights: { trend: 25, momentum: 20, macd: 15, vwap: 10, volume: 15, relativeStrength: 10, volatility: 5 },
  rsiLongBand: [50, 70], rsiShortBand: [30, 50],
  volumeRatioMin: 1.1,
  expiryHours: { intraday: 6.5, delivery: 24 * 10, positional: 24 * 5 },
});

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const round = (x, tick = 0.05) => Math.round(x / tick) * tick;

// Scores each factor −1…+1 (bullish positive). Returns breakdown + composite per direction.
export function scoreFactors(ind, rules, horizon) {
  const f = {};
  // Trend: price vs EMA20 vs EMA50
  if (ind.ema20 && ind.ema50) {
    const up = ind.close > ind.ema20 && ind.ema20 > ind.ema50, dn = ind.close < ind.ema20 && ind.ema20 < ind.ema50;
    f.trend = { value: up ? 1 : dn ? -1 : ind.close > ind.ema50 ? 0.3 : -0.3,
      detail: `close ${ind.close.toFixed(2)} vs EMA20 ${ind.ema20.toFixed(2)} vs EMA50 ${ind.ema50.toFixed(2)}` };
  }
  if (ind.rsi14 != null) {
    const [l1, l2] = rules.rsiLongBand, [s1, s2] = rules.rsiShortBand;
    let v = 0;
    if (ind.rsi14 >= l1 && ind.rsi14 <= l2) v = 1; else if (ind.rsi14 > l2) v = 0.2; // overbought: weak long
    else if (ind.rsi14 >= s1 && ind.rsi14 < s2) v = -1; else if (ind.rsi14 < s1) v = -0.2;
    const roc = ind.roc10 ?? 0;
    f.momentum = { value: clamp(v * 0.7 + clamp(roc / 2, -1, 1) * 0.3, -1, 1), detail: `RSI14 ${ind.rsi14.toFixed(1)}, ROC10 ${roc.toFixed(2)}%` };
  }
  if (ind.macdHist != null) {
    const rising = ind.macdHistPrev != null && ind.macdHist > ind.macdHistPrev;
    f.macd = { value: ind.macdHist > 0 ? (rising ? 1 : 0.4) : (rising ? -0.4 : -1),
      detail: `MACD hist ${ind.macdHist.toFixed(3)} (${rising ? 'rising' : 'falling'})` };
  }
  if (ind.vwap && horizon === 'intraday') {
    const d = (ind.close - ind.vwap) / ind.vwap * 100;
    f.vwap = { value: clamp(d / 0.5, -1, 1), detail: `close ${d >= 0 ? 'above' : 'below'} VWAP ${ind.vwap.toFixed(2)} by ${Math.abs(d).toFixed(2)}%` };
  }
  if (ind.volumeRatio != null) {
    f.volume = { value: ind.volumeRatio >= rules.volumeRatioMin ? 1 : ind.volumeRatio >= 0.8 ? 0.3 : 0, directional: false,
      detail: `volume ${ind.volumeRatio.toFixed(2)}× 20-bar average` };
  }
  if (ind.relativeStrength20 != null) {
    f.relativeStrength = { value: clamp(ind.relativeStrength20 / 2, -1, 1), detail: `${ind.relativeStrength20.toFixed(2)} pts vs NIFTY 50 over 20 bars` };
  }
  if (ind.atrPct != null) {
    const ok = ind.atrPct <= rules.maxAtrPct[horizon] && ind.atrPct >= rules.minAtrPct;
    f.volatility = { value: ok ? 1 : 0, directional: false, detail: `ATR ${ind.atrPct.toFixed(2)}% of price (limit ${rules.maxAtrPct[horizon]}%)` };
  }
  const composite = (dir) => {
    let tot = 0, wsum = 0;
    for (const [k, w] of Object.entries(rules.weights)) {
      const x = f[k]; if (!x) continue;
      const contrib = x.directional === false ? x.value : (dir === 'LONG' ? x.value : -x.value);
      tot += w * Math.max(0, contrib); wsum += w; // only supporting evidence counts; neutral/opposing = 0
    }
    return wsum ? (tot / wsum) * 100 : 0;
  };
  return { factors: f, long: composite('LONG'), short: composite('SHORT') };
}

export function buildLevels(ind, direction, rules) {
  const a = ind.atr14, c = ind.close;
  const entryLow = c - rules.entryAtrFraction * a, entryHigh = c + rules.entryAtrFraction * a;
  const entry = c;
  let stop, t1, t2;
  if (direction === 'LONG') {
    const atrStop = entry - rules.stopAtrMultiple * a;
    stop = ind.support && ind.support < entry && ind.support > atrStop - a ? Math.min(atrStop, ind.support - 0.2 * a) : atrStop;
    const R = entry - stop;
    t1 = entry + rules.target1R * R; t2 = entry + rules.target2R * R;
  } else {
    const atrStop = entry + rules.stopAtrMultiple * a;
    stop = ind.resistance && ind.resistance > entry && ind.resistance < atrStop + a ? Math.max(atrStop, ind.resistance + 0.2 * a) : atrStop;
    const R = stop - entry;
    t1 = entry - rules.target1R * R; t2 = entry - rules.target2R * R;
  }
  const rr = Math.abs(t1 - entry) / Math.abs(entry - stop);
  return { entryLow, entryHigh, entry, stop, target1: t1, target2: t2, riskReward: rr };
}

/**
 * Evaluate one instrument. Returns null when no setup qualifies (that is the common case).
 * @param bars validated bars (oldest first)
 * @param opts { horizon, benchmarkCloses, sessionKey, rules, tick }
 */
export function evaluate(bars, { horizon = 'intraday', benchmarkCloses, sessionKey, rules = DEFAULT_RULES, tick = 0.05 } = {}) {
  if (bars.length < rules.minBars) return { qualified: false, reason: `needs ${rules.minBars} bars, has ${bars.length}` };
  const ind = computeAll(bars, { benchmark: benchmarkCloses, sessionKey: horizon === 'intraday' ? sessionKey : undefined });
  if (!ind.atr14 || !ind.ema50) return { qualified: false, reason: 'insufficient indicator history', indicators: ind };
  const s = scoreFactors(ind, rules, horizon);
  const direction = s.long >= s.short ? 'LONG' : 'SHORT';
  const score = Math.max(s.long, s.short);
  if (s.factors.volatility?.value === 0) return { qualified: false, reason: 'volatility outside allowed band', indicators: ind, score };
  const trendVal = s.factors.trend?.value ?? 0;
  if (rules.requireTrendAlignment && (direction === 'LONG' ? trendVal < 1 : trendVal > -1)) return { qualified: false, reason: 'trend structure not aligned', indicators: ind, score, direction };
  if (score < rules.minScore) return { qualified: false, reason: `score ${score.toFixed(1)} below ${rules.minScore}`, indicators: ind, score, direction };
  const lv = buildLevels(ind, direction, rules);
  if (lv.riskReward < rules.minRiskReward) return { qualified: false, reason: 'risk/reward below minimum', indicators: ind, score };
  const r = (x) => round(x, tick);
  return {
    qualified: true, direction, horizon, score: Math.round(score * 10) / 10,
    entryLow: r(lv.entryLow), entryHigh: r(lv.entryHigh), stopLoss: r(lv.stop), target1: r(lv.target1), target2: r(lv.target2),
    support: r(ind.support), resistance: r(ind.resistance), riskReward: Math.round(lv.riskReward * 100) / 100,
    indicators: ind,
    confidence: {
      method: `Weighted composite of ${Object.keys(rules.weights).length} factors (weights ${JSON.stringify(rules.weights)}). Each factor is scored −1…+1 from the indicator values shown, only evidence supporting the chosen direction contributes (neutral or opposing factors add 0), giving 0–100. EMA trend structure must fully agree. Publish threshold ${rules.minScore}. Score is a rule-agreement measure, not a probability of profit.`,
      factors: s.factors, longScore: Math.round(s.long * 10) / 10, shortScore: Math.round(s.short * 10) / 10,
      ruleSet: RULE_SET_VERSION,
    },
  };
}

// Advance an open recommendation given the latest price. Returns the new status (or null if unchanged).
export function trackStatus(reco, price, now = Date.now()) {
  const long = reco.direction === 'LONG';
  const hitStop = long ? price <= reco.stop_loss : price >= reco.stop_loss;
  const hitT1 = long ? price >= reco.target1 : price <= reco.target1;
  const hitT2 = reco.target2 != null && (long ? price >= reco.target2 : price <= reco.target2);
  const inZone = price >= reco.entry_low && price <= reco.entry_high;
  if (reco.status === 'open') {
    if (inZone) return 'entered';
    if (now >= Date.parse(reco.expires_at)) return 'expired';
    return null;
  }
  if (reco.status === 'entered' || reco.status === 'target1_hit') {
    if (hitStop) return 'stopped';
    if (hitT2) return 'target2_hit';
    if (hitT1 && reco.status === 'entered') return 'target1_hit';
    if (now >= Date.parse(reco.expires_at)) return 'expired';
  }
  return null;
}
