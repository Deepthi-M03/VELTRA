import { html, el, render, $ } from './dom.js';
import { animate, EASE } from './motion.js';

export const badge = (status) => html`<span class="badge badge-${status || 'UNAVAILABLE'}" title="${({ LIVE: 'Real-time data from a licensed provider', DELAYED: 'Delayed data from a licensed provider', DEMO: 'Synthetic demonstration data — not real market prices', UNAVAILABLE: 'No valid data available right now' })[status] || ''}">${status || 'UNAVAILABLE'}</span>`;
export const loader = () => html`<div class="loader"><div class="loader-crest" role="status" aria-label="Loading"></div></div>`;
export const empty = (title, body = '', action = '') => html`<div class="empty"><h4>${title}</h4><p>${body}</p>${action}</div>`;

export function toast(title, body = '', kind = '') {
  let host = $('#toasts'); if (!host) { host = document.createElement('div'); host.id = 'toasts'; host.setAttribute('aria-live', 'polite'); document.body.append(host); }
  const t = el(html`<div class="toast ${kind}"><strong>${title}</strong>${body ? html`<span>${body}</span>` : ''}</div>`);
  host.append(t);
  animate(t, [{ opacity: 0, transform: 'translateX(40px) scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 420 });
  setTimeout(() => animate(t, [{ opacity: 1 }, { opacity: 0, transform: 'translateX(30px)' }], { duration: 300 }).then(() => t.remove()), kind === 'err' ? 6500 : 4200);
}
export const errToast = (e) => toast('Something went wrong', e?.message || String(e), 'err');

export function modal(content, { onMount, labelledBy } = {}) {
  const back = el(html`<div class="modal-backdrop" role="dialog" aria-modal="true" ${labelledBy ? html`aria-labelledby="${labelledBy}"` : ''}><div class="modal glass"></div></div>`);
  const box = back.firstElementChild; render(box, content);
  const prevFocus = document.activeElement;
  const close = async () => {
    await Promise.all([animate(box, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(16px) scale(.97)' }], { duration: 220, easing: EASE.inOut }), animate(back, [{ opacity: 1 }, { opacity: 0 }], { duration: 240 })]);
    back.remove(); document.removeEventListener('keydown', onKey); prevFocus?.focus?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(back);
  animate(back, [{ opacity: 0 }, { opacity: 1 }], { duration: 260 });
  animate(box, [{ opacity: 0, transform: 'translateY(30px) scale(.94)', filter: 'blur(8px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 560, easing: EASE.silk });
  setTimeout(() => box.querySelector('input,select,textarea,button')?.focus(), 60);
  onMount?.(box, close);
  return close;
}

export function confirmDialog(title, body, { confirm = 'Confirm', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const close = modal(html`<h3 id="cd-t">${title}</h3><p>${body}</p><div class="modal-actions"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${confirm}</button></div>`, {
      labelledBy: 'cd-t',
      onMount: (box, c) => { box.querySelector('[data-ok]').onclick = () => { done = true; resolve(true); c(); }; },
    });
    const obs = new MutationObserver(() => { if (!document.contains(document.querySelector('#cd-t'))) { obs.disconnect(); if (!done) resolve(false); } });
    obs.observe(document.body, { childList: true }); void close;
  });
}

// Animated segmented tabs with a sliding pill.
export function tabs(container, onChange) {
  const pill = document.createElement('span'); pill.className = 'tab-pill'; container.prepend(pill);
  const move = () => { const on = container.querySelector('button.on'); if (!on) return; pill.style.width = on.offsetWidth + 'px'; pill.style.transform = `translateX(${on.offsetLeft - 4}px)`; };
  container.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    container.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); move(); onChange?.(b.dataset.v, b);
  });
  requestAnimationFrame(move); new ResizeObserver(move).observe(container);
}

export function formData(form) { return Object.fromEntries(new FormData(form).entries()); }
export async function submitting(btn, fn) {
  const label = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="loader-crest" style="width:18px;height:18px"></span>';
  try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = label; }
}
