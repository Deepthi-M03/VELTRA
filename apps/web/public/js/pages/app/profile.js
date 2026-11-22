import { html, render, $, $$ } from '../../lib/dom.js';
import { api, session, setSession, refreshSession } from '../../lib/api.js';
import { enter } from '../../lib/motion.js';
import { loader, toast, errToast, formData, submitting } from '../../lib/ui.js';
import { ist } from '../../lib/format.js';
import { head } from './common.js';

const LABEL = { price_alert: 'Price alerts', market_open: 'Market opening', market_move: 'Important market moves', recommendation: 'Recommendation updates', subscription_expiry: 'Subscription expiry', payment: 'Payment confirmations', system: 'System notices' };

export default async function profile(root) {
  const u = session.user;
  render(root, html`${head('Account', 'User Profile', html`<button class="btn btn-danger btn-sm" id="logout">Sign out</button>`)}
    <div class="g-2">
      <section class="glass card"><h3>Details</h3><form id="pf"><div class="field"><label for="p-n">Name</label><input class="input" id="p-n" name="name" value="${u.name}" required minlength="2" maxlength="80"></div>
        <div class="field"><label for="p-e">Email</label><input class="input" id="p-e" value="${u.email}" disabled></div><div class="field"><label for="p-p">Phone (optional)</label><input class="input" id="p-p" name="phone" value="${u.phone || ''}" maxlength="20"></div>
        <div class="row small" style="margin-bottom:14px"><span class="chip">Role: ${u.role}</span><span class="chip">${u.emailVerified ? 'Email verified' : 'Email not verified'}</span>${u.googleLinked ? html`<span class="chip">Google linked</span>` : ''}${!u.emailVerified ? html`<button type="button" class="btn btn-sm" id="rv">Resend verification</button>` : ''}</div>
        <p class="form-error" id="pe"></p><button class="btn btn-primary">Save details</button></form></section>
      <section class="glass card"><h3>Password</h3><form id="cp">${u.hasPassword ? html`<div class="field"><label for="c-c">Current password</label><input class="input" id="c-c" name="currentPassword" type="password" autocomplete="current-password" required></div>` : html`<p class="small">Your account uses Google sign-in. Set a password to also sign in with email.</p>`}
        <div class="field"><label for="c-n">New password</label><input class="input" id="c-n" name="newPassword" type="password" autocomplete="new-password" minlength="10" required></div><p class="form-error" id="ce"></p><button class="btn">Update password</button></form>
        <hr class="hr"><h3>Active sessions</h3><div id="sess">${loader()}</div><button class="btn btn-sm" id="lo">Sign out all other sessions</button></section>
    </div>
    <section class="glass card" style="margin-top:16px"><div class="card-title"><h3>Notification preferences</h3><button class="btn btn-sm" id="bn">Enable browser notifications</button></div><div id="np">${loader()}</div>
      <p class="tiny muted">Android push notifications are delivered to the VELTRA Android app when push credentials are configured by the operator.</p></section>`);
  enter($$('.card', root));

  $('#pf', root).addEventListener('submit', async (e) => { e.preventDefault(); const d = formData(e.currentTarget); try { await submitting(e.submitter, () => api.patch('/api/profile', { name: d.name, phone: d.phone || undefined })); await refreshSession(); toast('Profile saved', '', 'ok'); } catch (x) { $('#pe', root).textContent = x.message; } });
  $('#cp', root).addEventListener('submit', async (e) => { e.preventDefault(); const d = formData(e.currentTarget); try { await submitting(e.submitter, () => api.post('/api/auth/change-password', d)); e.currentTarget.reset(); toast('Password updated', 'Other sessions were signed out.', 'ok'); await refreshSession(); } catch (x) { $('#ce', root).textContent = x.message; } });
  $('#rv', root)?.addEventListener('click', async () => { try { await api.post('/api/auth/resend-verification'); toast('Verification email sent', '', 'ok'); } catch (x) { errToast(x); } });
  $('#logout', root).onclick = async () => { try { await api.post('/api/auth/logout'); } catch { /* ignore */ } setSession(null); window.veltraNavigate('/'); };
  $('#lo', root).onclick = async () => { await api.post('/api/profile/logout-others'); loadSessions(); toast('Other sessions signed out', '', 'ok'); };
  if (window.VeltraAndroid) { $('#bn', root).textContent = 'Allow app notifications'; }
  $('#bn', root).onclick = async () => {
    if (window.VeltraAndroid) {
      addEventListener('veltra:android-notifications', (ev) => toast(ev.detail ? 'App notifications allowed' : 'Notifications blocked', ev.detail ? (window.VeltraAndroid.pushEnabled() ? 'Push alerts will arrive even when VELTRA is closed.' : 'Push is not configured on this server yet.') : 'Enable them in Android Settings → Apps → VELTRA.'), { once: true });
      window.VeltraAndroid.requestNotificationPermission(); return;
    }
    try { const p = await Notification.requestPermission(); toast(p === 'granted' ? 'Browser notifications enabled' : 'Notifications not enabled', p === 'granted' ? 'You will be notified while VELTRA is open in the background.' : 'You can change this in your browser settings.'); } catch { toast('Not supported', 'This browser does not support notifications.', 'err'); } };

  async function loadSessions() {
    const { rows } = await api.get('/api/profile/sessions');
    render($('#sess', root), html`<div class="table-wrap"><table class="t"><tbody>${rows.map((s) => html`<tr><td class="small">${s.user_agent?.slice(0, 60) || 'Unknown device'}${s.current ? html` <span class="chip">this device</span>` : ''}</td><td class="small muted">${s.ip}</td><td class="small muted">${ist(s.last_seen_at)}</td></tr>`)}</tbody></table></div>`);
  }
  async function loadPrefs() {
    const { rows } = await api.get('/api/notifications/preferences');
    render($('#np', root), html`<div class="table-wrap"><table class="t"><thead><tr><th>Notification</th><th>In-app</th><th>Browser</th><th>Android push</th></tr></thead><tbody>${rows.map((p) => html`<tr data-t="${p.type}"><td>${LABEL[p.type] || p.type}</td>${['inApp', 'browser', 'push'].map((k) => html`<td><input type="checkbox" data-k="${k}" ${p[k] ? 'checked' : ''} aria-label="${LABEL[p.type]} ${k}" style="accent-color:var(--crimson);width:18px;height:18px"></td>`)}</tr>`)}</tbody></table></div>`);
  }
  $('#np', root).addEventListener('change', async (e) => {
    const tr = e.target.closest('tr[data-t]'); if (!tr) return;
    const row = { type: tr.dataset.t }; tr.querySelectorAll('input').forEach((i) => { row[i.dataset.k] = i.checked; });
    try { await api.put('/api/notifications/preferences', { rows: [row] }); toast('Preference saved', '', 'ok'); } catch (x) { errToast(x); }
  });
  await Promise.all([loadSessions(), loadPrefs()]);
}
