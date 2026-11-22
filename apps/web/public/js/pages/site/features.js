import { html } from '../../lib/dom.js';
import { icon } from '../../lib/icons.js';
import { pageHero, mountPage } from './pages.js';

const F = [
  ['overview', 'Market Overview', 'NIFTY 50, BANK NIFTY and sector indices, advance/decline breadth, India VIX and a transparent sentiment composite — updating as validated ticks arrive.'],
  ['equity', 'Equity Intelligence', 'Intraday and delivery screens across NIFTY 50, BANK NIFTY and other eligible stocks, with top-10 by traded volume and by traded value.'],
  ['options', 'Options Intelligence', 'Full chains by expiry: premium, OI, change in OI, volume, IV and Greeks, with PCR, max pain and OI-wall levels.'],
  ['futures', 'Futures Intelligence', 'Current-month contracts with basis, open interest, momentum and rule-based setups.'],
  ['commodity', 'Commodity Intelligence', 'MCX Gold, Silver, Crude Oil, Natural Gas, Copper and more, with contract specifications.'],
  ['currency', 'Currency Intelligence', 'USD/INR, EUR/INR, GBP/INR and JPY/INR derivatives with technical structure and AI context.'],
  ['studio', 'AI Trade Studio', 'Multi-timeframe charts with zoom and pan, overlays, RSI and MACD panes, entry/stop/target markers and a risk/reward map.'],
  ['watchlist', 'Watchlists', 'Unlimited-feel watchlists with live prices and one-click entry into the Studio.'],
  ['alerts', 'Price Alerts', 'Above/below and percentage-move alerts delivered in-app and as browser notifications.'],
  ['journal', 'Trade Journal & Paper Trading', 'Record actual trades or paper-trade at the recorded market price — simulated results are always marked.'],
  ['performance', 'Performance Analytics', 'Target and stop hit-rates, expiries, average return and risk/reward — losses included, always.'],
  ['shield', 'Security', 'Scrypt-hashed passwords, HttpOnly sessions, CSRF protection, rate limiting, audit logs and server-verified payments.'],
];

export default async function features(root) {
  mountPage(root, html`
    ${pageHero('The Platform', 'Thirteen instruments of intelligence', 'A complete terminal — from market breadth to a single option strike — designed as one coherent system.')}
    <section class="section" style="padding-top:0"><div class="wrap"><div class="g-3">
      ${F.map(([ic, t, d], i) => html`<article class="glass card reveal" data-tilt data-delay="${(i % 3) * 90}"><div class="icon-orb">${icon(ic)}</div><h3>${t}</h3><p>${d}</p></article>`)}
    </div></div></section>`);
}
