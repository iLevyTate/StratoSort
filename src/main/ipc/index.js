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
}) {
  registerFilesIpc({
    ipcMain,
    IPC_CHANNELS,
    logger,
    dialog,
    shell,
    getMainWindow,
    getServiceIntegration,
  });
  registerSmartFoldersIpc({
    ipcMain,
    IPC_CHANNELS,
    logger,
    getCustomFolders,
    setCustomFolders,
    saveCustomFolders,
    buildOllamaOptions,
    getOllamaModel,
    scanDirectory,
  });
  registerUndoRedoIpc({ ipcMain, IPC_CHANNELS, logger, getServiceIntegration });
  registerAnalysisHistoryIpc({
    ipcMain,
    IPC_CHANNELS,
    logger,
    getServiceIntegration,
  });
  registerSystemIpc({
    ipcMain,
    IPC_CHANNELS,
    logger,
    systemAnalytics,
    getServiceIntegration,
  });
  registerOllamaIpc({
    ipcMain,
    IPC_CHANNELS,
    logger,
    systemAnalytics,
    getOllama,
    getOllamaModel,
    getOllamaVisionModel,
    getOllamaEmbeddingModel,
    getOllamaHost,
  });
  registerAnalysisIpc({
    ipcMain,
    IPC_CHANNELS,
    logger,
    tesseract,
    systemAnalytics,
    analyzeDocumentFile,
    analyzeImageFile,
    getServiceIntegration,
    getCustomFolders,
  });
  registerSettingsIpc({
    ipcMain,
    IPC_CHANNELS,
    logger,
    settingsService,
    setOllamaHost,
    setOllamaModel,
    setOllamaVisionModel,
    setOllamaEmbeddingModel,
  });
  registerEmbeddingsIpc({
    ipcMain,
    IPC_CHANNELS,
    logger,
    getCustomFolders,
    getServiceIntegration,
  });
  registerWindowIpc({ ipcMain, IPC_CHANNELS, logger, getMainWindow });
}

module.exports = { registerAllIpc };
