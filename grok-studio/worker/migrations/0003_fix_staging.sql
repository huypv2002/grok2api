-- Migration: recreate users table with superadmin role + all missing columns
PRAGMA foreign_keys = OFF;

CREATE TABLE users_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT DEFAULT '',
  role TEXT DEFAULT 'user' CHECK(role IN ('user','admin','superadmin')),
  plan TEXT DEFAULT 'free',
  credits INTEGER DEFAULT 10,
  daily_limit INTEGER DEFAULT -1,
  video_limit INTEGER DEFAULT -1,
  plan_expires TEXT DEFAULT NULL,
  ref_code TEXT UNIQUE,
  is_affiliate INTEGER DEFAULT 0,
  referred_by INTEGER DEFAULT NULL,
  affiliate_rate REAL DEFAULT 0.0,
  active_session TEXT DEFAULT NULL,
  tool_session TEXT DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

INSERT INTO users_new (id, email, password_hash, name, role, plan, credits, daily_limit, video_limit, plan_expires, created_at, updated_at)
  SELECT id, email, password_hash, name, role, plan, credits, daily_limit, video_limit, plan_expires, created_at, updated_at FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

PRAGMA foreign_keys = ON;
