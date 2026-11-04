-- 0003: GitHub OAuth identity columns.
--
-- The self-healing ensureProfileSchema() in functions/api/_shared.js applies
-- these automatically, so running this file is optional — it exists for
-- reference and for applying the migration manually ahead of a deploy.
--
-- Filled by GET /api/github/callback after a successful OAuth round-trip
-- (scopes read:user user:email). The GitHub login is the trusted identity
-- used for the star check; name/email/avatar are the verified profile data.

ALTER TABLE users ADD COLUMN github_name TEXT;
ALTER TABLE users ADD COLUMN github_email TEXT;
ALTER TABLE users ADD COLUMN github_avatar_url TEXT;
