-- Add role column
ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';

-- Create admin account: kh431248@gmail.com / admin (unlimited, admin role)
-- Password will be set via API, this is a fallback seed
UPDATE users SET plan = 'unlimited', credits = -1, role = 'admin' WHERE email = 'kh431248@gmail.com';
