// Independent market-data service: ingestion → validation → normalization → storage → broadcast.
import { EventEmitter } from 'node:events';
import { normalizeQuote, validBar, aggregate } from './validate.js';
import { MarketCalendar, istDateKey } from './session.js';
import { TIMEFRAME_MINUTES } from '../shared/constants.js';

const SEGMENT_OF = { EQ: 'NSE_EQ', IDX: 'NSE_EQ', FUT: 'NSE_FO', OPT: 'NSE_FO', COM: 'MCX', CUR: 'NSE_CD' };

export class MarketDataService extends EventEmitter {
  constructor({ db, provider, config, log = console, now = () => Date.now() }) {
    super();
    this.db = db; this.provider = provider; this.cfg = config.market; this.log = log; this.now = now;
    this.calendar = new MarketCalendar(db.all('SELECT * FROM market_holidays'));
    this.instruments = new Map(); // id -> instrument row (+ key)
    this.byKey = new Map();
    this.quotes = new Map();      // id -> normalized quote + meta
    this.bars = new Map();        // id -> { '1m': [], '1d': [] }
    this.health = { provider: provider.name, dataStatus: provider.dataStatus, configured: provider.configured,
      connected: false, lastSuccessAt: null, lastErrorAt: null, lastError: null, consecutiveErrors: 0,
      rejectedQuotes: 0, acceptedQuotes: 0, stale: false };
    this.timer = null; this.backoffMs = 0;
  }

  get dataStatus() {
    if (!this.health.connected || this.health.stale) return 'UNAVAILABLE';
    return this.provider.dataStatus;
  }

  reloadHolidays() { this.calendar.setHolidays(this.db.all('SELECT * FROM market_holidays')); }

  async start() {
    try {
      await this.provider.connect();
      await this.syncInstruments();
      await this.backfill();
      this.health.connected = true;
      await this.poll();
    } catch (e) { this.#recordError('start', e); }
    this.#schedule();
  }
  stop() { clearTimeout(this.timer); this.timer = null; }

  #schedule() {
    const delay = this.cfg.pollMs + this.backoffMs;
    this.timer = setTimeout(async () => {
      try {
        if (!this.health.connected) { await this.provider.connect(); await this.syncInstruments(); await this.backfill(); this.health.connected = true; this.log.info?.('market feed reconnected'); }
        await this.poll();
      } catch (e) { this.#recordError('poll', e); }
      if (this.timer !== null) this.#schedule();
    }, delay);
    this.timer.unref?.();
  }

  #recordError(where, e) {
    this.health.lastErrorAt = new Date(this.now()).toISOString();
    this.health.lastError = e.message;
    this.health.consecutiveErrors++;
    this.backoffMs = Math.min(60000, 1000 * 2 ** Math.min(this.health.consecutiveErrors, 6));
    if (this.health.consecutiveErrors >= 3) this.health.connected = false;
    try { this.db.run('INSERT INTO error_logs (source, level, message, meta_json) VALUES (?,?,?,?)', 'market-data', 'error', `${where}: ${e.message}`, JSON.stringify({ provider: this.provider.name })); } catch {}
    this.log.warn?.(`[market] ${where} failed: ${e.message}`);
  }

  async syncInstruments() {
    const list = await this.provider.listInstruments();
    const upsert = `INSERT INTO instruments (symbol, exchange, segment, name, sector, category, lot_size, tick_size, expiry, strike, option_type, underlying, in_nifty50, in_banknifty)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(symbol, exchange, segment, expiry, strike, option_type) DO UPDATE SET name=excluded.name, sector=excluded.sector,
        category=excluded.category, lot_size=excluded.lot_size, tick_size=excluded.tick_size, in_nifty50=excluded.in_nifty50, in_banknifty=excluded.in_banknifty, active=1`;
    this.db.tx(() => {
      for (const i of list) {
        // SQLite treats NULLs as distinct in UNIQUE; use '' for absent expiry/option fields so upserts match.
        this.db.run(upsert, i.symbol, i.exchange, i.segment, i.name, i.sector ?? null, i.category ?? null, i.lotSize ?? null, i.tickSize ?? null,
          i.expiry ?? '', i.strike ?? 0, i.optionType ?? null, i.underlying ?? null, i.inNifty50 ? 1 : 0, i.inBankNifty ? 1 : 0);
      }
    });
    const keys = new Map(list.map((i) => [`${i.segment}|${i.symbol}|${i.expiry ?? ''}`, i.key]));
    this.instruments.clear(); this.byKey.clear();
    for (const row of this.db.all('SELECT * FROM instruments WHERE active = 1')) {
      const key = keys.get(`${row.segment}|${row.symbol}|${row.expiry ?? ''}`);
      if (!key) continue;
      const inst = { ...row, key, marketSegment: SEGMENT_OF[row.segment] };
      this.instruments.set(row.id, inst); this.byKey.set(key, inst);
    }
  }

