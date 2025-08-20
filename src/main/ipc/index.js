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
const { registerSuggestionsIpc } = require('./suggestions');
const { registerOrganizeIpc } = require('./organize');

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
    getMainWindow,
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
    onSettingsChanged,
  });
  registerEmbeddingsIpc({
    ipcMain,
    IPC_CHANNELS,
    logger,
    getCustomFolders,
    getServiceIntegration,
  });
  registerWindowIpc({ ipcMain, IPC_CHANNELS, logger, getMainWindow });

  // Register suggestions IPC with required services
  if (getServiceIntegration) {
    const serviceIntegration = getServiceIntegration();
    if (
      serviceIntegration.chromaDbService &&
      serviceIntegration.folderMatchingService
    ) {
      registerSuggestionsIpc({
        ipcMain,
        IPC_CHANNELS,
        chromaDbService: serviceIntegration.chromaDbService,
        folderMatchingService: serviceIntegration.folderMatchingService,
        settingsService,
        getCustomFolders,
      });
    }

    // Register organize IPC
    registerOrganizeIpc({
      ipcMain,
      IPC_CHANNELS,
      getServiceIntegration,
      getCustomFolders,
    });
  }
}

module.exports = { registerAllIpc };
