/**
 * Global test setup for DOM-dependent packages and shared utilities
 * Enhanced to support officeparser and other complex dependencies
 */

// Enhanced JSDOM setup for packages that need DOM methods
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
  resources: 'usable'
});

// Set up global DOM objects
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.HTMLElement = dom.window.HTMLElement;

// Add missing DOM methods that officeparser needs
global.document.getElementsByTagName = global.document.getElementsByTagName || function(tagName) {
  return [];
};

global.document.currentScript = null;

// Mock XMLHttpRequest for PDF.js and other dependencies
global.XMLHttpRequest = class XMLHttpRequest {
  constructor() {
    this.readyState = 0;
    this.status = 200;
    this.statusText = 'OK';
    this.responseText = '';
    this.response = '';
  }
  
  open() { this.readyState = 1; }
  send() { this.readyState = 4; }
  setRequestHeader() {}
  addEventListener() {}
  removeEventListener() {}
};

// Mock fetch for modern dependencies
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    blob: () => Promise.resolve(new Blob())
  })
);

// Mock URL and Blob for file handling
global.URL = {
  createObjectURL: jest.fn(() => 'mock-url'),
  revokeObjectURL: jest.fn()
};

global.Blob = class Blob {
  constructor(parts = [], options = {}) {
    this.parts = parts;
    this.type = options.type || '';
    this.size = parts.reduce((size, part) => size + (part.length || 0), 0);
  }
};

// Mock FileReader for file operations
global.FileReader = class FileReader {
  constructor() {
    this.readyState = 0;
    this.result = null;
    this.error = null;
  }
  
  readAsText() {
    this.readyState = 2;
    this.result = 'mock file content';
    if (this.onload) this.onload();
  }
  
  readAsArrayBuffer() {
    this.readyState = 2;
    this.result = new ArrayBuffer(8);
    if (this.onload) this.onload();
  }
  
  addEventListener() {}
  removeEventListener() {}
};

// Mock Canvas for image processing
global.HTMLCanvasElement = class HTMLCanvasElement {
  constructor() {
    this.width = 0;
    this.height = 0;
  }
  
  getContext() {
    return {
      drawImage: jest.fn(),
      getImageData: jest.fn(() => ({ data: new Uint8ClampedArray(4) })),
      putImageData: jest.fn(),
      fillRect: jest.fn(),
      clearRect: jest.fn()
    };
  }
  
  toDataURL() {
    return 'data:image/png;base64,mock-image-data';
  }
};

// Mock Worker for background processing
global.Worker = class Worker {
  constructor() {
    this.onmessage = null;
    this.onerror = null;
  }
  
  postMessage() {}
  terminate() {}
  addEventListener() {}
  removeEventListener() {}
};

// Suppress console warnings in tests unless explicitly needed
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

console.warn = (...args) => {
  // Only show warnings that aren't from known test issues
  const message = args[0] || '';
  if (!message.includes('Warning: ReactDOM.render') && 
      !message.includes('pdf.worker') &&
      !message.includes('Unknown option')) {
    originalConsoleWarn.apply(console, args);
  }
};

console.error = (...args) => {
  // Only show errors that aren't from known test issues
  const message = args[0] || '';
  if (!message.includes('Warning: ReactDOM.render') && 
      !message.includes('pdf.worker')) {
    originalConsoleError.apply(console, args);
  }
}; 