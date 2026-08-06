@echo off
echo YT Shorts Generator — Installation
echo.

:: Load .env file
if not exist "%~dp0backend\.env" (
    echo ERROR: backend\.env not found.
    echo Please copy backend\.env.example to backend\.env and fill in your values first.
    pause
    exit /b 1
)

for /f "usebackq tokens=1,* delims==" %%A in ("%~dp0backend\.env") do (
    if not "%%A"=="" if not "%%A:~0,1%"=="#" set "%%A=%%B"
)

:: Validate
if "%WAN2GP_VENV%"=="" (
    echo ERROR: WAN2GP_VENV is not set in backend\.env
    pause
    exit /b 1
)

if not exist "%WAN2GP_VENV%\Scripts\activate" (
    echo ERROR: Wan2GP venv not found at: %WAN2GP_VENV%
    echo Check WAN2GP_VENV in backend\.env
    pause
    exit /b 1
)

:: Install backend dependencies
echo Installing backend dependencies into Wan2GP venv...
echo Venv: %WAN2GP_VENV%
echo.
call "%WAN2GP_VENV%\Scripts\activate" && pip install -r "%~dp0backend\requirements.txt"

if errorlevel 1 (
    echo.
    echo ERROR: pip install failed.
    pause
    exit /b 1
)

:: Install frontend dependencies
echo.
echo Installing frontend dependencies...
cd /d "%~dp0frontend"
npm install

if errorlevel 1 (
    echo.
    echo ERROR: npm install failed.
    pause
    exit /b 1
)

echo.
echo Installation complete!
echo Run start.bat to launch the app.
pause
