const { getOllamaClient, getOllamaEmbeddingModel } = require('../ollamaUtils');
const { CACHE_CONFIG } = require('../../shared/constants');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class CacheService {
  constructor() {
    this.cache = new Map();
    this.cachePath = path.join(
      require('electron').app.getPath('userData'),
      'performance-cache.json',
    );
    this.loadCache();
    this.flushInterval = setInterval(
      () => this.persistCache(),
      CACHE_CONFIG.PERSISTENCE.FLUSH_INTERVAL,
    );
  }

  // Generate cache key from file path and content hash
  generateKey(filePath, content) {
    const fileHash = crypto.createHash('md5').update(filePath).digest('hex');
    const contentHash = crypto
      .createHash('md5')
      .update(content || '')
      .digest('hex');
    return `${fileHash}_${contentHash}`;
  }

  // Get cached item with TTL check
  get(key, type = 'analysis') {
    if (!CACHE_CONFIG.ENABLED) return null;

    const item = this.cache.get(key);
    if (!item) return null;

    const now = Date.now();
    const ttl =
      CACHE_CONFIG.TTL[type.toUpperCase()] || CACHE_CONFIG.TTL.ANALYSIS;

    if (now - item.timestamp > ttl) {
      this.cache.delete(key);
      return null;
    }

    console.log(
      `[CACHE-HIT] ${type} cache hit for key: ${key.substring(0, 16)}...`,
    );
    return item.data;
  }

  // Set cached item with optional compression
  set(key, data, type = 'analysis') {
    if (!CACHE_CONFIG.ENABLED) return;

    const item = {
      data,
      timestamp: Date.now(),
      type,
      size: JSON.stringify(data).length,
    };

    // Compress if enabled and data is large
    if (
      CACHE_CONFIG.COMPRESSION.ENABLED &&
      item.size > CACHE_CONFIG.COMPRESSION.THRESHOLD
    ) {
      // Simple compression using built-in methods
      item.data = Buffer.from(JSON.stringify(data)).toString('base64');
      item.compressed = true;
      console.log(
        `[CACHE-COMPRESSION] Compressed ${type} item: ${item.size} → ${item.data.length} bytes`,
      );
    }

    this.cache.set(key, item);

    // Enforce cache size limits
    this.enforceCacheLimits(type);

    console.log(
      `[CACHE-SET] ${type} cached with key: ${key.substring(0, 16)}...`,
    );
  }

  // Enforce cache size limits by removing oldest items
  enforceCacheLimits(type) {
    const maxSize = CACHE_CONFIG.MAX_SIZE[`${type.toUpperCase()}_CACHE`];
    if (!maxSize) return;

    const typeItems = Array.from(this.cache.entries())
      .filter(([key, item]) => item.type === type)
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    if (typeItems.length > maxSize) {
      const toRemove = typeItems.slice(0, typeItems.length - maxSize);
      toRemove.forEach(([key]) => {
        this.cache.delete(key);
      });
      console.log(
        `[CACHE-LIMIT] Removed ${toRemove.length} old ${type} cache items`,
      );
    }
  }

  // Persist cache to disk
  async persistCache() {
    if (!CACHE_CONFIG.PERSISTENCE.ENABLED) return;

    try {
      const cacheData = {
        timestamp: Date.now(),
        items: Array.from(this.cache.entries()),
      };
      await fs.writeFile(this.cachePath, JSON.stringify(cacheData, null, 2));
      console.log(
        `[CACHE-PERSIST] Persisted ${this.cache.size} cache items to disk`,
      );
    } catch (error) {
      console.warn('[CACHE-PERSIST] Failed to persist cache:', error.message);
    }
  }

  // Load cache from disk
  async loadCache() {
    if (!CACHE_CONFIG.PERSISTENCE.ENABLED) return;

    try {
      const data = await fs.readFile(this.cachePath, 'utf8');
      const cacheData = JSON.parse(data);

      // Only load items that haven't expired
      const now = Date.now();
      for (const [key, item] of cacheData.items) {
        const ttl =
          CACHE_CONFIG.TTL[item.type?.toUpperCase()] ||
          CACHE_CONFIG.TTL.ANALYSIS;
        if (now - item.timestamp < ttl) {
          this.cache.set(key, item);
        }
      }

      console.log(
        `[CACHE-LOAD] Loaded ${this.cache.size} valid cache items from disk`,
      );
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn('[CACHE-LOAD] Failed to load cache:', error.message);
      }
    }
  }

  // Clear all cache or specific type
  clear(type = null) {
    if (type) {
      const keysToDelete = [];
      for (const [key, item] of this.cache) {
        if (item.type === type) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach((key) => this.cache.delete(key));
      console.log(
        `[CACHE-CLEAR] Cleared ${keysToDelete.length} ${type} cache items`,
      );
    } else {
      const size = this.cache.size;
      this.cache.clear();
      console.log(`[CACHE-CLEAR] Cleared all ${size} cache items`);
    }
  }

  // Get cache statistics
  getStats() {
    const stats = {
      total: this.cache.size,
      byType: {},
      totalSize: 0,
      compressedItems: 0,
    };

    for (const [key, item] of this.cache) {
      stats.byType[item.type] = (stats.byType[item.type] || 0) + 1;
      stats.totalSize += item.size;
      if (item.compressed) stats.compressedItems++;
    }

    return stats;
  }
}

