@echo off
title Grok2API Watchdog (auto-restart)
set SCRIPT_DIR=%~dp0
for %%I in ("%SCRIPT_DIR%..") do set ROOT_DIR=%%~fI

cd /d "%ROOT_DIR%"
if exist "%ROOT_DIR%\.venv\Scripts\activate.bat" (
    call "%ROOT_DIR%\.venv\Scripts\activate.bat"
) else (
    echo [WARN] .venv\Scripts\activate.bat not found, using system environment...
)

:loop
echo [%date% %time%] Starting Grok2API (Granian)...
granian --interface asgi --host 0.0.0.0 --port 8000 --workers 1 --log-level info main:app
echo.
echo [%date% %time%] Grok2API exited (code: %errorlevel%). Restarting in 5s...
timeout /t 5 /nobreak >nul
goto loop
