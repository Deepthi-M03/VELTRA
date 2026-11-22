import { html, render, $, $$, el, debounce, store, esc } from '../lib/dom.js';
import { api, session, hasAccess, stream, closeStream, setSession } from '../lib/api.js';
import { icon } from '../lib/icons.js';
import { animate, stagger, EASE } from '../lib/motion.js';
import { badge, toast } from '../lib/ui.js';
import { ago, price, pct, cls } from '../lib/format.js';

const NAV = [
  ['Markets', [['overview', '/app', 'Market Overview'], ['equity', '/app/equity', 'Equity Intelligence', 'equity'], ['options', '/app/options', 'Options Intelligence', 'options'], ['futures', '/app/futures', 'Futures Intelligence', 'futures'], ['commodity', '/app/commodity', 'Commodity Intelligence', 'commodity'], ['currency', '/app/currency', 'Currency Intelligence', 'currency']]],
  ['Workspace', [['studio', '/app/studio', 'AI Trade Studio'], ['watchlist', '/app/watchlists', 'Watchlists'], ['alerts', '/app/alerts', 'Price Alerts'], ['journal', '/app/journal', 'Trade Journal'], ['performance', '/app/performance', 'Performance Analytics']]],
  ['Account', [['subscription', '/app/subscription', 'Subscription'], ['profile', '/app/profile', 'User Profile']]],
];

