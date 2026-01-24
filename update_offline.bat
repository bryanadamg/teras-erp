@echo off
set UPDATE_FILE=teras_update.tar

echo ==========================================
echo Teras ERP - Offline Update Utility
echo ==========================================
echo.

:: Check if the update package exists
if not exist %UPDATE_FILE% (
    echo [ERROR] Update file '%UPDATE_FILE%' not found in this folder.
    echo Please ensure the update package is placed in this directory
    echo and renamed exactly to '%UPDATE_FILE%'.
    echo.
    pause
    exit /b
)

echo [1/2] Loading new Docker images from %UPDATE_FILE%...
echo This may take a few minutes depending on the update size...
docker load -i %UPDATE_FILE%

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Failed to load Docker images. 
    echo Ensure Docker Desktop is running.
    echo.
    pause
    exit /b
)

echo.
echo [2/2] Applying updates and restarting services...
:: Using docker-compose to recreate containers with the newly loaded images
docker-compose up -d

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Failed to restart services. 
    echo Check your docker-compose.yml configuration.
    echo.
    pause
    exit /b
)

echo.
echo ==========================================
echo SUCCESS: Update successfully applied!
echo ==========================================
echo Teras ERP is now running the latest version.
echo.
pause
