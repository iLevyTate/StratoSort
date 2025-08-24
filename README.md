<p align="center">
  <img width="150" src="assets/stratosort-logo.png" alt="StratoSort Logo">
</p>

## AI-Powered Document Organization

Advanced file analysis and organization platform utilizing local AI (Artificial Intelligence) models with comprehensive privacy protection.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat)](https://opensource.org/licenses/MIT)
[![Coverage](https://img.shields.io/badge/Coverage-32.88%25-blue.svg?style=flat)](coverage/lcov-report/index.html)
[![Tests](https://img.shields.io/badge/Tests-400%20passed-green.svg?style=flat)](test/)
[![Electron](https://img.shields.io/badge/Electron-47848F?style=flat&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=nodedotjs&logoColor=white)](https://nodejs.org/)

---

## 📋 Navigation

| Section                                    | Description             |
| :----------------------------------------- | :---------------------- |
| [🚀 Download](#-download--quick-start)     | Get started immediately |
| [⚡ Features](#-core-features)             | Key capabilities        |
| [📖 How It Works](#-how-it-works)          | Workflow overview       |
| [🛠️ Setup](#-installation--development)    | Installation guide      |
| [🧪 Quality](#-testing--quality-assurance) | Testing & metrics       |
| [🔧 Help](#-troubleshooting-guide)         | Troubleshooting         |

> **Privacy:** All file processing happens locally on your machine with zero external data transmission.

---

## 🚀 Download & Quick Start

### 💻 Ready-to-Run Executables

StratoSort provides pre-built executables for all major platforms:

- **Windows**: Custom installer with modern UI (optimized for Windows systems)
- **macOS**: Native .dmg packages
- **Linux**: .deb and .rpm packages

**Download the latest release** from [GitHub Releases](https://github.com/your-repo/releases) - no installation required, just download and run!

---

## ⚡ Core Features

- **AI-Powered Analysis**: Intelligent document and image understanding.
- **Privacy-First**: All processing happens locally.
- **Batch Processing**: Process multiple files efficiently.
- **Undo/Redo**: Full operation history.
- **Cross-Platform**: Windows, macOS, and Linux support.
- **Safe Operations**: Conflict resolution and error handling.

---

## 🚀 Detailed Features

### 🧠 Smart AI Analysis

- **Local AI Processing**: Uses Ollama for complete privacy - no data leaves your machine.
- **Multi-format Support**: Analyzes documents (PDF, Word, Excel, text) and images (PNG, JPG, TIFF, etc.).
- **Intelligent Categorization**: AI suggests categories and new filenames based on content.
- **Smart Folders**: Create custom organization rules that files automatically match.

### 📁 Powerful Organization

- **Batch Processing**: Process multiple files efficiently.
- **Safe File Operations**: Conflict-safe moves with automatic name collision handling.
- **Preview Before Moving**: Review all changes before they happen.
- **Undo/Redo System**: Full operation history with one-click undo.

### 🎨 Clean User Experience

- **Modern Interface**: Professional, Apple-inspired design with clean aesthetics.
- **Real-time Progress**: Live feedback during analysis and organization.
- **Intuitive Workflow**: Four-phase process (Welcome → Setup → Discover → Organize → Complete).
- **Bulk Operations**: Select and edit multiple files simultaneously.

### 🔧 Flexible Configuration

- **User-configurable Models**: Choose your preferred Ollama models for text, vision, and embedding.
- **Custom Smart Folders**: Define your own organization categories and rules.
- **Adjustable Performance**: Control analysis concurrency and processing options.
- **Cross-platform**: Runs on Windows, macOS, and Linux.

---

## 📖 How It Works

| Phase              | Description                                    | Status       |
| :----------------- | :--------------------------------------------- | :----------- |
| **1. Setup** 🎛️    | Configure smart folders and AI models          | `Ready`      |
| **2. Discover** 🔍 | Select files and folders to analyze            | `Active`     |
| **3. Organize** 📂 | Review AI suggestions and batch-organize files | `Processing` |
| **4. Complete** ✅ | View results and access organized files        | `Complete`   |

> **Pro Tip**: The entire workflow is designed to be intuitive - even first-time users can organize their files in under 5 minutes\!

**Key Benefits:**

- 🧠 **AI-Powered**: Uses advanced local AI models for intelligent categorization.
- 🔄 **Interactive**: Review and modify suggestions before applying changes.
- 🛡️ **Safe**: Preview mode shows exactly what will happen before any files are moved.
- ↩️ **Reversible**: Full undo/redo system for peace of mind.

---

## 🛠️ Installation & Development

### Prerequisites

- **Node.js 18+** and **npm 8+**
- **Ollama** (optional but recommended for AI features)

### Quick Start

1.  **Clone and install dependencies:**
    ```bash
    git clone [repository-url]
    cd StratoSort
    npm install
    ```
2.  **Development mode:**
    ```bash
    npm run dev
    ```
3.  **Production build:**
    ```bash
    npm run build
    npm run dist
    ```

### Setting up Ollama (Recommended)

1.  **Install Ollama** from [ollama.ai](https://ollama.ai)
2.  **Start Ollama server:**
    ```bash
    ollama serve
    ```
3.  **Pull recommended models:**
    ```bash
    # For text analysis
    ollama pull llama3.2:latest
    # For image analysis
    ollama pull llava:latest
    # For semantic search
    ollama pull mxbai-embed-large
    ```
4.  **Or use the automated setup:**
    ```bash
    npm run setup:ollama
    ```
5.  **Configure in app**: Settings → AI Configuration → verify host and model names.

---

## ⚙️ Configuration

### Smart Folders

Create custom organization categories with:

- **Name**: Display name for the folder
- **Description**: What types of files belong here
- **Path**: Custom destination path (optional)
- **Keywords**: Terms that help identify matching files

### AI Models

Configure your preferred models in Settings:

- **Text Model**: For document analysis (default: `llama3.2:latest`)
- **Vision Model**: For image analysis (default: `llava:latest`)
- **Embedding Model**: For semantic matching (default: `mxbai-embed-large`)
- **Ollama Host**: Server URL (default: `http://127.0.0.1:11434`)

---

## 🧪 Testing & Quality Assurance

### Test Coverage

| Metric          | Coverage     | Status        |
| :-------------- | :----------- | :------------ |
| **Statements**  | `32.88%`     | Moderate      |
| **Functions**   | `32.65%`     | Moderate      |
| **Lines**       | `33.18%`     | Moderate      |
| **Test Suites** | `40 passed`  | Comprehensive |
| **Total Tests** | `400 passed` | All Passing   |

### Running Tests

```bash
npm test               # Run all tests
npm run test:unit        # Unit tests only
npm run test:integration     # Integration tests only
npm run test:coverage      # Generate coverage report
```

> **Test Focus:** Critical business logic and system reliability. Coverage prioritizes AI processing, file operations, and IPC communication.

---

## 📦 Building & Distribution

```bash
# Production build
npm run build

# Create installers for all platforms
npm run dist

# Platform-specific builds
npm run dist:win     # Windows
npm run dist:mac     # macOS
npm run dist:linux   # Linux
```

---

## ⌨️ Keyboard Shortcuts

### 🖥️ Productivity Boosters

| Action            | Windows/Linux                   | macOS                     | Description                                               |
| :---------------- | :------------------------------ | :------------------------ | :-------------------------------------------------------- |
| **Undo** ↩️       | `Ctrl + Z`                      | `⌘ + Z`                   | **Revert last action** - Works across all operations      |
| **Redo** ↪️       | `Ctrl + Shift + Z` / `Ctrl + Y` | `⌘ + Shift + Z` / `⌘ + Y` | **Redo undone action** - Multiple options for convenience |
| **Select All** 🎯 | `Ctrl + A`                      | `⌘ + A`                   | **Select all files** in current view                      |
| **Delete** 🗑️     | `Delete`                        | `⌫`                       | **Remove selected items** (with confirmation)             |
| **Search** 🔍     | `Ctrl + F`                      | `⌘ + F`                   | **Find files** by name or content                         |
| **Refresh** 🔄    | `F5`                            | `⌘ + R`                   | **Reload current view**                                   |

> 💡 **Power User Tip**: Combine shortcuts with drag-and-drop for lightning-fast organization\!

---

## 🔧 Troubleshooting Guide

### 🚨 Most Common Issues

#### 🔗 Ollama Connection Issues

**Symptoms:**

- ❌ "Cannot connect to Ollama" error
- ⚠️ AI analysis fails to start
- 🔄 Models not loading

**Solutions:**

- [ ] **Start Ollama server**: `ollama serve`
- [ ] **Check host URL** in Settings (default: `http://127.0.0.1:11434`)
- [ ] **Verify models installed**: `ollama list`
- [ ] **Test connection**: `ollama ps`

> **Quick Test**: Open terminal and run `curl http://127.0.0.1:11434/api/tags` - should return JSON response

#### 📁 File Organization Issues

**Symptoms:**

- ❌ Files won't move or copy
- ⚠️ "Access denied" errors
- 🔄 Operations appear to hang

**Solutions:**

- [ ] **Check write permissions** on destination folders
- [ ] **Close open applications** that might lock files
- [ ] **Verify file paths** don't contain invalid characters (`<>:"|?*`)
- [ ] **Ensure source files** exist and aren't corrupted

> **Pro Tip**: Use `chkdsk` on Windows or `fsck` on Linux/Mac to check disk health

#### ⚡ Performance Issues

**Symptoms:**

- 🐌 Analysis takes too long
- 💾 High memory/CPU usage
- 🔄 Application becomes unresponsive

**Solutions:**

- [ ] **Reduce concurrent analysis limit** in Settings (try 2-4)
- [ ] **Use smaller/faster models** (e.g., `llama3.2:1b` instead of `llama3.2:latest`)
- [ ] **Close unnecessary applications** during large operations
- [ ] **Ensure sufficient RAM** (8GB+ recommended)
- [ ] **Check available disk space** (2GB+ free recommended)

> **Performance Tip**: For better performance, process files in reasonable batches.

---

## Architecture

- **Frontend**: React with modern hooks and context
- **Backend**: Electron main process with Node.js
- **AI Integration**: Local Ollama API calls
- **Storage**: JSON-based vector store
- **IPC**: Secure inter-process communication

---

## Contributing

We welcome contributions\! See our contributing guidelines for code style, testing requirements, and pull request process.

---

## License & Links

**License**: MIT License - see LICENSE file.

**Key Links**:

- [Ollama](https://ollama.ai) - AI model integration
- [Electron](https://electronjs.org) - Desktop framework
- [React](https://reactjs.org) - UI framework

---

> StratoSort - AI-Powered File Organization
