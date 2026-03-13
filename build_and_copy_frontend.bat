@echo off
setlocal

set SCRIPT_DIR=%~dp0
if "%SCRIPT_DIR:~-1%"=="\" set SCRIPT_DIR=%SCRIPT_DIR:~0,-1%

set FRONTEND_DIR=%SCRIPT_DIR%\apps\frontend
set BACKEND_DIR=%SCRIPT_DIR%\apps\backend

if not exist "%FRONTEND_DIR%\package.json" (
  echo Frontend folder not found: "%FRONTEND_DIR%"
  exit /b 1
)

if not exist "%BACKEND_DIR%\manage.py" (
  echo Backend folder not found: "%BACKEND_DIR%"
  exit /b 1
)

cd /d "%FRONTEND_DIR%"
call npm install
if errorlevel 1 exit /b 1

set VITE_API_BASE_URL=http://127.0.0.1:8000
call npm run build
if errorlevel 1 exit /b 1

if exist "%BACKEND_DIR%\frontend_dist" rmdir /s /q "%BACKEND_DIR%\frontend_dist"
robocopy "%FRONTEND_DIR%\dist" "%BACKEND_DIR%\frontend_dist" /E
if errorlevel 8 exit /b 1

echo Frontend build copied to "%BACKEND_DIR%\frontend_dist"

endlocal
