<#
PowerShell diagnostic script for StratoSort performance issues.

Usage:
  Open PowerShell in the project root and run:
    .\scripts\diagnose-performance.ps1

This script performs a set of non-invasive checks and writes a report to ./diagnostics/
It checks: top CPU processes, Electron processes, memory, disk and CPU counters,
NVIDIA GPU utilization (via nvidia-smi if available), Ollama HTTP health, and basic system info.
#>

param(
  [string]$OllamaHost = 'http://127.0.0.1:11434',
  [int]$TimeoutSec = 5
)

function New-EnsureDirectory($p) {
  if (-not (Test-Path $p)) {
    New-Item -ItemType Directory -Path $p | Out-Null
  }
}

# Prepare output
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$outDir = Join-Path -Path (Resolve-Path .).Path -ChildPath "diagnostics"
New-EnsureDirectory $outDir
$outFile = Join-Path $outDir "diag-$ts.txt"

Write-Output "Generating diagnostics -> $outFile"

function Write-Section($title, $content) {
  Add-Content -Path $outFile -Value "`n=== $title ===`n"
  if ($content -is [string]) { Add-Content -Path $outFile -Value $content }
  else { $content | Out-String | Add-Content -Path $outFile }
}

Write-Section "Timestamp" (Get-Date).ToString()

Write-Section "System Info" @(
  "OS: $([Environment]::OSVersion)"
  "MachineName: $env:COMPUTERNAME"
  "User: $env:USERNAME"
  "CPU Count: $([Environment]::ProcessorCount)"
)

try {
  Write-Section "Top CPU Processes" (
    Get-Process | Sort-Object -Property CPU -Descending | Select-Object -First 15 Id,ProcessName,CPU,WS | Format-Table | Out-String
  )
} catch {
  Write-Section "Top CPU Processes" "Failed to enumerate processes: $_"
}

try {
  Write-Section "Electron / StratoSort Processes" (
    Get-Process | Where-Object { $_.ProcessName -match 'electron|StratoSort' } | Select-Object Id,ProcessName,CPU,WS | Format-Table | Out-String
  )
} catch {
  Write-Section "Electron Processes" "Failed to enumerate electron processes: $_"
}

try {
  Write-Section "Memory / CPU Counters" (
    Get-Counter '\Processor(_Total)\% Processor Time','\Memory\Available MBytes' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty CounterSamples | Format-Table -AutoSize | Out-String
  )
} catch {
  Write-Section "Memory / CPU Counters" "Failed to read perf counters: $_"
}

# GPU via nvidia-smi (best-effort)
try {
  $nvsmi = (Get-Command nvidia-smi.exe -ErrorAction SilentlyContinue) -or (Get-Command nvidia-smi -ErrorAction SilentlyContinue)
  if ($nvsmi) {
    Write-Section "nvidia-smi" ( & nvidia-smi --query-gpu=index,name,utilization.gpu,utilization.memory,memory.total,memory.used --format=csv,noheader,nounits 2>&1 )
  } else {
    Write-Section "nvidia-smi" "nvidia-smi not found on PATH"
  }
} catch {
  Write-Section "nvidia-smi" "Error running nvidia-smi: $_"
}

# Ollama health check
try {
  $start = Get-Date
  $resp = Invoke-RestMethod -Uri "$OllamaHost/api/tags" -Method Get -TimeoutSec $TimeoutSec -ErrorAction Stop
  $dur = (Get-Date) - $start
  Write-Section "Ollama /api/tags" "Status: OK, TimeMs: $($dur.TotalMilliseconds)\nResponse sample: $(if ($resp -is [System.Array]) { $resp[0] } else { $resp } )"
} catch {
  Write-Section "Ollama /api/tags" "Request failed: $($_.Exception.Message)"
}

# Additional quick Ollama ping (models)
try {
  $start = Get-Date
  $resp2 = Invoke-RestMethod -Uri "$OllamaHost/api/models" -Method Get -TimeoutSec $TimeoutSec -ErrorAction Stop
  $dur2 = (Get-Date) - $start
  $modelsCount = 0
  try { $modelsCount = ($resp2.models | Measure-Object).Count } catch { $modelsCount = 0 }
  Write-Section "Ollama /api/models" "Status: OK, TimeMs: $($dur2.TotalMilliseconds)\nModelsCount: $modelsCount"
} catch {
  Write-Section "Ollama /api/models" "Request failed: $($_.Exception.Message)"
}

Write-Output "Diagnostics written to $outFile"
Write-Output "Tail the file with: Get-Content $outFile -Wait"


