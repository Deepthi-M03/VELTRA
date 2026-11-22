# DEPLOYMENT

VELTRA runs as a single Node.js process with a SQLite database file. There is no build step: the browser loads the ES modules directly.

## Recommended topology

```
Internet ──HTTPS──▶ Caddy or Nginx (TLS, gzip) ──HTTP──▶ node apps/server/src/index.js (127.0.0.1:4000)
                                                            └── data/veltra.db (+ daily backups)
```

A small Linux VM (1 vCPU / 1 GB RAM) located in India (for example Mumbai) is enough to start with.

## 1. Server preparation (Ubuntu)

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs caddy
sudo useradd -r -m -d /opt/veltra veltra
sudo -u veltra git clone <your-repo> /opt/veltra/app   # or upload the zip
cd /opt/veltra/app && sudo -u veltra cp .env.example .env && sudo -u veltra nano .env
```

Production `.env` essentials:

```
NODE_ENV=production
PUBLIC_URL=https://veltra.example.com
COOKIE_SECURE=true
TRUST_PROXY=true
PAYMENT_PROVIDER=razorpay
```

Then add the Razorpay, market feed and AI credentials (see ENVIRONMENT.md).

## 2. Database migration

```bash
sudo -u veltra npm run migrate
sudo -u veltra npm run create-admin -- admin@example.com "Admin"
```

Migrations are append-only SQL files applied exactly once and recorded in `schema_migrations`. **Run a backup before migrating** in production (`npm run backup-db`).

## 3. Run as a service (systemd)

`/etc/systemd/system/veltra.service`:

```ini
[Unit]
Description=VELTRA
After=network.target
[Service]
User=veltra
WorkingDirectory=/opt/veltra/app
ExecStart=/usr/bin/node --no-warnings=ExperimentalWarning apps/server/src/index.js
Restart=always
Environment=NODE_ENV=production
[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now veltra
```

## 4. Domain & HTTPS (Caddy)

1. Point your domain's DNS **A record** at the server's IP address.
2. Add this to `/etc/caddy/Caddyfile`:

```
veltra.example.com {
  encode gzip
  reverse_proxy 127.0.0.1:4000 {
    flush_interval -1   # needed for live price streaming (Server-Sent Events)
  }
}
```

3. Run `sudo systemctl reload caddy`. Caddy obtains and renews TLS certificates automatically.

## 5. Payment webhook

In the Razorpay Dashboard, add a webhook for `https://veltra.example.com/api/payments/webhook` with the events `payment.captured`, `order.paid` and `payment.failed`. Use the secret you put in `RAZORPAY_WEBHOOK_SECRET`. To check that it works, open *Administration → Payments → Webhook deliveries*; a correctly configured webhook shows `valid`.

## 6. Backups & recovery

Schedule a daily backup with cron:

```bash
0 2 * * * cd /opt/veltra/app && /usr/bin/npm run backup-db >> /var/log/veltra-backup.log 2>&1
```

Copy `data/backups/` off the server, for example to object storage with `rclone`. The 30 most recent backups are kept locally.

**To restore:**

```bash
sudo systemctl stop veltra
cp data/backups/veltra-YYYYMMDD-HHMMSS.db data/veltra.db
rm -f data/veltra.db-wal data/veltra.db-shm
sudo systemctl start veltra
```

## 7. Monitoring

- `GET /api/health` is the liveness check; point an uptime monitor at it.
- *Administration → System health* shows feed status, staleness, AI failures, webhook signature failures, 5xx counts and memory use.
- Server-side errors are stored in `error_logs` (*Administration → Error log*).

## Scaling notes

SQLite in WAL mode handles a single server well. Rate limits and the live stream are held in process memory, so before running multiple instances, move to PostgreSQL (the SQL is ANSI-leaning) and a shared rate-limit store.
