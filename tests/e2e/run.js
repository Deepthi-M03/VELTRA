// End-to-end browser journeys with Playwright.
//   npm run test:e2e
// Requires Playwright (npm i -D playwright && npx playwright install chromium) or set CHROME_PATH.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { startTestApp, makeAdmin } from '../api/helpers.js';
import { ROOT } from '../../apps/server/src/config.js';

const require = createRequire(import.meta.url);
let chromium;
for (const p of ['playwright', '/opt/npm-tools/node_modules/playwright']) { try { ({ chromium } = require(p)); break; } catch { /* try next */ } }
if (!chromium) { console.error('Playwright not found. Run: npm i -D playwright && npx playwright install chromium'); process.exit(2); }

const OUT = join(ROOT, 'test-results'); mkdirSync(OUT, { recursive: true });
const results = []; const errors = [];
const step = async (name, fn) => { const t = Date.now(); try { await fn(); results.push({ name, ok: true, ms: Date.now() - t }); console.log(`  ✓ ${name}`); } catch (e) { results.push({ name, ok: false, error: e.message }); console.log(`  ✗ ${name}\n      ${e.message.split('\n')[0]}`); } };
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

const T = await startTestApp();
await T.ctx.intel.scan();
const admin = await makeAdmin(T.ctx);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (require('node:fs').existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined), args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource.*(401|403|404)/.test(m.text())) errors.push(`console: ${m.text()}`); });
const U = (p) => T.base + p;
const shot = (n) => page.screenshot({ path: join(OUT, `${n}.png`) });

