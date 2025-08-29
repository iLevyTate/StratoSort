const { getOllamaClient, getOllamaEmbeddingModel } = require('../ollamaUtils');
const { buildOllamaOptions } = require('./PerformanceService');
const crypto = require('crypto');
const { logger } = require('../../shared/logger');

// Helper function to compute content hash
function computeHash(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

class FolderMatchingService {
  constructor(embeddingStore) {
    this.embeddingStore = embeddingStore; // must implement upsertFolder, upsertFile, queryFolders
  }

  async embedText(text) {
    try {
      const client = await getOllamaClient();
      const model = getOllamaEmbeddingModel() || 'mxbai-embed-large';
      // Get GPU-optimized performance options for embeddings and favour GPU
      const perfOptions = await buildOllamaOptions('embeddings');
      // Limit embedding input size to avoid oversized requests
      const promptText = (text || '').slice(0, 2048);

      const { embedding } = await client.embeddings({
        model,
        prompt: promptText,
        options: { ...perfOptions }, // Include GPU optimizations
      });
      return { vector: embedding, model };
    } catch (error) {
      logger.error('[FolderMatching] Embedding failed:', error.message);
      throw error;
    }
  }

  async upsertFolderEmbedding(folder) {
    const text = `${folder.name}\n${folder.description || ''}`.trim();
    const hash = computeHash(text);

    // Skip if we already have an embedding for this folder and content hash matches
    const existing = this.embeddingStore.folderVectors?.get?.(folder.id);
    if (
      existing &&
      existing.name === folder.name &&
      (existing.description || '') === (folder.description || '') &&
      existing.meta?.hash === hash
    ) {
      return existing;
    }

    const { vector, model } = await this.embedText(text);
    const payload = {
      id: folder.id,
      name: folder.name,
      description: folder.description || '',
      vector,
      model,
      meta: { hash },
      updatedAt: new Date().toISOString(),
    };
    await this.embeddingStore.upsertFolder(payload);
    return payload;
  }

  async upsertFileEmbedding(fileId, contentSummary, fileMeta = {}) {
    const summary = contentSummary || '';
    // Compute a lightweight content fingerprint to avoid re-embedding unchanged content
    const hash = computeHash(summary);

    // If an existing embedding exists and the fingerprint matches, skip re-embedding
    const existing = this.embeddingStore.fileVectors?.get?.(fileId);
    if (
      existing &&
      existing.meta &&
      existing.meta.hash &&
      existing.meta.hash === hash
    ) {
      return existing;
    }

    const { vector, model } = await this.embedText(summary);
    const payload = {
      id: fileId,
      vector,
      model,
      meta: { ...(fileMeta || {}), hash },
      updatedAt: new Date().toISOString(),
    };
    await this.embeddingStore.upsertFile(payload);
    return payload;
  }

  async matchFileToFolders(fileId, topK = 5) {
    try {
      return await this.embeddingStore.queryFolders(fileId, topK);
    } catch (error) {
      logger.error('[FolderMatching] Query folders failed:', error);
      return [];
    }
  }
}

module.exports = FolderMatchingService;
