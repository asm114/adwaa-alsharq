@echo off
setlocal
cd /d "%~dp0"
if not exist ".oauth-check-venv\Scripts\python.exe" (
  echo LOCAL_RUN_CHECK_FIRST
  pause >nul
  exit /b 1
)
".oauth-check-venv\Scripts\python.exe" -B sync_github_oauth.py
pause >nul
