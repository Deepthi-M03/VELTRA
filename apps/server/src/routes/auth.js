import { t, validate } from '../http/validate.js';
import { bad, HttpError, serializeCookie } from '../http/core.js';
import { token } from '../services/auth.js';

export const SESSION_COOKIE = 'veltra_sid';

export function setSessionCookie(res, ctx, s) {
  res.setHeader('Set-Cookie', serializeCookie(SESSION_COOKIE, s.token, { maxAge: ctx.config.sessionDays * 86400, secure: ctx.config.cookieSecure, sameSite: 'Lax' }));
}

export default function authRoutes(r, { requireAuth, limit }) {
  r.get('/api/auth/me', async (req, res, ctx) => {
    if (!req.user) return { user: null, googleEnabled: ctx.auth.googleEnabled };
    return { user: ctx.auth.publicUser(req.user), csrfToken: req.session.csrf, subscriptions: ctx.subs.active(req.user.id), googleEnabled: ctx.auth.googleEnabled };
  });

  r.post('/api/auth/register', limit('auth', 10, 15 * 60000), async (req, res, ctx) => {
    if (!ctx.flags.get('public_registration')) throw new HttpError(403, 'Registration is currently closed.');
    const b = validate({ email: t.email(), password: t.string({ trim: false, max: 128 }), name: t.string({ min: 2, max: 80 }), acceptTerms: t.bool() }, req.body);
    if (!b.acceptTerms) throw bad('You must accept the Terms, Privacy Policy and Risk Disclosures.');
    const out = await ctx.auth.register(b, req.ip);
    if (out.error) throw new HttpError(out.code === 'EMAIL_TAKEN' ? 409 : 400, out.error);
    const s = ctx.auth.createSession(out.user.id, { ip: req.ip, userAgent: req.headers['user-agent'] });
    setSessionCookie(res, ctx, s);
    return { user: ctx.auth.publicUser(out.user), csrfToken: s.csrf };
  });

  r.post('/api/auth/login', limit('auth', 10, 15 * 60000), async (req, res, ctx) => {
    const b = validate({ email: t.email(), password: t.string({ trim: false, max: 128 }) }, req.body);
    const out = await ctx.auth.login(b, req.ip);
    if (out.error) throw new HttpError(out.code === 'LOCKED' ? 423 : 401, out.error);
    const s = ctx.auth.createSession(out.user.id, { ip: req.ip, userAgent: req.headers['user-agent'] });
    setSessionCookie(res, ctx, s);
    return { user: ctx.auth.publicUser(out.user), csrfToken: s.csrf };
  });

  r.post('/api/auth/logout', requireAuth, async (req, res, ctx) => {
    ctx.auth.destroySession(req.session.sessionId);
    res.setHeader('Set-Cookie', serializeCookie(SESSION_COOKIE, '', { maxAge: 0, secure: ctx.config.cookieSecure }));
    return { ok: true };
  });

  r.post('/api/auth/forgot-password', limit('forgot', 5, 15 * 60000), async (req, res, ctx) => {
    const b = validate({ email: t.email() }, req.body);
    ctx.auth.requestPasswordReset(b.email, req.ip);
    return { ok: true, message: 'If an account exists for that email, a reset link has been sent.' };
  });

  r.post('/api/auth/reset-password', limit('auth', 10, 15 * 60000), async (req, res, ctx) => {
    const b = validate({ token: t.string({ max: 100 }), password: t.string({ trim: false, max: 128 }) }, req.body);
    const out = await ctx.auth.resetPassword(b.token, b.password, req.ip);
    if (out.error) throw bad(out.error);
    return { ok: true };
  });

  r.post('/api/auth/verify-email', limit('auth', 20, 15 * 60000), async (req, res, ctx) => {
    const b = validate({ token: t.string({ max: 100 }) }, req.body);
    if (!ctx.auth.verifyEmail(b.token)) throw bad('This verification link is invalid or has expired.');
    return { ok: true };
  });
  r.post('/api/auth/resend-verification', requireAuth, limit('verify', 3, 15 * 60000), async (req, res, ctx) => { ctx.auth.sendVerification(req.user.id); return { ok: true }; });

  r.post('/api/auth/change-password', requireAuth, limit('auth', 10, 15 * 60000), async (req, res, ctx) => {
    const b = validate({ currentPassword: t.string({ trim: false, optional: true, max: 128 }), newPassword: t.string({ trim: false, max: 128 }) }, req.body);
    const out = await ctx.auth.changePassword(req.user, b.currentPassword, b.newPassword, req.session.sessionId);
    if (out.error) throw bad(out.error);
    return { ok: true };
  });

  // ---- Google OAuth ----
  r.get('/api/auth/google', async (req, res, ctx) => {
    if (!ctx.auth.googleEnabled) throw new HttpError(503, 'Google sign-in is not configured on this server.');
    const state = token(16);
    res.setHeader('Set-Cookie', serializeCookie('veltra_oauth', state, { maxAge: 600, secure: ctx.config.cookieSecure }));
    res.writeHead(302, { location: ctx.auth.googleAuthUrl(state) }); res.end();
  });
  r.get('/api/auth/google/callback', async (req, res, ctx) => {
    const { code, state } = req.query;
    const fail = (m) => { res.writeHead(302, { location: `/login?error=${encodeURIComponent(m)}` }); res.end(); };
    if (!ctx.auth.googleEnabled) return fail('Google sign-in is not configured');
    if (!state || state !== req.cookies.veltra_oauth) return fail('Sign-in session expired, please try again');
    try {
      const u = await ctx.auth.googleExchange(String(code || ''), req.ip);
      const s = ctx.auth.createSession(u.id, { ip: req.ip, userAgent: req.headers['user-agent'] });
      res.setHeader('Set-Cookie', [serializeCookie(SESSION_COOKIE, s.token, { maxAge: ctx.config.sessionDays * 86400, secure: ctx.config.cookieSecure }), serializeCookie('veltra_oauth', '', { maxAge: 0 })]);
      res.writeHead(302, { location: '/app' }); res.end();
    } catch (e) { ctx.errors.record('google-oauth', e); fail('Google sign-in failed'); }
  });
}
