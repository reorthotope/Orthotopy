-- Orthotopy dev-team applications.
--
-- Run once on the D1 database bound as `DB`:
--   Cloudflare dashboard → Storage & Databases → D1 → orthotopy-db → Console
--   (paste this file and run), or with wrangler:
--   wrangler d1 execute orthotopy-db --remote --file migrations/0001_users.sql

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  password_hash TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
