/**
 * Global test setup for DOM-dependent packages
 * Sets up necessary globals before tests run
 */

// Mock DOM globals that packages like officeparser expect
global.window = global.window || {
  location: { href: 'http://localhost' },
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  navigator: {
    userAgent: 'Test',
  },
};

global.document = global.document || {
  querySelector: jest.fn(),
  querySelectorAll: jest.fn(() => []),
  createElement: jest.fn(() => ({
    click: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    style: {},
    setAttribute: jest.fn(),
    getAttribute: jest.fn(),
  })),
  body: {
    appendChild: jest.fn(),
    removeChild: jest.fn(),
  },
  head: {
    appendChild: jest.fn(),
    removeChild: jest.fn(),
  },
};

// Mock Element constructor that officeparser checks for
global.Element =
  global.Element ||
  class Element {
    constructor() {
      this.style = {};
      this.children = [];
    }

    appendChild() {}
    removeChild() {}
    addEventListener() {}
    removeEventListener() {}
    setAttribute() {}
    getAttribute() {
      return null;
    }
  };

// Mock console methods to reduce test noise
const originalConsole = global.console;
global.console = {
  ...originalConsole,
  // Suppress specific warnings we know about
  warn: jest.fn((message) => {
    if (typeof message === 'string' && message.includes('pdfjs')) return;
    originalConsole.warn(message);
  }),
  error: jest.fn((message) => {
    if (typeof message === 'string' && message.includes('pdfjs')) return;
    originalConsole.error(message);
  }),
};

// Mock fetch for any network-dependent packages
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    blob: () => Promise.resolve(new Blob()),
  }),
);

// Helper function to normalize paths across different OS
global.normalizePath = (path) => {
  return path.replace(/\\/g, '/');
};

// Helper to create cross-platform temp directories
global.createTestTempDir = async (prefix = 'test-') => {
  const fs = require('fs').promises;
  const path = require('path');
  const os = require('os');
  let tempDir;
  try {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    return global.normalizePath(tempDir);
  } catch (error) {
    throw error;
  } finally {
    // Register cleanup
    if (tempDir && global.__tempDirs) {
      global.__tempDirs.push(tempDir);
    }
  }
};
