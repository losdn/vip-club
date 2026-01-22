@echo off
set LOG_FILE=app_log.txt
echo ======================================================== >> %LOG_FILE%
echo [%DATE% %TIME%] Starting update and launch process... >> %LOG_FILE%

cd /d "%~dp0"

echo [%DATE% %TIME%] Pulling latest changes... >> %LOG_FILE%
git pull origin main >> %LOG_FILE% 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [%DATE% %TIME%] Error: Git pull failed. >> %LOG_FILE%
    echo Error: Git pull failed. See %LOG_FILE% for details.
    exit /b %ERRORLEVEL%
)

echo [%DATE% %TIME%] Installing dependencies... >> %LOG_FILE%
call npm install >> %LOG_FILE% 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [%DATE% %TIME%] Error: npm install failed. >> %LOG_FILE%
    echo Error: npm install failed. See %LOG_FILE% for details.
    exit /b %ERRORLEVEL%
)

echo [%DATE% %TIME%] Starting application... >> %LOG_FILE%
echo Starting application...
echo Cleaning up port 3024... >> %LOG_FILE%
call npx --yes kill-port 3024 >> %LOG_FILE% 2>&1
call npm run electron >> %LOG_FILE% 2>&1

echo [%DATE% %TIME%] Application exited. >> %LOG_FILE%
