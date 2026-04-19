@echo off
setlocal EnableExtensions
title Grok2API Watchdog (auto-restart)
set SCRIPT_DIR=%~dp0
for %%I in ("%SCRIPT_DIR%..") do set ROOT_DIR=%%~fI

cd /d "%ROOT_DIR%"

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

echo [INFO] Using Python: %PYTHON_CMD%
echo [INFO] Working dir: %ROOT_DIR%

:loop
echo [%date% %time%] Starting Grok2API (Granian)...
%PYTHON_CMD% -m granian --interface asgi --host 0.0.0.0 --port 8000 --workers 1 --log-level info main:app
echo.
echo [%date% %time%] Grok2API exited (code: %errorlevel%). Restarting in 5s...
timeout /t 5 /nobreak >nul
goto loop
