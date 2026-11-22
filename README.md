# VELTRA — Intelligence Beyond the Market

VELTRA is a financial-intelligence platform for Indian markets: NSE equities, F&O, MCX commodities and currency derivatives. It shows market structure, generates rule-based trade setups from validated data, explains them with a guard-railed AI narrative, and keeps an honest record of every setup, losses included.

**Design identity:** Crimson Dynasty (obsidian, burgundy, royal crimson, rose gold).

## Quick start (Windows PowerShell)

You need **Node.js 22.13 or newer**. There's nothing else to install: VELTRA has **zero npm dependencies**.

```powershell
cd C:\Users\<you>\veltra
Copy-Item .env.example .env
npm run migrate
npm run create-admin -- you@example.com "Your Name"
npm start
```

Open http://localhost:4000. The full guide is in [SETUP.md](SETUP.md).

## What's inside

| Path | Purpose |
|---|---|
| `apps/server` | HTTP API, auth, sessions, routes, background jobs (Node built-ins only) |
| `apps/web/public` | Public website + trading terminal (ES modules, no build step) |
| `packages/database` | SQLite access (`node:sqlite`) + versioned SQL migrations |
| `packages/market-engine` | Session calendar, provider interface, validation, indicators, option math, recommendation engine |
| `packages/ai-engine` | Findings/narrative separation, numeric guardrail, Anthropic provider |
| `packages/payments` | Gateway abstraction: Razorpay + sandbox |
| `packages/shared` | Constants shared by server and browser |
| `tests` | Unit, API integration and end-to-end browser tests |

## Key commands

| Command | What it does |
|---|---|
| `npm start` | Run the server |
| `npm run dev` | Run with auto-restart on file changes |
| `npm run migrate` | Apply database migrations (safe to repeat) |
| `npm run create-admin -- email "Name"` | Create or promote an administrator |
| `npm run backup-db` | Consistent online backup to `data/backups/` |
| `npm test` | Unit + API tests |
| `npm run test:e2e` | Browser journeys (needs Playwright) |

## Honest status

DEMO market data, the sandbox gateway and the deterministic AI work out of the box. Live NSE/MCX data, real payments, Google sign-in, email delivery and Claude narratives each need credentials or licences. Selling recommendations to the public needs SEBI registration. The Android app is not built yet. See [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md).

Docs: [SETUP](SETUP.md) · [ENVIRONMENT](ENVIRONMENT.md) · [DEPLOYMENT](DEPLOYMENT.md) · [API](API_DOCUMENTATION.md) · [DATABASE](DATABASE.md) · [TEST_REPORT](TEST_REPORT.md) · [CHANGELOG](CHANGELOG.md)
