# DATABASE

The engine is **SQLite** via Node's built-in `node:sqlite`, running in WAL mode with foreign keys ON and a 5 s busy timeout. The file is `data/veltra.db` (configurable with `DATABASE_FILE`).

## Migrations

- Files live in `packages/database/migrations/NNN_name.sql` and are applied in filename order, each inside a transaction, exactly once. Applied migrations are recorded in `schema_migrations`.
- `npm run migrate` is safe to repeat. The server also migrates on start-up.
- **Never edit an applied migration.** To make a change, add a new file (for example `003_add_x.sql`). Seed inserts use `INSERT OR IGNORE`, so they're repeatable.

## Conventions

- Money is stored as INTEGER **paise**. Timestamps are ISO-8601 UTC text, or `*_ms` epoch milliseconds for bars.
- Absent derivative fields (`expiry`, `strike`) are stored as `''` and `0` so that UNIQUE constraints de-duplicate correctly.

## Tables

| Table | Purpose | Key constraints / indexes |
|---|---|---|
| `roles` | `user`, `admin` | PK id |
| `users` | Accounts (scrypt hash, Google sub, lockout counters, status) | UNIQUE email (NOCASE), UNIQUE google_sub, CHECK status |
| `sessions` | Server-side sessions (SHA-256 of token), CSRF token, IP/UA | idx user, idx expires; cascade on user delete |
| `auth_tokens` | Password-reset & email-verify tokens (hashed, single-use) | UNIQUE token_hash, CHECK purpose |
| `instruments` | Equities, indices, futures, commodities, currencies | UNIQUE (symbol, exchange, segment, expiry, strike, option_type); idx category |
| `market_quotes` | Latest validated quote per instrument with data_status, provider, source/received times | PK instrument_id; CHECK data_status |
| `price_bars` | Historical OHLCV (live/delayed providers persist here) | PK (instrument, timeframe, ts); CHECK high ≥ low |
| `indicator_snapshots` | Indicator values snapshots | idx instrument, time |
| `recommendations` | Every setup ever published: levels, score, factor JSON, inputs, rule-set version, lifecycle status | CHECK direction/horizon/status; idx status, created |
| `recommendation_events` | Append-only lifecycle (created, entered, target1_hit, …) | FK recommendation |
| `ai_analyses` | Inputs, deterministic findings, narrative, guardrail result, provider/model | idx instrument, time |
| `subscriptions` | Category access periods (renewals stack as future periods) | CHECK category/status; idx (user, category, ends_at) |
| `payments` | Gateway orders/payments, items, status, receipt no., verification method | UNIQUE provider_order_id, provider_payment_id, receipt_no; CHECK amount > 0 |
| `payment_webhooks` | Every webhook delivery with signature validity | UNIQUE (provider, event_id) for idempotency |
| `watchlists`, `watchlist_items` | User lists | UNIQUE (user, name); PK (list, instrument) |
| `price_alerts` | Alert rules and trigger results | idx (status, instrument) |
| `journal_entries` | Paper/actual trades | CHECK kind/side/quantity > 0 |
| `notifications`, `notification_preferences`, `push_devices` | Notification records & per-type channel preferences | |
| `provider_configs` | Non-secret provider settings & screening-rule overrides | PK (kind, name) |
| `feature_flags` | Regulatory & operational switches | |
| `market_holidays` | NSE/MCX holidays & special sessions (2026 seeded) | PK (date, exchange) |
| `audit_logs` | Security & admin actions | idx at |
| `error_logs` | Server/feed/scanner errors | idx at |
| `contact_messages`, `email_outbox` | Support inbox, queued emails | |

## Data-retention policy built into the code

- Recommendations and their events are **never deleted**. Losing and expired setups stay in the record.
- Paper-trade journal entries cannot be deleted through the API.
- Expired sessions are purged every 10 minutes.

## Backups

`npm run backup-db` writes a consistent snapshot using `VACUUM INTO` while the server is running, and keeps the latest 30. Restore steps are in DEPLOYMENT.md.
