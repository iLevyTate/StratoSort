# StratoSort

<div align="center">
  <img src="assets/stratosort-logo.png" alt="StratoSort Logo" width="120" height="120" style="border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"/>

  <h1 style="font-size: 2.2em; margin: 0.5em 0; color: #333;">StratoSort</h1>

  <p style="font-size: 1.1em; color: #555; margin: 0.5em 0; font-weight: 500;">
    AI-Powered Document Organization
  </p>

  <p style="font-size: 1em; margin: 1em 0; color: #666; line-height: 1.4;">
    Advanced file analysis and organization platform utilizing local <abbr title="Artificial Intelligence">AI</abbr> models with comprehensive privacy protection
  </p>

  <div style="margin: 1.5em 0;">
    [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat)](https://opensource.org/licenses/MIT)
    [![Coverage](https://img.shields.io/badge/Coverage-32.88%25-blue.svg?style=flat)](coverage/lcov-report/index.html)
    [![Tests](https://img.shields.io/badge/Tests-400%20passed-green.svg?style=flat)](test/)
    [![Electron](https://img.shields.io/badge/Electron-47848F?style=flat&logo=electron&logoColor=white)](https://www.electronjs.org/)
    [![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)](https://reactjs.org/)
    [![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
  </div>
</div>

---

## 📋 Navigation

| Section                                   | Description             |
| ----------------------------------------- | ----------------------- |
| [🚀 Download](#-download--quick-start)    | Get started immediately |
| [⚡ Features](#core-capabilities)         | Key capabilities        |
| [📖 How It Works](#-how-it-works)         | Workflow overview       |
| [🛠️ Setup](#-installation--development)   | Installation guide      |
| [🧪 Quality](#testing--quality-assurance) | Testing & metrics       |
| [🔧 Help](#-troubleshooting-guide)        | Troubleshooting         |

<div style="text-align: center; margin: 1em 0;">
  <a href="#-download--quick-start" style="margin: 0 1em; color: #007acc; text-decoration: none;">📥 Start</a>
  <a href="#core-capabilities" style="margin: 0 1em; color: #007acc; text-decoration: none;">⚡ Features</a>
  <a href="#-troubleshooting-guide" style="margin: 0 1em; color: #007acc; text-decoration: none;">🔧 Help</a>
</div>

---

<div style="background: #f8f9fa; border-left: 4px solid #007acc; padding: 1em; margin: 1em 0;">
  <strong>Privacy:</strong> All file processing happens locally on your machine with zero external data transmission.
</div>

<div style="text-align: center; margin: 2em 0; border-top: 1px solid #e0e0e0; padding-top: 1em;">
  <a href="#table-of-contents" style="color: #007acc; text-decoration: none; font-size: 0.9em;">↑ Back to Table of Contents</a>
</div>

## 🚀 Download & Quick Start

### 💻 Ready-to-Run Executables

StratoSort provides pre-built executables for all major platforms:

- **Windows**: Custom installer with modern UI (optimized for Windows systems)
- **macOS**: Native .dmg packages
- **Linux**: .deb and .rpm packages

**Download the latest release** from [GitHub Releases](https://github.com/your-repo/releases) - no installation required, just download and run!

## Core Features

<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1em; margin: 1.5em 0;">
  <div style="border-left: 3px solid #4CAF50; padding-left: 1em;">
    <strong>AI-Powered Analysis</strong><br>
    <span style="color: #666; font-size: 0.9em;">Intelligent document and image understanding</span>
  </div>
  <div style="border-left: 3px solid #2196F3; padding-left: 1em;">
    <strong>Privacy-First</strong><br>
    <span style="color: #666; font-size: 0.9em;">All processing happens locally</span>
  </div>
  <div style="border-left: 3px solid #FF9800; padding-left: 1em;">
    <strong>Batch Processing</strong><br>
    <span style="color: #666; font-size: 0.9em;">Process multiple files efficiently</span>
  </div>
  <div style="border-left: 3px solid #9C27B0; padding-left: 1em;">
    <strong>Undo/Redo</strong><br>
    <span style="color: #666; font-size: 0.9em;">Full operation history</span>
  </div>
  <div style="border-left: 3px solid #607D8B; padding-left: 1em;">
    <strong>Cross-Platform</strong><br>
    <span style="color: #666; font-size: 0.9em;">Windows, macOS, and Linux support</span>
  </div>
  <div style="border-left: 3px solid #795548; padding-left: 1em;">
    <strong>Safe Operations</strong><br>
    <span style="color: #666; font-size: 0.9em;">Conflict resolution and error handling</span>
  </div>
</div>

<div style="text-align: center; margin: 1em 0; border-top: 1px solid #e0e0e0; padding-top: 1em;">
  <a href="#navigation" style="color: #007acc; text-decoration: none; font-size: 0.9em;">↑ Back to Navigation</a>
</div>

## 📊 Repository Visualization

For developers interested in the codebase structure, this repository uses GitHub's repo visualizer to provide an interactive overview:

**GitHub Workflow Configuration:**

```yaml
- name: Repository Visualizer
  uses: githubocto/repo-visualizer@0.9.1
```

The visualizer runs automatically on pull requests and creates SVG maps of the code structure, helpful for understanding the project architecture.

<details open>
<summary><strong>🚀 Core Features</strong></summary>

### 🧠 Smart AI Analysis

- **Local AI Processing**: Uses Ollama for complete privacy - no data leaves your machine
- **Multi-format Support**: Analyzes documents (PDF, Word, Excel, text) and images (PNG, JPG, TIFF, etc.)
- **Intelligent Categorization**: AI suggests categories and new filenames based on content
- **Smart Folders**: Create custom organization rules that files automatically match

### 📁 Powerful Organization

- **Batch Processing**: Process multiple files efficiently
- **Safe File Operations**: Conflict-safe moves with automatic name collision handling
- **Preview Before Moving**: Review all changes before they happen
- **Undo/Redo System**: Full operation history with one-click undo

### 🎨 Clean User Experience

- **Modern Interface**: Professional, Apple-inspired design with clean aesthetics
- **Real-time Progress**: Live feedback during analysis and organization
- **Intuitive Workflow**: Four-phase process (Welcome → Setup → Discover → Organize → Complete)
- **Bulk Operations**: Select and edit multiple files simultaneously

### 🔧 Flexible Configuration

- **User-configurable Models**: Choose your preferred Ollama models for text, vision, and embedding
- **Custom Smart Folders**: Define your own organization categories and rules
- **Adjustable Performance**: Control analysis concurrency and processing options
- **Cross-platform**: Runs on Windows, macOS, and Linux

</details>

<details>
<summary><strong>📖 How It Works</strong></summary>

<div align="center">

| Phase              | Description                                    | Status       |
| ------------------ | ---------------------------------------------- | ------------ |
| **1. Setup** 🎛️    | Configure smart folders and AI models          | `Ready`      |
| **2. Discover** 🔍 | Select files and folders to analyze            | `Active`     |
| **3. Organize** 📂 | Review AI suggestions and batch-organize files | `Processing` |
| **4. Complete** ✅ | View results and access organized files        | `Complete`   |

</div>

> **Pro Tip**: The entire workflow is designed to be intuitive - even first-time users can organize their files in under 5 minutes!

**Key Benefits:**

- 🧠 **AI-Powered**: Uses advanced local AI models for intelligent categorization
- 🔄 **Interactive**: Review and modify suggestions before applying changes
- 🛡️ **Safe**: Preview mode shows exactly what will happen before any files are moved
- ↩️ **Reversible**: Full undo/redo system for peace of mind

</details>

<details>
<summary><strong>🛠️ Installation & Development</strong></summary>

### Prerequisites

- **Node.js 18+** and **npm 8+**
- **Ollama** (optional but recommended for AI features)

### Quick Start

1. **Clone and install dependencies:**

```bash
git clone [repository-url]
cd StratoSort
npm install
```

2. **Development mode:**

```bash
npm run dev
```

3. **Production build:**

```bash
npm run build
npm run dist
```

### Setting up Ollama (Recommended)

1. **Install Ollama** from [ollama.ai](https://ollama.ai)

2. **Start Ollama server:**

```bash
ollama serve
```

3. **Pull recommended models:**

```bash
# For text analysis
ollama pull llama3.2:latest

# For image analysis
ollama pull llava:latest

# For semantic search
ollama pull mxbai-embed-large
```

4. **Or use the automated setup:**

```bash
npm run setup:ollama
```

5. **Configure in app**: Settings → AI Configuration → verify host and model names

</details>

<details>
<summary><strong>⚙️ Configuration</strong></summary>

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

</details>

<details>
<summary><strong>Testing & Quality Assurance</strong></summary>

### Test Coverage

<div style="margin: 1.5em 0;">
  <div style="border: 1px solid #e0e0e0; border-radius: 8px; padding: 1.5em; background: #fafafa;">

| Metric         | Coverage        | Status       |
| -------------- | --------------- | ------------ | ------------- |
| **Statements** | `32.88%`        | Moderate     |
| **Functions**  | `32.65%`        | Moderate     |
| **Lines**      | `33.18%`        | Moderate     |
|                | **Test Suites** | `40 passed`  | Comprehensive |
|                | **Total Tests** | `400 passed` | All Passing   |

  </div>
</div>

### Running Tests

```bash
npm test                    # Run all tests
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only
npm run test:coverage      # Generate coverage report
```

<div style="margin: 1.5em 0; padding: 1em; background: #e8f5e8; border-left: 4px solid #4CAF50; border-radius: 4px;">
  <strong>Test Focus:</strong> Critical business logic and system reliability. Coverage prioritizes AI processing, file operations, and IPC communication.
</div>

<div style="text-align: center; margin: 1em 0; border-top: 1px solid #e0e0e0; padding-top: 1em;">
  <a href="#navigation" style="color: #007acc; text-decoration: none; font-size: 0.9em;">↑ Back to Navigation</a>
</div>

</details>

<details>
<summary><strong>📦 Building & Distribution</strong></summary>

```bash
# Production build
npm run build

# Create installers for all platforms
npm run dist

# Platform-specific builds
npm run dist:win    # Windows
npm run dist:mac    # macOS
npm run dist:linux  # Linux
```

<div style="text-align: center; margin: 1em 0; border-top: 1px solid #e0e0e0; padding-top: 1em;">
  <a href="#navigation" style="color: #007acc; text-decoration: none; font-size: 0.9em;">↑ Back to Navigation</a>
</div>

</details>

<details>
<summary><strong>⌨️ Keyboard Shortcuts</strong></summary>

<div align="center">

### 🖥️ Productivity Boosters

| Action            | Windows/Linux                    | macOS                      | Description                                               |
| ----------------- | -------------------------------- | -------------------------- | --------------------------------------------------------- |
| **Undo** ↩️       | `Ctrl + Z`                       | `⌘ + Z`                    | **Revert last action** - Works across all operations      |
| **Redo** ↪️       | `Ctrl + Shift + Z`<br>`Ctrl + Y` | `⌘ + Shift + Z`<br>`⌘ + Y` | **Redo undone action** - Multiple options for convenience |
| **Select All** 🎯 | `Ctrl + A`                       | `⌘ + A`                    | **Select all files** in current view                      |
| **Delete** 🗑️     | `Delete`                         | `⌫`                        | **Remove selected items** (with confirmation)             |
| **Search** 🔍     | `Ctrl + F`                       | `⌘ + F`                    | **Find files** by name or content                         |
| **Refresh** 🔄    | `F5`                             | `⌘ + R`                    | **Reload current view**                                   |

</div>

> 💡 **Power User Tip**: Combine shortcuts with drag-and-drop for lightning-fast organization!

</details>

<details>
<summary><strong>🔧 Troubleshooting Guide</strong></summary>

<div align="center">
  <h3>🛠️ Quick Fix Solutions</h3>
</div>

### 🚨 **Most Common Issues**

<details style="border: 1px solid #e1e4e8; border-radius: 6px; padding: 12px; margin: 8px 0;">
<summary style="cursor: pointer; font-weight: bold;">🔗 Ollama Connection Issues</summary>

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

</details>

<details style="border: 1px solid #e1e4e8; border-radius: 6px; padding: 12px; margin: 8px 0;">
<summary style="cursor: pointer; font-weight: bold;">📁 File Organization Issues</summary>

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

</details>

<details style="border: 1px solid #e1e4e8; border-radius: 6px; padding: 12px; margin: 8px 0;">
<summary style="cursor: pointer; font-weight: bold;">⚡ Performance Issues</summary>

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

> **Performance Tip**: For better performance, process files in reasonable batches

</details>

### 📞 **Still Need Help?**

<div align="center">

| Contact Method       | Response Time | Best For                       |
| -------------------- | ------------- | ------------------------------ |
| 📧 **Email Support** | 24-48 hours   | Complex technical issues       |
| 💬 **GitHub Issues** | 12-24 hours   | Bug reports & feature requests |
| 📖 **Documentation** | Immediate     | Quick answers & tutorials      |

</div>

<div style="text-align: center; margin: 1em 0; border-top: 1px solid #e0e0e0; padding-top: 1em;">
  <a href="#navigation" style="color: #007acc; text-decoration: none; font-size: 0.9em;">↑ Back to Navigation</a>
</div>

</details>

<details>
<summary><strong>Architecture</strong></summary>

- **Frontend**: React with modern hooks and context
- **Backend**: Electron main process with Node.js
- **AI Integration**: Local Ollama API calls
- **Storage**: JSON-based vector store
- **IPC**: Secure inter-process communication

</details>

<details>
<summary><strong>Contributing</strong></summary>

We welcome contributions! See our contributing guidelines for code style, testing requirements, and pull request process.

</details>

<details>
<summary><strong>License & Links</strong></summary>

**License**: MIT License - see [LICENSE](LICENSE) file.

**Key Links**:

- [Ollama](https://ollama.ai) - AI model integration
- [Electron](https://electronjs.org) - Desktop framework
- [React](https://reactjs.org) - UI framework

</details>

---

<div align="center" style="margin: 3em 0;">

## Getting Started

<div style="border: 1px solid #e0e0e0; border-radius: 8px; padding: 2em; margin: 2em 0; background: #fafafa;">
  <h3 style="margin: 0 0 0.5em 0; color: #333;">Ready to Streamline Your File Organization?</h3>
  <p style="margin: 0 0 1em 0; color: #666; line-height: 1.4;">
    Download StratoSort today and experience intelligent file management with enterprise-grade privacy protection.
  </p>

  <div style="display: flex; justify-content: center; gap: 2em; margin: 1.5em 0;">
    <div style="text-align: center;">
      <div style="font-size: 2em; color: #4CAF50;">🧠</div>
      <div style="font-weight: bold; color: #333;">AI-Powered</div>
      <div style="color: #666; font-size: 0.9em;">Intelligent Analysis</div>
    </div>
    <div style="text-align: center;">
      <div style="font-size: 2em; color: #2196F3;">🔒</div>
      <div style="font-weight: bold; color: #333;">Privacy-First</div>
      <div style="color: #666; font-size: 0.9em;">Local Processing</div>
    </div>
    <div style="text-align: center;">
      <div style="font-size: 2em; color: #FF9800;">⚡</div>
      <div style="font-weight: bold; color: #333;">High Performance</div>
      <div style="color: #666; font-size: 0.9em;">Efficient Operations</div>
    </div>
  </div>
</div>

### Community & Support

<div style="display: flex; justify-content: center; gap: 1em; margin: 2em 0;">
  <a href="https://github.com/your-repo/stratosort">
    <img src="https://img.shields.io/github/stars/your-repo/stratosort?style=social" alt="GitHub stars">
  </a>
  <a href="https://github.com/your-repo/stratosort/fork">
    <img src="https://img.shields.io/github/forks/your-repo/stratosort?style=social" alt="GitHub forks">
  </a>
</div>

---

<div align="center" style="margin: 2em 0;">
  <div style="border: 1px solid #e0e0e0; border-radius: 8px; padding: 1.5em; background: #f9f9f9; display: inline-block;">
    <div style="font-size: 1.2em; margin-bottom: 0.5em;">🏢</div>
    <div style="color: #333; font-weight: bold;">StratoSort</div>
    <div style="color: #666; font-size: 0.9em;">Enterprise File Organization Platform</div>
    <div style="color: #666; font-size: 0.9em; margin-top: 0.5em;">Built with Privacy & Performance in Mind</div>
  </div>
</div>

<div style="text-align: center; color: #999; font-size: 0.9em; margin: 2em 0;">
  <details style="display: inline-block;">
    <summary style="cursor: pointer; color: #666;">Version Information</summary>
    <div style="margin-top: 1em; text-align: left; display: inline-block;">
      <strong>Current Release:</strong> v1.0.0<br>
      <strong>Platform Support:</strong> Windows, macOS, Linux<br>
      <strong>Architecture:</strong> Local AI Processing<br>
      <strong>License:</strong> MIT Open Source
    </div>
  </details>
</div>

---

<div style="text-align: center; color: #666; font-size: 0.9em; margin: 1em 0;">
  <p><strong>StratoSort</strong> - AI-Powered File Organization</p>
</div>

</div>
