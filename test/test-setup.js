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
const { mockOllamaService } = require('./mocks/ollama');

// Make mock services globally available
global.mockOllamaService = mockOllamaService;

// Cleanup between tests
beforeEach(() => {
  jest.clearAllMocks();
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

// Test environment validation
beforeAll(() => {
  console.log('🧪 Stratosort Test Environment Initialized');
  console.log('📋 Test utilities available:', Object.keys(global.testUtils));
  console.log('⚡ Performance monitoring enabled');
  console.log('🎯 Mock services configured');
});

afterAll(() => {
  console.log('✅ All Stratosort tests completed');
  console.log('🧹 Test environment cleaned up');
});
