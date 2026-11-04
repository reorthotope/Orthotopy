-- 0004: dashboard works + per-day stats.
--
-- The self-healing ensureProfileSchema() in functions/api/_shared.js applies
-- these automatically, so running this file is optional — it exists for
-- reference and for applying the migration manually ahead of a deploy.
--
-- works: one row per published work, owned by the Orthotopy username. The
-- publishing pipeline (currently: approved GitHub issues → catalog) inserts
-- them once a submission is accepted.
-- work_stats_daily: per-UTC-day view/download counters, incremented by the
-- public POST /api/track beacon (one count per work+type+IP per hour).

CREATE TABLE IF NOT EXISTS works (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  title TEXT NOT NULL,
  tagline TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'Developer',
  category TEXT NOT NULL DEFAULT 'Other',
  icon TEXT NOT NULL DEFAULT 'sparkles',
  gradient TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_works_username ON works(username);

CREATE TABLE IF NOT EXISTS work_stats_daily (
  work_id TEXT NOT NULL,
  day TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  downloads INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (work_id, day)
);
