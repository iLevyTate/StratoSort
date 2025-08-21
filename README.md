<p align="center">
  <img src="assets/stratosort-logo.png" alt="StratoSort" width="120" />
</p>

<h2 align="center">StratoSort</h2>
<p align="center"><b>Smart, private file organization — powered by local AI</b></p>

---

## ✨ Features

- **Private by design**: Files never leave your machine
- **Local AI**: Works offline; Ollama models are user‑configurable in Settings
- **Smart suggestions**: Organize by content (documents and images)
- **Batch operations**: Review and apply suggestions in bulk
- **Safe actions**: Full undo/redo for every move
- **Minimal setup**: First run guides any required components

## 📥 Download

- Get the latest release from [Releases](https://github.com/stratosort/stratosort/releases/latest) and choose the installer for your OS.
- On first launch, StratoSort will verify AI readiness and guide setup if needed. No manual steps required.

## 🚀 Get Started

1. Open StratoSort
2. Select files or folders
3. Analyze → Review suggestions → Apply (undo anytime)

You’re guided in‑app on first run; no external setup needed.

## ⚙️ Requirements

- Windows 10/11, macOS 11+, or Linux
- 8 GB RAM recommended
- 6–12 GB free disk (for local models)
- Optional GPU for faster processing

## ⌨️ Shortcuts

- Undo: `Ctrl+Z` (Win/Linux) or `Cmd+Z` (Mac)
- Redo: `Ctrl+Shift+Z` / `Ctrl+Y` (Win/Linux) or `Cmd+Shift+Z` (Mac)

## 🛠️ Build from Source

```bash
git clone https://github.com/stratosort/stratosort.git
cd stratosort
npm install
npm run dev

# Packaging
npm run dist           # Current platform
npm run dist:win       # Windows
npm run dist:mac       # macOS
npm run dist:linux     # Linux
```

Ollama setup is optional and handled on first run. Models can be selected in Settings.

## 📚 Docs

- [How organization works](ORGANIZATION_SUGGESTIONS_GUIDE.md)

## 🔒 Privacy

- 100% local processing; no telemetry
- JavaScript‑native vector store backed by JSON files (no external DB)

## 📄 License

MIT — see [LICENSE](LICENSE)

## 🔗 Links

- Issues: [Report a bug](https://github.com/stratosort/stratosort/issues)
- Ollama: [ollama.ai](https://ollama.ai)

---

Made with care for privacy‑conscious users.
