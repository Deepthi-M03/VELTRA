# VELTRA for Android

This is a native Kotlin app that hosts the VELTRA terminal. It shares one codebase with the web terminal, so every feature appears on Android the moment it ships on the server:

- Login
- Market overview
- Equity, options, futures, commodity and currency workspaces
- AI Trade Studio with touch charts (pan and pinch-zoom)
- Watchlists, alerts and journal
- Notifications
- Subscriptions and payments (Razorpay checkout, UPI apps)
- Profile

**Native parts:**
- Crimson Dynasty splash screen and adaptive launcher icon
- Hardened WebView: HTTPS-only in release, no file access, third-party cookies off, Safe Browsing on, debugging only in debug builds
- Session cookie kept in app-private storage and excluded from cloud backup
- Navigation locked to your server; external links open in the browser
- UPI/`intent:` payment hand-off to the user's payment apps
- Android back button, pull-to-refresh (disabled on charts)
- Native offline/error screen with Retry
- Deep links `veltra://open?path=/app/studio/12`
- Notification channels, plus Firebase Cloud Messaging push (optional, auto-enabled)
- A small JavaScript bridge (`window.VeltraAndroid`) for the push token and notification permission

## Build in Android Studio (Windows)

1. **Start the VELTRA server** on your PC (see the root `SETUP.md`):
   ```powershell
   cd C:\Users\<you>\veltra
   npm start
   ```
2. In Android Studio, choose **File → Open** and select `C:\Users\<you>\veltra\apps\android`.
3. Let Gradle sync finish. The first sync downloads the Android Gradle Plugin and libraries, which needs internet.
4. Create an emulator (**Device Manager → Create device**, any Pixel, API 34 or 35) and press **Run ▶**.
   The debug build opens `http://10.0.2.2:4000`, which is how the emulator reaches your PC's `localhost:4000`.

### Physical phone on the same Wi-Fi

1. Find your PC's IP address:
   ```powershell
   ipconfig
   ```
   Use the IPv4 address, for example `192.168.1.20`.
2. Start the server so the phone can reach it:
   ```powershell
   $env:HOST="0.0.0.0"; npm start
   ```
   If Windows Firewall asks, allow Node.js on **Private networks**.
3. In `apps/android/gradle.properties`, set `veltraDebugUrl=http://192.168.1.20:4000`. Alternatively, tap **Change server (debug)** on the app's connection-error screen.
4. Enable **USB debugging** on the phone, connect it, and press **Run ▶**.

## Release build

1. Deploy the server with HTTPS (root `DEPLOYMENT.md`).
2. Set `veltraReleaseUrl=https://your-domain` in `gradle.properties`. Release builds refuse plain HTTP.
3. **Build → Generate Signed App Bundle / APK**, create a keystore, and store it safely outside the project. The `.gitignore` already excludes it.
4. Upload the `.aab` to Google Play Console. Financial apps must complete Play's financial-features declaration.

## Push notifications (optional)

1. Create a Firebase project and add **two Android apps**: `com.veltra.app` and `com.veltra.app.debug`.
2. Download `google-services.json` into `apps/android/app/`. The build detects it and enables FCM automatically.
3. Server side: Firebase console → Project settings → Service accounts → **Generate new private key**. Save it outside the repo, then set `FCM_SERVICE_ACCOUNT_FILE` in the server `.env` (see `ENVIRONMENT.md`).
4. Sign in on the app and allow notifications. The token is registered with the server automatically. Price alerts, setup updates, payment confirmations and expiry reminders then arrive even when the app is closed. Users can control these under **Profile → Notification preferences**.

## Known limitation

Google sign-in is hidden in the app because Google blocks OAuth inside embedded WebViews. Email and password sign-in works.
