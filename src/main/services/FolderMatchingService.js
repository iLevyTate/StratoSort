const { getOllama, getOllamaEmbeddingModel } = require('../ollamaUtils');
const crypto = require('crypto');
const { logger } = require('../../shared/logger');

class FolderMatchingService {
  constructor(chromaDbService) {
    this.chromaDbService = chromaDbService;
    this.ollama = null;
    this.modelName = '';
  }

  async embedText(text) {
    try {
      const ollama = getOllama();
      const model = getOllamaEmbeddingModel();

      const response = await ollama.embeddings({
        model,
        prompt: text || '',
      });

      return { vector: response.embedding, model };
    } catch (error) {
      logger.error(
        '[FolderMatchingService] Failed to generate embedding:',
        error,
      );
      // Return a zero vector as fallback
      return { vector: new Array(1024).fill(0), model: 'fallback' };
    }
  }

  /**
   * Generate a unique ID for a folder based on its properties
   */
  generateFolderId(folder) {
    const uniqueString = `${folder.name}|${folder.path || ''}|${folder.description || ''}`;
    return `folder:${crypto.createHash('md5').update(uniqueString).digest('hex')}`;
  }

  async upsertFolderEmbedding(folder) {
    try {
      const folderText = [folder.name, folder.description]
        .filter(Boolean)
        .join(' - ');

      const { vector, model } = await this.embedText(folderText);
      const folderId = folder.id || this.generateFolderId(folder);

      const payload = {
        id: folderId,
        name: folder.name,
        description: folder.description || '',
        path: folder.path || '',
        vector,
        model,
        updatedAt: new Date().toISOString(),
      };

      await this.chromaDbService.upsertFolder(payload);
      logger.debug('[FolderMatchingService] Upserted folder embedding', {
        id: folderId,
        name: folder.name,
      });

      return payload;
    } catch (error) {
      logger.error(
        '[FolderMatchingService] Failed to upsert folder embedding:',
        error,
      );
      throw error;
    }
  }

  async upsertFileEmbedding(fileId, contentSummary, fileMeta = {}) {
    try {
      const { vector, model } = await this.embedText(contentSummary || '');

      await this.chromaDbService.upsertFile({
        id: fileId,
        vector,
        model,
        meta: fileMeta,
        updatedAt: new Date().toISOString(),
      });

      logger.debug('[FolderMatchingService] Upserted file embedding', {
        id: fileId,
        path: fileMeta.path,
      });
    } catch (error) {
      logger.error(
        '[FolderMatchingService] Failed to upsert file embedding:',
        error,
      );
      throw error;
    }
  }

  async matchFileToFolders(fileId, topK = 5) {
    try {
      const results = await this.chromaDbService.queryFolders(fileId, topK);
      return results;
    } catch (error) {
      logger.error(
        '[FolderMatchingService] Failed to match file to folders:',
        error,
      );
      return [];
    }
  }

  /**
   * Find similar files to a given file
   */
  async findSimilarFiles(fileId, topK = 10) {
    try {
      // Get the file's embedding first
      const fileResult = await this.chromaDbService.fileCollection.get({
        ids: [fileId],
      });

      if (!fileResult.embeddings || fileResult.embeddings.length === 0) {
        logger.warn(
          '[FolderMatchingService] File not found for similarity search:',
          fileId,
        );
        return [];
      }

      const fileEmbedding = fileResult.embeddings[0];
      return await this.chromaDbService.querySimilarFiles(fileEmbedding, topK);
    } catch (error) {
      logger.error(
        '[FolderMatchingService] Failed to find similar files:',
        error,
      );
      return [];
    }
  }

  /**
   * Get database statistics
   */
  async getStats() {
    return await this.chromaDbService.getStats();
  }
}

module.exports = FolderMatchingService;
