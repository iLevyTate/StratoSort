/**
 * Electron Renderer Process Mock
 * Simulates the IPC bridge exposed by the preload script for renderer testing
 */

// Mock the API exposed by the preload script (window.electron)
const mockElectronAPI = {
  // IPC Renderer API
  ipcRenderer: {
    send: jest.fn(),
    sendSync: jest.fn(),
    invoke: jest.fn().mockResolvedValue({}),
    on: jest.fn(),
    once: jest.fn(),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn(),
    eventNames: jest.fn(() => []),
    listeners: jest.fn(() => []),
    listenerCount: jest.fn(() => 0),
  },

  // File system access through IPC
  files: {
    getDocumentsPath: jest.fn().mockResolvedValue('/mock/documents'),
    normalizePath: jest.fn((path) => path),
    performOperation: jest.fn().mockResolvedValue({ success: true }),
    getFileMetadata: jest.fn().mockResolvedValue({
      size: 1024,
      mtime: new Date(),
      type: 'file',
    }),
  },

  // Settings management through IPC
  settings: {
    get: jest.fn().mockResolvedValue({}),
    set: jest.fn().mockResolvedValue(true),
    getAll: jest.fn().mockResolvedValue({}),
    reset: jest.fn().mockResolvedValue(true),
  },

  // Smart folders management through IPC
  smartFolders: {
    get: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: '1', name: 'Test' }),
    update: jest.fn().mockResolvedValue(true),
    delete: jest.fn().mockResolvedValue(true),
  },

  // Processing state management through IPC
  processing: {
    getState: jest.fn().mockResolvedValue({ status: 'idle' }),
    start: jest.fn().mockResolvedValue(true),
    pause: jest.fn().mockResolvedValue(true),
    resume: jest.fn().mockResolvedValue(true),
    cancel: jest.fn().mockResolvedValue(true),
  },

  // Events subscription through IPC
  events: {
    onOperationProgress: jest.fn(),
    onProcessingStateChange: jest.fn(),
    onSettingsChange: jest.fn(),
    onSmartFoldersChange: jest.fn(),
  },

  // Dialog operations through IPC
  dialogs: {
    showOpenDialog: jest.fn().mockResolvedValue({
      canceled: false,
      filePaths: ['/mock/file.txt'],
    }),
    showSaveDialog: jest.fn().mockResolvedValue({
      canceled: false,
      filePath: '/mock/save.txt',
    }),
    showMessageBox: jest.fn().mockResolvedValue({ response: 0 }),
  },

  // System information through IPC
  system: {
    getPlatform: jest.fn(() => 'win32'),
    getVersion: jest.fn(() => '10.0.26100'),
    getArch: jest.fn(() => 'x64'),
    getMemoryInfo: jest.fn(() => ({
      total: 17179869184,
      free: 8589934592,
      used: 8589934592,
    })),
    getCpuInfo: jest.fn(() => ({
      model: 'Mock CPU',
      speed: 3000,
      cores: 8,
    })),
  },
};

// Mock the contextBridge for testing
const mockContextBridge = {
  exposeInMainWorld: jest.fn((apiName, api) => {
    if (apiName === 'electron') {
      Object.assign(mockElectronAPI, api);
    }
  }),
};

// Export the mock Electron module
module.exports = {
  ...mockElectronAPI,
  contextBridge: mockContextBridge,
  ipcRenderer: mockElectronAPI.ipcRenderer,
  webFrame: {
    setZoomFactor: jest.fn(),
    getZoomFactor: jest.fn(() => 1.0),
    setZoomLevel: jest.fn(),
    getZoomLevel: jest.fn(() => 0),
    setVisualZoomLevelLimits: jest.fn(),
    setLayoutZoomLevelLimits: jest.fn(),
  },
  webUtils: {
    getPathForFile: jest.fn(),
    getPathForFiles: jest.fn(),
  },
  // Mock other renderer-specific APIs as needed
};
