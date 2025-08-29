const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Mock shared services before importing analysis modules
jest.mock('../src/main/analysis/analysisUtils', () => ({
  getSharedServices: jest.fn().mockResolvedValue({
    modelVerifier: {
      checkOllamaConnection: jest
        .fn()
        .mockResolvedValue({ connected: false, error: 'Mocked offline' }),
    },
    embeddingIndex: {
      initialize: jest.fn().mockResolvedValue(),
      destroy: jest.fn().mockResolvedValue(),
    },
    folderMatcher: {
      findBestMatch: jest
        .fn()
        .mockResolvedValue({ folder: 'Mocked', confidence: 0.5 }),
    },
  }),
  validateAnalysisResult: jest.fn().mockReturnValue(true),
  handleAnalysisError: jest.fn().mockReturnValue({
    error: 'Mocked error',
    category: 'error',
    keywords: [],
    confidence: 0,
  }),
  performSemanticAnalysis: jest.fn().mockResolvedValue({
    category: 'test',
    keywords: ['test'],
    confidence: 80,
  }),
}));

// Mock logger
jest.mock('../src/shared/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock Sharp for image processing
jest.mock('sharp', () => {
  return jest.fn().mockImplementation(() => ({
    resize: jest.fn().mockReturnThis(),
    png: jest.fn().mockReturnThis(),
    jpeg: jest.fn().mockReturnThis(),
    webp: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('mock-image-buffer')),
  }));
});

// Mock PerformanceService
jest.mock('../src/main/services/PerformanceService', () => ({
  buildOllamaOptions: jest.fn().mockResolvedValue({}),
}));

// Mock fallback utils
jest.mock('../src/main/analysis/fallbackUtils', () => ({
  getIntelligentCategory: jest.fn().mockReturnValue('image'),
  getIntelligentKeywords: jest.fn().mockReturnValue(['image']),
  safeSuggestedName: jest.fn().mockReturnValue('test-image'),
}));

// Mock analysis utils
jest.mock('../src/main/analysis/utils', () => ({
  normalizeAnalysisResult: jest.fn().mockReturnValue({
    category: 'test',
    keywords: ['test'],
    confidence: 80,
  }),
}));

// Mock electron AppConfig
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => '/mock/path'),
  },
}));

jest.mock('../src/shared/constants', () => ({
  AI_DEFAULTS: {
    TEXT: {
      MODEL: 'llama3.2:latest',
      HOST: 'http://127.0.0.1:11434',
      MAX_CONTENT_LENGTH: 12000,
      TEMPERATURE: 0.1,
      MAX_TOKENS: 800,
    },
    IMAGE: {
      MODEL: 'llava:latest',
      HOST: 'http://127.0.0.1:11434',
      TEMPERATURE: 0.2,
      MAX_TOKENS: 1000,
    },
  },
  SUPPORTED_IMAGE_EXTENSIONS: ['.png', '.jpg', '.jpeg'],
  AppConfig: {
    ai: {
      imageAnalysis: {
        defaultModel: 'mock-model',
      },
    },
  },
}));

// Mock Ollama client
jest.mock('../src/main/ollamaUtils', () => ({
  getOllamaClient: jest.fn().mockResolvedValue({
    generate: jest.fn().mockResolvedValue({
      response: JSON.stringify({
        category: 'test',
        purpose: 'test analysis',
        keywords: ['test'],
        confidence: 80,
      }),
    }),
  }),
  loadOllamaConfig: jest.fn().mockResolvedValue({
    selectedVisionModel: 'mock-vision-model',
  }),
  getOllamaVisionModel: jest.fn().mockReturnValue('mock-vision-model'),
}));

// Set timeout to prevent hanging
jest.setTimeout(10000);

const {
  analyzeImageFile,
} = require('../src/main/analysis/ollamaImageAnalysis');

