@echo off
echo ============================================
echo   StratoSort Installer Builder
echo ============================================
echo.

REM Check if Node.js is installed
where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo [1/5] Installing dependencies...
call npm ci

if errorlevel 1 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo [2/5] Building application...
call npm run build

if errorlevel 1 (
    echo ERROR: Build failed
    pause
    exit /b 1
)

echo.
echo [3/5] Checking Ollama setup...
call node setup-ollama.js --check >nul 2>&1
if errorlevel 1 (
    echo WARNING: Ollama not configured. AI features will be limited.
    echo Run 'npm run setup:ollama' to configure Ollama.
) else (
    echo Ollama is configured and ready!
)

echo.
echo [4/5] Creating Windows installer...
call npm run dist:win

if errorlevel 1 (
    echo ERROR: Installer creation failed
    pause
    exit /b 1
)

echo.
echo [5/5] Build complete!
echo.
echo ============================================
echo   SUCCESS! Installer created
echo ============================================
echo.
echo Installer location:
echo   release\build\StratoSort-Setup-1.0.0.exe
echo.
echo You can now:
echo   1. Run the installer to install StratoSort
echo   2. Share it with others
echo   3. Upload it to GitHub Releases
echo.
pause
