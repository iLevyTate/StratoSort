const { logger } = require('../../shared/logger');

const systemAnalytics = {
  startTime: Date.now(),
  processedFiles: 0,
  successfulOperations: 0,
  failedOperations: 0,
  totalProcessingTime: 0,
  errors: [],
  ollamaHealth: { status: 'unknown', lastCheck: null },

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

  async collectMetrics() {
    const uptime = Date.now() - this.startTime;
    const avgProcessingTime =
      this.processedFiles > 0
        ? this.totalProcessingTime / this.processedFiles
        : 0;

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
