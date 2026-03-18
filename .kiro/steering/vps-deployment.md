---
inclusion: fileMatch
fileMatchPattern: "**/setup*,**/start*,**/Dockerfile,**/*.bat,**/*.sh,**/cf_service*,**/wrangler*"
---

# VPS & Deployment — Hướng dẫn

## Kiến trúc deployment
```
Internet
  │
  ├── grok.liveyt.pro → CF Worker (frontend + API proxy)
  │                        ├── D1 Database
  │                        ├── R2 Media Storage
  │                        └── Proxy → api.liveyt.pro
  │
  └── api.liveyt.pro → Cloudflared Tunnel → VPS
                                              ├── Grok2API (:8000)
                                              ├── CF Refresh Service
                                              └── FlareSolverr (Docker, Linux only)
```

## VPS Linux (Ubuntu 22.04+)
Script: `grok-studio/setup-vps.sh`
1. Install Docker, Node 20, Python 3.11+
2. Start FlareSolverr container (port 8191) — giải CF challenge
3. Create Python venv, install deps
4. Setup systemd service `grok2api` (port 8000)
5. Install Cloudflared, setup tunnel
6. Configure UFW firewall

Services:
- `grok2api.service` — Python FastAPI server
- FlareSolverr Docker container — CF challenge solver
- Cloudflared tunnel — HTTPS proxy

## VPS Windows
Docs: `grok-studio/setup-windows.md`
Script: `grok-studio/start-all.bat`

Cần cài: Python 3.11+, Git, Node 20, Chrome, Cloudflared

`start-all.bat` mở 3 CMD windows:
1. Grok2API (watchdog auto-restart)
2. CF Refresh (`cf_service_win.py`) — zendriver + Chrome headless
3. Cloudflared named tunnel (`grok-api`)

RAM: ~350MB peak, ~150MB idle. Phù hợp VPS 4GB.

## CF Refresh Service
- Linux: FlareSolverr (Docker) → gọi qua HTTP API
- Windows: `cf_service_win.py` — zendriver (headless Chrome)
  - Mỗi 25 phút: mở Chrome → vào grok.com → lấy cf_clearance cookie
  - Update config Grok2API qua API + sync lên CF Worker qua INTERNAL_KEY
  - UA phải match: `Chrome/136.0.0.0`

## CF Worker Deploy
```bash
cd grok-studio/worker
npx wrangler deploy
```

## Cloudflared Tunnel
- Named tunnel: `cloudflared tunnel run --url http://localhost:8000 grok-api`
- Quick tunnel: `cloudflared tunnel --url http://localhost:8000` (tạo URL random)
- DNS: `api.liveyt.pro` → CNAME tunnel

## Docker (Python backend)
```bash
docker build -t grok2api .
docker run -d -p 8000:8000 --name grok2api grok2api
```
Multi-stage build, Alpine base, ~150MB image.

## CI/CD
- `.github/workflows/build-grabber.yml` — Build desktop tool (Nuitka → exe)
- Trigger: push to `grok-studio/tools/**` hoặc tag `grabber-v*`
- Output: Windows exe artifact + GitHub Release
