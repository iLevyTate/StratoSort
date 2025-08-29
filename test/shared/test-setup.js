/**
 * Test Setup for Stratosort Document Processing Tests
 * Initializes mocks, global variables, and test utilities
 */

// Global test utilities
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

// Mock DOM environment for Electron
global.document = {
  querySelector: jest.fn(),
  querySelectorAll: jest.fn(() => []),
  createElement: jest.fn(() => ({
    click: jest.fn(),
    addEventListener: jest.fn(),
  })),
};

global.window = {
  location: { href: 'http://localhost' },
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
};

// Initialize test state
global.documentStore = [];
global.processingQueue = [];
global.stateListeners = [];
global.progressListeners = [];
global.aiConfig = {
  confidenceThreshold: 0.7,
  folderNamingPattern: '{category}/{type}',
  enableDateExtraction: true,
  categories: ['Financial', 'Legal', 'Project', 'Personal', 'Technical'],
};

// Test file system simulation
global.testFileSystem = {
  files: new Map(),
  directories: new Set(),

  writeFile: jest.fn((path, content) => {
    global.testFileSystem.files.set(path, content);
    return Promise.resolve();
  }),

  readFile: jest.fn((path) => {
    const content = global.testFileSystem.files.get(path);
    if (content === undefined) {
      return Promise.reject(new Error(`File not found: ${path}`));
    }
    return Promise.resolve(content);
  }),

  mkdir: jest.fn((path) => {
    global.testFileSystem.directories.add(path);
    return Promise.resolve();
  }),

  exists: jest.fn((path) => {
    return (
      global.testFileSystem.files.has(path) ||
      global.testFileSystem.directories.has(path)
    );
  }),

  clear: () => {
    global.testFileSystem.files.clear();
    global.testFileSystem.directories.clear();
  },
};

// Mock performance monitoring
global.performance = {
  mark: jest.fn(),
  measure: jest.fn(),
  now: jest.fn(() => Date.now()),
};

// Mock performance.now to update continuously for tests
const performanceInterval = setInterval(() => {
  global.performance.now.mockReturnValue(Date.now());
}, 100);

afterAll(() => {
  clearInterval(performanceInterval);
});

// Test utilities for document processing
global.testUtils = {
  createMockDocument: (overrides = {}) => ({
    id: `test-doc-${Date.now()}`,
    name: 'test-document.pdf',
    type: 'application/pdf',
    size: 1024,
    content: 'Mock document content for testing',
    ...overrides,
  }),

  createMockAnalysisResult: (overrides = {}) => ({
    category: 'Test',
    purpose: 'Testing document analysis',
    keywords: ['test', 'mock', 'document'],
    confidence: 0.85,
    suggestedFolder: 'Test/Documents',
    extractedDate: '2024',
    ...overrides,
  }),

  waitForAsync: (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms)),

  generateLargeContent: (sizeKB = 100) => {
    const chunkSize = 1024;
    const chunks = sizeKB;
    return Array.from({ length: chunks }, (_, i) =>
      `Mock content chunk ${i + 1} `.repeat(50),
    ).join('\n');
  },
};

// Performance testing utilities
global.performanceUtils = {
  startTimer: () => {
    const start = process.hrtime.bigint();
    return () => {
      const end = process.hrtime.bigint();
      return Number(end - start) / 1000000; // Convert to milliseconds
    };
  },

  measureMemory: () => process.memoryUsage(),

  trackResourceUsage: () => {
    const startMemory = process.memoryUsage();
    const startTime = process.hrtime.bigint();

    return () => {
      const endMemory = process.memoryUsage();
      const endTime = process.hrtime.bigint();

      return {
        memoryDelta: {
          heapUsed: endMemory.heapUsed - startMemory.heapUsed,
          heapTotal: endMemory.heapTotal - startMemory.heapTotal,
          external: endMemory.external - startMemory.external,
        },
        timeElapsed: Number(endTime - startTime) / 1000000, // milliseconds
      };
    };
  },
};

// Test data generators
global.testDataGenerators = {
  invoice: () => ({
    content: `
      INVOICE #${Math.floor(Math.random() * 10000)}
      Date: ${new Date().toISOString().split('T')[0]}
      Amount: $${(Math.random() * 5000 + 100).toFixed(2)}
      Due Date: ${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
      Payment Terms: Net 30
    `,
    expectedCategory: 'Financial',
    expectedFolder: 'Financial/Invoices',
  }),

  contract: () => ({
    content: `
      SERVICE AGREEMENT
      Date: ${new Date().toISOString().split('T')[0]}
      Between: Company A and Company B
      Terms: Software development services
      Duration: 12 months
      Value: $${(Math.random() * 50000 + 10000).toFixed(2)}
    `,
    expectedCategory: 'Legal',
    expectedFolder: 'Legal/Contracts',
  }),

  report: () => ({
    content: `
      PROJECT STATUS REPORT
      Date: ${new Date().toISOString().split('T')[0]}
      Project: Test Project ${Math.floor(Math.random() * 100)}
      Progress: ${Math.floor(Math.random() * 100)}% complete
      Budget: On track
      Timeline: Meeting milestones
    `,
    expectedCategory: 'Project',
    expectedFolder: 'Projects/Reports',
  }),
};

// Import and setup mock services
const mockOllamaService = require('./mocks/ollama');

