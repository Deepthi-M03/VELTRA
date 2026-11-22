const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
export const price = (v, d = 2) => (v == null || !Number.isFinite(+v) ? '—' : new Intl.NumberFormat('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v));
export const rupees = (paise) => `₹${inr.format(paise / 100)}`;
export const pct = (v, d = 2) => (v == null || !Number.isFinite(+v) ? '—' : `${v > 0 ? '+' : ''}${(+v).toFixed(d)}%`);
export const signed = (v, d = 2) => (v == null || !Number.isFinite(+v) ? '—' : `${v > 0 ? '+' : ''}${price(v, d)}`);
export function compact(v) {
  if (v == null || !Number.isFinite(+v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e7) return `${(v / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${(v / 1e5).toFixed(2)} L`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)} K`;
  return String(Math.round(v));
}
export const cls = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : 'flat');
export const ist = (iso, opts = {}) => (iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', ...opts }) : '—');
export const istTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }) : '—');
export function ago(iso) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return `${Math.round(s)}s ago`; if (s < 3600) return `${Math.round(s / 60)}m ago`; if (s < 86400) return `${Math.round(s / 3600)}h ago`; return `${Math.round(s / 86400)}d ago`;
}
export const statusLabel = (s) => ({ open: 'Awaiting entry', entered: 'Entered', target1_hit: 'Target 1 hit', target2_hit: 'Target 2 hit', stopped: 'Stopped out', expired: 'Expired' }[s] || s);
