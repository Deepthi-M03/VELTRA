import { html, render, $ } from '../lib/dom.js';
import { session } from '../lib/api.js';
import { reduced } from '../lib/motion.js';
import { RISK_DISCLOSURE_SHORT } from '/js/shared/constants.js';

export function brand() { return html`<a class="brand" href="/" aria-label="VELTRA home"><img src="/assets/logo.svg" alt=""><span>VELTRA</span></a>`; }

export async function mount(root) {
  const authed = !!session.user;
  render(root, html`
    <div class="atmos" aria-hidden="true"><div class="nebula n1"></div><div class="nebula n2"></div><div class="nebula n3"></div><div class="grain"></div><div class="vignette"></div></div>
    <canvas id="trails" aria-hidden="true"></canvas>
    <nav class="site-nav glass" aria-label="Primary">
      ${brand()}
      <div class="links">
        <a href="/features">Platform</a><a href="/intelligence">Intelligence</a><a href="/pricing">Pricing</a><a href="/about">About</a><a href="/contact">Support</a>
      </div>
      <button class="btn btn-ghost btn-icon nav-toggle" aria-label="Menu" aria-expanded="false"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
      <div class="actions">${authed ? html`<a class="btn btn-primary btn-sm" href="/app">Open Terminal</a>` : html`<a class="btn btn-ghost btn-sm" href="/login">Sign in</a><a class="btn btn-primary btn-sm" href="/register">Begin</a>`}</div>
    </nav>
    <main class="site" id="content" tabindex="-1"></main>
    <footer class="site-footer">
      <div class="wrap">
        <div class="footer-grid">
          <div>${brand()}<p class="small" style="margin-top:16px;max-width:340px">Intelligence beyond the market. Transparent technical analysis and AI-explained market structure for Indian equities, derivatives, commodities and currencies.</p></div>
          <div><h5>Platform</h5><a href="/features">Features</a><a href="/intelligence">Market intelligence</a><a href="/pricing">Pricing</a><a href="/app">Terminal</a></div>
          <div><h5>Company</h5><a href="/about">About VELTRA</a><a href="/contact">Contact &amp; support</a></div>
          <div><h5>Legal</h5><a href="/terms">Terms &amp; conditions</a><a href="/privacy">Privacy policy</a><a href="/risk">Risk disclosures</a></div>
        </div>
        <p class="disclaimer">${RISK_DISCLOSURE_SHORT} VELTRA does not execute trades or hold client funds. Paid research features remain disabled until the operator's regulatory registrations are in place. Market data shown is labelled LIVE, DELAYED, DEMO or UNAVAILABLE at all times. © ${new Date().getFullYear()} VELTRA.</p>
      </div>
    </footer>`);
  const nav = $('.site-nav', root), toggle = $('.nav-toggle', root);
  toggle.onclick = () => { const o = nav.classList.toggle('open'); toggle.setAttribute('aria-expanded', o); };
  const onScroll = () => nav.classList.toggle('scrolled', scrollY > 30);
  addEventListener('scroll', onScroll, { passive: true });
  const stopTrails = lightTrails($('#trails', root));
  return {
    outlet: $('main', root),
    activate() {
      nav.classList.remove('open');
      root.querySelectorAll('.site-nav .links a').forEach((a) => a.classList.toggle('active', location.pathname.startsWith(a.getAttribute('href'))));
    },
    destroy() { removeEventListener('scroll', onScroll); stopTrails(); },
  };
}

// Sophisticated light trails: glowing bezier ribbons flowing across the viewport with parallax to pointer & scroll.
export function lightTrails(canvas) {
  const g = canvas.getContext('2d');
  let w, h, dpr, raf, t = 0, mx = 0, my = 0;
  const trails = Array.from({ length: 7 }, (_, i) => ({ seed: i * 1.7 + 0.3, hue: i % 3, speed: 0.00018 + i * 0.00004, amp: 0.12 + (i % 4) * 0.05, y: 0.25 + i * 0.09, width: 0.6 + (i % 3) * 0.6 }));
  const colors = ['rgba(201,41,75,', 'rgba(217,161,143,', 'rgba(242,201,185,'];
  const resize = () => { dpr = Math.min(2, devicePixelRatio || 1); w = innerWidth; h = innerHeight; canvas.width = w * dpr; canvas.height = h * dpr; canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; g.setTransform(dpr, 0, 0, dpr, 0, 0); };
  const onMove = (e) => { mx = e.clientX / w - 0.5; my = e.clientY / h - 0.5; };
  resize(); addEventListener('resize', resize); addEventListener('pointermove', onMove, { passive: true });
  const draw = () => {
    g.clearRect(0, 0, w, h); g.globalCompositeOperation = 'lighter';
    const sc = scrollY * 0.15;
    for (const tr of trails) {
      const phase = t * tr.speed * 60 + tr.seed;
      const baseY = tr.y * h - sc * (0.4 + tr.width * 0.2) + my * 40 * tr.width;
      const grad = g.createLinearGradient(0, 0, w, 0);
      const c = colors[tr.hue];
      grad.addColorStop(0, c + '0)'); grad.addColorStop(0.3 + Math.sin(phase) * 0.1, c + '0.55)'); grad.addColorStop(0.7, c + '0.25)'); grad.addColorStop(1, c + '0)');
      for (const [lw, a] of [[tr.width * 10, 0.05], [tr.width * 3, 0.18], [tr.width, 0.9]]) {
        g.beginPath(); g.lineWidth = lw; g.strokeStyle = grad; g.globalAlpha = a;
        for (let x = -40; x <= w + 40; x += 24) {
          const y = baseY + Math.sin(x / w * 3.2 + phase) * tr.amp * h * 0.5 + Math.sin(x / w * 7 + phase * 1.7) * 12 + mx * 30 * tr.width;
          x === -40 ? g.moveTo(x, y) : g.lineTo(x, y);
        }
        g.stroke();
      }
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    t++; raf = requestAnimationFrame(draw);
  };
  if (reduced()) { t = 400; draw(); cancelAnimationFrame(raf); } else draw();
  return () => { cancelAnimationFrame(raf); removeEventListener('resize', resize); removeEventListener('pointermove', onMove); };
}
