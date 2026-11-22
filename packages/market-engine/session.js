// Market-session management in IST (UTC+05:30, no DST).
const IST_OFFSET_MS = 330 * 60 * 1000;

export const SEGMENT_HOURS = Object.freeze({
  // open/close are regular-session times; monitor window is configurable for equities.
  NSE_EQ: { open: '09:15', close: '15:30', preOpen: '09:00' },
  NSE_FO: { open: '09:15', close: '15:30', preOpen: '09:00' },
  NSE_CD: { open: '09:00', close: '17:00' },
  MCX: { open: '09:00', close: '23:30' }, // evening close varies (23:30/23:55) with US DST — provider should confirm.
});

export function toIST(date = new Date()) {
  const d = new Date(date.getTime() + IST_OFFSET_MS);
  return {
    date: d.toISOString().slice(0, 10),
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
    weekday: d.getUTCDay(), // 0 Sunday
    hhmm: d.toISOString().slice(11, 16),
  };
}
export const hhmmToMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
export const istDateKey = (tsMs) => new Date(tsMs + IST_OFFSET_MS).toISOString().slice(0, 10);
export function istToUtcMs(dateStr, hhmm) { return Date.parse(`${dateStr}T${hhmm}:00+05:30`); }

export class MarketCalendar {
  // holidays: [{date, exchange, kind, open_time, close_time, description}]
  constructor(holidays = []) { this.setHolidays(holidays); }
  setHolidays(rows) {
    this.byDate = new Map();
    for (const r of rows) this.byDate.set(`${r.exchange}:${r.date}`, r);
  }
  dayInfo(dateStr, exchange = 'NSE') {
    const entry = this.byDate.get(`${exchange}:${dateStr}`);
    const wd = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
    if (entry?.kind === 'special_session') return { trading: true, special: true, entry };
    if (entry?.kind === 'holiday') return { trading: false, reason: entry.description, entry };
    if (wd === 0 || wd === 6) return { trading: false, reason: 'Weekend' };
    return { trading: true };
  }
  // Status for a segment at a given instant.
  status(segment = 'NSE_EQ', now = new Date(), { monitorStart = '09:10', monitorEnd = '15:30' } = {}) {
    const exch = segment === 'MCX' ? 'MCX' : 'NSE';
    const ist = toIST(now);
    const info = this.dayInfo(ist.date, exch === 'MCX' ? 'NSE' : exch); // MCX holidays: add rows with exchange='MCX'
    const mcxInfo = exch === 'MCX' ? this.dayInfo(ist.date, 'MCX') : null;
    const day = mcxInfo && mcxInfo.entry ? mcxInfo : info;
    const hours = SEGMENT_HOURS[segment];
    let open = hours.open, close = hours.close;
    if (day.special && day.entry.open_time) { open = day.entry.open_time; close = day.entry.close_time; }
    const base = { segment, istDate: ist.date, istTime: ist.hhmm, open, close };
    if (!day.trading) return { ...base, phase: 'CLOSED', reason: day.reason, monitoring: false, nextOpen: this.nextOpen(segment, now) };
    if (day.special && !day.entry.open_time) return { ...base, phase: 'SPECIAL_TBA', reason: day.entry.description, monitoring: false };
    const m = ist.minutes;
    const isEq = segment === 'NSE_EQ' || segment === 'NSE_FO';
    const monStart = isEq ? hhmmToMin(monitorStart) : hhmmToMin(open);
    const monEnd = isEq ? hhmmToMin(monitorEnd) : hhmmToMin(close);
    let phase;
    if (m < monStart) phase = 'PRE_MARKET';
    else if (m < hhmmToMin(open)) phase = 'PRE_OPEN';
    else if (m < hhmmToMin(close)) phase = 'OPEN';
    else phase = 'CLOSED';
    return {
      ...base, phase, special: !!day.special, reason: day.special ? day.entry.description : undefined,
      monitoring: m >= monStart && m < monEnd,
      nextOpen: phase === 'CLOSED' ? this.nextOpen(segment, now) : undefined,
    };
  }
  nextOpen(segment, now = new Date()) {
    const exch = segment === 'MCX' ? 'MCX' : 'NSE';
    let t = now.getTime();
    for (let i = 1; i <= 15; i++) {
      const d = toIST(new Date(t + i * 86400000)).date;
      const info = this.dayInfo(d, exch === 'MCX' ? 'NSE' : exch);
      if (info.trading && !(info.special && !info.entry.open_time)) {
        const open = info.special ? info.entry.open_time : SEGMENT_HOURS[segment].open;
        return new Date(istToUtcMs(d, open)).toISOString();
      }
    }
    return null;
  }
}
