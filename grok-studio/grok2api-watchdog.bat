@echo off
title Grok2API Watchdog (auto-restart)
cd /d C:\grok2api
call .venv\Scripts\activate

:loop
echo [%date% %time%] Starting Grok2API (Granian)...
granian --interface asgi --host 0.0.0.0 --port 8000 --workers 1 --log-level info main:app
echo.
echo [%date% %time%] Grok2API exited (code: %errorlevel%). Restarting in 5s...
timeout /t 5 /nobreak >nul
goto loop
