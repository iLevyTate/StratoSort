param(
  [switch]$Fix
)

Write-Host "Running StratoSort pre-commit checks..." -ForegroundColor Cyan

# Ensure Node modules
if (-not (Test-Path "node_modules")) {
  Write-Host "Installing dependencies (npm ci)..." -ForegroundColor Yellow
  npm ci
}

# Lint
if ($Fix) {
  Write-Host "Lint (fix)" -ForegroundColor Yellow
  npm run lint:fix
} else {
  Write-Host "Lint (check)" -ForegroundColor Yellow
  npm run lint
}

# Format
if ($Fix) {
  Write-Host "Format (prettier --write)" -ForegroundColor Yellow
  npm run format
} else {
  Write-Host "Format (prettier --check)" -ForegroundColor Yellow
  npm run format:check
}

# Typecheck (optional)
try {
  $pkg = Get-Content "package.json" -Raw | ConvertFrom-Json
  $hasTypecheck = $false
  if ($pkg -and $pkg.scripts) {
    $hasTypecheck = $pkg.scripts.PSObject.Properties.Name -contains "typecheck"
  }
} catch {
  $hasTypecheck = $false
}

if ($hasTypecheck) {
  Write-Host "Typecheck" -ForegroundColor Yellow
  npm run typecheck
} else {
  Write-Host "Typecheck (skipped - no script)" -ForegroundColor DarkYellow
}

# Tests
Write-Host "Tests" -ForegroundColor Yellow
npm test

Write-Host "Pre-commit checks completed." -ForegroundColor Green


