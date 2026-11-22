import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sma, ema, rsi, macd, bollinger, atr, vwap, supportResistance, computeAll } from '../../packages/market-engine/indicators.js';
import { blackScholes, impliedVol, chainStats } from '../../packages/market-engine/options-math.js';
import { MarketCalendar } from '../../packages/market-engine/session.js';
import { normalizeQuote, aggregate } from '../../packages/market-engine/validate.js';
import { evaluate, buildLevels, trackStatus, DEFAULT_RULES } from '../../packages/market-engine/recommend.js';
import { DemoProvider } from '../../packages/market-engine/providers/demo.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test('SMA and EMA', () => {
  assert.deepEqual(sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
  const e = ema([1, 2, 3, 4, 5, 6], 3);
  close(e[2], 2); close(e[3], 3); close(e[5], 5);
});

test('RSI matches Wilder reference series', () => {
  // Classic 14-period example (Wilder / StockCharts): first RSI ≈ 70.53
  const px = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00, 46.03, 46.41, 46.22, 45.64];
  const r = rsi(px, 14);
  close(r[14], 70.46, 0.15);
  assert.ok(r[19] > 30 && r[19] < 70);
  assert.equal(r[13], null);
});

test('MACD, Bollinger, ATR, VWAP are well-formed', () => {
  const px = Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i / 5) * 5 + i * 0.1);
  const m = macd(px);
  assert.ok(m.hist[79] !== null && Number.isFinite(m.hist[79]));
  const bb = bollinger(px);
  assert.ok(bb.upper[79] > bb.mid[79] && bb.mid[79] > bb.lower[79]);
  const bars = px.map((c, i) => ({ ts: i * 60000, open: c, high: c + 1, low: c - 1, close: c, volume: 100 }));
  assert.ok(atr(bars)[79] >= 2 - 1e-9);
  const vw = vwap(bars, (b) => (b.ts < 40 * 60000 ? 'a' : 'b'));
  close(vw[40], px[40]); // resets at session boundary
  const sr = supportResistance(bars);
  assert.ok(sr.support < bars[79].close && sr.resistance > bars[79].close);
});

test('Black–Scholes: put–call parity and IV round-trip', () => {
  const p = { S: 100, K: 105, T: 0.25, r: 0.065, sigma: 0.2 };
  const c = blackScholes({ ...p, type: 'CE' }), pu = blackScholes({ ...p, type: 'PE' });
  close(c.price - pu.price, p.S - p.K * Math.exp(-p.r * p.T), 1e-4);
  assert.ok(c.delta > 0 && c.delta < 1 && pu.delta < 0 && pu.delta > -1);
  close(impliedVol({ price: c.price, S: 100, K: 105, T: 0.25, type: 'CE' }), 0.2, 1e-4);
  const st = chainStats([{ strike: 100, CE: { oi: 10 }, PE: { oi: 30 } }, { strike: 110, CE: { oi: 50 }, PE: { oi: 5 } }]);
  assert.equal(st.oiResistance, 110); assert.equal(st.oiSupport, 100); close(st.pcr, 35 / 60);
});

test('Market calendar: holidays, weekends, phases, special sessions', () => {
  const cal = new MarketCalendar([
    { date: '2026-11-24', exchange: 'NSE', kind: 'holiday', description: 'Guru Nanak Jayanti' },
    { date: '2026-02-01', exchange: 'NSE', kind: 'special_session', open_time: '09:15', close_time: '15:00', description: 'Budget' },
  ]);
  const at = (iso) => cal.status('NSE_EQ', new Date(iso));
  assert.equal(at('2026-11-24T05:00:00Z').phase, 'CLOSED');           // holiday
  assert.equal(at('2026-11-22T05:00:00Z').reason, 'Weekend');          // Sunday
  assert.equal(at('2026-11-23T03:30:00Z').phase, 'PRE_MARKET');        // 09:00 IST
  const pre = at('2026-11-23T03:42:00Z');                                // 09:12 IST
  assert.equal(pre.phase, 'PRE_OPEN'); assert.equal(pre.monitoring, true);
  assert.equal(at('2026-11-23T05:00:00Z').phase, 'OPEN');              // 10:30 IST
  assert.equal(at('2026-11-23T10:05:00Z').phase, 'CLOSED');            // 15:35 IST
  const bud = at('2026-02-01T09:45:00Z');                                // Sunday 15:15 IST, special closes 15:00
  assert.equal(bud.phase, 'CLOSED'); assert.equal(at('2026-02-01T05:00:00Z').phase, 'OPEN');
  assert.equal(cal.nextOpen('NSE_EQ', new Date('2026-11-23T11:00:00Z')), '2026-11-25T03:45:00.000Z'); // skips holiday
});

