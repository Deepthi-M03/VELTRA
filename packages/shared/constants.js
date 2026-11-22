// Shared domain constants for VELTRA (server + web import this file).

export const BRAND = Object.freeze({
  name: 'VELTRA',
  tagline: 'INTELLIGENCE BEYOND THE MARKET.',
  identity: 'CRIMSON DYNASTY',
  colors: {
    obsidian: '#10090D',
    burgundy: '#35101D',
    crimson: '#A51E3D',
    roseGold: '#D9A18F',
    peach: '#F2C9B9',
    emerald: '#28B889',
    ruby: '#F05268',
  },
});

// Subscription categories. Pricing is finalized: ₹50 per day per category.
export const CATEGORIES = Object.freeze([
  { id: 'equity', name: 'Equity Intelligence', segment: 'NSE_EQ' },
  { id: 'options', name: 'Options Intelligence', segment: 'NSE_FO' },
  { id: 'futures', name: 'Futures Intelligence', segment: 'NSE_FO' },
  { id: 'commodity', name: 'Commodity Intelligence', segment: 'MCX' },
  { id: 'currency', name: 'Currency Intelligence', segment: 'NSE_CD' },
]);
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);
export const PRICE_PER_DAY_PAISE = 5000; // ₹50.00
export const MAX_SUBSCRIPTION_DAYS = 90;

// Every market datum the UI shows carries exactly one of these.
export const DATA_STATUS = Object.freeze({
  LIVE: 'LIVE',
  DELAYED: 'DELAYED',
  DEMO: 'DEMO',
  UNAVAILABLE: 'UNAVAILABLE',
});

export const ROLES = Object.freeze({ USER: 'user', ADMIN: 'admin' });

export const TIMEFRAMES = Object.freeze(['1m', '5m', '15m', '1h', '1d']);
export const TIMEFRAME_MINUTES = Object.freeze({ '1m': 1, '5m': 5, '15m': 15, '1h': 60, '1d': 1440 });

export const RISK_DISCLOSURE_SHORT =
  'Market analysis is for information and education. It is not investment advice and does not guarantee any outcome. Trading in securities and derivatives involves substantial risk of loss.';
