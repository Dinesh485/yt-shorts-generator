@echo off
echo Starting YT Shorts Generator...

:: Load .env file
for /f "usebackq tokens=1,* delims==" %%A in ("%~dp0backend\.env") do (
    if not "%%A"=="" if not "%%A:~0,1%"=="#" set "%%A=%%B"
)

:: Validate required vars
if "%WAN2GP_PATH%"=="" (
    echo ERROR: WAN2GP_PATH is not set in backend\.env
    pause
    exit /b 1
)
if "%WAN2GP_VENV%"=="" (
    echo ERROR: WAN2GP_VENV is not set in backend\.env
    pause
    exit /b 1
)

:: Start backend using Wan2GP's venv
start "Backend" cmd /k "cd /d %~dp0 && call "%WAN2GP_VENV%\Scripts\activate" && cd backend && python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

timeout /t 2 /nobreak >nul

:: Start frontend
start "Frontend" cmd /k "cd /d %~dp0\frontend && npm run dev"

echo.
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:5173
echo.
echo Both servers starting in separate windows.
