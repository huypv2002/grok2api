-- Add limited_at column to grok_accounts for tracking when a token was rate-limited
-- Token auto-unlocks after 2 hours
ALTER TABLE grok_accounts ADD COLUMN limited_at TEXT DEFAULT NULL;

-- Add favorite column to history if not exists (safe to run multiple times)
-- Note: SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so this may error if column exists
-- ALTER TABLE history ADD COLUMN favorite INTEGER DEFAULT 0;
