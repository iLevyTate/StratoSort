const registerFilesIpc = require('./files');
const registerSmartFoldersIpc = require('./smartFolders');
const registerUndoRedoIpc = require('./undoRedo');
const registerAnalysisHistoryIpc = require('./analysisHistory');
const registerSystemIpc = require('./system');
const registerOllamaIpc = require('./ollama');
const registerAnalysisIpc = require('./analysis');
const registerSettingsIpc = require('./settings');

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
  buildOllamaOptions,
  scanDirectory,
  settingsService,
  setOllamaHost,
  setOllamaModel,
  setOllamaVisionModel,
}) {
  registerFilesIpc({ ipcMain, IPC_CHANNELS, logger, dialog, shell, getMainWindow, getServiceIntegration });
  registerSmartFoldersIpc({ ipcMain, IPC_CHANNELS, logger, getCustomFolders, setCustomFolders, saveCustomFolders, buildOllamaOptions, getOllamaModel, scanDirectory });
  registerUndoRedoIpc({ ipcMain, IPC_CHANNELS, logger, getServiceIntegration });
  registerAnalysisHistoryIpc({ ipcMain, IPC_CHANNELS, logger, getServiceIntegration });
  registerSystemIpc({ ipcMain, IPC_CHANNELS, logger, systemAnalytics, getServiceIntegration });
  registerOllamaIpc({ ipcMain, IPC_CHANNELS, logger, systemAnalytics, getOllama, getOllamaModel, getOllamaVisionModel });
  registerAnalysisIpc({ ipcMain, IPC_CHANNELS, logger, tesseract, systemAnalytics, analyzeDocumentFile, analyzeImageFile, getServiceIntegration, getCustomFolders });
  registerSettingsIpc({ ipcMain, IPC_CHANNELS, logger, settingsService, setOllamaHost, setOllamaModel, setOllamaVisionModel });
}

module.exports = { registerAllIpc };


