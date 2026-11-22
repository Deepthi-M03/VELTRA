import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { signJwt, FcmPusher } from '../../apps/server/src/services/push.js';
import { Mailer, Notifier } from '../../apps/server/src/services/support.js';
import { gstBlock } from '../../apps/server/src/routes/billing.js';
import { openDatabase, migrate } from '../../packages/database/db.js';
import { EventEmitter } from 'node:events';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const freshDb = () => { const db = openDatabase(':memory:'); migrate(db); db.run(`INSERT INTO users (email, name, password_hash) VALUES ('u@example.com','U','x')`); return db; };
const res = (status, json = {}) => ({ ok: status < 300, status, json: async () => json, text: async () => JSON.stringify(json) });

test('FCM service-account JWT is valid RS256', () => {
  const jwt = signJwt({ iss: 'svc@proj.iam.gserviceaccount.com', aud: 'https://oauth2.googleapis.com/token', iat: 1, exp: 3601 }, privateKey);
  const [h, b, s] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'RS256', typ: 'JWT' });
  assert.equal(JSON.parse(Buffer.from(b, 'base64url')).iss, 'svc@proj.iam.gserviceaccount.com');
  assert.ok(createVerify('RSA-SHA256').update(`${h}.${b}`).verify(publicKey, Buffer.from(s, 'base64url')));
});

test('FCM pusher: auth, send per device, removes unregistered tokens, routes channels', async () => {
  const db = freshDb();
  db.run(`INSERT INTO push_devices (user_id, platform, token) VALUES (1,'android','good'),(1,'android','dead'),(1,'web','ignored')`);
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    if (url.includes('oauth2')) return res(200, { access_token: 'at', expires_in: 3600 });
    const body = JSON.parse(opts.body);
    return body.message.token === 'dead' ? res(404, { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }) : res(200, { name: 'm1' });
  };
  const p = new FcmPusher({ db, account: { projectId: 'proj', clientEmail: 'svc@x', privateKey }, fetchImpl, log: {} });
  const out = await p.sendToUser(1, { title: 'Payment confirmed', body: 'Receipt', type: 'payment', link: '/app/subscription#x' });
  assert.equal(out.sent, 1);
  const send = calls.find((c) => c.url.includes('/projects/proj/messages:send') && JSON.parse(c.opts.body).message.token === 'good');
  const msg = JSON.parse(send.opts.body).message;
  assert.equal(send.opts.headers.authorization, 'Bearer at');
  assert.equal(msg.android.notification.channel_id, 'veltra_account');
  assert.equal(msg.data.path, '/app/subscription');
  assert.equal(db.all('SELECT token FROM push_devices').map((r) => r.token).sort().join(), 'good,ignored');
  await p.sendToUser(1, { title: 't', body: 'b', type: 'price_alert' });
  assert.equal(calls.filter((c) => c.url.includes('oauth2')).length, 1, 'access token cached');
});

test('Notifier pushes only when the user preference allows it', async () => {
  const db = freshDb(); const sent = [];
  const pusher = { configured: true, sendToUser: async (u, m) => { sent.push(m.type); return { sent: 1 }; } };
  const n = new Notifier(db, new EventEmitter(), pusher);
  n.notify(1, 'price_alert', 'A', 'B');            // default push ON
  n.notify(1, 'market_move', 'A', 'B');            // default push OFF
  n.setPref(1, { type: 'payment', inApp: true, browser: true, push: false });
  n.notify(1, 'payment', 'A', 'B');                // user turned it off
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(sent, ['price_alert']);
});

test('Mailer delivers via provider API and records status', async () => {
  for (const [provider, urlPart] of [['resend', 'api.resend.com'], ['sendgrid', 'api.sendgrid.com'], ['postmark', 'api.postmarkapp.com']]) {
    const db = freshDb(); let seen;
    const m = new Mailer(db, { quiet: true, email: { provider, apiKey: 'k', from: 'noreply@veltra.example' }, fetchImpl: async (url, o) => { seen = { url, o }; return res(200); } });
    await m.send('u@example.com', 'Reset', 'link');
    assert.ok(seen.url.includes(urlPart), provider);
    assert.equal(db.get('SELECT status FROM email_outbox').status, 'sent');
  }
  const db = freshDb();
  const m = new Mailer(db, { quiet: true, email: { provider: 'resend', apiKey: 'k', from: 'a@b.co' }, fetchImpl: async () => res(500) });
  await m.send('u@example.com', 'Reset', 'link');
  assert.equal(db.get('SELECT status FROM email_outbox').status, 'failed');
  assert.equal(m.health.failed, 1);
});

test('GST: inclusive-price breakdown only when GSTIN configured', () => {
  const none = gstBlock({}, 11800);
  assert.equal(none.gst, null); assert.match(none.note, /not a tax invoice/);
  const g = gstBlock({ legalName: 'Veltra Pvt Ltd', gstin: '29ABCDE1234F1Z5', gstRate: 18 }, 11800);
  assert.equal(g.gst.taxablePaise, 10000); assert.equal(g.gst.taxPaise, 1800);
  assert.equal(g.gst.taxablePaise + g.gst.taxPaise, 11800);
});
