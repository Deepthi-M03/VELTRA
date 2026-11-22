# ENVIRONMENT VARIABLES

Variables are read from the process environment, then from `.env` in the project root. Real environment variables take precedence over `.env`. Secrets are never stored in the database or sent to the browser.

| Variable | Default | Secret | Description |
|---|---|---|---|
| `NODE_ENV` | `development` | | `production` enforces `COOKIE_SECURE=true` and forbids the sandbox gateway |
| `PORT` | `4000` | | HTTP port |
| `HOST` | `127.0.0.1` | | Bind address. Use `0.0.0.0` only behind a reverse proxy or firewall |
| `PUBLIC_URL` | `http://localhost:PORT` | | Public base URL, used in emails and OAuth redirects |
| `DATABASE_FILE` | `data/veltra.db` | | SQLite file path |
| `TRUST_PROXY` | `false` | | Trust `X-Forwarded-For` (only behind your own proxy) |
| `SESSION_DAYS` | `7` | | Session lifetime |
| `COOKIE_SECURE` | prod: `true` | | Send cookies over HTTPS only |
| `RATE_LIMIT_SCALE` | `1` | | Multiplier for all rate limits |
| `MARKET_PROVIDER` | `demo` | | `demo` or `http-feed` |
| `MARKET_FEED_URL` | | | Base URL of the licensed-feed bridge |
| `MARKET_FEED_API_KEY` | | ✅ | Bearer token for the bridge |
| `MARKET_FEED_DELAYED` | `false` | | Label data as DELAYED |
| `MARKET_POLL_MS` | `3000` | | Poll interval |
| `MARKET_STALE_AFTER_MS` | `15000` | | Mark data UNAVAILABLE after this long without a valid update |
| `MARKET_MONITOR_START` / `END` | `09:10` / `15:30` | | IST equity monitoring window |
| `DEMO_ALWAYS_OPEN` | `true` | | DEMO provider ignores market hours |
| `AI_PROVIDER` | `deterministic` | | `deterministic` or `anthropic` |
| `ANTHROPIC_API_KEY` | | ✅ | Claude API key |
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` | | Model ID |
| `AI_TIMEOUT_MS` / `AI_MAX_RETRIES` / `AI_RATE_PER_MINUTE` | `20000` / `2` / `30` | | AI call controls |
| `PAYMENT_PROVIDER` | `sandbox` | | `sandbox` or `razorpay` |
| `RAZORPAY_KEY_ID` | | | Public key ID |
| `RAZORPAY_KEY_SECRET` | | ✅ | Signs order/payment verification |
| `RAZORPAY_WEBHOOK_SECRET` | | ✅ | Verifies webhook HMAC |
| `SANDBOX_PAYMENT_SECRET` | | ✅ | Signing key for the local sandbox gateway |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | | secret ✅ | Google OAuth |

## Feature flags (database, set by admins)

| Flag | Default | Meaning |
|---|---|---|
| `paid_recommendations` | OFF | Sell recommendation access to the public. Enabling it requires typing a SEBI-registration confirmation; the change is audit-logged. |
| `live_payments` | OFF | Allow checkout through a live (non-test) gateway |
| `public_registration` | ON | Allow self-registration |
| `ai_narratives` | ON | Show AI narrative text |
