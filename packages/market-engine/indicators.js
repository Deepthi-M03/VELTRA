// Technical indicators. Pure functions over numeric arrays / bar arrays.
// Each returns an array aligned to the input (null where not enough data), unless noted.

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

export function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values, period) {
  const out = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) { prev = values[i] * k + prev * (1 - k); out[i] = prev; }
  return out;
}

// Wilder's RSI.
export function rsi(values, period = 14) {
  const out = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= period; loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export function macd(values, fast = 12, slow = 26, signal = 9) {
  const ef = ema(values, fast), es = ema(values, slow);
  const line = values.map((_, i) => (isNum(ef[i]) && isNum(es[i]) ? ef[i] - es[i] : null));
  const start = line.findIndex(isNum);
  const sig = new Array(values.length).fill(null);
  if (start >= 0) {
    const e = ema(line.slice(start), signal);
    e.forEach((v, j) => { sig[start + j] = v; });
  }
  const hist = line.map((v, i) => (isNum(v) && isNum(sig[i]) ? v - sig[i] : null));
  return { line, signal: sig, hist };
}

export function bollinger(values, period = 20, mult = 2) {
  const mid = sma(values, period);
  const upper = new Array(values.length).fill(null), lower = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += (values[j] - mid[i]) ** 2;
    const sd = Math.sqrt(s / period);
    upper[i] = mid[i] + mult * sd; lower[i] = mid[i] - mult * sd;
  }
  return { mid, upper, lower };
}

export function atr(bars, period = 14) {
  const tr = bars.map((b, i) => (i === 0 ? b.high - b.low
    : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close))));
  const out = new Array(bars.length).fill(null);
  if (bars.length < period) return out;
  let prev = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < bars.length; i++) { prev = (prev * (period - 1) + tr[i]) / period; out[i] = prev; }
  return out;
}

// VWAP that resets at each session (sessionKey(bar) => string, e.g. IST date).
export function vwap(bars, sessionKey) {
  const out = new Array(bars.length).fill(null);
  let pv = 0, vol = 0, key = null;
  for (let i = 0; i < bars.length; i++) {
    const k = sessionKey ? sessionKey(bars[i]) : 'all';
    if (k !== key) { pv = 0; vol = 0; key = k; }
    const tp = (bars[i].high + bars[i].low + bars[i].close) / 3;
    pv += tp * bars[i].volume; vol += bars[i].volume;
    out[i] = vol > 0 ? pv / vol : tp;
  }
  return out;
}

export function rateOfChange(values, period = 10) {
  return values.map((v, i) => (i >= period && values[i - period] !== 0 ? ((v - values[i - period]) / values[i - period]) * 100 : null));
}

// Swing-pivot support/resistance with simple clustering. Returns nearest levels around `price`.
export function supportResistance(bars, { lookback = 120, window = 3, tolerancePct = 0.35 } = {}) {
  const slice = bars.slice(-lookback);
  const pivots = [];
  for (let i = window; i < slice.length - window; i++) {
    let hi = true, lo = true;
    for (let j = i - window; j <= i + window; j++) {
      if (slice[j].high > slice[i].high) hi = false;
      if (slice[j].low < slice[i].low) lo = false;
    }
    if (hi) pivots.push(slice[i].high);
    if (lo) pivots.push(slice[i].low);
  }
  pivots.sort((a, b) => a - b);
  const clusters = [];
  for (const p of pivots) {
    const c = clusters[clusters.length - 1];
    if (c && Math.abs(p - c.level) / c.level * 100 <= tolerancePct) {
      c.level = (c.level * c.touches + p) / (c.touches + 1); c.touches++;
    } else clusters.push({ level: p, touches: 1 });
  }
  const price = slice[slice.length - 1]?.close;
  const supports = clusters.filter((c) => c.level < price).sort((a, b) => b.level - a.level);
  const resistances = clusters.filter((c) => c.level > price).sort((a, b) => a.level - b.level);
  return {
    support: supports[0]?.level ?? Math.min(...slice.map((b) => b.low)),
    resistance: resistances[0]?.level ?? Math.max(...slice.map((b) => b.high)),
    levels: clusters,
  };
}

// Relative strength: instrument return minus benchmark return over `period` bars, in percentage points.
export function relativeStrength(closes, benchCloses, period = 20) {
  const n = Math.min(closes.length, benchCloses.length);
  if (n <= period) return null;
  const a = closes.slice(-n), b = benchCloses.slice(-n);
  const ra = (a[n - 1] / a[n - 1 - period] - 1) * 100;
  const rb = (b[n - 1] / b[n - 1 - period] - 1) * 100;
  return ra - rb;
}

export const last = (arr) => { for (let i = arr.length - 1; i >= 0; i--) if (isNum(arr[i])) return arr[i]; return null; };
export const prevOf = (arr, back = 1) => { let seen = 0; for (let i = arr.length - 1; i >= 0; i--) if (isNum(arr[i])) { if (seen === back) return arr[i]; seen++; } return null; };

// Full indicator pack used by the recommendation engine and the AI Trade Studio.
export function computeAll(bars, { benchmark, sessionKey } = {}) {
  const closes = bars.map((b) => b.close);
  const vols = bars.map((b) => b.volume);
  const m = macd(closes);
  const bb = bollinger(closes);
  const a = atr(bars);
  const vw = vwap(bars, sessionKey);
  const volAvg = sma(vols, 20);
  const sr = supportResistance(bars);
  const close = closes[closes.length - 1];
  const r = {
    close,
    sma20: last(sma(closes, 20)), sma50: last(sma(closes, 50)),
    ema9: last(ema(closes, 9)), ema20: last(ema(closes, 20)), ema50: last(ema(closes, 50)),
    rsi14: last(rsi(closes, 14)),
    macd: last(m.line), macdSignal: last(m.signal), macdHist: last(m.hist), macdHistPrev: prevOf(m.hist),
    bbUpper: last(bb.upper), bbMid: last(bb.mid), bbLower: last(bb.lower),
    atr14: last(a),
    vwap: last(vw),
    volume: vols[vols.length - 1], volumeAvg20: prevOf(volAvg) ?? last(volAvg),
    roc10: last(rateOfChange(closes, 10)),
    support: sr.support, resistance: sr.resistance,
    relativeStrength20: benchmark ? relativeStrength(closes, benchmark, 20) : null,
    bars: bars.length,
  };
  r.volumeRatio = r.volumeAvg20 ? r.volume / r.volumeAvg20 : null;
  r.atrPct = r.atr14 && close ? (r.atr14 / close) * 100 : null;
  return r;
}

// Series versions for charting overlays.
export function chartSeries(bars, sessionKey) {
  const closes = bars.map((b) => b.close);
  const m = macd(closes), bb = bollinger(closes);
  return {
    ema20: ema(closes, 20), ema50: ema(closes, 50), sma20: sma(closes, 20),
    rsi14: rsi(closes, 14), macd: m.line, macdSignal: m.signal, macdHist: m.hist,
    bbUpper: bb.upper, bbMid: bb.mid, bbLower: bb.lower, vwap: vwap(bars, sessionKey),
  };
}
