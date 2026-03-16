-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT DEFAULT '',
  role TEXT DEFAULT 'user' CHECK(role IN ('user','admin')),
  plan TEXT DEFAULT 'free' CHECK(plan IN ('free','basic','pro','unlimited')),
  credits INTEGER DEFAULT 10,
  daily_limit INTEGER DEFAULT -1,
  video_limit INTEGER DEFAULT -1,
  plan_expires TEXT DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Grok accounts (SSO tokens) per user
CREATE TABLE IF NOT EXISTS grok_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  label TEXT DEFAULT '',
  sso_token TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK(status IN ('active','limited','invalid')),
  limited_at TEXT DEFAULT NULL,
  last_used TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Generation history
CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('text2video','image2video','text2image','image2image','extend_video')),
  prompt TEXT NOT NULL,
  input_url TEXT,
  output_url TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','processing','completed','failed')),
  favorite INTEGER DEFAULT 0,
  metadata TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Plans config
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price REAL DEFAULT 0,
  credits_per_month INTEGER DEFAULT 0,
  max_accounts INTEGER DEFAULT 1,
  daily_limit INTEGER DEFAULT -1,
  video_limit INTEGER DEFAULT -1,
  features TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

-- Seed default plans
INSERT OR IGNORE INTO plans (id, name, price, credits_per_month, max_accounts, daily_limit, video_limit, features) VALUES
  ('free', 'Free', 0, 10, 1, 5, 2, '{"text2image":true,"image2image":false,"text2video":false,"image2video":false,"extend_video":false}'),
  ('basic', 'Basic', 9.99, 100, 3, 30, 10, '{"text2image":true,"image2image":true,"text2video":true,"image2video":false,"extend_video":false}'),
  ('pro', 'Pro', 29.99, 500, 10, 100, 50, '{"text2image":true,"image2image":true,"text2video":true,"image2video":true,"extend_video":true}'),
  ('unlimited', 'Unlimited', 99.99, -1, 50, -1, -1, '{"text2image":true,"image2image":true,"text2video":true,"image2video":true,"extend_video":true}');
