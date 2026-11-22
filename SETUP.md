# SETUP — running VELTRA on Windows

Every command below goes in **PowerShell**. Open it from the Start menu, or in VS Code via *Terminal → New Terminal*.

## 1. Check Node.js

```powershell
node -v
```

You need `v22.13.0` or newer (v24 is fine). If it's older or missing, install the LTS version from https://nodejs.org, then close and reopen PowerShell.

## 2. Put the project in place

Unzip `veltra.zip` to `C:\Users\<you>\veltra`, then:

```powershell
cd C:\Users\<you>\veltra
```

Every later command runs **from this folder**.

## 3. Create your configuration

```powershell
Copy-Item .env.example .env
code .env
```

The defaults work for local use: DEMO data, sandbox payments, deterministic AI. Change `SANDBOX_PAYMENT_SECRET` to any random text.

## 4. Create the database and an administrator

```powershell
npm run migrate
npm run create-admin -- you@example.com "Your Name"
```

`migrate` creates `data\veltra.db` and is safe to run again. `create-admin` asks for a password: at least 10 characters, with letters and numbers.

## 5. Start

```powershell
npm start
```

Open http://localhost:4000 and sign in. Press `Ctrl+C` to stop the server.

> Password-reset and verification emails aren't sent until you configure an email provider. They're written to `data\outbox\emails.log`, so open that file to click the link while developing.

## 6. Run the tests

```powershell
npm test
```

For the browser journeys (one-time setup):

```powershell
npm i -D playwright
npx playwright install chromium
npm run test:e2e
```

Screenshots are saved to `test-results\`.

---

## Connecting real services

### Licensed market data (required before showing LIVE data)

VELTRA does **not** scrape NSE. You need a data licence from an authorised vendor, such as an NSE-authorised data vendor or a broker API whose terms allow redistribution to your users. Two ways to connect one:

1. **Generic bridge (no code changes):** run a small adapter that converts your vendor's feed to the JSON contract documented at the top of `packages/market-engine/providers/http-feed.js`. Then set:
   ```
   MARKET_PROVIDER=http-feed
   MARKET_FEED_URL=https://your-bridge.example.com
   MARKET_FEED_API_KEY=...
   MARKET_FEED_DELAYED=false   # true if your licence is for delayed data
   ```
2. **Native provider:** create `packages/market-engine/providers/<vendor>.js` that extends `MarketDataProvider` (see `base.js`) and register it in `providers/index.js`.

Data then shows as **LIVE** (or **DELAYED**). If the feed stops for longer than `MARKET_STALE_AFTER_MS`, values switch to **UNAVAILABLE**, scanning pauses and alerts stop firing.

### Razorpay

1. Create a Razorpay account. In the Dashboard, switch to **Test Mode** and generate API keys.
2. In `.env`:
   ```
   PAYMENT_PROVIDER=razorpay
   RAZORPAY_KEY_ID=rzp_test_...
   RAZORPAY_KEY_SECRET=...
   RAZORPAY_WEBHOOK_SECRET=<choose a long random string>
   ```
3. Under **Dashboard → Settings → Webhooks**, add `https://<your-domain>/api/payments/webhook` with the events `payment.captured`, `order.paid` and `payment.failed`, using the same secret.
4. Test keys (`rzp_test_`) work immediately. Live keys also require the admin flags `live_payments` **and** `paid_recommendations` to be turned on (*Administration → Configuration*).

### Claude AI narratives

```
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

The model only receives the computed indicator values. Any narrative that cites a number not in those inputs is rejected and replaced by the deterministic text. *Administration → System health* shows calls, failures and guardrail rejections.

### Google sign-in

In Google Cloud Console, create an OAuth client of type *Web application*. Add the authorised redirect URI `https://<your-domain>/api/auth/google/callback` (or `http://localhost:4000/api/auth/google/callback` for local use). Then set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. The "Continue with Google" button appears automatically.

### Email delivery

Without a provider, messages are only queued in `data\outbox\emails.log`. To deliver real email, create an account with Resend, SendGrid or Postmark, verify your sender domain, and set:
```
EMAIL_PROVIDER=resend
EMAIL_API_KEY=...
EMAIL_FROM=noreply@your-domain.com
```
Delivery status shows in *Administration → Support inbox → Email outbox* and in *System health*.

### GST tax invoices

Set `SELLER_LEGAL_NAME`, `SELLER_ADDRESS`, `SELLER_GSTIN` and `SELLER_STATE_CODE`. Receipts then become tax invoices showing the taxable value and GST included in the ₹50/day price. Confirm the CGST+SGST/IGST treatment and SAC code with your chartered accountant.

### Android app & push notifications

See [apps/android/README.md](apps/android/README.md) for step-by-step Android Studio instructions (emulator, real phone, release build, Firebase push).