  async backfill() {
    const insert = 'INSERT OR IGNORE INTO price_bars (instrument_id, timeframe, ts_ms, open, high, low, close, volume, data_status, provider) VALUES (?,?,?,?,?,?,?,?,?,?)';
    for (const inst of this.instruments.values()) {
      const entry = { '1m': [], '1d': [] };
      for (const tf of ['1m', '1d']) {
        const bars = (await this.provider.getHistory(inst.key, tf)).filter(validBar);
        entry[tf] = bars;
        // Persist history for live/delayed providers; demo bars are regenerated, so they are not written.
        if (this.provider.dataStatus !== 'DEMO' && bars.length) {
          this.db.tx(() => { for (const b of bars) this.db.run(insert, inst.id, tf, b.ts, b.open, b.high, b.low, b.close, b.volume ?? 0, this.provider.dataStatus, this.provider.name); });
        }
      }
      this.bars.set(inst.id, entry);
    }
  }

  // Which segments should be polled right now?
  activeSegments() {
    const set = new Set();
    for (const seg of ['NSE_EQ', 'NSE_FO', 'NSE_CD', 'MCX']) {
      const s = this.sessionStatus(seg);
      if (s.monitoring) set.add(seg);
    }
    return set;
  }
  sessionStatus(segment = 'NSE_EQ') {
    const s = this.calendar.status(segment, new Date(this.now()), { monitorStart: this.cfg.monitorStart, monitorEnd: this.cfg.monitorEnd });
    if (this.provider.dataStatus === 'DEMO' && this.cfg.demoAlwaysOpen) return { ...s, demoOverride: true, monitoring: true, displayPhase: 'DEMO (always open)' };
    return s;
  }

