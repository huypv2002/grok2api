-- Track active requests for rate limiting
CREATE TABLE IF NOT EXISTS active_requests (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  started_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_active_requests_user ON active_requests(user_id);

-- Auto-cleanup old requests (stuck > 5 minutes)
-- This will be done in code, not trigger
