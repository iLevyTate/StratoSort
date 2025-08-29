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
  handleAnalysisError: jest.fn().mockReturnValue({ error: 'Mocked error' }),
}));

// Mock logger
jest.mock('../src/shared/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    setContext: jest.fn(),
  },
}));

const {
  analyzeImageFile,
} = require('../src/main/analysis/ollamaImageAnalysis');
const {
  analyzeDocumentFile,
} = require('../src/main/analysis/ollamaDocumentAnalysis');

/**
 * These tests focus on negative/edge-case inputs to ensure the analysers fail
 * gracefully and return structured error objects instead of throwing.
 * NOTE:  Ollama calls are mocked implicitly by the existing jest mock in
 * ../mocks/ollama.js so tests run fast and offline.
 */

// Set timeout for async operations to prevent hanging
jest.setTimeout(10000); // 10 seconds

describe('Analysis edge cases', () => {
  test('Image analyser rejects unsupported extension', async () => {
    const tmpFile = path.join(os.tmpdir(), 'sample.unsupported');
    await fs.writeFile(tmpFile, 'dummy');

    const result = await analyzeImageFile(tmpFile);
    await fs.unlink(tmpFile);

    expect(result).toHaveProperty('error');
    expect(result.category).toBe('unsupported');
  });

  test('Image analyser rejects zero-byte PNG', async () => {
    const tmpFile = path.join(os.tmpdir(), 'empty.png');
    await fs.writeFile(tmpFile, Buffer.alloc(0));

    const result = await analyzeImageFile(tmpFile);
    await fs.unlink(tmpFile);

    expect(result).toHaveProperty('error');
    expect(result.confidence).toBe(0);
  });

  test('Document analyser handles non-PDF unknown extension via fallback', async () => {
    const tmpFile = path.join(os.tmpdir(), 'notes.xyz');
    await fs.writeFile(tmpFile, 'Project Alpha draft');

    const result = await analyzeDocumentFile(tmpFile, []);
    await fs.unlink(tmpFile);

    expect(result).toHaveProperty('category');
    // Should not throw even though extension unsupported
  });
});
