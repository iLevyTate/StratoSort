const { logger } = require('../../shared/logger');

const systemAnalytics = {
  startTime: process.uptime(),
  processedFiles: 0,
  successfulOperations: 0,
  failedOperations: 0,
  totalProcessingTime: 0,
  errors: [],
  ollamaHealth: { status: 'unknown', lastCheck: null },

  // Enhanced tracking for dev tools
  actionMetrics: {
    ipcCalls: new Map(),
    ollamaCalls: new Map(),
    performanceData: [],
    recentActions: [],
  },

  recordProcessingTime(duration) {
    this.totalProcessingTime += duration;
    this.processedFiles++;
  },

  recordSuccess() {
    this.successfulOperations++;
  },

  recordFailure(error) {
    this.failedOperations++;
    this.errors.push({
      timestamp: Date.now(),
      message: error.message || error.toString(),
      stack: error.stack,
    });
    if (this.errors.length > 100) {
      this.errors = this.errors.slice(-100);
    }
  },

  // Track IPC call metrics
  recordIpcCall(handlerName, duration, success = true, metadata = {}) {
    const key = handlerName;
    const existing = this.actionMetrics.ipcCalls.get(key) || {
      count: 0,
      totalDuration: 0,
      successCount: 0,
      errorCount: 0,
      avgDuration: 0,
    };

    existing.count++;
    existing.totalDuration += duration;
    existing.avgDuration = existing.totalDuration / existing.count;

    if (success) {
      existing.successCount++;
    } else {
      existing.errorCount++;
    }

    this.actionMetrics.ipcCalls.set(key, existing);

    // Add to recent actions
    this.actionMetrics.recentActions.unshift({
      type: 'ipc_call',
      name: handlerName,
      duration,
      success,
      timestamp: Date.now(),
      metadata,
    });

    // Keep only last 100 recent actions
    if (this.actionMetrics.recentActions.length > 100) {
      this.actionMetrics.recentActions = this.actionMetrics.recentActions.slice(
        0,
        100,
      );
    }

    // Add to performance data for trending
    this.actionMetrics.performanceData.push({
      timestamp: Date.now(),
      type: 'ipc_call',
      name: handlerName,
      duration,
      success,
    });

    // Keep only last 1000 performance data points
    if (this.actionMetrics.performanceData.length > 1000) {
      this.actionMetrics.performanceData =
        this.actionMetrics.performanceData.slice(-1000);
    }
  },

  // Track Ollama call metrics
  recordOllamaCall(operation, model, duration, success = true, metadata = {}) {
    const key = `${operation}_${model}`;
    const existing = this.actionMetrics.ollamaCalls.get(key) || {
      operation,
      model,
      count: 0,
      totalDuration: 0,
      successCount: 0,
      errorCount: 0,
      avgDuration: 0,
      queueWaitTimes: [],
      apiDurations: [],
    };

    existing.count++;
    existing.totalDuration += duration;
    existing.avgDuration = existing.totalDuration / existing.count;

    if (success) {
      existing.successCount++;
    } else {
      existing.errorCount++;
    }

    // Track queue wait times and API durations if available
    if (metadata.queueWaitTime) {
      existing.queueWaitTimes.push(metadata.queueWaitTime);
      if (existing.queueWaitTimes.length > 100) {
        existing.queueWaitTimes = existing.queueWaitTimes.slice(-100);
      }
    }

    if (metadata.apiDuration) {
      existing.apiDurations.push(metadata.apiDuration);
      if (existing.apiDurations.length > 100) {
        existing.apiDurations = existing.apiDurations.slice(-100);
      }
    }

    this.actionMetrics.ollamaCalls.set(key, existing);

    // Add to recent actions
    this.actionMetrics.recentActions.unshift({
      type: 'ollama_call',
      operation,
      model,
      duration,
      success,
      timestamp: Date.now(),
      metadata,
    });

    // Keep only last 100 recent actions
    if (this.actionMetrics.recentActions.length > 100) {
      this.actionMetrics.recentActions = this.actionMetrics.recentActions.slice(
        0,
        100,
      );
    }

    // Add to performance data for trending
    this.actionMetrics.performanceData.push({
      timestamp: Date.now(),
      type: 'ollama_call',
      operation,
      model,
      duration,
      success,
    });

    // Keep only last 1000 performance data points
    if (this.actionMetrics.performanceData.length > 1000) {
      this.actionMetrics.performanceData =
        this.actionMetrics.performanceData.slice(-1000);
    }
  },

  async collectMetrics() {
    const uptime = process.uptime();
    const avgProcessingTime =
      this.processedFiles > 0
        ? this.totalProcessingTime / this.processedFiles
        : 0;

    // Calculate action metrics summaries
    const ipcMetrics = {};
    const ollamaMetrics = {};

    // IPC metrics summary
    for (const [name, data] of this.actionMetrics.ipcCalls.entries()) {
      ipcMetrics[name] = {
        count: data.count,
        avgDuration: Math.round(data.avgDuration),
        successRate:
          data.count > 0 ? (data.successCount / data.count) * 100 : 0,
        errorRate: data.count > 0 ? (data.errorCount / data.count) * 100 : 0,
      };
    }

    // Ollama metrics summary
    for (const [key, data] of this.actionMetrics.ollamaCalls.entries()) {
      const avgQueueWait =
        Array.isArray(data.queueWaitTimes) && data.queueWaitTimes.length > 0
          ? data.queueWaitTimes.reduce((a, b) => a + b, 0) /
            data.queueWaitTimes.length
          : 0;
      const avgApiDuration =
        Array.isArray(data.apiDurations) && data.apiDurations.length > 0
          ? data.apiDurations.reduce((a, b) => a + b, 0) /
            data.apiDurations.length
          : 0;

      ollamaMetrics[key] = {
        operation: data.operation,
        model: data.model,
        count: data.count,
        avgDuration: Math.round(data.avgDuration),
        avgQueueWait: Math.round(avgQueueWait),
        avgApiDuration: Math.round(avgApiDuration),
        successRate:
          data.count > 0 ? (data.successCount / data.count) * 100 : 0,
        errorRate: data.count > 0 ? (data.errorCount / data.count) * 100 : 0,
      };
    }

    const metrics = {
      uptime,
      processedFiles: this.processedFiles,
      successfulOperations: this.successfulOperations,
      failedOperations: this.failedOperations,
      avgProcessingTime: Math.round(avgProcessingTime),
      errorRate:
        this.processedFiles > 0
          ? (this.failedOperations / this.processedFiles) * 100
          : 0,
      recentErrors: this.errors.slice(-10),
      ollamaHealth: this.ollamaHealth,
      platform: process.platform,
      arch: process.arch,

      // Enhanced metrics for dev tools
      actionMetrics: {
        ipcCalls: ipcMetrics,
        ollamaCalls: ollamaMetrics,
        recentActions: this.actionMetrics.recentActions.slice(0, 20), // Last 20 actions
        performanceData: this.actionMetrics.performanceData.slice(-100), // Last 100 data points
        totalIpcCalls: Array.from(this.actionMetrics.ipcCalls.values()).reduce(
          (sum, data) => sum + (data?.count || 0),
          0,
        ),
        totalOllamaCalls: Array.from(
          this.actionMetrics.ollamaCalls.values(),
        ).reduce((sum, data) => sum + (data?.count || 0), 0),
      },
    };

    try {
      const memUsage = process.memoryUsage();
      metrics.memory = {
        used: Math.round(memUsage.heapUsed / 1024 / 1024),
        total: Math.round(memUsage.heapTotal / 1024 / 1024),
        rss: Math.round(memUsage.rss / 1024 / 1024),
      };
    } catch (error) {
      logger.warn('Could not collect memory metrics:', error.message);
    }

    // GPU usage (NVIDIA) - cached and lazy-loaded for performance
    try {
      // Cache GPU info to avoid repeated nvidia-smi calls
      if (
        !this._gpuCache ||
        Date.now() - (this._gpuCache.timestamp || 0) > 60000
      ) {
        // Cache for 1 minute
        const { spawnSync } = require('child_process');
        const cmd =
          process.platform === 'win32' ? 'nvidia-smi.exe' : 'nvidia-smi';
        const out = spawnSync(
          cmd,
          [
            '--query-gpu=utilization.gpu,utilization.memory,memory.total,memory.used',
            '--format=csv,noheader,nounits',
          ],
          { timeout: 2000 },
        );
        if (out && out.status === 0 && out.stdout) {
          const gpuLines = out.stdout
            .toString()
            .trim()
            .split(/\r?\n/)
            .filter(Boolean);
          this._gpuCache = {
            timestamp: Date.now(),
            data: gpuLines.map((line) => {
              const parts = line.split(',').map((p) => p && p.trim());
              return {
                utilizationGpuPct: Number(parts[0]) || 0,
                utilizationMemoryPct: Number(parts[1]) || 0,
                memoryTotalMB: Number(parts[2]) || null,
                memoryUsedMB: Number(parts[3]) || null,
              };
            }),
          };
        } else {
          this._gpuCache = { timestamp: Date.now(), data: [] };
        }
      }
      metrics.gpus = this._gpuCache.data;
    } catch (gpuErr) {
      // Non-fatal - nvidia-smi may not exist on all systems
      if (!this._gpuCache) {
        this._gpuCache = { timestamp: Date.now(), data: [] };
      }
      metrics.gpus = this._gpuCache.data;
      logger.debug('[METRICS] GPU metrics not available:', gpuErr.message);
    }

    return metrics;
  },

  getFailureRate() {
    return this.processedFiles > 0
      ? (this.failedOperations / this.processedFiles) * 100
      : 0;
  },

  destroy() {
    this.errors = [];
    logger.info('[ANALYTICS] System analytics cleaned up');
  },
};

module.exports = systemAnalytics;
