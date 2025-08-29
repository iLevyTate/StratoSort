/**
 * Electron Integration Test Mock
 * Specialized for testing IPC communication between main and renderer processes
 */

const path = require('path');

// Mock webContents for integration testing
const mockWebContents = {
  send: jest.fn(),
  on: jest.fn(),
  once: jest.fn(),
  removeListener: jest.fn(),
  removeAllListeners: jest.fn(),
  isDestroyed: jest.fn(() => false),
  executeJavaScript: jest.fn(),
};

// Mock BrowserWindow for integration testing
const mockBrowserWindow = jest.fn().mockImplementation((options = {}) => ({
  id: Math.floor(Math.random() * 10000),
  options,
  loadFile: jest.fn(),
  loadURL: jest.fn(),
  webContents: mockWebContents,
  on: jest.fn(),
  once: jest.fn(),
  removeListener: jest.fn(),
  destroy: jest.fn(),
  isDestroyed: jest.fn(() => false),
}));

// Mock ipcMain with enhanced tracking for integration tests
const mockIpcMain = {
  handlers: new Map(),
  listeners: new Map(),

  on: jest.fn((channel, handler) => {
    if (!mockIpcMain.listeners.has(channel)) {
      mockIpcMain.listeners.set(channel, []);
    }
    mockIpcMain.listeners.get(channel).push(handler);
  }),

  once: jest.fn((channel, handler) => {
    mockIpcMain.on(channel, handler);
  }),

  handle: jest.fn((channel, handler) => {
    mockIpcMain.handlers.set(channel, handler);
  }),

  handleOnce: jest.fn((channel, handler) => {
    mockIpcMain.handle(channel, handler);
  }),

  removeHandler: jest.fn((channel) => {
    mockIpcMain.handlers.delete(channel);
  }),

  removeListener: jest.fn((channel, handler) => {
    const listeners = mockIpcMain.listeners.get(channel) || [];
    const index = listeners.indexOf(handler);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  }),

  removeAllListeners: jest.fn((channel) => {
    if (channel) {
      mockIpcMain.listeners.delete(channel);
    } else {
      mockIpcMain.listeners.clear();
    }
  }),

  eventNames: jest.fn(() => Array.from(mockIpcMain.listeners.keys())),
  getListeners: jest.fn((channel) => mockIpcMain.listeners.get(channel) || []),

  // Helper methods for testing
  trigger: jest.fn((channel, event, ...args) => {
    const listeners = mockIpcMain.listeners.get(channel) || [];
    listeners.forEach((listener) => listener(event, ...args));
  }),

  invoke: jest.fn(async (channel, ...args) => {
    const handler = mockIpcMain.handlers.get(channel);
    if (handler) {
      return await handler({}, ...args);
    }
    throw new Error(`No handler registered for channel: ${channel}`);
  }),
};

// Mock app for integration testing
const mockApp = {
  getPath: jest.fn((name) => {
    const paths = {
      userData: '/mock/userData',
      documents: '/mock/documents',
      downloads: '/mock/downloads',
      desktop: '/mock/desktop',
    };
    return paths[name] || `/mock/${name}`;
  }),
  getAppPath: jest.fn(() => '/mock/app'),
  on: jest.fn(),
  once: jest.fn(),
  removeListener: jest.fn(),
  isReady: jest.fn(() => true),
  whenReady: jest.fn(() => Promise.resolve()),
};

// Mock dialog for integration testing
const mockDialog = {
  showOpenDialog: jest.fn().mockResolvedValue({
    canceled: false,
    filePaths: ['/mock/test-file.txt'],
  }),
  showMessageBox: jest.fn().mockResolvedValue({ response: 0 }),
};

// Integration test utilities
const integrationUtils = {
  // Simulate a complete IPC round-trip
  simulateIpcRoundTrip: async (channel, requestData, responseData = {}) => {
    // Simulate sending from renderer
    const mockEvent = { sender: mockWebContents };

    // Trigger the main process handler
    const result = await mockIpcMain.invoke(channel, mockEvent, requestData);

    // Simulate response back to renderer
    mockWebContents.send(channel + '-response', { ...responseData, ...result });

    return result;
  },

  // Get all registered IPC channels
  getRegisteredChannels: () => ({
    handlers: Array.from(mockIpcMain.handlers.keys()),
    listeners: Array.from(mockIpcMain.listeners.keys()),
  }),

  // Reset all IPC state
  reset: () => {
    mockIpcMain.handlers.clear();
    mockIpcMain.listeners.clear();
    jest.clearAllMocks();
  },
};

// Export the mock with integration utilities
module.exports = {
  app: mockApp,
  BrowserWindow: mockBrowserWindow,
  ipcMain: mockIpcMain,
  dialog: mockDialog,
  webContents: mockWebContents,

  // Integration testing utilities
  integrationUtils,

  // Additional Electron modules for integration testing
  Menu: {
    setApplicationMenu: jest.fn(),
    buildFromTemplate: jest.fn(),
  },

  shell: {
    showItemInFolder: jest.fn(),
    openPath: jest.fn().mockResolvedValue(''),
  },

  globalShortcut: {
    register: jest.fn(),
    unregister: jest.fn(),
  },
};
