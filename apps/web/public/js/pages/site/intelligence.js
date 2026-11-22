import { html } from '../../lib/dom.js';
import { pageHero, mountPage } from './pages.js';

export default async function intelligence(root) {
  mountPage(root, html`
    ${pageHero('Market Intelligence', 'How a VELTRA setup is born', 'Transparent methodology — every factor, weight and threshold is visible on each recommendation.')}
    <section class="section" style="padding-top:0"><div class="wrap">
      <div class="g-2">
        <article class="glass card reveal"><span class="eyebrow">Session</span><h3 style="margin-top:12px">09:10 – 15:30 IST, holiday-aware</h3><p>Monitoring begins at 09:10 for the 09:15 open and ends at 15:30. The exchange holiday calendar and special sessions (Union Budget, Muhurat) are honoured. MCX and currency segments follow their own hours.</p></article>
        <article class="glass card reveal" data-delay="100"><span class="eyebrow">Data</span><h3 style="margin-top:12px">Licensed feeds only</h3><p>VELTRA connects to an authorised market-data provider through a pluggable interface. It does not scrape exchange websites. Without a licensed feed it runs on clearly labelled DEMO data.</p></article>
      </div>
      <article class="glass card reveal" style="margin-top:18px">
        <span class="eyebrow">Scoring factors</span><h3 style="margin-top:12px">Seven weighted factors, one transparent score</h3>
        <div class="table-wrap"><table class="t"><thead><tr><th>Factor</th><th>Inputs</th><th class="r">Default weight</th></tr></thead><tbody>
          ${[['Trend', 'Close vs EMA20 vs EMA50 (must fully align)', 25], ['Momentum', 'RSI14 band + 10-bar rate of change', 20], ['MACD', 'Histogram sign and slope', 15], ['Volume', 'Bar volume vs 20-bar average', 15], ['VWAP (intraday)', 'Distance from session VWAP', 10], ['Relative strength', 'Return vs NIFTY 50 over 20 bars', 10], ['Volatility', 'ATR % of price within allowed band', 5]].map(([f, i, w]) => html`<tr><td class="sym">${f}</td><td>${i}</td><td class="r num">${w}</td></tr>`)}
        </tbody></table></div>
        <p class="small" style="margin-top:14px">Only evidence supporting a direction contributes. A setup is published when the score is at least 70 and risk/reward to Target 1 is at least 1.5. Stops sit at 1.5× ATR (or just beyond nearby swing structure); targets at 1.5R and 2.5R. The score measures rule agreement — it is <strong>not</strong> a probability of profit.</p>
      </article>
    </div></section>`);
}
