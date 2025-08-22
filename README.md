# StratoSort

**Privacy-first AI document organizer** - Automatically analyze and organize your files using local AI models with complete privacy and control.

![StratoSort Logo](assets/stratosort-logo.png)

## 🚀 Features

### 🧠 Smart AI Analysis

- **Local AI Processing**: Uses Ollama for complete privacy - no data leaves your machine
- **Multi-format Support**: Analyzes documents (PDF, Word, Excel, text) and images (PNG, JPG, TIFF, etc.)
- **Intelligent Categorization**: AI suggests categories and new filenames based on content
- **Smart Folders**: Create custom organization rules that files automatically match

### 📁 Powerful Organization

- **Batch Processing**: Organize hundreds of files at once
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

## 📖 How It Works

StratoSort follows a simple four-phase workflow:

1. **Setup**: Configure smart folders and AI models
2. **Discover**: Select files and folders to analyze
3. **Organize**: Review AI suggestions and batch-organize files
4. **Complete**: View results and access organized files

## 🛠️ Installation

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

## 🧪 Testing

Run the comprehensive test suite:

```bash
# Run all tests
npm test

# Run specific test categories
npm run test:unit
npm run test:integration
```

## 📦 Building & Distribution

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

## ⌨️ Keyboard Shortcuts

| Action | Windows/Linux              | macOS                    |
| ------ | -------------------------- | ------------------------ |
| Undo   | `Ctrl+Z`                   | `Cmd+Z`                  |
| Redo   | `Ctrl+Shift+Z` or `Ctrl+Y` | `Cmd+Shift+Z` or `Cmd+Y` |

## 🔧 Troubleshooting

### Ollama Connection Issues

- Ensure Ollama is running: `ollama serve`
- Check host URL in Settings (default: `http://127.0.0.1:11434`)
- Verify models are installed: `ollama list`

### File Organization Issues

- Ensure destination folders have write permissions
- Check file paths don't contain invalid characters
- Verify source files exist and aren't locked by other applications

### Performance Issues

- Reduce concurrent analysis limit in Settings
- Use smaller/faster models for large batches
- Close unnecessary applications during large operations

## 🏗️ Architecture

- **Frontend**: React with modern hooks and context
- **Backend**: Electron main process with Node.js
- **AI Integration**: Local Ollama API calls
- **Storage**: JSON-based vector store (no external database required)
- **IPC**: Secure communication between renderer and main process

## 🤝 Contributing

We welcome contributions! Please see our contributing guidelines for details on:

- Code style and standards
- Testing requirements
- Pull request process

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🔗 Links

- **Ollama**: [ollama.ai](https://ollama.ai)
- **Electron**: [electronjs.org](https://electronjs.org)
- **React**: [reactjs.org](https://reactjs.org)

---

**Made with ❤️ for privacy-conscious file organization**
