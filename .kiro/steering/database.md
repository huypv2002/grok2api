---
inclusion: fileMatch
fileMatchPattern: "**/*.sql,**/schema*,**/migration*"
---

# Database (Cloudflare D1) — Hướng dẫn

## Engine
Cloudflare D1 = SQLite, binding name `DB` trong wrangler.toml.

## Schema chính (schema.sql)

### users
| Column | Type | Note |
|--------|------|------|
| id | INTEGER PK | Auto increment |
| email | TEXT UNIQUE | |
| password_hash | TEXT | PBKDF2 |
| name | TEXT | |
| role | TEXT | 'user', 'admin', 'superadmin' |
| plan | TEXT | FK → plans.id hoặc service_plans.id |
| credits | INTEGER | -1 = unlimited |
| daily_limit | INTEGER | -1 = dùng plan default |
| video_limit | INTEGER | -1 = dùng plan default |
| plan_expires | TEXT | YYYY-MM-DD |
| active_session | TEXT | UUID, web session |
| tool_session | TEXT | UUID, desktop app session |
| is_affiliate | INTEGER | 0/1 |
| ref_code | TEXT | Mã giới thiệu |
| referred_by | INTEGER | FK → users.id |
| commission_rate | INTEGER | % hoa hồng, default 20 |

### grok_accounts
| Column | Type | Note |
|--------|------|------|
| id | INTEGER PK | |
| user_id | INTEGER FK | → users.id CASCADE |
| label | TEXT | Tên hiển thị |
| sso_token | TEXT | JSON array cookies hoặc raw SSO |
| status | TEXT | 'active', 'limited', 'invalid' |
| limited_at | TEXT | Auto-unlock sau 2h |

### history
| Column | Type | Note |
|--------|------|------|
| id | INTEGER PK | |
| user_id | INTEGER FK | |
| type | TEXT | text2video, image2video, text2image, image2image, extend_video |
| prompt | TEXT | |
| output_url | TEXT | R2 URL hoặc external |
| status | TEXT | pending, processing, completed, failed |
| session_id | TEXT | Video project session |

### payment_orders
| Column | Type | Note |
|--------|------|------|
| id | INTEGER PK | |
| user_id | INTEGER FK | |
| plan_id | TEXT | FK → service_plans.id |
| amount | INTEGER | VND |
| memo_code | TEXT | Nội dung chuyển khoản |
| status | TEXT | pending, completed |
| transaction_ref | TEXT | Web2M transaction ID |

### service_plans
| Column | Type | Note |
|--------|------|------|
| id | TEXT PK | month1, month5, 3month1, ... |
| name | TEXT | Tên hiển thị |
| tier | TEXT | Starter, Pro, Business |
| price | INTEGER | VND |
| days | INTEGER | Số ngày |
| accs | INTEGER | Số account cho phép |

## Migrations
- File: `grok-studio/worker/migrations/NNNN_description.sql`
- Chạy: `npx wrangler d1 execute grok-studio-db --file=./migrations/NNNN.sql`
- Production: bỏ `--local` flag
- SQLite không hỗ trợ `ALTER TABLE ... IF NOT EXISTS` cho columns

## Quy ước query
```js
// Single row
const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
// Multiple rows
const rows = await env.DB.prepare('SELECT * FROM users LIMIT ?').bind(100).all();
// rows.results = array
// Insert/Update
await env.DB.prepare('INSERT INTO ...').bind(...).run();
// result.meta.last_row_id cho INSERT
```
