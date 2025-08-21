const { app } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../../shared/logger');
const { backupAndReplace } = require('../../shared/atomicFileOperations');

/**
 * JSON-based Vector Storage Service
 * Lightweight replacement for ChromaDB using file-based storage
 */
class EmbeddingIndexService {
  constructor() {
    this.dataPath = path.join(app.getPath('userData'), 'embeddings');
    this.fileIndexPath = path.join(this.dataPath, 'file_embeddings.json');
    this.folderIndexPath = path.join(this.dataPath, 'folder_embeddings.json');
    this.fileEmbeddings = new Map();
    this.folderEmbeddings = new Map();
    this.initialized = false;
  }

  async ensureDataDirectory() {
    try {
      await fs.mkdir(this.dataPath, { recursive: true });
    } catch (error) {
      logger.error('[EmbeddingIndex] Failed to create data directory:', error);
      throw error;
    }
  }

  async initialize() {
    if (this.initialized) return;

    try {
      await this.ensureDataDirectory();
      await this.loadExistingData();
      this.initialized = true;
      logger.info(
        '[EmbeddingIndex] Successfully initialized JSON-based storage',
        {
          dataPath: this.dataPath,
          fileCount: this.fileEmbeddings.size,
          folderCount: this.folderEmbeddings.size,
        },
      );
    } catch (error) {
      logger.error('[EmbeddingIndex] Initialization failed:', error);
      throw new Error(`Failed to initialize EmbeddingIndex: ${error.message}`);
    }
  }

  async loadExistingData() {
    try {
      // Load file embeddings
      try {
        const fileData = await fs.readFile(this.fileIndexPath, 'utf8');
        const fileEntries = JSON.parse(fileData);
        this.fileEmbeddings = new Map(Object.entries(fileEntries));
      } catch (error) {
        if (error.code !== 'ENOENT') {
          logger.warn(
            '[EmbeddingIndex] Failed to load file embeddings:',
            error.message,
          );
        }
      }

      // Load folder embeddings
      try {
        const folderData = await fs.readFile(this.folderIndexPath, 'utf8');
        const folderEntries = JSON.parse(folderData);
        this.folderEmbeddings = new Map(Object.entries(folderEntries));
      } catch (error) {
        if (error.code !== 'ENOENT') {
          logger.warn(
            '[EmbeddingIndex] Failed to load folder embeddings:',
            error.message,
          );
        }
      }
    } catch (error) {
      logger.error('[EmbeddingIndex] Failed to load existing data:', error);
    }
  }

  async saveData() {
    try {
      // Save file embeddings
      const fileData = JSON.stringify(
        Object.fromEntries(this.fileEmbeddings),
        null,
        2,
      );
      const fileResult = await backupAndReplace(this.fileIndexPath, fileData);
      if (!fileResult.success) {
        throw new Error(`Failed to save file embeddings: ${fileResult.error}`);
      }

      // Save folder embeddings
      const folderData = JSON.stringify(
        Object.fromEntries(this.folderEmbeddings),
        null,
        2,
      );
      const folderResult = await backupAndReplace(
        this.folderIndexPath,
        folderData,
      );
      if (!folderResult.success) {
        throw new Error(
          `Failed to save folder embeddings: ${folderResult.error}`,
        );
      }
    } catch (error) {
      logger.error('[EmbeddingIndex] Failed to save data:', error);
      throw error;
    }
  }

  async upsertFolder(folder) {
    await this.initialize();

    try {
      if (!folder.id || !folder.vector || !Array.isArray(folder.vector)) {
        throw new Error('Invalid folder data: missing id or vector');
      }

      this.folderEmbeddings.set(folder.id, {
        id: folder.id,
        vector: folder.vector,
        metadata: folder.metadata || {},
        model: folder.model || '',
        updatedAt: folder.updatedAt || new Date().toISOString(),
      });

      await this.saveData();
      logger.debug('[EmbeddingIndex] Upserted folder embedding', {
        id: folder.id,
      });
    } catch (error) {
      logger.error('[EmbeddingIndex] Failed to upsert folder:', error);
      throw error;
    }
  }

  async upsertFile(file) {
    await this.initialize();

    try {
      if (!file.id || !file.vector || !Array.isArray(file.vector)) {
        throw new Error('Invalid file data: missing id or vector');
      }

      this.fileEmbeddings.set(file.id, {
        id: file.id,
        vector: file.vector,
        meta: file.meta || {},
        model: file.model || '',
        updatedAt: file.updatedAt || new Date().toISOString(),
      });

      await this.saveData();
      logger.debug('[EmbeddingIndex] Upserted file embedding', {
        id: file.id,
        path: file.meta?.path,
      });
    } catch (error) {
      logger.error('[EmbeddingIndex] Failed to upsert file:', error);
      throw error;
    }
  }

  // Simple cosine similarity calculation
  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async queryFolders(fileId, topK = 5) {
    await this.initialize();

    try {
      const fileEntry = this.fileEmbeddings.get(fileId);
      if (!fileEntry || !fileEntry.vector) {
        return [];
      }

      const results = [];
      for (const [folderId, folderEntry] of this.folderEmbeddings) {
        if (folderEntry.vector) {
          const similarity = this.cosineSimilarity(
            fileEntry.vector,
            folderEntry.vector,
          );
          results.push({
            id: folderId,
            score: similarity,
            metadata: folderEntry.metadata,
          });
        }
      }

      // Sort by similarity score (descending) and take top K
      return results.sort((a, b) => b.score - a.score).slice(0, topK);
    } catch (error) {
      logger.error('[EmbeddingIndex] Failed to query folders:', error);
      return [];
    }
  }

  async queryFiles(query, topK = 5) {
    await this.initialize();

    try {
      if (!query.vector || !Array.isArray(query.vector)) {
        return [];
      }

      const results = [];
      for (const [fileId, fileEntry] of this.fileEmbeddings) {
        if (fileEntry.vector) {
          const similarity = this.cosineSimilarity(
            query.vector,
            fileEntry.vector,
          );
          results.push({
            id: fileId,
            score: similarity,
            metadata: fileEntry.meta,
          });
        }
      }

      // Sort by similarity score (descending) and take top K
      return results.sort((a, b) => b.score - a.score).slice(0, topK);
    } catch (error) {
      logger.error('[EmbeddingIndex] Failed to query files:', error);
      return [];
    }
  }

  async deleteFolder(folderId) {
    await this.initialize();

    try {
      this.folderEmbeddings.delete(folderId);
      await this.saveData();
      logger.debug('[EmbeddingIndex] Deleted folder embedding', {
        id: folderId,
      });
    } catch (error) {
      logger.error('[EmbeddingIndex] Failed to delete folder:', error);
      throw error;
    }
  }

  async deleteFile(fileId) {
    await this.initialize();

    try {
      this.fileEmbeddings.delete(fileId);
      await this.saveData();
      logger.debug('[EmbeddingIndex] Deleted file embedding', { id: fileId });
    } catch (error) {
      logger.error('[EmbeddingIndex] Failed to delete file:', error);
      throw error;
    }
  }

  async cleanup() {
    try {
      await this.saveData();
      this.fileEmbeddings.clear();
      this.folderEmbeddings.clear();
      this.initialized = false;
      logger.info('[EmbeddingIndex] Cleaned up connections');
    } catch (error) {
      logger.error('[EmbeddingIndex] Cleanup failed:', error);
    }
  }
}

// Export as singleton to maintain single storage instance
let instance = null;

module.exports = {
  EmbeddingIndexService,
  getInstance: () => {
    if (!instance) {
      instance = new EmbeddingIndexService();
    }
    return instance;
  },
};
