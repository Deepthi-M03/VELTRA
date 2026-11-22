import { html, render, $ } from '../../lib/dom.js';
import { api, setSession, session, refreshSession } from '../../lib/api.js';
import { animate, EASE } from '../../lib/motion.js';
import { formData, submitting } from '../../lib/ui.js';

const strength = (pw) => { let s = 0; if (pw.length >= 10) s++; if (pw.length >= 14) s++; if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++; if (/\d/.test(pw)) s++; if (/[^A-Za-z0-9]/.test(pw)) s++; return s; };
const google = () => (session.googleEnabled ? html`<div class="divider">OR</div><a class="btn" style="width:100%" href="/api/auth/google">Continue with Google</a>` : '');

export default async function auth(root, params, query, route) {
  const safeNext = (query.next && query.next.startsWith('/') && !query.next.startsWith('//')) ? query.next : '/app';
  const card = (title, sub, body) => html`<div class="auth-stage"><div class="glass auth-card"><img class="crest" src="/assets/logo.svg" alt=""><h1>${title}</h1><p class="sub">${sub}</p>${body}</div></div>`;
  const pwField = (name = 'password', label = 'Password', ac = 'new-password') => html`<div class="field"><label for="f-${name}">${label}</label><input class="input" id="f-${name}" name="${name}" type="password" autocomplete="${ac}" required minlength="10" maxlength="128"><div class="pw-meter"><i></i></div><span class="tiny muted">At least 10 characters, with letters and numbers.</span></div>`;
  const views = {
    login: () => card('Welcome back', 'Sign in to your VELTRA terminal.', html`
      <form id="f" novalidate><div class="field"><label for="f-email">Email</label><input class="input" id="f-email" name="email" type="email" autocomplete="email" required></div>
      <div class="field"><label for="f-password">Password</label><input class="input" id="f-password" name="password" type="password" autocomplete="current-password" required></div>
      <p class="form-error" id="err" role="alert">${query.error || ''}</p><button class="btn btn-primary" style="width:100%" type="submit">Sign in</button></form>
      ${google()}<p class="alt"><a href="/forgot-password">Forgot password?</a> · New here? <a href="/register">Create an account</a></p>`),
    register: () => card('Create your account', 'Free to join. Subscribe only to what you use.', html`
      <form id="f" novalidate><div class="field"><label for="f-name">Full name</label><input class="input" id="f-name" name="name" autocomplete="name" required minlength="2" maxlength="80"></div>
      <div class="field"><label for="f-email">Email</label><input class="input" id="f-email" name="email" type="email" autocomplete="email" required></div>
      ${pwField()}
      <label class="check"><input type="checkbox" name="acceptTerms" required> <span>I am 18+ and accept the <a href="/terms" target="_blank">Terms</a>, <a href="/privacy" target="_blank">Privacy Policy</a> and <a href="/risk" target="_blank">Risk Disclosures</a>.</span></label>
      <p class="form-error" id="err" role="alert"></p><button class="btn btn-primary" style="width:100%" type="submit">Create account</button></form>
      ${google()}<p class="alt">Already have an account? <a href="/login">Sign in</a></p>`),
    forgot: () => card('Reset your password', 'We will email you a secure link valid for 30 minutes.', html`
      <form id="f" novalidate><div class="field"><label for="f-email">Email</label><input class="input" id="f-email" name="email" type="email" autocomplete="email" required></div>
      <p class="form-error" id="err" role="alert"></p><button class="btn btn-primary" style="width:100%" type="submit">Send reset link</button></form><p class="alt"><a href="/login">Back to sign in</a></p>`),
    reset: () => card('Choose a new password', 'All your other sessions will be signed out.', html`
      <form id="f" novalidate>${pwField()}<p class="form-error" id="err" role="alert"></p><button class="btn btn-primary" style="width:100%" type="submit">Update password</button></form>`),
    verify: () => card('Verifying your email', '', html`<p class="form-error" id="err" role="alert"></p><div id="vmsg" class="loader"><div class="loader-crest"></div></div>`),
  };
  render(root, views[route.mode]());
  animate($('.auth-card', root), [{ opacity: 0, transform: 'translateY(30px) scale(.96)', filter: 'blur(10px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 900, easing: EASE.silk });
  const err = $('#err', root);
  if (route.mode === 'verify') {
    try { await api.post('/api/auth/verify-email', { token: query.token || '' }); render($('#vmsg', root), html`<p class="form-ok" style="text-align:center">Email verified. <a href="/app">Continue to the terminal</a></p>`); if (session.user) refreshSession(); }
    catch (e) { $('#vmsg', root).remove(); err.textContent = e.message; }
    return;
  }
  const f = $('#f', root);
  const pw = f.querySelector('input[name=password]'), meter = f.querySelector('.pw-meter i');
  if (pw && meter) pw.addEventListener('input', () => { const s = strength(pw.value); meter.style.width = `${(s / 5) * 100}%`; meter.style.background = s < 3 ? 'var(--ruby)' : s < 4 ? '#E8B85A' : 'var(--emerald)'; });
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); err.textContent = '';
    if (!f.reportValidity()) return;
    const d = formData(f);
    try {
      await submitting(f.querySelector('button[type=submit]'), async () => {
        if (route.mode === 'login') { setSession(await api.post('/api/auth/login', d)); await refreshSession(); window.veltraNavigate(safeNext); }
        else if (route.mode === 'register') { setSession(await api.post('/api/auth/register', { ...d, acceptTerms: !!d.acceptTerms })); await refreshSession(); window.veltraNavigate('/app?welcome=1'); }
        else if (route.mode === 'forgot') { const r = await api.post('/api/auth/forgot-password', d); render(f, html`<p class="form-ok">${r.message}</p>`); }
        else if (route.mode === 'reset') { await api.post('/api/auth/reset-password', { token: query.token || '', password: d.password }); render(f, html`<p class="form-ok">Password updated. <a href="/login">Sign in</a></p>`); }
      });
    } catch (x) { err.textContent = x.message; animate($('.auth-card', root), [{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }], { duration: 360 }); }
  });
}
