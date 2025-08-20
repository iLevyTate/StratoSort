Write-Host "Building StratoSort Windows installer..." -ForegroundColor Cyan

# Check and setup Ollama (optional but recommended)
Write-Host "Checking Ollama setup..." -ForegroundColor Yellow
$ollamaCheck = node setup-ollama.js --check 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Warning: Ollama is not properly configured. AI features may be limited." -ForegroundColor Yellow
  Write-Host "Run 'npm run setup:ollama' to configure Ollama for full functionality." -ForegroundColor Yellow
} else {
  Write-Host "✓ Ollama is properly configured" -ForegroundColor Green
}

if (-not (Test-Path "node_modules")) {
  Write-Host "Installing dependencies (npm ci)..." -ForegroundColor Yellow
  npm ci
}

Write-Host "Building renderer (npm run build)..." -ForegroundColor Yellow
npm run build

Write-Host "Packaging with electron-builder (win)..." -ForegroundColor Yellow
npx electron-builder --win --config electron-builder.json

Write-Host "Done. Artifacts in release/build" -ForegroundColor Green


