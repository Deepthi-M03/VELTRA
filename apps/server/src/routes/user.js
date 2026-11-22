import { t, validate } from '../http/validate.js';
import { bad, notFound } from '../http/core.js';
import { NOTIFICATION_TYPES } from '../services/support.js';

export default function userRoutes(r, { requireAuth, limit }) {
  // ---- Profile ----
  r.patch('/api/profile', requireAuth, async (req, res, ctx) => {
    const b = validate({ name: t.string({ min: 2, max: 80 }), phone: t.string({ optional: true, max: 20, pattern: /^\+?[0-9 -]{7,20}$/ }) }, req.body);
    ctx.db.run('UPDATE users SET name = ?, phone = ?, updated_at = ? WHERE id = ?', b.name, b.phone ?? null, new Date().toISOString(), req.user.id);
    ctx.audit.log(req.user.id, 'user.profile_updated', `user:${req.user.id}`);
    return { user: ctx.auth.publicUser(ctx.db.get('SELECT * FROM users WHERE id = ?', req.user.id)) };
  });
  r.get('/api/profile/sessions', requireAuth, async (req, res, ctx) => ({
    rows: ctx.db.all('SELECT id, ip, user_agent, created_at, last_seen_at FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC', req.user.id)
      .map((s) => ({ ...s, id: s.id.slice(0, 12), current: s.id === req.session.sessionId })),
  }));
  r.post('/api/profile/logout-others', requireAuth, async (req, res, ctx) => { ctx.auth.destroyAllSessions(req.user.id, req.session.sessionId); return { ok: true }; });

  // ---- Watchlists ----
  const ownList = (ctx, req, id) => { const w = ctx.db.get('SELECT * FROM watchlists WHERE id = ? AND user_id = ?', id, req.user.id); if (!w) throw notFound('Watchlist not found'); return w; };
  r.get('/api/watchlists', requireAuth, async (req, res, ctx) => {
    const lists = ctx.db.all('SELECT * FROM watchlists WHERE user_id = ? ORDER BY created_at', req.user.id);
    return { rows: lists.map((w) => ({ ...w, items: ctx.db.all('SELECT instrument_id FROM watchlist_items WHERE watchlist_id = ? ORDER BY position, added_at', w.id)
      .map((i) => ctx.market.instrument(i.instrument_id)).filter(Boolean).map((inst) => ctx.market.quoteView(inst)) })) };
  });
  r.post('/api/watchlists', requireAuth, async (req, res, ctx) => {
    const b = validate({ name: t.string({ min: 1, max: 40 }) }, req.body);
    if (ctx.db.get('SELECT COUNT(*) c FROM watchlists WHERE user_id = ?', req.user.id).c >= 20) throw bad('Maximum 20 watchlists.');
    try { const x = ctx.db.run('INSERT INTO watchlists (user_id, name) VALUES (?,?)', req.user.id, b.name); return { id: Number(x.lastInsertRowid) }; }
    catch (e) { if (String(e.message).includes('UNIQUE')) throw bad('You already have a watchlist with that name.'); throw e; }
  });
  r.patch('/api/watchlists/:id', requireAuth, async (req, res, ctx) => {
    const w = ownList(ctx, req, Number(req.params.id)); const b = validate({ name: t.string({ min: 1, max: 40 }) }, req.body);
    ctx.db.run('UPDATE watchlists SET name = ? WHERE id = ?', b.name, w.id); return { ok: true };
  });
  r.delete('/api/watchlists/:id', requireAuth, async (req, res, ctx) => { const w = ownList(ctx, req, Number(req.params.id)); ctx.db.run('DELETE FROM watchlists WHERE id = ?', w.id); return { ok: true }; });
  r.post('/api/watchlists/:id/items', requireAuth, async (req, res, ctx) => {
    const w = ownList(ctx, req, Number(req.params.id)); const b = validate({ instrumentId: t.int({ min: 1 }) }, req.body);
    if (!ctx.market.instrument(b.instrumentId)) throw notFound('Instrument not found');
    if (ctx.db.get('SELECT COUNT(*) c FROM watchlist_items WHERE watchlist_id = ?', w.id).c >= 100) throw bad('Maximum 100 instruments per watchlist.');
    ctx.db.run('INSERT OR IGNORE INTO watchlist_items (watchlist_id, instrument_id, position) VALUES (?,?,(SELECT COALESCE(MAX(position),0)+1 FROM watchlist_items WHERE watchlist_id = ?))', w.id, b.instrumentId, w.id);
    return { ok: true };
  });
  r.delete('/api/watchlists/:id/items/:instrumentId', requireAuth, async (req, res, ctx) => {
    const w = ownList(ctx, req, Number(req.params.id)); ctx.db.run('DELETE FROM watchlist_items WHERE watchlist_id = ? AND instrument_id = ?', w.id, Number(req.params.instrumentId)); return { ok: true };
  });

  // ---- Price alerts ----
  r.get('/api/alerts', requireAuth, async (req, res, ctx) => ({
    rows: ctx.db.all('SELECT * FROM price_alerts WHERE user_id = ? ORDER BY created_at DESC LIMIT 200', req.user.id)
      .map((a) => { const inst = ctx.market.instrument(a.instrument_id); return { ...a, symbol: inst?.symbol, quote: inst ? ctx.market.quoteView(inst) : null }; }),
  }));
  r.post('/api/alerts', requireAuth, limit('alerts', 60, 60000), async (req, res, ctx) => {
    const b = validate({ instrumentId: t.int({ min: 1 }), condition: t.enum(['above', 'below', 'pct_change_above', 'pct_change_below']), value: t.number({ min: -100, max: 1e8 }) }, req.body);
    if (!ctx.market.instrument(b.instrumentId)) throw notFound('Instrument not found');
    if (ctx.db.get(`SELECT COUNT(*) c FROM price_alerts WHERE user_id = ? AND status = 'active'`, req.user.id).c >= 100) throw bad('Maximum 100 active alerts.');
    const x = ctx.db.run('INSERT INTO price_alerts (user_id, instrument_id, condition, value) VALUES (?,?,?,?)', req.user.id, b.instrumentId, b.condition, b.value);
    return { id: Number(x.lastInsertRowid) };
  });
  r.delete('/api/alerts/:id', requireAuth, async (req, res, ctx) => {
    const x = ctx.db.run(`UPDATE price_alerts SET status = 'cancelled' WHERE id = ? AND user_id = ? AND status = 'active'`, Number(req.params.id), req.user.id);
    if (!x.changes) throw notFound('Active alert not found'); return { ok: true };
  });

  // ---- Trade journal (paper + actual, always labelled) ----
  r.get('/api/journal', requireAuth, async (req, res, ctx) => {
    const rows = ctx.db.all('SELECT * FROM journal_entries WHERE user_id = ? ORDER BY opened_at DESC LIMIT 500', req.user.id).map((j) => {
      const inst = ctx.market.instrument(j.instrument_id); const q = inst ? ctx.market.quoteView(inst) : null;
      const mark = j.exit_price ?? q?.ltp ?? null; const sign = j.side === 'BUY' ? 1 : -1;
      return { ...j, symbol: inst?.symbol, markPrice: mark, markDataStatus: j.exit_price ? 'CLOSED' : q?.dataStatus, pnl: mark != null ? (mark - j.entry_price) * j.quantity * sign : null };
    });
    const sum = (k) => { const c = rows.filter((r) => r.kind === k && r.exit_price != null); const w = c.filter((r) => r.pnl > 0).length;
      return { closed: c.length, open: rows.filter((r) => r.kind === k && r.exit_price == null).length, realizedPnl: c.reduce((a, r) => a + r.pnl, 0), winRate: c.length ? w / c.length : null }; };
    return { rows, summary: { paper: sum('paper'), actual: sum('actual') } };
  });
  r.post('/api/journal', requireAuth, async (req, res, ctx) => {
    const b = validate({ instrumentId: t.int({ min: 1 }), kind: t.enum(['paper', 'actual']), side: t.enum(['BUY', 'SELL']), quantity: t.number({ min: 0.0001, max: 1e7 }),
      entryPrice: t.number({ optional: true, min: 0.0001 }), stopLoss: t.number({ optional: true, min: 0 }), target: t.number({ optional: true, min: 0 }),
      recommendationId: t.int({ optional: true }), notes: t.string({ optional: true, max: 2000 }), tags: t.string({ optional: true, max: 200 }) }, req.body);
    const inst = ctx.market.instrument(b.instrumentId); if (!inst) throw notFound('Instrument not found');
    let entry = b.entryPrice;
    if (b.kind === 'paper') {
      // Paper trades fill at the current recorded price so results can't be cherry-picked.
      const q = ctx.market.quoteView(inst);
      if (q.ltp == null || q.dataStatus === 'UNAVAILABLE') throw bad('No valid price available to fill a paper trade.');
      entry = q.ltp;
    } else if (!entry) throw bad('entryPrice is required for actual trades.');
    const x = ctx.db.run(`INSERT INTO journal_entries (user_id, instrument_id, recommendation_id, kind, side, quantity, entry_price, stop_loss, target, opened_at, notes, tags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      req.user.id, inst.id, b.recommendationId ?? null, b.kind, b.side, b.quantity, entry, b.stopLoss ?? null, b.target ?? null, new Date().toISOString(), b.notes ?? null, b.tags ?? null);
    return { id: Number(x.lastInsertRowid), entryPrice: entry };
  });
  r.post('/api/journal/:id/close', requireAuth, async (req, res, ctx) => {
    const j = ctx.db.get('SELECT * FROM journal_entries WHERE id = ? AND user_id = ?', Number(req.params.id), req.user.id);
    if (!j) throw notFound(); if (j.exit_price != null) throw bad('Already closed.');
    const b = validate({ exitPrice: t.number({ optional: true, min: 0.0001 }), notes: t.string({ optional: true, max: 2000 }) }, req.body);
    let exit = b.exitPrice;
    if (j.kind === 'paper') { const q = ctx.market.quoteView(ctx.market.instrument(j.instrument_id)); if (q.ltp == null) throw bad('No valid price to close at.'); exit = q.ltp; }
    else if (!exit) throw bad('exitPrice is required.');
    ctx.db.run('UPDATE journal_entries SET exit_price = ?, closed_at = ?, notes = COALESCE(?, notes) WHERE id = ?', exit, new Date().toISOString(), b.notes ?? null, j.id);
    return { ok: true, exitPrice: exit };
  });
  r.delete('/api/journal/:id', requireAuth, async (req, res, ctx) => {
    const j = ctx.db.get('SELECT * FROM journal_entries WHERE id = ? AND user_id = ?', Number(req.params.id), req.user.id);
    if (!j) throw notFound();
    if (j.kind === 'paper') throw bad('Paper trades are kept for an honest performance record and cannot be deleted.');
    ctx.db.run('DELETE FROM journal_entries WHERE id = ?', j.id); return { ok: true };
  });

  // ---- Notifications ----
  r.get('/api/notifications', requireAuth, async (req, res, ctx) => {
    const rows = ctx.db.all(`SELECT * FROM notifications WHERE user_id = ? OR user_id IS NULL ORDER BY created_at DESC LIMIT 100`, req.user.id);
    return { rows, unread: rows.filter((n) => !n.read_at && n.user_id).length };
  });
  r.post('/api/notifications/read-all', requireAuth, async (req, res, ctx) => { ctx.db.run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', new Date().toISOString(), req.user.id); return { ok: true }; });
  r.get('/api/notifications/preferences', requireAuth, async (req, res, ctx) => ({ rows: ctx.notifier.prefs(req.user.id) }));
  r.put('/api/notifications/preferences', requireAuth, async (req, res, ctx) => {
    const b = validate({ rows: t.array(t.object({ type: t.enum(NOTIFICATION_TYPES), inApp: t.bool({ optional: true }), browser: t.bool({ optional: true }), push: t.bool({ optional: true }), email: t.bool({ optional: true }) }), { max: 20 }) }, req.body);
    for (const p of b.rows) ctx.notifier.setPref(req.user.id, p);
    return { rows: ctx.notifier.prefs(req.user.id) };
  });
  r.post('/api/push/register', requireAuth, async (req, res, ctx) => {
    const b = validate({ platform: t.enum(['android', 'web']), token: t.string({ max: 4096 }) }, req.body);
    ctx.db.run('INSERT INTO push_devices (user_id, platform, token) VALUES (?,?,?) ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id', req.user.id, b.platform, b.token);
    return { ok: true };
  });

  // ---- Contact (public) ----
  r.post('/api/contact', limit('contact', 5, 60 * 60000), async (req, res, ctx) => {
    const b = validate({ name: t.string({ min: 2, max: 80 }), email: t.email(), subject: t.string({ min: 3, max: 120 }), message: t.string({ min: 10, max: 4000 }) }, req.body);
    ctx.db.run('INSERT INTO contact_messages (name, email, subject, message, user_id) VALUES (?,?,?,?,?)', b.name, b.email, b.subject, b.message, req.user?.id ?? null);
    return { ok: true };
  });
}
