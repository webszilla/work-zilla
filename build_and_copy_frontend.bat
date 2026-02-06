@echo off
setlocal

set FRONTEND_DIR=E:\my-project\work-zilla\apps\frontend
set BACKEND_DIR=E:\my-project\work-zilla\apps\backend

cd /d %FRONTEND_DIR%
call npm install
call npm run build

if exist "%BACKEND_DIR%\frontend_dist" rmdir /s /q "%BACKEND_DIR%\frontend_dist"
robocopy "%FRONTEND_DIR%\dist" "%BACKEND_DIR%\frontend_dist" /E

endlocal
