// Safe HTML templating: every interpolated value is escaped unless it is itself an html`` result.
export class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
export const esc = (v) => String(v).replace(/[&<>"'`]/g, (c) => ESC[c]);
const part = (v) => (v == null || v === false ? '' : v instanceof Raw ? v.s : Array.isArray(v) ? v.map(part).join('') : esc(v));
export function html(strings, ...vals) { let out = strings[0]; for (let i = 0; i < vals.length; i++) out += part(vals[i]) + strings[i + 1]; return new Raw(out); }
export const raw = (s) => new Raw(s); // ONLY for trusted, static markup (icons)

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export function render(el, tpl) { el.innerHTML = tpl instanceof Raw ? tpl.s : esc(tpl); return el; }
export function el(tpl) { const t = document.createElement('template'); t.innerHTML = tpl.s.trim(); return t.content.firstElementChild; }
export function on(root, event, selector, fn) {
  const h = (e) => { const t = e.target.closest(selector); if (t && root.contains(t)) fn(e, t); };
  root.addEventListener(event, h); return () => root.removeEventListener(event, h);
}
export const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const store = {
  get(k, d = null) { try { const v = localStorage.getItem('veltra:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('veltra:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  sget(k) { try { return sessionStorage.getItem('veltra:' + k); } catch { return null; } },
  sset(k, v) { try { sessionStorage.setItem('veltra:' + k, v); } catch { /* ignore */ } },
};
