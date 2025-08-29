const { getServiceIntegration } = require('../services/ServiceIntegration');
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
  // Provide IPC channels to preload script (for sandbox compatibility)
  if (ipcMain && ipcMain.on) {
    ipcMain.on('get-ipc-channels', (event) => {
      event.returnValue = IPC_CHANNELS;
    });
  }

  // Helper: register with proper error handling
  const criticalRegistrations = [];
  const safeRegister = (fn, payload, label, isCritical = false) => {
    try {
      fn(payload);
      logger.info(`[IPC] ${label} registered successfully`);
      return true;
    } catch (err) {
      const errorMessage = err?.message || String(err);
      logger.error(`[IPC] ${label} registration failed:`, errorMessage);

      if (isCritical) {
        criticalRegistrations.push({ label, error: errorMessage });
      }
      return false;
    }
  };

  // Register critical IPC channels
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
    true,
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
    true,
  );

  // Register non-critical IPC channels
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

  // Check for critical failures before registering non-critical modules
  if (criticalRegistrations.length > 0) {
    const errors = criticalRegistrations
      .map((r) => `${r.label}: ${r.error}`)
      .join('\n');
    throw new Error(`Critical IPC registrations failed:\n${errors}`);
  }

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
