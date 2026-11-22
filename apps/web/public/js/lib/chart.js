// VELTRA CandleChart — dependency-free canvas charting.
// Candles + volume, EMA/BB/VWAP overlays, RSI & MACD panes, level markers, zoom/pan/pinch, crosshair,
// animated y-range transitions and an intro sweep. Renders only when something changed.
import { reduced } from './motion.js';

const C = { bg: '#0B0609', grid: 'rgba(217,161,143,0.07)', axis: '#8F7A74', up: '#28B889', down: '#F05268', upFill: 'rgba(40,184,137,0.85)', downFill: 'rgba(240,82,104,0.85)',
  ema20: '#F2C9B9', ema50: '#C9294B', bb: 'rgba(217,161,143,0.55)', bbFill: 'rgba(217,161,143,0.05)', vwap: '#E8B85A', rsi: '#D9A18F', macd: '#F2C9B9', signal: '#C9294B',
  cross: 'rgba(242,201,185,0.45)', entry: 'rgba(217,161,143,0.16)', stop: '#F05268', target: '#28B889', sr: 'rgba(217,161,143,0.6)' };
const FONT = '11px "Cascadia Mono", Consolas, ui-monospace, monospace';
const AXIS_W = 68, XAXIS_H = 22;

export class CandleChart {
  constructor(host, { onHover } = {}) {
    this.host = host; this.onHover = onHover;
    this.canvas = document.createElement('canvas'); host.append(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.bars = []; this.series = {}; this.levels = null;
    this.opts = { ema20: true, ema50: true, bb: false, vwap: true, volume: true, rsi: true, macd: true };
    this.view = { start: 0, count: 120 }; this.y = null; this.yTarget = null;
    this.hover = null; this.sweep = 1; this.dirty = true; this.pointers = new Map();
    this.#bind();
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(host);
    this.resize(); this.#loop();
  }
  destroy() { cancelAnimationFrame(this.raf); this.ro.disconnect(); this.canvas.remove(); this.destroyed = true; }

  setOptions(o) { Object.assign(this.opts, o); this.dirty = true; }
  setLevels(l) { this.levels = l; this.dirty = true; }

  // keepView: live update of the same instrument/timeframe. Otherwise animate in.
  setData(bars, series = {}, { keepView = false } = {}) {
    const atRightEdge = this.view.start + this.view.count >= this.bars.length - 1;
    const prevLen = this.bars.length;
    this.bars = bars; this.series = series;
    if (!keepView || !prevLen) {
      this.view.count = Math.min(Math.max(40, Math.round(this.w / 9) || 120), bars.length);
      this.view.start = Math.max(0, bars.length - this.view.count);
      this.sweep = reduced() ? 1 : 0; this.sweepT0 = performance.now();
    } else if (atRightEdge) this.view.start = Math.max(0, bars.length - this.view.count);
    this.dirty = true;
  }

  resize() {
    const r = this.host.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = r.width; this.h = r.height; this.canvas.width = r.width * dpr; this.canvas.height = r.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); this.dirty = true;
  }

