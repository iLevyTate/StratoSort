// Mock electron first, before any other imports
jest.mock('electron', () => ({
  ipcMain: {
    _handlers: new Map(),
    _eventHandlers: new Map(),
    handle: jest.fn(function (channel, handler) {
      this._handlers.set(channel, handler);
    }),
    on: jest.fn(function (channel, handler) {
      if (!this._eventHandlers.has(channel)) {
        this._eventHandlers.set(channel, []);
      }
      this._eventHandlers.get(channel).push(handler);
    }),
    removeHandler: jest.fn(),
  },
}));

// Mock all IPC registration functions at module level
jest.mock('../src/main/ipc/files', () => jest.fn());
jest.mock('../src/main/ipc/smartFolders', () => jest.fn());
jest.mock('../src/main/ipc/undoRedo', () => jest.fn());
jest.mock('../src/main/ipc/analysisHistory', () => jest.fn());
jest.mock('../src/main/ipc/system', () => jest.fn());
jest.mock('../src/main/ipc/ollama', () => jest.fn());
jest.mock('../src/main/ipc/analysis', () => jest.fn());
jest.mock('../src/main/ipc/settings', () => jest.fn());
jest.mock('../src/main/ipc/semantic', () => jest.fn());
jest.mock('../src/main/ipc/window', () => jest.fn());

const { registerAllIpc } = require('../src/main/ipc/index');

// Import the mocked functions
const registerFilesIpc = require('../src/main/ipc/files');
const registerSmartFoldersIpc = require('../src/main/ipc/smartFolders');
const registerUndoRedoIpc = require('../src/main/ipc/undoRedo');
const registerAnalysisHistoryIpc = require('../src/main/ipc/analysisHistory');
const registerSystemIpc = require('../src/main/ipc/system');
const registerOllamaIpc = require('../src/main/ipc/ollama');
const registerAnalysisIpc = require('../src/main/ipc/analysis');
const registerSettingsIpc = require('../src/main/ipc/settings');
const registerEmbeddingsIpc = require('../src/main/ipc/semantic');
const registerWindowIpc = require('../src/main/ipc/window');

