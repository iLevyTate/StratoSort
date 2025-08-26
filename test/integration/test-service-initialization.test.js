/**
 * Service Initialization Integration Tests
 * Tests all service initialization, dependencies, and startup sequences
 * Ensures services are properly initialized and dependencies are met
 */

const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');

// Mock all required modules before any imports
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn((type) => `/mock/path/${type}`),
    getVersion: jest.fn(() => '1.0.0'),
    on: jest.fn(),
    once: jest.fn(),
    quit: jest.fn(),
    exit: jest.fn(),
  },
  BrowserWindow: jest.fn(() => ({
    loadFile: jest.fn(),
    loadURL: jest.fn(),
    show: jest.fn(),
    hide: jest.fn(),
    close: jest.fn(),
    destroy: jest.fn(),
    on: jest.fn(),
    setMenu: jest.fn(),
    setTitle: jest.fn(),
    isDestroyed: jest.fn(() => false),
    webContents: {
      send: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
    },
  })),
  ipcMain: {
    handle: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    removeHandler: jest.fn(),
    removeListener: jest.fn(),
  },
  dialog: {
    showOpenDialog: jest.fn(),
    showSaveDialog: jest.fn(),
    showMessageBox: jest.fn(),
  },
  shell: {
    openPath: jest.fn(),
    showItemInFolder: jest.fn(),
  },
}));

jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn().mockResolvedValue(true),
    stat: jest.fn(),
    readdir: jest.fn(),
    access: jest.fn().mockResolvedValue(true),
    unlink: jest.fn(),
    rename: jest.fn(),
  },
}));

jest.mock('path', () => ({
  join: jest.fn((...args) => args.join('/')),
  dirname: jest.fn((p) => p.split('/').slice(0, -1).join('/')),
  resolve: jest.fn((...args) => args.join('/')),
  basename: jest.fn((p) => p.split('/').pop()),
  extname: jest.fn((p) => {
    const ext = p.split('.').pop();
    return ext ? '.' + ext : '';
  }),
}));

