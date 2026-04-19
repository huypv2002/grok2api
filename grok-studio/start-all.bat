@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Grok Studio - All Services
set SCRIPT_DIR=%~dp0
for %%I in ("%SCRIPT_DIR%..") do set ROOT_DIR=%%~fI

set "PYTHON_CMD="
if exist "%ROOT_DIR%\.venv\Scripts\python.exe" (
    set "PYTHON_CMD=\"%ROOT_DIR%\.venv\Scripts\python.exe\""
) else (
    where py >nul 2>&1
    if not errorlevel 1 (
        set "PYTHON_CMD=py -3.13"
    ) else (
        set "PYTHON_CMD=python"
    )
)

echo ============================================
echo   GROK STUDIO - Starting All Services
echo ============================================
echo.
echo   Root dir: %ROOT_DIR%
echo   Python:   %PYTHON_CMD%
echo.

:: 1. Start Grok2API (Granian + auto-restart watchdog)
echo [1/5] Starting Grok2API (Granian, auto-restart)...
start "Grok2API" cmd /k call "%SCRIPT_DIR%grok2api-watchdog.bat"
echo   Waiting for Grok2API health check...
set API_READY=
for /L %%N in (1,1,30) do (
    curl -fsS http://127.0.0.1:8000/health >nul 2>&1
    if not errorlevel 1 (
        set API_READY=1
        goto :api_ready
    )
    timeout /t 2 /nobreak >nul
)
:api_ready
if not defined API_READY (
    echo   [WARN] Grok2API did not answer /health yet. Continuing anyway...
) else (
    echo   OK
)

:: 2. Configure Grok2API
echo [2/5] Configuring Grok2API...
curl -s -X POST http://localhost:8000/v1/admin/config -H "Authorization: Bearer grok2api" -H "Content-Type: application/json" -d "{\"app\":{\"video_format\":\"url\"},\"proxy\":{\"browser\":\"chrome136\"}}" >nul 2>&1
echo   OK

:: 3. Ensure cloudflared config exists
echo [3/5] Checking cloudflared config...
set CF_DIR=%USERPROFILE%\.cloudflared
set CF_CFG=%CF_DIR%\config.yml
if not exist "%CF_DIR%" mkdir "%CF_DIR%"
echo   Writing %CF_CFG%...
> "%CF_CFG%" echo tunnel: grok-api
>> "%CF_CFG%" echo credentials-file: %CF_DIR%\418c6e70-000e-4cf8-8b84-6d858ba3823d.json
>> "%CF_CFG%" echo.
>> "%CF_CFG%" echo ingress:
>> "%CF_CFG%" echo   - hostname: api.liveyt.pro
>> "%CF_CFG%" echo     service: http://127.0.0.1:8000
>> "%CF_CFG%" echo   - service: http_status:404
echo   OK

:: 4. Start Cloudflared Named Tunnel
echo [4/5] Starting Cloudflared Tunnel (api.liveyt.pro)...
start "Cloudflared" cmd /k "cloudflared tunnel --config \"%CF_CFG%\" run grok-api"
echo   Waiting for tunnel to register...
set TUNNEL_READY=
for /L %%N in (1,1,20) do (
    cloudflared tunnel info grok-api | findstr /C:"windows_amd64" >nul 2>&1
    if not errorlevel 1 (
        set TUNNEL_READY=1
        goto :tunnel_ready
    )
    timeout /t 2 /nobreak >nul
)
:tunnel_ready
if not defined TUNNEL_READY (
    echo   [WARN] Tunnel has not shown an active connector yet.
) else (
    echo   OK
)

:: 5. Start CF auto-refresh service (zendriver)
echo [5/5] Starting CF auto-refresh (zendriver)...
start "CF-Refresh" cmd /k "cd /d \"%ROOT_DIR%\" && %PYTHON_CMD% \"%SCRIPT_DIR%cf_service_win.py\""
echo   OK

echo.
echo ============================================
echo   ALL SERVICES STARTED!
echo ============================================
echo.
echo   Grok2API:    http://localhost:8000 (Granian)
echo   Tunnel:      https://api.liveyt.pro
echo   CF Refresh:  zendriver (every 25 min)
echo.
echo   4 windows opened - keep them all running.
echo   This window can be closed safely.
echo.
pause >nul
