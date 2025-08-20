# StratoSort Ollama Setup Script for Windows
# This script ensures Ollama is installed and configured for StratoSort

param(
    [switch]$Auto = $false,
    [switch]$Check = $false,
    [switch]$Minimal = $false
)

$ErrorActionPreference = "Stop"

# Configuration
$OLLAMA_HOST = if ($env:OLLAMA_HOST) { $env:OLLAMA_HOST } else { "http://127.0.0.1:11434" }
$OLLAMA_DOWNLOAD_URL = "https://ollama.com/download/OllamaSetup.exe"
$TEMP_DIR = [System.IO.Path]::GetTempPath()
$OLLAMA_INSTALLER = Join-Path $TEMP_DIR "OllamaSetup.exe"

# Essential models
$ESSENTIAL_TEXT_MODELS = @("llama3.2:latest", "llama3.1:latest", "llama3:latest", "gemma2:2b", "phi3:mini")
$ESSENTIAL_VISION_MODELS = @("llava:latest", "bakllava:latest", "moondream:latest")
$ESSENTIAL_EMBEDDING_MODELS = @("mxbai-embed-large:latest", "nomic-embed-text:latest")

function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

function Test-OllamaInstalled {
    try {
        $ollamaPath = Get-Command ollama -ErrorAction SilentlyContinue
        if ($ollamaPath) {
            return $true
        }
    } catch { }
    
    # Check common installation paths
    $commonPaths = @(
        "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe",
        "$env:ProgramFiles\Ollama\ollama.exe",
        "C:\Program Files\Ollama\ollama.exe"
    )
    
    foreach ($path in $commonPaths) {
        if (Test-Path $path) {
            return $true
        }
    }
    
    return $false
}

