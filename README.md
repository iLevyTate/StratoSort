# 🎯 StratoSort - AI-Powered Document Organization

<div align="center">
  <img src="assets/stratosort-logo.png" alt="StratoSort Logo" width="128" height="128">
  
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  [![Electron](https://img.shields.io/badge/Electron-26.2.1-blue.svg)](https://www.electronjs.org/)
  [![React](https://img.shields.io/badge/React-18.2.0-blue.svg)](https://reactjs.org/)
  [![Ollama](https://img.shields.io/badge/Ollama-Compatible-green.svg)](https://ollama.ai/)
  [![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4.3-blue.svg)](https://tailwindcss.com/)
</div>

> **Production-Ready AI File Organization System** - Complete with glassmorphism UI, semantic analysis, and intelligent file management.

---

## 🚀 Overview

**StratoSort** is a production-ready, privacy-focused AI document organization system that intelligently categorizes and organizes your files using local AI processing. Built with modern technologies and featuring a beautiful glassmorphism interface, StratoSort provides enterprise-grade file management without compromising your privacy.

## ✅ Feature status

- **Available now**
  - **Document analysis**: PDFs, DOC/DOCX, TXT/MD/RTF/HTML, XLSX, PPTX with Ollama-backed extraction and sensible fallbacks
  - **Image analysis**: PNG/JPG/JPEG/GIF/BMP/WEBP/TIFF/SVG via vision models; basic OCR support
  - **Smart folders**: add/edit/delete, directory creation/validation, folder structure scan, semantic matching (embeddings/LLM fallback)
  - **Batch organize**: conflict-safe moves with progress events and unique-name handling
  - **Undo/Redo**: action history with confirmation for destructive operations and a history modal
  - **Analysis history**: record, search, statistics, and JSON export
  - **Settings**: Ollama host and model selection persisted to user data
  - **File selection**: select files or scan directories (recursively) for supported types

- **Disabled in this build**
  - **Audio analysis/transcription**: modules exist, but UI and IPC are disabled. References are commented in `src/preload/preload.js`, `src/renderer/App.js`, and `src/main/simple-main.js`.

- **Planned / in progress**
  - In-app semantic search UI leveraging stored analysis and embeddings
  - Expanded accessibility and theming options
  - Optional video analysis

### 🔑 Key Benefits

- **🔒 100% Privacy**: All AI processing happens locally using Ollama
- **🎨 Modern Design**: Beautiful glassmorphism UI with Apple-inspired aesthetics  
- **🧠 Smart Analysis**: Deep content analysis for accurate categorization
- **⚡ Fast Processing**: Optimized models for quick file analysis
- **📁 Smart Folders**: Automatic organization into intelligent folder structures

---

## ✨ Current Features

### 🎯 Complete 5-Phase Workflow
1. **🚀 Welcome** - Introduction and quick start options
2. **⚙️ Setup** - Configure smart folders and AI settings  
3. **🔍 Discover** - File selection, scanning, and automatic AI analysis
4. **📂 Organize** - Review suggestions and execute file organization
5. **✅ Complete** - Results summary and workflow completion

### 🧠 AI-Powered Analysis
- **Content Analysis**: Reads and understands file contents (PDFs, text, documents)
- **Smart Categorization**: Intelligent folder matching based on content
- **Metadata Extraction**: Extracts subjects, dates, projects, and purposes
- **Confidence Scoring**: AI confidence levels for organizational decisions
- **Multi-Format Support**: PDF, DOC/DOCX, TXT/MD/RTF/HTML, XLSX, PPTX, and common images

### 🎨 Modern Interface
- **Glassmorphism Design**: Translucent cards with backdrop blur effects
- **Responsive Layout**: Full-height phases without scrolling
- **Smooth Animations**: Subtle transitions and micro-interactions
- **Accessibility**: ARIA labels, keyboard navigation, screen reader support
- **Dark/Light Themes**: Adaptive color schemes

### 📁 Smart Folder Management
- **Custom Folders**: Create intelligent organizational structures
- **Path Integration**: Real file system path management
- **Bulk Operations**: Organize hundreds of files simultaneously
- **Undo/Redo**: Full operation history with rollback capability
- **Conflict Resolution**: Handle naming conflicts automatically

---

## 🤖 AI Models & performance

### Optimized model selection
- **Text analysis**: `llama3.2:latest` (default)
- **Vision analysis**: `llava:latest` (default)
- **Audio (optional, currently disabled in UI)**: `dimavz/whisper-tiny:latest`

### Performance notes
- Real-world speed and accuracy depend on your hardware and chosen models
- Works offline with local inference via Ollama; without Ollama, AI-driven features are limited

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** 18.0.0 or higher
- **npm** 8.0.0 or higher  
- **Ollama** (for AI functionality)

### Installation

1. **Clone & Install**
   ```bash
   git clone https://github.com/yourusername/stratosort.git
   cd stratosort
   npm install
   ```

2. **Setup Ollama**
   ```bash
   # Install Ollama (https://ollama.ai)
   # Windows
   winget install Ollama.Ollama
   
   # macOS  
   brew install ollama
   
   # Linux
   curl -fsSL https://ollama.ai/install.sh | sh
   ```

3. **Install Required Models**
   ```bash
   ollama pull llama3.2:latest
   ollama pull llava:latest
   # Optional (audio; currently disabled in UI)
   # ollama pull dimavz/whisper-tiny:latest
   ```

4. **Start StratoSort**
   ```bash
   npm run dev
   ```

---

## 🧠 Using Ollama locally

### Windows

- Install:
```powershell
winget install Ollama.Ollama
# or download the Windows installer from https://ollama.ai
```

- Start the Ollama server:
```powershell
ollama serve
```

- Pull required models:
```powershell
# Text (documents)
ollama pull llama3.2:latest

# Vision (images)
ollama pull llava:latest

# Optional: Embeddings
ollama pull mxbai-embed-large

# Optional: Whisper (tiny) for audio transcription
ollama pull dimavz/whisper-tiny:latest
```

- Verify:
```powershell
ollama list
curl http://127.0.0.1:11434/api/tags
ollama run llama3.2:latest -p "Say hello"
```

- Configure in StratoSort:
  - Open Settings → AI Configuration
  - Host: http://127.0.0.1:11434
  - Text Model: `llama3.2:latest`
  - Vision Model: `llava:latest`
  - Save

### macOS

- Install:
```bash
brew install ollama
# or download the macOS app from https://ollama.ai
```
- Start:
```bash
ollama serve
```
- Pull models and verify (same commands as Windows, adjust shell).

### Linux

- Install:
```bash
curl -fsSL https://ollama.ai/install.sh | sh
```
- Start and pull models (same commands as above).

### Troubleshooting

- **Connection refused**: Ensure the server is running (`ollama serve`).
- **Model not found**: Run `ollama pull <model>`.
- **Different host/port**: Set the Host in StratoSort Settings to your Ollama URL (default `http://127.0.0.1:11434`).

---

## 🏗️ Architecture

### Modern Tech Stack
- **Frontend**: React 18 + TailwindCSS with glassmorphism design
- **Backend**: Electron main process with Node.js services
- **AI Processing**: Ollama integration for local inference
- **Build System**: Webpack 5 with optimized bundles
- **State Management**: React Context with persistent storage

### File Structure
```
stratosort/
├── src/
│   ├── main/                 # Electron main process
│   │   ├── analysis/         # AI analysis services
│   │   ├── services/         # Core business logic
│   │   └── simple-main.js    # Application entry point
│   ├── renderer/             # React frontend
│   │   ├── components/       # UI components
│   │   ├── App.js           # Main application
│   │   └── tailwind.css     # Styling system
│   ├── preload/             # Secure IPC bridge
│   └── shared/              # Common constants & utilities
├── assets/                  # Icons & resources
└── test/                   # Test suites
```

---

## 💻 Development

### Available Commands
```bash
# Development
npm run dev                # Start development Electron app (dev build)
npm run start:dev          # Dev build + Electron with logging
npm run start:debug        # Dev build + Electron with inspector
npm run electron           # Build dev bundle and launch Electron
npm run build:dev          # Build renderer/main in development mode

# Build & distribution
npm run build              # Production build
npm run package            # Create distributable
npm run dist               # Build installer for current platform
npm run dist:win           # Build Windows installer (.exe)
npm run dist:mac           # Build macOS installer (.dmg)
npm run dist:linux         # Build Linux AppImage/.deb (per config)
npm run dist:all           # Build for all platforms

# Testing
npm test                   # Run Jest test suite
npm run test:quick         # Quick run (bail on first failure)
npm run test:full          # Full test suite with coverage
npm run verify             # Show test guide and available commands

# Ollama utilities
npm run setup:ollama       # Guided setup
npm run check:ollama       # Check Ollama status
npm run start:ollama       # Start Ollama service
npm run ollama:models      # Pull example model(s)
npm run ollama:serve       # Alias to 'ollama serve'

# Linting
npm run lint               # Code linting
```

### Development Features
- **Hot Reload**: Live updates during development
- **Source Maps**: Full debugging support
- **Error Boundaries**: Comprehensive error handling
- **Performance Monitoring**: Built-in analytics
- **Memory Management**: Optimized for large file operations

---

## 🧪 Testing

### What’s covered
- **Analysis modules**: document and image analysis happy-paths and edge cases (Ollama calls mocked in tests)
- **File operations**: move/copy/delete, conflict handling, folder creation
- **Integration scripts**: sample end-to-end flows for file movement and folder scaffolding

Run tests locally with `npm test`. Note: audio analysis tests exist for module-level behavior, but audio features are disabled in the current UI build.

---

## 🎯 Usage Workflow

### Step-by-Step Process

1. **🚀 Welcome Phase**
   - Choose between "Organize Files Now" or "Setup Configuration"
   - Optional demo walkthrough (currently hidden for streamlined experience)

2. **⚙️ Setup Phase** 
   - Create smart folders with custom names and paths
   - Configure AI models and performance settings
   - Set up naming conventions and organizational rules

3. **🔍 Discover Phase**
   - Select files via drag & drop, file browser, or folder scanning
   - Automatic AI content analysis begins immediately
   - Real-time progress tracking with detailed feedback

4. **📂 Organize Phase**
   - Review AI suggestions for each file
   - Edit categories, names, and destinations as needed
   - Execute batch organization with confirmation dialogs

5. **✅ Complete Phase**
   - View organized files summary
   - Access undo/redo operations
   - Return to any phase for additional organization

---

## 🛠️ Configuration

### Smart Folder Setup
```javascript
// Example smart folder configuration
{
  name: "Research Papers",
  path: "C:/Users/YourName/Documents/Research",
  description: "Academic papers and research documents",
  keywords: ["research", "paper", "study", "analysis"],
  semanticTags: ["academic", "scientific", "educational"]
}
```

### AI Model Configuration
- **Text Model**: Controls document content analysis
- **Vision Model**: Handles images and visual documents  
- **Audio Model (optional/disabled)**: Transcription model if you enable audio features during development
- **Timeout Settings**: Configurable analysis timeouts
- **Confidence Thresholds**: Minimum confidence for auto-organization

---

## 🤝 Contributing

### Development Setup
1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Follow the established code patterns and architecture
4. Ensure all tests pass (`npm test`)
5. Submit pull request with detailed description

### Code Standards
- **Clean Code**: Follow established patterns, no technical debt
- **Type Safety**: Use proper TypeScript where applicable  
- **Error Handling**: Comprehensive error boundaries and logging
- **Performance**: Optimize for speed and memory efficiency
- **UI/UX**: Maintain glassmorphism design consistency

---

## 📄 License

**MIT License** - Complete freedom to use, modify, and distribute.

### Permissions
- ✅ Commercial use
- ✅ Modification  
- ✅ Distribution
- ✅ Private use

### Requirements
- 📄 License and copyright notice
- 📄 Attribution in distributions

---

## 🔗 Links & Resources

- **Ollama**: [https://ollama.ai](https://ollama.ai)
- **Electron**: [https://electronjs.org](https://electronjs.org)  
- **React**: [https://reactjs.org](https://reactjs.org)
- **TailwindCSS**: [https://tailwindcss.com](https://tailwindcss.com)

---

<div align="center">

**🌟 StratoSort - Intelligent File Organization**

*Privacy-focused • AI-powered • Production-ready*

**Built with modern technologies for the modern workspace**

</div>
