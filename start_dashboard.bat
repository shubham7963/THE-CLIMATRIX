@echo off
setlocal
title Climatrix AI - CFDSRAS Launcher
cd /d "%~dp0backend"

echo ============================================================
echo   Climatrix AI - CFDSRAS Dashboard Launcher
echo ============================================================
echo.

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python was not found on PATH.
    echo Install Python from https://python.org/downloads and make sure
    echo "Add python.exe to PATH" is checked during setup, then re-run this file.
    echo.
    pause
    exit /b 1
)

echo [1/3] Checking dependencies (only installs anything missing)...
python -m pip install -r requirements.txt --quiet --disable-pip-version-check
if %errorlevel% neq 0 (
    echo [ERROR] Dependency install failed. Check your internet connection and try again.
    pause
    exit /b 1
)

echo [2/3] Starting the server in a new window...
start "CFDSRAS Server - keep this window open" cmd /k python app.py

echo [3/3] Waiting for the server to start, then opening your browser...
timeout /t 5 /nobreak >nul
start http://localhost:5000

echo.
echo ============================================================
echo  Dashboard should now be open in your browser at:
echo  http://localhost:5000
echo.
echo  IMPORTANT: keep the "CFDSRAS Server" window open while you
echo  present. Closing that window stops the dashboard.
echo  This window is safe to close now.
echo ============================================================
echo.
pause