  async poll() {
    const segs = this.activeSegments();
    const targets = [...this.instruments.values()].filter((i) => segs.has(i.marketSegment));
    if (!targets.length) { this.#checkStale(); return; }
    const raw = await this.provider.getQuotes(targets.map((i) => i.key));
    const now = this.now();
    const upsert = `INSERT INTO market_quotes (instrument_id, ltp, open, high, low, prev_close, volume, traded_value, oi, oi_change, iv, data_status, provider, source_ts, received_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(instrument_id) DO UPDATE SET ltp=excluded.ltp, open=excluded.open, high=excluded.high, low=excluded.low,
      prev_close=excluded.prev_close, volume=excluded.volume, traded_value=excluded.traded_value, oi=excluded.oi, oi_change=excluded.oi_change, iv=excluded.iv,
      data_status=excluded.data_status, provider=excluded.provider, source_ts=excluded.source_ts, received_at=excluded.received_at`;
    const updated = [];
    const recvIso = new Date(now).toISOString();
    this.db.tx(() => {
      for (const r of raw) {
        const inst = this.byKey.get(r.key);
        const v = normalizeQuote(r, { now });
        if (!inst || !v.ok) { this.health.rejectedQuotes++; continue; }
        const q = { ...v.quote, instrumentId: inst.id, dataStatus: this.provider.dataStatus, provider: this.provider.name, receivedAt: now };
        const prev = this.quotes.get(inst.id);
        if (prev && q.ts < prev.ts) { this.health.rejectedQuotes++; continue; } // out-of-order
        this.quotes.set(inst.id, q);
        this.#updateBars(inst, q, prev);
        this.db.run(upsert, inst.id, q.ltp, q.open, q.high, q.low, q.prevClose, q.volume, q.tradedValue, q.oi, q.oiChange, q.iv, q.dataStatus, q.provider, new Date(q.ts).toISOString(), recvIso);
        this.health.acceptedQuotes++;
        updated.push(inst.id);
      }
    });
    this.health.lastSuccessAt = recvIso;
    this.health.consecutiveErrors = 0; this.backoffMs = 0; this.health.connected = true;
    this.#checkStale();
    this.emit('quotes', updated);
  }

  // Maintain 1m bars from ticks and today's daily bar from the session OHLC in each validated quote.
  #updateBars(inst, q, prev) {
    let entry = this.bars.get(inst.id);
    if (!entry) { entry = { '1m': [], '1d': [] }; this.bars.set(inst.id, entry); }
    const IST = 330 * 60000, dayStart = Math.floor((q.ts + IST) / 86400000) * 86400000 - IST;
    const d = entry['1d'], lastD = d[d.length - 1];
    const todays = { ts: dayStart, open: q.open ?? q.ltp, high: Math.max(q.high ?? q.ltp, q.ltp), low: Math.min(q.low ?? q.ltp, q.ltp), close: q.ltp, volume: q.volume || 0 };
    if (!lastD || lastD.ts < dayStart) d.push(todays);
    else if (lastD.ts === dayStart) { lastD.high = Math.max(lastD.high, todays.high); lastD.low = Math.min(lastD.low, todays.low); lastD.close = q.ltp; if (q.volume) lastD.volume = q.volume; }
    if (this.provider.dataStatus === 'DEMO') {
      const arr = entry['1m'];
      const minute = Math.floor(q.ts / 60000) * 60000;
      const last = arr[arr.length - 1];
      if (!last || minute > last.ts) arr.push({ ts: minute, open: last?.close ?? q.ltp, high: q.ltp, low: q.ltp, close: q.ltp, volume: 0 });
      else { last.close = q.ltp; last.high = Math.max(last.high, q.ltp); last.low = Math.min(last.low, q.ltp); }
      if (arr.length > 3000) arr.splice(0, arr.length - 3000);
      return;
    }
    const arr = entry['1m'];
    const minute = Math.floor(q.ts / 60000) * 60000;
    const last = arr[arr.length - 1];
    const dVol = prev ? Math.max(0, q.volume - prev.volume) : 0;
    if (!last || minute > last.ts) {
      if (last) this.db.run('INSERT OR REPLACE INTO price_bars (instrument_id, timeframe, ts_ms, open, high, low, close, volume, data_status, provider) VALUES (?,?,?,?,?,?,?,?,?,?)',
        inst.id, '1m', last.ts, last.open, last.high, last.low, last.close, last.volume, this.provider.dataStatus, this.provider.name);
      arr.push({ ts: minute, open: q.ltp, high: q.ltp, low: q.ltp, close: q.ltp, volume: dVol });
    } else { last.close = q.ltp; last.high = Math.max(last.high, q.ltp); last.low = Math.min(last.low, q.ltp); last.volume += dVol; }
  }

