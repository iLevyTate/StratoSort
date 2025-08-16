const { getOllamaClient, getOllamaEmbeddingModel } = require('../ollamaUtils');

class FolderMatchingService {
  constructor(embeddingStore) {
    this.embeddingStore = embeddingStore; // must implement upsertFolder, upsertFile, queryFolders
  }

  async embedText(text) {
    const client = await getOllamaClient();
    const model = getOllamaEmbeddingModel() || 'mxbai-embed-large';
    const { embedding } = await client.embeddings({
      model,
      prompt: text.slice(0, 8000),
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

  async matchFileToFolders(fileId, topK = 5) {
    return this.embeddingStore.queryFolders(fileId, topK);
  }
}

module.exports = FolderMatchingService;
