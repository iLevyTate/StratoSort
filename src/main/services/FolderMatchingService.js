const { getOllamaClient, getOllamaEmbeddingModel } = require('../ollamaUtils');
const crypto = require('crypto');

class FolderMatchingService {
  constructor(embeddingStore) {
    this.embeddingStore = embeddingStore; // must implement upsertFolder, upsertFile, queryFolders
    this._embedMemo = new Map(); // sha1(text) -> { vector, model }
    this._embedMemoMax = 200;
  }

  async embedText(text) {
    const normalized = (text || '').slice(0, 8000);
    const key = crypto.createHash('sha1').update(normalized).digest('hex');
    if (this._embedMemo.has(key)) {
      return this._embedMemo.get(key);
    }
    const client = await getOllamaClient();
    const model = getOllamaEmbeddingModel() || 'mxbai-embed-large';
    const { embedding } = await client.embeddings({
      model,
      prompt: normalized,
    });
    const result = { vector: embedding, model };
    this._embedMemo.set(key, result);
    if (this._embedMemo.size > this._embedMemoMax) {
      const first = this._embedMemo.keys().next().value;
      this._embedMemo.delete(first);
    }
    return result;
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

  async matchFileToFolders(fileId, topK = 5) {
    return this.embeddingStore.queryFolders(fileId, topK);
  }
}

module.exports = FolderMatchingService;