  #checkStale() {
    const last = this.health.lastSuccessAt ? Date.parse(this.health.lastSuccessAt) : 0;
    const anyMonitoring = this.activeSegments().size > 0;
    this.health.stale = anyMonitoring && this.now() - last > this.cfg.staleAfterMs;
  }

  // ---------- Read API ----------
  instrument(idOrKey) { return typeof idOrKey === 'number' ? this.instruments.get(idOrKey) : this.byKey.get(idOrKey); }
  quoteView(inst) {
    const q = this.quotes.get(inst.id);
    const stale = !q || this.now() - q.receivedAt > this.cfg.staleAfterMs * 2 || this.health.stale;
    const status = !q ? 'UNAVAILABLE' : stale && q.dataStatus !== 'DEMO' ? 'UNAVAILABLE' : q.dataStatus;
    return {
      id: inst.id, symbol: inst.symbol, name: inst.name, segment: inst.segment, exchange: inst.exchange, sector: inst.sector,
      category: inst.category, expiry: inst.expiry || null, lotSize: inst.lot_size, underlying: inst.underlying,
      ltp: q?.ltp ?? null, open: q?.open ?? null, high: q?.high ?? null, low: q?.low ?? null, prevClose: q?.prevClose ?? null,
      change: q?.change ?? null, changePct: q?.changePct ?? null, volume: q?.volume ?? null, tradedValue: q?.tradedValue ?? null,
      oi: q?.oi ?? null, oiChange: q?.oiChange ?? null,
      timestamp: q ? new Date(q.ts).toISOString() : null, dataStatus: status, provider: q?.provider ?? this.provider.name,
    };
  }
  bars1(inst, timeframe = '15m', limit = 300) {
    const entry = this.bars.get(inst.id); if (!entry) return [];
    if (timeframe === '1d') return entry['1d'].slice(-limit);
    const mins = TIMEFRAME_MINUTES[timeframe] || 15;
    return aggregate(entry['1m'], mins).slice(-limit);
  }
  list(category, segment) {
    return [...this.instruments.values()].filter((i) => (!category || i.category === category) && (!segment || i.segment === segment));
  }
  equities() { return this.list(null, 'EQ'); }

  topBy(field, n = 10) {
    return this.equities().map((i) => this.quoteView(i)).filter((q) => q.ltp != null && q.dataStatus !== 'UNAVAILABLE')
      .sort((a, b) => (b[field] ?? 0) - (a[field] ?? 0)).slice(0, n)
      .map((q) => {
        const bars = this.bars1(this.instrument(q.id), '5m', 13);
        const recent = bars.slice(-1)[0]?.volume ?? 0;
        const avg = bars.slice(0, -1).reduce((a, b) => a + b.volume, 0) / Math.max(1, bars.length - 1);
        return { ...q, direction: q.changePct > 0.15 ? 'UP' : q.changePct < -0.15 ? 'DOWN' : 'FLAT', volumeMovement: avg ? recent / avg : null };
      });
  }

  overview() {
    const idx = this.list(null, 'IDX').map((i) => this.quoteView(i));
    const eq = this.equities().map((i) => this.quoteView(i)).filter((q) => q.changePct != null);
    const adv = eq.filter((q) => q.changePct > 0).length, dec = eq.filter((q) => q.changePct < 0).length;
    const sectors = {};
    for (const q of eq) { (sectors[q.sector] ||= []).push(q.changePct); }
    const sectorPerf = Object.entries(sectors).map(([sector, arr]) => ({ sector, changePct: arr.reduce((a, b) => a + b, 0) / arr.length, count: arr.length }))
      .sort((a, b) => b.changePct - a.changePct);
    const vix = idx.find((q) => q.symbol === 'INDIA VIX');
    const nifty = idx.find((q) => q.symbol === 'NIFTY 50');
    const breadth = adv + dec ? adv / (adv + dec) : null;
    // Sentiment is a transparent composite: breadth (60%) + NIFTY direction (40%), scaled −100…+100.
    let sentiment = null;
    if (breadth != null && nifty?.changePct != null) {
      const s = (breadth - 0.5) * 2 * 60 + Math.max(-1, Math.min(1, nifty.changePct / 1)) * 40;
      sentiment = { score: Math.round(s), label: s > 25 ? 'Bullish' : s > 8 ? 'Mildly bullish' : s < -25 ? 'Bearish' : s < -8 ? 'Mildly bearish' : 'Neutral',
        method: 'Composite of advance/decline breadth (60%) and NIFTY 50 % change (40%), range −100 to +100.' };
    }
    return {
      indices: idx.filter((q) => q.symbol !== 'INDIA VIX'), vix, sectors: sectorPerf,
      breadth: { advancers: adv, decliners: dec, unchanged: eq.length - adv - dec, ratio: dec ? adv / dec : null, pctAdvancing: breadth },
      sentiment, session: this.sessionStatus('NSE_EQ'), dataStatus: this.dataStatus, provider: this.provider.name,
      asOf: this.health.lastSuccessAt,
    };
  }

  sessionKey() { return (b) => istDateKey(b.ts); }
}
