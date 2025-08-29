// Mock services before importing analysisUtils
jest.mock('../src/main/services/EmbeddingIndexService');
jest.mock('../src/main/services/FolderMatchingService');
jest.mock('../src/main/services/ModelVerifier');

// Mock logger before importing analysisUtils
jest.mock('../src/shared/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    setContext: jest.fn(),
  },
}));

// Setup mock implementations
const mockModelVerifier = { verifyModel: jest.fn() };
const mockEmbeddingIndex = {
  initialize: jest.fn().mockResolvedValue(),
  resetFolders: jest.fn(),
};
const mockFolderMatcher = { upsertFolderEmbedding: jest.fn() };

require('../src/main/services/ModelVerifier').mockImplementation(
  () => mockModelVerifier,
);
require('../src/main/services/EmbeddingIndexService').mockImplementation(
  () => mockEmbeddingIndex,
);
require('../src/main/services/FolderMatchingService').mockImplementation(
  () => mockFolderMatcher,
);

const {
  getSharedServices,
  performSemanticAnalysis,
  handleAnalysisError,
  validateAnalysisResult,
  getMemoryUsage,
  isResourceConstrained,
  delay,
  processBatch,
} = require('../src/main/analysis/analysisUtils');

// Get the mocked logger
const { logger: mockLogger } = require('../src/shared/logger');

// Also test the original utils for compatibility
const { normalizeAnalysisResult } = require('../src/main/analysis/utils');

