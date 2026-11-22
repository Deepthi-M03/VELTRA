import { html } from '../../lib/dom.js';
import { session } from '../../lib/api.js';
import { pageHero, mountPage } from './pages.js';
import { CATEGORIES, PRICE_PER_DAY_PAISE, MAX_SUBSCRIPTION_DAYS } from '/js/shared/constants.js';

const INCLUDES = {
  equity: ['Intraday & delivery setups', 'NIFTY 50 / BANK NIFTY screens', 'Entry, stop-loss, targets', 'AI explanation per setup'],
  options: ['Option-chain bias & setups', 'OI walls, PCR, max pain', 'Greeks & IV', 'Premium-based levels'],
  futures: ['Stock & index futures', 'Basis and OI analysis', 'Rule-based setups', 'AI explanation'],
  commodity: ['MCX bullion, energy, base metals', 'Contract specifications', 'Technical setups', 'AI explanation'],
  currency: ['USD/EUR/GBP/JPY vs INR', 'Contract details', 'Technical setups', 'AI explanation'],
};

export default async function pricing(root) {
  mountPage(root, html`
    ${pageHero('Pricing', '₹50 per day, per category', 'Choose any combination of categories and any number of days (1–' + MAX_SUBSCRIPTION_DAYS + '). Renewals extend your current access. Market overview, watchlists, alerts and the journal are included free with every account.')}
    <section class="section" style="padding-top:0"><div class="wrap">
      <div class="price-grid">${CATEGORIES.map((c, i) => html`<div class="glass price-card reveal" data-tilt data-delay="${i * 80}"><span class="eyebrow">${c.segment.replace('_', ' ')}</span><h3>${c.name}</h3><div class="amt metal-text">₹${PRICE_PER_DAY_PAISE / 100}<small> / day</small></div><ul>${INCLUDES[c.id].map((x) => html`<li>${x}</li>`)}</ul><a class="btn ${i === 0 ? 'btn-primary' : ''}" href="${session.user ? '/app/subscription' : '/register'}">${session.user ? 'Subscribe' : 'Create account'}</a></div>`)}</div>
      <div class="glass card reveal" style="margin-top:22px"><div class="two-col">
        <div><h3>Example</h3><p>Equity for 5 days + Options for 2 days = (5 + 2) × ₹50 = <strong>₹350</strong>.</p></div>
        <div><h3>Secure payment</h3><p>Payments are processed by an RBI-authorised Indian payment gateway and verified on our server by signature and webhook before access is granted. We never see your card details.</p></div>
      </div><p class="tiny muted" style="margin:10px 0 0">Prices are inclusive of applicable taxes once GST registration is configured. Paid access is offered only where the operator holds the required regulatory registration.</p></div>
    </div></section>`);
}
