@echo off
setlocal
cd /d "%~dp0"
py -3 --version >nul 2>&1
if errorlevel 1 (
  echo LOCAL_PYTHON_SETUP_REQUIRED
  pause >nul
  exit /b 1
)
py -3 -B sync_core_key.py 2>nul
pause >nul
