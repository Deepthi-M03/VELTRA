// VELTRA client router. Pages are lazily-loaded ES modules: export default async (root, params, query) => cleanup?
import { refreshSession, session } from './lib/api.js';
import { curtain, pageSwap } from './lib/motion.js';
import { errToast } from './lib/ui.js';

const R = (pattern, layout, mod, extra = {}) => ({ pattern, layout, mod, ...extra, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '/?$') });
const ROUTES = [
  R('/', 'site', 'site/home', { title: 'Intelligence Beyond the Market' }),
  R('/about', 'site', 'site/about', { title: 'About' }),
  R('/features', 'site', 'site/features', { title: 'Platform' }),
  R('/intelligence', 'site', 'site/intelligence', { title: 'Market Intelligence' }),
  R('/pricing', 'site', 'site/pricing', { title: 'Pricing' }),
  R('/contact', 'site', 'site/contact', { title: 'Contact & Support' }),
  R('/privacy', 'site', 'site/legal', { title: 'Privacy Policy', doc: 'privacy' }),
  R('/terms', 'site', 'site/legal', { title: 'Terms & Conditions', doc: 'terms' }),
  R('/risk', 'site', 'site/legal', { title: 'Risk Disclosures', doc: 'risk' }),
  R('/login', 'site', 'site/auth', { title: 'Sign in', mode: 'login', guestOnly: true }),
  R('/register', 'site', 'site/auth', { title: 'Create account', mode: 'register', guestOnly: true }),
  R('/forgot-password', 'site', 'site/auth', { title: 'Reset password', mode: 'forgot' }),
  R('/reset-password', 'site', 'site/auth', { title: 'Choose a new password', mode: 'reset' }),
  R('/verify-email', 'site', 'site/auth', { title: 'Verify email', mode: 'verify' }),
  R('/sandbox-checkout', 'bare', 'site/sandbox-checkout', { title: 'Sandbox checkout', auth: true }),
  R('/app', 'app', 'app/overview', { title: 'Market Overview', auth: true, nav: 'overview' }),
  R('/app/equity', 'app', 'app/category', { title: 'Equity Intelligence', auth: true, nav: 'equity', category: 'equity' }),
  R('/app/options', 'app', 'app/options', { title: 'Options Intelligence', auth: true, nav: 'options' }),
  R('/app/futures', 'app', 'app/category', { title: 'Futures Intelligence', auth: true, nav: 'futures', category: 'futures' }),
  R('/app/commodity', 'app', 'app/category', { title: 'Commodity Intelligence', auth: true, nav: 'commodity', category: 'commodity' }),
  R('/app/currency', 'app', 'app/category', { title: 'Currency Intelligence', auth: true, nav: 'currency', category: 'currency' }),
  R('/app/studio', 'app', 'app/studio', { title: 'AI Trade Studio', auth: true, nav: 'studio' }),
  R('/app/studio/:id', 'app', 'app/studio', { title: 'AI Trade Studio', auth: true, nav: 'studio' }),
  R('/app/watchlists', 'app', 'app/watchlists', { title: 'Watchlists', auth: true, nav: 'watchlist' }),
  R('/app/alerts', 'app', 'app/alerts', { title: 'Price Alerts', auth: true, nav: 'alerts' }),
  R('/app/journal', 'app', 'app/journal', { title: 'Trade Journal', auth: true, nav: 'journal' }),
  R('/app/performance', 'app', 'app/performance', { title: 'Performance Analytics', auth: true, nav: 'performance' }),
  R('/app/subscription', 'app', 'app/subscription', { title: 'Subscription', auth: true, nav: 'subscription' }),
  R('/app/profile', 'app', 'app/profile', { title: 'Profile', auth: true, nav: 'profile' }),
  R('/app/admin', 'app', 'app/admin', { title: 'Administration', auth: true, admin: true, nav: 'admin' }),
];

const root = document.getElementById('root');
let current = { layout: null, cleanup: null, layoutApi: null };

function match(path) {
  for (const r of ROUTES) { const m = path.match(r.re); if (m) return { route: r, params: m.groups || {} }; }
  return null;
}

export function navigate(to, { replace = false } = {}) {
  const url = new URL(to, location.origin);
  if (url.origin !== location.origin) { location.href = to; return; }
  if (url.pathname + url.search === location.pathname + location.search && !url.hash) return;
  history[replace ? 'replaceState' : 'pushState']({}, '', url.pathname + url.search + url.hash);
  go();
}
window.veltraNavigate = navigate;

async function go() {
  const path = location.pathname;
  const m = match(path);
  if (!m) return notFound();
  const { route, params } = m;
  if (route.auth && !session.user) return navigate(`/login?next=${encodeURIComponent(path + location.search)}`, { replace: true });
  if (route.guestOnly && session.user) return navigate('/app', { replace: true });
  if (route.admin && session.user?.role !== 'admin') return navigate('/app', { replace: true });
  document.title = `VELTRA — ${route.title}`;
  const query = Object.fromEntries(new URLSearchParams(location.search));
  let pageMod;
  try { pageMod = await import(`./pages/${route.mod}.js`); } catch (e) { errToast(e); return; }

  const swap = async () => {
    try { current.cleanup?.(); } catch { /* ignore */ }
    if (current.layout !== route.layout) {
      current.layoutApi?.destroy?.();
      const L = await import(`./layouts/${route.layout}.js`);
      current.layoutApi = await L.mount(root, route);
      current.layout = route.layout;
    }
    current.layoutApi.activate?.(route);
    current.layoutApi.refreshLocks?.();
    const outlet = current.layoutApi.outlet;
    // Each page gets a fresh root so its event listeners are discarded with it on navigation.
    const pageRoot = document.createElement('div'); pageRoot.className = 'page-root';
    outlet.replaceChildren(pageRoot);
    window.scrollTo({ top: 0, behavior: 'instant' });
    current.cleanup = await pageMod.default(pageRoot, params, query, route);
    outlet.focus?.({ preventScroll: true });
  };
  try {
    if (current.layout === 'app' && route.layout === 'app') await pageSwap(current.layoutApi.outlet, swap);
    else if (current.layout && current.layout !== null) await curtain(swap);
    else await swap();
  } catch (e) { errToast(e); console.error(e); }
}

function notFound() {
  root.innerHTML = '<div class="auth-stage"><div class="glass auth-card" style="text-align:center"><h1>Lost in the market</h1><p class="sub">This page does not exist.</p><a class="btn btn-primary" href="/" data-link>Return home</a></div></div>';
  current = { layout: null, cleanup: null, layoutApi: null };
}

// Intercept same-origin links.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (!a || a.target || a.hasAttribute('download') || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  const href = a.getAttribute('href');
  if (!href.startsWith('/') || href.startsWith('/api/')) return;
  e.preventDefault(); navigate(href);
});
window.addEventListener('popstate', go);
window.addEventListener('veltra:logout', () => navigate('/login', { replace: true }));

refreshSession().catch(() => {}).finally(go);
