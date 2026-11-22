// Generic adapter for a licensed market-data vendor or broker API that exposes (or is proxied to)
// the normalized JSON contract below. Point MARKET_FEED_URL at your vendor bridge.
//
//   GET  {base}/instruments                         -> { instruments: NormalizedInstrument[] }
//   POST {base}/quotes        body {keys: string[]} -> { quotes: NormalizedQuote[] }
//   GET  {base}/history?key=&timeframe=&from=&to=   -> { bars: NormalizedBar[] }
//   GET  {base}/expiries?underlying=                -> { expiries: string[] }
//   GET  {base}/option-chain?underlying=&expiry=    -> { spot, expiry, rows: [{strike, CE:{ltp,oi,oiChange,volume,iv,delta?...}, PE:{...}}] }
//
// Authorization: Bearer MARKET_FEED_API_KEY. Requests time out after 8 s.
// Most Indian broker APIs (WebSocket tick feeds) need a thin bridge that maps their messages to this
// contract — see SETUP.md "Connecting a licensed market-data provider".
import { MarketDataProvider, ProviderUnavailableError } from './base.js';

export class HttpFeedProvider extends MarketDataProvider {
  constructor({ feedUrl, feedApiKey, feedIsDelayed }) {
    super();
    this.base = (feedUrl || '').replace(/\/$/, '');
    this.key = feedApiKey;
    this.delayed = !!feedIsDelayed;
  }
  get name() { return 'http-feed'; }
  get dataStatus() { return this.delayed ? 'DELAYED' : 'LIVE'; }
  get configured() { return !!(this.base && this.key); }

  async #req(path, { method = 'GET', body } = {}) {
    if (!this.configured) throw new ProviderUnavailableError('Market feed not configured (MARKET_FEED_URL / MARKET_FEED_API_KEY).');
    const ctrl = AbortSignal.timeout(8000);
    const res = await fetch(this.base + path, {
      method, signal: ctrl,
      headers: { authorization: `Bearer ${this.key}`, 'content-type': 'application/json', accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new ProviderUnavailableError(`Feed HTTP ${res.status} on ${path}`);
    return res.json();
  }
  async connect() { if (!this.configured) throw new ProviderUnavailableError('Market feed not configured.'); }
  async listInstruments() { return (await this.#req('/instruments')).instruments || []; }
  async getQuotes(keys) { return (await this.#req('/quotes', { method: 'POST', body: { keys } })).quotes || []; }
  async getHistory(key, timeframe, { from, to } = {}) {
    const q = new URLSearchParams({ key, timeframe, from: String(from ?? ''), to: String(to ?? '') });
    return (await this.#req(`/history?${q}`)).bars || [];
  }
  async listExpiries(underlying) { return (await this.#req(`/expiries?underlying=${encodeURIComponent(underlying)}`)).expiries || []; }
  async getOptionChain(underlying, expiry) {
    return this.#req(`/option-chain?underlying=${encodeURIComponent(underlying)}&expiry=${encodeURIComponent(expiry || '')}`);
  }
}
