@echo off
cd /d "%~dp0"
echo Starting CF Clearance Server...
echo.

:: Use python directly from venv
if exist venv\Scripts\python.exe (
    venv\Scripts\python.exe cf_clearance_server.py --host 0.0.0.0 --port 5001
) else (
    echo [ERROR] venv not found. Run setup.bat first.
)
pause
