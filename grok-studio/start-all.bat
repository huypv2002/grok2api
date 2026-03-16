@echo off
title Grok Studio - All Services
echo ============================================
echo   GROK STUDIO - Starting All Services
echo ============================================
echo.

:: 1. Start Grok2API
echo [1/3] Starting Grok2API...
start "Grok2API" cmd /k "cd /d C:\grok2api && .venv\Scripts\activate && python -m uvicorn main:app --host 0.0.0.0 --port 8000"
echo   Waiting for startup...
timeout /t 6 /nobreak >nul

:: 2. Configure video_format
echo [2/3] Configuring Grok2API...
curl -s -X POST http://localhost:8000/v1/admin/config -H "Authorization: Bearer grok2api" -H "Content-Type: application/json" -d "{\"app\":{\"video_format\":\"url\"}}" >nul 2>&1
echo   OK

:: 3. Start CF refresh service
echo [3/3] Starting CF auto-refresh (zendriver)...
start "CF-Refresh" cmd /k "cd /d C:\grok2api && .venv\Scripts\activate && python C:\grok-studio\cf_service_win.py"

:: 4. Start Cloudflared Named Tunnel
echo.
echo Starting Cloudflared Tunnel (api.liveyt.pro)...
start "Cloudflared" cmd /k "cloudflared tunnel run --url http://localhost:8000 grok-api"

echo.
echo ============================================
echo   ALL SERVICES STARTED!
echo ============================================
echo.
echo   Grok2API:    http://localhost:8000
echo   Tunnel:      https://api.liveyt.pro
echo   CF Refresh:  zendriver (every 25 min)
echo.
echo   3 windows opened - keep them all running.
pause >nul
