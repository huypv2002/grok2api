---
inclusion: fileMatch
fileMatchPattern: "app/**,main.py,pyproject.toml,config*"
---

# Python Backend (Grok2API) — Hướng dẫn

## Tổng quan
FastAPI server chạy trên VPS, proxy requests tới grok.com. Xử lý chat, image gen, video gen, voice.

## Cấu trúc
```
app/
├── core/
│   ├── config.py           — Config manager (TOML, runtime update)
│   ├── auth.py             — API key auth (Bearer token)
│   ├── logger.py           — Loguru setup
│   ├── exceptions.py       — Custom exceptions
│   ├── response_middleware.py
│   └── storage.py
├── api/
│   ├── v1/
│   │   ├── chat.py         — /v1/chat/completions (OpenAI-compatible)
│   │   ├── image.py        — /v1/images/generations
│   │   ├── video.py        — /v1/video/generations
│   │   ├── models.py       — /v1/models
│   │   ├── response.py     — /v1/responses
│   │   ├── files.py        — Serve generated media files
│   │   ├── admin/          — Admin config, token, cache management
│   │   └── function/       — Imagine, video, voice web UI endpoints
│   └── pages/              — HTML page serving (admin, function UIs)
├── services/
│   ├── grok/
│   │   ├── services/       — Chat, image, video, voice, model services
│   │   ├── utils/          — Cache, download, retry, stream, upload, tool_call
│   │   ├── batch_services/ — Assets, NSFW, usage batch processing
│   │   └── defaults.py     — Default config values
│   └── cf_refresh/         — CF clearance auto-refresh (FlareSolverr/zendriver)
main.py                     — FastAPI app entry, lifespan, middleware
pyproject.toml              — Dependencies (Python 3.13+)
config.defaults.toml        — Default config baseline
```

## Tech Stack
- Python 3.13+, FastAPI, Granian ASGI server
- curl_cffi (TLS fingerprint), aiohttp, websockets
- Redis (optional cache), SQLAlchemy (optional)
- Loguru logging, orjson serialization

## API Pattern
- OpenAI-compatible: `/v1/chat/completions`, `/v1/models`
- Auth: Bearer token (`app.api_key` in config)
- Admin: Bearer token (`app.app_key` in config), default "grok2api"
- Streaming: SSE format (Server-Sent Events)

## Config
- `config.defaults.toml` — baseline defaults
- `config.toml` — runtime overrides (auto-created)
- Runtime update: `POST /v1/admin/config` with JSON body
- Sections: app, proxy, retry, chat, image, video, voice, token

## Key Config Values
- `app.api_key` — API authentication key
- `app.app_key` — Admin panel password (default: "grok2api")
- `proxy.cf_clearance` — CF cookie for grok.com access
- `proxy.user_agent` — Must match CF clearance UA
- `token.auto_refresh` — Auto refresh SSO tokens

## Quy ước
- snake_case everywhere
- Async/await cho tất cả I/O
- Services pattern: mỗi service class xử lý 1 loại request
- Error handling: raise AppException/ValidationException
- Comments bằng tiếng Trung (codebase gốc), code mới có thể dùng tiếng Anh

## Deploy
- Docker: `docker build -t grok2api . && docker run -p 8000:8000 grok2api`
- VPS: systemd service hoặc chạy trực tiếp `python main.py`
- ASGI: Granian server (nhanh hơn uvicorn)
