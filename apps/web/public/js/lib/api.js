// API client. Session is an HttpOnly cookie; the CSRF token is held in memory only.
let csrf = '';
export const session = { user: null, subscriptions: [], googleEnabled: false, listeners: new Set() };
export function setSession(data) {
  session.user = data?.user || null;
  session.subscriptions = data?.subscriptions || [];
  if (data?.csrfToken) csrf = data.csrfToken;
  if (data && 'googleEnabled' in data) session.googleEnabled = data.googleEnabled;
  session.listeners.forEach((f) => f(session));
}
export const hasAccess = (cat) => session.user?.role === 'admin' || session.subscriptions.some((s) => s.category === cat && Date.parse(s.ends_at) > Date.now());

export class ApiError extends Error { constructor(status, message, body) { super(message); this.status = status; this.body = body; } }

export async function api(path, { method = 'GET', body, signal } = {}) {
  const headers = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET' && csrf) headers['x-csrf-token'] = csrf;
  let res;
  try { res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin', signal }); }
  catch (e) { if (e.name === 'AbortError') throw e; throw new ApiError(0, 'Network error — check your connection.'); }
  let data = null; try { data = await res.json(); } catch { /* empty */ }
  if (data?.csrfToken) csrf = data.csrfToken;
  if (!res.ok || res.status === 202) {
    if (res.status === 401 && session.user) { setSession(null); window.dispatchEvent(new CustomEvent('veltra:logout')); }
    throw new ApiError(res.status, data?.error || `Request failed (${res.status})`, data);
  }
  return data;
}
api.get = (p, o) => api(p, o);
api.post = (p, body = {}) => api(p, { method: 'POST', body });
api.put = (p, body) => api(p, { method: 'PUT', body });
api.patch = (p, body) => api(p, { method: 'PATCH', body });
api.del = (p) => api(p, { method: 'DELETE' });

export async function refreshSession() { const d = await api.get('/api/auth/me'); setSession(d); return d; }

// Live stream (SSE) with automatic reconnect handled by EventSource.
let es = null; const subs = { quotes: new Set(), notification: new Set() };
export function stream(event, fn) {
  subs[event].add(fn);
  if (!es && session.user) {
    es = new EventSource('/api/stream');
    es.addEventListener('quotes', (e) => { const d = JSON.parse(e.data); subs.quotes.forEach((f) => f(d)); });
    es.addEventListener('notification', (e) => { const d = JSON.parse(e.data); subs.notification.forEach((f) => f(d)); });
  }
  return () => subs[event].delete(fn);
}
export function closeStream() { es?.close(); es = null; }
