# Coverage reporting script for StratoSort (Windows PowerShell)
# Run with: .\scripts\coverage.ps1

Write-Host "🔍 Running coverage tests for StratoSort..." -ForegroundColor Green

# Change to the src-tauri directory
Set-Location src-tauri

# Run tests with coverage
Write-Host "📊 Running tests with coverage..." -ForegroundColor Cyan
cargo tarpaulin `
    --out html `
    --output-dir ../coverage `
    --exclude-files "src/bin/*" `
    --exclude-files "src/lib.rs" `
    --exclude-files "src/tests/*" `
    --exclude-files "src/error.rs" `
    --exclude-files "src/responses.rs" `
    --timeout 120 `
    --engine llvm `
    --workspace

Write-Host "✅ Coverage report generated in coverage/index.html" -ForegroundColor Green
Write-Host "📈 Open coverage/index.html in your browser to view the report" -ForegroundColor Yellow