function Test-OllamaRunning {
    try {
        $response = Invoke-WebRequest -Uri "$OLLAMA_HOST/api/tags" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Get-InstalledModels {
    try {
        $output = & ollama list 2>$null
        if ($LASTEXITCODE -eq 0) {
            $models = $output | Select-Object -Skip 1 | ForEach-Object {
                if ($_ -match '^(\S+)') {
                    $matches[1].ToLower()
                }
            }
            return $models | Where-Object { $_ }
        }
    } catch { }
    return @()
}

function Install-Ollama {
    Write-ColorOutput "`nDownloading Ollama installer..." "Cyan"
    
    try {
        # Download the installer
        $webClient = New-Object System.Net.WebClient
        $webClient.DownloadFile($OLLAMA_DOWNLOAD_URL, $OLLAMA_INSTALLER)
        
        Write-ColorOutput "Installing Ollama (this may require administrator privileges)..." "Cyan"
        
        # Run the installer silently
        $installerArgs = "/S"  # Silent installation
        $process = Start-Process -FilePath $OLLAMA_INSTALLER -ArgumentList $installerArgs -Wait -PassThru
        
        if ($process.ExitCode -eq 0) {
            Write-ColorOutput "✓ Ollama installed successfully" "Green"
            
            # Refresh PATH
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
            
            return $true
        } else {
            Write-ColorOutput "✗ Ollama installation failed with exit code: $($process.ExitCode)" "Red"
            return $false
        }
    } catch {
        Write-ColorOutput "✗ Failed to download or install Ollama: $_" "Red"
        return $false
    } finally {
        # Clean up installer
        if (Test-Path $OLLAMA_INSTALLER) {
            Remove-Item $OLLAMA_INSTALLER -Force -ErrorAction SilentlyContinue
        }
    }
}

function Start-OllamaServer {
    Write-ColorOutput "Starting Ollama server..." "Cyan"
    
    if (Test-OllamaRunning) {
        Write-ColorOutput "✓ Ollama server is already running" "Green"
        return $true
    }
    
    try {
        # Start Ollama serve in background
        $ollamaPath = (Get-Command ollama -ErrorAction SilentlyContinue).Path
        if (-not $ollamaPath) {
            $ollamaPath = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
        }
        
        if (Test-Path $ollamaPath) {
            Start-Process -FilePath $ollamaPath -ArgumentList "serve" -WindowStyle Hidden
            
            # Wait for server to start (max 10 seconds)
            for ($i = 0; $i -lt 20; $i++) {
                Start-Sleep -Milliseconds 500
                if (Test-OllamaRunning) {
                    Write-ColorOutput "✓ Ollama server started successfully" "Green"
                    return $true
                }
            }
        }
        
        Write-ColorOutput "⚠ Ollama server failed to start" "Yellow"
        return $false
    } catch {
        Write-ColorOutput "✗ Error starting Ollama server: $_" "Red"
        return $false
    }
}

function Install-Model {
    param([string]$ModelName)
    
    Write-ColorOutput "Pulling model: $ModelName..." "Cyan"
    
    try {
        $process = Start-Process -FilePath "ollama" -ArgumentList "pull", $ModelName -Wait -PassThru -NoNewWindow
        
        if ($process.ExitCode -eq 0) {
            Write-ColorOutput "✓ Successfully pulled $ModelName" "Green"
            return $true
        } else {
            Write-ColorOutput "⚠ Failed to pull $ModelName" "Yellow"
            return $false
        }
    } catch {
        Write-ColorOutput "✗ Error pulling $ModelName`: $_" "Red"
        return $false
    }
}

function Install-EssentialModels {
    param([bool]$MinimalSetup = $false)
    
    Write-ColorOutput "`nChecking installed models..." "Cyan"
    
    $installedModels = Get-InstalledModels
    Write-ColorOutput "Found $($installedModels.Count) installed models" "Gray"
    
    $hasTextModel = $false
    $hasVisionModel = $false
    $hasEmbeddingModel = $false
    
    # Check existing models
    foreach ($model in $installedModels) {
        $modelBase = $model.Split(':')[0]
        
        if ($ESSENTIAL_TEXT_MODELS | ForEach-Object { $_.Split(':')[0] } | Where-Object { $modelBase -like $_ }) {
            $hasTextModel = $true
            Write-ColorOutput "  ✓ $model (text)" "Green"
        }
        elseif ($ESSENTIAL_VISION_MODELS | ForEach-Object { $_.Split(':')[0] } | Where-Object { $modelBase -like $_ }) {
            $hasVisionModel = $true
            Write-ColorOutput "  ✓ $model (vision)" "Green"
        }
        elseif ($ESSENTIAL_EMBEDDING_MODELS | ForEach-Object { $_.Split(':')[0] } | Where-Object { $modelBase -like $_ }) {
            $hasEmbeddingModel = $true
            Write-ColorOutput "  ✓ $model (embedding)" "Green"
        }
    }
    
    # Install missing essential models
    if (-not $hasTextModel) {
        Write-ColorOutput "`n⚠ No text model found. Installing essential text model..." "Yellow"
        foreach ($model in $ESSENTIAL_TEXT_MODELS) {
            if (Install-Model -ModelName $model) {
                $hasTextModel = $true
                break
            }
        }
    }
    
    # Install vision model (required)
    if (-not $hasVisionModel) {
        Write-ColorOutput "`n⚠ No vision model found. Installing essential vision model for image analysis..." "Yellow"
        foreach ($model in $ESSENTIAL_VISION_MODELS) {
            if (Install-Model -ModelName $model) {
                $hasVisionModel = $true
                break
            }
        }
    }
        
        if (-not $hasEmbeddingModel) {
            Write-ColorOutput "`nInstalling embedding model for semantic search..." "Cyan"
            foreach ($model in $ESSENTIAL_EMBEDDING_MODELS) {
                if (Install-Model -ModelName $model) {
                    $hasEmbeddingModel = $true
                    break
                }
            }
        }
    }
    
    # Verify minimum requirements
    if (-not $hasTextModel -or -not $hasVisionModel) {
        if (-not $hasTextModel) {
            Write-ColorOutput "`n✗ Failed to install any text model. StratoSort requires at least one text model." "Red"
        }
        if (-not $hasVisionModel) {
            Write-ColorOutput "`n✗ Failed to install any vision model. StratoSort requires at least one vision model for image analysis." "Red"
        }
        return $false
    }
    
    Write-ColorOutput "`n✓ Model installation complete!" "Green"
    Write-ColorOutput "  Text models: $(if ($hasTextModel) { '✓' } else { '✗' })" "Gray"
    Write-ColorOutput "  Vision models: $(if ($hasVisionModel) { '✓' } else { '✗' })" "Gray"
    Write-ColorOutput "  Embedding models: $(if ($hasEmbeddingModel) { '✓' } else { '✗' })" "Gray"
    
    return $true
}

# Main execution
function Main {
    Write-ColorOutput "`n🚀 StratoSort Ollama Setup for Windows`n" "Cyan" -Bold
    
    if ($Check) {
        $installed = Test-OllamaInstalled
        $running = Test-OllamaRunning
        $models = Get-InstalledModels
        
        Write-ColorOutput "$(if ($installed) { '✓' } else { '✗' }) Ollama installed: $installed" $(if ($installed) { 'Green' } else { 'Red' })
        Write-ColorOutput "$(if ($running) { '✓' } else { '⚠' }) Ollama running: $running" $(if ($running) { 'Green' } else { 'Yellow' })
        Write-ColorOutput "$(if ($models.Count -gt 0) { '✓' } else { '⚠' }) Models installed: $($models.Count)" $(if ($models.Count -gt 0) { 'Green' } else { 'Yellow' })
        
        exit $(if ($installed -and $models.Count -gt 0) { 0 } else { 1 })
    }
    
    # Step 1: Check/Install Ollama
    Write-ColorOutput "Step 1: Checking Ollama installation..." "Cyan"
    if (-not (Test-OllamaInstalled)) {
        Write-ColorOutput "✗ Ollama is not installed" "Red"
        
        if ($Auto) {
            if (Install-Ollama) {
                # Wait a moment for installation to complete
                Start-Sleep -Seconds 2
            } else {
                Write-ColorOutput "`nPlease install Ollama manually from: https://ollama.com/download/windows" "Yellow"
                exit 1
            }
        } else {
            Write-ColorOutput "`nOllama is required for AI features. Would you like to:" "Yellow"
            Write-ColorOutput "  1. Download and install automatically" "White"
            Write-ColorOutput "  2. Get manual installation instructions" "White"
            Write-ColorOutput "  3. Skip (AI features will be disabled)" "White"
            
            $choice = Read-Host "Enter choice (1-3)"
            
            switch ($choice) {
                "1" {
                    if (-not (Install-Ollama)) {
                        Write-ColorOutput "`nAutomatic installation failed. Please install manually from: https://ollama.com/download/windows" "Yellow"
                        exit 1
                    }
                }
                "2" {
                    Write-ColorOutput "`nManual Installation Instructions:" "Cyan"
                    Write-ColorOutput "  1. Download Ollama from: https://ollama.com/download/windows" "White"
                    Write-ColorOutput "  2. Run the installer (OllamaSetup.exe)" "White"
                    Write-ColorOutput "  3. After installation, run this script again" "White"
                    exit 1
                }
                "3" {
                    Write-ColorOutput "Skipping Ollama installation. AI features will be disabled." "Yellow"
                    exit 0
                }
                default {
                    Write-ColorOutput "Invalid choice. Exiting." "Red"
                    exit 1
                }
            }
        }
    }
    
    Write-ColorOutput "✓ Ollama is installed" "Green"
    
    # Step 2: Start Ollama Server
    Write-ColorOutput "`nStep 2: Starting Ollama server..." "Cyan"
    if (-not (Start-OllamaServer)) {
        Write-ColorOutput "⚠ Could not start Ollama server automatically" "Yellow"
        Write-ColorOutput "You may need to start it manually with: ollama serve" "Gray"
    }
    
    # Step 3: Install Essential Models
    Write-ColorOutput "`nStep 3: Installing essential models..." "Cyan"
    if (-not (Install-EssentialModels -MinimalSetup:$Minimal)) {
        Write-ColorOutput "`n✗ Setup incomplete - could not install required models" "Red"
        exit 1
    }
    
    # Step 4: Verify Setup
    Write-ColorOutput "`nStep 4: Verifying setup..." "Cyan"
    
    $finalCheck = @{
        Ollama = Test-OllamaInstalled
        Server = Test-OllamaRunning
        Models = Get-InstalledModels
    }
    
    if ($finalCheck.Ollama -and $finalCheck.Server -and $finalCheck.Models.Count -gt 0) {
        Write-ColorOutput "`n✅ Ollama setup complete!" "Green" -Bold
        Write-ColorOutput "`nStratoSort is ready to use AI-powered features:" "Gray"
        Write-ColorOutput "  • Intelligent file categorization" "Gray"
        Write-ColorOutput "  • Smart folder suggestions" "Gray"
        Write-ColorOutput "  • Semantic file matching" "Gray"
        
        if ($finalCheck.Models | Where-Object { $_ -match 'llava|moondream' }) {
            Write-ColorOutput "  • Image content analysis" "Gray"
        }
        
        exit 0
    } else {
        Write-ColorOutput "`n✗ Setup verification failed" "Red"
        if (-not $finalCheck.Ollama) { Write-ColorOutput "  ✗ Ollama not installed" "Red" }
        if (-not $finalCheck.Server) { Write-ColorOutput "  ✗ Ollama server not running" "Red" }
        if ($finalCheck.Models.Count -eq 0) { Write-ColorOutput "  ✗ No models installed" "Red" }
        exit 1
    }
}

# Run main function
Main
