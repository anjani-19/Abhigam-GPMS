@echo off
title JNN INSTITUTE - GATE PASS Launcher
echo ========================================================
echo   Starting JNN INSTITUTE - GATE PASS System
echo ========================================================
echo.

echo [1/2] Launching FastAPI Backend on http://localhost:8000 ...
start "Gate Pass Backend" cmd /k "cd /d %~dp0backend && .venv\Scripts\activate && uvicorn app.main:app --reload --port 8000"

timeout /t 2 /nobreak >nul

echo [2/2] Launching Vite Frontend on http://localhost:5173 ...
start "Gate Pass Frontend" cmd /k "cd /d %~dp0frontend && npm.cmd run dev"

timeout /t 3 /nobreak >nul

echo.
echo Launching web browser at http://localhost:5173 ...
start http://localhost:5173

echo.
echo System started! Keep the opened terminal windows running.
echo Backend API Docs: http://localhost:8000/docs
echo Web App:         http://localhost:5173
echo ========================================================
