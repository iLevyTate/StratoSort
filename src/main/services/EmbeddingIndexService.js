const { app } = require('electron');
const fs = require('fs').promises;
const path = require('path');

class EmbeddingIndexService {
  constructor() {
    this.basePath = path.join(app.getPath('userData'), 'embeddings');
    this.filesPath = path.join(this.basePath, 'file-embeddings.jsonl');
    this.foldersPath = path.join(this.basePath, 'folder-embeddings.jsonl');
    this.fileVectors = new Map();
    this.folderVectors = new Map();
    this.initialized = false;
    this.persistDisabled = false;
    this.writeQueue = Promise.resolve();
  }

  async initialize() {
    if (this.initialized) return;
    try {
      await fs.mkdir(this.basePath, { recursive: true });
    } catch (e) {
      this.persistDisabled = true;
    }
    await Promise.all([
      this.loadJsonl(this.filesPath, this.fileVectors),
      this.loadJsonl(this.foldersPath, this.folderVectors),
    ]);
    this.initialized = true;
  }

  async loadJsonl(filePath, targetMap) {
    try {
      const data = await fs.readFile(filePath, 'utf8');
      data
        .split(/\r?\n/)
        .filter(Boolean)
        .forEach((line) => {
          try {
            const obj = JSON.parse(line);
            if (obj && obj.id) targetMap.set(obj.id, obj);
          } catch {}
        });
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }

  async appendJsonl(filePath, obj) {
    if (this.persistDisabled) return;
    // Queue writes so concurrent appends don't corrupt JSONL entries
    this.writeQueue = this.writeQueue.then(async () => {
      try {
        await fs.appendFile(filePath, JSON.stringify(obj) + '\n');
      } catch {
        this.persistDisabled = true;
      }
    });
    return this.writeQueue;
  }

  async upsertFolder(folder) {
    await this.initialize();
    this.folderVectors.set(folder.id, folder);
    await this.appendJsonl(this.foldersPath, folder);
  }

  async upsertFile(file) {
    await this.initialize();
    this.fileVectors.set(file.id, file);
    await this.appendJsonl(this.filesPath, file);
  }

  cosine(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0,
      na = 0,
      nb = 0;
    for (let i = 0; i < a.length; i += 1) {
      const x = a[i];
      const y = b[i];
      dot += x * y;
      na += x * x;
      nb += y * y;
    }
    if (na === 0 || nb === 0) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }

  async queryFolders(fileId, topK = 5) {
    await this.initialize();
    const file = this.fileVectors.get(fileId);
    if (!file) return [];
    const scores = [];
    for (const [, folder] of this.folderVectors) {
      const score = this.cosine(file.vector, folder.vector);
      scores.push({ folderId: folder.id, name: folder.name, score });
    }
    return scores.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  async resetFiles() {
    await this.initialize();
    this.fileVectors.clear();
    try {
      await fs.writeFile(this.filesPath, '');
    } catch (e) {
      // If persisting fails, mark disabled but still function in-memory
      this.persistDisabled = true;
    }
  }

  async resetFolders() {
    await this.initialize();
    this.folderVectors.clear();
    try {
      await fs.writeFile(this.foldersPath, '');
    } catch (e) {
      this.persistDisabled = true;
    }
  }

  async resetAll() {
    await this.resetFiles();
    await this.resetFolders();
  }
}

module.exports = EmbeddingIndexService;
