-- NSE equity / F&O / currency trading holidays for 2026 (weekday closures) and special sessions.
-- Source: NSE circular on 2026 trading holidays, as summarised by broker calendars (Upstox, Bajaj Broking).
-- Admins can edit this table from the admin panel; always re-check against the latest NSE circular.
INSERT OR IGNORE INTO market_holidays (date, exchange, description, kind) VALUES
  ('2026-01-15','NSE','Municipal Corporation Election - Maharashtra','holiday'),
  ('2026-01-26','NSE','Republic Day','holiday'),
  ('2026-03-03','NSE','Holi','holiday'),
  ('2026-03-26','NSE','Shri Ram Navami','holiday'),
  ('2026-03-31','NSE','Shri Mahavir Jayanti','holiday'),
  ('2026-04-03','NSE','Good Friday','holiday'),
  ('2026-04-14','NSE','Dr. Baba Saheb Ambedkar Jayanti','holiday'),
  ('2026-05-01','NSE','Maharashtra Day','holiday'),
  ('2026-05-28','NSE','Bakri Id','holiday'),
  ('2026-06-26','NSE','Muharram','holiday'),
  ('2026-09-14','NSE','Ganesh Chaturthi','holiday'),
  ('2026-10-02','NSE','Mahatma Gandhi Jayanti','holiday'),
  ('2026-10-20','NSE','Dussehra','holiday'),
  ('2026-11-10','NSE','Diwali Balipratipada','holiday'),
  ('2026-11-24','NSE','Prakash Gurpurb Sri Guru Nanak Dev','holiday'),
  ('2026-12-25','NSE','Christmas','holiday');

INSERT OR IGNORE INTO market_holidays (date, exchange, description, kind, open_time, close_time) VALUES
  ('2026-02-01','NSE','Union Budget special live session','special_session','09:15','15:00'),
  ('2026-11-08','NSE','Diwali Muhurat trading (timings per NSE circular — update when published)','special_session', NULL, NULL);