// Create a mock logger to handle module resolution issues
const mockLogger = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  trace: jest.fn(),
  log: jest.fn(),
  setLevel: jest.fn(),
  setContext: jest.fn(),
  enableFileLogging: jest.fn(),
  disableConsoleLogging: jest.fn(),
  fileOperation: jest.fn(),
  aiAnalysis: jest.fn(),
  phaseTransition: jest.fn(),
  performance: jest.fn(),
  actionTrack: jest.fn(),
  ollamaCall: jest.fn(),
  queueMetrics: jest.fn(),
};

// Mock the logger module
jest.mock('../../src/shared/logger', () => ({
  logger: mockLogger,
  Logger: jest.fn(),
  LOG_LEVELS: {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3,
    TRACE: 4,
  },
  LOG_LEVEL_NAMES: ['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'],
}));

// Make mock services globally available
global.mockOllamaService = mockOllamaService;
global.mockLogger = mockLogger;

// Store original global state for restoration
const originalGlobalState = {
  console: { ...console },
  document: global.document,
  window: global.window,
  performance: global.performance,
  documentStore: global.documentStore,
  processingQueue: global.processingQueue,
  stateListeners: global.stateListeners,
  progressListeners: global.progressListeners,
  aiConfig: global.aiConfig,
  testFileSystem: global.testFileSystem,
  testUtils: global.testUtils,
  performanceUtils: global.performanceUtils,
  testDataGenerators: global.testDataGenerators,
  mockOllamaService: global.mockOllamaService,
};

// Cleanup between tests
beforeEach(() => {
  jest.clearAllMocks();
  jest.clearAllTimers();

  // Reset all global state
  global.documentStore = [];
  global.processingQueue = [];
  global.stateListeners = [];
  global.progressListeners = [];
  global.testFileSystem.clear();

  // Reset mock services to default behavior
  mockOllamaService.analyze.mockResolvedValue({
    status: 'success',
    analysis: {
      category: 'Financial',
      purpose: 'Invoice processing',
      keywords: ['invoice', 'payment', 'financial'],
      confidence: 0.92,
      suggestedFolder: 'Financial/Invoices',
      suggestedName: 'Invoice_Test_2024-06-04.pdf',
    },
  });

  mockOllamaService.isConnected.mockReturnValue(true);
});

// Comprehensive cleanup after each test
afterEach(() => {
  // Clear all mocks
  jest.clearAllMocks();
  jest.clearAllTimers();
  jest.useRealTimers();

  // Reset global state to prevent test pollution
  global.documentStore = [];
  global.processingQueue = [];
  global.stateListeners = [];
  global.progressListeners = [];

  // Clear test file system
  if (global.testFileSystem && global.testFileSystem.clear) {
    global.testFileSystem.clear();
  }

  // Reset AI config to defaults
  global.aiConfig = {
    confidenceThreshold: 0.7,
    folderNamingPattern: '{category}/{type}',
    enableDateExtraction: true,
    categories: ['Financial', 'Legal', 'Project', 'Personal', 'Technical'],
  };

  // Reset DOM mocks
  if (global.document && typeof global.document.querySelector === 'function') {
    global.document.querySelector.mockClear();
    global.document.querySelectorAll.mockClear();
    global.document.createElement.mockClear();
  }

  if (global.window && typeof global.window.addEventListener === 'function') {
    global.window.addEventListener.mockClear();
    global.window.removeEventListener.mockClear();
  }

  // Reset performance mocks
  if (global.performance && typeof global.performance.mark === 'function') {
    global.performance.mark.mockClear();
    global.performance.measure.mockClear();
    global.performance.now.mockClear();
  }

  // Clear any global event listeners that might have been added
  if (typeof process !== 'undefined' && process.removeAllListeners) {
    // Only remove listeners we know were added during tests
    // Be careful not to remove critical process listeners
  }

  // Force garbage collection if available (for memory leak detection)
  if (global.gc) {
    global.gc();
  }
});

// Test environment validation
beforeAll(() => {
  // Increase max listeners to prevent EventEmitter memory leak warnings
  // during test runs where multiple listeners are added to process events
  process.setMaxListeners(20);

  console.log('🧪 Stratosort Test Environment Initialized');
  console.log('📋 Test utilities available:', Object.keys(global.testUtils));
  console.log('⚡ Performance monitoring enabled');
  console.log('🎯 Mock services configured');
});

afterAll(() => {
  // Reset max listeners to default after tests complete
  process.setMaxListeners(10);

  // Final comprehensive cleanup and restoration
  try {
    // Restore original global state where possible
    if (originalGlobalState.console) {
      global.console = { ...originalGlobalState.console };
    }

    // Clear all global test state
    delete global.documentStore;
    delete global.processingQueue;
    delete global.stateListeners;
    delete global.progressListeners;
    delete global.aiConfig;
    delete global.testFileSystem;
    delete global.testUtils;
    delete global.performanceUtils;
    delete global.testDataGenerators;
    delete global.mockOllamaService;

    // Clear mocks if they exist
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();

    // Force final garbage collection
    if (global.gc) {
      global.gc();
    }

    console.log('✅ All Stratosort tests completed');
    console.log('🧹 Test environment completely cleaned up and restored');
  } catch (error) {
    console.error('Error during final test cleanup:', error);
  }
});
