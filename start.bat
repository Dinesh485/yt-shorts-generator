@echo off
echo Starting YT Shorts Generator...

start "Backend" cmd /k "cd /d %~dp0 && call venv\Scripts\activate && cd backend && python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

timeout /t 2 /nobreak >nul

start "Frontend" cmd /k "cd /d %~dp0\frontend && npm run dev"

echo.
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:5173
echo.
echo Both servers are starting in separate windows.