  #layout() {
    const sub = (this.opts.rsi ? 1 : 0) + (this.opts.macd ? 1 : 0);
    const subH = sub ? Math.max(64, this.h * 0.15) : 0;
    const mainH = this.h - XAXIS_H - sub * subH;
    const panes = { main: { top: 0, h: mainH } };
    let top = mainH;
    if (this.opts.rsi) { panes.rsi = { top, h: subH }; top += subH; }
    if (this.opts.macd) { panes.macd = { top, h: subH }; top += subH; }
    return { panes, plotW: this.w - AXIS_W };
  }
  #visible() {
    const s = Math.max(0, Math.floor(this.view.start)), e = Math.min(this.bars.length, Math.ceil(this.view.start + this.view.count));
    return [s, e];
  }
  #targetRange(s, e) {
    let lo = Infinity, hi = -Infinity;
    for (let i = s; i < e; i++) { const b = this.bars[i]; if (b.low < lo) lo = b.low; if (b.high > hi) hi = b.high;
      if (this.opts.bb && this.series.bbUpper?.[i] != null) { hi = Math.max(hi, this.series.bbUpper[i]); lo = Math.min(lo, this.series.bbLower[i]); } }
    if (this.levels) {
      for (const v of [this.levels.stopLoss, this.levels.target1, this.levels.entryLow, this.levels.entryHigh]) {
        if (v != null && v > lo - (hi - lo) * 0.6 && v < hi + (hi - lo) * 0.6) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      }
    }
    if (!Number.isFinite(lo)) return { lo: 0, hi: 1 };
    const pad = (hi - lo) * 0.07 || hi * 0.01;
    return { lo: lo - pad, hi: hi + pad };
  }

  #loop() {
    this.raf = requestAnimationFrame(() => this.#loop());
    if (this.destroyed || !this.w) return;
    let animating = false;
    if (this.sweep < 1) { this.sweep = Math.min(1, (performance.now() - this.sweepT0) / 900); animating = true; }
    const [s, e] = this.#visible();
    if (this.bars.length) {
      const t = this.#targetRange(s, e);
      if (!this.y) this.y = { ...t };
      const k = reduced() ? 1 : 0.18;
      const dl = t.lo - this.y.lo, dh = t.hi - this.y.hi;
      if (Math.abs(dl) + Math.abs(dh) > (t.hi - t.lo) * 0.0005) { this.y.lo += dl * k; this.y.hi += dh * k; animating = true; } else { this.y = t; }
    }
    if (this.dirty || animating) { this.dirty = false; this.#draw(s, e); }
  }

  #draw(s, e) {
    const g = this.ctx, { panes, plotW } = this.#layout(), W = this.w, H = this.h;
    g.clearRect(0, 0, W, H); g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
    if (!this.bars.length) { g.fillStyle = C.axis; g.font = FONT; g.fillText('No data', 16, 24); return; }
    const bw = plotW / this.view.count, x = (i) => (i - this.view.start + 0.5) * bw;
    const m = panes.main, { lo, hi } = this.y, py = (v) => m.top + (1 - (v - lo) / (hi - lo)) * (m.h - 8) + 4;
    const sweepX = plotW * (1 - Math.pow(1 - this.sweep, 3));
    g.font = FONT; g.textBaseline = 'middle';

    // grid + price axis
    const step = niceStep((hi - lo) / 6);
    g.strokeStyle = C.grid; g.lineWidth = 1; g.fillStyle = C.axis;
    for (let v = Math.ceil(lo / step) * step; v < hi; v += step) { const yy = Math.round(py(v)) + 0.5; g.beginPath(); g.moveTo(0, yy); g.lineTo(plotW, yy); g.stroke(); g.fillText(fmt(v), plotW + 8, yy); }
    // time axis
    const every = Math.max(1, Math.round(110 / bw));
    g.textAlign = 'center';
    for (let i = s; i < e; i++) if (i % every === 0) { const xx = x(i); g.strokeStyle = C.grid; g.beginPath(); g.moveTo(xx, 0); g.lineTo(xx, H - XAXIS_H); g.stroke(); g.fillStyle = C.axis; g.fillText(tlabel(this.bars[i].ts, this.bars), xx, H - XAXIS_H / 2); }
    g.textAlign = 'left';

    g.save(); g.beginPath(); g.rect(0, 0, Math.min(plotW, sweepX), H - XAXIS_H); g.clip();
    // entry zone band
    const L = this.levels;
    if (L?.entryLow != null) { g.fillStyle = C.entry; const y1 = py(L.entryHigh), y2 = py(L.entryLow); g.fillRect(0, y1, plotW, Math.max(1, y2 - y1)); }
    // volume
    if (this.opts.volume) {
      let vmax = 0; for (let i = s; i < e; i++) vmax = Math.max(vmax, this.bars[i].volume || 0);
      if (vmax > 0) for (let i = s; i < e; i++) { const b = this.bars[i], vh = ((b.volume || 0) / vmax) * m.h * 0.18; g.fillStyle = b.close >= b.open ? 'rgba(40,184,137,0.18)' : 'rgba(240,82,104,0.18)'; g.fillRect(x(i) - bw * 0.35, m.top + m.h - vh, bw * 0.7, vh); }
    }
    // Bollinger
    if (this.opts.bb && this.series.bbUpper) {
      g.fillStyle = C.bbFill; g.beginPath(); let started = false;
      for (let i = s; i < e; i++) { const v = this.series.bbUpper[i]; if (v == null) continue; if (!started) { g.moveTo(x(i), py(v)); started = true; } else g.lineTo(x(i), py(v)); }
      for (let i = e - 1; i >= s; i--) { const v = this.series.bbLower[i]; if (v != null) g.lineTo(x(i), py(v)); }
      g.closePath(); g.fill();
      this.#line(this.series.bbUpper, s, e, x, py, C.bb, 1, [4, 4]); this.#line(this.series.bbLower, s, e, x, py, C.bb, 1, [4, 4]);
    }
    // candles
    for (let i = s; i < e; i++) {
      const b = this.bars[i], up = b.close >= b.open, cx = x(i);
      g.strokeStyle = up ? C.up : C.down; g.lineWidth = 1;
      g.beginPath(); g.moveTo(Math.round(cx) + 0.5, py(b.high)); g.lineTo(Math.round(cx) + 0.5, py(b.low)); g.stroke();
      const yo = py(b.open), yc = py(b.close), bodyW = Math.max(1, bw * 0.66);
      g.fillStyle = up ? C.upFill : C.downFill; g.fillRect(cx - bodyW / 2, Math.min(yo, yc), bodyW, Math.max(1, Math.abs(yc - yo)));
    }
    if (this.opts.ema20) this.#line(this.series.ema20, s, e, x, py, C.ema20, 1.4);
    if (this.opts.ema50) this.#line(this.series.ema50, s, e, x, py, C.ema50, 1.4);
    if (this.opts.vwap) this.#line(this.series.vwap, s, e, x, py, C.vwap, 1.2, [2, 3]);
    g.restore();

    // level markers (drawn across full width, labelled on the axis)
    if (L) {
      const mark = (v, color, label, dash = [6, 4]) => {
        if (v == null || v < lo || v > hi) return; const yy = Math.round(py(v)) + 0.5;
        g.strokeStyle = color; g.setLineDash(dash); g.lineWidth = 1; g.beginPath(); g.moveTo(0, yy); g.lineTo(plotW, yy); g.stroke(); g.setLineDash([]);
        g.fillStyle = color; roundRect(g, plotW + 2, yy - 9, AXIS_W - 4, 18, 4); g.fill();
        g.fillStyle = '#10090D'; g.fillText(fmt(v), plotW + 7, yy); g.fillStyle = color; g.textAlign = 'right'; g.fillText(label, plotW - 6, yy - 9); g.textAlign = 'left';
      };
      mark(L.support, C.sr, 'SUPPORT', [2, 4]); mark(L.resistance, C.sr, 'RESISTANCE', [2, 4]);
      mark(L.stopLoss, C.stop, 'STOP-LOSS'); mark(L.target1, C.target, 'TARGET 1'); mark(L.target2, C.target, 'TARGET 2', [2, 3]);
      if (L.entryLow != null) { const yy = py((L.entryLow + L.entryHigh) / 2); g.fillStyle = '#D9A18F'; g.textAlign = 'right'; g.fillText('ENTRY ZONE', plotW - 6, yy); g.textAlign = 'left'; }
    }
    // last price tag
    const last = this.bars[this.bars.length - 1];
    if (last.close >= lo && last.close <= hi) { const yy = py(last.close), up = last.close >= last.open; g.fillStyle = up ? C.up : C.down; roundRect(g, plotW + 2, yy - 9, AXIS_W - 4, 18, 4); g.fill(); g.fillStyle = '#10090D'; g.fillText(fmt(last.close), plotW + 7, yy); }

    // RSI pane
    if (panes.rsi) {
      const p = panes.rsi, ry = (v) => p.top + 6 + (1 - v / 100) * (p.h - 12);
      this.#paneFrame(p, plotW, 'RSI 14');
      g.fillStyle = 'rgba(165,30,61,0.08)'; g.fillRect(0, ry(70), plotW, ry(30) - ry(70));
      for (const lv of [30, 70]) { g.strokeStyle = C.grid; g.beginPath(); g.moveTo(0, ry(lv)); g.lineTo(plotW, ry(lv)); g.stroke(); g.fillStyle = C.axis; g.fillText(String(lv), plotW + 8, ry(lv)); }
      g.save(); g.beginPath(); g.rect(0, p.top, Math.min(plotW, sweepX), p.h); g.clip(); this.#line(this.series.rsi14, s, e, x, ry, C.rsi, 1.3); g.restore();
    }
    // MACD pane
    if (panes.macd) {
      const p = panes.macd; let mx = 0;
      for (let i = s; i < e; i++) for (const k of ['macd', 'macdSignal', 'macdHist']) { const v = this.series[k]?.[i]; if (v != null) mx = Math.max(mx, Math.abs(v)); }
      mx = mx || 1; const my = (v) => p.top + p.h / 2 - (v / mx) * (p.h / 2 - 6);
      this.#paneFrame(p, plotW, 'MACD 12 26 9');
      g.save(); g.beginPath(); g.rect(0, p.top, Math.min(plotW, sweepX), p.h); g.clip();
      for (let i = s; i < e; i++) { const v = this.series.macdHist?.[i]; if (v == null) continue; g.fillStyle = v >= 0 ? 'rgba(40,184,137,0.55)' : 'rgba(240,82,104,0.55)'; const y0 = my(0), y1 = my(v); g.fillRect(x(i) - bw * 0.3, Math.min(y0, y1), bw * 0.6, Math.abs(y1 - y0)); }
      this.#line(this.series.macd, s, e, x, my, C.macd, 1.2); this.#line(this.series.macdSignal, s, e, x, my, C.signal, 1.2);
      g.restore();
    }
    // crosshair
    if (this.hover && this.hover.x < plotW) {
      const i = Math.round(this.view.start + this.hover.x / bw - 0.5);
      if (i >= 0 && i < this.bars.length) {
        g.strokeStyle = C.cross; g.setLineDash([3, 3]);
        g.beginPath(); g.moveTo(Math.round(x(i)) + 0.5, 0); g.lineTo(Math.round(x(i)) + 0.5, H - XAXIS_H); g.stroke();
        g.beginPath(); g.moveTo(0, this.hover.y + 0.5); g.lineTo(plotW, this.hover.y + 0.5); g.stroke(); g.setLineDash([]);
        if (this.hover.y < m.h) { const v = lo + (1 - (this.hover.y - 4) / (m.h - 8)) * (hi - lo); g.fillStyle = '#35101D'; roundRect(g, plotW + 2, this.hover.y - 9, AXIS_W - 4, 18, 4); g.fill(); g.fillStyle = '#F2C9B9'; g.fillText(fmt(v), plotW + 7, this.hover.y); }
        if (this.hoverIdx !== i) { this.hoverIdx = i; this.onHover?.(this.bars[i], i, this.series); }
      }
    }
  }
  #paneFrame(p, plotW, label) {
    const g = this.ctx; g.strokeStyle = 'rgba(217,161,143,0.14)'; g.beginPath(); g.moveTo(0, p.top + 0.5); g.lineTo(this.w, p.top + 0.5); g.stroke();
    g.fillStyle = C.axis; g.fillText(label, 8, p.top + 11);
  }
  #line(arr, s, e, x, y, color, width = 1, dash = []) {
    if (!arr) return; const g = this.ctx; g.strokeStyle = color; g.lineWidth = width; g.setLineDash(dash); g.beginPath();
    let started = false; for (let i = s; i < e; i++) { const v = arr[i]; if (v == null) { started = false; continue; } if (!started) { g.moveTo(x(i), y(v)); started = true; } else g.lineTo(x(i), y(v)); }
    g.stroke(); g.setLineDash([]);
  }

  #clampView() {
    const n = this.bars.length; this.view.count = Math.max(15, Math.min(n || 15, this.view.count));
    this.view.start = Math.max(-this.view.count * 0.2, Math.min(n - this.view.count * 0.3, this.view.start)); this.dirty = true;
  }
  zoom(factor, anchorX) {
    const { plotW } = this.#layout(), frac = anchorX != null ? Math.min(1, Math.max(0, anchorX / plotW)) : 1;
    const anchor = this.view.start + this.view.count * frac;
    this.view.count *= factor; this.view.start = anchor - this.view.count * frac; this.#clampView();
  }
  reset() { this.view.count = Math.min(Math.max(40, Math.round(this.w / 9)), this.bars.length); this.view.start = this.bars.length - this.view.count; this.dirty = true; }

  #bind() {
    const c = this.canvas;
    c.addEventListener('wheel', (e) => { e.preventDefault(); const r = c.getBoundingClientRect(); this.zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12, e.clientX - r.left); }, { passive: false });
    c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); this.dragX = e.clientX; this.pinch = null; });
    c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect();
      this.hover = { x: e.clientX - r.left, y: e.clientY - r.top }; this.dirty = true;
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinch) this.zoom(this.pinch / d, (a.x + b.x) / 2 - r.left); this.pinch = d; return;
      }
      const { plotW } = this.#layout(), bw = plotW / this.view.count;
      this.view.start -= (e.clientX - this.dragX) / bw; this.dragX = e.clientX; this.#clampView();
    });
    const up = (e) => { this.pointers.delete(e.pointerId); if (this.pointers.size < 2) this.pinch = null; };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    c.addEventListener('pointerleave', () => { this.hover = null; this.hoverIdx = null; this.dirty = true; this.onHover?.(null); });
    c.addEventListener('dblclick', () => this.reset());
  }
}

