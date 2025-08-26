#
# Comprehensive monitoring script for StratoSort with full metrics recording.
# This script runs multiple monitoring tools simultaneously to capture all system metrics.
#
# Usage:
#   .\scripts\comprehensive-monitoring.ps1
#
# This creates:
# - Performance diagnostics (diagnostics/ folder)
# - GPU profiling logs (profile-output/ folder)
# - System metrics logs
# - Ollama server metrics
# - Application performance metrics
#

param(
  [int]$DurationMinutes = 30,
  [string]$OllamaHost = 'http://127.0.0.1:11434'
)

# Setup output directories
$diagnosticsDir = Join-Path -Path $PSScriptRoot -ChildPath "..\diagnostics"
$profileDir = Join-Path -Path $PSScriptRoot -ChildPath "..\profile-output"
$logsDir = Join-Path -Path $PSScriptRoot -ChildPath "..\logs"

# Create directories if they don't exist
@($diagnosticsDir, $profileDir, $logsDir) | ForEach-Object {
  if (-not (Test-Path $_)) {
    New-Item -ItemType Directory -Path $_ | Out-Null
  }
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$sessionId = "session-$timestamp"

Write-Host "Starting Comprehensive StratoSort Monitoring" -ForegroundColor Cyan
Write-Host "Session ID: $sessionId" -ForegroundColor Yellow
Write-Host "Duration: $DurationMinutes minutes" -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Gray

# Function to write timestamped logs
function Write-TimestampedLog {
  param([string]$Message, [string]$LogFile)
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  "$timestamp | $Message" | Out-File -FilePath $LogFile -Append
  Write-Host "[$timestamp] $Message"
}

# 1. Start Performance Diagnostics Collection
Write-Host "Starting Performance Diagnostics..." -ForegroundColor Green
$diagLog = Join-Path $logsDir "diagnostics-$sessionId.log"
$diagJob = Start-Job -ScriptBlock {
  param($diagDir, $interval, $logFile)
  $endTime = (Get-Date).AddMinutes($interval)
  while ((Get-Date) -lt $endTime) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "=== Diagnostics Run: $timestamp ===" | Out-File -FilePath $logFile -Append

    # CPU and Memory
    try {
      $cpu = Get-Counter '\Processor(_Total)\% Processor Time' -ErrorAction SilentlyContinue
      $mem = Get-Counter '\Memory\Available MBytes' -ErrorAction SilentlyContinue
      "CPU: $([math]::Round($cpu.CounterSamples[0].CookedValue, 2))%" | Out-File -FilePath $logFile -Append
      "Memory Available: $([math]::Round($mem.CounterSamples[0].CookedValue, 2)) MB" | Out-File -FilePath $logFile -Append
    } catch {
      "CPU/Memory counters unavailable" | Out-File -FilePath $logFile -Append
    }

    # Electron processes
    $electronProcesses = Get-Process | Where-Object { $_.ProcessName -match 'electron|StratoSort' }
    if ($electronProcesses) {
      "Electron Processes: $($electronProcesses.Count)" | Out-File -FilePath $logFile -Append
      $electronProcesses | ForEach-Object {
        "  PID $($_.Id): CPU $([math]::Round($_.CPU, 2)), WS $([math]::Round($_.WS / 1MB, 2)) MB" | Out-File -FilePath $logFile -Append
      }
    } else {
      "No Electron processes found" | Out-File -FilePath $logFile -Append
    }

    "`n" | Out-File -FilePath $logFile -Append
    Start-Sleep -Seconds 5
  }
} -ArgumentList $diagnosticsDir, $DurationMinutes, $diagLog

# 2. Start GPU Monitoring (if nvidia-smi available)
Write-Host "Starting GPU Monitoring..." -ForegroundColor Green
$gpuLog = Join-Path $logsDir "gpu-$sessionId.log"
$gpuJob = Start-Job -ScriptBlock {
  param($duration, $logFile)
  $endTime = (Get-Date).AddMinutes($duration)
  $nvidiaSmi = $null
  try { $nvidiaSmi = Get-Command nvidia-smi -ErrorAction SilentlyContinue } catch {}

  if ($nvidiaSmi) {
    while ((Get-Date) -lt $endTime) {
      $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
      try {
        $gpuData = & nvidia-smi --query-gpu=index,name,utilization.gpu,utilization.memory,memory.total,memory.used --format=csv,noheader,nounits 2>$null
        if ($gpuData) {
          "$timestamp | $gpuData" | Out-File -FilePath $logFile -Append
        } else {
          "$timestamp | No GPU data available" | Out-File -FilePath $logFile -Append
        }
      } catch {
        "$timestamp | GPU monitoring error: $($_.Exception.Message)" | Out-File -FilePath $logFile -Append
      }
      Start-Sleep -Seconds 2
    }
  } else {
    "$timestamp | nvidia-smi not available on this system" | Out-File -FilePath $logFile -Append
  }
} -ArgumentList $DurationMinutes, $gpuLog

