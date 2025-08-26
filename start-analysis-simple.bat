@echo off
REM Simple batch script to start StratoSort with full analysis

echo 🚀 Starting StratoSort with Complete Analysis
echo ==================================================

echo.
echo 📋 Step 1: Running system diagnostics...
npm run diagnose

echo.
echo 📱 Step 2: Starting application with full logging...
echo (This will open a new window)
start cmd /k "npm run start:dev"

echo.
echo ⏳ Waiting for app to start...
timeout /t 10 /nobreak >nul

echo.
echo 📊 Step 3: GPU profiling...
node scripts/profile-electron-gpu.js

echo.
echo 🎉 ANALYSIS SESSION STARTED!
echo.
echo 📝 INSTRUCTIONS:
echo    • Use the StratoSort app window for testing
echo    • Press F12 in app to open DevTools
echo    • Check Performance, Memory, Network tabs
echo    • All logs saved to 'logs/' folder
echo.
echo 🛑 To stop: Just close the StratoSort app window
echo.
echo 📁 Logs will be in: logs\performance\ and logs\actions\
echo.

pause
