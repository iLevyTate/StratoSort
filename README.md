## StratoSort

Privacy-first, local AI document organizer (Electron + React). Analyze documents and images with your local Ollama models, then batch‑organize with safe undo/redo.

### Highlights

- Local AI via Ollama; models are user‑configurable in Settings
- Document and image analysis; smart folder matching
- Conflict‑safe batch moves with full undo/redo history
- Clean, modern UI with progress and status

### Quick start

Prereqs:

- Node.js 18+ and npm 8+
- Optional: Ollama for AI features (app runs without it; AI disabled)

Install & run:

```bash
git clone https://github.com/stratosort/stratosort.git
cd stratosort
npm install
npm run dev
```

Ollama (optional):

- Install from `https://ollama.ai` and start the server: `ollama serve`
- Pull your preferred text/vision/embedding models
- In the app: Settings → AI Configuration → set Host and model names
- Or run: `npm run setup:ollama` to attempt pulling example models

### Testing

```bash
npm test
```

### Build / Distribution

- Production build: `npm run build`
- Installers: `npm run dist` (or `dist:win`, `dist:mac`, `dist:linux`)

### Shortcuts

- Undo: Ctrl/Cmd+Z
- Redo: Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y

### License

MIT

### Links

- Project: `https://github.com/stratosort/stratosort`
- Ollama: `https://ollama.ai`
