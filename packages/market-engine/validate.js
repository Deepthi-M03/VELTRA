// Quote/bar validation & normalization. Invalid data is rejected, never "fixed up".
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const num = (x) => (x === null || x === undefined || x === '' ? null : Number(x));

export function normalizeQuote(raw, { now = Date.now(), maxFutureSkewMs = 5000 } = {}) {
  const q = {
    key: String(raw.key || ''),
    ltp: num(raw.ltp), open: num(raw.open), high: num(raw.high), low: num(raw.low), prevClose: num(raw.prevClose),
    volume: num(raw.volume) ?? 0, tradedValue: num(raw.tradedValue) ?? 0,
    oi: num(raw.oi), oiChange: num(raw.oiChange), iv: num(raw.iv),
    ts: typeof raw.ts === 'string' ? Date.parse(raw.ts) : num(raw.ts),
  };
  const errors = [];
  if (!q.key) errors.push('missing key');
  if (!fin(q.ltp) || q.ltp <= 0) errors.push('ltp must be a positive number');
  if (!fin(q.ts)) errors.push('missing/invalid timestamp');
  else if (q.ts > now + maxFutureSkewMs) errors.push('timestamp in the future');
  if (fin(q.high) && fin(q.low) && q.high < q.low) errors.push('high < low');
  if (q.volume < 0 || !fin(q.volume)) errors.push('invalid volume');
  for (const k of ['open', 'high', 'low', 'prevClose']) if (q[k] !== null && (!fin(q[k]) || q[k] <= 0)) errors.push(`invalid ${k}`);
  if (errors.length) return { ok: false, errors, key: q.key };
  q.change = fin(q.prevClose) ? q.ltp - q.prevClose : null;
  q.changePct = fin(q.prevClose) && q.prevClose ? (q.change / q.prevClose) * 100 : null;
  return { ok: true, quote: q };
}

export function validBar(b) {
  return [b.ts, b.open, b.high, b.low, b.close].every(fin) && b.high >= b.low && b.open > 0 && b.close > 0 && (b.volume ?? 0) >= 0;
}

// Aggregate 1-minute bars to N-minute bars aligned to the IST session (09:15 anchor for intraday).
export function aggregate(bars, minutes) {
  if (minutes <= 1) return bars;
  const span = minutes * 60000, anchor = (9 * 60 + 15 - 330) * 60000; // 09:15 IST in UTC ms-of-day
  const out = [];
  let cur = null;
  for (const b of bars) {
    const bucket = Math.floor((b.ts - anchor) / span) * span + anchor;
    if (!cur || cur.ts !== bucket) { cur = { ts: bucket, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume || 0 }; out.push(cur); }
    else { cur.high = Math.max(cur.high, b.high); cur.low = Math.min(cur.low, b.low); cur.close = b.close; cur.volume += b.volume || 0; }
  }
  return out;
}