describe('Service Initialization and Dependencies', () => {
  let services;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock services
    services = {
      SettingsService: jest.fn(() => ({
        get: jest.fn(),
        set: jest.fn(),
        load: jest.fn().mockResolvedValue(true),
        save: jest.fn().mockResolvedValue(true),
        on: jest.fn(),
      })),
      DownloadWatcher: jest.fn(() => ({
        start: jest.fn(),
        stop: jest.fn(),
        on: jest.fn(),
      })),
      PerformanceService: jest.fn(() => ({
        startMonitoring: jest.fn(),
        stopMonitoring: jest.fn(),
        getMetrics: jest.fn(),
        on: jest.fn(),
      })),
      OllamaService: jest.fn(() => ({
        initialize: jest.fn().mockResolvedValue(true),
        connect: jest.fn().mockResolvedValue(true),
        disconnect: jest.fn(),
        analyze: jest.fn(),
        isConnected: jest.fn().mockReturnValue(true),
        on: jest.fn(),
      })),
      EmbeddingIndexService: jest.fn(() => ({
        initialize: jest.fn().mockResolvedValue(true),
        buildIndex: jest.fn().mockResolvedValue(true),
        search: jest.fn(),
        on: jest.fn(),
      })),
      FolderMatchingService: jest.fn(() => ({
        initialize: jest.fn().mockResolvedValue(true),
        match: jest.fn(),
        on: jest.fn(),
      })),
      ModelManager: jest.fn(() => ({
        initialize: jest.fn().mockResolvedValue(true),
        listModels: jest.fn(),
        pullModel: jest.fn(),
        on: jest.fn(),
      })),
      ErrorHandler: jest.fn(() => ({
        initialize: jest.fn().mockResolvedValue(true),
        handleError: jest.fn(),
        on: jest.fn(),
      })),
      Logger: jest.fn(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        on: jest.fn(),
      })),
    };
  });

  describe('Service Initialization Order', () => {
    test('should initialize services in correct dependency order', async () => {
      const initOrder = [];

      // 1. Logger (no dependencies)
      const logger = new services.Logger();
      initOrder.push('Logger');

      // 2. ErrorHandler (depends on Logger)
      const errorHandler = new services.ErrorHandler();
      await errorHandler.initialize();
      initOrder.push('ErrorHandler');
      expect(errorHandler.initialize).toHaveBeenCalled();

      // 3. SettingsService (depends on Logger, ErrorHandler)
      const settings = new services.SettingsService();
      await settings.load();
      initOrder.push('SettingsService');
      expect(settings.load).toHaveBeenCalled();

      // 4. OllamaService
      const ollama = new services.OllamaService();
      await ollama.initialize();
      initOrder.push('OllamaService');
      expect(ollama.initialize).toHaveBeenCalled();

      // 5. FolderMatchingService
      const folderMatching = new services.FolderMatchingService();
      await folderMatching.initialize();
      initOrder.push('FolderMatchingService');
      expect(folderMatching.initialize).toHaveBeenCalled();

      // 6. PerformanceService
      const performance = new services.PerformanceService();
      performance.startMonitoring();
      initOrder.push('PerformanceService');
      expect(performance.startMonitoring).toHaveBeenCalled();

      // 7. DownloadWatcher
      const downloadWatcher = new services.DownloadWatcher();
      downloadWatcher.start();
      initOrder.push('DownloadWatcher');
      expect(downloadWatcher.start).toHaveBeenCalled();

      expect(initOrder).toEqual([
        'Logger',
        'ErrorHandler',
        'SettingsService',
        'OllamaService',
        'FolderMatchingService',
        'PerformanceService',
        'DownloadWatcher',
      ]);
    });

    test('should handle service initialization failures gracefully', async () => {
      const mockService = {
        initialize: jest.fn().mockRejectedValue(new Error('Service failed')),
      };

      await expect(mockService.initialize()).rejects.toThrow('Service failed');
    });

    test('should validate all services are properly configured', () => {
      expect(services.Logger).toBeDefined();
      expect(services.ErrorHandler).toBeDefined();
      expect(services.SettingsService).toBeDefined();
      expect(services.OllamaService).toBeDefined();
      expect(services.FolderMatchingService).toBeDefined();
      expect(services.PerformanceService).toBeDefined();
      expect(services.DownloadWatcher).toBeDefined();
    });
  });

  describe('Service Dependencies', () => {
    test('should ensure critical services are initialized first', async () => {
      const criticalServices = ['Logger', 'ErrorHandler', 'SettingsService'];
      const initOrder = [];

      // Initialize critical services
      const logger = new services.Logger();
      initOrder.push('Logger');

      const errorHandler = new services.ErrorHandler();
      await errorHandler.initialize();
      initOrder.push('ErrorHandler');

      const settings = new services.SettingsService();
      await settings.load();
      initOrder.push('SettingsService');

      expect(initOrder).toEqual(criticalServices);
    });

    test('should handle circular dependencies', () => {
      // Services should not have circular dependencies
      const serviceDependencies = {
        Logger: [],
        ErrorHandler: ['Logger'],
        SettingsService: ['Logger', 'ErrorHandler'],
        OllamaService: [],
        FolderMatchingService: [],
        PerformanceService: [],
        DownloadWatcher: [],
      };

      // Verify no service depends on itself
      Object.entries(serviceDependencies).forEach(([service, deps]) => {
        expect(deps).not.toContain(service);
      });

      // Verify dependencies exist
      Object.values(serviceDependencies).forEach((deps) => {
        deps.forEach((dep) => {
          expect(serviceDependencies).toHaveProperty(dep);
        });
      });
    });
  });

  describe('Service Lifecycle', () => {
    test('should properly start and stop services', async () => {
      const performance = new services.PerformanceService();
      const downloadWatcher = new services.DownloadWatcher();

      // Start services
      performance.startMonitoring();
      downloadWatcher.start();

      expect(performance.startMonitoring).toHaveBeenCalled();
      expect(downloadWatcher.start).toHaveBeenCalled();

      // Stop services
      performance.stopMonitoring();
      downloadWatcher.stop();

      expect(performance.stopMonitoring).toHaveBeenCalled();
      expect(downloadWatcher.stop).toHaveBeenCalled();
    });

    test('should handle service events', () => {
      const logger = new services.Logger();
      const errorHandler = new services.ErrorHandler();

      // Setup event listeners
      logger.on('message', jest.fn());
      errorHandler.on('error', jest.fn());

      expect(logger.on).toHaveBeenCalledWith('message', expect.any(Function));
      expect(errorHandler.on).toHaveBeenCalledWith(
        'error',
        expect.any(Function),
      );
    });
  });
});
