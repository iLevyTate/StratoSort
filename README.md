<p align="center">
  <img src="assets/stratosort-logo.png" alt="StratoSort" width="120" />
</p>

<h2 align="center">StratoSort</h2>
<p align="center"><b>Smart, private file organization — powered by local AI</b></p>

---

### ✨ What It Does

- **Private by design**: Files never leave your machine
- **Local AI**: Works offline with user-selectable Ollama models
- **Smart suggestions**: AI-powered content analysis for documents and images
- **Smart Folders**: Customizable folder structures with AI matching
- **Batch operations**: Review and apply moves in bulk with preview
- **Analysis History**: Track and search past file analyses
- **Safety**: Full undo/redo system for every operation
- **Multi-format support**: Documents, images, text files, and archives
- **Real-time feedback**: Live analysis progress and error handling
- **Performance optimized**: Concurrent processing with smart limits

### 📦 Downloads

- Installers/executables will be published under Releases soon.
- In the meantime, you can build locally (see below).

### 🚀 Quick Start (Build Locally)

```bash
git clone https://github.com/stratosort/stratosort.git
cd stratosort
npm install
npm run dev              # Start development server
npm start                # Alternative dev command
npm run build            # Production build
npm run package          # Build installer for current platform

# Platform-specific installers
npm run dist:win         # Windows installer
npm run dist:mac         # macOS installer
npm run dist:linux       # Linux installer
npm run dist:all         # All platforms
```

Notes:

- On first run, the app checks for Ollama and guides model setup (optional).
- You can choose/change models anytime in Settings.
- Default models: `llama3.2:latest` (2GB) for text, `llava:latest` (4.7GB) for images.
- Models are downloaded automatically when needed.
- Fallback models available: gemma3:4b, llama3, mistral, phi3.

### ⌨️ Shortcuts

- Undo: `Ctrl+Z` (Win/Linux) or `Cmd+Z` (Mac)
- Redo: `Ctrl+Shift+Z` or `Ctrl+Y` (Win/Linux) / `Cmd+Shift+Z` (Mac)

### 📁 Supported File Types

- **Documents**: PDF, DOC, DOCX, XLSX, PPTX, ODT, ODS, ODP, EPUB, EML, MSG
- **Images**: PNG, JPG, JPEG, GIF, BMP, WEBP, TIFF, SVG
- **Text files**: TXT, MD, RTF, JSON, CSV, XML, HTML, JS, TS, JSX, TSX, PY, and more
- **Archives**: ZIP, RAR, 7Z, TAR, GZ
- **File size limits**: Up to 100MB for images, 200MB for documents
- **Processing**: Up to 3 files concurrently for optimal performance

### 🔒 Privacy

- 100% local processing; no telemetry or cloud services.
- JavaScript-native vector store backed by JSON files (no external database).
- All AI processing happens locally on your machine using Ollama.

### 📝 Documentation

- [How organization works](ORGANIZATION_SUGGESTIONS_GUIDE.md)

### ⚙️ Requirements

- **OS**: Windows 10/11, macOS 11+, or Linux
- **RAM**: 8 GB minimum, 16 GB recommended
- **Storage**: 8–16 GB free disk space (for AI models)
- **AI Models**: ~6.7 GB total (llama3.2: 2GB + llava: 4.7GB)
- **Optional**: GPU for faster AI processing
- **Node.js**: 18.0.0+ and npm 8.0.0+

### 📄 License

MIT — see [LICENSE](LICENSE)

### 🔗 Links

- Issues: [Report a bug](https://github.com/stratosort/stratosort/issues)
- Ollama: [ollama.ai](https://ollama.ai)

---

Made with care for privacy‑conscious users.
