// This file mocks the API exposed by the preload script
Object.defineProperty(window, 'electronAPI', {
  value: {
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
    settings: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(true),
      getAll: jest.fn().mockResolvedValue({}),
      reset: jest.fn().mockResolvedValue(true),
    },
    smartFolders: {
      get: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: '1', name: 'Test' }),
      update: jest.fn().mockResolvedValue(true),
      delete: jest.fn().mockResolvedValue(true),
    },
    processing: {
      getState: jest.fn().mockResolvedValue({ status: 'idle' }),
      start: jest.fn().mockResolvedValue(true),
      pause: jest.fn().mockResolvedValue(true),
      resume: jest.fn().mockResolvedValue(true),
      cancel: jest.fn().mockResolvedValue(true),
    },
    events: {
      onOperationProgress: jest.fn(),
      onProcessingStateChange: jest.fn(),
      onSettingsChange: jest.fn(),
      onSmartFoldersChange: jest.fn(),
    },
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

// Mock additional browser APIs that might be used in renderer process
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

global.IntersectionObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock HTMLCanvasElement for components that might use canvas
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

// Mock localStorage and sessionStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  key: jest.fn(),
  length: 0,
};
global.localStorage = localStorageMock;

const sessionStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  key: jest.fn(),
  length: 0,
};
global.sessionStorage = sessionStorageMock;

// Mock performance.mark and performance.measure
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

// Mock URL.createObjectURL and URL.revokeObjectURL
global.URL.createObjectURL = jest.fn(() => 'mock-object-url');
global.URL.revokeObjectURL = jest.fn();

// Setup console spy to reduce noise in tests but allow debugging
const originalConsole = global.console;
global.console = {
  ...originalConsole,
  log: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Helper function to restore console for debugging specific tests
global.restoreConsole = () => {
  global.console = originalConsole;
};

// Test utilities for renderer tests
global.testUtils = {
  simulateIpcEvent: (channel, data) => {
    const mockEvent = { channel, data };
    const listeners = window.electronAPI.ipcRenderer.on.mock.calls
      .filter((call) => call[0] === channel)
      .map((call) => call[1]);

    listeners.forEach((listener) => listener(mockEvent, ...data));
  },

  waitForNextTick: () => new Promise((resolve) => setTimeout(resolve, 0)),

  createMockFile: (name = 'test.txt', size = 1024, type = 'text/plain') => {
    const file = new File(['mock content'], name, { type });
    Object.defineProperty(file, 'size', { value: size });
    return file;
  },

  createMockDragEvent: (files = []) => ({
    dataTransfer: {
      files,
      items: files.map(() => ({ kind: 'file', type: 'text/plain' })),
      types: ['Files'],
    },
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
  }),

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
