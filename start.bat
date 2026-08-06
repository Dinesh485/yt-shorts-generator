@echo off
echo Starting YT Shorts Generator...

:: Check .env exists
if not exist "%~dp0backend\.env" (
    echo ERROR: backend\.env not found.
    echo Please copy backend\.env.example to backend\.env and fill in your values first.
    pause
    exit /b 1
)

:: Parse WAN2GP_VENV from .env
set WAN2GP_VENV=
for /f "tokens=1,* delims==" %%A in ('findstr /i "WAN2GP_VENV" "%~dp0backend\.env"') do set WAN2GP_VENV=%%B

if "%WAN2GP_VENV%"=="" (
    echo ERROR: WAN2GP_VENV not found in backend\.env
    pause
    exit /b 1
)

if not exist "%WAN2GP_VENV%\Scripts\activate.bat" (
    echo ERROR: Venv not found at: %WAN2GP_VENV%
    echo Check WAN2GP_VENV in backend\.env
    pause
    exit /b 1
)

:: Start backend using Wan2GP's venv
start "Backend" cmd /k "call "%WAN2GP_VENV%\Scripts\activate.bat" && cd /d "%~dp0backend" && python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

timeout /t 2 /nobreak >nul

:: Start frontend
start "Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:5173
echo.
echo Both servers starting in separate windows.