test('Quote validation rejects bad data instead of fixing it', () => {
  const now = Date.now();
  assert.equal(normalizeQuote({ key: 'EQ:X', ltp: 10, ts: now, prevClose: 8 }).quote.changePct, 25);
  assert.equal(normalizeQuote({ key: 'EQ:X', ltp: -1, ts: now }).ok, false);
  assert.equal(normalizeQuote({ key: 'EQ:X', ltp: 10, ts: now + 60000 }).ok, false);
  assert.equal(normalizeQuote({ key: 'EQ:X', ltp: 10, ts: now, high: 9, low: 11 }).ok, false);
  assert.equal(normalizeQuote({ key: 'EQ:X', ltp: NaN, ts: now }).ok, false);
});

test('Aggregation preserves OHLCV', () => {
  const base = Date.parse('2026-11-23T03:45:00Z'); // 09:15 IST
  const bars = Array.from({ length: 10 }, (_, i) => ({ ts: base + i * 60000, open: i + 1, high: i + 2, low: i, close: i + 1.5, volume: 10 }));
  const a = aggregate(bars, 5);
  assert.equal(a.length, 2);
  assert.deepEqual(a[0], { ts: base, open: 1, high: 6, low: 0, close: 5.5, volume: 50 });
});

test('Levels: stop/targets on the correct side with configured R multiples', () => {
  const ind = { close: 100, atr14: 2, support: 90, resistance: 110 };
  const L = buildLevels(ind, 'LONG', DEFAULT_RULES);
  assert.ok(L.stop < L.entry && L.target1 > L.entry && L.target2 > L.target1);
  close(L.riskReward, DEFAULT_RULES.target1R, 1e-9);
  const S = buildLevels(ind, 'SHORT', DEFAULT_RULES);
  assert.ok(S.stop > S.entry && S.target1 < S.entry);
});

test('Recommendation lifecycle transitions', () => {
  const r = { direction: 'LONG', entry_low: 99, entry_high: 101, stop_loss: 95, target1: 106, target2: 110, status: 'open', expires_at: new Date(Date.now() + 3600e3).toISOString() };
  assert.equal(trackStatus(r, 103), null);
  assert.equal(trackStatus(r, 100), 'entered');
  assert.equal(trackStatus({ ...r, status: 'entered' }, 107), 'target1_hit');
  assert.equal(trackStatus({ ...r, status: 'target1_hit' }, 111), 'target2_hit');
  assert.equal(trackStatus({ ...r, status: 'entered' }, 94), 'stopped');
  assert.equal(trackStatus({ ...r, expires_at: new Date(Date.now() - 1).toISOString() }, 103), 'expired');
});

test('Engine on demo data: qualified setups are internally consistent and traceable', async () => {
  const p = new DemoProvider();
  let found = 0;
  for (const inst of (await p.listInstruments()).filter((i) => i.segment === 'EQ').slice(0, 30)) {
    const bars = await p.getHistory(inst.key, '1d');
    const r = evaluate(bars, { horizon: 'delivery' });
    if (!r.qualified) { assert.ok(r.reason); continue; }
    found++;
    const long = r.direction === 'LONG';
    assert.ok(long ? r.stopLoss < r.entryLow && r.target1 > r.entryHigh : r.stopLoss > r.entryHigh && r.target1 < r.entryLow);
    assert.ok(r.riskReward >= DEFAULT_RULES.minRiskReward - 0.01 && r.score >= DEFAULT_RULES.minScore);
    assert.ok(r.confidence.factors.trend && r.confidence.method.length > 20);
    assert.equal(r.indicators.close, bars.at(-1).close); // levels derive from the supplied data
  }
  assert.ok(found >= 1, 'expected at least one qualified setup in 30 demo instruments');
});

test('computeAll handles short history without throwing', () => {
  const bars = Array.from({ length: 10 }, (_, i) => ({ ts: i, open: 1, high: 2, low: 0.5, close: 1.5, volume: 1 }));
  const r = computeAll(bars);
  assert.equal(r.ema50, null); assert.equal(r.rsi14, null);
});
