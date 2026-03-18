@echo off
title Grok2API Watchdog (auto-restart)
cd /d C:\grok2api
call .venv\Scripts\activate

:loop
echo [%date% %time%] Starting Grok2API...
python -m uvicorn main:app --host 0.0.0.0 --port 8000
echo.
echo [%date% %time%] Grok2API crashed (exit code: %errorlevel%). Restarting in 5s...
timeout /t 5 /nobreak >nul
goto loop