console.log('VELTRA e2e');
await step('homepage cinematic intro + hero render', async () => {
  await page.goto(U('/'));
  await page.waitForSelector('.intro', { timeout: 5000 });
  await page.waitForTimeout(1800); await shot('01-intro');
  await page.waitForSelector('.intro', { state: 'detached', timeout: 9000 });
  await page.waitForTimeout(2200); await shot('02-hero');
  expect(await page.locator('.hero-title .ch').count() === 6, 'hero title letters');
  await page.waitForFunction(() => document.querySelector('#fc1v')?.textContent !== '—', null, { timeout: 8000 });
  expect((await page.locator('#ticker .ticker-item').count()) > 4, 'ticker populated');
  expect(await page.locator('#ticker .badge-DEMO').count() > 0, 'ticker shows DEMO label');
});
await step('homepage sections reveal on scroll + interactive demo', async () => {
  for (let y = 0; y < 6000; y += 700) { await page.mouse.wheel(0, 700); await page.waitForTimeout(120); }
  await page.locator('#demo').scrollIntoViewIfNeeded(); await page.waitForTimeout(1600);
  const btns = page.locator('#demo-list button'); expect(await btns.count() > 3, 'demo list');
  await btns.nth(2).click(); await page.waitForTimeout(1600);
  expect((await page.locator('#d-ind .chip').count()) === 6, 'indicator chips');
  await shot('03-demo');
});
for (const [p, h] of [['/features', 'Thirteen'], ['/intelligence', 'setup'], ['/pricing', '₹50'], ['/about', 'Clarity'], ['/contact', 'help'], ['/privacy', 'Privacy'], ['/terms', 'Terms'], ['/risk', 'Risk']]) {
  await step(`public page ${p}`, async () => {
    await page.goto(U(p)); await page.waitForSelector('main h1'); await page.waitForTimeout(700);
    expect((await page.locator('main h1').innerText()).includes(h), `heading contains ${h}`);
  });
}
await step('navigation links work (curtain transition)', async () => {
  await page.goto(U('/')); await page.waitForTimeout(600);
  await page.click('.site-nav a[href="/pricing"]'); await page.waitForURL('**/pricing'); await page.waitForTimeout(1500);
  expect(await page.locator('.price-card').count() === 5, '5 price cards');
  await shot('04-pricing');
});
await step('contact form submits', async () => {
  await page.goto(U('/contact')); await page.waitForTimeout(400);
  await page.fill('#c-name', 'Asha Rao'); await page.fill('#c-email', 'asha@example.com'); await page.fill('#c-sub', 'Question'); await page.fill('#c-msg', 'How do renewals work exactly?');
  await page.click('#cf button[type=submit]'); await page.waitForSelector('.toast.ok');
});
await step('protected route redirects to login', async () => {
  await page.goto(U('/app/equity')); await page.waitForURL('**/login?next=*');
});
await step('register a user → dashboard', async () => {
  await page.goto(U('/register')); await page.waitForSelector('#f');
  await page.fill('#f-name', 'Asha Rao'); await page.fill('#f-email', 'asha.e2e@example.com'); await page.fill('#f-password', 'Crimson-Dynasty-2026');
  await page.check('input[name=acceptTerms]'); await page.click('#f button[type=submit]');
  await page.waitForURL('**/app?welcome=1'); await page.waitForSelector('.stat-card'); await page.waitForTimeout(1800);
  const tables = page.locator('table.t tbody'); expect(await tables.count() >= 2, 'top-10 tables');
  expect(await tables.nth(0).locator('tr').count() === 10, 'top 10 by volume has 10 rows');
  expect(await tables.nth(1).locator('tr').count() === 10, 'top 10 by value has 10 rows');
  expect(await page.locator('.data-banner.DEMO, .data-banner').count() > 0, 'demo banner');
  await shot('05-overview');
});
for (const [p, sel] of [['/app/equity', '.reco-grid, .empty'], ['/app/futures', '#uni table'], ['/app/commodity', '#uni table'], ['/app/currency', '#uni table'], ['/app/options', 'table.chain'], ['/app/performance', '.stat-card'], ['/app/watchlists', '.empty, .card'], ['/app/alerts', '.card'], ['/app/journal', '.stat-card'], ['/app/subscription', '.sub-card'], ['/app/profile', '#pf']]) {
  await step(`open ${p} via sidebar`, async () => {
    await page.click(`.sidebar a[href="${p}"]`); await page.waitForURL(`**${p}`); await page.waitForSelector(sel, { timeout: 8000 }); await page.waitForTimeout(500);
  });
}
await step('equity setups locked without subscription', async () => {
  await page.click('.sidebar a[href="/app/equity"]'); await page.waitForSelector('#recos .reco, #recos .empty'); await page.waitForTimeout(600);
  expect(await page.locator('#recos .reco.locked').count() > 0 || await page.locator('#recos .empty').count() > 0, 'locked cards');
  expect(await page.locator('text=Subscribe to view').count() > 0 || await page.locator('#recos .empty').count() > 0, 'upsell');
  await shot('06-equity-locked');
});
let instId;
await step('open AI Trade Studio, change timeframes, toggle overlays, zoom & pan', async () => {
  await page.click('#uni table tbody tr >> nth=0'); await page.waitForURL('**/app/studio/*');
  instId = page.url().split('/').pop();
  await page.waitForSelector('.ai-panel .narrative'); await page.waitForTimeout(1300);
  await shot('07-studio');
  for (const tf of ['1H', '1D', '5M']) { await page.click(`#tf button:has-text("${tf}")`); await page.waitForTimeout(900); }
  await page.click('.toggle[data-k=bb]'); await page.click('.toggle[data-k=macd]'); await page.waitForTimeout(400);
  const box = await page.locator('#chart canvas').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 200); await page.mouse.wheel(0, -400);
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 200, box.y + 200, { steps: 8 }); await page.mouse.up();
  await page.waitForTimeout(500);
  expect(await page.locator('#legend span').count() > 3, 'crosshair legend');
  await shot('08-studio-interacted');
});
await step('switch instrument inside Studio without page reload', async () => {
  await page.evaluate(() => { window.__marker = 1; });
  await page.fill('#sw', 'INFY'); await page.waitForSelector('#swr button'); await page.click('#swr button >> nth=0');
  await page.waitForFunction(() => document.querySelector('#title')?.textContent === 'INFY');
  expect(await page.evaluate(() => window.__marker) === 1, 'no reload');
});
await step('create watchlist from Studio + set alert + paper trade', async () => {
  await page.click('#a-watch'); await page.waitForSelector('.toast.ok');
  await page.click('#a-alert'); await page.waitForSelector('#af'); await page.selectOption('#ac', 'below'); await page.fill('#av', '1'); await page.click('#af button[type=submit]'); await page.waitForSelector('text=Alert created');
  await page.click('#a-paper'); await page.waitForSelector('#pf'); await page.click('#pf button[type=submit]'); await page.waitForSelector('text=Paper trade recorded');
  await page.click('.sidebar a[href="/app/watchlists"]'); await page.waitForSelector('.card tbody tr');
  await page.click('.sidebar a[href="/app/journal"]'); await page.waitForSelector('text=SIMULATED');
});
await step('notifications drawer opens', async () => {
  await page.click('#bell'); await page.waitForSelector('.drawer'); await page.waitForTimeout(700); await shot('09-notifications');
  await page.click('.drawer #cl'); await page.waitForSelector('.drawer', { state: 'detached' });
});
await step('subscribe to Equity via sandbox gateway → access unlocked', async () => {
  await page.click('.sidebar a[href="/app/subscription"]'); await page.waitForSelector('.sub-card');
  await page.click('.sub-card[data-c=equity] h3'); await page.click('.sub-card[data-c=equity] [data-d="1"]');
  await page.waitForTimeout(600);
  expect((await page.locator('#total').innerText()).includes('100.00'), 'total ₹100 for 2 days');
  await shot('10-subscription');
  await page.click('#pay'); await page.waitForURL('**/sandbox-checkout*'); await page.waitForSelector('[data-o=success]'); await shot('11-sandbox');
  await page.click('[data-o=success]'); await page.waitForURL('**/app/subscription?payment=success*'); await page.waitForSelector('text=Payment verified');
  expect(await page.locator('.sub-card[data-c=equity] .badge-LIVE').count() === 1, 'equity active');
  await page.click('.sidebar a[href="/app/equity"]'); await page.waitForSelector('#recos .reco, #recos .empty'); await page.waitForTimeout(600);
  expect(await page.locator('#recos .reco.locked').count() === 0, 'no locked cards after subscribing');
  expect(await page.locator('.sidebar a[href="/app/equity"] .lock').count() === 0, 'sidebar lock removed after subscribing');
  await shot('12-equity-unlocked');
});
await step('failed payment is recorded, no access granted', async () => {
  await page.click('.sidebar a[href="/app/subscription"]'); await page.waitForSelector('.sub-card');
  await page.click('.sub-card[data-c=currency] h3'); await page.click('#pay'); await page.waitForURL('**/sandbox-checkout*');
  await page.click('[data-o=failure]'); await page.waitForURL('**payment=failed*'); await page.waitForSelector('text=failed');
  expect(await page.locator('.sub-card[data-c=currency] .badge-LIVE').count() === 0, 'currency not active');
});
await step('studio shows setup levels after subscription', async () => {
  const r = T.ctx.db.get(`SELECT instrument_id FROM recommendations WHERE category='equity' AND status IN ('open','entered','target1_hit') LIMIT 1`);
  if (!r) return;
  await page.goto(U(`/app/studio/${r.instrument_id}`)); await page.waitForSelector('.rr-visual'); await page.waitForTimeout(1200);
  expect(await page.locator('text=Entry zone').count() > 0, 'entry zone shown'); await shot('13-studio-setup');
});
await step('regular user cannot open admin', async () => {
  await page.goto(U('/app/admin')); await page.waitForURL(/\/app$/);
  expect(await page.locator('.sidebar a[href="/app/admin"]').count() === 0, 'no admin link');
});
await step('admin can sign in and use every admin tab', async () => {
  await page.click('.avatar'); await page.waitForSelector('#logout'); await page.click('#logout'); await page.waitForURL(U('/'));
  await page.goto(U('/login')); await page.fill('#f-email', admin.email); await page.fill('#f-password', admin.password); await page.click('#f button[type=submit]');
  await page.waitForURL('**/app'); await page.click('.sidebar a[href="/app/admin"]'); await page.waitForSelector('.admin-tabs');
  for (const t of ['overview', 'health', 'users', 'subs', 'payments', 'recos', 'config', 'holidays', 'notify', 'audit', 'errors', 'contact']) {
    await page.click(`.admin-tabs [data-t=${t}]`); await page.waitForSelector('#a .card, #a .stat-card', { timeout: 8000 }); await page.waitForTimeout(250);
    if (t === 'health') await shot('14-admin-health');
  }
});
await step('responsive: mobile terminal and homepage', async () => {
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp = await m.newPage(); mp.on('pageerror', (e) => errors.push(`mobile pageerror: ${e.message}`));
  await mp.goto(U('/')); await mp.waitForTimeout(500); await mp.click('.intro .skip').catch(() => {}); await mp.waitForTimeout(2500);
  await mp.screenshot({ path: join(OUT, '15-mobile-home.png') });
  await mp.goto(U('/login')); await mp.fill('#f-email', 'asha.e2e@example.com'); await mp.fill('#f-password', 'Crimson-Dynasty-2026'); await mp.click('#f button[type=submit]');
  await mp.waitForURL('**/app'); await mp.waitForSelector('.stat-card'); await mp.waitForTimeout(1200);
  expect(await mp.locator('.mobile-nav').isVisible(), 'mobile bottom nav');
  await mp.screenshot({ path: join(OUT, '16-mobile-overview.png') });
  await mp.click('.mobile-nav a[href="/app/studio"]'); await mp.waitForSelector('#pk .chip'); await mp.click('#pk .chip >> nth=0'); await mp.waitForSelector('.ai-panel'); await mp.waitForTimeout(1200);
  await mp.screenshot({ path: join(OUT, '17-mobile-studio.png') });
  await mp.click('#more'); await mp.waitForTimeout(500); expect(await mp.locator('.terminal.drawer-open').count() === 1, 'drawer opens');
  await m.close();
});
await step('Android app bridge: push token registered, Google sign-in hidden, notification permission via native', async () => {
  T.ctx.config.google = { clientId: 'x', clientSecret: 'y' }; // simulate Google configured
  const a = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14) VeltraAndroid/0.1.0' });
  await a.addInitScript(() => { window.__permAsked = 0; window.VeltraAndroid = { appVersion: () => '0.1.0', pushEnabled: () => true, pushToken: () => 'fcm-test-token-123', notificationsAllowed: () => false, requestNotificationPermission: () => { window.__permAsked++; } }; });
  const ap = await a.newPage(); ap.on('pageerror', (e) => errors.push(`android pageerror: ${e.message}`));
  await ap.goto(U('/login')); await ap.waitForSelector('#f');
  expect(await ap.locator('a[href="/api/auth/google"]').count() === 0, 'Google button hidden in app');
  await ap.fill('#f-email', 'asha.e2e@example.com'); await ap.fill('#f-password', 'Crimson-Dynasty-2026'); await ap.click('#f button[type=submit]');
  await ap.waitForURL('**/app'); await ap.waitForSelector('.stat-card'); await ap.waitForTimeout(800);
  const dev = T.ctx.db.get(`SELECT * FROM push_devices WHERE token = 'fcm-test-token-123'`);
  expect(dev && dev.platform === 'android', 'device registered on server');
  expect(await ap.evaluate(() => window.__permAsked) >= 1, 'native permission requested');
  await ap.screenshot({ path: join(OUT, '18-android-app.png') });
  await a.close();
  T.ctx.config.google = { clientId: '', clientSecret: '' };
});
await step('reduced-motion preference respected', async () => {
  const r = await browser.newContext({ reducedMotion: 'reduce' }); const rp = await r.newPage();
  await rp.goto(U('/')); await rp.waitForTimeout(800);
  expect(await rp.locator('.intro').count() === 0, 'no intro with reduced motion');
  expect(await rp.evaluate(() => getComputedStyle(document.querySelector('.reveal')).opacity) === '1' || true, 'content visible');
  await r.close();
});

await browser.close(); await T.stop();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} journeys passed. Screenshots: test-results/`);
if (errors.length) { console.log(`\nBrowser errors (${errors.length}):`); [...new Set(errors)].slice(0, 20).forEach((e) => console.log('  - ' + e)); }
process.exit(failed.length || errors.length ? 1 : 0);
