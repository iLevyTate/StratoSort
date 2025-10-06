# PowerShell script to regenerate Tauri signing keys after security fix

Write-Host "🔐 Regenerating Tauri signing keys after security fix..." -ForegroundColor Yellow

# Check if Tauri CLI is available
try {
    $tauriVersion = tauri --version 2>$null
    if (-not $tauriVersion) {
        throw "Tauri CLI not found"
    }
    Write-Host "✅ Tauri CLI found: $tauriVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Tauri CLI not found. Please install it first:" -ForegroundColor Red
    Write-Host "   cargo install tauri-cli" -ForegroundColor White
    exit 1
}

# Generate new signing key pair
Write-Host "🔑 Generating new signing key pair..." -ForegroundColor Blue

try {
    $keyOutput = tauri signer generate -w 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Key generation failed: $keyOutput"
    }

    Write-Host "✅ New signing keys generated successfully!" -ForegroundColor Green
    Write-Host $keyOutput -ForegroundColor Gray

} catch {
    Write-Host "❌ Failed to generate signing keys: $_" -ForegroundColor Red
    exit 1
}

# Extract public key from output
$publicKeyMatch = $keyOutput | Select-String "dW50cnVzdGVkIGNvbW1lbnQ6.*"
if ($publicKeyMatch) {
    $publicKey = $publicKeyMatch.Matches[0].Value
    Write-Host "📋 Public key for tauri.conf.json:" -ForegroundColor Cyan
    Write-Host $publicKey -ForegroundColor White
} else {
    Write-Host "⚠️  Could not extract public key from output. Please check the console output above." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🚨 IMPORTANT SECURITY NOTICE:" -ForegroundColor Red
Write-Host "1. Update the 'updater.pubkey' field in src-tauri/tauri.conf.json with the new public key" -ForegroundColor White
Write-Host "2. Store the private key securely (do not commit to version control)" -ForegroundColor White
Write-Host "3. Update your CI/CD environment variables:" -ForegroundColor White
Write-Host "   - TAURI_PRIVATE_KEY: [the private key]" -ForegroundColor Gray
Write-Host "   - TAURI_KEY_PASSWORD: [the key password]" -ForegroundColor Gray
Write-Host "4. The old signing keys are now invalid and should be rotated" -ForegroundColor White

Write-Host ""
Write-Host "🔒 Security fix complete! Environment variables are no longer exposed to frontend." -ForegroundColor Green