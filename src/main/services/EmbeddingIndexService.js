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

    // Performance optimizations
    this.writeBuffer = [];
    this.batchSize = 10; // Batch write operations
    // Conditional flush interval - only flush when there's data
    this.flushInterval = setInterval(() => {
      if (this.writeBuffer.length > 0) {
        this.flushWriteBuffer().catch((error) =>
          console.error('Background flush failed:', error),
        );
      }
    }, 10000); // Increased from 5s to 10s and made conditional
    // Prevent the interval from keeping the Node event loop alive in tests/runtime
    if (this.flushInterval && typeof this.flushInterval.unref === 'function') {
      try {
        this.flushInterval.unref();
      } catch (e) {
        // ignore unref failures
      }
    }
  }

  // Batch writing for performance
  async bufferWrite(filePath, obj) {
    this.writeBuffer.push({ filePath, obj });

    if (this.writeBuffer.length >= this.batchSize) {
      await this.flushWriteBuffer();
    }
  }

  async flushWriteBuffer() {
    if (this.writeBuffer.length === 0 || this.persistDisabled) return;

    const batch = [...this.writeBuffer];
    this.writeBuffer = [];

    try {
      // Group by file path for efficiency
      const grouped = batch.reduce((acc, item) => {
        if (!acc[item.filePath]) acc[item.filePath] = [];
        acc[item.filePath].push(item.obj);
        return acc;
      }, {});

      // Write each group
      for (const [filePath, objects] of Object.entries(grouped)) {
        const lines =
          objects.map((obj) => JSON.stringify(obj)).join('\n') + '\n';
        await fs.appendFile(filePath, lines);
      }
    } catch (error) {
      console.error('[EMBEDDING] Batch write failed:', error);
      // Re-add failed items to buffer
      this.writeBuffer.unshift(...batch);
    }
  }

  // Cleanup method
  destroy() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.flushWriteBuffer(); // Final flush
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
      // Stream the JSONL file to avoid loading large files into memory
      const stream = require('fs').createReadStream(filePath, {
        encoding: 'utf8',
      });
      const readline = require('readline');
      const rl = readline.createInterface({
        input: stream,
        crlfDelay: Infinity,
      });
      for await (const line of rl) {
        if (!line || !line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (obj && obj.id) targetMap.set(obj.id, obj);
        } catch (e) {
          // ignore malformed lines
        }
      }
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }

  async appendJsonl(filePath, obj) {
    if (this.persistDisabled) return;

    // Use batch writing for better performance
    try {
      await this.bufferWrite(filePath, obj);
      return Promise.resolve();
    } catch (error) {
      console.error(
        '[EMBEDDING] Batch buffer failed, falling back to direct write:',
        error,
      );
      // Fallback to direct write if batch fails
      try {
        await fs.appendFile(filePath, JSON.stringify(obj) + '\n');
        return Promise.resolve();
      } catch (fallbackError) {
        console.error('[EMBEDDING] Direct write also failed:', fallbackError);
        this.persistDisabled = true;
        return Promise.resolve();
      }
    }
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
