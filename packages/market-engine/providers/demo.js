// DEMO provider — deterministic synthetic prices for development and UI testing.
// EVERYTHING this provider returns is labelled DEMO and must never be presented as market data.
import { MarketDataProvider } from './base.js';
import { INDICES, EQUITIES, COMMODITIES, CURRENCIES, FNO_UNDERLYINGS } from '../universe.js';
import { blackScholes } from '../options-math.js';

function hash(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let s = seed || 1; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(r) { const u = Math.max(r(), 1e-12), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

const MIN = 60000, DAY = 86400000;
const HIST_1M = 2250; // ~6 sessions of 375 minutes
const HIST_1D = 320;

// Synthetic anchor levels — round numbers chosen to look nothing like a real quote screen.
function basePrice(inst) {
  const r = rng(hash(inst.key + ':base'));
  switch (inst.segment) {
    case 'IDX': return inst.symbol === 'INDIA VIX' ? 14 : 10000 + Math.round(r() * 40) * 1000;
    case 'COM': return { GOLD: 70000, SILVER: 85000, CRUDEOIL: 6000, NATURALGAS: 250, COPPER: 800, ZINC: 250, ALUMINIUM: 230 }[inst.symbol] ?? 1000;
    case 'CUR': return { USDINR: 85, EURINR: 92, GBPINR: 108, JPYINR: 56 }[inst.symbol] ?? 100;
    default: return Math.round(100 + r() * 3900);
  }
}

export class DemoProvider extends MarketDataProvider {
  constructor({ now = () => Date.now() } = {}) {
    super();
    this.now = now;
    this.state = new Map(); // key -> { inst, vol, beta, r, bars1m, bars1d, dayOpen, prevClose, cumVol, cumVal, oi }
    this.instruments = this.#buildInstruments();
  }
  get name() { return 'demo'; }
  get dataStatus() { return 'DEMO'; }
  get configured() { return true; }

  #buildInstruments() {
    const list = [];
    for (const i of INDICES) list.push({ key: `IDX:${i.symbol}`, symbol: i.symbol, exchange: 'NSE', segment: 'IDX', name: i.name, category: 'equity' });
    for (const [symbol, name, sector, n50, bn] of EQUITIES) list.push({ key: `EQ:${symbol}`, symbol, exchange: 'NSE', segment: 'EQ', name, sector, category: 'equity', inNifty50: !!n50, inBankNifty: !!bn, tickSize: 0.05 });
    const fut = this.#monthlyExpiry(this.now());
    for (const u of FNO_UNDERLYINGS) list.push({ key: `FUT:${u}:${fut}`, symbol: `${u} FUT`, exchange: 'NSE', segment: 'FUT', name: `${u} Futures ${fut}`, category: 'futures', expiry: fut, underlying: u, tickSize: 0.05 });
    const comExp = this.#monthEnd(this.now(), 19);
    for (const [symbol, name, unit, lotDesc, lot, tick] of COMMODITIES) list.push({ key: `COM:${symbol}:${comExp}`, symbol, exchange: 'MCX', segment: 'COM', name: `${name} (${unit}, lot ${lotDesc})`, category: 'commodity', expiry: comExp, lotSize: lot, tickSize: tick });
    const curExp = this.#monthEnd(this.now(), 26);
    for (const [symbol, name, lot, tick] of CURRENCIES) list.push({ key: `CUR:${symbol}:${curExp}`, symbol, exchange: 'NSE_CD', segment: 'CUR', name, category: 'currency', expiry: curExp, lotSize: lot, tickSize: tick });
    return list;
  }
  // Last Tuesday of the current (or next, if passed) month.
  #monthlyExpiry(ts) {
    const d = new Date(ts);
    for (let add = 0; add < 2; add++) {
      const y = d.getUTCFullYear(), m = d.getUTCMonth() + add;
      const last = new Date(Date.UTC(y, m + 1, 0));
      while (last.getUTCDay() !== 2) last.setUTCDate(last.getUTCDate() - 1);
      if (last.getTime() + DAY > ts) return last.toISOString().slice(0, 10);
    }
  }
  #monthEnd(ts, day) {
    const d = new Date(ts); let e = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), day));
    if (e.getTime() + DAY <= ts) e = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, day));
    return e.toISOString().slice(0, 10);
  }
  weeklyExpiries(ts, n = 4) {
    const out = []; const d = new Date(ts); d.setUTCHours(0, 0, 0, 0);
    while (out.length < n) { if (d.getUTCDay() === 2 && d.getTime() + DAY > ts) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
    return out;
  }

  // Shared "market factor" so indices and stocks move together.
  #marketFactor(t) {
    const r = rng(hash('mkt') ^ Math.floor(t / MIN));
    return gauss(r) * 0.0006;
  }

  #ensure(key) {
    if (this.state.has(key)) return this.state.get(key);
    const inst = this.instruments.find((i) => i.key === key);
    if (!inst) return null;
    if (inst.segment === 'FUT') { // futures track their underlying with a carry basis
      const uKey = inst.underlying === 'NIFTY' ? 'IDX:NIFTY 50' : inst.underlying === 'BANKNIFTY' ? 'IDX:NIFTY BANK' : `EQ:${inst.underlying}`;
      const u = this.#ensure(uKey);
      const st = { inst, derived: uKey, r: rng(hash(key)), oi: 0 };
      st.oi = Math.round((2e6 + st.r() * 8e6));
      this.state.set(key, st);
      void u;
      return st;
    }
    const r = rng(hash(key));
    const vol = inst.segment === 'IDX' ? 0.0007 : inst.segment === 'CUR' ? 0.00012 : inst.segment === 'COM' ? 0.0011 : 0.0012 + r() * 0.0009;
    const beta = inst.segment === 'EQ' || inst.segment === 'IDX' ? 0.6 + r() * 0.8 : 0;
    const now = this.now();
    // Daily history
    let p = basePrice(inst);
    const bars1d = [];
    const minuteStart = Math.floor(now / MIN) * MIN - (HIST_1M - 1) * MIN;
    const startD = this.#istDayStart(minuteStart) - HIST_1D * DAY; // daily history ends where minute history begins
    for (let i = 0; i < HIST_1D; i++) {
      const drift = Math.sin(i / 37 + (hash(key) % 7)) * 0.002;
      const o = p, c = Math.max(0.01, p * (1 + drift + gauss(r) * vol * 14));
      const h = Math.max(o, c) * (1 + Math.abs(gauss(r)) * vol * 5), l = Math.min(o, c) * (1 - Math.abs(gauss(r)) * vol * 5);
      bars1d.push({ ts: startD + i * DAY, open: o, high: h, low: l, close: c, volume: this.#volume(inst, r) * 375 });
      p = c;
    }
    // Minute history continuing from last daily close
    const bars1m = [];
    const start = minuteStart;
    for (let i = 0; i < HIST_1M; i++) {
      const t = start + i * MIN;
      const o = p;
      const c = Math.max(0.01, p * (1 + beta * this.#marketFactor(t) + gauss(r) * vol));
      const h = Math.max(o, c) * (1 + Math.abs(gauss(r)) * vol * 0.4), l = Math.min(o, c) * (1 - Math.abs(gauss(r)) * vol * 0.4);
      bars1m.push({ ts: t, open: o, high: h, low: l, close: c, volume: this.#volume(inst, r) });
      p = c;
    }
    // Daily bars for the minute-history days are aggregated from those minutes, so 1d and intraday agree.
    for (const b of bars1m) this.#rollDaily(bars1d, b.ts, b.open, b.high, b.low, b.close, b.volume);
    const st = { inst, vol, beta, r, bars1m, bars1d, oi: Math.round(1e6 + r() * 5e6) };
    this.#resetDay(st);
    this.state.set(key, st);
    return st;
  }
  #volume(inst, r) {
    if (inst.segment === 'IDX') return 0;
    const base = inst.segment === 'EQ' ? 20000 + (hash(inst.key) % 200000) : inst.segment === 'CUR' ? 5000 : 800;
    return Math.round(base * (0.4 + r() * 1.4));
  }
  #resetDay(st) {
    const dayStart = this.#istDayStart(this.now());
    const today = st.bars1m.filter((b) => b.ts >= dayStart);
    const before = st.bars1m.filter((b) => b.ts < dayStart);
    st.prevClose = before.length ? before[before.length - 1].close : st.bars1d[st.bars1d.length - 1].close;
    st.dayOpen = today[0]?.open ?? st.prevClose;
    st.dayKey = dayStart;
  }
  #istDayStart(ts) { const off = 330 * MIN; return Math.floor((ts + off) / DAY) * DAY - off; }

  #tick(st) {
    const now = this.now();
    const last = st.bars1m[st.bars1m.length - 1];
    const minute = Math.floor(now / MIN) * MIN;
    const step = 1 + st.beta * this.#marketFactor(now) * 0.3 + gauss(st.r) * st.vol * 0.35;
    const price = Math.max(0.01, last.close * step);
    if (minute > last.ts) {
      st.bars1m.push({ ts: minute, open: last.close, high: Math.max(last.close, price), low: Math.min(last.close, price), close: price, volume: this.#volume(st.inst, st.r) });
      if (st.bars1m.length > HIST_1M + 500) st.bars1m.splice(0, 500);
    } else {
      last.close = price; last.high = Math.max(last.high, price); last.low = Math.min(last.low, price);
      last.volume += Math.round(this.#volume(st.inst, st.r) * 0.05);
    }
    this.#rollDaily(st.bars1d, now, price, price, price, price, 0);
    if (this.#istDayStart(now) !== st.dayKey) this.#resetDay(st);
  }
  #rollDaily(bars1d, ts, o, h, l, c, v) {
    const day = this.#istDayStart(ts), last = bars1d[bars1d.length - 1];
    if (!last || last.ts < day) bars1d.push({ ts: day, open: o, high: h, low: l, close: c, volume: v });
    else { last.high = Math.max(last.high, h); last.low = Math.min(last.low, l); last.close = c; last.volume += v; }
  }

  #quoteFor(st) {
    const now = this.now();
    if (st.derived) {
      const u = this.#quoteFor(this.#ensure(st.derived));
      const exp = Date.parse(st.inst.expiry + 'T10:00:00Z');
      const T = Math.max(0, (exp - now) / (365 * DAY));
      const f = (x) => (x == null ? null : x * (1 + 0.07 * T));
      st.oi += Math.round(gauss(st.r) * 2000);
      return { key: st.inst.key, ltp: f(u.ltp), open: f(u.open), high: f(u.high), low: f(u.low), prevClose: f(u.prevClose),
        volume: Math.round((u.volume || 5e5) * 0.3), tradedValue: Math.round((u.volume || 5e5) * 0.3 * f(u.ltp)),
        oi: st.oi, oiChange: Math.round(st.oi * 0.02 * Math.sin(now / 9e6)), ts: now };
    }
    const today = st.bars1m.filter((b) => b.ts >= st.dayKey);
    const ltp = st.bars1m[st.bars1m.length - 1].close;
    const vol = today.reduce((a, b) => a + b.volume, 0);
    const val = today.reduce((a, b) => a + b.volume * (b.open + b.close) / 2, 0);
    const q = { key: st.inst.key, ltp, open: st.dayOpen, high: Math.max(...today.map((b) => b.high), ltp), low: Math.min(...today.map((b) => b.low), ltp),
      prevClose: st.prevClose, volume: vol, tradedValue: Math.round(val), ts: now };
    if (st.inst.segment === 'COM' || st.inst.segment === 'CUR') { q.oi = st.oi; q.oiChange = Math.round(st.oi * 0.01 * Math.sin(now / 7e6)); }
    return q;
  }

  async listInstruments() { return this.instruments.map((i) => ({ ...i })); }
  async getQuotes(keys) {
    const out = [];
    for (const k of keys) { const st = this.#ensure(k); if (!st) continue; if (!st.derived) this.#tick(st); out.push(this.#quoteFor(st)); }
    return out;
  }
  async getHistory(key, timeframe) {
    const st = this.#ensure(key); if (!st) return [];
    if (st.derived) {
      const u = this.#ensure(st.derived);
      const src = timeframe === '1d' ? u.bars1d : u.bars1m;
      const k = 1.004;
      return src.map((b) => ({ ts: b.ts, open: b.open * k, high: b.high * k, low: b.low * k, close: b.close * k, volume: Math.round((b.volume || 1000) * 0.3) }));
    }
    return (timeframe === '1d' ? st.bars1d : st.bars1m).map((b) => ({ ...b }));
  }
  async listExpiries(underlying) { void underlying; return this.weeklyExpiries(this.now(), 4); }
  async getOptionChain(underlying, expiry) {
    const uKey = underlying === 'NIFTY' ? 'IDX:NIFTY 50' : underlying === 'BANKNIFTY' ? 'IDX:NIFTY BANK' : `EQ:${underlying}`;
    const st = this.#ensure(uKey); if (!st) return null;
    const spot = st.bars1m[st.bars1m.length - 1].close;
    const exps = this.weeklyExpiries(this.now(), 4);
    const exp = exps.includes(expiry) ? expiry : exps[0];
    const T = Math.max(1 / 365, (Date.parse(exp + 'T10:00:00Z') - this.now()) / (365 * DAY));
    const step = underlying === 'NIFTY' ? 50 : underlying === 'BANKNIFTY' ? 100 : Math.max(5, Math.round(spot * 0.01 / 5) * 5);
    const atm = Math.round(spot / step) * step;
    const r = rng(hash(underlying + exp + Math.floor(this.now() / (5 * MIN))));
    const baseIv = underlying === 'BANKNIFTY' ? 0.15 : underlying === 'NIFTY' ? 0.12 : 0.24;
    const rows = [];
    for (let i = -12; i <= 12; i++) {
      const K = atm + i * step;
      const m = Math.log(K / spot);
      const row = { strike: K };
      for (const type of ['CE', 'PE']) {
        const iv = baseIv + 0.35 * m * m + (type === 'PE' ? -0.04 * m : 0.01 * m);
        const g = blackScholes({ S: spot, K, T, sigma: iv, type });
        const dist = Math.abs(i);
        const oi = Math.round((1 - dist / 14) * (6e6 + r() * 4e6) * (type === 'CE' ? (i > 0 ? 1.2 : 0.6) : (i < 0 ? 1.2 : 0.6)));
        row[type] = { ltp: Math.max(0.05, Math.round(g.price * 20) / 20), iv: iv * 100, oi: Math.max(0, oi), oiChange: Math.round(oi * (r() - 0.45) * 0.2),
          volume: Math.round(oi * (0.2 + r() * 0.6)), delta: g.delta, gamma: g.gamma, theta: g.theta, vega: g.vega, greeksSource: 'computed' };
      }
      rows.push(row);
    }
    return { underlying, spot, expiry: exp, expiries: exps, strikeStep: step, rows, ts: this.now() };
  }
}
