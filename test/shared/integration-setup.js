/**
 * Integration Test Setup
 * Configures environment for testing IPC communication between main and renderer processes
 */

// Mock Electron for integration testing
jest.mock('electron', () => require('./mocks/electron-integration'));

// Import the mock for configuration
const { ipcMain, integrationUtils } = require('./mocks/electron-integration');

// Global utilities for IPC integration tests
global.ipcTestUtils = {
  // Simulate a complete IPC flow
  simulateIpcFlow: async (channel, requestData, expectedResponse = {}) => {
    const result = await integrationUtils.simulateIpcRoundTrip(
      channel,
      requestData,
      expectedResponse,
    );
    return result;
  },

  // Register mock IPC handlers for testing
  registerMockHandlers: (handlers) => {
    Object.entries(handlers).forEach(([channel, handler]) => {
      ipcMain.handle(channel, handler);
    });
  },

  // Simulate events from renderer to main
  sendRendererEvent: (channel, ...args) => {
    ipcMain.trigger(channel, { sender: {} }, ...args);
  },

  // Get registered channels for verification
  getRegisteredChannels: () => integrationUtils.getRegisteredChannels(),

  // Reset IPC state between tests
  resetIpcState: () => {
    integrationUtils.reset();
  },

  // Verify IPC message was sent
  verifyIpcMessageSent: (channel, expectedData) => {
    // This would check that the main process sent a message back to renderer
    // Implementation depends on how webContents.send is mocked
  },
};

// Mock file system for integration tests
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn().mockResolvedValue('mock file content'),
    writeFile: jest.fn().mockResolvedValue(undefined),
    stat: jest.fn().mockResolvedValue({
      size: 1024,
      mtime: new Date(),
      isFile: () => true,
      isDirectory: () => false,
    }),
    mkdir: jest.fn().mockResolvedValue(undefined),
    readdir: jest.fn().mockResolvedValue(['file1.txt', 'file2.pdf']),
    access: jest.fn().mockResolvedValue(undefined),
    unlink: jest.fn().mockResolvedValue(undefined),
    rename: jest.fn().mockResolvedValue(undefined),
  },
  readFileSync: jest.fn().mockReturnValue('mock file content'),
  writeFileSync: jest.fn(),
  statSync: jest.fn().mockReturnValue({
    size: 1024,
    mtime: new Date(),
    isFile: () => true,
    isDirectory: () => false,
  }),
  mkdirSync: jest.fn(),
  readdirSync: jest.fn().mockReturnValue(['file1.txt', 'file2.pdf']),
  existsSync: jest.fn().mockReturnValue(true),
  accessSync: jest.fn(),
  unlinkSync: jest.fn(),
  renameSync: jest.fn(),
}));

// Mock other Node.js modules that might be used in integration
jest.mock('path', () => ({
  join: jest.fn((...args) => args.join('/')),
  dirname: jest.fn((p) => p.split('/').slice(0, -1).join('/')),
  resolve: jest.fn((...args) => args.join('/')),
  basename: jest.fn((p) => p.split('/').pop()),
  extname: jest.fn((p) => {
    const ext = p.split('.').pop();
    return ext ? '.' + ext : '';
  }),
  normalize: jest.fn((p) => p.replace(/\\/g, '/')),
  isAbsolute: jest.fn((p) => p.startsWith('/')),
}));

// Mock Ollama for integration tests
jest.mock('ollama', () => require('./mocks/ollama'));

// Setup before all integration tests
beforeAll(() => {
  console.log('🔗 Integration test environment initialized');
  console.log('📡 IPC bridge simulation active');
  console.log('📁 File system operations mocked');
});

// Cleanup after each integration test
afterEach(() => {
  global.ipcTestUtils.resetIpcState();
  jest.clearAllMocks();
});

console.log('🚀 Integration test setup complete');
console.log('💡 Available utilities:', Object.keys(global.ipcTestUtils));
