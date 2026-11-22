# API DOCUMENTATION

Base URL: `/api`. All requests and responses are JSON. Errors return `{ "error": "message" }` with an appropriate HTTP status (400 validation, 401 unauthenticated, 403 forbidden/CSRF, 404, 409 conflict, 413 too large, 415 wrong content type, 423 account locked, 429 rate-limited, 5xx server).

## Authentication & security model

- **Session:** an HttpOnly `veltra_sid` cookie (SameSite=Lax; Secure in production). It is an opaque token, and only its SHA-256 hash is stored server-side.
- **CSRF:** every authenticated `POST/PUT/PATCH/DELETE` must send the `X-CSRF-Token` header. The token is returned by `/api/auth/login`, `/api/auth/register` and `/api/auth/me`. Unauthenticated writes are checked for a same-origin `Origin` header.
- **Rate limits** (per IP): 600 req/min overall; auth 10 per 15 min; forgot-password 5 per 15 min; contact 5/hour; payments 20 orders/hour.
- **Roles:** `user`, `admin`. Every `/api/admin/*` route requires `admin`, and denied attempts are audit-logged.
- **Data status:** every quote carries `dataStatus` ∈ `LIVE | DELAYED | DEMO | UNAVAILABLE`, plus `provider` and `timestamp`.

Legend: 🔓 public · 🔐 signed-in · 👑 admin

## Auth

| Method | Path | | Body / query | Notes |
|---|---|---|---|---|
| GET | `/auth/me` | 🔓 | | `{user, csrfToken, subscriptions, googleEnabled}` |
| POST | `/auth/register` | 🔓 | `{email, password, name, acceptTerms:true}` | Password: 10+ chars, letters and numbers |
| POST | `/auth/login` | 🔓 | `{email, password}` | Locks for 15 min after 5 failures (423) |
| POST | `/auth/logout` | 🔐 | | |
| POST | `/auth/forgot-password` | 🔓 | `{email}` | Always 200, so it never reveals whether an account exists |
| POST | `/auth/reset-password` | 🔓 | `{token, password}` | Single-use token, 30 min; signs out all sessions |
| POST | `/auth/verify-email` | 🔓 | `{token}` | 24 h token |
| POST | `/auth/resend-verification` | 🔐 | | |
| POST | `/auth/change-password` | 🔐 | `{currentPassword, newPassword}` | Signs out other sessions |
| GET | `/auth/google` → `/auth/google/callback` | 🔓 | | OAuth code flow with state cookie (503 if not configured) |

## Market data

| Method | Path | | Notes |
|---|---|---|---|
| GET | `/market/status` | 🔓 | Data status, provider, per-segment session phase (IST) |
| GET | `/market/preview` | 🔓 | Homepage teaser: 4 indices + top 5 by value |
| GET | `/market/preview/:id/bars` | 🔓 | 120 × 15m bars for preview instruments only |
| GET | `/market/overview` | 🔐 | Indices, VIX, sectors, breadth, sentiment (with method) |
| GET | `/market/top-volume` · `/market/top-value` | 🔐 | Top 10 eligible equities, with direction and volume momentum |
| GET | `/instruments?category=&segment=&search=` | 🔐 | Up to 200 quote views |
| GET | `/instruments/:id/bars?timeframe=1m\|5m\|15m\|1h\|1d&limit=` | 🔐 | OHLCV |
| GET | `/studio/:id?timeframe=` | 🔐 | Bars, indicator series, latest indicators, active setup (requires a category subscription, else `recommendationLocked:true`), AI analysis |

## Intelligence

| Method | Path | | Notes |
|---|---|---|---|
| GET | `/intel/:category/recommendations?status=active\|closed\|all&horizon=` | 🔐 | `access:false` returns locked stubs without levels |
| GET | `/intel/:category/universe?index=nifty50\|banknifty\|all` | 🔐 | Instruments with quotes |
| GET | `/intel/options/underlyings` | 🔐 | |
| GET | `/intel/options/chain?underlying=&expiry=YYYY-MM-DD` | 🔐 | Chain with Greeks, PCR, max pain, OI walls, bias; `setup` requires an options subscription |
| GET | `/performance?category=` | 🔐 | Full record including losses and expiries, plus recently closed setups |

Recommendation object fields: `symbol, direction, horizon, entryLow, entryHigh, stopLoss, target1, target2, support, resistance, riskReward, score, confidence{method, factors{…detail,value}}, technical{indicator inputs}, technicalExplanation, ai{narrative, findings}, dataStatus, provider, ruleSet, status, createdAt, expiresAt`.

## Subscriptions & payments

| Method | Path | | Notes |
|---|---|---|---|
| GET | `/pricing` | 🔓 | Categories, ₹50/day (5000 paise), gateway, whether checkout is allowed |
| POST | `/subscriptions/quote` | 🔐 | `{items:[{category, days}]}` |
| GET | `/subscriptions` | 🔐 | Active periods, history, payments |
| POST | `/payments/order` | 🔐 | Creates a gateway order. Returns `checkout` for Razorpay Checkout or the sandbox page |
| POST | `/payments/verify` | 🔐 | `{orderId, paymentId, signature}`: HMAC check **and** gateway re-fetch of amount and status. Idempotent |
| POST | `/payments/failed` | 🔐 | Records a client-reported failure (never grants access) |
| GET | `/payments/:id/receipt` | 🔐 | Paid payments only, owner only |
| POST | `/payments/webhook` | gateway | `X-Razorpay-Signature` HMAC over the raw body; idempotent per event ID |
| POST | `/sandbox-gateway/pay` | 🔐 | **Sandbox only.** Simulates the hosted checkout |

## User workspace

`PATCH /profile`, `GET /profile/sessions`, `POST /profile/logout-others`
`GET|POST /watchlists`, `PATCH|DELETE /watchlists/:id`, `POST /watchlists/:id/items {instrumentId}`, `DELETE /watchlists/:id/items/:instrumentId`
`GET|POST /alerts {instrumentId, condition: above|below|pct_change_above|pct_change_below, value}`, `DELETE /alerts/:id`
`GET|POST /journal {instrumentId, kind: paper|actual, side, quantity, entryPrice?, stopLoss?, target?, notes?}`. Paper trades fill at the server's recorded price and cannot be deleted.
`POST /journal/:id/close {exitPrice?}`, `DELETE /journal/:id` (actual trades only)
`GET /notifications`, `POST /notifications/read-all`, `GET|PUT /notifications/preferences`, `POST /push/register {platform, token}`
`POST /contact` 🔓

## Live stream

`GET /api/stream` 🔐 is a Server-Sent Events stream with these events:
- `quotes` → `{dataStatus, rows:[[id, ltp, changePct, volume, dataStatus, timestamp], …]}`
- `notification` → the notification object

## Admin 👑

`GET /admin/summary` · `GET /admin/health` · `GET /admin/users?search=` · `PATCH /admin/users/:id {role?, status?}` · `GET|POST /admin/subscriptions {userId, category, days}` · `DELETE /admin/subscriptions/:id` · `GET /admin/payments` · `GET /admin/recommendations` · `PUT /admin/rules` · `POST /admin/scan` · `GET /admin/flags` · `PUT /admin/flags/:key {enabled, confirm?}` · `GET|POST /admin/holidays` · `DELETE /admin/holidays/:exchange/:date` · `POST /admin/notifications {title, body, userId?}` · `GET /admin/audit` · `GET /admin/errors` · `GET /admin/contact` · `GET /admin/outbox`

## Health

`GET /api/health` 🔓 → `{ok:true, time}`
