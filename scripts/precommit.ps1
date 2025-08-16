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

# Typecheck
Write-Host "Typecheck" -ForegroundColor Yellow
npm run typecheck

# Tests
Write-Host "Tests" -ForegroundColor Yellow
npm test

Write-Host "Pre-commit checks completed." -ForegroundColor Green


