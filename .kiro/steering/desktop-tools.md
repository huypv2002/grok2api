---
inclusion: fileMatch
fileMatchPattern: "grok-studio/tools/**,grok-studio/cf_service*"
---

# Desktop Tools — Hướng dẫn

## Cấu trúc
```
grok-studio/tools/
├── grok_studio_app.py      — PySide6 desktop app (login + grab cookies)
├── grok_cookie_grabber.py  — CLI cookie grabber (Chrome CDP)
├── regen_missing.py        — Regenerate missing/failed items
├── accounts.txt            — Input: email|password per line
└── requirements.txt        — PySide6, websockets, curl_cffi, zendriver
```

## grok_studio_app.py (Desktop App)
- PySide6 GUI app, dark theme
- Login vào Grok Studio → nhập accounts → grab cookies tự động
- Dùng Chrome CDP (port 9250+) để điều khiển browser
- Batch processing: 3 accounts song song
- Auto-upload cookies lên Grok Studio server
- Build exe: Nuitka (GitHub Actions)
- Version: `APP_VERSION = "1.2.0"`
- API base: `https://grok.liveyt.pro`

## grok_cookie_grabber.py (CLI)
- CLI tool: `python grok_cookie_grabber.py accounts.txt [--upload URL]`
- Mở Chrome thật qua CDP, tự fill email/password
- Lấy cookies (sso, cf_clearance, __cf_bm, _twpid)
- Output: `cookies_output.json`
- Batch: 3 tabs song song, timeout 300s per account

## cf_service_win.py (CF Refresh)
- Background service cho Windows VPS
- Mỗi 25 phút: zendriver mở Chrome → vào grok.com → lấy cf_clearance
- Update Grok2API config qua REST API
- Sync cookies lên CF Worker qua INTERNAL_KEY header
- Config: `WORKER_URL`, `INTERNAL_KEY`, `GROK2API`, `GROK2API_KEY`

## regen_missing.py
- Tìm và regenerate các items bị failed/missing trong history
- Kết nối trực tiếp tới Grok Studio API

## Build & Release
- CI: `.github/workflows/build-grabber.yml`
- Nuitka standalone build cho Windows
- Include: PySide6, websockets, curl_cffi, certifi
- Output: `GrokStudioGrabber.exe` + data folders
- Release: GitHub Releases với tag `grabber-v*`

## Quy ước
- Paths relative to exe/script location (not CWD)
- Chrome profiles stored in `data/profiles/`
- Credentials cached in `data/credentials.json`
- CDP ports: 9250+ (avoid conflict with default 9222)
