# TEST REPORT

**Run date:** 22 Nov 2026. **Environment:** Ubuntu 24.04, Node v22.23.5, Google Chrome via Playwright 1.63, in-memory SQLite, DEMO market provider, sandbox payment gateway, deterministic AI.

Everything below was **actually executed**. Nothing was run on Windows. External services were not reachable from the build environment (see "Not tested").

| Suite | Command | Result |
|---|---|---|
| Static checks (73 files: parse, secret scan, unsafe-HTML scan, `.env` ignored) | `npm run check` | ✅ pass |
| Unit tests | `npm test` (`tests/unit`) | ✅ 22 / 22 |
| API integration tests | `npm test` (`tests/api`) | ✅ 16 / 16 |
| Browser end-to-end journeys (desktop 1440×900, mobile 390×844, Android-app bridge 412×915) | `npm run test:e2e` | ✅ 38 / 38, 0 browser console errors |
| Android XML resources well-formed | xml parse | ✅ |
| Android Gradle/Kotlin compile | — | ⏳ **not run**: no Android SDK and Google Maven blocked in the build environment |
| Production config guards | manual | ✅ sandbox gateway and insecure cookies refused when `NODE_ENV=production` |

## Unit tests (17)
SMA/EMA · RSI against the Wilder reference series · MACD/Bollinger/ATR/VWAP (including the session reset) · Black–Scholes put–call parity and implied-vol round-trip · chain stats (PCR, max pain, OI walls) · NSE calendar (holiday, weekend, pre-market, pre-open at 09:12, open, close, Budget special session, next open skipping a holiday) · quote validation rejects bad data · 5-minute aggregation · level geometry (long and short) · recommendation lifecycle transitions · engine on DEMO data (internal consistency and traceability) · short-history safety · AI guardrail rejects invented numbers · deterministic narrative cites only input numbers · Razorpay signature and webhook HMAC · sandbox gateway outcomes · ₹50/day pricing and limits · scrypt hashing and password policy.

Added in the completion pass: FCM JWT (RS256, verified with a generated key) · FCM sending per device, stale-token removal, channel routing, token caching (mocked Google APIs) · push respects per-user preferences · email delivery via Resend/SendGrid/Postmark plus failure recording (mocked) · GST inclusive-price breakdown.

## API integration tests (16)
Security headers and path traversal · register/login/logout/session · CSRF enforcement and cross-origin rejection · auth rate limit (429) · lockout (423) · password reset (single-use token, sessions revoked, no account enumeration) · email verification · market endpoints (DEMO labels, top-10 sorted, all timeframes, bad-timeframe rejection) · subscription gating, tampered signature rejected, sandbox payment verified, idempotent verify, 2-day period exact, renewal stacking, receipt ownership, failed-payment path · webhooks (invalid signature 401, idempotent replay, activation) · Studio payload with gating · option chain (Greeks sanity, PCR, setup locked, input validation) · watchlists (ownership isolation), alerts trigger and notify, journal (paper fills at market and can't be deleted, actual P&L math) · performance keeps stopped setups · admin (403 for users, 401 anonymous, denial audit-logged, grants, suspension revokes sessions, self-demotion blocked, guarded SEBI flag, holidays, rules, broadcast) · validation, malformed JSON and 413 body limit.

## End-to-end journeys (38)
Cinematic intro → hero · scroll reveals and interactive chart demo · all 8 public pages · navigation transitions · contact form · protected-route redirect · **register a user** · **view the dashboard** (top-10 tables have 10 rows) · **open every market category** and every workspace page from the sidebar · equity locked without a subscription · **open AI Trade Studio, change timeframes**, toggle overlays, zoom and pan, crosshair · **switch instruments without a page reload** · **create a watchlist, set a price alert**, paper trade · notifications drawer · **subscribe to a category** through the sandbox gateway → access unlocked (cards and sidebar) · failed payment grants nothing · setup levels visible after subscribing · **an unauthorised user can't reach admin** · **admin dashboard**: every tab · mobile layout (bottom nav, Studio, drawer) · **Android app bridge** (FCM token registered on the server, native permission prompt, Google sign-in hidden) · reduced-motion preference respected.

## Defects found by testing and fixed
1. **Renewal periods under-reported:** "active until" ignored future-dated renewal periods. Fixed the query and added a test.
2. **Event-listener leak across navigations:** handlers stacked on the shared page outlet, so revisiting a page double-toggled controls. Each page now gets a fresh root element.
3. **Password policy false positive:** short email local parts (`m@…`) rejected most passwords. The rule now applies only to local parts of 4+ characters.
4. **Mobile overflow:** grid children didn't shrink, so wide tables pushed the page to ~1,560 px. Fixed with `min-width: 0`.
5. **Daily bars stale versus live price:** daily bars weren't updated intraday (DEMO and the generic service), which produced inconsistent delivery levels. Both now roll today's bar from every validated quote.
6. **Scanner too permissive:** neutral factors scored 50%. The scorer now counts supporting evidence only and requires trend alignment.
7. AI guardrail number extraction mis-read indicator names (`EMA20` → `0`). Regex fixed.
8. Sidebar labels wrapping, nested level boxes, and sidebar lock icons not clearing after purchase. Fixed.

## Not tested (requires external access or tooling)
- Razorpay live/test API calls (order creation, payment fetch). The code is written, and signature/webhook verification is unit-tested with known HMACs.
- A licensed market-data feed (`http-feed` provider), Anthropic API calls (the fallback path is exercised), Google OAuth and email delivery.
- Windows execution. Node APIs used are cross-platform and paths use `node:path`, but this was not run on Windows.
- Android Gradle build and on-device run: the project is written but must be built in Android Studio (no SDK here).
- Real Firebase, email-provider and Razorpay API calls: logic is tested against mocked responses.
- Load testing and a third-party penetration test.
