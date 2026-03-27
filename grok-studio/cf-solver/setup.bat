@echo off
cd /d "%~dp0"
echo ============================================
echo   CF Clearance Server - Setup
echo ============================================
echo.

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Install Python 3.10+ first.
    pause
    exit /b 1
)

:: Create venv
echo [1/5] Creating virtual environment...
if not exist venv (
    python -m venv venv
)

:: Install VC++ Runtime (needed for greenlet DLL)
echo [2/5] Installing Visual C++ Runtime...
venv\Scripts\pip.exe install --upgrade pip setuptools wheel

:: Install patchright with greenlet fix
echo [3/5] Installing patchright...
venv\Scripts\pip.exe install --force-reinstall greenlet
venv\Scripts\pip.exe install patchright

:: Install Chromium
echo [4/5] Installing Chromium browser...
venv\Scripts\python.exe -m patchright install chromium

:: Verify
echo [5/5] Verifying...
venv\Scripts\python.exe -c "from patchright.async_api import async_playwright; print('OK: patchright works')"
if errorlevel 1 (
    echo.
    echo [!] greenlet DLL error. Installing VC++ Runtime...
    echo [!] Download and install from:
    echo     https://aka.ms/vs/17/release/vc_redist.x64.exe
    echo.
    echo After installing VC++ Runtime, run setup.bat again.
)

echo.
echo ============================================
echo   Setup complete! Run: start.bat
echo ============================================
pause
