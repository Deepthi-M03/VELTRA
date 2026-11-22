// Orchestrates scanners, recommendation lifecycle, AI analysis, price alerts and market notifications.
import { evaluate, trackStatus, DEFAULT_RULES, RULE_SET_VERSION } from '../../../../packages/market-engine/recommend.js';
import { computeAll, chartSeries } from '../../../../packages/market-engine/indicators.js';
import { chainStats } from '../../../../packages/market-engine/options-math.js';

const HORIZON_TF = { intraday: '15m', delivery: '1d', positional: '1h' };

export class Intelligence {
  constructor({ db, market, ai, notifier, errors, log = console }) {
    this.db = db; this.market = market; this.ai = ai; this.notifier = notifier; this.errors = errors; this.log = log;
    this.lastScanAt = null; this.lastMarketPhase = null; this.moveNotified = new Set();
  }

  rules() {
    const row = this.db.get(`SELECT settings_json FROM provider_configs WHERE kind = 'market' AND name = 'rules'`);
    return row ? { ...DEFAULT_RULES, ...JSON.parse(row.settings_json) } : DEFAULT_RULES;
  }
  setRules(patch) {
    const merged = { ...this.rules(), ...patch };
    this.db.run(`INSERT INTO provider_configs (kind, name, enabled, settings_json) VALUES ('market','rules',1,?)
      ON CONFLICT(kind, name) DO UPDATE SET settings_json = excluded.settings_json, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`, JSON.stringify(merged));
    return merged;
  }

  benchmarkCloses(tf) {
    const n = this.market.instrument('IDX:NIFTY 50');
    return n ? this.market.bars1(n, tf, 400).map((b) => b.close) : undefined;
  }

  scanTargets() {
    const m = this.market;
    return [
      ...m.equities().flatMap((i) => [{ inst: i, category: 'equity', horizon: 'intraday' }, { inst: i, category: 'equity', horizon: 'delivery' }]),
      ...m.list('futures').map((i) => ({ inst: i, category: 'futures', horizon: 'intraday' })),
      ...m.list('commodity').map((i) => ({ inst: i, category: 'commodity', horizon: 'intraday' })),
      ...m.list('currency').map((i) => ({ inst: i, category: 'currency', horizon: 'intraday' })),
    ];
  }