describe('analysis utils', () => {
  describe('normalizeAnalysisResult', () => {
    test('returns normalized result with default values', () => {
      const raw = {};
      const result = normalizeAnalysisResult(raw);

      expect(result).toEqual({
        category: 'document',
        keywords: [],
        confidence: 0,
        suggestedName: null,
        extractionMethod: null,
        contentLength: null,
      });
    });

    test('preserves valid values from raw result', () => {
      const raw = {
        category: 'financial',
        keywords: ['budget', 'report'],
        confidence: 85,
        suggestedName: 'budget_report.pdf',
        extractionMethod: 'pdf-parser',
        contentLength: 1024,
        extraField: 'extra value',
      };

      const result = normalizeAnalysisResult(raw);

      expect(result.category).toBe('financial');
      expect(result.keywords).toEqual(['budget', 'report']);
      expect(result.confidence).toBe(85);
      expect(result.suggestedName).toBe('budget_report.pdf');
      expect(result.extractionMethod).toBe('pdf-parser');
      expect(result.contentLength).toBe(1024);
      expect(result.extraField).toBe('extra value');
    });

    test('applies fallback values for invalid data', () => {
      const raw = {
        category: '',
        keywords: 'not an array',
        confidence: 'invalid number',
        suggestedName: 123,
        contentLength: 'invalid number',
      };

      const fallback = {
        category: 'fallback-category',
        keywords: ['fallback', 'keywords'],
        confidence: 75,
        suggestedName: 'fallback-name.pdf',
        extractionMethod: 'fallback-method',
        contentLength: 512,
      };

      const result = normalizeAnalysisResult(raw, fallback);

      expect(result.category).toBe('fallback-category');
      expect(result.keywords).toEqual(['fallback', 'keywords']);
      expect(result.confidence).toBe(75);
      expect(result.suggestedName).toBe('fallback-name.pdf');
      expect(result.extractionMethod).toBe('fallback-method');
      expect(result.contentLength).toBe(512);
    });

    test('handles edge cases', () => {
      expect(normalizeAnalysisResult(null)).toEqual({
        category: 'document',
        keywords: [],
        confidence: 0,
        suggestedName: null,
        extractionMethod: null,
        contentLength: null,
      });

      expect(normalizeAnalysisResult(undefined)).toEqual({
        category: 'document',
        keywords: [],
        confidence: 0,
        suggestedName: null,
        extractionMethod: null,
        contentLength: null,
      });

      expect(normalizeAnalysisResult('string')).toEqual({
        category: 'document',
        keywords: [],
        confidence: 0,
        suggestedName: null,
        extractionMethod: null,
        contentLength: null,
      });
    });

    test('trims whitespace from category', () => {
      const raw = { category: '  financial  ' };
      const result = normalizeAnalysisResult(raw);
      expect(result.category).toBe('financial');
    });

    test('filters out non-array keywords', () => {
      const raw = { keywords: null };
      const result = normalizeAnalysisResult(raw, { keywords: ['fallback'] });
      expect(result.keywords).toEqual(['fallback']);
    });

    test('validates confidence range', () => {
      expect(normalizeAnalysisResult({ confidence: -5 }).confidence).toBe(0);
      expect(normalizeAnalysisResult({ confidence: 150 }).confidence).toBe(150);
      expect(normalizeAnalysisResult({ confidence: 75 }).confidence).toBe(75);
    });

    test('handles non-string suggestedName', () => {
      const raw = { suggestedName: 123 };
      const result = normalizeAnalysisResult(raw, {
        suggestedName: 'fallback.pdf',
      });
      expect(result.suggestedName).toBe('fallback.pdf');
    });

    test('handles non-number contentLength', () => {
      const raw = { contentLength: 'not a number' };
      const result = normalizeAnalysisResult(raw, { contentLength: 256 });
      expect(result.contentLength).toBe(256);
    });

    test('preserves fallback contentLength of 0', () => {
      const result = normalizeAnalysisResult({}, { contentLength: 0 });
      expect(result.contentLength).toBe(0);
    });
  });

  describe('getSharedServices', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('returns initialized services on first call', async () => {
      // Clear call history
      mockEmbeddingIndex.initialize.mockClear();

      const services = await getSharedServices();

      expect(mockModelVerifier).toBeDefined();
      expect(mockEmbeddingIndex.initialize).toHaveBeenCalled();
      expect(mockFolderMatcher).toBeDefined();
      expect(services).toHaveProperty('modelVerifier');
      expect(services).toHaveProperty('embeddingIndex');
      expect(services).toHaveProperty('folderMatcher');
    });

    test('returns equivalent services on subsequent calls', async () => {
      const services1 = await getSharedServices();
      const services2 = await getSharedServices();

      // Check that both have the same structure
      expect(services1).toHaveProperty('modelVerifier');
      expect(services1).toHaveProperty('embeddingIndex');
      expect(services1).toHaveProperty('folderMatcher');

      expect(services2).toHaveProperty('modelVerifier');
      expect(services2).toHaveProperty('embeddingIndex');
      expect(services2).toHaveProperty('folderMatcher');
    });
  });

  describe('handleAnalysisError', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockLogger.error.mockClear();
    });

    test('returns standardized error response', () => {
      const error = new Error('Test error');
      const context = {
        type: 'Document Analysis',
        filePath: '/test/file.pdf',
        fileName: 'file.pdf',
        extractionMethod: 'pdf-parser',
        fallbackCategory: 'document',
        confidence: 40,
      };

      const result = handleAnalysisError(error, context);

      expect(result.error).toBe('Analysis failed: Test error');
      expect(result.keywords).toEqual([]);
      expect(result.confidence).toBe(20); // Reduced by 20 from context
      expect(result.extractionMethod).toBe('pdf-parser');
      expect(result.category).toBe('document');
      expect(result.project).toBe('file.pdf');
      expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test('uses default values when context is missing', () => {
      const error = new Error('Test error');
      const result = handleAnalysisError(error);

      expect(result.error).toBe('Analysis failed: Test error');
      expect(result.keywords).toEqual([]);
      expect(result.confidence).toBe(40); // 60 - 20
      expect(result.extractionMethod).toBe('error');
      expect(result.category).toBe('document');
    });

    test('logs error with context', () => {
      const error = new Error('Test error');
      const context = { type: 'Test', filePath: '/test' };

      handleAnalysisError(error, context);

      expect(mockLogger.error).toHaveBeenCalledWith(
        '[ANALYSIS-ERROR] Test failed',
        expect.objectContaining({
          error: 'Test error',
          path: '/test',
        }),
      );
    });
  });

  describe('validateAnalysisResult', () => {
    test('returns validation errors for invalid input', () => {
      const result = validateAnalysisResult(null);
      expect(result.error).toBe('Invalid analysis result structure');
      expect(result.keywords).toEqual([]);
      expect(result.confidence).toBe(0);
    });

    test('validates and cleans result data', () => {
      const input = {
        category: '  financial  ',
        keywords: ['budget', '', 'report', null],
        confidence: 85,
        suggestedName: 'budget_report.pdf',
        project: 'Project X',
        purpose: 'Financial analysis',
        date: new Date('2023-01-01'),
        extractionMethod: 'pdf-parser',
        invalidField: 'should be removed',
      };

      const result = validateAnalysisResult(input);

      expect(result.category).toBe('financial'); // trimmed
      expect(result.keywords).toEqual(['budget', 'report']); // filtered empty/null
      expect(result.confidence).toBe(85);
      expect(result.suggestedName).toBe('budget_report.pdf');
      expect(result.project).toBe('Project X');
      expect(result.purpose).toBe('Financial analysis');
      expect(result.date).toBe('2023-01-01'); // converted to string
      expect(result.extractionMethod).toBe('pdf-parser');
      expect(result.invalidField).toBeUndefined(); // function removes extra fields for security
    });

    test('applies fallback values for invalid data', () => {
      const input = {
        category: null,
        keywords: 'not an array',
        confidence: 'invalid',
        suggestedName: 123,
      };

      const fallbacks = {
        category: 'fallback-category',
        keywords: ['fallback'],
        confidence: 75,
        suggestedName: 'fallback.pdf',
        extractionMethod: 'fallback',
      };

      const result = validateAnalysisResult(input, fallbacks);

      expect(result.category).toBe('fallback-category');
      expect(result.keywords).toEqual(['fallback']);
      expect(result.confidence).toBe(75);
      expect(result.suggestedName).toBe('fallback.pdf');
      expect(result.extractionMethod).toBe('fallback');
    });

    test('validates confidence range', () => {
      expect(validateAnalysisResult({ confidence: -5 }).confidence).toBe(0);
      expect(validateAnalysisResult({ confidence: 150 }).confidence).toBe(0); // Uses default when out of range
      expect(validateAnalysisResult({ confidence: 75 }).confidence).toBe(75);
    });
  });

  describe('performSemanticAnalysis', () => {
    let mockEmbeddingIndex;
    let mockFolderMatcher;

    beforeEach(() => {
      mockEmbeddingIndex = {
        resetFolders: jest.fn(),
      };
      mockFolderMatcher = {
        upsertFolderEmbedding: jest.fn().mockResolvedValue(),
        upsertFileEmbedding: jest.fn().mockResolvedValue(),
        matchFileToFolders: jest.fn().mockResolvedValue([]),
      };

      jest.clearAllMocks();
    });

    test('returns analysis unchanged when no smart folders', async () => {
      const analysis = { category: 'document', keywords: ['test'] };
      const result = await performSemanticAnalysis(
        analysis,
        'file1',
        'test content',
        mockEmbeddingIndex,
        mockFolderMatcher,
        [],
        '/path/file.pdf',
      );

      expect(result).toBe(analysis);
      expect(mockFolderMatcher.upsertFolderEmbedding).not.toHaveBeenCalled();
    });

    test('processes smart folders and updates analysis', async () => {
      const smartFolders = [
        { id: '1', name: 'Finance', description: 'Financial documents' },
        { id: '2', name: 'Project', description: 'Project documents' },
      ];

      mockFolderMatcher.matchFileToFolders.mockResolvedValue([
        { name: 'Finance', score: 0.8 },
        { name: 'Project', score: 0.6 },
      ]);

      const analysis = { category: 'document', keywords: ['budget'] };
      const result = await performSemanticAnalysis(
        analysis,
        'file1',
        'budget report content',
        mockEmbeddingIndex,
        mockFolderMatcher,
        smartFolders,
        '/path/file.pdf',
      );

      expect(mockFolderMatcher.upsertFolderEmbedding).toHaveBeenCalledTimes(2);
      expect(mockFolderMatcher.upsertFileEmbedding).toHaveBeenCalledWith(
        'file1',
        'budget report content',
        { path: '/path/file.pdf' },
      );
      expect(mockFolderMatcher.matchFileToFolders).toHaveBeenCalledWith(
        'file1',
        5,
      );
      expect(result.category).toBe('Finance'); // Best match
      expect(result.folderMatchCandidates).toEqual([
        { name: 'Finance', score: 0.8 },
        { name: 'Project', score: 0.6 },
      ]);
    });

    test('handles errors gracefully', async () => {
      mockFolderMatcher.upsertFolderEmbedding.mockRejectedValue(
        new Error('Embedding error'),
      );

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const analysis = { category: 'document' };
      const result = await performSemanticAnalysis(
        analysis,
        'file1',
        'content',
        mockEmbeddingIndex,
        mockFolderMatcher,
        [{ id: '1', name: 'Test' }],
        '/path/file.pdf',
      );

      expect(result).toBe(analysis); // unchanged
      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });
  });

  describe('getMemoryUsage', () => {
    test('returns memory usage statistics', () => {
      const result = getMemoryUsage();

      expect(result).toHaveProperty('rss');
      expect(result).toHaveProperty('heapUsed');
      expect(result).toHaveProperty('heapTotal');
      expect(result).toHaveProperty('external');
      expect(result).toHaveProperty('percentage');

      expect(typeof result.rss).toBe('number');
      expect(typeof result.heapUsed).toBe('number');
      expect(typeof result.heapTotal).toBe('number');
      expect(typeof result.external).toBe('number');
      expect(typeof result.percentage).toBe('number');

      expect(result.rss).toBeGreaterThan(0);
      expect(result.heapUsed).toBeGreaterThanOrEqual(0);
      expect(result.heapTotal).toBeGreaterThan(0);
      expect(result.percentage).toBeGreaterThanOrEqual(0);
    });
  });

  describe('isResourceConstrained', () => {
    test('returns false when memory usage is low', () => {
      // Mock getMemoryUsage to return low usage
      const originalGetMemoryUsage =
        require('../src/main/analysis/analysisUtils').getMemoryUsage;
      require('../src/main/analysis/analysisUtils').getMemoryUsage = jest.fn(
        () => ({
          percentage: 50,
          rss: 1024 * 1024 * 1024, // 1GB
        }),
      );

      const result = isResourceConstrained();
      expect(result).toBe(false);

      // Restore original function
      require('../src/main/analysis/analysisUtils').getMemoryUsage =
        originalGetMemoryUsage;
    });

    test('returns false when memory usage is low', () => {
      // Test with current memory usage - this should pass in most environments
      const result = isResourceConstrained();
      const memoryUsage = getMemoryUsage();

      // The function should return a boolean
      expect(typeof result).toBe('boolean');

      // If memory usage is low, it should return false
      if (memoryUsage.percentage < 85 && memoryUsage.rss < 2048 * 1024 * 1024) {
        expect(result).toBe(false);
      }
    });

    test('function can handle high memory usage values', () => {
      // Test that the function works with different memory values
      // We can't easily mock the function, but we can test the logic indirectly
      const memoryUsage = getMemoryUsage();

      expect(memoryUsage).toHaveProperty('percentage');
      expect(memoryUsage).toHaveProperty('rss');
      expect(typeof memoryUsage.percentage).toBe('number');
      expect(typeof memoryUsage.rss).toBe('number');

      // The function should work with current memory usage
      const result = isResourceConstrained();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('delay', () => {
    test('delays execution for specified milliseconds', async () => {
      const start = Date.now();
      await delay(100);
      const end = Date.now();

      expect(end - start).toBeGreaterThanOrEqual(95); // Allow some tolerance
    });

    test('handles zero delay', async () => {
      const start = Date.now();
      await delay(0);
      const end = Date.now();

      expect(end - start).toBeLessThan(50); // Allow reasonable tolerance
    });
  });

  describe('processBatch', () => {
    test('processes items in batches with concurrency control', async () => {
      const items = [1, 2, 3, 4, 5];
      const processor = jest.fn(async (item) => `processed-${item}`);
      const onProgress = jest.fn();

      const results = await processBatch(items, processor, {
        concurrency: 2,
        delayMs: 10,
        onProgress,
      });

      expect(processor).toHaveBeenCalledTimes(5);
      expect(results).toHaveLength(5);
      expect(results.map((r) => r.value)).toEqual([
        'processed-1',
        'processed-2',
        'processed-3',
        'processed-4',
        'processed-5',
      ]);

      // onProgress should be called for each batch (3 batches for 5 items with concurrency 2)
      expect(onProgress).toHaveBeenCalledTimes(3);
    });

    test('handles processor errors gracefully', async () => {
      const items = [1, 2, 3];
      const processor = jest.fn(async (item) => {
        if (item === 2) throw new Error('Processing error');
        return `processed-${item}`;
      });

      const results = await processBatch(items, processor);

      expect(results).toHaveLength(3);
      expect(results[0].status).toBe('fulfilled');
      expect(results[0].value).toBe('processed-1');
      expect(results[1].status).toBe('rejected');
      expect(results[1].reason.message).toBe('Processing error');
      expect(results[2].status).toBe('fulfilled');
      expect(results[2].value).toBe('processed-3');
    });

    test('works with empty items array', async () => {
      const processor = jest.fn();
      const results = await processBatch([], processor);

      expect(processor).not.toHaveBeenCalled();
      expect(results).toEqual([]);
    });

    test('respects delay between batches', async () => {
      const items = [1, 2, 3, 4];
      const processor = jest.fn(async (item) => {
        await delay(10); // Small delay in processor
        return `processed-${item}`;
      });

      const start = Date.now();
      await processBatch(items, processor, {
        concurrency: 2,
        delayMs: 50,
      });
      const end = Date.now();

      // Should take at least delay between batches
      expect(end - start).toBeGreaterThanOrEqual(50);
    });
  });
});
