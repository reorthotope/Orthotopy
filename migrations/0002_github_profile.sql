-- GitHub-profile gate for publishing (dev profile setup).
--
-- Before their first publish, an account must have BOTH:
--   1. a connected GitHub profile  (github_username)
--   2. a star on reorthotope/Orthotopy  (starred_at)
-- publish_access is flipped to 1 server-side once both are done.
--
-- The Pages Functions self-heal this schema at runtime (see
-- functions/api/_shared.js → ensureProfileSchema); this file documents it
-- and can be applied manually:
--   wrangler d1 execute orthotopy-db --remote --file migrations/0002_github_profile.sql

ALTER TABLE users ADD COLUMN github_username TEXT;
ALTER TABLE users ADD COLUMN github_connected_at TEXT;
ALTER TABLE users ADD COLUMN starred_at TEXT;
ALTER TABLE users ADD COLUMN publish_access INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
