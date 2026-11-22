// VELTRA motion system — Web Animations API choreography. Honors prefers-reduced-motion.
export const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const EASE = { out: 'cubic-bezier(.16,1,.3,1)', silk: 'cubic-bezier(.22,.9,.24,1)', inOut: 'cubic-bezier(.65,0,.35,1)', back: 'cubic-bezier(.34,1.56,.64,1)' };

export function animate(el, keyframes, opts = {}) {
  if (!el) return Promise.resolve();
  if (reduced()) { const last = Array.isArray(keyframes) ? keyframes[keyframes.length - 1] : keyframes; Object.assign(el.style, last); return Promise.resolve(); }
  const a = el.animate(keyframes, { duration: 600, easing: EASE.out, fill: 'both', ...opts });
  return a.finished.catch(() => {});
}

export function stagger(els, keyframes, { each = 60, delay = 0, ...opts } = {}) {
  return Promise.all([...els].map((el, i) => animate(el, keyframes, { delay: delay + i * each, ...opts })));
}

export const enter = (els, o = {}) => stagger(els, [{ opacity: 0, transform: 'translateY(18px) scale(.985)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 700, each: 55, ...o });

// Scroll-triggered reveals.
let io;
export function revealOnScroll(root = document) {
  io?.disconnect();
  io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const t = e.target; io.unobserve(t);
      if (t.dataset.split !== undefined) splitReveal(t);
      else animate(t, [{ opacity: 0, transform: 'translateY(40px)', filter: 'blur(8px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 1000, delay: +(t.dataset.delay || 0) });
    }
  }, { threshold: 0.14, rootMargin: '0px 0px -6% 0px' });
  root.querySelectorAll('.reveal, [data-split]').forEach((n) => io.observe(n));
}

// Word-by-word mask reveal for headings.
export function splitReveal(node) {
  if (!node.dataset.done) {
    const words = node.textContent.trim().split(/\s+/);
    node.textContent = '';
    words.forEach((w, i) => { const o = document.createElement('span'); o.className = 'split-word'; const s = document.createElement('span'); s.textContent = w; o.append(s); node.append(o); if (i < words.length - 1) node.append(' '); });
    node.dataset.done = '1';
  }
  node.style.opacity = 1;
  stagger(node.querySelectorAll('.split-word > span'), [{ transform: 'translateY(110%) rotate(4deg)' }, { transform: 'none' }], { duration: 1000, each: 70, easing: EASE.silk });
}

// Animated number. Keeps formatting stable (tabular numerals).
const running = new WeakMap();
export function countTo(el, to, { from, duration = 900, format = (v) => v.toFixed(2) } = {}) {
  if (!el || to == null || !Number.isFinite(to)) { if (el) el.textContent = '—'; return; }
  const start = from ?? (parseFloat((el.dataset.v ?? '').toString()) || 0);
  el.dataset.v = to;
  if (reduced() || start === to) { el.textContent = format(to); return; }
  cancelAnimationFrame(running.get(el));
  const t0 = performance.now();
  const tick = (now) => {
    const p = Math.min(1, (now - t0) / duration), e = 1 - Math.pow(1 - p, 4);
    el.textContent = format(start + (to - start) * e);
    if (p < 1) running.set(el, requestAnimationFrame(tick));
  };
  running.set(el, requestAnimationFrame(tick));
}

export function flash(el, up) { if (!el || reduced()) return; el.classList.remove('flash-up', 'flash-down'); void el.offsetWidth; el.classList.add(up ? 'flash-up' : 'flash-down'); }

// Cinematic crimson curtain between public pages.
export async function curtain(swap) {
  const c = document.querySelector('.curtain');
  if (!c || reduced()) { await swap(); return; }
  const bars = [...c.children];
  await Promise.all(bars.map((b, i) => b.animate([{ transform: 'scaleY(0)', transformOrigin: 'bottom' }, { transform: 'scaleY(1)', transformOrigin: 'bottom' }], { duration: 460, delay: i * 45, easing: EASE.inOut, fill: 'forwards' }).finished));
  await swap();
  await Promise.all(bars.map((b, i) => b.animate([{ transform: 'scaleY(1)', transformOrigin: 'top' }, { transform: 'scaleY(0)', transformOrigin: 'top' }], { duration: 520, delay: i * 45, easing: EASE.inOut, fill: 'forwards' }).finished));
}

// Terminal page transition: outgoing fades/lifts, incoming rises from blur.
export async function pageSwap(container, swap) {
  if (reduced()) { await swap(); return; }
  await animate(container, [{ opacity: 1, transform: 'none', filter: 'blur(0)' }, { opacity: 0, transform: 'translateY(-8px)', filter: 'blur(4px)' }], { duration: 170, easing: EASE.inOut });
  await swap();
  animate(container, [{ opacity: 0, transform: 'translateY(14px)', filter: 'blur(8px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 520 });
}

// Pointer tilt for glass cards.
export function tilt(root) {
  if (reduced() || matchMedia('(pointer: coarse)').matches) return;
  root.querySelectorAll('[data-tilt]').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `perspective(900px) rotateX(${(-y * 6).toFixed(2)}deg) rotateY(${(x * 8).toFixed(2)}deg) translateZ(0)`;
      card.style.background = `radial-gradient(500px circle at ${(x + 0.5) * 100}% ${(y + 0.5) * 100}%, rgba(201,41,75,.16), transparent 50%), var(--glass)`;
    });
    card.addEventListener('pointerleave', () => { card.style.transform = ''; card.style.background = ''; });
  });
}
