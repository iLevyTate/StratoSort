# Comprehensive Analysis Commands for StratoSort

Write-Host "=== STRATOSORT COMPREHENSIVE ANALYSIS ===" -ForegroundColor Cyan

# Performance Analysis
Write-Host "`n1. SYSTEM DIAGNOSTIC" -ForegroundColor Yellow
Write-Host "node scripts/diagnose.js"

Write-Host "`n2. GPU PROFILING" -ForegroundColor Yellow
Write-Host "node scripts/profile-electron-gpu.js"

# Log Analysis
Write-Host "`n3. ERROR ANALYSIS" -ForegroundColor Yellow
Write-Host "Get-Content logs/**/*.log | Select-String -Pattern 'error|ERROR' | Select-Object -Last 20"

Write-Host "`n4. HEALTH CHECKS" -ForegroundColor Yellow
Write-Host "Get-Content logs/performance/*.log | Select-String -Pattern 'HEALTH_CHECK' | Select-Object -Last 10"

Write-Host "`n5. PERFORMANCE METRICS" -ForegroundColor Yellow
Write-Host "Get-Content logs/performance/*.log | Select-String -Pattern 'responseTime|duration' | Select-Object -Last 15"

Write-Host "`n6. USER ACTIONS" -ForegroundColor Yellow
Write-Host "Get-Content logs/actions/*.log | Select-String -Pattern 'ui_interaction|file_operation' | Select-Object -Last 10"

# System Monitoring
Write-Host "`n7. REALTIME SYSTEM MONITOR" -ForegroundColor Yellow
Write-Host "node -e `"const {systemMonitor} = require('./src/main/services/SystemMonitor'); systemMonitor.initialize().then(() => console.log('Monitoring active...'));`""

Write-Host "`n8. LOG STATISTICS" -ForegroundColor Yellow
Write-Host "Get-ChildItem logs -Recurse -File | Group-Object Extension | Select-Object Name, Count, @{Name='SizeMB';Expression={([Math]::Round(($_.Group | Measure-Object Length -Sum).Sum / 1MB), 2))}}"

Write-Host "`n9. RECENT LOG ACTIVITY" -ForegroundColor Yellow
Write-Host "Get-ChildItem logs -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object FullName, LastWriteTime, Length | Select-Object -First 10"

Write-Host "`n=== BROWSER ANALYSIS STEPS ===" -ForegroundColor Green
Write-Host "1. Open Chrome DevTools (F12)"
Write-Host "2. Performance tab: Record during file operations"
Write-Host "3. Memory tab: Take heap snapshots before/after"
Write-Host "4. Network tab: Monitor API calls and timing"
Write-Host "5. React DevTools: Check component re-renders"
Write-Host "6. Application tab: Check storage usage"

Write-Host "`n=== RECOMMENDED ANALYSIS ORDER ===" -ForegroundColor Magenta
Write-Host "1. Run system diagnostic"
Write-Host "2. Start GPU profiling"
Write-Host "3. Open browser DevTools"
Write-Host "4. Perform file operations while monitoring"
Write-Host "5. Check logs for errors and performance"
Write-Host "6. Analyze memory usage patterns"
Write-Host "7. Review React component performance"
