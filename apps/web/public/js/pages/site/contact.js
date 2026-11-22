import { html, $ } from '../../lib/dom.js';
import { api, session } from '../../lib/api.js';
import { formData, submitting, toast } from '../../lib/ui.js';
import { pageHero, mountPage } from './pages.js';

export default async function contact(root) {
  mountPage(root, html`
    ${pageHero('Contact & Support', 'We are here to help', 'Questions about the platform, your subscription or a payment? Send us a message and our team will respond by email.')}
    <section class="section" style="padding-top:0"><div class="wrap two-col">
      <form class="glass card reveal" id="cf" novalidate>
        <div class="field"><label for="c-name">Name</label><input class="input" id="c-name" name="name" required minlength="2" maxlength="80" value="${session.user?.name || ''}"></div>
        <div class="field"><label for="c-email">Email</label><input class="input" id="c-email" name="email" type="email" required value="${session.user?.email || ''}"></div>
        <div class="field"><label for="c-sub">Subject</label><input class="input" id="c-sub" name="subject" required minlength="3" maxlength="120"></div>
        <div class="field"><label for="c-msg">Message</label><textarea class="input" id="c-msg" name="message" required minlength="10" maxlength="4000"></textarea></div>
        <p class="form-error" id="c-err" role="alert"></p>
        <button class="btn btn-primary" type="submit">Send message</button>
      </form>
      <div class="grid">
        <article class="glass card reveal" data-delay="100"><h3>Payments</h3><p>If money was debited but your access did not activate, it will reconcile automatically via the gateway webhook within minutes. Include your order ID if you contact us.</p></article>
        <article class="glass card reveal" data-delay="200"><h3>Grievances</h3><p>Grievance-redressal and compliance-officer details are published here once the operator's registration is complete.</p></article>
      </div>
    </div></section>`);
  $('#cf', root).addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget, err = $('#c-err', root); err.textContent = '';
    if (!f.reportValidity()) return;
    try { await submitting(f.querySelector('button'), () => api.post('/api/contact', formData(f))); f.reset(); toast('Message sent', 'We will reply to your email.', 'ok'); }
    catch (x) { err.textContent = x.message; }
  });
}
