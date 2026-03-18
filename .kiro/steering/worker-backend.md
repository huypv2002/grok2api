---
inclusion: fileMatch
fileMatchPattern: "grok-studio/worker/**"
---

# CF Worker Backend — Hướng dẫn

## Cấu trúc
```
grok-studio/worker/
├── src/
│   ├── index.js          — Entry point, routing dispatcher
│   ├── routes/
│   │   ├── auth.js       — Register, login, me, profile (public)
│   │   ├── accounts.js   — SSO token CRUD per user (protected)
│   │   ├── generate.js   — Proxy gen requests tới Grok2API (protected)
│   │   ├── history.js    — Generation history CRUD (protected)
│   │   ├── plans.js      — List plans (public)
│   │   ├── payment.js    — Payment orders + Web2M webhook (mixed)
│   │   ├── admin.js      — Admin panel APIs (admin/superadmin)
│   │   └── affiliate.js  — Affiliate/CTV system (protected)
│   └── utils/
│       ├── jwt.js        — createJWT, verifyJWT (HMAC-SHA256)
│       ├── hash.js       — hashPassword, verifyPassword (PBKDF2)
│       └── response.js   — corsHeaders(), jsonResponse()
├── schema.sql            — D1 database schema + seed data
├── migrations/           — Incremental ALTER TABLE scripts
├── wrangler.toml         — Config, bindings, secrets
└── package.json
```

## Bindings (wrangler.toml)
- `DB` — D1 SQLite database
- `MEDIA` — R2 bucket cho media files
- `ASSETS` — Static frontend files
- `JWT_SECRET`, `GROK_API_BASE`, `INTERNAL_KEY`, `WEB2M_TOKEN`
- `ACB_ACCOUNT`, `ACB_PASSWORD`, `ACB_API_TOKEN` — Web2M banking

## Routing Pattern
- Public routes: `/api/auth/*`, `/api/plans`, `/api/webhook/web2m`, `/api/media/*`
- Internal: `/api/internal/sso-tokens` (X-Internal-Key header)
- Protected (JWT): `/api/accounts`, `/api/generate`, `/api/history`, `/api/payment/*`, `/api/affiliate/*`
- Admin: `/api/admin/*` — requireAdmin() hoặc requireSuperAdmin()

## Quy ước code
- Mỗi route file export 1 async function handler: `handleXxx(request, env, user, path)`
- Auth routes không có `user` param (chưa login)
- Response luôn dùng `jsonResponse(data, status)`
- Error messages bằng tiếng Việt
- DB queries dùng `env.DB.prepare(sql).bind(...params).first()` hoặc `.all()` hoặc `.run()`
- Timestamps: `datetime('now')` trong SQL, ISO 8601 strings

## Auth Flow
- Register/Login → tạo JWT (24h) với `{ sub: userId, email, role, sid: sessionId }`
- Multi-device: `active_session` (web) + `tool_session` (desktop app)
- verifyJWT kiểm tra session → nếu bị kick trả `user._kicked = true`

## Deploy
```bash
cd grok-studio/worker
npx wrangler deploy
```

## Migrations
```bash
npx wrangler d1 execute grok-studio-db --file=./migrations/0001_add_limited_at.sql
```
