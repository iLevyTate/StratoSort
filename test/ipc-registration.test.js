const { ipcMain, dialog, shell } = require('./mocks/electron');
const { registerAllIpc } = require('../src/main/ipc');

describe('IPC registration', () => {
  beforeEach(() => {
    ipcMain._handlers.clear();
    ipcMain.handle.mockClear();
  });

  test('registerAllIpc registers core channels', () => {
    const IPC_CHANNELS = require('../src/shared/constants').IPC_CHANNELS;
    registerAllIpc({
      ipcMain,
      IPC_CHANNELS,
      logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
      dialog,
      shell,
      systemAnalytics: { collectMetrics: jest.fn(async () => ({})) },
      getMainWindow: () => null,
      getServiceIntegration: () => ({
        undoRedo: {},
        analysisHistory: {},
        processingState: {},
      }),
      getCustomFolders: () => [],
      setCustomFolders: () => {},
      saveCustomFolders: async () => {},
      analyzeDocumentFile: async () => ({ success: true }),
      analyzeImageFile: async () => ({ success: true }),
      tesseract: { recognize: async () => 'text' },
      getOllama: () => ({ list: async () => ({ models: [] }) }),
      getOllamaModel: () => 'llama3.2:latest',
      getOllamaVisionModel: () => null,
      buildOllamaOptions: async () => ({}),
      scanDirectory: async () => [],
    });

    const expectedChannels = [
      // Files
      ...Object.values(IPC_CHANNELS.FILES),
      // Smart folders
      ...Object.values(IPC_CHANNELS.SMART_FOLDERS),
      // Undo/redo
      ...Object.values(IPC_CHANNELS.UNDO_REDO),
      // Analysis
      ...Object.values(IPC_CHANNELS.ANALYSIS),
      // Settings
      ...Object.values(IPC_CHANNELS.SETTINGS),
      // System
      ...Object.values(IPC_CHANNELS.SYSTEM),
      // Analysis history
      ...Object.values(IPC_CHANNELS.ANALYSIS_HISTORY),
      // Ollama
      ...Object.values(IPC_CHANNELS.OLLAMA),
    ];

    // Check that handlers are registered for expected channels
    const missing = expectedChannels.filter((ch) => !ipcMain._handlers.has(ch));
    expect(missing).toEqual([]);
  });
});
