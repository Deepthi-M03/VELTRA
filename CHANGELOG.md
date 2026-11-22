# CHANGELOG

## 0.2.0 — 22 Nov 2026 — All 12 stages
### Added
- **Stage 11 — Android app** (`apps/android`): Kotlin, AGP 8.7, minSdk 26 / target 35. Crimson Dynasty splash and adaptive icon, hardened WebView host for the terminal, deep links, UPI/intent payment hand-off, offline screen, pull-to-refresh, notification channels, optional Firebase Cloud Messaging (auto-enabled by `google-services.json`), and a `window.VeltraAndroid` bridge.
- Server **Android push** via FCM HTTP v1 (service-account JWT signed with node:crypto), sent according to per-user preferences; stale tokens are removed automatically.
- **Email delivery** via Resend, SendGrid or Postmark, with outbox status tracking.
- **GST tax-invoice details** on receipts when a GSTIN is configured.
- Admin health panels for push and email; web-app Android integration (token registration, native permission prompt, Google sign-in hidden in-app).
- 5 new unit tests and 1 new browser journey.


## 0.1.0 — 22 Nov 2026 — Foundation release

### Architecture decisions
- **Zero third-party dependencies.** The build environment had package installs blocked, and the owner is a Windows beginner, so VELTRA uses only Node built-ins: `node:http`, `node:crypto` (scrypt, HMAC) and `node:sqlite`. Running it takes one `node` command, with no `npm install`, no build step and no native modules to compile. This removes supply-chain risk and Windows build problems.
- **Frontend without a build step:** browser ES modules with a custom motion system on the Web Animations API, used in place of Framer Motion, which requires React plus a bundler. All motion respects `prefers-reduced-motion`.
- **Custom canvas chart** in place of a charting library: no licence constraints, and full control over the Crimson Dynasty styling and the level markers.
- **Monorepo layout:** `apps/server`, `apps/web`, `packages/{database, market-engine, ai-engine, payments, shared}`.

### Added
- Crimson Dynasty brand system: tokens, an original crest logo/icon, glass surfaces, metallic type, badges, tables, loaders.
- Public site: cinematic intro, hero with parallax/orbit/light trails, ticker, platform constellation, pipeline animation, interactive chart demo, pricing, about, intelligence, contact, legal templates, auth pages.
- Terminal: animated sidebar with a sliding indicator, Ctrl+K instrument search, market-status chip, notification drawer, mobile bottom nav and drawer; Overview, Equity, Options, Futures, Commodity, Currency, AI Trade Studio, Watchlists, Alerts, Journal, Performance, Subscription, Profile, Admin.
- Market engine: IST session/holiday calendar (2026 NSE calendar), provider interface (DEMO plus generic licensed HTTP feed), validation and normalization, staleness detection, backoff, bar aggregation, indicators, Black–Scholes Greeks and IV, option-chain stats.
- Recommendation engine `crimson-1.0`: 7 weighted factors, trend alignment, ATR/structure stops, 1.5R/2.5R targets, lifecycle tracking with events, expiry.
- AI engine: deterministic findings, model narrative with a numeric guardrail, Anthropic provider with timeout, retry and rate limit, analysis history.
- Payments: Razorpay and sandbox gateways, server-side signature verification plus payment re-fetch, idempotent webhooks, receipts, failure handling.
- Subscriptions at ₹50/day/category, multi-category, stacking renewals, expiry reminders, admin grants and revocations.
- Security: CSP and security headers, CSRF, rate limiting, lockout, RBAC, audit and error logs, regulatory feature flags.
- Tooling: migrations, create-admin, backup, static checks, unit, API and e2e suites.

### Not yet included
- Android app, FCM push sending, SMTP/email API delivery, PostgreSQL option. See PRODUCTION_READINESS.md.
