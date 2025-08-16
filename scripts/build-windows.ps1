Write-Host "Building StratoSort Windows installer..." -ForegroundColor Cyan

if (-not (Test-Path "node_modules")) {
  Write-Host "Installing dependencies (npm ci)..." -ForegroundColor Yellow
  npm ci
}

Write-Host "Building renderer (npm run build)..." -ForegroundColor Yellow
npm run build

Write-Host "Packaging with electron-builder (win)..." -ForegroundColor Yellow
npx electron-builder --win --config electron-builder.json

Write-Host "Done. Artifacts in release/build" -ForegroundColor Green