// Global cache instance
const globalCache = new CacheService();

class FolderMatchingService {
  constructor(embeddingStore) {
    this.embeddingStore = embeddingStore; // must implement upsertFolder, upsertFile, queryFolders
    this.embeddingQueue = new Map(); // Queue for batch processing
    this.isProcessingQueue = false;
    this.cache = globalCache; // Use global cache service
  }

  // Batch process multiple embeddings for better performance
  async batchEmbedTexts(texts, options = {}) {
    if (!Array.isArray(texts) || texts.length === 0) return [];

    const client = await getOllamaClient();
    const model = getOllamaEmbeddingModel() || 'mxbai-embed-large';
    const { buildOllamaOptions } = require('./PerformanceService');
    const perfOptions = await buildOllamaOptions('embeddings');

    // For single text, use regular embedding
    if (texts.length === 1) {
      const { embedding } = await client.embeddings({
        model,
        prompt: texts[0].slice(0, 8000),
        options: perfOptions,
      });
      return [{ vector: embedding, model }];
    }

    // For multiple texts, process them efficiently
    const results = [];
    for (const text of texts) {
      try {
        const { embedding } = await client.embeddings({
          model,
          prompt: text.slice(0, 8000),
          options: perfOptions,
        });
        results.push({ vector: embedding, model });
      } catch (error) {
        console.warn('[BATCH-EMBEDDING] Failed to embed text:', error.message);
        results.push({ vector: [], model, error: error.message });
      }
    }

    return results;
  }

  async embedText(text) {
    const client = await getOllamaClient();
    const model = getOllamaEmbeddingModel() || 'mxbai-embed-large';
    const { buildOllamaOptions } = require('./PerformanceService');
    const perfOptions = await buildOllamaOptions('embeddings');

    const { embedding } = await client.embeddings({
      model,
      prompt: text.slice(0, 8000),
      options: perfOptions,
    });
    return { vector: embedding, model };
  }

  async upsertFolderEmbedding(folder) {
    // Skip if we already have an embedding for this folder and description hasn't changed
    const existing = this.embeddingStore.folderVectors?.get?.(folder.id);
    if (
      existing &&
      existing.name === folder.name &&
      (existing.description || '') === (folder.description || '')
    ) {
      return existing;
    }
    const text = `${folder.name}\n${folder.description || ''}`.trim();
    const { vector, model } = await this.embedText(text);
    const payload = {
      id: folder.id,
      name: folder.name,
      description: folder.description || '',
      vector,
      model,
      updatedAt: new Date().toISOString(),
    };
    await this.embeddingStore.upsertFolder(payload);
    return payload;
  }

  async upsertFileEmbedding(fileId, contentSummary, fileMeta = {}) {
    const { vector, model } = await this.embedText(contentSummary || '');
    await this.embeddingStore.upsertFile({
      id: fileId,
      vector,
      model,
      meta: fileMeta,
      updatedAt: new Date().toISOString(),
    });
  }

  // Pre-warm folder embeddings to avoid delays during analysis
  async prewarmFolderEmbeddings(folders) {
    if (!folders || folders.length === 0) return;

    console.log(
      `[EMBEDDING-PREWARM] Pre-warming ${folders.length} folder embeddings...`,
    );

    try {
      // Check which folders need new embeddings
      const foldersToEmbed = [];
      for (const folder of folders) {
        const existing = this.embeddingStore.folderVectors?.get?.(folder.id);
        if (
          !existing ||
          existing.name !== folder.name ||
          (existing.description || '') !== (folder.description || '')
        ) {
          foldersToEmbed.push(folder);
        }
      }

      if (foldersToEmbed.length > 0) {
        console.log(
          `[EMBEDDING-PREWARM] Generating embeddings for ${foldersToEmbed.length} folders...`,
        );

        // Process in batches for better performance
        const batchSize = 3; // Process 3 folders at a time
        for (let i = 0; i < foldersToEmbed.length; i += batchSize) {
          const batch = foldersToEmbed.slice(i, i + batchSize);
          await Promise.all(batch.map((f) => this.upsertFolderEmbedding(f)));
        }

        console.log(
          `[EMBEDDING-PREWARM] Completed pre-warming ${foldersToEmbed.length} folder embeddings`,
        );
      } else {
        console.log(
          `[EMBEDDING-PREWARM] All ${folders.length} folder embeddings already up to date`,
        );
      }
    } catch (error) {
      console.warn(
        '[EMBEDDING-PREWARM] Failed to pre-warm folder embeddings:',
        error.message,
      );
    }
  }

  async matchFileToFolders(fileId, topK = 5) {
    return this.embeddingStore.queryFolders(fileId, topK);
  }
}

module.exports = FolderMatchingService;
