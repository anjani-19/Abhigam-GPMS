@echo off
title Anumathi - GATE PASS Launcher
echo ========================================================
echo   Starting Anumathi - GATE PASS System (Native APK)
echo ========================================================
echo.

set "APK_FILE=%~dp0app-debug.apk"

rem Detect Local Wi-Fi / LAN IP for phone APK connections
for /f "tokens=*" %%a in ('powershell -NoProfile -Command "(Test-Connection -ComputerName $env:COMPUTERNAME -Count 1).IPV4Address.IPAddressToString"') do set LOCAL_IP=%%a

echo [1/2] Launching FastAPI Backend on 0.0.0.0:8000 ...
start "Gate Pass Backend" cmd /k "cd /d %~dp0backend && .venv\Scripts\activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

timeout /t 2 /nobreak >nul

echo [2/2] Preparing Android APK Environment...
echo.
echo ========================================================
echo   BACKEND API RUNNING:
echo     - Local:   http://localhost:8000
if not "%LOCAL_IP%"=="" (
  echo     - Mobile:  http://%LOCAL_IP%:8000
  echo.
  echo   INSTALL APK ON YOUR PHONE:
  echo     1. Connect phone to the same Wi-Fi.
  echo     2. Open phone browser and download:
  echo        http://%LOCAL_IP%:8000/download-apk
  echo     3. Tap downloaded APK to install and launch!
)
echo.
echo   APK FILE LOCATION:
echo     %APK_FILE%
echo ========================================================
echo.

rem Check if adb is installed and devices/emulators connected
where adb >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  echo Checking for connected Android devices or emulators via ADB...
  for /f "skip=1 tokens=1" %%d in ('adb devices') do (
    if not "%%d"=="" if not "%%d"=="List" (
      echo Found device %%d. Installing and launching APK...
      adb install -r "%APK_FILE%"
      adb shell monkey -p com.jnn.abhigam -c android.intent.category.LAUNCHER 1
      goto :menu
    )
  )
)

rem Try opening APK with registered emulator if available (BlueStacks, LDPlayer, WSA)
start "" "%APK_FILE%" 2>nul

:menu
echo.
echo ========================================================
echo   [1] Rebuild Android APK (build-apk.bat)
echo   [2] Open APK folder in Windows Explorer
echo   [3] Exit launcher
echo ========================================================
set /p choice="Select an option [1-3] or press Enter to keep running: "
if "%choice%"=="1" (
  call "%~dp0build-apk.bat"
)
if "%choice%"=="2" (
  explorer /select,"%APK_FILE%"
)
