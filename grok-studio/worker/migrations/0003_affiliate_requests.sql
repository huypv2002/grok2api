-- Affiliate (CTV) self-registration requests
CREATE TABLE IF NOT EXISTS affiliate_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  ref_code TEXT NOT NULL,
  note TEXT DEFAULT '',
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  reject_reason TEXT DEFAULT NULL,
  reviewed_by INTEGER DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  reviewed_at TEXT DEFAULT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Only one pending request per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_aff_req_user ON affiliate_requests(user_id) WHERE status = 'pending';
