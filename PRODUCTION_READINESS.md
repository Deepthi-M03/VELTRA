# PRODUCTION READINESS — honest checklist

Legend: ✅ Implemented & tested · 🧪 Tested with sandbox/demo data only · 🔑 Requires external credentials · 📈 Requires licensed market data · ⚖️ Requires regulatory approval · ⏳ Not yet completed

## ⚖️ Regulatory: read first

- **SEBI.** In India, providing buy/sell recommendations for a fee is a regulated activity, normally requiring registration as a **Research Analyst** (SEBI (Research Analysts) Regulations, 2014) or an **Investment Adviser**, along with their disclosure, record-keeping and grievance obligations. VELTRA ships with `paid_recommendations` **OFF**, and live checkout stays blocked while that flag is off. Get advice from a SEBI-specialist lawyer before enabling it. A disclaimer alone is not sufficient.
- **Exchange data.** Displaying NSE/MCX real-time data to users requires a licence from the exchange or an authorised vendor, with display and redistribution terms. VELTRA never scrapes exchange websites.
- **Other obligations to confirm with counsel:** DPDP Act 2023 (privacy notice, consent, grievance officer), GST registration and tax invoices, Payment Aggregator terms, IT Act intermediary rules, and advertising rules (no promises of returns).
- **Legal pages** are templates with bracketed placeholders.

| Area | Status | Notes |
|---|---|---|
| Public website (12 pages, cinematic intro, parallax, light trails, scroll reveals, interactive demo) | ✅ | Legal copy ⚖️ |
| Motion system (WAAPI choreography, page curtains, terminal transitions, reduced-motion) | ✅ | Framer Motion not used: zero-dependency architecture (see CHANGELOG) |
| Email/password auth, sessions, CSRF, lockout, rate limits, RBAC, admin separation | ✅ | |
| Password reset & email verification | ✅ (tokens) / 🔑 (delivery) | Emails go to the outbox until an email provider is wired up |
| Google sign-in | 🔑 | Implemented; not executed without credentials |
| Market-session management (09:10–15:30 IST, holidays, special sessions) | ✅ | 2026 NSE calendar seeded; MCX-specific holidays must be added |
| Provider interface, validation, staleness detection, reconnect/backoff, error logging | ✅ | |
| Live NSE/MCX/currency data | 📈 🔑 | DEMO provider is labelled everywhere; `http-feed` adapter needs a licensed bridge |
| Top-10 by volume and by value, overview, breadth, sectors, VIX, sentiment | 🧪 | Logic tested on DEMO data |
| Equity/futures/commodity/currency recommendation engine | 🧪 | Rules transparent & configurable. Live calibration and back-testing pending 📈 |
| Options chain, Greeks (computed), PCR, max pain, options setups | 🧪 | Greeks computed via Black–Scholes when the provider doesn't supply them |
| AI Trade Studio (charts, 5 timeframes, overlays, panes, markers, zoom/pan, R:R) | ✅ | Custom canvas chart, no licensing constraints |
| AI engine: findings vs narrative, guardrail, history, timeouts/retries/rate limit | ✅ (deterministic) / 🔑 (Claude) | |
| Performance record (no deletions, losses shown, simulated labelled) | ✅ | |
| Watchlists, alerts, journal, paper trading | ✅ | |
| Notifications (in-app, live stream, browser) and preferences | ✅ | |
| Android push (FCM) | ⏳ 🔑 | Device registration endpoint exists; FCM sender not implemented |
| Subscriptions ₹50/day/category, multi-category, renewal stacking, expiry reminders, access control | ✅ 🧪 | |
| Razorpay orders, signature + payment re-fetch, webhooks, receipts | 🔑 | Verification logic unit-tested; API calls not executed here |
| Admin panel (users, subs, payments, health, recommendations/rules, flags, calendar, notifications, audit, errors, inbox) | ✅ | |
| Security headers / CSP / input validation / audit log / backups | ✅ | External penetration test recommended ⏳ |
| GST-compliant tax invoices | ⏳ ⚖️ | Receipts exist; GSTIN and invoice numbering rules needed |
| **Android application** | ⏳ | Not built in this session. See the next steps below |
| Deployment guide, env docs, backup/restore | ✅ | Not executed on a real server |
| Horizontal scaling | ⏳ | Single-instance design (SQLite, in-memory rate limits) |

## Next steps (in priority order)

1. **Run it on your PC.** Follow SETUP.md, then click through the terminal with DEMO data.
2. **Android app (Stage 11).** Your laptop already has Android Studio, JDKs and Expo. The recommended path is a native Kotlin shell around the production web app: a Trusted Web Activity or WebView with app branding, secure cookie session, deep links, a native FCM push handler that calls `/api/push/register`, and offline/error screens. This must be built and tested on your machine with the Android SDK, which this session didn't have.
3. **Choose and license a market-data vendor**, then write its bridge for `http-feed`.
4. **Legal & regulatory:** SEBI RA/IA path, privacy policy, terms, GST.
5. **Razorpay test mode end-to-end** with the real dashboard webhook.
6. **Email provider** for password reset and verification.
7. **Back-test the rule set** on licensed historical data before showing any performance figures publicly.
