const { getOllama, getOllamaEmbeddingModel } = require('../ollamaUtils');
const crypto = require('crypto');
const { logger } = require('../../shared/logger');

class FolderMatchingService {
  constructor(embeddingService) {
    this.embeddingService = embeddingService;
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
        vector,
        model,
        metadata: {
          name: folder.name,
          description: folder.description || '',
          path: folder.path || '',
        },
        updatedAt: new Date().toISOString(),
      };

      await this.embeddingService.upsertFolder(payload);
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

      await this.embeddingService.upsertFile({
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
      const results = await this.embeddingService.queryFolders(fileId, topK);
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
      // Use the EmbeddingService to find similar files
      const fileEmbedding = this.embeddingService.fileEmbeddings.get(fileId);
      if (!fileEmbedding || !fileEmbedding.vector) {
        logger.warn(
          '[FolderMatchingService] File not found for similarity search:',
          fileId,
        );
        return [];
      }

      return await this.embeddingService.queryFiles(
        { vector: fileEmbedding.vector },
        topK,
      );
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
    return {
      fileCount: this.embeddingService.fileEmbeddings.size,
      folderCount: this.embeddingService.folderEmbeddings.size,
    };
  }
}

module.exports = FolderMatchingService;
