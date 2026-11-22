-- VELTRA initial schema. Money is stored in paise (INTEGER). Times are ISO-8601 UTC strings
-- unless the column name ends in _ms (epoch milliseconds).

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL
);
INSERT OR IGNORE INTO roles (id, description) VALUES
  ('user', 'Regular platform user'),
  ('admin', 'Platform administrator');

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT,                       -- NULL for Google-only accounts
  name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'user' REFERENCES roles(id),
  email_verified_at TEXT,
  google_sub TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,                      -- SHA-256 of the cookie token, never the token itself
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS auth_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('password_reset','email_verify')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS instruments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  exchange TEXT NOT NULL,                   -- NSE, MCX, NSE_CD
  segment TEXT NOT NULL,                    -- EQ, IDX, FUT, OPT, COM, CUR
  name TEXT NOT NULL,
  sector TEXT,
  category TEXT,                            -- equity/options/futures/commodity/currency
  lot_size INTEGER,
  tick_size REAL,
  expiry TEXT,
  strike REAL,
  option_type TEXT CHECK (option_type IN ('CE','PE') OR option_type IS NULL),
  underlying TEXT,
  in_nifty50 INTEGER NOT NULL DEFAULT 0,
  in_banknifty INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE (symbol, exchange, segment, expiry, strike, option_type)
);
CREATE INDEX IF NOT EXISTS idx_instruments_category ON instruments(category, active);

CREATE TABLE IF NOT EXISTS market_quotes (
  instrument_id INTEGER PRIMARY KEY REFERENCES instruments(id) ON DELETE CASCADE,
  ltp REAL NOT NULL,
  open REAL, high REAL, low REAL, prev_close REAL,
  volume INTEGER NOT NULL DEFAULT 0,
  traded_value REAL NOT NULL DEFAULT 0,
  oi INTEGER, oi_change INTEGER, iv REAL,
  data_status TEXT NOT NULL CHECK (data_status IN ('LIVE','DELAYED','DEMO','UNAVAILABLE')),
  provider TEXT NOT NULL,
  source_ts TEXT NOT NULL,                  -- provider timestamp
  received_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS price_bars (
  instrument_id INTEGER NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
  timeframe TEXT NOT NULL,
  ts_ms INTEGER NOT NULL,
  open REAL NOT NULL, high REAL NOT NULL, low REAL NOT NULL, close REAL NOT NULL,
  volume INTEGER NOT NULL DEFAULT 0,
  data_status TEXT NOT NULL,
  provider TEXT NOT NULL,
  PRIMARY KEY (instrument_id, timeframe, ts_ms),
  CHECK (high >= low)
);

CREATE TABLE IF NOT EXISTS indicator_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instrument_id INTEGER NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
  timeframe TEXT NOT NULL,
  computed_at TEXT NOT NULL,
  values_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_indicators_instr ON indicator_snapshots(instrument_id, computed_at);

CREATE TABLE IF NOT EXISTS recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instrument_id INTEGER NOT NULL REFERENCES instruments(id),
  category TEXT NOT NULL,
  horizon TEXT NOT NULL CHECK (horizon IN ('intraday','delivery','positional')),
  direction TEXT NOT NULL CHECK (direction IN ('LONG','SHORT')),
  entry_low REAL NOT NULL, entry_high REAL NOT NULL,
  stop_loss REAL NOT NULL,
  target1 REAL NOT NULL, target2 REAL,
  support REAL, resistance REAL,
  risk_reward REAL NOT NULL,
  score REAL NOT NULL,
  confidence_json TEXT NOT NULL,            -- factor-by-factor scoring breakdown
  technical_json TEXT NOT NULL,             -- indicator inputs used
  data_status TEXT NOT NULL,
  provider TEXT NOT NULL,
  rule_set_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','entered','target1_hit','target2_hit','stopped','expired')),
  entered_at TEXT, closed_at TEXT, exit_price REAL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reco_status ON recommendations(status, category);
CREATE INDEX IF NOT EXISTS idx_reco_created ON recommendations(created_at);

CREATE TABLE IF NOT EXISTS recommendation_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recommendation_id INTEGER NOT NULL REFERENCES recommendations(id),
  event TEXT NOT NULL,
  price REAL,
  at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instrument_id INTEGER REFERENCES instruments(id),
  recommendation_id INTEGER REFERENCES recommendations(id),
  kind TEXT NOT NULL,                       -- instrument, market_summary, recommendation
  provider TEXT NOT NULL,
  model TEXT,
  inputs_json TEXT NOT NULL,                -- exact numbers the text is allowed to cite
  findings_json TEXT NOT NULL,              -- data-based findings (deterministic)
  narrative TEXT NOT NULL,                  -- model-generated interpretation
  guardrail_json TEXT NOT NULL,             -- result of numeric-claim verification
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_instr ON ai_analyses(instrument_id, created_at);

CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('equity','options','futures','commodity','currency')),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled','revoked')),
  payment_id INTEGER REFERENCES payments(id),
  granted_by INTEGER REFERENCES users(id),  -- admin grant, if any
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_subs_user ON subscriptions(user_id, category, ends_at);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL,
  provider_order_id TEXT NOT NULL UNIQUE,
  provider_payment_id TEXT UNIQUE,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  items_json TEXT NOT NULL,                 -- [{category, days}]
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','paid','failed','refunded')),
  failure_reason TEXT,
  receipt_no TEXT UNIQUE,
  verified_via TEXT,                        -- 'signature', 'webhook'
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  paid_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id, created_at);

