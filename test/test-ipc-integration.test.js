// Integration tests for IPC round-trip validation
// Tests end-to-end IPC communication and data validation

// Mock electron first
jest.mock('electron', () => ({
  app: {
    isReady: jest.fn(() => true),
    whenReady: jest.fn(() => Promise.resolve()),
    relaunch: jest.fn(),
    quit: jest.fn(),
  },
}));

// Don't mock the system IPC module - we want to test the real implementation

const { app } = require('electron');
const { systemMonitor } = require('../src/main/services/SystemMonitor');
const { logger } = require('../src/shared/logger');
const { IPC_CHANNELS } = require('../src/shared/constants');

// Import systemAnalytics (not systemMonitor) as expected by registerSystemIpc
const systemAnalytics = require('../src/main/core/systemAnalytics');

describe('IPC Integration Tests', () => {
  let mainWindow;
  let ipcMain;

  beforeAll(async () => {
    // Initialize Electron app for testing
    if (!app.isReady()) {
      await new Promise((resolve) => {
        app.whenReady().then(resolve);
      });
    }

    // Mock IPC main for testing
    ipcMain = {
      handle: jest.fn(),
      removeHandler: jest.fn(),
    };

    // Initialize system monitor
    await systemMonitor.initialize();
  });

  describe('System Metrics IPC', () => {
    test('getMetrics IPC handler returns valid data structure', async () => {
      // Register system IPC handlers
      // First, let's create a simple test outside Jest to see what's being exported
      const systemModule = require('../src/main/ipc/system');
      console.log('=== DEBUG INFO ===');
      console.log('systemModule type:', typeof systemModule);
      console.log('systemModule keys:', Object.keys(systemModule || {}));
      console.log('systemModule value:', systemModule);
      console.log('==================');

      // If it's not a function, let's see if we can access it differently
      let registerSystemIpc;
      if (typeof systemModule === 'function') {
        registerSystemIpc = systemModule;
      } else if (
        systemModule &&
        typeof systemModule.registerSystemIpc === 'function'
      ) {
        registerSystemIpc = systemModule.registerSystemIpc;
      } else {
        throw new Error(
          `Cannot find registerSystemIpc function. Module type: ${typeof systemModule}, keys: ${Object.keys(systemModule || {})}`,
        );
      }
      registerSystemIpc({
        ipcMain,
        IPC_CHANNELS,
        logger,
        systemAnalytics,
        getServiceIntegration: () => ({}),
      });

      // Verify handler was registered
      expect(ipcMain.handle).toHaveBeenCalledWith(
        IPC_CHANNELS.SYSTEM.GET_METRICS,
        expect.any(Function),
      );

      // Get the registered handler
      const handlerCall = ipcMain.handle.mock.calls.find(
        (call) => call[0] === IPC_CHANNELS.SYSTEM.GET_METRICS,
      );
      const handler = handlerCall[1];

      // Execute the handler
      const result = await handler();

      // Verify the result structure matches preload expectations
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');

      // Test the validation logic from preload
      const isValidSystemMetrics = (data) => {
        if (!data || typeof data !== 'object') return false;
        const hasUptime =
          typeof data.uptime === 'number' || typeof data.uptime === 'string';
        const hasMemory =
          typeof data.memory === 'object' ||
          typeof data.memory?.used === 'number';
        return hasUptime || hasMemory;
      };

      expect(isValidSystemMetrics(result)).toBe(true);

      // Verify expected fields exist
      expect(result).toHaveProperty('uptime');
      expect(result).toHaveProperty('memory');
      expect(result).toHaveProperty('platform');
      expect(result).toHaveProperty('arch');
    });

    test('preload validation handles IPC response correctly', () => {
      // Test the preload validation logic
      const isValidSystemMetrics = (data) => {
        if (!data || typeof data !== 'object') return false;
        const hasUptime =
          typeof data.uptime === 'number' || typeof data.uptime === 'string';
        const hasMemory =
          typeof data.memory === 'object' ||
          typeof data.memory?.used === 'number';
        return hasUptime || hasMemory;
      };

      // Test valid data
      const validData = {
        uptime: 12345,
        memory: { used: 100, total: 1000 },
        platform: 'win32',
      };
      expect(isValidSystemMetrics(validData)).toBe(true);

      // Test data with error
      const errorData = { error: 'Failed to get metrics' };
      expect(isValidSystemMetrics(errorData)).toBe(false);

      // Test null/undefined
      expect(isValidSystemMetrics(null)).toBe(false);
      expect(isValidSystemMetrics(undefined)).toBe(false);

      // Test empty object
      expect(isValidSystemMetrics({})).toBe(false);
    });

    test('system status IPC returns valid comprehensive data', async () => {
      const systemModule = require('../src/main/ipc/system');
      let registerSystemIpc;
      if (typeof systemModule === 'function') {
        registerSystemIpc = systemModule;
      } else if (
        systemModule &&
        typeof systemModule.registerSystemIpc === 'function'
      ) {
        registerSystemIpc = systemModule.registerSystemIpc;
      } else {
        throw new Error(
          `Cannot find registerSystemIpc function. Module type: ${typeof systemModule}, keys: ${Object.keys(systemModule || {})}`,
        );
      }

      registerSystemIpc({
        ipcMain,
        IPC_CHANNELS,
        logger,
        systemAnalytics,
        getServiceIntegration: () => ({}),
      });

      const handlerCall = ipcMain.handle.mock.calls.find(
        (call) => call[0] === IPC_CHANNELS.SYSTEM.GET_SYSTEM_STATUS,
      );
      const handler = handlerCall[1];

      const result = await handler();

      expect(result).toBeDefined();
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('status');
      expect(result.status).toHaveProperty('systemInfo');
      expect(result.status).toHaveProperty('gpuInfo');
      expect(result.status).toHaveProperty('ollamaHealth');
      expect(result.status).toHaveProperty('isMonitoring');
      expect(result.status).toHaveProperty('lastChecked');
    });
  });

  describe('IPC Error Handling', () => {
    test('IPC handlers gracefully handle errors', async () => {
      const systemModule = require('../src/main/ipc/system');
      let registerSystemIpc;
      if (typeof systemModule === 'function') {
        registerSystemIpc = systemModule;
      } else if (
        systemModule &&
        typeof systemModule.registerSystemIpc === 'function'
      ) {
        registerSystemIpc = systemModule.registerSystemIpc;
      } else {
        throw new Error(
          `Cannot find registerSystemIpc function. Module type: ${typeof systemModule}, keys: ${Object.keys(systemModule || {})}`,
        );
      }

      // Mock systemAnalytics to throw an error
      const mockSystemAnalytics = {
        collectMetrics: jest.fn().mockRejectedValue(new Error('Test error')),
      };

      registerSystemIpc({
        ipcMain,
        IPC_CHANNELS,
        logger,
        systemAnalytics: mockSystemAnalytics,
        getServiceIntegration: () => ({}),
      });

      const handlerCall = ipcMain.handle.mock.calls.find(
        (call) => call[0] === IPC_CHANNELS.SYSTEM.GET_METRICS,
      );
      const handler = handlerCall[1];

      const result = await handler();

      // Should return error object, not throw
      expect(result).toHaveProperty('error');
      expect(result.error).toBe('Test error');
    });
  });

  afterAll(() => {
    // Clean up handlers
    if (ipcMain.removeHandler) {
      ipcMain.removeHandler(IPC_CHANNELS.SYSTEM.GET_METRICS);
      ipcMain.removeHandler(IPC_CHANNELS.SYSTEM.GET_SYSTEM_STATUS);
    }
  });
});
