# StratoSort

**Smart File Organization with Local AI** 🚀

StratoSort is a privacy-first document organizer that uses AI to intelligently categorize and organize your files. All processing happens locally on your computer - your files never leave your machine.

![StratoSort Logo](assets/stratosort-logo.png)

## ✨ Features

- 🤖 **Local AI Analysis** - Powered by Ollama, runs completely offline
- 📁 **Smart Organization** - AI suggests the best folders for your files
- 🖼️ **Image Understanding** - Analyzes image content, not just filenames
- 🔄 **Safe Operations** - Full undo/redo for all file movements
- 🛡️ **Privacy First** - No cloud, no tracking, no data leaves your computer
- 📊 **Batch Processing** - Organize hundreds of files at once
- 🎯 **Smart Folders** - Create intelligent folders that learn your preferences

## 📥 Download & Install

### For Windows Users

1. **Download the installer**:
   - Go to [Releases](https://github.com/stratosort/stratosort/releases/latest)
   - Download `StratoSort-Setup-1.0.0.exe`
   - Located in: `release/build/StratoSort-Setup-1.0.0.exe` (after building)

2. **Run the installer**:
   - Double-click the downloaded file
   - Follow the installation wizard
   - StratoSort will automatically set up AI models on first run

3. **First Launch**:
   - The app will check for required AI components
   - If needed, it will guide you through installing Ollama
   - Essential AI models will be downloaded automatically (one-time, ~6GB)

### For macOS Users

- Download `StratoSort-1.0.0.dmg` from [Releases](https://github.com/stratosort/stratosort/releases/latest)
- Open the DMG and drag StratoSort to Applications
- On first launch, the app will set up AI components

### For Linux Users

- Download `StratoSort-1.0.0.AppImage` from [Releases](https://github.com/stratosort/stratosort/releases/latest)
- Make it executable: `chmod +x StratoSort-1.0.0.AppImage`
- Run it: `./StratoSort-1.0.0.AppImage`

## 🚀 Getting Started

**New to StratoSort?** Check out our [Quick Start Guide](QUICK_START.md) for a 5-minute walkthrough!

1. **Launch StratoSort** - The app will start and check AI readiness
2. **Select Files** - Choose files or folders to organize
3. **Analyze** - AI analyzes your files (text, images, documents)
4. **Review** - See AI suggestions for organization
5. **Organize** - Apply suggestions with one click
6. **Undo if Needed** - Full history with Ctrl+Z

## 🎯 Use Cases

- **Downloads Folder Cleanup** - Automatically sort downloads into proper folders
- **Photo Organization** - Group photos by content, not just date
- **Document Management** - Categorize documents by type and content
- **Project Files** - Keep project files organized by topic
- **Receipt & Invoice Filing** - Auto-categorize financial documents

## ⚙️ System Requirements

### Minimum

- Windows 10/11, macOS 10.15+, or Linux
- 6GB RAM
- 6GB free disk space (for AI models)
- Any modern CPU

### Recommended

- 8GB+ RAM
- 12GB+ free disk space
- GPU with 4GB+ VRAM (optional, for faster processing)

## 🔒 Privacy & Security

- **100% Local** - All AI processing happens on your computer
- **No Internet Required** - Works completely offline after setup
- **No Data Collection** - We don't track, collect, or transmit any data
- **Open Source** - Full source code available for inspection

## ⌨️ Keyboard Shortcuts

- **Undo**: `Ctrl+Z` (Windows/Linux) or `Cmd+Z` (Mac)
- **Redo**: `Ctrl+Shift+Z` or `Ctrl+Y` (Windows/Linux) or `Cmd+Shift+Z` (Mac)
- **Select All**: `Ctrl+A` (Windows/Linux) or `Cmd+A` (Mac)

## 🔧 Advanced Features

### Smart Folders

Create intelligent folders that automatically categorize files:

- Set keywords and descriptions
- AI learns from your choices
- Improves accuracy over time

### Auto-Organization

Enable automatic organization for Downloads folder:

1. Go to Settings → Auto-Organize
2. Enable "Watch Downloads Folder"
3. Set confidence threshold
4. New downloads are organized automatically

### Batch Operations

Process multiple files efficiently:

- Select multiple files/folders
- Get suggestions for all at once
- Review and apply in bulk
- Full undo for entire batch

---

## 👨‍💻 For Developers

### Building from Source

#### Prerequisites

- Node.js 18+ and npm 8+
- Git

#### Setup

```bash
git clone https://github.com/stratosort/stratosort.git
cd stratosort
npm install  # Automatically sets up Ollama and AI models
npm run dev  # Start development mode
```

#### Build Commands

**Quick Build (Windows)**:

- Double-click `BUILD_INSTALLER.bat` or `BUILD_INSTALLER.ps1`
- Installer will be created in `release/build/`

**Manual Build**:

```bash
npm run build        # Build renderer
npm run dist         # Create installer for current platform
npm run dist:win     # Create Windows installer
npm run dist:mac     # Create macOS installer
npm run dist:linux   # Create Linux packages
```

#### Installer Location

After building, installers are located in:

- Windows: `release/build/StratoSort-Setup-1.0.0.exe`
- macOS: `release/build/StratoSort-1.0.0.dmg`
- Linux: `release/build/StratoSort-1.0.0.AppImage`

### Testing

```bash
npm test                    # Run all tests
npm run lint               # Check code style
npm run setup:ollama       # Set up Ollama and models
npm run setup:ollama:check # Verify Ollama installation
```

### Architecture

- **Frontend**: React with Tailwind CSS
- **Backend**: Electron with Node.js
- **AI**: Ollama with local LLMs
- **Database**: ChromaDB for embeddings
- **State**: Context API with persistence

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

---

## 📚 Documentation

- [Organization Guide](ORGANIZATION_SUGGESTIONS_GUIDE.md) - How the AI suggestion system works
- [Ollama Setup Guide](OLLAMA_SETUP_GUIDE.md) - Detailed AI setup instructions
- [API Documentation](docs/API.md) - For developers

## 🐛 Troubleshooting

### AI Models Not Working

- Run `npm run setup:ollama:check` to verify installation
- Ensure Ollama is running: `ollama serve`
- Check Settings → AI Configuration

### Files Not Moving

- Check file permissions
- Ensure destination folders exist
- Review the operation log

### Performance Issues

- Close other applications
- Check available disk space
- Consider using smaller AI models

## 📄 License

MIT License - See [LICENSE](LICENSE) file for details

## 🔗 Links

- **Homepage**: [stratosort.com](https://stratosort.com)
- **GitHub**: [github.com/stratosort/stratosort](https://github.com/stratosort/stratosort)
- **Issues**: [Report a bug](https://github.com/stratosort/stratosort/issues)
- **Ollama**: [ollama.ai](https://ollama.ai)

## 🙏 Acknowledgments

- Powered by [Ollama](https://ollama.ai) for local AI
- Built with [Electron](https://www.electronjs.org/) and [React](https://reactjs.org/)
- UI components from [Tailwind CSS](https://tailwindcss.com/)

---

**Made with ❤️ for privacy-conscious users**
