const EmbeddingIndexService = require('../services/EmbeddingIndexService');
const FolderMatchingService = require('../services/FolderMatchingService');
const { analyzeDocumentFile } = require('../analysis/ollamaDocumentAnalysis');

function registerEmbeddingsIpc({ ipcMain, IPC_CHANNELS, logger, getCustomFolders }) {
  const embeddingIndex = new EmbeddingIndexService();
  const folderMatcher = new FolderMatchingService(embeddingIndex);

  ipcMain.handle(IPC_CHANNELS.EMBEDDINGS.REBUILD_FOLDERS, async () => {
    try {
      const smartFolders = getCustomFolders().filter(f => f && f.name);
      await Promise.all(smartFolders.map(f => folderMatcher.upsertFolderEmbedding(f)));
      return { success: true, folders: smartFolders.length };
    } catch (e) {
      logger.error('[EMBEDDINGS] Rebuild folders failed:', e);
      return { success: false, error: e.message };
    }
  });

  // Placeholder: REBUILD_FILES would require a list of files and summaries; wiring later if needed
  ipcMain.handle(IPC_CHANNELS.EMBEDDINGS.REBUILD_FILES, async () => {
    return { success: true, files: 0 };
  });

  ipcMain.handle(IPC_CHANNELS.EMBEDDINGS.CLEAR_STORE, async () => {
    try {
      await embeddingIndex.initialize();
      embeddingIndex.fileVectors.clear();
      embeddingIndex.folderVectors.clear();
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
}

module.exports = registerEmbeddingsIpc;