CREATE TABLE IF NOT EXISTS payment_webhooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event TEXT NOT NULL,
  signature_valid INTEGER NOT NULL,
  payload TEXT NOT NULL,
  received_at TEXT NOT NULL,
  UNIQUE (provider, event_id)
);

CREATE TABLE IF NOT EXISTS watchlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (user_id, name)
);
CREATE TABLE IF NOT EXISTS watchlist_items (
  watchlist_id INTEGER NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
  instrument_id INTEGER NOT NULL REFERENCES instruments(id),
  position INTEGER NOT NULL DEFAULT 0,
  added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (watchlist_id, instrument_id)
);

CREATE TABLE IF NOT EXISTS price_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instrument_id INTEGER NOT NULL REFERENCES instruments(id),
  condition TEXT NOT NULL CHECK (condition IN ('above','below','pct_change_above','pct_change_below')),
  value REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','triggered','cancelled')),
  triggered_at TEXT, triggered_price REAL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_alerts_active ON price_alerts(status, instrument_id);

CREATE TABLE IF NOT EXISTS journal_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instrument_id INTEGER NOT NULL REFERENCES instruments(id),
  recommendation_id INTEGER REFERENCES recommendations(id),
  kind TEXT NOT NULL CHECK (kind IN ('paper','actual')),
  side TEXT NOT NULL CHECK (side IN ('BUY','SELL')),
  quantity REAL NOT NULL CHECK (quantity > 0),
  entry_price REAL NOT NULL CHECK (entry_price > 0),
  exit_price REAL,
  stop_loss REAL, target REAL,
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  notes TEXT,
  tags TEXT
);
CREATE INDEX IF NOT EXISTS idx_journal_user ON journal_entries(user_id, opened_at);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,  -- NULL = broadcast
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, created_at);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  in_app INTEGER NOT NULL DEFAULT 1,
  browser INTEGER NOT NULL DEFAULT 1,
  push INTEGER NOT NULL DEFAULT 0,
  email INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, type)
);

CREATE TABLE IF NOT EXISTS push_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS provider_configs (
  kind TEXT NOT NULL CHECK (kind IN ('market','ai','payment')),
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  settings_json TEXT NOT NULL DEFAULT '{}',  -- never secrets; secrets stay in environment variables
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (kind, name)
);

CREATE TABLE IF NOT EXISTS feature_flags (
  key TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL,
  description TEXT NOT NULL,
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT OR IGNORE INTO feature_flags (key, enabled, description) VALUES
  ('paid_recommendations', 0, 'Sell recommendation access to the public. Keep OFF until SEBI Research Analyst/Investment Adviser registration is obtained.'),
  ('live_payments', 0, 'Accept real-money payments via the live gateway. Sandbox payments work regardless in development.'),
  ('public_registration', 1, 'Allow new users to self-register.'),
  ('ai_narratives', 1, 'Show AI-generated narrative text alongside data-based findings.');

CREATE TABLE IF NOT EXISTS market_holidays (
  date TEXT NOT NULL,                       -- YYYY-MM-DD (IST)
  exchange TEXT NOT NULL DEFAULT 'NSE',
  description TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'holiday' CHECK (kind IN ('holiday','special_session')),
  open_time TEXT, close_time TEXT,          -- HH:MM IST for special sessions
  PRIMARY KEY (date, exchange)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  target TEXT,
  meta_json TEXT,
  ip TEXT,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_logs(at);

CREATE TABLE IF NOT EXISTS error_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  meta_json TEXT,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_errors_at ON error_logs(at);

CREATE TABLE IF NOT EXISTS contact_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, email TEXT NOT NULL, subject TEXT NOT NULL, message TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS email_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_email TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