function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw || 1))), n = raw / p; return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * p; }
function fmt(v) { const a = Math.abs(v); return a >= 1000 ? v.toFixed(1) : a >= 10 ? v.toFixed(2) : v.toFixed(4); }
function tlabel(ts, bars) {
  const d = new Date(ts + 330 * 60000), daily = bars.length > 1 && bars[1].ts - bars[0].ts >= 86400000 - 1;
  return daily ? d.toISOString().slice(5, 10) : d.toISOString().slice(11, 16);
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

// Tiny sparkline helper for stat cards.
export function sparkline(canvas, values, color = '#D9A18F') {
  const dpr = Math.min(2, devicePixelRatio || 1), r = canvas.getBoundingClientRect();
  canvas.width = r.width * dpr; canvas.height = r.height * dpr; const g = canvas.getContext('2d'); g.scale(dpr, dpr);
  const v = values.filter((x) => x != null); if (v.length < 2) return;
  const lo = Math.min(...v), hi = Math.max(...v), X = (i) => (i / (v.length - 1)) * r.width, Y = (x) => r.height - 4 - ((x - lo) / (hi - lo || 1)) * (r.height - 8);
  const grad = g.createLinearGradient(0, 0, 0, r.height); grad.addColorStop(0, color + '55'); grad.addColorStop(1, color + '00');
  g.beginPath(); v.forEach((x, i) => (i ? g.lineTo(X(i), Y(x)) : g.moveTo(X(i), Y(x)))); g.strokeStyle = color; g.lineWidth = 1.4; g.stroke();
  g.lineTo(r.width, r.height); g.lineTo(0, r.height); g.closePath(); g.fillStyle = grad; g.fill();
}
