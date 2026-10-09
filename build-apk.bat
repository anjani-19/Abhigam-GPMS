@echo off
title Build Android APK - Abhigam GPMS
echo ========================================================
echo   Building Abhigam GPMS Native Android APK
echo ========================================================
echo.

cd /d "%~dp0frontend"

echo [1/3] Building optimized web bundle...
call npm.cmd run build
if %ERRORLEVEL% NEQ 0 (
  echo Error building frontend bundle.
  pause
  exit /b %ERRORLEVEL%
)

echo [2/3] Syncing Capacitor native Android assets...
call npx.cmd cap sync android
if %ERRORLEVEL% NEQ 0 (
  echo Error syncing Capacitor assets.
  pause
  exit /b %ERRORLEVEL%
)

echo [3/3] Compiling Android APK with Gradle...
cd android
call gradlew.bat assembleDebug

echo.
echo ========================================================
if exist "app\build\outputs\apk\debug\app-debug.apk" (
  echo SUCCESS! Your Android APK has been built:
  echo %~dp0frontend\android\app\build\outputs\apk\debug\app-debug.apk
) else (
  echo You can also open the project in Android Studio by running:
  echo   cd frontend ^&^& npx cap open android
)
echo ========================================================
pause
