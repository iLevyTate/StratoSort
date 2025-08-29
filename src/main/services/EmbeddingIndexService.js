const { app } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const { backupAndReplace } = require('../../shared/atomicFileOperations');
const { logger } = require('../../shared/logger');

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
    this.consecutiveFailures = 0;
    this.maxConsecutiveFailures = 5;
    this.failureBackoffMs = 30000; // 30 seconds
    this.maxFileVectors = 10000; // Limit file vectors to prevent unbounded growth
    this.maxFolderVectors = 1000; // Limit folder vectors

    // Performance optimizations
    this.writeBuffer = [];
    this.batchSize = 10; // Batch write operations
    // Conditional flush interval - only flush when there's data
    this.flushInterval = setInterval(() => {
      if (this.writeBuffer.length > 0) {
        this.writeQueue = this.writeQueue
          .then(() => this.flushWriteBuffer())
          .catch((error) => {
            logger.error('Background flush failed:', error);
            return Promise.resolve(); // Continue the chain
          });
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

  // Batch writing for performance with serialization
  async bufferWrite(filePath, obj) {
    this.writeBuffer.push({ filePath, obj });

    if (this.writeBuffer.length >= this.batchSize) {
      // Use writeQueue to serialize flushes
      this.writeQueue = this.writeQueue.then(() => this.flushWriteBuffer());
      await this.writeQueue;
    }
  }

  async flushWriteBuffer() {
    if (this.writeBuffer.length === 0 || this.persistDisabled) return;

    // Check if we're in back-off period due to consecutive failures
    if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
      console.warn(
        `[EMBEDDING] Persistence disabled after ${this.consecutiveFailures} consecutive failures. Will retry in ${this.failureBackoffMs}ms.`,
      );
      // Keep the buffer for retry instead of dropping data
      this.persistDisabled = true;
      // Reset failure counter and re-enable persistence after back-off period
      setTimeout(() => {
        this.consecutiveFailures = 0;
        this.persistDisabled = false;
        console.info(
          '[EMBEDDING] Re-enabling persistence after back-off period',
        );
        // Trigger a flush if we have buffered data
        if (this.writeBuffer.length > 0) {
          this.writeQueue = this.writeQueue
            .then(() => this.flushWriteBuffer())
            .catch((error) => {
              logger.error('[EMBEDDING] Retry flush failed:', error);
              return Promise.resolve();
            });
        }
      }, this.failureBackoffMs);
      return;
    }

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

      // Reset consecutive failures on successful write
      this.consecutiveFailures = 0;
    } catch (error) {
      logger.error('[EMBEDDING] Batch write failed:', error);
      this.consecutiveFailures++;

      // Re-add failed items to buffer for retry
      this.writeBuffer.unshift(...batch);

      // If we've hit the failure limit, disable persistence temporarily
      if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
        logger.error(
          `[EMBEDDING] Too many consecutive write failures (${this.consecutiveFailures}). Disabling persistence temporarily.`,
        );
      }
    }
  }

  // Cleanup method
  async destroy() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    // Ensure final flush completes
    try {
      await this.flushWriteBuffer();
    } catch (error) {
      logger.error(
        '[EMBEDDING] Final flush failed during destroy:',
        error.message,
      );
    }
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
    let skippedLines = 0;
    let loadedLines = 0;

    let stream;
    try {
      // Stream the JSONL file to avoid loading large files into memory
      stream = require('fs').createReadStream(filePath, {
        encoding: 'utf8',
      });
      stream.on('error', (error) => {
        logger.error('Stream error:', error);
        stream.destroy();
      });
      stream.on('end', () => stream.destroy());
      const readline = require('readline');
      const rl = readline.createInterface({
        input: stream,
        crlfDelay: Infinity,
      });
      for await (const line of rl) {
        if (!line || !line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (obj && obj.id) {
            targetMap.set(obj.id, obj);
            loadedLines++;
          } else {
            skippedLines++;
            console.debug(
              `[EMBEDDING] Skipping line without valid id in ${filePath}`,
            );
          }
        } catch (e) {
          skippedLines++;
          console.debug(
            `[EMBEDDING] Skipping malformed JSON line in ${filePath}:`,
            e.message,
          );
        }
      }

      if (skippedLines > 0) {
        console.info(
          `[EMBEDDING] Loaded ${loadedLines} entries, skipped ${skippedLines} malformed lines from ${filePath}`,
        );
      }
    } catch (e) {
      if (e.code !== 'ENOENT') {
        logger.error(
          `[EMBEDDING] Failed to load JSONL file ${filePath}:`,
          e.message,
        );
        throw e;
      }
    } finally {
      if (stream) {
        stream.close();
      }
    }
  }

  async appendJsonl(filePath, obj) {
    if (this.persistDisabled) return;

    // Use batch writing for better performance
    try {
      await this.bufferWrite(filePath, obj);
      return Promise.resolve();
    } catch (error) {
      logger.error(
        '[EMBEDDING] Batch buffer failed, falling back to direct write:',
        error,
      );
      // Fallback to direct write if batch fails
      try {
        await fs.appendFile(filePath, JSON.stringify(obj) + '\n');
        return Promise.resolve();
      } catch (fallbackError) {
        logger.error('[EMBEDDING] Direct write also failed:', fallbackError);
        this.persistDisabled = true;
        return Promise.resolve();
      }
    }
  }

  async upsertFolder(folder) {
    await this.initialize();

    // Limit cache size to prevent unbounded growth
    if (this.folderVectors.size >= this.maxFolderVectors) {
      // Remove oldest entries (simple FIFO eviction)
      const keysToDelete = Array.from(this.folderVectors.keys()).slice(
        0,
        Math.max(1, Math.floor(this.maxFolderVectors * 0.1)),
      );
      keysToDelete.forEach((key) => this.folderVectors.delete(key));
    }

    this.folderVectors.set(folder.id, folder);
    await this.appendJsonl(this.foldersPath, folder);
  }

  async upsertFile(file) {
    await this.initialize();

    // Limit cache size to prevent unbounded growth
    if (this.fileVectors.size >= this.maxFileVectors) {
      // Remove oldest entries (simple FIFO eviction)
      const keysToDelete = Array.from(this.fileVectors.keys()).slice(
        0,
        Math.max(1, Math.floor(this.maxFileVectors * 0.1)),
      );
      keysToDelete.forEach((key) => this.fileVectors.delete(key));
    }

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
    const maxFolders = 1000; // Safety limit to prevent unbounded growth
    let folderCount = 0;

    for (const [, folder] of this.folderVectors) {
      if (folderCount >= maxFolders) break;
      const score = this.cosine(file.vector, folder.vector);
      scores.push({ folderId: folder.id, name: folder.name, score });
      folderCount++;
    }

    return scores.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  async resetFiles() {
    await this.initialize();
    this.fileVectors.clear();
    try {
      await backupAndReplace(this.filesPath, '');
    } catch (e) {
      // If persisting fails, mark disabled but still function in-memory
      this.persistDisabled = true;
    }
  }

  async resetFolders() {
    await this.initialize();
    this.folderVectors.clear();
    try {
      await backupAndReplace(this.foldersPath, '');
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
