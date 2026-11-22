import { html } from '../../lib/dom.js';
import { pageHero, mountPage } from './pages.js';

export default async function about(root) {
  mountPage(root, html`
    ${pageHero('About VELTRA', 'Clarity is the rarest edge', 'VELTRA exists to give Indian market participants institutional-grade analytical structure — with the discipline to show its work and the honesty to show its misses.')}
    <section class="section" style="padding-top:0"><div class="wrap two-col">
      <article class="glass card reveal" data-tilt><span class="eyebrow">Principle I</span><h3 style="margin-top:12px">Evidence over excitement</h3><p>Every setup comes from validated numbers run through published, configurable rules. If the data isn't valid, VELTRA says <em>UNAVAILABLE</em> rather than guessing.</p></article>
      <article class="glass card reveal" data-tilt data-delay="100"><span class="eyebrow">Principle II</span><h3 style="margin-top:12px">Explain, never embellish</h3><p>AI turns numbers into language. It is given only the engine's computed inputs, and any narrative citing a figure outside them is discarded automatically.</p></article>
      <article class="glass card reveal" data-tilt><span class="eyebrow">Principle III</span><h3 style="margin-top:12px">The record is permanent</h3><p>Targets hit, stops taken, setups that expired untouched — all of it stays in the performance history. Simulated results are always labelled as simulated.</p></article>
      <article class="glass card reveal" data-tilt data-delay="100"><span class="eyebrow">Principle IV</span><h3 style="margin-top:12px">Regulation first</h3><p>Paid research features stay switched off until the operator holds the required SEBI registrations and exchange data licences. A disclaimer is not a licence.</p></article>
    </div></section>`);
}
