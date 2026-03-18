@echo off
title Grok Studio - All Services
echo ============================================
echo   GROK STUDIO - Starting All Services
echo ============================================
echo.

:: 1. Start Grok2API (Granian + auto-restart watchdog)
echo [1/4] Starting Grok2API (Granian, auto-restart)...
start "Grok2API" cmd /k "C:\grok-studio\grok2api-watchdog.bat"
echo   Waiting for Grok2API to start...
timeout /t 8 /nobreak >nul

:: 2. Configure Grok2API (video_format=url)
echo [2/4] Configuring Grok2API...
curl -s -X POST http://localhost:8000/v1/admin/config -H "Authorization: Bearer grok2api" -H "Content-Type: application/json" -d "{\"app\":{\"video_format\":\"url\"}}" >nul 2>&1
echo   OK

:: 3. Start Cloudflared Named Tunnel
echo [3/4] Starting Cloudflared Tunnel (api.liveyt.pro)...
start "Cloudflared" cmd /k "cloudflared tunnel run grok-api"

:: 4. Start CF auto-refresh service (zendriver)
echo [4/4] Starting CF auto-refresh (zendriver)...
start "CF-Refresh" cmd /k "cd /d C:\grok2api && .venv\Scripts\activate && python C:\grok-studio\cf_service_win.py"

echo.
echo ============================================
echo   ALL SERVICES STARTED!
echo ============================================
echo.
echo   Grok2API:    http://localhost:8000 (Granian)
echo   Tunnel:      https://api.liveyt.pro
echo   CF Refresh:  zendriver (every 25 min)
echo.
echo   3 windows opened - keep them all running.
echo   This window can be closed safely.
echo.
pause >nul
