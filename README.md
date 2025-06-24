# 🎯 StratoSort - AI-Powered Document Organization

<div align="center">
  <img src="assets/stratosort-logo.png" alt="StratoSort Logo" width="128" height="128">
  
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  [![Electron](https://img.shields.io/badge/Electron-26.2.1-blue.svg)](https://www.electronjs.org/)
  [![React](https://img.shields.io/badge/React-18.2.0-blue.svg)](https://reactjs.org/)
  [![Ollama](https://img.shields.io/badge/Ollama-Compatible-green.svg)](https://ollama.ai/)
  [![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4.3-blue.svg)](https://tailwindcss.com/)
  [![Build Status](https://img.shields.io/badge/Build-Passing-brightgreen.svg)](https://github.com/stratosort/stratosort)
</div>

> **Built upon the foundation of [LlamaFS](https://github.com/iyaja/llama-fs)** - A revolutionary file organization system that inspired StratoSort's core vision.

---

## 📋 Table of Contents

- [Overview](#overview)
- [What is Ollama?](#what-is-ollama)
- [How StratoSort Differs from LlamaFS](#how-stratosort-differs-from-llamafs)
- [Features](#features)
- [Quick Start](#quick-start)
- [Installation & Setup](#installation--setup)
- [Architecture](#architecture)
- [Development](#development)
- [Distribution](#distribution)
- [Testing](#testing)
- [Contributing](#contributing)
- [Troubleshooting](#troubleshooting)
- [Acknowledgments](#acknowledgments)
- [License](#license)

---

## 🚀 Overview

**StratoSort** is a privacy-focused, AI-powered document organization tool that runs entirely on your local machine. Inspired by [LlamaFS](https://github.com/iyaja/llama-fs), StratoSort takes the concept of AI-driven file organization to the next level with a modern desktop application, advanced UI/UX, and enterprise-grade features.

Using **Ollama** for local AI processing, StratoSort intelligently categorizes and organizes your documents without sending any data to external servers, ensuring complete privacy and control over your files.

### 🔑 Key Benefits

- **🔒 100% Privacy**: All AI processing happens locally on your machine
- **🤖 Smart Organization**: Advanced AI content analysis and categorization
- **🎨 Modern Interface**: Beautiful, accessible desktop app with Apple-inspired design
- **⚡ Batch Processing**: Handle thousands of files simultaneously
- **🔄 Undo/Redo System**: Full operation history with rollback capabilities
- **📊 Performance Monitoring**: Real-time system metrics and optimization

---

## ✨ Features

### Core Functionality
- **Smart Document Analysis**: AI-powered content understanding for 91+ file types
- **Automatic Organization**: Intelligent folder creation and file placement
- **Batch Processing**: Handle multiple documents simultaneously with concurrent analysis
- **Custom Naming Conventions**: Flexible file naming patterns with 6 built-in templates
- **Multi-format Support**: PDF, Office documents, images, audio, archives, and more
- **System-wide Scanning**: Automatic discovery of files across your system
- **Smart Folder Management**: AI-generated categories with content-based organization

### Advanced Features
- **Atomic File Operations**: Transaction-based file operations with rollback support
- **Analysis History**: Comprehensive tracking and search of all processed files
- **Performance Optimization**: Intelligent resource management and memory optimization
- **Error Recovery**: Robust error handling with detailed logging
- **Accessibility**: Full screen reader support and keyboard navigation
- **Cross-platform Compatibility**: Windows, macOS, and Linux support

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18.0.0 or higher
- **npm** 8.0.0 or higher
- **Ollama** (required for AI features)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/stratosort/stratosort.git
   cd stratosort
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Install and setup Ollama**
   ```bash
   # Download and install Ollama from https://ollama.ai
   # Or using package managers:
   
   # Windows (using winget)
   winget install Ollama.Ollama
   
   # macOS (using Homebrew)
   brew install ollama
   
   # Linux
   curl -fsSL https://ollama.ai/install.sh | sh
   ```

4. **Start Ollama and install models**
   ```bash
   # Start Ollama service
   ollama serve
   
   # Install required models (in a new terminal)
   ollama pull gemma3:4b    # For text analysis (4GB)
   ollama pull llava:latest # For image analysis (4GB)
   ```

5. **Start the application**
   ```bash
   npm start
   ```

## 🏗️ Architecture

```
stratosort/
├── src/                          # Application source
│   ├── main/                     # Main process (backend)
│   │   ├── analysis/             # AI document analysis
│   │   ├── services/             # Core services
│   │   │   ├── AiService.js             # Ollama integration
│   │   │   ├── FileOperations.js       # File system operations
│   │   │   ├── SmartFolderService.js   # Smart folder management
│   │   │   ├── AnalysisHistoryService.js # Processing history
│   │   │   ├── UndoRedoService.js       # Operation history
│   │   │   └── ServiceIntegration.js   # Unified service layer
│   │   ├── errors/               # Custom error classes
│   │   └── simple-main.js        # Main process entry
│   ├── renderer/                 # Renderer process (frontend)
│   │   ├── components/           # React components
│   │   ├── phases/               # Workflow phases
│   │   │   ├── WelcomePhase.jsx         # Introduction
│   │   │   ├── SetupPhase.jsx           # Configuration
│   │   │   ├── DiscoverPhase.jsx        # File discovery
│   │   │   ├── OrganizePhase.jsx        # File organization
│   │   │   └── CompletePhase.jsx        # Results summary
│   │   ├── contexts/             # React contexts
│   │   ├── hooks/                # Custom React hooks
│   │   └── styles/               # CSS and styling
│   ├── preload/                  # Preload scripts
│   │   └── preload.js            # IPC bridge
│   └── shared/                   # Shared utilities
│       ├── constants.js          # Application constants
│       ├── atomicFileOperations.js # Transaction support
│       └── logger.js             # Logging system
├── assets/                       # Icons and resources
├── test/                         # Test suites
├── dist/                         # Built application
├── release/                      # Distribution packages
└── electron-builder.json         # Distribution configuration
```

### Workflow Phases

StratoSort uses a streamlined 5-phase workflow:

1. **WELCOME** - Introduction and quick start
2. **SETUP** - Configure AI models and smart folders
3. **DISCOVER** - File discovery with automatic AI analysis
4. **ORGANIZE** - Review suggestions and execute operations
5. **COMPLETE** - View results and summary

---

## 💻 Development

### Available Scripts

```bash
# Development
npm run dev              # Start development server
npm run start            # Start application with verification
npm run start:dev        # Development mode with logging
npm run start:debug      # Debug mode with inspector

# Building
npm run build            # Build for production
npm run build:dev        # Development build
npm run package          # Create distributable (current platform)

# Distribution
npm run dist             # Build installer for current platform
npm run dist:win         # Build Windows installer (.exe, .msi)
npm run dist:mac         # Build macOS installer (.dmg)
npm run dist:linux       # Build Linux installer (.AppImage, .deb)
npm run dist:all         # Build for all platforms

# Testing
npm test                 # Run all tests
npm run test:run         # Run tests with reporting
npm run test:full        # Full test suite with coverage
npm run test:quick       # Quick test run (bail on first failure)

# Utilities
npm run verify           # Verify setup and dependencies
npm run setup:ollama     # Setup Ollama and models
npm run lint             # Run ESLint
npm run lint:fix         # Fix ESLint issues
```

### Project Structure Details

- **Main Process**: Handles file operations, AI processing, and system integration
- **Renderer Process**: React-based UI with modern component architecture
- **Services**: Modular services for different functionalities
  - `AiService`: Ollama integration and AI processing
  - `FileOperations`: File system operations with atomic transactions
  - `SmartFolderService`: Intelligent folder management
  - `AnalysisHistoryService`: Document tracking and search
  - `UndoRedoService`: Action history management
  - `ServiceIntegration`: Unified service interface

---

## 📦 Distribution

StratoSort can be packaged for distribution on Windows, macOS, and Linux.

### Build Requirements

- All dependencies installed (`npm install`)
- Ollama models available (optional for end users)
- Valid code signing certificates (for production releases)

### Build Process

The build process creates:
1. **Webpack bundles** - Optimized JavaScript bundles
2. **Electron packages** - Platform-specific applications
3. **Installers** - Ready-to-distribute installation packages

### Platform Support

| Platform | Formats | Architecture |
|----------|---------|-------------|
| Windows  | NSIS (.exe), Portable | x64, ia32 |
| macOS    | DMG | x64, ARM64 |
| Linux    | AppImage, DEB | x64 |

---

## 🧪 Testing

The project includes comprehensive test coverage:

- **Unit Tests**: Component and service testing (292 passing tests)
- **Integration Tests**: End-to-end workflow testing
- **Performance Tests**: Memory and processing benchmarks
- **UI/UX Tests**: Component integration and accessibility

### Test Categories

```bash
npm run test:upload      # File upload functionality
npm run test:ai          # AI processing pipeline
npm run test:performance # Performance & resource tests
npm run test:functionality # View full test guide
```

### Test Coverage

- File upload & validation (drag-drop, size limits)
- Ollama AI integration (document analysis, categorization)
- Document lifecycle (state management, concurrency)
- UI behavior (progress tracking, empty states)
- Configuration (custom settings, folder naming)
- Error handling (corrupted files, network issues)
- Performance (memory usage, processing speed)

---

## 🔧 Troubleshooting

### Common Issues

**Application won't start**
- Verify Node.js version (18.0.0+)
- Check if ports 3000/3001 are available
- Run `npm run verify` to check setup

**Ollama connection errors**
- Ensure Ollama is running (`ollama serve`)
- Check if models are installed (`ollama list`)
- Verify host configuration in settings

**Build failures**
- Clean node_modules and reinstall dependencies
- Check for missing files in dist/ directory
- Verify webpack configuration

**Performance issues**
- Reduce concurrent analysis threads in settings
- Monitor system resources during processing
- Check available disk space for temporary files

### Debug Mode

Start in debug mode for detailed logging:
```bash
npm run start:debug
```

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](docs/CONTRIBUTING.md) for details.

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes with tests
4. Commit your changes (`git commit -m 'Add amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

### Code Standards

- Follow existing code style and patterns
- Add tests for new functionality
- Update documentation as needed
- Ensure all tests pass before submitting

---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

### **What this means:**
- ✅ **Commercial Use** - Use StratoSort in commercial projects
- ✅ **Modification** - Modify and customize the code
- ✅ **Distribution** - Share and redistribute freely
- ✅ **Private Use** - Use for personal projects
- ❗ **No Warranty** - Software provided as-is
- ❗ **Attribution** - Include copyright notice in distributions

---

<div align="center">

**Made with ❤️ by the StratoSort Team**

*Inspired by [LlamaFS](https://github.com/iyaja/llama-fs) • Powered by [Ollama](https://ollama.ai) • Built with [Electron](https://electronjs.org)*

**Standing on the shoulders of giants, reaching for the stars** 🌟

[![GitHub stars](https://img.shields.io/github/stars/stratosort/stratosort?style=social)](https://github.com/stratosort/stratosort/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/stratosort/stratosort?style=social)](https://github.com/stratosort/stratosort/network/members)
[![GitHub issues](https://img.shields.io/github/issues/stratosort/stratosort)](https://github.com/stratosort/stratosort/issues)

</div>
