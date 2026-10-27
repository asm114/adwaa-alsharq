@echo off
setlocal
cd /d "%~dp0"
if not exist ".oauth-check-venv\Scripts\python.exe" (
  py -3 -m venv ".oauth-check-venv" >nul 2>&1
  if errorlevel 1 (
    echo LOCAL_PYTHON_SETUP_REQUIRED
    pause >nul
    exit /b 1
  )
)
".oauth-check-venv\Scripts\python.exe" -m pip install --disable-pip-version-check --quiet google-auth==2.62.0 google-auth-httplib2==0.4.4 >nul 2>&1
if errorlevel 1 (
  echo LOCAL_DEPENDENCY_SETUP_FAILED
  pause >nul
  exit /b 1
)
".oauth-check-venv\Scripts\python.exe" -B run_local.py
pause >nul
