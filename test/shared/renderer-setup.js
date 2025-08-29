/**
 * Renderer Process Test Setup
 * Configures JSDOM environment and mocks for React component testing
 */

// Mock the Electron API exposed by the preload script
Object.defineProperty(window, 'electronAPI', {
  value: {
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

    // File system operations
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

    // Settings management
    settings: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(true),
      getAll: jest.fn().mockResolvedValue({}),
      reset: jest.fn().mockResolvedValue(true),
    },

    // Smart folders management
    smartFolders: {
      get: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: '1', name: 'Test' }),
      update: jest.fn().mockResolvedValue(true),
      delete: jest.fn().mockResolvedValue(true),
    },

    // Processing state management
    processing: {
      getState: jest.fn().mockResolvedValue({ status: 'idle' }),
      start: jest.fn().mockResolvedValue(true),
      pause: jest.fn().mockResolvedValue(true),
      resume: jest.fn().mockResolvedValue(true),
      cancel: jest.fn().mockResolvedValue(true),
    },

    // Events subscription
    events: {
      onOperationProgress: jest.fn(),
      onProcessingStateChange: jest.fn(),
      onSettingsChange: jest.fn(),
      onSmartFoldersChange: jest.fn(),
    },

    // Dialog operations
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

    // System information
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
  },
  writable: false,
});

// Mock window.matchMedia for responsive design testing
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock ResizeObserver for component testing
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock IntersectionObserver for lazy loading components
global.IntersectionObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock Canvas API for components that might use it
HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
  fillRect: jest.fn(),
  clearRect: jest.fn(),
  getImageData: jest.fn(() => ({ data: new Array(4) })),
  putImageData: jest.fn(),
  createImageData: jest.fn(() => ({ data: new Array(4) })),
  setTransform: jest.fn(),
  drawImage: jest.fn(),
  save: jest.fn(),
  restore: jest.fn(),
  beginPath: jest.fn(),
  moveTo: jest.fn(),
  lineTo: jest.fn(),
  closePath: jest.fn(),
  stroke: jest.fn(),
  fill: jest.fn(),
}));

// Mock localStorage for components that use it
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  key: jest.fn(),
  length: 0,
};
global.localStorage = localStorageMock;

// Mock sessionStorage
const sessionStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  key: jest.fn(),
  length: 0,
};
global.sessionStorage = sessionStorageMock;

// Mock URL.createObjectURL and URL.revokeObjectURL
global.URL.createObjectURL = jest.fn(() => 'mock-object-url');
global.URL.revokeObjectURL = jest.fn();

// Mock fetch for API calls
global.fetch = jest.fn(() =>
  Promise.resolve({
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    ok: true,
    status: 200,
    statusText: 'OK',
  }),
);

// Mock performance.mark and performance.measure for performance testing
global.performance.mark = jest.fn();
global.performance.measure = jest.fn(() => ({
  duration: 100,
  startTime: 0,
  endTime: 100,
}));

// Mock requestAnimationFrame and cancelAnimationFrame
global.requestAnimationFrame = jest.fn((cb) => setTimeout(cb, 16));
global.cancelAnimationFrame = jest.fn((id) => clearTimeout(id));

// Mock requestIdleCallback and cancelIdleCallback
global.requestIdleCallback = jest.fn((cb) => setTimeout(cb, 1));
global.cancelIdleCallback = jest.fn((id) => clearTimeout(id));

// Mock console methods to reduce noise in tests
const originalConsole = global.console;
global.console = {
  ...originalConsole,
  // Keep error and warn for debugging
  error: jest.fn(),
  warn: jest.fn(),
  // Mock log, info, debug to reduce noise
  log: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

// Helper function to restore console for debugging specific tests
global.restoreConsole = () => {
  global.console = originalConsole;
};

// Test utilities for renderer tests
global.testUtils = {
  // Simulate IPC event from main process
  simulateIpcEvent: (channel, data) => {
    const mockEvent = { channel, data };
    // Find listeners for this channel
    const listeners = window.electronAPI.ipcRenderer.on.mock.calls
      .filter((call) => call[0] === channel)
      .map((call) => call[1]);

    listeners.forEach((listener) => listener(mockEvent, ...data));
  },

  // Wait for async operations
  waitForNextTick: () => new Promise((resolve) => setTimeout(resolve, 0)),

  // Create mock file object
  createMockFile: (name = 'test.txt', size = 1024, type = 'text/plain') => {
    const file = new File(['mock content'], name, { type });
    Object.defineProperty(file, 'size', { value: size });
    return file;
  },

  // Simulate drag and drop
  createMockDragEvent: (files = []) => ({
    dataTransfer: {
      files,
      items: files.map(() => ({ kind: 'file', type: 'text/plain' })),
      types: ['Files'],
    },
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
  }),

  // Clean up after each test
  cleanup: () => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
  },
};

// Auto-cleanup after each test
afterEach(() => {
  global.testUtils.cleanup();
});

console.log('🧪 Renderer test environment initialized');
console.log('📋 Available test utilities:', Object.keys(global.testUtils));
console.log('⚡ Electron API mocked and ready');
console.log('🎯 IPC bridge simulation active');