  // Run screens and persist newly-qualified setups. Never more than one open/entered reco per instrument+horizon.
  async scan() {
    if (this.market.dataStatus === 'UNAVAILABLE') return { created: 0, skipped: 'data unavailable' };
    const rules = this.rules();
    let created = 0;
    const benches = {};
    for (const { inst, category, horizon } of this.scanTargets()) {
      try {
        const tf = HORIZON_TF[horizon];
        const bars = this.market.bars1(inst, tf, 400);
        benches[tf] ||= this.benchmarkCloses(tf);
        const r = evaluate(bars, { horizon, rules, tick: inst.tick_size || 0.05, sessionKey: this.market.sessionKey(),
          benchmarkCloses: inst.segment === 'EQ' ? benches[tf] : undefined });
        if (!r.qualified) continue;
        const exists = this.db.get(`SELECT id FROM recommendations WHERE instrument_id = ? AND horizon = ? AND status IN ('open','entered','target1_hit')`, inst.id, horizon);
        if (exists) continue;
        const now = Date.now();
        const expires = new Date(now + rules.expiryHours[horizon] * 3600000).toISOString();
        const q = this.market.quoteView(inst);
        const ins = this.db.run(`INSERT INTO recommendations (instrument_id, category, horizon, direction, entry_low, entry_high, stop_loss, target1, target2, support, resistance,
          risk_reward, score, confidence_json, technical_json, data_status, provider, rule_set_version, created_at, expires_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        inst.id, category, horizon, r.direction, r.entryLow, r.entryHigh, r.stopLoss, r.target1, r.target2, r.support, r.resistance,
        r.riskReward, r.score, JSON.stringify(r.confidence), JSON.stringify(r.indicators), q.dataStatus, q.provider, RULE_SET_VERSION, new Date(now).toISOString(), expires);
        const recoId = Number(ins.lastInsertRowid);
        this.db.run('INSERT INTO recommendation_events (recommendation_id, event, price, at) VALUES (?,?,?,?)', recoId, 'created', q.ltp, new Date(now).toISOString());
        await this.ai.analyze({ kind: 'recommendation', instrumentId: inst.id, recommendationId: recoId, useModel: false,
          inputs: this.#aiInputs(inst, r.indicators, q, { direction: r.direction, horizon, score: r.score, entryLow: r.entryLow, entryHigh: r.entryHigh, stopLoss: r.stopLoss, target1: r.target1, target2: r.target2, riskReward: r.riskReward }) });
        created++;
      } catch (e) { this.errors.record('scanner', e, { instrument: inst.key }); }
    }
    this.lastScanAt = new Date().toISOString();
    return { created };
  }

  #aiInputs(inst, ind, q, reco, reason) {
    const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] != null).map((k) => [k, Math.round(o[k] * 10000) / 10000]));
    return { symbol: inst.symbol, name: inst.name, segment: inst.segment, dataStatus: q.dataStatus, asOf: q.timestamp,
      indicators: pick(ind, ['close', 'ema9', 'ema20', 'ema50', 'sma20', 'rsi14', 'macd', 'macdSignal', 'macdHist', 'macdHistPrev', 'vwap', 'bbUpper', 'bbMid', 'bbLower', 'atr14', 'atrPct', 'volumeRatio', 'roc10', 'support', 'resistance', 'relativeStrength20']),
      quote: pick(q, ['ltp', 'changePct', 'high', 'low', 'prevClose']), recommendation: reco || null, reason };
  }

  // Lifecycle tracking — never deletes; every transition is an event.
  track() {
    const open = this.db.all(`SELECT * FROM recommendations WHERE status IN ('open','entered','target1_hit')`);
    for (const r of open) {
      const inst = this.market.instrument(r.instrument_id); if (!inst) continue;
      const q = this.market.quoteView(inst); if (q.ltp == null || q.dataStatus === 'UNAVAILABLE') continue;
      const next = trackStatus(r, q.ltp);
      if (!next) continue;
      const now = new Date().toISOString();
      const closing = ['stopped', 'target2_hit', 'expired'].includes(next);
      this.db.run(`UPDATE recommendations SET status = ?, entered_at = COALESCE(entered_at, CASE WHEN ? = 'entered' THEN ? END), closed_at = CASE WHEN ? THEN ? ELSE closed_at END, exit_price = CASE WHEN ? THEN ? ELSE exit_price END WHERE id = ?`,
        next, next, now, closing ? 1 : 0, now, closing ? 1 : 0, q.ltp, r.id);
      this.db.run('INSERT INTO recommendation_events (recommendation_id, event, price, at) VALUES (?,?,?,?)', r.id, next, q.ltp, now);
      if (next !== 'entered') {
        const subs = this.db.all(`SELECT DISTINCT user_id FROM subscriptions WHERE category = ? AND status = 'active' AND ends_at > ?`, r.category, now);
        for (const s of subs) this.notifier.notify(s.user_id, 'recommendation', `${inst.symbol}: ${next.replace('_', ' ')}`, `${r.direction} ${r.horizon} setup moved to ${next.replace('_', ' ')} at ${q.ltp.toFixed(2)} (${q.dataStatus}).`, `/app/studio/${inst.id}`);
      }
    }
  }

  evaluateAlerts() {
    const alerts = this.db.all(`SELECT * FROM price_alerts WHERE status = 'active'`);
    for (const a of alerts) {
      const inst = this.market.instrument(a.instrument_id); if (!inst) continue;
      const q = this.market.quoteView(inst); if (q.ltp == null || q.dataStatus === 'UNAVAILABLE') continue;
      const hit = a.condition === 'above' ? q.ltp >= a.value : a.condition === 'below' ? q.ltp <= a.value
        : a.condition === 'pct_change_above' ? q.changePct >= a.value : q.changePct <= a.value;
      if (!hit) continue;
      this.db.run(`UPDATE price_alerts SET status = 'triggered', triggered_at = ?, triggered_price = ? WHERE id = ? AND status = 'active'`, new Date().toISOString(), q.ltp, a.id);
      const label = { above: `rose to ${q.ltp.toFixed(2)} (≥ ${a.value})`, below: `fell to ${q.ltp.toFixed(2)} (≤ ${a.value})`, pct_change_above: `is up ${q.changePct.toFixed(2)}%`, pct_change_below: `is down ${q.changePct.toFixed(2)}%` }[a.condition];
      this.notifier.notify(a.user_id, 'price_alert', `${inst.symbol} alert`, `${inst.symbol} ${label}. Data: ${q.dataStatus}.`, `/app/studio/${inst.id}`);
    }
  }

  marketEvents() {
    const s = this.market.sessionStatus('NSE_EQ');
    const phase = s.demoOverride ? 'DEMO' : s.phase;
    if (this.lastMarketPhase && this.lastMarketPhase !== 'OPEN' && phase === 'OPEN') this.notifier.broadcast('market_open', 'NSE market is open', `Regular session ${s.open}–${s.close} IST.`, '/app');
    this.lastMarketPhase = phase;
    for (const sym of ['IDX:NIFTY 50', 'IDX:NIFTY BANK']) {
      const inst = this.market.instrument(sym); if (!inst) continue;
      const q = this.market.quoteView(inst);
      if (q.changePct == null) continue;
      const bucket = Math.trunc(q.changePct); // notify at each whole-percent threshold crossed
      const key = `${s.istDate}:${sym}:${bucket}`;
      if (Math.abs(bucket) >= 1 && !this.moveNotified.has(key)) {
        this.moveNotified.add(key);
        this.notifier.broadcast('market_move', `${inst.name} ${q.changePct > 0 ? 'up' : 'down'} ${Math.abs(q.changePct).toFixed(2)}%`, `${inst.name} at ${q.ltp.toFixed(2)} (${q.dataStatus}).`, '/app');
      }
    }
  }

  // ---------- read models ----------
  recoView(r) {
    const inst = this.market.instrument(r.instrument_id) || this.db.get('SELECT * FROM instruments WHERE id = ?', r.instrument_id);
    const ai = this.db.get('SELECT id, provider, narrative, findings_json, created_at FROM ai_analyses WHERE recommendation_id = ? ORDER BY id DESC LIMIT 1', r.id);
    const conf = JSON.parse(r.confidence_json);
    return { id: r.id, instrumentId: r.instrument_id, symbol: inst?.symbol, name: inst?.name, category: r.category, horizon: r.horizon, direction: r.direction,
      entryLow: r.entry_low, entryHigh: r.entry_high, stopLoss: r.stop_loss, target1: r.target1, target2: r.target2, support: r.support, resistance: r.resistance,
      riskReward: r.risk_reward, score: r.score, confidence: conf, technical: JSON.parse(r.technical_json), status: r.status, dataStatus: r.data_status, provider: r.provider,
      ruleSet: r.rule_set_version, createdAt: r.created_at, expiresAt: r.expires_at, enteredAt: r.entered_at, closedAt: r.closed_at, exitPrice: r.exit_price,
      technicalExplanation: Object.values(conf.factors || {}).map((f) => f.detail).join('; '),
      ai: ai && { id: ai.id, provider: ai.provider, narrative: ai.narrative, findings: JSON.parse(ai.findings_json).findings, createdAt: ai.created_at } };
  }
  recommendations({ category, status = 'active', horizon, limit = 50 }) {
    const st = status === 'active' ? `('open','entered','target1_hit')` : status === 'closed' ? `('target2_hit','stopped','expired')` : `('open','entered','target1_hit','target2_hit','stopped','expired')`;
    const rows = this.db.all(`SELECT * FROM recommendations WHERE status IN ${st} AND (? IS NULL OR category = ?) AND (? IS NULL OR horizon = ?) ORDER BY created_at DESC LIMIT ?`,
      category ?? null, category ?? null, horizon ?? null, horizon ?? null, limit);
    return rows.map((r) => this.recoView(r));
  }

  performance({ category } = {}) {
    const rows = this.db.all(`SELECT r.*, (SELECT COUNT(*) FROM recommendation_events e WHERE e.recommendation_id = r.id AND e.event = 'target1_hit') AS t1
      FROM recommendations r WHERE (? IS NULL OR category = ?)`, category ?? null, category ?? null);
    const closed = rows.filter((r) => ['target2_hit', 'stopped', 'expired'].includes(r.status));
    const entered = closed.filter((r) => r.entered_at);
    const pnlPct = (r) => (r.exit_price == null ? null : ((r.direction === 'LONG' ? r.exit_price - (r.entry_low + r.entry_high) / 2 : (r.entry_low + r.entry_high) / 2 - r.exit_price) / ((r.entry_low + r.entry_high) / 2)) * 100);
    const results = entered.map(pnlPct).filter((x) => x != null);
    const wins = results.filter((x) => x > 0).length;
    const by = (k) => Object.entries(rows.reduce((acc, r) => { (acc[r[k]] ||= []).push(r); return acc; }, {})).map(([key, arr]) => ({ key, total: arr.length,
      target1: arr.filter((r) => r.t1 > 0 || r.status === 'target2_hit').length, target2: arr.filter((r) => r.status === 'target2_hit').length,
      stopped: arr.filter((r) => r.status === 'stopped').length, expired: arr.filter((r) => r.status === 'expired').length, open: arr.filter((r) => ['open', 'entered', 'target1_hit'].includes(r.status)).length }));
    return {
      total: rows.length, open: rows.filter((r) => ['open', 'entered', 'target1_hit'].includes(r.status)).length, closed: closed.length,
      neverEntered: closed.filter((r) => !r.entered_at).length,
      target1Hit: rows.filter((r) => r.t1 > 0 || r.status === 'target2_hit').length, target2Hit: rows.filter((r) => r.status === 'target2_hit').length,
      stopped: rows.filter((r) => r.status === 'stopped').length, expired: rows.filter((r) => r.status === 'expired').length,
      winRate: results.length ? wins / results.length : null, avgReturnPct: results.length ? results.reduce((a, b) => a + b, 0) / results.length : null,
      avgRiskReward: rows.length ? rows.reduce((a, r) => a + r.risk_reward, 0) / rows.length : null,
      byCategory: by('category'), byHorizon: by('horizon'),
      dataStatusMix: Object.fromEntries(Object.entries(rows.reduce((a, r) => { a[r.data_status] = (a[r.data_status] || 0) + 1; return a; }, {}))),
      note: 'All recommendations are retained, including losses and expired setups. Results are simulated from recorded price levels, not executed trades.',
    };
  }

  // Full Studio payload for an instrument.
  async studio(inst, timeframe = '15m', { withAi = true, includeReco = true } = {}) {
    const bars = this.market.bars1(inst, timeframe, 400);
    const q = this.market.quoteView(inst);
    const series = chartSeries(bars, this.market.sessionKey());
    const ind = bars.length >= 30 ? computeAll(bars, { sessionKey: this.market.sessionKey(), benchmark: inst.segment === 'EQ' ? this.benchmarkCloses(timeframe) : undefined }) : null;
    const reco = this.db.get(`SELECT * FROM recommendations WHERE instrument_id = ? AND status IN ('open','entered','target1_hit') ORDER BY created_at DESC LIMIT 1`, inst.id);
    const recoView = reco && includeReco ? this.recoView(reco) : null;
    const recommendationLocked = !!reco && !includeReco;
    let analysis = null;
    if (withAi && ind) {
      const cached = this.db.get(`SELECT * FROM ai_analyses WHERE instrument_id = ? AND kind = 'instrument' AND created_at > ? ORDER BY id DESC LIMIT 1`, inst.id, new Date(Date.now() - 5 * 60000).toISOString());
      const inputs = this.#aiInputs(inst, ind, q, recoView && { direction: recoView.direction, horizon: recoView.horizon, score: recoView.score, entryLow: recoView.entryLow, entryHigh: recoView.entryHigh, stopLoss: recoView.stopLoss, target1: recoView.target1, target2: recoView.target2, riskReward: recoView.riskReward },
        recoView ? undefined : 'no active setup meets the screening rules');
      if (recommendationLocked) inputs.reason = 'setup details require a subscription to this category';
      if (cached && JSON.parse(cached.inputs_json).recommendation?.entryLow === inputs.recommendation?.entryLow) {
        const f = JSON.parse(cached.findings_json);
        analysis = { id: cached.id, provider: cached.provider, narrative: cached.narrative, findings: f.findings, risks: f.risks, narrativeIsModelGenerated: cached.provider !== 'deterministic', guardrail: JSON.parse(cached.guardrail_json), inputs: JSON.parse(cached.inputs_json), createdAt: cached.created_at };
      } else analysis = await this.ai.analyze({ kind: 'instrument', instrumentId: inst.id, inputs });
    }
    return { instrument: q, timeframe, bars, series, indicators: ind, recommendation: recoView, recommendationLocked, analysis };
  }

  async optionChain(underlying, expiry) {
    const chain = await this.market.provider.getOptionChain(underlying, expiry);
    if (!chain) return null;
    const stats = chainStats(chain.rows);
    const atm = chain.rows.reduce((a, r) => (Math.abs(r.strike - chain.spot) < Math.abs(a.strike - chain.spot) ? r : a), chain.rows[0]);
    // Directional bias from OI structure + PCR; levels are the OI walls.
    const bias = stats.pcr == null ? 'NEUTRAL' : stats.pcr > 1.2 ? 'BULLISH' : stats.pcr < 0.8 ? 'BEARISH' : 'NEUTRAL';
    let setup = null;
    if (bias !== 'NEUTRAL' && atm) {
      const leg = bias === 'BULLISH' ? atm.CE : atm.PE;
      const prem = leg.ltp;
      setup = { instrument: `${underlying} ${atm.strike} ${bias === 'BULLISH' ? 'CE' : 'PE'}`, strike: atm.strike, optionType: bias === 'BULLISH' ? 'CE' : 'PE',
        entry: prem, stopLoss: Math.round(prem * 0.7 * 20) / 20, target1: Math.round(prem * 1.45 * 20) / 20, target2: Math.round(prem * 1.75 * 20) / 20, riskReward: 1.5,
        method: 'ATM option in the direction of the OI/PCR bias; stop at 30% premium loss, targets at +45% / +75% premium (1.5R / 2.5R).',
        reasoning: `PCR ${stats.pcr.toFixed(2)} (${bias.toLowerCase()} positioning); OI support ${stats.oiSupport}, OI resistance ${stats.oiResistance}, max pain ${stats.maxPain}.` };
    }
    return { ...chain, stats, bias, setup, dataStatus: this.market.provider.dataStatus === 'DEMO' ? 'DEMO' : this.market.dataStatus };
  }
}