describe('Shared Services Integration in Image Analysis', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Integration with shared services', () => {
    test('analyzeImageFile works with smart folders parameter', async () => {
      // Create a simple test image
      const pngBase64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAn8B9tmvxOgAAAAASUVORK5CYII=';
      const buffer = Buffer.from(pngBase64.replace(/\s+/g, ''), 'base64');
      const tmpFile = path.join(os.tmpdir(), 'test-pixel.png');
      await fs.writeFile(tmpFile, buffer);

      const smartFolders = [
        { id: '1', name: 'Photos', description: 'Personal photos' },
        { id: '2', name: 'Documents', description: 'Important documents' },
      ];

      // Test that the function accepts smart folders parameter without error
      const result = await analyzeImageFile(tmpFile, smartFolders);

      await fs.unlink(tmpFile);

      // Verify it returns a valid result structure
      expect(result).toHaveProperty('category');
      expect(result).toHaveProperty('keywords');
      expect(result).toHaveProperty('confidence');
    });

    test('analyzeImageFile works without smart folders parameter', async () => {
      const pngBase64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAn8B9tmvxOgAAAAASUVORK5CYII=';
      const buffer = Buffer.from(pngBase64.replace(/\s+/g, ''), 'base64');
      const tmpFile = path.join(os.tmpdir(), 'test-pixel.png');
      await fs.writeFile(tmpFile, buffer);

      // Test that the function works without smart folders
      const result = await analyzeImageFile(tmpFile);

      await fs.unlink(tmpFile);

      // Verify it returns a valid result structure
      expect(result).toHaveProperty('category');
      expect(result).toHaveProperty('keywords');
      expect(result).toHaveProperty('confidence');
    });

    test('analyzeImageFile handles multiple sequential calls', async () => {
      const pngBase64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAn8B9tmvxOgAAAAASUVORK5CYII=';
      const buffer = Buffer.from(pngBase64.replace(/\s+/g, ''), 'base64');

      const tmpFile1 = path.join(os.tmpdir(), 'test-pixel-1.png');
      const tmpFile2 = path.join(os.tmpdir(), 'test-pixel-2.png');

      await fs.writeFile(tmpFile1, buffer);
      await fs.writeFile(tmpFile2, buffer);

      // Test multiple calls work without issues
      const result1 = await analyzeImageFile(tmpFile1, []);
      const result2 = await analyzeImageFile(tmpFile2, []);

      await fs.unlink(tmpFile1);
      await fs.unlink(tmpFile2);

      // Both should return valid results
      expect(result1).toHaveProperty('category');
      expect(result2).toHaveProperty('category');
    });
  });

  describe('Error handling', () => {
    test('analyzeImageFile handles invalid file paths', async () => {
      const result = await analyzeImageFile('/invalid/path.png', []);

      // Should return error result
      expect(result).toHaveProperty('error');
      expect(result).toHaveProperty('confidence');
    });

    test('analyzeImageFile handles empty smart folders array', async () => {
      const pngBase64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAn8B9tmvxOgAAAAASUVORK5CYII=';
      const buffer = Buffer.from(pngBase64.replace(/\s+/g, ''), 'base64');
      const tmpFile = path.join(os.tmpdir(), 'test-pixel.png');
      await fs.writeFile(tmpFile, buffer);

      const result = await analyzeImageFile(tmpFile, []);

      await fs.unlink(tmpFile);

      // Should work fine with empty smart folders
      expect(result).toHaveProperty('category');
      expect(result).toHaveProperty('keywords');
    });

    test('analyzeImageFile handles corrupted image files', async () => {
      const tmpFile = path.join(os.tmpdir(), 'corrupted.png');
      await fs.writeFile(tmpFile, Buffer.from('not an image'));

      const result = await analyzeImageFile(tmpFile, []);

      await fs.unlink(tmpFile);

      // The function should return a valid result structure
      // Even with corrupted data, it should attempt to process
      expect(result).toHaveProperty('category');
      expect(result).toHaveProperty('keywords');
      expect(result).toHaveProperty('confidence');
    });
  });
});
