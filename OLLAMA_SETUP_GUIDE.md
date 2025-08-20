# Ollama Setup & Integration Guide

## Overview

StratoSort uses Ollama for AI-powered features including intelligent file categorization, smart folder suggestions, and semantic search. This guide explains how Ollama is automatically set up and managed.

## Automatic Setup

### During Installation

When you install StratoSort or run `npm install`, the system automatically:

1. **Checks for Ollama** - Verifies if Ollama is installed on your system
2. **Starts Ollama Server** - Launches the Ollama service if not running
3. **Installs Essential Models** - Downloads at least one AI model for basic functionality
4. **Verifies Setup** - Confirms everything is working correctly

### During Build

The build process (`npm run build`) includes:

- Ollama setup check
- Warning if Ollama is not configured
- Inclusion of setup scripts in the distribution

### On Application Start

When StratoSort launches:

1. Checks if Ollama is installed
2. Attempts to start Ollama server if not running
3. Verifies available models
4. Falls back gracefully if Ollama is unavailable

## Manual Setup Commands

### Check Ollama Status

```bash
npm run setup:ollama:check
```

Shows current Ollama installation status, running state, and installed models.

### Full Setup

```bash
npm run setup:ollama
```

Runs the complete Ollama setup process:

- Installs Ollama if not present (Linux only, others get instructions)
- Starts the Ollama server
- Downloads essential models
- Verifies the installation

### Minimal Setup

```bash
node setup-ollama.js --minimal
```

Installs only the minimum required models (one text model and one vision model) for basic functionality.

## Essential Models

### Text Models (Required - at least 1)

- `llama3.2:latest` - Latest and most capable (recommended)
- `llama3.1:latest` - Previous stable version
- `llama3:latest` - Older but reliable
- `gemma2:2b` - Lightweight alternative
- `phi3:mini` - Minimal resource usage

### Vision Models (Required - at least 1)

- `llava:latest` - For image content analysis (recommended)
- `bakllava:latest` - Alternative vision model
- `moondream:latest` - Lightweight vision model

### Embedding Models (Optional but Recommended)

- `mxbai-embed-large:latest` - For semantic search
- `nomic-embed-text:latest` - Alternative embedding model

## Platform-Specific Setup

### Windows

#### Automatic (PowerShell)

```powershell
.\scripts\setup-ollama-windows.ps1 -Auto
```

#### Manual

1. Download from: https://ollama.com/download/windows
2. Run OllamaSetup.exe
3. Run `npm run setup:ollama` after installation

### macOS

#### Using Homebrew

```bash
brew install ollama
npm run setup:ollama
```

#### Manual

1. Download from: https://ollama.com/download/mac
2. Install Ollama.app
3. Run `npm run setup:ollama`

### Linux

#### Automatic

```bash
npm run setup:ollama
```

This will automatically download and install Ollama using the official script.

#### Manual

```bash
curl -fsSL https://ollama.com/install.sh | sh
npm run setup:ollama
```

## How It Works

### Setup Script (`setup-ollama.js`)

The main setup script provides:

- Cross-platform Ollama detection
- Automatic server startup
- Model installation with fallbacks
- Progress indication
- Error handling and recovery

Key functions:

- `isOllamaInstalled()` - Checks if Ollama is available
- `isOllamaRunning()` - Verifies server status
- `startOllamaServer()` - Launches Ollama service
- `installEssentialModels()` - Downloads required AI models

### Application Integration

In `src/main/simple-main.js`:

```javascript
async function ensureOllamaRunning() {
  // Uses enhanced setup script if available
  // Falls back to simple check if not
  // Continues without Ollama if unavailable
}
```

### Build Integration

- `package.json` includes `postinstall` hook for automatic setup
- `electron-builder.json` includes setup script in distribution
- Build scripts check Ollama status and warn if not configured

## Fallback Behavior

If Ollama is not available or fails:

1. **File Analysis** - Falls back to basic file type categorization
2. **Smart Folders** - Uses keyword matching instead of semantic search
3. **Suggestions** - Provides rule-based suggestions without AI
4. **Image Analysis** - Skips content analysis, uses file metadata only

The application remains fully functional but with reduced intelligence.

## Troubleshooting

### Ollama Not Found

```bash
# Verify installation
ollama --version

# Install if missing
npm run setup:ollama
```

### Server Won't Start

```bash
# Start manually
ollama serve

# Check if port is in use
netstat -an | grep 11434
```

### Models Not Installing

```bash
# Install manually
ollama pull llama3.2:latest
ollama pull llava:latest
```

### Permission Issues (Linux/Mac)

```bash
# Run with sudo if needed
sudo npm run setup:ollama
```

## Environment Variables

- `OLLAMA_HOST` - Custom Ollama server URL (default: http://127.0.0.1:11434)
- `MINIMAL_SETUP` - Install only essential models
- `CI` - Skip Ollama setup in CI environments

## Testing Setup

```bash
# Check everything is working
npm run setup:ollama:check

# Test in development
npm run dev

# Run full test suite
npm test
```

## Security & Privacy

- **Local Processing** - All AI processing happens on your machine
- **No Internet Required** - Models run offline after initial download
- **No Data Sharing** - Your files never leave your computer
- **Model Storage** - Models are stored in Ollama's data directory
  - Windows: `%USERPROFILE%\.ollama`
  - macOS: `~/.ollama`
  - Linux: `~/.ollama`

## Resource Requirements

### Minimum

- 6GB RAM (for text + vision models)
- 6GB disk space (text model + vision model)
- Any modern CPU

### Recommended

- 8GB+ RAM
- 12GB+ disk space
- GPU with 4GB+ VRAM (optional, for faster processing)

### Model Sizes

- `phi3:mini` - ~2GB (text)
- `gemma2:2b` - ~2GB (text)
- `llama3:latest` - ~4GB (text)
- `llama3.2:latest` - ~4GB (text)
- `llava:latest` - ~4GB (vision)
- `moondream:latest` - ~2GB (vision)
- `bakllava:latest` - ~4GB (vision)

## Advanced Configuration

### Custom Model Selection

Edit `~/.stratosort-ollama-setup` to configure preferred models:

```json
{
  "ollamaHost": "http://127.0.0.1:11434",
  "preferredModels": {
    "text": "llama3.2:latest",
    "vision": "llava:latest",
    "embedding": "mxbai-embed-large:latest"
  }
}
```

### Remote Ollama Server

Set the `OLLAMA_HOST` environment variable:

```bash
export OLLAMA_HOST=http://your-server:11434
npm run setup:ollama:check
```

## Support

If you encounter issues:

1. Check this guide's troubleshooting section
2. Run `npm run setup:ollama:check` for diagnostics
3. Check Ollama logs: `ollama logs`
4. Open an issue on GitHub with setup check output
