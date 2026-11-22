import { html, render, $, $$ } from '../../lib/dom.js';
import { api } from '../../lib/api.js';
import { enter, countTo } from '../../lib/motion.js';
import { loader, toast, errToast, confirmDialog, formData, empty, badge, modal } from '../../lib/ui.js';
import { rupees, ist, price } from '../../lib/format.js';
import { head } from './common.js';
import { CATEGORY_IDS } from '/js/shared/constants.js';

const TABS = [['overview', 'Overview'], ['health', 'System health'], ['users', 'Users'], ['subs', 'Subscriptions'], ['payments', 'Payments'], ['recos', 'Recommendations'], ['config', 'Configuration'], ['holidays', 'Market calendar'], ['notify', 'Notifications'], ['audit', 'Audit log'], ['errors', 'Error log'], ['contact', 'Support inbox']];

export default async function admin(root) {
  let tab = 'overview';
  render(root, html`${head('Control', 'Administration')}<div class="admin-tabs" role="tablist">${TABS.map(([k, l]) => html`<button role="tab" data-t="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`)}</div><div id="a"></div>`);
  root.querySelector('.admin-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (!b) return; tab = b.dataset.t; $$('.admin-tabs button', root).forEach((x) => x.classList.toggle('on', x === b)); show(); });
  const box = () => $('#a', root);
  const tbl = (cols, rows, row) => (rows.length ? html`<div class="table-wrap"><table class="t"><thead><tr>${cols.map((c) => html`<th>${c}</th>`)}</tr></thead><tbody>${rows.map(row)}</tbody></table></div>` : empty('Nothing here'));

  const views = {
    async overview() {
      const s = await api.get('/api/admin/summary');
      const t = [['Users', s.users, `${s.newUsers24h} new (24h)`], ['Active sessions', s.activeSessions], ['Active subscriptions', s.activeSubscriptions], ['Revenue (24h)', rupees(s.revenuePaise24h), `Total ${rupees(s.revenuePaiseTotal)}`], ['Failed payments (24h)', s.failedPayments24h], ['Open setups', s.openRecommendations], ['Errors (24h)', s.errors24h], ['New support messages', s.newContactMessages]];
      render(box(), html`<div class="g-4">${t.map(([l, v, sub]) => html`<div class="glass stat-card"><div class="lbl">${l}</div><div class="val">${v}</div><div class="small muted">${sub || ''}</div></div>`)}</div>`);
    },
    async health() {
      const h = await api.get('/api/admin/health');
      const dot = (ok, warn) => html`<span class="health-dot ${ok ? 'ok' : warn ? 'warn' : 'bad'}"></span>`;
      render(box(), html`<div class="g-2">
        <section class="glass card"><h3>${dot(h.market.connected && !h.market.stale, h.market.dataStatus === 'DEMO')}Market data · ${h.market.provider}</h3><dl class="kv"><dt>Status</dt><dd>${badge(h.market.dataStatus)}</dd><dt>Configured</dt><dd>${String(h.market.configured)}</dd><dt>Connected</dt><dd>${String(h.market.connected)}</dd><dt>Stale</dt><dd>${String(h.market.stale)}</dd><dt>Last success</dt><dd>${ist(h.market.lastSuccessAt, { second: '2-digit' })}</dd><dt>Accepted / rejected quotes</dt><dd>${h.market.acceptedQuotes} / ${h.market.rejectedQuotes}</dd><dt>Instruments</dt><dd>${h.market.instruments}</dd><dt>Last error</dt><dd>${h.market.lastError || '—'}</dd></dl>
          <h4 style="margin-top:14px" class="small">Sessions</h4>${tbl(['Segment', 'Phase', 'Hours', 'Monitoring'], h.market.sessions, (s) => html`<tr><td>${s.segment}</td><td>${s.displayPhase || s.phase}${s.reason ? ` · ${s.reason}` : ''}</td><td>${s.open}–${s.close}</td><td>${String(s.monitoring)}</td></tr>`)}</section>
        <div class="grid"><section class="glass card"><h3>${dot(h.ai.configured && !h.ai.lastError, !h.ai.configured)}AI service · ${h.ai.provider}</h3><dl class="kv"><dt>Configured</dt><dd>${String(h.ai.configured)}</dd><dt>Model calls</dt><dd>${h.ai.calls}</dd><dt>Failures</dt><dd>${h.ai.failures}</dd><dt>Guardrail rejections</dt><dd>${h.ai.guardrailRejections}</dd><dt>Last error</dt><dd>${h.ai.lastError || '—'}</dd></dl></section>
          <section class="glass card"><h3>${dot(h.payments.configured && h.payments.checkout.ok, h.payments.sandbox)}Payments · ${h.payments.provider}</h3><dl class="kv"><dt>Sandbox</dt><dd>${String(h.payments.sandbox)}</dd><dt>Checkout</dt><dd>${h.payments.checkout.ok ? 'enabled' : h.payments.checkout.reason}</dd><dt>Webhooks (24h)</dt><dd>${h.payments.webhooks24h}</dd><dt>Invalid webhook signatures</dt><dd>${h.payments.invalidWebhookSignatures}</dd></dl></section>
          <section class="glass card"><h3>${dot(h.push.configured && !h.push.lastError, !h.push.configured)}Android push (FCM)</h3><dl class="kv"><dt>Configured</dt><dd>${String(h.push.configured)}</dd><dt>Registered devices</dt><dd>${h.push.androidDevices}</dd><dt>Sent / failed</dt><dd>${h.push.sent} / ${h.push.failed}</dd><dt>Stale tokens removed</dt><dd>${h.push.removedTokens}</dd><dt>Last error</dt><dd>${h.push.lastError || '—'}</dd></dl></section>
          <section class="glass card"><h3>${dot(h.email.provider !== 'outbox-only' && !h.email.lastError, h.email.provider === 'outbox-only')}Email · ${h.email.provider}</h3><dl class="kv"><dt>Sent / failed</dt><dd>${h.email.sent} / ${h.email.failed}</dd><dt>Last error</dt><dd>${h.email.lastError || '—'}</dd></dl></section>
          <section class="glass card"><h3>${dot(h.api.errors5xx === 0, true)}API & server</h3><dl class="kv"><dt>Requests</dt><dd>${h.api.requests}</dd><dt>5xx errors</dt><dd>${h.api.errors5xx}</dd><dt>Rate-limited</dt><dd>${h.api.rateLimited}</dd><dt>Uptime</dt><dd>${Math.round(h.server.uptimeSec / 60)} min</dd><dt>Memory</dt><dd>${h.server.memoryMb} MB</dd><dt>Node · env</dt><dd>${h.server.node} · ${h.server.env}</dd><dt>Last scan</dt><dd>${ist(h.scanner.lastScanAt, { second: '2-digit' })}</dd></dl></section></div></div>`);
    },
    async users() {
      render(box(), html`<section class="glass card"><div class="row" style="margin-bottom:12px"><input class="input sm" id="us" placeholder="Search email or name" style="max-width:300px"><button class="btn btn-sm" id="ug">Search</button></div><div id="ul">${loader()}</div></section>`);
      const load = async () => {
        const { rows, total } = await api.get(`/api/admin/users?search=${encodeURIComponent($('#us', root).value)}`);
        render($('#ul', root), html`<p class="tiny muted">${total} users total</p>${tbl(['ID', 'User', 'Role', 'Status', 'Verified', 'Active subscriptions', 'Joined', ''], rows, (u) => html`<tr><td class="num">${u.id}</td><td><div class="sym">${u.name}</div><div class="tiny muted">${u.email}</div></td><td>${u.role}</td><td class="${u.status === 'active' ? 'up' : 'down'}">${u.status}</td><td>${u.email_verified_at ? '✓' : '—'}</td><td class="small">${u.subscriptions.map((s) => s.category).join(', ') || '—'}</td><td class="small muted">${ist(u.created_at)}</td>
          <td class="r"><button class="btn btn-sm" data-grant="${u.id}">Grant</button> <button class="btn btn-sm" data-role="${u.id}" data-to="${u.role === 'admin' ? 'user' : 'admin'}">${u.role === 'admin' ? 'Make user' : 'Make admin'}</button> <button class="btn btn-sm btn-danger" data-status="${u.id}" data-to="${u.status === 'active' ? 'suspended' : 'active'}">${u.status === 'active' ? 'Suspend' : 'Reactivate'}</button></td></tr>`)}`);
      };
      $('#ug', root).onclick = load; $('#us', root).onkeydown = (e) => { if (e.key === 'Enter') load(); };
      box().onclick = async (e) => {
        const g = e.target.closest('[data-grant]'), r = e.target.closest('[data-role]'), s = e.target.closest('[data-status]');
        try {
          if (g) grantDialog(+g.dataset.grant, load);
          if (r && await confirmDialog('Change role?', `Set role to ${r.dataset.to}.`)) { await api.patch(`/api/admin/users/${r.dataset.role}`, { role: r.dataset.to }); load(); }
          if (s && await confirmDialog('Change status?', s.dataset.to === 'suspended' ? 'The user will be signed out everywhere.' : 'The user can sign in again.', { danger: s.dataset.to === 'suspended' })) { await api.patch(`/api/admin/users/${s.dataset.status}`, { status: s.dataset.to }); load(); }
        } catch (x) { errToast(x); }
      };
      await load();
    },
    async subs() {
      const { rows } = await api.get('/api/admin/subscriptions');
      render(box(), html`<section class="glass card">${tbl(['ID', 'User', 'Category', 'Starts', 'Ends', 'Status', 'Source', ''], rows, (s) => html`<tr><td class="num">${s.id}</td><td class="small">${s.email}</td><td>${s.category}</td><td class="small">${ist(s.starts_at)}</td><td class="small">${ist(s.ends_at)}</td><td>${s.status}</td><td class="small">${s.payment_id ? `payment #${s.payment_id}` : s.granted_by ? `admin #${s.granted_by}` : '—'}</td><td>${s.status === 'active' ? html`<button class="btn btn-sm btn-danger" data-rv="${s.id}">Revoke</button>` : ''}</td></tr>`)}</section>`);
      box().onclick = async (e) => { const b = e.target.closest('[data-rv]'); if (b && await confirmDialog('Revoke subscription?', 'Access ends immediately. Refunds must be issued in the payment gateway.', { danger: true, confirm: 'Revoke' })) { await api.del(`/api/admin/subscriptions/${b.dataset.rv}`); views.subs(); } };
    },
    async payments() {
      const { rows, webhooks } = await api.get('/api/admin/payments');
      render(box(), html`<section class="glass card"><h3>Payments</h3>${tbl(['ID', 'User', 'Gateway', 'Order / Payment', 'Amount', 'Status', 'Verified via', 'Created'], rows, (p) => html`<tr><td class="num">${p.id}</td><td class="small">${p.email}</td><td>${p.provider}</td><td class="tiny mono">${p.provider_order_id}<br>${p.provider_payment_id || ''}</td><td class="num">${rupees(p.amount_paise)}</td><td class="${p.status === 'paid' ? 'up' : p.status === 'failed' ? 'down' : ''}">${p.status}${p.failure_reason ? html`<div class="tiny muted">${p.failure_reason}</div>` : ''}</td><td>${p.verified_via || '—'}</td><td class="small muted">${ist(p.created_at)}</td></tr>`)}</section>
        <section class="glass card" style="margin-top:16px"><h3>Webhook deliveries</h3>${tbl(['ID', 'Event', 'Event ID', 'Signature', 'Received'], webhooks, (w) => html`<tr><td class="num">${w.id}</td><td>${w.event}</td><td class="tiny mono">${w.event_id}</td><td class="${w.signature_valid ? 'up' : 'down'}">${w.signature_valid ? 'valid' : 'INVALID'}</td><td class="small muted">${ist(w.received_at)}</td></tr>`)}</section>`);
    },
    async recos() {
      const { rows, performance: p, rules } = await api.get('/api/admin/recommendations');
      render(box(), html`<div class="g-main"><section class="glass card"><div class="card-title"><h3>All recommendations (${rows.length})</h3><button class="btn btn-sm" id="scan">Run scan now</button></div>${tbl(['ID', 'Instrument', 'Cat · horizon', 'Dir', 'Score', 'Entry', 'Stop', 'T1', 'Status', 'Data', 'Created'], rows, (r) => html`<tr><td class="num">${r.id}</td><td class="sym">${r.symbol}</td><td class="small">${r.category} · ${r.horizon}</td><td><span class="dir dir-${r.direction}">${r.direction}</span></td><td class="num">${r.score}</td><td class="num small">${price(r.entryLow)}–${price(r.entryHigh)}</td><td class="num small">${price(r.stopLoss)}</td><td class="num small">${price(r.target1)}</td><td class="small">${r.status}</td><td>${badge(r.dataStatus)}</td><td class="small muted">${ist(r.createdAt)}</td></tr>`)}</section>
        <aside class="grid"><section class="glass card"><h3>Screening rules</h3><form id="rf">${[['minScore', 'Minimum score (50–95)'], ['minRiskReward', 'Minimum risk/reward'], ['stopAtrMultiple', 'Stop distance (× ATR)'], ['target1R', 'Target 1 (R multiple)'], ['target2R', 'Target 2 (R multiple)'], ['volumeRatioMin', 'Volume ratio threshold']].map(([k, l]) => html`<div class="field"><label for="r-${k}">${l}</label><input class="input sm" id="r-${k}" name="${k}" type="number" step="any" value="${rules[k]}"></div>`)}<button class="btn btn-primary btn-sm">Save rules</button></form><p class="tiny muted" style="margin-top:8px">Rule set ${'crimson-1.0'}. Changes apply to the next scan and are audit-logged.</p></section>
        <section class="glass card"><h3>Performance</h3><dl class="kv"><dt>Total</dt><dd>${p.total}</dd><dt>Open</dt><dd>${p.open}</dd><dt>T1 hit</dt><dd>${p.target1Hit}</dd><dt>T2 hit</dt><dd>${p.target2Hit}</dd><dt>Stopped</dt><dd>${p.stopped}</dd><dt>Expired</dt><dd>${p.expired}</dd><dt>Win rate</dt><dd>${p.winRate == null ? '—' : (p.winRate * 100).toFixed(1) + '%'}</dd></dl></section></aside></div>`);
      $('#scan', root).onclick = async () => { const r = await api.post('/api/admin/scan'); toast('Scan complete', `${r.created ?? 0} new setups${r.skipped ? ' · ' + r.skipped : ''}`, 'ok'); views.recos(); };
      $('#rf', root).onsubmit = async (e) => { e.preventDefault(); const d = Object.fromEntries(Object.entries(formData(e.currentTarget)).map(([k, v]) => [k, Number(v)])); try { await api.put('/api/admin/rules', d); toast('Rules saved', '', 'ok'); } catch (x) { errToast(x); } };
    },
    async config() {
      const { rows } = await api.get('/api/admin/flags');
      render(box(), html`<section class="glass card"><h3>Feature flags</h3>${tbl(['Flag', 'Description', 'State', ''], rows, (f) => html`<tr><td class="mono small">${f.key}</td><td class="small" style="white-space:normal;max-width:520px">${f.description}</td><td class="${f.enabled ? 'up' : 'muted'}">${f.enabled ? 'ON' : 'OFF'}</td><td><button class="btn btn-sm ${f.enabled ? 'btn-danger' : ''}" data-flag="${f.key}" data-to="${!f.enabled}">${f.enabled ? 'Disable' : 'Enable'}</button></td></tr>`)}
        <p class="tiny muted" style="margin-top:12px">Secrets (API keys, payment and AI credentials) are configured only through server environment variables — see ENVIRONMENT.md. They are never stored in the database or shown here.</p></section>`);
      box().onclick = async (e) => {
        const b = e.target.closest('[data-flag]'); if (!b) return; const enable = b.dataset.to === 'true'; let confirm;
        if (b.dataset.flag === 'paid_recommendations' && enable) {
          confirm = await new Promise((res) => modal(html`<h3>Enable paid recommendations</h3><p>Selling research recommendations to the public in India requires SEBI registration (Research Analyst or Investment Adviser) and compliant disclosures. Type the confirmation to proceed:</p><p class="mono small">I confirm SEBI registration is in place</p><input class="input" id="cf"><div class="modal-actions"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-danger" id="go">Enable</button></div>`, { onMount: (bx, close) => { bx.querySelector('#go').onclick = () => { res(bx.querySelector('#cf').value); close(); }; } }));
          if (!confirm) return;
        }
        try { await api.put(`/api/admin/flags/${b.dataset.flag}`, { enabled: enable, confirm }); toast('Flag updated', b.dataset.flag, 'ok'); views.config(); } catch (x) { errToast(x); }
      };
    },
    async holidays() {
      const { rows } = await api.get('/api/admin/holidays');
      render(box(), html`<div class="g-main"><section class="glass card"><h3>Exchange calendar</h3>${tbl(['Date', 'Exchange', 'Type', 'Description', 'Hours', ''], rows, (h) => html`<tr><td class="num">${h.date}</td><td>${h.exchange}</td><td>${h.kind}</td><td class="small">${h.description}</td><td class="small">${h.open_time ? `${h.open_time}–${h.close_time}` : '—'}</td><td><button class="btn btn-sm btn-danger" data-del="${h.exchange}/${h.date}">Remove</button></td></tr>`)}</section>
        <section class="glass card"><h3>Add / update</h3><form id="hf"><div class="field"><label for="h-d">Date</label><input class="input sm" id="h-d" name="date" type="date" required></div><div class="field"><label for="h-x">Exchange</label><select class="input sm" id="h-x" name="exchange"><option>NSE</option><option>MCX</option></select></div><div class="field"><label for="h-k">Type</label><select class="input sm" id="h-k" name="kind"><option value="holiday">Holiday</option><option value="special_session">Special session</option></select></div><div class="field"><label for="h-n">Description</label><input class="input sm" id="h-n" name="description" required></div><div class="g-2"><div class="field"><label for="h-o">Open (special)</label><input class="input sm" id="h-o" name="openTime" type="time"></div><div class="field"><label for="h-c">Close (special)</label><input class="input sm" id="h-c" name="closeTime" type="time"></div></div><button class="btn btn-primary btn-sm">Save</button></form><p class="tiny muted" style="margin-top:8px">Always verify against the latest NSE / MCX circulars.</p></section></div>`);
      $('#hf', root).onsubmit = async (e) => { e.preventDefault(); const d = formData(e.currentTarget); if (!d.openTime) delete d.openTime; if (!d.closeTime) delete d.closeTime; try { await api.post('/api/admin/holidays', d); views.holidays(); } catch (x) { errToast(x); } };
      box().onclick = async (e) => { const b = e.target.closest('[data-del]'); if (b && await confirmDialog('Remove entry?', b.dataset.del, { danger: true })) { await api.del(`/api/admin/holidays/${b.dataset.del}`); views.holidays(); } };
    },
    async notify() {
      render(box(), html`<section class="glass card" style="max-width:640px"><h3>Send notification</h3><form id="nf"><div class="field"><label for="n-t">Title</label><input class="input" id="n-t" name="title" required minlength="3" maxlength="120"></div><div class="field"><label for="n-b">Message</label><textarea class="input" id="n-b" name="body" required minlength="3" maxlength="1000"></textarea></div><div class="field"><label for="n-u">User ID (blank = broadcast to everyone)</label><input class="input" id="n-u" name="userId" type="number"></div><button class="btn btn-primary">Send</button></form></section>`);
      $('#nf', root).onsubmit = async (e) => { e.preventDefault(); const d = formData(e.currentTarget); try { await api.post('/api/admin/notifications', { title: d.title, body: d.body, userId: d.userId ? Number(d.userId) : undefined }); toast('Notification sent', '', 'ok'); e.currentTarget.reset(); } catch (x) { errToast(x); } };
    },
    async audit() {
      const { rows } = await api.get('/api/admin/audit?limit=300');
      render(box(), html`<section class="glass card">${tbl(['Time', 'Actor', 'Action', 'Target', 'Details', 'IP'], rows, (a) => html`<tr><td class="small muted">${ist(a.at, { second: '2-digit' })}</td><td class="small">${a.actor_email || (a.actor_id ? `#${a.actor_id}` : 'system')}</td><td class="mono small">${a.action}</td><td class="small">${a.target || ''}</td><td class="tiny mono" style="white-space:normal;max-width:320px">${a.meta_json && a.meta_json !== '{}' ? a.meta_json : ''}</td><td class="small muted">${a.ip || ''}</td></tr>`)}</section>`);
    },
    async errors() {
      const { rows } = await api.get('/api/admin/errors');
      render(box(), html`<section class="glass card">${tbl(['Time', 'Source', 'Message', 'Meta'], rows, (r) => html`<tr><td class="small muted">${ist(r.at, { second: '2-digit' })}</td><td>${r.source}</td><td class="small" style="white-space:normal;max-width:420px">${r.message}</td><td class="tiny mono" style="white-space:normal;max-width:320px">${r.meta_json}</td></tr>`)}</section>`);
    },
    async contact() {
      const [{ rows }, out] = await Promise.all([api.get('/api/admin/contact'), api.get('/api/admin/outbox')]);
      render(box(), html`<section class="glass card"><h3>Support messages</h3>${tbl(['Received', 'From', 'Subject', 'Message'], rows, (m) => html`<tr><td class="small muted">${ist(m.created_at)}</td><td class="small">${m.name}<br><span class="muted">${m.email}</span></td><td>${m.subject}</td><td class="small" style="white-space:normal;max-width:480px">${m.message}</td></tr>`)}</section>
        <section class="glass card" style="margin-top:16px"><h3>Email outbox</h3><p class="tiny muted">No SMTP provider is configured; emails are queued here and in data/outbox/emails.log.</p>${tbl(['Queued', 'To', 'Subject', 'Status'], out.rows, (m) => html`<tr><td class="small muted">${ist(m.created_at)}</td><td class="small">${m.to_email}</td><td>${m.subject}</td><td>${m.status}</td></tr>`)}</section>`);
    },
  };
  async function show() { render(box(), loader()); try { box().onclick = null; await views[tab](); enter($$('.card, .stat-card', box()), { each: 40 }); } catch (e) { render(box(), html`<div class="glass card">${e.message}</div>`); } }
  await show();
  void countTo;
}

function grantDialog(userId, done) {
  modal(html`<h3>Grant subscription</h3><form id="gf"><div class="field"><label for="g-c">Category</label><select class="input" id="g-c" name="category">${CATEGORY_IDS.map((c) => html`<option>${c}</option>`)}</select></div><div class="field"><label for="g-d">Days</label><input class="input" id="g-d" name="days" type="number" min="1" max="365" value="7" required></div><p class="form-error" id="ge"></p><div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary">Grant</button></div></form>`, {
    onMount: (box, close) => box.querySelector('#gf').addEventListener('submit', async (e) => { e.preventDefault(); const d = formData(e.currentTarget); try { await api.post('/api/admin/subscriptions', { userId, category: d.category, days: Number(d.days) }); toast('Subscription granted', '', 'ok'); close(); done(); } catch (x) { box.querySelector('#ge').textContent = x.message; } }),
  });
}