# 3. Start Ollama Server Monitoring
Write-Host "Starting Ollama Server Monitoring..." -ForegroundColor Green
$ollamaLog = Join-Path $logsDir "ollama-$sessionId.log"
$ollamaJob = Start-Job -ScriptBlock {
  param($host, $duration, $logFile)
  $endTime = (Get-Date).AddMinutes($duration)
  while ((Get-Date) -lt $endTime) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    try {
      $start = Get-Date
      $response = Invoke-WebRequest -Uri "$host/api/tags" -Method Get -TimeoutSec 5 -ErrorAction Stop
      $duration = (Get-Date) - $start
      $modelsCount = 0
      if ($response.Content) {
        $json = $response.Content | ConvertFrom-Json
        if ($json.models) { $modelsCount = $json.models.Count }
      }
      "$timestamp | OK | ResponseTime: $([math]::Round($duration.TotalMilliseconds, 2))ms | Models: $modelsCount" | Out-File -FilePath $logFile -Append
    } catch {
      "$timestamp | ERROR | $($_.Exception.Message)" | Out-File -FilePath $logFile -Append
    }
    Start-Sleep -Seconds 10
  }
} -ArgumentList $OllamaHost, $DurationMinutes, $ollamaLog

# 4. Start Disk and Network Monitoring
Write-Host "Starting Disk & Network Monitoring..." -ForegroundColor Green
$diskLog = Join-Path $logsDir "disk-network-$sessionId.log"
$diskJob = Start-Job -ScriptBlock {
  param($duration, $logFile)
  $endTime = (Get-Date).AddMinutes($duration)
  while ((Get-Date) -lt $endTime) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    try {
      # Disk usage for StratoSort directory
      $stratoDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
      $diskInfo = Get-WmiObject -Class Win32_LogicalDisk | Where-Object { $_.DriveType -eq 3 }
      $stratoDrive = $diskInfo | Where-Object { $stratoDir -like "$($_.DeviceID)*" }

      if ($stratoDrive) {
        $freeGB = [math]::Round($stratoDrive.FreeSpace / 1GB, 2)
        $totalGB = [math]::Round($stratoDrive.Size / 1GB, 2)
        $usedPercent = [math]::Round((1 - ($stratoDrive.FreeSpace / $stratoDrive.Size)) * 100, 2)
        "$timestamp | Disk C: ${freeGB}GB free / ${totalGB}GB total (${usedPercent}%)" | Out-File -FilePath $logFile -Append
      }

      # Network stats
      $networkStats = Get-NetAdapterStatistics -ErrorAction SilentlyContinue | Where-Object { $_.ReceivedBytes -gt 0 }
      if ($networkStats) {
        $totalReceived = ($networkStats | Measure-Object -Property ReceivedBytes -Sum).Sum
        $totalSent = ($networkStats | Measure-Object -Property SentBytes -Sum).Sum
        "$timestamp | Network: RX $([math]::Round($totalReceived / 1MB, 2))MB, TX $([math]::Round($totalSent / 1MB, 2))MB" | Out-File -FilePath $logFile -Append
      }
    } catch {
      "$timestamp | Disk/Network monitoring error: $($_.Exception.Message)" | Out-File -FilePath $logFile -Append
    }
    Start-Sleep -Seconds 30
  }
} -ArgumentList $DurationMinutes, $diskLog

# 5. Start Application Event Monitoring
Write-Host "Starting Application Event Monitoring..." -ForegroundColor Green
$eventLog = Join-Path $logsDir "events-$sessionId.log"
$eventJob = Start-Job -ScriptBlock {
  param($duration, $logFile)
  $endTime = (Get-Date).AddMinutes($duration)
  $lastEventId = 0

  while ((Get-Date) -lt $endTime) {
    try {
      # Get recent application events
      $events = Get-EventLog -LogName Application -Newest 10 -ErrorAction SilentlyContinue |
        Where-Object { $_.Source -match 'electron|node|StratoSort' -and $_.Index -gt $lastEventId }

      if ($events) {
        $events | ForEach-Object {
          $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
          "$timestamp | Event: $($_.EntryType) | Source: $($_.Source) | Message: $($_.Message)" | Out-File -FilePath $logFile -Append
          if ($_.Index -gt $lastEventId) { $lastEventId = $_.Index }
        }
      }
    } catch {
      # Event log access might fail in some environments
    }
    Start-Sleep -Seconds 15
  }
} -ArgumentList $DurationMinutes, $eventLog

