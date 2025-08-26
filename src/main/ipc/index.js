const registerFilesIpc = require('./files');
const registerSmartFoldersIpc = require('./smartFolders');
const registerUndoRedoIpc = require('./undoRedo');
const registerAnalysisHistoryIpc = require('./analysisHistory');
const registerSystemIpc = require('./system');
const registerOllamaIpc = require('./ollama');
const registerAnalysisIpc = require('./analysis');
const registerSettingsIpc = require('./settings');
const registerEmbeddingsIpc = require('./semantic');
const registerWindowIpc = require('./window');

function registerAllIpc({
  ipcMain,
  IPC_CHANNELS,
  logger,
  dialog,
  shell,
  systemAnalytics,
  getMainWindow,
  getServiceIntegration,
  getCustomFolders,
  setCustomFolders,
  saveCustomFolders,
  analyzeDocumentFile,
  analyzeImageFile,
  tesseract,
  getOllama,
  getOllamaModel,
  getOllamaVisionModel,
  getOllamaEmbeddingModel,
  getOllamaHost,
  buildOllamaOptions,
  scanDirectory,
  settingsService,
  setOllamaHost,
  setOllamaModel,
  setOllamaVisionModel,
  setOllamaEmbeddingModel,
  onSettingsChanged,
}) {
  // Helper: safely register IPC modules without failing the entire setup
  const safeRegister = (fn, payload, label) => {
    try {
      fn(payload);
    } catch (err) {
      const errorMessage = err?.message || String(err);
      logger?.error?.(`[IPC] ${label} registration failed:`, errorMessage);
      // Fail fast to surface misconfiguration in tests and CI
      throw new Error(`Registration failed: ${errorMessage}`);
    }
  };

  safeRegister(
    registerFilesIpc,
    {
      ipcMain,
      IPC_CHANNELS,
      logger,
      dialog,
      shell,
      systemAnalytics,
      getMainWindow,
      getServiceIntegration,
    },
    'files',
  );
  safeRegister(
    registerSmartFoldersIpc,
    {
      ipcMain,
      IPC_CHANNELS,
      logger,
      systemAnalytics,
      getCustomFolders,
      setCustomFolders,
      saveCustomFolders,
      buildOllamaOptions,
      getOllamaModel,
      scanDirectory,
    },
    'smartFolders',
  );
  safeRegister(
    registerUndoRedoIpc,
    { ipcMain, IPC_CHANNELS, logger, systemAnalytics, getServiceIntegration },
    'undoRedo',
  );
  safeRegister(
    registerAnalysisHistoryIpc,
    {
      ipcMain,
      IPC_CHANNELS,
      logger,
      systemAnalytics,
      getServiceIntegration,
    },
    'analysisHistory',
  );
  safeRegister(
    registerSystemIpc,
    {
      ipcMain,
      IPC_CHANNELS,
      logger,
      systemAnalytics,
      getServiceIntegration,
    },
    'system',
  );
  safeRegister(
    registerOllamaIpc,
    {
      ipcMain,
      IPC_CHANNELS,
      logger,
      systemAnalytics,
      getOllama,
      getOllamaModel,
      getOllamaVisionModel,
      getOllamaEmbeddingModel,
      getOllamaHost,
    },
    'ollama',
  );
  safeRegister(
    registerAnalysisIpc,
    {
      ipcMain,
      IPC_CHANNELS,
      logger,
      tesseract,
      systemAnalytics,
      analyzeDocumentFile,
      analyzeImageFile,
      getServiceIntegration,
      getCustomFolders,
    },
    'analysis',
  );
  safeRegister(
    registerSettingsIpc,
    {
      ipcMain,
      IPC_CHANNELS,
      logger,
      systemAnalytics,
      settingsService,
      setOllamaHost,
      setOllamaModel,
      setOllamaVisionModel,
      setOllamaEmbeddingModel,
      onSettingsChanged,
    },
    'settings',
  );
  safeRegister(
    registerEmbeddingsIpc,
    {
      ipcMain,
      IPC_CHANNELS,
      logger,
      systemAnalytics,
      getCustomFolders,
      getServiceIntegration,
    },
    'embeddings',
  );
  safeRegister(
    registerWindowIpc,
    { ipcMain, IPC_CHANNELS, logger, systemAnalytics, getMainWindow },
    'window',
  );
}

module.exports = { registerAllIpc };