describe('IPC registration', () => {
  let mockIpcMain;
  let mockLogger;
  let mockDependencies;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock IPC main
    mockIpcMain = {
      handle: jest.fn(),
    };

    // Mock logger
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
    };

    // Mock all dependencies
    mockDependencies = {
      ipcMain: mockIpcMain,
      IPC_CHANNELS: {
        FILES: {},
        SMART_FOLDERS: {},
        UNDO_REDO: {},
        ANALYSIS_HISTORY: {},
        SYSTEM: {},
        OLLAMA: {},
        ANALYSIS: {},
        SETTINGS: {},
        EMBEDDINGS: {
          REBUILD_FOLDERS: 'embeddings:rebuild-folders',
        },
        SEMANTIC: {},
        WINDOW: {},
      },
      logger: mockLogger,
      dialog: {},
      shell: {},
      systemAnalytics: {},
      getMainWindow: jest.fn(),
      getServiceIntegration: jest.fn(),
      getCustomFolders: jest.fn(),
      setCustomFolders: jest.fn(),
      saveCustomFolders: jest.fn(),
      analyzeDocumentFile: jest.fn(),
      analyzeImageFile: jest.fn(),
      tesseract: {},
      getOllama: jest.fn(),
      getOllamaModel: jest.fn(),
      getOllamaVisionModel: jest.fn(),
      getOllamaEmbeddingModel: jest.fn(),
      getOllamaHost: jest.fn(),
      buildOllamaOptions: jest.fn(),
      scanDirectory: jest.fn(),
      settingsService: {},
      setOllamaHost: jest.fn(),
      setOllamaModel: jest.fn(),
      setOllamaVisionModel: jest.fn(),
      setOllamaEmbeddingModel: jest.fn(),
      onSettingsChanged: jest.fn(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  test('registers all IPC modules with correct dependencies', async () => {
    // Register all IPC handlers
    registerAllIpc(mockDependencies);

    // Verify each module was called with the correct subset of dependencies
    expect(registerFilesIpc).toHaveBeenCalledWith({
      ipcMain: mockIpcMain,
      IPC_CHANNELS: mockDependencies.IPC_CHANNELS,
      logger: mockLogger,
      systemAnalytics: mockDependencies.systemAnalytics,
      dialog: mockDependencies.dialog,
      shell: mockDependencies.shell,
      getMainWindow: mockDependencies.getMainWindow,
      getServiceIntegration: mockDependencies.getServiceIntegration,
      ipcMonitor: expect.any(Object), // Added ipcMonitor parameter
    });

    expect(registerSmartFoldersIpc).toHaveBeenCalledWith({
      ipcMain: mockIpcMain,
      IPC_CHANNELS: mockDependencies.IPC_CHANNELS,
      logger: mockLogger,
      systemAnalytics: mockDependencies.systemAnalytics,
      getCustomFolders: mockDependencies.getCustomFolders,
      setCustomFolders: mockDependencies.setCustomFolders,
      saveCustomFolders: mockDependencies.saveCustomFolders,
      buildOllamaOptions: mockDependencies.buildOllamaOptions,
      ipcMonitor: expect.any(Object), // Added ipcMonitor parameter
      getOllamaModel: mockDependencies.getOllamaModel,
      scanDirectory: mockDependencies.scanDirectory,
    });

    expect(registerUndoRedoIpc).toHaveBeenCalledWith({
      ipcMain: mockIpcMain,
      IPC_CHANNELS: mockDependencies.IPC_CHANNELS,
      logger: mockLogger,
      systemAnalytics: mockDependencies.systemAnalytics,
      getServiceIntegration: mockDependencies.getServiceIntegration,
      ipcMonitor: expect.any(Object), // Added ipcMonitor parameter
    });

    expect(registerAnalysisHistoryIpc).toHaveBeenCalledWith({
      ipcMain: mockIpcMain,
      IPC_CHANNELS: mockDependencies.IPC_CHANNELS,
      logger: mockLogger,
      systemAnalytics: mockDependencies.systemAnalytics,
      getServiceIntegration: mockDependencies.getServiceIntegration,
      ipcMonitor: expect.any(Object), // Added ipcMonitor parameter
    });

    expect(registerSystemIpc).toHaveBeenCalledWith({
      ipcMain: mockIpcMain,
      IPC_CHANNELS: mockDependencies.IPC_CHANNELS,
      logger: mockLogger,
      systemAnalytics: mockDependencies.systemAnalytics,
      getServiceIntegration: mockDependencies.getServiceIntegration,
      ipcMonitor: expect.any(Object), // Added ipcMonitor parameter
    });

    expect(registerOllamaIpc).toHaveBeenCalledWith({
      ipcMain: mockIpcMain,
      IPC_CHANNELS: mockDependencies.IPC_CHANNELS,
      logger: mockLogger,
      systemAnalytics: mockDependencies.systemAnalytics,
      getOllama: mockDependencies.getOllama,
      getOllamaModel: mockDependencies.getOllamaModel,
      getOllamaVisionModel: mockDependencies.getOllamaVisionModel,
      getOllamaEmbeddingModel: mockDependencies.getOllamaEmbeddingModel,
      getOllamaHost: mockDependencies.getOllamaHost,
      ipcMonitor: expect.any(Object), // Added ipcMonitor parameter
    });

    expect(registerAnalysisIpc).toHaveBeenCalledWith({
      ipcMain: mockIpcMain,
      IPC_CHANNELS: mockDependencies.IPC_CHANNELS,
      logger: mockLogger,
      tesseract: mockDependencies.tesseract,
      systemAnalytics: mockDependencies.systemAnalytics,
      analyzeDocumentFile: mockDependencies.analyzeDocumentFile,
      analyzeImageFile: mockDependencies.analyzeImageFile,
      getServiceIntegration: mockDependencies.getServiceIntegration,
      getCustomFolders: mockDependencies.getCustomFolders,
      ipcMonitor: expect.any(Object), // Added ipcMonitor parameter
    });

    expect(registerSettingsIpc).toHaveBeenCalledWith({
      ipcMain: mockIpcMain,
      IPC_CHANNELS: mockDependencies.IPC_CHANNELS,
      logger: mockLogger,
      systemAnalytics: mockDependencies.systemAnalytics,
      settingsService: mockDependencies.settingsService,
      setOllamaHost: mockDependencies.setOllamaHost,
      setOllamaModel: mockDependencies.setOllamaModel,
      setOllamaVisionModel: mockDependencies.setOllamaVisionModel,
      setOllamaEmbeddingModel: mockDependencies.setOllamaEmbeddingModel,
      onSettingsChanged: mockDependencies.onSettingsChanged,
      ipcMonitor: expect.any(Object), // Added ipcMonitor parameter
    });

    expect(registerEmbeddingsIpc).toHaveBeenCalledWith({
      ipcMain: mockIpcMain,
      IPC_CHANNELS: mockDependencies.IPC_CHANNELS,
      logger: mockLogger,
      systemAnalytics: mockDependencies.systemAnalytics,
      getCustomFolders: mockDependencies.getCustomFolders,
      getServiceIntegration: mockDependencies.getServiceIntegration,
      ipcMonitor: expect.any(Object), // Added ipcMonitor parameter
    });

    expect(registerWindowIpc).toHaveBeenCalledWith({
      ipcMain: mockIpcMain,
      IPC_CHANNELS: mockDependencies.IPC_CHANNELS,
      logger: mockLogger,
      systemAnalytics: mockDependencies.systemAnalytics,
      getMainWindow: mockDependencies.getMainWindow,
      ipcMonitor: expect.any(Object), // Added ipcMonitor parameter
    });
  });

  test('handles missing dependencies gracefully', () => {
    // Remove some dependencies
    const incompleteDependencies = {
      ipcMain: mockIpcMain,
      IPC_CHANNELS: mockDependencies.IPC_CHANNELS,
      logger: mockLogger,
      // Missing other dependencies
    };

    expect(() => {
      registerAllIpc(incompleteDependencies);
    }).not.toThrow();
  });

  test('exports registerAllIpc function', () => {
    expect(typeof registerAllIpc).toBe('function');
  });

  test('does not throw when individual module registration fails', () => {
    // Mock one module to throw
    registerFilesIpc.mockImplementation(() => {
      throw new Error('Registration failed');
    });

    // The function should throw when a module registration fails
    expect(() => {
      registerAllIpc(mockDependencies);
    }).toThrow('Registration failed');

    // Other modules should NOT be called when one fails
    expect(registerWindowIpc).not.toHaveBeenCalled();
  });

  test('calls modules in the correct order', () => {
    const callOrder = [];

    // Reset call order and set up tracking
    registerFilesIpc.mockImplementation(() => callOrder.push('files'));
    registerSmartFoldersIpc.mockImplementation(() =>
      callOrder.push('smartFolders'),
    );
    registerUndoRedoIpc.mockImplementation(() => callOrder.push('undoRedo'));
    registerAnalysisHistoryIpc.mockImplementation(() =>
      callOrder.push('analysisHistory'),
    );
    registerSystemIpc.mockImplementation(() => callOrder.push('system'));
    registerOllamaIpc.mockImplementation(() => callOrder.push('ollama'));
    registerAnalysisIpc.mockImplementation(() => callOrder.push('analysis'));
    registerSettingsIpc.mockImplementation(() => callOrder.push('settings'));
    registerEmbeddingsIpc.mockImplementation(() => callOrder.push('semantic'));
    registerWindowIpc.mockImplementation(() => callOrder.push('window'));

    registerAllIpc(mockDependencies);

    expect(callOrder).toEqual([
      'files',
      'smartFolders',
      'undoRedo',
      'analysisHistory',
      'system',
      'ollama',
      'analysis',
      'settings',
      'semantic',
      'window',
    ]);
  });
});
