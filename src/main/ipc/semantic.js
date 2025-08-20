const { getInstance: getChromaDB } = require('../services/ChromaDBService');
const FolderMatchingService = require('../services/FolderMatchingService');
const path = require('path');
const { SUPPORTED_IMAGE_EXTENSIONS } = require('../../shared/constants');
const { withErrorLogging } = require('./withErrorLogging');
const { logger } = require('../../shared/logger');

function registerEmbeddingsIpc({
  ipcMain,
  IPC_CHANNELS,
  logger,
  getCustomFolders,
  getServiceIntegration,
}) {
  // Use ChromaDB singleton instance
  const chromaDbService = getChromaDB();
  const folderMatcher = new FolderMatchingService(chromaDbService);

  // Initialize ChromaDB and migrate existing data on startup
  (async () => {
    try {
      await chromaDbService.initialize();

      // Attempt to migrate existing JSONL data if present
      const { app } = require('electron');
      const basePath = path.join(app.getPath('userData'), 'embeddings');
      const filesPath = path.join(basePath, 'file-embeddings.jsonl');
      const foldersPath = path.join(basePath, 'folder-embeddings.jsonl');

      const filesMigrated = await chromaDbService.migrateFromJsonl(
        filesPath,
        'file',
      );
      const foldersMigrated = await chromaDbService.migrateFromJsonl(
        foldersPath,
        'folder',
      );

      if (filesMigrated > 0 || foldersMigrated > 0) {
        logger.info('[ChromaDB] Migration complete', {
          files: filesMigrated,
          folders: foldersMigrated,
        });
      }
    } catch (error) {
      logger.error('[ChromaDB] Initialization/migration failed:', error);
    }
  })();

  ipcMain.handle(
    IPC_CHANNELS.EMBEDDINGS.REBUILD_FOLDERS,
    withErrorLogging(logger, async () => {
      try {
        const smartFolders = getCustomFolders().filter((f) => f && f.name);
        await chromaDbService.resetFolders();

        // Re-index all smart folders
        await Promise.all(
          smartFolders.map((f) => folderMatcher.upsertFolderEmbedding(f)),
        );

        return { success: true, folders: smartFolders.length };
      } catch (e) {
        logger.error('[EMBEDDINGS] Rebuild folders failed:', e);
        return { success: false, error: e.message };
      }
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.EMBEDDINGS.REBUILD_FILES,
    withErrorLogging(logger, async () => {
      try {
        const serviceIntegration =
          getServiceIntegration && getServiceIntegration();
        const historyService = serviceIntegration?.analysisHistory;

        if (!historyService?.getRecentAnalysis) {
          return {
            success: false,
            error: 'Analysis history service unavailable',
          };
        }

        // Load all history entries (bounded by service defaults if any)
        const allEntries = await historyService.getRecentAnalysis(
          Number.MAX_SAFE_INTEGER,
        );

        const smartFolders = (
          typeof getCustomFolders === 'function' ? getCustomFolders() : []
        ).filter((f) => f && f.name);

        // Ensure folder embeddings exist before matching
        if (smartFolders.length > 0) {
          await Promise.all(
            smartFolders.map((f) => folderMatcher.upsertFolderEmbedding(f)),
          );
        }

        // Reset file vectors to rebuild from scratch
        await chromaDbService.resetFiles();

        let rebuilt = 0;
        for (const entry of allEntries) {
          try {
            const filePath = entry.originalPath;
            const ext = (path.extname(filePath) || '').toLowerCase();
            const isImage = SUPPORTED_IMAGE_EXTENSIONS.includes(ext);
            const fileId = `${isImage ? 'image' : 'file'}:${filePath}`;

            const summary = [
              entry.analysis?.subject,
              entry.analysis?.summary,
              Array.isArray(entry.analysis?.tags)
                ? entry.analysis.tags.join(' ')
                : '',
              entry.analysis?.extractedText
                ? String(entry.analysis.extractedText).slice(0, 2000)
                : '',
            ]
              .filter(Boolean)
              .join('\n');

            await folderMatcher.upsertFileEmbedding(fileId, summary, {
              path: filePath,
              name: path.basename(filePath),
              type: isImage ? 'image' : 'document',
            });

            rebuilt += 1;
          } catch (e) {
            logger.warn(
              '[EMBEDDINGS] Failed to rebuild file entry:',
              e.message,
            );
            // continue on individual entry failure
          }
        }

        return { success: true, files: rebuilt };
      } catch (e) {
        logger.error('[EMBEDDINGS] Rebuild files failed:', e);
        return { success: false, error: e.message };
      }
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.EMBEDDINGS.CLEAR_STORE,
    withErrorLogging(logger, async () => {
      try {
        await chromaDbService.resetAll();
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }),
  );

  // New endpoint for getting vector DB statistics
  ipcMain.handle(
    IPC_CHANNELS.EMBEDDINGS.GET_STATS,
    withErrorLogging(logger, async () => {
      try {
        const stats = await chromaDbService.getStats();
        return { success: true, ...stats };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }),
  );

  // New endpoint for finding similar documents
  ipcMain.handle(
    IPC_CHANNELS.EMBEDDINGS.FIND_SIMILAR,
    withErrorLogging(logger, async (event, { fileId, topK = 10 }) => {
      try {
        if (!fileId) {
          return { success: false, error: 'File ID is required' };
        }

        const similarFiles = await folderMatcher.findSimilarFiles(fileId, topK);
        return { success: true, results: similarFiles };
      } catch (e) {
        logger.error('[EMBEDDINGS] Find similar failed:', e);
        return { success: false, error: e.message };
      }
    }),
  );

  // Cleanup on app quit
  const { app } = require('electron');
  app.on('before-quit', async () => {
    try {
      await chromaDbService.cleanup();
    } catch (error) {
      logger.error('[ChromaDB] Cleanup error:', error);
    }
  });
}

module.exports = registerEmbeddingsIpc;
