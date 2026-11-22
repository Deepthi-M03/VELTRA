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
| Password reset & email verification | ✅ (tokens) / 🔑 (delivery) | Resend/SendGrid/Postmark delivery implemented and tested with mocked APIs; needs an API key |
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
| Android push (FCM HTTP v1, service-account JWT) | ✅ (mocked) / 🔑 | Token registration tested in the browser; sending tested with mocked Google APIs; needs a Firebase project |
| Subscriptions ₹50/day/category, multi-category, renewal stacking, expiry reminders, access control | ✅ 🧪 | |
| Razorpay orders, signature + payment re-fetch, webhooks, receipts | 🔑 | Verification logic unit-tested; API calls not executed here |
| Admin panel (users, subs, payments, health, recommendations/rules, flags, calendar, notifications, audit, errors, inbox) | ✅ | |
| Security headers / CSP / input validation / audit log / backups | ✅ | External penetration test recommended ⏳ |
| GST tax-invoice details on receipts | ✅ / ⚖️ | Taxable value + GST shown when SELLER_GSTIN is set; confirm CGST/SGST/IGST, SAC code and numbering with a CA |
| **Android application** (Kotlin, splash, adaptive icon, hardened WebView, deep links, UPI hand-off, offline screen, FCM, channels) | ✅ written / ⏳ not compiled | No Android SDK in the build environment. First build in Android Studio — see apps/android/README.md. Web side of the bridge is e2e-tested |
| Deployment guide, env docs, backup/restore | ✅ | Not executed on a real server |
| Horizontal scaling | ⏳ | Single-instance design (SQLite, in-memory rate limits) |

## Next steps (in priority order)

1. **Run the server on your PC** (SETUP.md) and click through with DEMO data.
2. **Build the Android app** in Android Studio (apps/android/README.md) and run it on the emulator. This is the one part I couldn't compile, so tell me about any Gradle or Kotlin error and I'll fix it.
3. **Choose and license a market-data vendor**, then write its bridge for `http-feed`.
4. **Legal & regulatory:** SEBI RA/IA path, privacy policy, terms, GST treatment with a CA.
5. **Razorpay test mode end-to-end** with the real dashboard webhook; email provider; Firebase project.
6. **Back-test the rule set** on licensed historical data before publishing performance figures.
7. Deploy (DEPLOYMENT.md), then a third-party security review before public launch.
