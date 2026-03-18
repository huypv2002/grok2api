-- Add session tracking to history
ALTER TABLE history ADD COLUMN session_id TEXT DEFAULT NULL;
ALTER TABLE history ADD COLUMN session_name TEXT DEFAULT NULL;

-- Index for fast session queries
CREATE INDEX IF NOT EXISTS idx_history_session ON history(user_id, session_id);
