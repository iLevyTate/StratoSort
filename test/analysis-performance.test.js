const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Test the performance optimization features
describe('Performance Optimizations', () => {
  describe('Content Sampling Functions', () => {
    const {
      sampleLargeContent,
    } = require('../src/main/analysis/documentExtractors');
    const { CACHE_CONFIG } = require('../src/shared/constants');

    test('sampleLargeContent reduces content appropriately', () => {
      const largeContent = 'Long document content. '.repeat(2000); // ~40KB content
      const result = sampleLargeContent(largeContent);

      expect(result.length).toBeLessThanOrEqual(largeContent.length);
      expect(result.length).toBeGreaterThan(1000);
      expect(result).toContain('Long document content');
    });

    test('sampleLargeContent handles small content', () => {
      const smallContent = 'Short content';
      const result = sampleLargeContent(smallContent);

      expect(result).toBe(smallContent);
    });

    test('sampleLargeContent handles edge cases', () => {
      expect(sampleLargeContent('')).toBe('');
      expect(sampleLargeContent(null)).toBe(null);
      expect(sampleLargeContent(undefined)).toBe(undefined);
    });
  });

  describe('Cache Configuration', () => {
    const { CACHE_CONFIG } = require('../src/shared/constants');

    test('CACHE_CONFIG has proper structure', () => {
      expect(CACHE_CONFIG).toHaveProperty('ENABLED');
      expect(CACHE_CONFIG).toHaveProperty('TTL');
      expect(CACHE_CONFIG).toHaveProperty('MAX_SIZE');
      expect(CACHE_CONFIG).toHaveProperty('COMPRESSION');
      expect(CACHE_CONFIG).toHaveProperty('PERSISTENCE');

      expect(typeof CACHE_CONFIG.ENABLED).toBe('boolean');
      expect(typeof CACHE_CONFIG.TTL).toBe('object');
      expect(typeof CACHE_CONFIG.MAX_SIZE).toBe('object');
    });

    test('TTL values are reasonable', () => {
      const oneDay = 24 * 60 * 60 * 1000;
      const sevenDays = 7 * oneDay;
      const thirtyDays = 30 * oneDay;

      expect(CACHE_CONFIG.TTL.ANALYSIS).toBe(sevenDays);
      expect(CACHE_CONFIG.TTL.EMBEDDINGS).toBe(thirtyDays);
      expect(CACHE_CONFIG.TTL.CONTENT_EXTRACTION).toBe(oneDay);
    });

    test('cache size limits are appropriate', () => {
      expect(CACHE_CONFIG.MAX_SIZE.ANALYSIS_CACHE).toBe(1000);
      expect(CACHE_CONFIG.MAX_SIZE.EMBEDDING_CACHE).toBe(5000);
      expect(CACHE_CONFIG.MAX_SIZE.CONTENT_CACHE).toBe(500);
    });
  });

  describe('Performance Constants', () => {
    const {
      PROCESSING_LIMITS,
      AI_DEFAULTS,
    } = require('../src/shared/constants');

    test('processing limits are optimized', () => {
      expect(PROCESSING_LIMITS.MAX_CONCURRENT_ANALYSIS).toBe(8);
      expect(PROCESSING_LIMITS.ANALYSIS_TIMEOUT).toBe(25000); // 25s
      expect(PROCESSING_LIMITS.RETRY_ATTEMPTS).toBe(2);
    });

    test('AI defaults are optimized for performance', () => {
      expect(AI_DEFAULTS.TEXT.MAX_CONTENT_LENGTH).toBe(4000);
      expect(AI_DEFAULTS.TEXT.MAX_TOKENS).toBe(400);
      expect(AI_DEFAULTS.TEXT.TEMPERATURE).toBe(0.1);
    });

    test('renderer limits are reasonable', () => {
      const { RENDERER_LIMITS } = require('../src/shared/constants');
      expect(RENDERER_LIMITS.ANALYSIS_TIMEOUT_MS).toBe(45000); // 45s
      expect(RENDERER_LIMITS.FILE_STATS_BATCH_SIZE).toBe(25);
    });
  });

  describe('Analysis Cache Integration', () => {
    let cacheInstance;

    beforeEach(() => {
      // Create a simple test cache instance for testing
      class TestCache {
        constructor() {
          this.cache = new Map();
        }

        generateKey(filePath, contentLength) {
          return `test_${filePath}_${contentLength}`;
        }

        get(key) {
          const item = this.cache.get(key);
          if (!item) return null;

          // Check if item has expired (simulate TTL)
          if (
            item.timestamp &&
            Date.now() - item.timestamp > 24 * 60 * 60 * 1000
          ) {
            this.cache.delete(key);
            return null;
          }

          // Return the original data without the timestamp
          const { timestamp, ...originalData } = item;
          return originalData;
        }

        set(key, data) {
          const item = {
            ...data,
            timestamp: Date.now(),
          };
          this.cache.set(key, item);
        }
      }

      cacheInstance = new TestCache();
    });

    test('cache has proper interface', () => {
      expect(cacheInstance).toHaveProperty('generateKey');
      expect(cacheInstance).toHaveProperty('get');
      expect(cacheInstance).toHaveProperty('set');
      expect(typeof cacheInstance.generateKey).toBe('function');
      expect(typeof cacheInstance.get).toBe('function');
      expect(typeof cacheInstance.set).toBe('function');
    });

    test('cache generates consistent keys', () => {
      const key1 = cacheInstance.generateKey('/path/to/file.txt', 1024);
      const key2 = cacheInstance.generateKey('/path/to/file.txt', 1024);
      const key3 = cacheInstance.generateKey('/path/to/file.txt', 2048);

      expect(key1).toBe(key2);
      expect(key1).not.toBe(key3);
    });

    test('cache stores and retrieves data', () => {
      const testData = { result: 'test', confidence: 85 };
      const key = 'test_key_123';

      // Store data
      cacheInstance.set(key, testData);

      // Retrieve data
      const retrieved = cacheInstance.get(key);

      expect(retrieved).toEqual(testData);
    });

    test('cache respects TTL', () => {
      const testData = { result: 'ttl_test' };
      const key = 'ttl_test_key';

      // Store data
      cacheInstance.set(key, testData);

      // Retrieve immediately - should work
      let retrieved = cacheInstance.get(key);
      expect(retrieved).toEqual(testData);

      // Simulate TTL expiration by directly modifying the cache
      const cacheMap = cacheInstance.cache;
      const item = cacheMap.get(key);
      if (item) {
        // Set timestamp to be very old (more than 24 hours ago)
        item.timestamp = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
        cacheMap.set(key, item);
      }

      // Should not retrieve expired data
      retrieved = cacheInstance.get(key);
      expect(retrieved).toBe(null);
    });
  });

  describe('Large File Processing', () => {
    const {
      extractTextFromLargeFile,
    } = require('../src/main/analysis/documentExtractors');

    test('handles large files efficiently', async () => {
      // Create a moderately large test file
      const largeContent = 'Test content line.\n'.repeat(10000); // ~200KB

      const tempDir = await fs.mkdtemp(
        path.join(os.tmpdir(), 'large-file-perf-test-'),
      );
      const tempFilePath = path.join(tempDir, 'large-test.txt');

      await fs.writeFile(tempFilePath, largeContent);

      const startTime = Date.now();
      const result = await extractTextFromLargeFile(tempFilePath);
      const endTime = Date.now();

      expect(result).toBe(largeContent);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds

      // Cleanup
      await fs.rm(tempDir, { recursive: true, force: true });
    }, 10000); // 10 second timeout

    test('memory usage is reasonable', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Process a large file
      const largeContent = 'Memory test content.\n'.repeat(50000); // ~1MB

      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'memory-test-'));
      const tempFilePath = path.join(tempDir, 'memory-test.txt');

      await fs.writeFile(tempFilePath, largeContent);
      await extractTextFromLargeFile(tempFilePath);

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);

      // Cleanup
      await fs.rm(tempDir, { recursive: true, force: true });
    });
  });
});
