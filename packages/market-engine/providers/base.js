// Market-data provider contract. Any licensed vendor/broker feed is integrated by implementing this
// interface in a new file and registering it in providers/index.js. Nothing else in the app changes.
//
// Normalized instrument: { key, symbol, exchange, segment, name, sector, category, lotSize, tickSize,
//                          expiry, strike, optionType, underlying, inNifty50, inBankNifty }
//   key format: "<segment>:<symbol>" or "<segment>:<symbol>:<expiry>" for derivatives.
// Normalized quote: { key, ltp, open, high, low, prevClose, volume, tradedValue, oi, oiChange, iv, ts }
//   ts = provider/exchange timestamp in epoch ms.
// Normalized bar: { ts, open, high, low, close, volume }  (ts = bar start, epoch ms)

export class MarketDataProvider {
  /** @returns {'LIVE'|'DELAYED'|'DEMO'} */
  get dataStatus() { throw new Error('not implemented'); }
  get name() { throw new Error('not implemented'); }
  /** true if the provider is configured with credentials / endpoint */
  get configured() { return false; }
  async connect() {}
  async disconnect() {}
  async listInstruments() { return []; }
  async getQuotes(_keys) { return []; }
  async getHistory(_key, _timeframe, _opts) { return []; }
  async getOptionChain(_underlying, _expiry) { return null; }
  async listExpiries(_underlying) { return []; }
}

export class ProviderUnavailableError extends Error {
  constructor(msg) { super(msg); this.code = 'PROVIDER_UNAVAILABLE'; }
}
