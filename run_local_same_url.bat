@echo off
setlocal

set SCRIPT_DIR=%~dp0
if "%SCRIPT_DIR:~-1%"=="\" set SCRIPT_DIR=%SCRIPT_DIR:~0,-1%

set BACKEND_DIR=%SCRIPT_DIR%\apps\backend
set VENV_PYTHON=%SCRIPT_DIR%\env\Scripts\python.exe
set PORT=8000

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not available in PATH.
  exit /b 1
)

if not exist "%BACKEND_DIR%\manage.py" (
  echo Backend folder not found: "%BACKEND_DIR%"
  exit /b 1
)

call "%SCRIPT_DIR%\build_and_copy_frontend.bat"
if errorlevel 1 exit /b 1

if exist "%VENV_PYTHON%" (
  cd /d "%BACKEND_DIR%"
  echo Starting WorkZilla local app at http://127.0.0.1:%PORT%
  call "%VENV_PYTHON%" manage.py runserver 127.0.0.1:%PORT%
  exit /b %errorlevel%
)

where py >nul 2>nul
if not errorlevel 1 (
  cd /d "%BACKEND_DIR%"
  echo Repo virtualenv not found. Using launcher `py -3`.
  py -3 manage.py runserver 127.0.0.1:%PORT%
  exit /b %errorlevel%
)

where python >nul 2>nul
if not errorlevel 1 (
  cd /d "%BACKEND_DIR%"
  echo Repo virtualenv not found. Using PATH `python`.
  python manage.py runserver 127.0.0.1:%PORT%
  exit /b %errorlevel%
)

echo Python is not available. Create a Windows virtualenv or install Python in PATH.
exit /b 1
