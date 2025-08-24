const { performance } = require('perf_hooks');
const os = require('os');
const v8 = require('v8');

class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.timers = new Map();
    this.memoryUsage = [];
    this.startTime = performance.now();
  }

  /**
   * Start timing an operation
   * @param {string} operation - Operation name
   * @returns {string} Timer ID
   */
  startTimer(operation) {
    const timerId = `${operation}_${Date.now()}`;
    this.timers.set(timerId, {
      operation,
      startTime: performance.now(),
      startMemory: process.memoryUsage(),
    });
    return timerId;
  }

  /**
   * End timing an operation
   * @param {string} timerId - Timer ID from startTimer
   * @returns {object} Performance metrics
   */
  endTimer(timerId) {
    const timer = this.timers.get(timerId);
    if (!timer) {
      console.warn(`Timer ${timerId} not found`);
      return null;
    }

    const endTime = performance.now();
    const endMemory = process.memoryUsage();

    const metrics = {
      operation: timer.operation,
      duration: endTime - timer.startTime,
      memoryDelta: {
        heapUsed: endMemory.heapUsed - timer.startMemory.heapUsed,
        external: endMemory.external - timer.startMemory.external,
        rss: endMemory.rss - timer.startMemory.rss,
      },
      endMemory,
      timestamp: new Date().toISOString(),
    };

    // Store metrics
    if (!this.metrics.has(timer.operation)) {
      this.metrics.set(timer.operation, []);
    }
    this.metrics.get(timer.operation).push(metrics);

    // Clean up timer
    this.timers.delete(timerId);

    return metrics;
  }

  /**
   * Get current memory usage
   */
  getCurrentMemory() {
    const memUsage = process.memoryUsage();
    const v8Stats = v8.getHeapStatistics();

    return {
      process: {
        rss: memUsage.rss,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external,
        arrayBuffers: memUsage.arrayBuffers,
      },
      v8: {
        totalHeapSize: v8Stats.total_heap_size,
        usedHeapSize: v8Stats.used_heap_size,
        totalPhysicalSize: v8Stats.total_physical_size,
        totalAvailableSize: v8Stats.total_available_size,
        heapSizeLimit: v8Stats.heap_size_limit,
      },
      system: {
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        memoryUsagePercent: (os.totalmem() - os.freemem()) / os.totalmem(),
      },
    };
  }

  /**
   * Record memory usage snapshot
   */
  recordMemorySnapshot() {
    const snapshot = {
      timestamp: Date.now(),
      ...this.getCurrentMemory(),
    };

    this.memoryUsage.push(snapshot);

    // Keep only last 100 snapshots
    if (this.memoryUsage.length > 100) {
      this.memoryUsage = this.memoryUsage.slice(-100);
    }

    return snapshot;
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary() {
    const uptime = performance.now() - this.startTime;
    const currentMemory = this.getCurrentMemory();

    return {
      uptime,
      currentMemory,
      operations: Object.fromEntries(
        Array.from(this.metrics.entries()).map(([operation, metrics]) => {
          const durations = metrics.map((m) => m.duration);
          return [
            operation,
            {
              count: metrics.length,
              averageDuration:
                durations.reduce((a, b) => a + b, 0) / durations.length,
              minDuration: Math.min(...durations),
              maxDuration: Math.max(...durations),
              recentMetrics: metrics.slice(-5), // Last 5 operations
            },
          ];
        }),
      ),
      memorySnapshots: this.memoryUsage.slice(-10), // Last 10 snapshots
    };
  }

  /**
   * Monitor async operation with automatic timing
   * @param {string} operation - Operation name
   * @param {Function} fn - Async function to monitor
   */
  async monitorAsync(operation, fn) {
    const timerId = this.startTimer(operation);
    try {
      const result = await fn();
      const metrics = this.endTimer(timerId);
      // Only log performance in development or when explicitly enabled
      if (
        process.env.NODE_ENV === 'development' ||
        process.env.PERFORMANCE_LOGGING === 'true'
      ) {
        console.log(`[PERF] ${operation}: ${metrics.duration.toFixed(2)}ms`);
      }
      return result;
    } catch (error) {
      this.endTimer(timerId);
      throw error;
    }
  }

  /**
   * Monitor sync operation with automatic timing
   * @param {string} operation - Operation name
   * @param {Function} fn - Sync function to monitor
   */
  monitorSync(operation, fn) {
    const timerId = this.startTimer(operation);
    try {
      const result = fn();
      const metrics = this.endTimer(timerId);
      // Only log performance in development or when explicitly enabled
      if (
        process.env.NODE_ENV === 'development' ||
        process.env.PERFORMANCE_LOGGING === 'true'
      ) {
        console.log(`[PERF] ${operation}: ${metrics.duration.toFixed(2)}ms`);
      }
      return result;
    } catch (error) {
      this.endTimer(timerId);
      throw error;
    }
  }

  /**
   * Check if system is under memory pressure
   */
  isUnderMemoryPressure() {
    const memUsage = process.memoryUsage();
    const heapUsagePercent = memUsage.heapUsed / memUsage.heapTotal;

    // Consider under pressure if heap usage > 80%
    return heapUsagePercent > 0.8;
  }

  /**
   * Suggest garbage collection if needed
   */
  suggestGarbageCollection() {
    if (this.isUnderMemoryPressure() && global.gc) {
      // Only log GC operations in development or when explicitly enabled
      if (
        process.env.NODE_ENV === 'development' ||
        process.env.PERFORMANCE_LOGGING === 'true'
      ) {
        console.log('[PERF] Memory pressure detected, running GC');
      }
      global.gc();
      return true;
    }
    return false;
  }
}

// Export singleton instance
const performanceMonitor = new PerformanceMonitor();

// Set up periodic monitoring
setInterval(() => {
  performanceMonitor.recordMemorySnapshot();
  performanceMonitor.suggestGarbageCollection();
}, 30000); // Every 30 seconds

module.exports = { PerformanceMonitor, performanceMonitor };
