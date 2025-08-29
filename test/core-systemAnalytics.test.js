// Mock logger before importing systemAnalytics
const loggerSpy = {
  info: jest.fn(),
  warn: jest.fn(),
};

jest.mock('../src/shared/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const systemAnalytics = require('../src/main/core/systemAnalytics');

describe('systemAnalytics', () => {
  beforeEach(() => {
    // Reset analytics state
    systemAnalytics.startTime = Date.now();
    systemAnalytics.processedFiles = 0;
    systemAnalytics.successfulOperations = 0;
    systemAnalytics.failedOperations = 0;
    systemAnalytics.totalProcessingTime = 0;
    systemAnalytics.errors = [];
    systemAnalytics.ollamaHealth = { status: 'unknown', lastCheck: null };

    // Clear mock call history
    const { logger } = require('../src/shared/logger');
    logger.info.mockClear();
    logger.warn.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initial state', () => {
    test('has correct initial values', () => {
      expect(systemAnalytics.startTime).toBeDefined();
      expect(typeof systemAnalytics.startTime).toBe('number');
      expect(systemAnalytics.processedFiles).toBe(0);
      expect(systemAnalytics.successfulOperations).toBe(0);
      expect(systemAnalytics.failedOperations).toBe(0);
      expect(systemAnalytics.totalProcessingTime).toBe(0);
      expect(systemAnalytics.errors).toEqual([]);
      expect(systemAnalytics.ollamaHealth).toEqual({
        status: 'unknown',
        lastCheck: null,
      });
    });
  });

  describe('recordProcessingTime', () => {
    test('records processing time and increments file count', () => {
      systemAnalytics.recordProcessingTime(1000);
      expect(systemAnalytics.totalProcessingTime).toBe(1000);
      expect(systemAnalytics.processedFiles).toBe(1);

      systemAnalytics.recordProcessingTime(500);
      expect(systemAnalytics.totalProcessingTime).toBe(1500);
      expect(systemAnalytics.processedFiles).toBe(2);
    });

    test('handles zero duration', () => {
      systemAnalytics.recordProcessingTime(0);
      expect(systemAnalytics.totalProcessingTime).toBe(0);
      expect(systemAnalytics.processedFiles).toBe(1);
    });

    test('handles negative duration', () => {
      systemAnalytics.recordProcessingTime(-100);
      expect(systemAnalytics.totalProcessingTime).toBe(-100);
      expect(systemAnalytics.processedFiles).toBe(1);
    });
  });

  describe('recordSuccess', () => {
    test('increments successful operations counter', () => {
      expect(systemAnalytics.successfulOperations).toBe(0);

      systemAnalytics.recordSuccess();
      expect(systemAnalytics.successfulOperations).toBe(1);

      systemAnalytics.recordSuccess();
      expect(systemAnalytics.successfulOperations).toBe(2);
    });
  });

  describe('recordFailure', () => {
    test('records error with timestamp and increments failure counter', () => {
      const error = new Error('Test error');

      systemAnalytics.recordFailure(error);

      expect(systemAnalytics.failedOperations).toBe(1);
      expect(systemAnalytics.errors).toHaveLength(1);
      expect(systemAnalytics.errors[0]).toEqual({
        timestamp: expect.any(Number),
        message: 'Test error',
        stack: error.stack,
      });
    });

    test('handles string errors', () => {
      systemAnalytics.recordFailure('String error');

      expect(systemAnalytics.errors[0]).toEqual({
        timestamp: expect.any(Number),
        message: 'String error',
        stack: undefined,
      });
    });

    test('handles object errors', () => {
      const errorObj = { message: 'Object error', code: 500 };
      systemAnalytics.recordFailure(errorObj);

      expect(systemAnalytics.errors[0]).toEqual({
        timestamp: expect.any(Number),
        message: 'Object error',
        stack: undefined,
      });
    });

    test('limits error history to 100 entries', () => {
      // Add 100 errors
      for (let i = 0; i < 100; i++) {
        systemAnalytics.recordFailure(new Error(`Error ${i}`));
      }

      expect(systemAnalytics.errors).toHaveLength(100);

      // Add one more error
      systemAnalytics.recordFailure(new Error('Error 101'));

      expect(systemAnalytics.errors).toHaveLength(100);
      expect(systemAnalytics.errors[99].message).toBe('Error 101');
      expect(systemAnalytics.errors[0].message).toBe('Error 1');
    });
  });

  describe('collectMetrics', () => {
    test('calculates basic metrics correctly', async () => {
      const startTime = systemAnalytics.startTime;

      // Simulate some activity
      systemAnalytics.recordProcessingTime(1000);
      systemAnalytics.recordProcessingTime(2000);
      systemAnalytics.recordSuccess();
      systemAnalytics.recordFailure(new Error('Test error'));

      const metrics = await systemAnalytics.collectMetrics();

      expect(metrics.uptime).toBeGreaterThanOrEqual(0);
      expect(metrics.processedFiles).toBe(2);
      expect(metrics.successfulOperations).toBe(1);
      expect(metrics.failedOperations).toBe(1);
      expect(metrics.avgProcessingTime).toBe(1500);
      expect(metrics.errorRate).toBe(50);
      expect(metrics.recentErrors).toHaveLength(1);
      expect(metrics.ollamaHealth).toEqual({
        status: 'unknown',
        lastCheck: null,
      });
    });

    test('handles zero processed files', async () => {
      const metrics = await systemAnalytics.collectMetrics();

      expect(metrics.avgProcessingTime).toBe(0);
      expect(metrics.errorRate).toBe(0);
    });

    test('includes recent errors in metrics', async () => {
      systemAnalytics.recordFailure(new Error('Error 1'));
      systemAnalytics.recordFailure(new Error('Error 2'));
      systemAnalytics.recordFailure(new Error('Error 3'));

      const metrics = await systemAnalytics.collectMetrics();

      expect(metrics.recentErrors).toHaveLength(3);
      expect(metrics.recentErrors[0].message).toBe('Error 1');
      expect(metrics.recentErrors[2].message).toBe('Error 3');
    });

    test('includes memory metrics when available', async () => {
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn().mockReturnValue({
        heapUsed: 10 * 1024 * 1024, // 10MB
        heapTotal: 20 * 1024 * 1024, // 20MB
        rss: 30 * 1024 * 1024, // 30MB
      });

      const metrics = await systemAnalytics.collectMetrics();

      expect(metrics.memory).toEqual({
        used: 10,
        total: 20,
        rss: 30,
      });

      process.memoryUsage = originalMemoryUsage;
    });

    test('handles memory metrics collection errors', async () => {
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn().mockImplementation(() => {
        throw new Error('Memory info unavailable');
      });

      const metrics = await systemAnalytics.collectMetrics();

      expect(metrics.memory).toBeUndefined();
      const { logger } = require('../src/shared/logger');
      expect(logger.warn).toHaveBeenCalledWith(
        'Could not collect memory metrics:',
        'Memory info unavailable',
      );

      process.memoryUsage = originalMemoryUsage;
    });
  });

  describe('getFailureRate', () => {
    test('calculates failure rate correctly', () => {
      expect(systemAnalytics.getFailureRate()).toBe(0);

      systemAnalytics.recordProcessingTime(1000);
      systemAnalytics.recordProcessingTime(1000);
      systemAnalytics.recordFailure(new Error('Error 1'));
      systemAnalytics.recordFailure(new Error('Error 2'));

      expect(systemAnalytics.getFailureRate()).toBe(100);
    });

    test('returns 0 when no files processed', () => {
      systemAnalytics.recordFailure(new Error('Error'));
      expect(systemAnalytics.getFailureRate()).toBe(0);
    });
  });

  describe('destroy', () => {
    test('clears error history and logs cleanup', () => {
      systemAnalytics.recordFailure(new Error('Test error'));
      expect(systemAnalytics.errors).toHaveLength(1);

      systemAnalytics.destroy();

      expect(systemAnalytics.errors).toEqual([]);
      const { logger } = require('../src/shared/logger');
      expect(logger.info).toHaveBeenCalledWith(
        '[ANALYTICS] System analytics cleaned up',
      );
    });

    test('preserves other analytics data', () => {
      systemAnalytics.recordProcessingTime(1000);
      systemAnalytics.recordSuccess();

      systemAnalytics.destroy();

      expect(systemAnalytics.processedFiles).toBe(1);
      expect(systemAnalytics.successfulOperations).toBe(1);
      expect(systemAnalytics.totalProcessingTime).toBe(1000);
    });
  });
});
