<p align="center">
  <img src="assets/stratosort-logo.png" alt="StratoSort" width="120" />
</p>

<h2 align="center">StratoSort</h2>
<p align="center"><b>Smart, private file organization — powered by local AI</b></p>

---

### ✨ What It Does

- **Private by design**: Files never leave your machine
- **Local AI**: Works offline with user‑selectable Ollama models
- **Smart suggestions**: Organize by content (documents and images)
- **Batch operations**: Review/apply moves in bulk with preview
- **Safety**: Full undo/redo for every operation

### 📦 Downloads

- Installers/executables will be published under Releases soon.
- In the meantime, you can build locally (see below).

### 🚀 Quick Start (Build Locally)

```bash
git clone https://github.com/stratosort/stratosort.git
cd stratosort
npm install
npm run dev

# Package an installer for your platform
npm run dist           # Current platform
```

Notes:

- On first run, the app checks for Ollama and guides model setup (optional).
- You can choose/change models anytime in Settings.

### ⌨️ Shortcuts

- Undo: `Ctrl+Z` (Win/Linux) or `Cmd+Z` (Mac)
- Redo: `Ctrl+Shift+Z` or `Ctrl+Y` (Win/Linux) / `Cmd+Shift+Z` (Mac)

### 🔒 Privacy

- 100% local processing; no telemetry.
- JavaScript‑native vector store backed by JSON files (no external DB).

### 📝 Documentation

- [How organization works](ORGANIZATION_SUGGESTIONS_GUIDE.md)

### ⚙️ Requirements

- Windows 10/11, macOS 11+, or Linux
- 8 GB RAM recommended
- 6–12 GB free disk (for local models)
- Optional GPU for faster processing

### 📄 License

MIT — see [LICENSE](LICENSE)

### 🔗 Links

- Issues: [Report a bug](https://github.com/stratosort/stratosort/issues)
- Ollama: [ollama.ai](https://ollama.ai)

---

Made with care for privacy‑conscious users.
