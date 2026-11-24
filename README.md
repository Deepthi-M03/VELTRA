# VELTRA — Intelligence Beyond the Market

**[🌐 Visit VELTRA — Live Website](https://veltra-2cpz.onrender.com)**

VELTRA is a financial-intelligence platform for Indian markets: NSE equities, F&O, MCX commodities and currency derivatives. It shows market structure, generates rule-based trade setups from validated data, explains them with a guard-railed AI narrative, and keeps an honest record of every setup, losses included.

**Live Demo:** https://veltra-2cpz.onrender.com

**Design identity:** Crimson Dynasty (obsidian, burgundy, royal crimson, rose gold).

## What's inside

| Path | Purpose |
|---|---|
| `apps/server` | HTTP API, authentication, sessions, routes and background jobs |
| `apps/web/public` | Public website and trading terminal |
| `packages/database` | SQLite access and versioned SQL migrations |
| `packages/market-engine` | Market sessions, data validation, indicators, option mathematics and recommendation engine |
| `packages/ai-engine` | Findings/narrative separation, numeric guardrails and AI provider |
| `packages/payments` | Payment gateway abstraction: disabled, Razorpay and sandbox modes |
| `packages/shared` | Constants shared by server and browser |
| `apps/android` | Native Kotlin Android application |
| `tests` | Unit, API integration and end-to-end browser tests |

## Key capabilities

- Indian market intelligence across NSE equities, indices, F&O, MCX and currency derivatives.
- Market overview, instruments, watchlists and trading dashboards.
- Rule-based trade setups and technical analysis.
- Options and futures intelligence.
- AI-assisted trade explanations with numeric guardrails.
- Trade journal and paper-trading capabilities.
- User authentication and administrator controls.
- Subscription and payment gateway architecture.

## Deployment status

<badge color="success">Live on Render</badge>

**Website:** [https://veltra-2cpz.onrender.com](https://veltra-2cpz.onrender.com)

The current public demo uses:

- **Market data:** DEMO synthetic prices, clearly labelled in the interface.
- **Payments:** Disabled.
- **AI:** Deterministic provider.
- **Database:** In-memory SQLite; data resets when the service restarts.
- **Hosting:** Render free instance; it may spin down after inactivity.

This deployment is a demonstration, not yet a persistent commercial production service.

## Honest project status

All 12 development stages are implemented. Live NSE/MCX data, real payments, Google sign-in, email delivery, Android push and Claude narratives require the relevant credentials, integrations or licences.

Commercial distribution of market data and public investment recommendations may require appropriate licensing and regulatory compliance, including SEBI requirements.

The Android project has not yet been compiled in the build environment; its first build and testing need to be completed in Android Studio.

See [PRODUCTION_READINESS.md](https://github.com/Deepthi-M03/VELTRA/blob/master/PRODUCTION_READINESS.md).

## Documentation

- [Environment Configuration](https://github.com/Deepthi-M03/VELTRA/blob/master/ENVIRONMENT.md)
- [Deployment Guide](https://github.com/Deepthi-M03/VELTRA/blob/master/DEPLOYMENT.md)
- [API Documentation](https://github.com/Deepthi-M03/VELTRA/blob/master/API_DOCUMENTATION.md)
- [Database Documentation](https://github.com/Deepthi-M03/VELTRA/blob/master/DATABASE.md)
- [Test Report](https://github.com/Deepthi-M03/VELTRA/blob/master/TEST_REPORT.md)
- [Changelog](https://github.com/Deepthi-M03/VELTRA/blob/master/CHANGELOG.md)
