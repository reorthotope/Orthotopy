-- 0003: GitHub OAuth identity columns.
--
-- The self-healing ensureProfileSchema() in functions/api/_shared.js applies
-- these automatically, so running this file is optional — it exists for
-- reference and for applying the migration manually ahead of a deploy.
--
-- Filled by GET /api/github/callback after a successful OAuth round-trip
-- (scopes read:user user:email). The GitHub login is the trusted identity
-- used for the star check; name/email are the verified profile data. The
-- avatar is not stored — the dashboard derives it from the login via
-- https://github.com/<login>.png.

ALTER TABLE users ADD COLUMN github_name TEXT;
ALTER TABLE users ADD COLUMN github_email TEXT;