export async function mount(root) {
  const isAdmin = session.user?.role === 'admin';
  const collapsed = store.get('sidebar-collapsed', false);
  render(root, html`
  <div class="terminal ${collapsed ? 'collapsed' : ''}">
    <aside class="sidebar" aria-label="Terminal navigation">
      <a class="brand" href="/app"><img src="/assets/logo.svg" alt=""><span>VELTRA</span></a>
      <nav class="nav" id="nav"><span class="nav-pill" aria-hidden="true"></span>
        ${NAV.map(([g, items]) => html`<div class="nav-group">${g}</div>${items.map(([ic, href, label, cat]) => html`<a class="nav-item" href="${href}" data-nav="${ic}" title="${label}">${icon(ic)}<span>${label}</span>${cat && !hasAccess(cat) ? html`<span class="lock" title="Not subscribed">${icon('lock', 'width="12" height="12"')}</span>` : ''}</a>`)}`)}
        ${isAdmin ? html`<div class="nav-group">Control</div><a class="nav-item" href="/app/admin" data-nav="admin" title="Administration">${icon('admin')}<span>Administration</span></a>` : ''}
      </nav>
      <div class="sidebar-foot"><button class="nav-item" id="collapse" style="width:100%;background:none;border:0;cursor:pointer" title="Collapse sidebar">${icon('collapse')}<span>Collapse</span></button><a class="nav-item" href="/" title="Public site">${icon('eye')}<span>Public site</span></a></div>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="icon-btn" id="menu" aria-label="Open navigation" style="display:none">${icon('menu')}</button>
        <div class="search"><label class="sr-only" for="q">Search instruments</label>${icon('search')}<input class="input" id="q" placeholder="Search instruments…" autocomplete="off"><span class="kbd">Ctrl K</span><div class="search-results glass" id="qr" hidden></div></div>
        <div class="spacer"></div>
        <div class="mkt-chip" id="mkt"></div>
        <button class="icon-btn" id="bell" aria-label="Notifications">${icon('bell')}<span class="dot" id="unread" hidden></span></button>
        <a class="avatar" href="/app/profile" title="${session.user?.name}">${(session.user?.name || '?').slice(0, 1).toUpperCase()}</a>
      </header>
      <div class="page" id="content" tabindex="-1"></div>
    </div>
    <nav class="mobile-nav glass" aria-label="Quick navigation">
      <a href="/app" data-nav="overview">${icon('overview')}Markets</a><a href="/app/equity" data-nav="equity">${icon('equity')}Equity</a><a href="/app/studio" data-nav="studio">${icon('studio')}Studio</a><a href="/app/watchlists" data-nav="watchlist">${icon('watchlist')}Watch</a><a href="#" id="more">${icon('menu')}More</a>
    </nav>
  </div>`);
  const term = $('.terminal', root), nav = $('#nav', root), pill = $('.nav-pill', root);
  stagger($$('.nav-item', nav), [{ opacity: 0, transform: 'translateX(-16px)' }, { opacity: 1, transform: 'none' }], { each: 30, duration: 500 });

  $('#collapse', root).onclick = () => { const c = term.classList.toggle('collapsed'); store.set('sidebar-collapsed', c); setTimeout(movePill, 330); };
  const mq = matchMedia('(max-width: 960px)'); const menuBtn = $('#menu', root);
  const syncMq = () => { menuBtn.style.display = mq.matches ? '' : 'none'; }; syncMq(); mq.addEventListener('change', syncMq);
  const toggleDrawer = (open) => { term.classList.toggle('drawer-open', open); };
  menuBtn.onclick = () => toggleDrawer(!term.classList.contains('drawer-open'));
  $('#more', root).onclick = (e) => { e.preventDefault(); toggleDrawer(true); };
  root.addEventListener('click', (e) => { if (term.classList.contains('drawer-open') && !e.target.closest('.sidebar') && !e.target.closest('#menu') && !e.target.closest('#more')) toggleDrawer(false); });

  function api_refreshLocks() {
    $$('.nav-item', nav).forEach((a) => { const item = NAV.flatMap((g) => g[1]).find((x) => x[1] === a.getAttribute('href')); const lock = a.querySelector('.lock'); if (item?.[3] && hasAccess(item[3]) && lock) lock.remove(); });
  }
  function movePill() {
    const a = nav.querySelector('.nav-item.active');
    if (!a) { pill.style.opacity = 0; return; }
    pill.style.opacity = 1; pill.style.transform = `translateY(${a.offsetTop}px)`;
  }

  // ---- Instrument search (Ctrl+K) ----
  const q = $('#q', root), qr = $('#qr', root); let results = [], sel = 0;
  const doSearch = debounce(async () => {
    const s = q.value.trim(); if (!s) { qr.hidden = true; return; }
    try {
      results = (await api.get(`/api/instruments?search=${encodeURIComponent(s)}`)).rows.slice(0, 12); sel = 0;
      render(qr, results.length ? html`${results.map((r, i) => html`<button data-id="${r.id}" class="${i === 0 ? 'on' : ''}"><span class="sym">${r.symbol}</span><span class="small muted" style="flex:1">${r.name}</span><span class="num small ${cls(r.changePct)}">${price(r.ltp)}</span></button>`)}` : html`<div class="empty small">No instruments match “${s}”.</div>`);
      qr.hidden = false;
    } catch { qr.hidden = true; }
  }, 160);
  q.addEventListener('input', doSearch);
  q.addEventListener('keydown', (e) => {
    const btns = $$('button', qr);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length; btns.forEach((b, i) => b.classList.toggle('on', i === sel)); }
    if (e.key === 'Enter' && btns[sel]) { e.preventDefault(); openInst(btns[sel].dataset.id); }
    if (e.key === 'Escape') { qr.hidden = true; q.blur(); }
  });
  qr.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) openInst(b.dataset.id); });
  const openInst = (id) => { qr.hidden = true; q.value = ''; window.veltraNavigate(`/app/studio/${id}`); };
  const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); q.focus(); } };
  document.addEventListener('keydown', onKey);
  document.addEventListener('click', (e) => { if (!e.target.closest('.search')) qr.hidden = true; });

  // ---- Market status chip ----
  async function status() {
    try {
      const s = await api.get('/api/market/status'); const eq = s.sessions[0];
      const phase = eq.demoOverride ? 'Demo session' : ({ OPEN: 'Market open', PRE_OPEN: 'Pre-open', PRE_MARKET: 'Pre-market', CLOSED: eq.reason ? `Closed · ${eq.reason}` : 'Market closed', SPECIAL_TBA: 'Special session' })[eq.phase] || eq.phase;
      render($('#mkt', root), html`${badge(s.dataStatus)}<span class="txt">${phase} · ${eq.istTime} IST</span>`);
    } catch { render($('#mkt', root), badge('UNAVAILABLE')); }
  }
  status(); const statusTimer = setInterval(status, 30000);

  // ---- Notifications ----
  let unread = 0;
  const setUnread = (n) => { unread = n; const d = $('#unread', root); d.hidden = !n; d.textContent = n > 9 ? '9+' : n; };
  api.get('/api/notifications').then((d) => setUnread(d.unread)).catch(() => {});
  const offNotif = stream('notification', (n) => {
    setUnread(unread + (n.userId ? 1 : 0));
    toast(n.title, n.body);
    try { if (Notification.permission === 'granted' && document.hidden) new Notification(n.title, { body: n.body, icon: '/assets/logo.svg' }); } catch { /* unsupported */ }
  });
  $('#bell', root).onclick = () => openDrawer(setUnread);
  registerAndroidPush();
  const onSubs = () => api_refreshLocks(); document.addEventListener('veltra:subs-changed', onSubs);

  return {
    outlet: $('#content', root),
    activate(route) {
      $$('[data-nav]', root).forEach((a) => a.classList.toggle('active', a.dataset.nav === route.nav));
      requestAnimationFrame(movePill); toggleDrawer(false);
    },
    refreshLocks: api_refreshLocks,
    destroy() { document.removeEventListener('veltra:subs-changed', onSubs); clearInterval(statusTimer); offNotif(); document.removeEventListener('keydown', onKey); mq.removeEventListener('change', syncMq); closeStream(); },
  };
}

