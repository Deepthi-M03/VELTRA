import { t, validate } from '../http/validate.js';
import { notFound, HttpError } from '../http/core.js';
import { CATEGORY_IDS, TIMEFRAMES } from '../../../../packages/shared/constants.js';
import { computeAll, chartSeries } from '../../../../packages/market-engine/indicators.js';

export default function marketRoutes(r, { requireAuth }) {
  r.get('/api/market/status', async (req, res, ctx) => ({
    dataStatus: ctx.market.dataStatus, provider: ctx.market.provider.name,
    sessions: ['NSE_EQ', 'NSE_FO', 'NSE_CD', 'MCX'].map((s) => ctx.market.sessionStatus(s)),
    lastUpdate: ctx.market.health.lastSuccessAt, stale: ctx.market.health.stale,
  }));

  // Public teaser for the homepage — clearly labelled with its data status.
  r.get('/api/market/preview', async (req, res, ctx) => {
    const o = ctx.market.overview();
    return { indices: o.indices.slice(0, 4), dataStatus: o.dataStatus, asOf: o.asOf, top: ctx.market.topBy('tradedValue', 5) };
  });

  // Public chart demo: limited to indices and the current top-5 by value, always labelled.
  r.get('/api/market/preview/:id/bars', async (req, res, ctx) => {
    const id = Number(req.params.id);
    const allowed = new Set([...ctx.market.list(null, 'IDX').map((i) => i.id), ...ctx.market.topBy('tradedValue', 5).map((q) => q.id)]);
    const inst = allowed.has(id) && ctx.market.instrument(id);
    if (!inst) throw notFound('Not available in the public preview');
    const bars = ctx.market.bars1(inst, '15m', 120);
    const ind = bars.length > 60 ? computeAll(bars, { sessionKey: ctx.market.sessionKey() }) : null;
    return { quote: ctx.market.quoteView(inst), bars, ema20: chartSeries(bars).ema20, indicators: ind && { rsi14: ind.rsi14, ema20: ind.ema20, ema50: ind.ema50, macdHist: ind.macdHist, volumeRatio: ind.volumeRatio, atrPct: ind.atrPct } };
  });

  r.get('/api/market/overview', requireAuth, async (req, res, ctx) => ctx.market.overview());
  r.get('/api/market/top-volume', requireAuth, async (req, res, ctx) => ({ rows: ctx.market.topBy('volume', 10), dataStatus: ctx.market.dataStatus, asOf: ctx.market.health.lastSuccessAt }));
  r.get('/api/market/top-value', requireAuth, async (req, res, ctx) => ({ rows: ctx.market.topBy('tradedValue', 10), dataStatus: ctx.market.dataStatus, asOf: ctx.market.health.lastSuccessAt }));

  r.get('/api/instruments', requireAuth, async (req, res, ctx) => {
    const q = validate({ category: t.enum(CATEGORY_IDS, { optional: true }), segment: t.string({ optional: true, max: 5 }), search: t.string({ optional: true, max: 40 }) }, req.query);
    let list = ctx.market.list(q.category === 'options' ? 'equity' : q.category, q.segment);
    if (q.search) { const s = q.search.toUpperCase(); list = list.filter((i) => i.symbol.toUpperCase().includes(s) || i.name.toUpperCase().includes(s)); }
    return { rows: list.slice(0, 200).map((i) => ctx.market.quoteView(i)), dataStatus: ctx.market.dataStatus };
  });

  r.get('/api/instruments/:id/bars', requireAuth, async (req, res, ctx) => {
    const inst = ctx.market.instrument(Number(req.params.id)); if (!inst) throw notFound('Instrument not found');
    const q = validate({ timeframe: t.enum(TIMEFRAMES, { optional: true, default: '15m' }), limit: t.int({ optional: true, default: 300, min: 10, max: 1000 }) }, req.query);
    return { bars: ctx.market.bars1(inst, q.timeframe, q.limit), quote: ctx.market.quoteView(inst) };
  });

  // AI Trade Studio: chart + indicators + setup + AI analysis. Setup levels require the category subscription.
  r.get('/api/studio/:id', requireAuth, async (req, res, ctx) => {
    const inst = ctx.market.instrument(Number(req.params.id)); if (!inst) throw notFound('Instrument not found');
    const q = validate({ timeframe: t.enum(TIMEFRAMES, { optional: true, default: '15m' }) }, req.query);
    const cat = inst.category === 'equity' && inst.segment === 'IDX' ? 'equity' : inst.category;
    return ctx.intel.studio(inst, q.timeframe, { includeReco: ctx.subs.hasAccess(req.user, cat) });
  });

  r.get('/api/intel/:category/recommendations', requireAuth, async (req, res, ctx) => {
    const cat = req.params.category;
    if (!CATEGORY_IDS.includes(cat) || cat === 'options') throw notFound();
    const q = validate({ status: t.enum(['active', 'closed', 'all'], { optional: true, default: 'active' }), horizon: t.enum(['intraday', 'delivery', 'positional'], { optional: true }) }, req.query);
    const access = ctx.subs.hasAccess(req.user, cat);
    const rows = ctx.intel.recommendations({ category: cat, status: q.status, horizon: q.horizon });
    // Unsubscribed users see that setups exist (symbol/direction), but not the levels or analysis.
    return { access, dataStatus: ctx.market.dataStatus, rows: access ? rows : rows.map((x) => ({ id: x.id, instrumentId: x.instrumentId, symbol: x.symbol, name: x.name, horizon: x.horizon, status: x.status, createdAt: x.createdAt, locked: true })) };
  });

  r.get('/api/intel/:category/universe', requireAuth, async (req, res, ctx) => {
    const cat = req.params.category;
    if (!CATEGORY_IDS.includes(cat)) throw notFound();
    const q = validate({ index: t.enum(['nifty50', 'banknifty', 'all'], { optional: true, default: 'all' }) }, req.query);
    let list = cat === 'options' ? [] : ctx.market.list(cat);
    if (cat === 'equity') list = list.filter((i) => i.segment === 'EQ' && (q.index === 'all' || (q.index === 'nifty50' ? i.in_nifty50 : i.in_banknifty)));
    return { rows: list.map((i) => ctx.market.quoteView(i)), dataStatus: ctx.market.dataStatus };
  });

  r.get('/api/intel/options/underlyings', requireAuth, async (req, res, ctx) => ({ rows: ['NIFTY', 'BANKNIFTY', 'RELIANCE', 'HDFCBANK', 'ICICIBANK', 'INFY', 'TCS', 'SBIN'] }));
  r.get('/api/intel/options/chain', requireAuth, async (req, res, ctx) => {
    const q = validate({ underlying: t.string({ max: 20, pattern: /^[A-Z&-]+$/ }), expiry: t.string({ optional: true, pattern: /^\d{4}-\d{2}-\d{2}$/ }) }, req.query);
    const chain = await ctx.intel.optionChain(q.underlying, q.expiry);
    if (!chain) throw new HttpError(503, 'Option chain unavailable from the configured provider.');
    if (!ctx.subs.hasAccess(req.user, 'options')) { chain.setup = null; chain.setupLocked = true; }
    return chain;
  });

  r.get('/api/performance', requireAuth, async (req, res, ctx) => {
    const q = validate({ category: t.enum(CATEGORY_IDS, { optional: true }) }, req.query);
    return { ...ctx.intel.performance(q), recent: ctx.intel.recommendations({ category: q.category, status: 'closed', limit: 30 }).map((x) => ({ id: x.id, symbol: x.symbol, category: x.category, horizon: x.horizon, direction: x.direction, status: x.status, entryLow: x.entryLow, entryHigh: x.entryHigh, stopLoss: x.stopLoss, target1: x.target1, exitPrice: x.exitPrice, createdAt: x.createdAt, closedAt: x.closedAt, dataStatus: x.dataStatus })) };
  });
}
