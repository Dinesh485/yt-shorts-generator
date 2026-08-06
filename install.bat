@echo off
echo YT Shorts Generator - Installation
echo.

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

echo Found Wan2GP venv: %WAN2GP_VENV%

if not exist "%WAN2GP_VENV%\Scripts\activate.bat" (
    echo ERROR: Venv not found at: %WAN2GP_VENV%
    echo Check WAN2GP_VENV in backend\.env
    pause
    exit /b 1
)

:: Install backend dependencies
echo.
echo Installing backend dependencies...
call "%WAN2GP_VENV%\Scripts\activate.bat"
pip install -r "%~dp0backend\requirements.txt"

if errorlevel 1 (
    echo.
    echo ERROR: pip install failed.
    pause
    exit /b 1
)

:: Deactivate venv before npm
call deactivate

:: Install frontend dependencies
echo.
echo Installing frontend dependencies...
cd /d "%~dp0frontend"
call npm install

if errorlevel 1 (
    echo.
    echo ERROR: npm install failed.
    pause
    exit /b 1
)

echo.
echo ----------------------------------------
echo Installation complete!
echo Run start.bat to launch the app.
echo ----------------------------------------
pause
