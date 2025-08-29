# StratoSort: Complete Analysis Script
# This script starts the app with full monitoring and runs all diagnostic tools

Write-Host "🚀 STARTING STRATOSORT WITH COMPLETE ANALYSIS" -ForegroundColor Magenta
Write-Host "======================================================" -ForegroundColor Cyan

# Function to run a command and show output
function Run-Command {
    param([string]$Command, [string]$Description)
    Write-Host "`n📋 $Description..." -ForegroundColor Yellow
    try {
        Invoke-Expression $Command
        Write-Host "✅ $Description completed" -ForegroundColor Green
    } catch {
        Write-Host "❌ $Description failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Step 1: Quick system health check
Write-Host "`n1️⃣ SYSTEM HEALTH CHECK" -ForegroundColor Cyan
Run-Command "npm run diagnose" "Running system diagnostics"

# Step 2: Start the application with full logging
Write-Host "`n2️⃣ STARTING APPLICATION" -ForegroundColor Cyan
Write-Host "📱 Launching StratoSort with full monitoring..." -ForegroundColor Yellow

# Start the app in background
$npmProcess = Start-Process -FilePath "npm" -ArgumentList "run start:dev" -PassThru -WindowStyle Normal

# Wait for app to start
Write-Host "⏳ Waiting for application to initialize..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Step 3: Run GPU profiling
Write-Host "`n3️⃣ GPU PROFILING" -ForegroundColor Cyan
Run-Command "node scripts/profile-electron-gpu.js" "GPU performance profiling"

# Step 4: Show log monitoring commands
Write-Host "`n4️⃣ LOG MONITORING COMMANDS" -ForegroundColor Cyan
Write-Host "📊 While app is running, you can monitor logs with:" -ForegroundColor Yellow
Write-Host "   Get-Content logs/**/*.log | Select-String -Pattern 'error' -Last 10" -ForegroundColor White
Write-Host "   Get-Content logs/performance/*.log | Select-String -Pattern 'responseTime' -Last 15" -ForegroundColor White
Write-Host "   Get-ChildItem logs -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 5" -ForegroundColor White

# Step 5: Instructions for DevTools
Write-Host "`n5️⃣ DEVTOOLS ANALYSIS" -ForegroundColor Cyan
Write-Host "🔧 In the running app, press F12 to open DevTools:" -ForegroundColor Yellow
Write-Host "   • Performance tab: Record during file operations" -ForegroundColor White
Write-Host "   • Memory tab: Take heap snapshots" -ForegroundColor White
Write-Host "   • Network tab: Monitor IPC calls" -ForegroundColor White
Write-Host "   • Console tab: Real-time logging" -ForegroundColor White

# Step 6: Show how to stop
Write-Host "`n6️⃣ HOW TO STOP ANALYSIS" -ForegroundColor Cyan
Write-Host "🛑 When done with analysis:" -ForegroundColor Yellow
Write-Host "   1. Close the StratoSort application window" -ForegroundColor White
Write-Host "   2. Or press Ctrl+C in this terminal" -ForegroundColor White
Write-Host "   3. All logs will be saved in the 'logs/' folder" -ForegroundColor White

Write-Host "`n🎉 ANALYSIS SESSION STARTED!" -ForegroundColor Green
Write-Host "   • App is running with full logging" -ForegroundColor White
Write-Host "   • All monitoring systems are active" -ForegroundColor White
Write-Host "   • Logs are being written in real-time" -ForegroundColor White
Write-Host "   • Press F12 in app for DevTools analysis" -ForegroundColor White

# Wait for user to finish analysis
Write-Host "`n⏳ Press any key to stop the analysis session..." -ForegroundColor Magenta
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# Clean up
Write-Host "`n🧹 Cleaning up..." -ForegroundColor Yellow
if (!$npmProcess.HasExited) {
    Stop-Process -Id $npmProcess.Id -Force
}

Write-Host "✅ Analysis session completed!" -ForegroundColor Green
Write-Host "📁 Check 'logs/' folder for all generated data" -ForegroundColor Cyan