async function openDrawer(setUnread) {
  const scrim = el(html`<div class="scrim"></div>`);
  const d = el(html`<aside class="drawer glass" role="dialog" aria-label="Notifications"><header><h3 style="margin:0">Notifications</h3><div class="spacer"></div><button class="btn btn-sm" id="ra">Mark all read</button><button class="icon-btn" id="cl" aria-label="Close">${icon('close')}</button></header><div class="list"><div class="loader"><div class="loader-crest"></div></div></div></aside>`);
  document.body.append(scrim, d);
  animate(scrim, [{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
  animate(d, [{ transform: 'translateX(105%)' }, { transform: 'none' }], { duration: 560, easing: EASE.silk });
  const close = async () => { await Promise.all([animate(d, [{ transform: 'none' }, { transform: 'translateX(105%)' }], { duration: 360, easing: EASE.inOut }), animate(scrim, [{ opacity: 1 }, { opacity: 0 }], { duration: 360 })]); d.remove(); scrim.remove(); };
  scrim.onclick = close; d.querySelector('#cl').onclick = close;
  d.querySelector('#ra').onclick = async () => { await api.post('/api/notifications/read-all'); setUnread(0); d.querySelectorAll('.notif.unread').forEach((n) => n.classList.remove('unread')); };
  const list = d.querySelector('.list');
  try {
    const { rows } = await api.get('/api/notifications');
    render(list, rows.length ? html`${rows.map((n) => html`<a class="notif ${!n.read_at && n.user_id ? 'unread' : ''}" href="${n.link && n.link.startsWith('/') ? n.link.split('#')[0] : '#'}" style="display:block;color:inherit"><div class="t">${n.title}</div><div class="b">${n.body}</div><div class="w">${n.type.replace('_', ' ')} · ${ago(n.created_at)}</div></a>`)}` : html`<div class="empty"><h4>All quiet</h4><p>Alerts, market moves and payment confirmations appear here.</p></div>`);
    stagger(list.querySelectorAll('.notif'), [{ opacity: 0, transform: 'translateX(24px)' }, { opacity: 1, transform: 'none' }], { each: 35, duration: 420 });
    list.addEventListener('click', (e) => { if (e.target.closest('a.notif')) close(); });
  } catch (e) { render(list, html`<div class="empty">${e.message}</div>`); }
  void setSession; void pct;
}

// Inside the VELTRA Android app: register this device's FCM token with the server (once per token).
function registerAndroidPush() {
  const A = window.VeltraAndroid;
  if (!A?.pushEnabled?.()) return;
  const token = A.pushToken();
  if (!token || store.get('push-registered') === token) return;
  api.post('/api/push/register', { platform: 'android', token }).then(() => store.set('push-registered', token)).catch(() => {});
  if (!A.notificationsAllowed()) A.requestNotificationPermission();
}