# Main monitoring loop with real-time display
Write-Host "`nMonitoring Active. Press Ctrl+C to stop." -ForegroundColor Yellow
Write-Host "Logs saved to: $logsDir" -ForegroundColor Gray

$endTime = (Get-Date).AddMinutes($DurationMinutes)
$lastUpdate = Get-Date

while ((Get-Date) -lt $endTime) {
  Start-Sleep -Seconds 10

  # Show progress every 30 seconds
  if (((Get-Date) - $lastUpdate).TotalSeconds -gt 30) {
    $remaining = $endTime - (Get-Date)
    $remainingMins = [math]::Floor($remaining.TotalMinutes)
    $remainingSecs = [math]::Floor($remaining.TotalSeconds) % 60

    Write-Host "Time remaining: ${remainingMins}m ${remainingSecs}s" -ForegroundColor Cyan

    # Check if StratoSort is still running
    $electronProcesses = Get-Process | Where-Object { $_.ProcessName -match 'electron|StratoSort' }
    if ($electronProcesses) {
      Write-Host "StratoSort processes: $($electronProcesses.Count) active" -ForegroundColor Green
    } else {
      Write-Host "WARNING: No StratoSort processes found - application may have stopped" -ForegroundColor Yellow
    }

    $lastUpdate = Get-Date
  }
}

Write-Host "`nMonitoring period complete. Gathering final data..." -ForegroundColor Yellow

# Wait for all jobs to complete
Write-Host "Waiting for background jobs to finish..." -ForegroundColor Gray
Get-Job | Wait-Job | Out-Null

# Generate summary report
Write-Host "Generating summary report..." -ForegroundColor Green
$summaryFile = Join-Path $logsDir "summary-$sessionId.txt"

$summary = @"
STRATOSORT MONITORING SESSION SUMMARY
=====================================
Session ID: $sessionId
Start Time: $timestamp
Duration: $DurationMinutes minutes
End Time: $(Get-Date -Format "yyyyMMdd-HHmmss")

MONITORING RESULTS
==================

"@

# Add job results to summary
$jobs = Get-Job
foreach ($job in $jobs) {
  $summary += "`n$($job.Name) Status: $($job.State)"
  if ($job.State -eq 'Completed') {
    $summary += " [OK]"
  } elseif ($job.State -eq 'Failed') {
    $summary += " [FAILED] - $($job.JobStateInfo.Reason)"
  }
}

$summary += @"


LOG FILES CREATED
==================
"@

$logFiles = Get-ChildItem $logsDir -Filter "*$sessionId*"
foreach ($file in $logFiles) {
  $size = [math]::Round($file.Length / 1KB, 2)
  $fileName = $file.Name
  $summary += "`n$fileName ($size KB)"
}

$summary += @"


SYSTEM INFORMATION
==================
OS: $([Environment]::OSVersion)
Machine: $env:COMPUTERNAME
User: $env:USERNAME
PowerShell: $($PSVersionTable.PSVersion)
.NET: $([Environment]::Version)

PROCESS INFORMATION
===================
"@

$electronProcesses = Get-Process | Where-Object { $_.ProcessName -match 'electron|StratoSort' }
if ($electronProcesses) {
  foreach ($process in $electronProcesses) {
    $summary += "`n$($process.ProcessName) (PID: $($process.Id))"
    $summary += "`n  CPU: $([math]::Round($process.CPU, 2))"
    $summary += "`n  Memory: $([math]::Round($process.WS / 1MB, 2)) MB"
  }
} else {
  $summary += "`nNo StratoSort processes found"
}

$summary += @"


NEXT STEPS
==========
1. Review log files in: $logsDir
2. Check diagnostics in: $diagnosticsDir
3. View GPU profiles in: $profileDir
4. Run analysis: .\scripts\analyze-logs.ps1 $sessionId

"@

$summary | Out-File -FilePath $summaryFile

# Cleanup jobs
Get-Job | Remove-Job

Write-Host "Monitoring session complete!" -ForegroundColor Green
Write-Host "All logs saved to: $logsDir" -ForegroundColor Cyan
Write-Host "Summary report: $summaryFile" -ForegroundColor Cyan
Write-Host "`nSession ID for analysis: $sessionId" -ForegroundColor Yellow
