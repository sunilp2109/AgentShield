@echo off
title AgentShield Launcher
color 0A

echo ============================================
echo        AgentShield - One-Click Start
echo ============================================
echo.

:: Get the directory where this .bat file lives
set "ROOT=%~dp0"

:: -- Backend ------------------------------------------
echo [1/2] Starting Backend (FastAPI + Uvicorn)...
start "AgentShield Backend" cmd /k "cd /d ""%ROOT%backend"" && call .venv\Scripts\activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

:: Small pause so the backend window opens first
timeout /t 2 /nobreak >nul

:: -- Frontend -----------------------------------------
echo [2/2] Starting Frontend (Next.js)...
start "AgentShield Frontend" cmd /k "cd /d ""%ROOT%frontend"" && npm run dev"

echo.
echo ============================================
echo  Both services are starting in new windows!
echo  Backend  : http://localhost:8000
echo  Frontend : http://localhost:3000
echo ============================================
echo.
echo  You can close THIS window now.
pause
