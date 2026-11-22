// Minimal HTTP framework: routing, JSON bodies, cookies, errors, security headers, rate limiting.
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

export class HttpError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}
export const bad = (m, d) => new HttpError(400, m, d);
export const unauthorized = (m = 'Authentication required') => new HttpError(401, m);
export const forbidden = (m = 'Forbidden') => new HttpError(403, m);
export const notFound = (m = 'Not found') => new HttpError(404, m);

export class Router {
  constructor() { this.routes = []; }
  add(method, path, ...handlers) {
    const keys = [];
    const re = new RegExp('^' + path.replace(/\/:([a-zA-Z_]+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$');
    this.routes.push({ method, re, keys, handlers });
  }
  get(p, ...h) { this.add('GET', p, ...h); } post(p, ...h) { this.add('POST', p, ...h); }
  put(p, ...h) { this.add('PUT', p, ...h); } patch(p, ...h) { this.add('PATCH', p, ...h); } delete(p, ...h) { this.add('DELETE', p, ...h); }
  match(method, pathname) {
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const m = pathname.match(r.re);
      if (m) return { handlers: r.handlers, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
    }
    return null;
  }
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('='); if (i < 0) continue;
    const k = part.slice(0, i).trim(); if (!k) continue;
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ignore malformed */ }
  }
  return out;
}

export function serializeCookie(name, value, { maxAge, httpOnly = true, secure = false, sameSite = 'Lax', path = '/' } = {}) {
  let s = `${name}=${encodeURIComponent(value)}; Path=${path}; SameSite=${sameSite}`;
  if (maxAge !== undefined) s += `; Max-Age=${maxAge}`;
  if (httpOnly) s += '; HttpOnly';
  if (secure) s += '; Secure';
  return s;
}

export async function readBody(req, limit = 100_000) {
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > limit) throw new HttpError(413, 'Request body too large'); chunks.push(c); }
  return Buffer.concat(chunks).toString('utf8');
}

export function securityHeaders(res, { isProd }) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'", "script-src 'self' https://checkout.razorpay.com", "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:", "font-src 'self' data:", "connect-src 'self'", "frame-src https://api.razorpay.com https://checkout.razorpay.com",
    "object-src 'none'", "base-uri 'self'", "form-action 'self' https://accounts.google.com", "frame-ancestors 'none'",
  ].join('; '));
  if (isProd) res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
}

export function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

// Fixed-window rate limiter keyed by bucket + client.
export class RateLimiter {
  constructor() { this.buckets = new Map(); setInterval(() => this.sweep(), 60000).unref(); }
  hit(key, limit, windowMs) {
    const now = Date.now();
    let b = this.buckets.get(key);
    if (!b || now >= b.reset) { b = { count: 0, reset: now + windowMs }; this.buckets.set(key, b); }
    b.count++;
    return { allowed: b.count <= limit, remaining: Math.max(0, limit - b.count), reset: b.reset };
  }
  sweep() { const now = Date.now(); for (const [k, b] of this.buckets) if (now >= b.reset) this.buckets.delete(k); }
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

export async function serveStatic(root, pathname, res, { spaFallback = 'index.html' } = {}) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return false; }
  const target = normalize(join(root, rel));
  if (!target.startsWith(normalize(root + sep)) && target !== normalize(root)) return false; // traversal guard
  let file = target;
  try { const s = await stat(file); if (s.isDirectory()) file = join(file, 'index.html'); }
  catch { if (extname(rel)) return false; file = join(root, spaFallback); }
  try {
    const data = await readFile(file);
    const ext = extname(file);
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=3600' });
    res.end(data);
    return true;
  } catch { return false; }
}

export function clientIp(req, trustProxy) {
  if (trustProxy) { const f = req.headers['x-forwarded-for']; if (f) return String(f).split(',')[0].trim(); }
  return req.socket.remoteAddress || 'unknown';
}
