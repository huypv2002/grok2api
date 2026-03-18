---
inclusion: always
---

# Grok Studio — Tổng quan dự án

## Kiến trúc

```
Browser → CF Worker (grok.liveyt.pro) → VPS (api.liveyt.pro)
              │                              │
         D1 (SQLite)                    Grok2API (FastAPI :8000)
         R2 (Media)                     CF Refresh (zendriver)
              │                         Cloudflared Tunnel
         Web2M (Payment)                    │
                                        grok.com
```

## Tech Stack
- Frontend: Vanilla JS + CSS glass morphism + Three.js galaxy BG, served bởi CF Workers Sites
- Worker Backend: Cloudflare Workers, D1 (SQLite), R2 (object storage), JWT auth
- Python Backend: FastAPI + Granian ASGI, Python 3.13, curl_cffi, Redis, SQLAlchemy
- Desktop Tool: PySide6 + Nuitka (build exe), zendriver (Chrome automation)
- CI/CD: GitHub Actions (build grabber exe cho Windows)

## Cấu trúc thư mục chính
- `grok-studio/worker/` — CF Worker backend (auth, admin, payment, generate, accounts, history, plans, affiliate)
- `grok-studio/frontend/` — Static frontend (index.html, js/bundle.js, js/app.js, css/)
- `grok-studio/tools/` — Desktop tools (grok_studio_app.py, grok_cookie_grabber.py)
- `app/` — Python Grok2API backend (FastAPI, services, core)
- `main.py` — Python app entry point

## Roles
- `user` — người dùng thường
- `admin` — quản trị viên
- `superadmin` — quản trị cao cấp (xem ngân hàng, webhook logs)

## Quy ước
- Python: snake_case, FastAPI router pattern
- JS Worker: camelCase, functional route handlers
- Frontend: inline JS trong bundle.js, SPA routing bằng `go('page-name')`
- DB timestamps: ISO 8601 strings
- Credits: -1 = unlimited, 0 = blocked, >0 = quota
- Error messages: tiếng Việt
- API responses: JSON `{ data, error, message }`
