const EmbeddingIndexService = require('../services/EmbeddingIndexService');
const FolderMatchingService = require('../services/FolderMatchingService');
const path = require('path');
const { SUPPORTED_IMAGE_EXTENSIONS } = require('../../shared/constants');
const { withErrorLogging } = require('./withErrorLogging');

function registerEmbeddingsIpc({
  ipcMain,
  IPC_CHANNELS,
  logger,
  systemAnalytics,
  getCustomFolders,
  getServiceIntegration,
}) {
  const embeddingIndex = new EmbeddingIndexService();
  const folderMatcher = new FolderMatchingService(embeddingIndex);

  // Return the embedding index for cleanup purposes
  registerEmbeddingsIpc.embeddingIndex = embeddingIndex;

  ipcMain.handle(
    IPC_CHANNELS.EMBEDDINGS.REBUILD_FOLDERS,
    withErrorLogging(logger, async () => {
      try {
        const smartFolders = getCustomFolders().filter((f) => f && f.name);
        await embeddingIndex.resetFolders();
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
        await embeddingIndex.resetFiles();

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
            });
            rebuilt += 1;
          } catch (e) {
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
        await embeddingIndex.resetAll();
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }),
  );
}

module.exports = registerEmbeddingsIpc;
