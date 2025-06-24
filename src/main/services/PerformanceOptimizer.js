/**
 * Performance Optimizer for Enhanced LLM System
 * Implements multiple speed optimization strategies for StratoSort
 */

const { EventEmitter } = require('events');

const { logger } = require('../../shared/logger');

class PerformanceOptimizer extends EventEmitter {
  constructor() {
    super();
    
    // Performance tracking
    this.performanceMetrics = {
      analysisCache: new Map(),
      modelCache: new Map(),
      parameterCache: new Map(),
      concurrentOperations: 0,
      averageResponseTime: 0,
      totalRequests: 0,
      cacheHitRate: 0,
      memoryUsage: { peak: 0, current: 0 }
    };
    
    // Configuration
    this.config = {
      // Strategy enablement flags
      caching: { enabled: true },
      modelSelection: { enabled: true },
      timeoutManagement: { enabled: true },
      contentOptimization: { enabled: true },
      memoryOptimization: { enabled: true },
      concurrentProcessing: { enabled: true },
      
      // Caching settings
      maxCacheSize: 1000,
      cacheExpiry: 30 * 60 * 1000, // 30 minutes
      
      // Concurrency settings
      maxConcurrentAnalyses: 5, // Increased from 3
      batchSize: 10,
      
      // Timeout optimizations
      fastTimeout: 30000, // 30 seconds for simple content
      standardTimeout: 60000, // 1 minute for medium content
      complexTimeout: 120000, // 2 minutes for complex content
      
      // Content optimization
      contentTruncation: {
        simple: 2000,
        medium: 6000,
        complex: 12000
      },
      
      // Model selection
      fastModels: ['llama3.2:latest', 'gemma3:4b'],
      standardModels: ['gemma3:4b'],
      complexModels: ['llava:latest', 'gemma3:4b']
    };
    
    // Initialize optimization strategies
    this.initializeOptimizations();
  }

  /**
   * Initialize all optimization strategies
   */
  initializeOptimizations() {
    // Initialize cleanup intervals with proper cleanup
    this.cacheCleanupInterval = setInterval(() => this.cleanupCache(), 5 * 60 * 1000); // Every 5 minutes
    this.memoryMonitorInterval = setInterval(() => this.monitorMemoryUsage(), 30000); // Every 30 seconds
    
    logger.info('Performance optimizer initialized', {
      component: 'performance-optimizer',
      features: ['caching', 'concurrency-control']
    });
  }

  /**
   * Cleanup resources and clear intervals
   */
  destroy() {
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
      this.cacheCleanupInterval = null;
    }
    if (this.memoryMonitorInterval) {
      clearInterval(this.memoryMonitorInterval);
      this.memoryMonitorInterval = null;
    }
    this.performanceMetrics.analysisCache.clear();
    this.performanceMetrics.parameterCache.clear();
    logger.info('Performance optimizer destroyed and cleaned up', {
      component: 'performance-optimizer'
    });
  }

  /**
   * STRATEGY 1: Intelligent Content Analysis Caching
   * Cache analysis results based on content hash to avoid re-processing identical content
   */
  async getCachedAnalysis(contentHash, analysisType, smartFolders = []) {
    const cacheKey = this.generateCacheKey(contentHash, analysisType, smartFolders);
    const cached = this.performanceMetrics.analysisCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.config.cacheExpiry) {
      this.updateCacheHitRate(true);
      this.updatePerformanceMetrics(5); // 5ms for cache retrieval
      
      logger.debug('Cache hit for analysis', {
        component: 'performance-optimizer',
        analysisType,
        cache: 'hit'
      });
      return { ...cached.result, fromCache: true };
    }
    
    this.updateCacheHitRate(false);
    return null;
  }

  setCachedAnalysis(contentHash, analysisType, smartFolders, result) {
    const cacheKey = this.generateCacheKey(contentHash, analysisType, smartFolders);
    
    // Prevent cache overflow
    if (this.performanceMetrics.analysisCache.size >= this.config.maxCacheSize) {
      this.evictOldestCacheEntries(Math.floor(this.config.maxCacheSize * 0.1)); // Remove 10%
    }
    
    this.performanceMetrics.analysisCache.set(cacheKey, {
      result,
      timestamp: Date.now(),
      accessCount: 1
    });
    
    // Track performance metrics when setting cache
    if (result.processingTime && this.performanceMetrics.totalRequests > 0) {
      this.updatePerformanceMetrics(result.processingTime);
    }
    
    logger.debug('Cached analysis result', { 
      component: 'performance-optimizer',
      analysisType,
      cacheKey: this.generateCacheKey(contentHash, analysisType, smartFolders)
    });
  }

  /**
   * STRATEGY 2: Dynamic Model Selection Based on Content Complexity
   * Use faster models for simple content, reserve complex models for difficult analysis
   */
  selectOptimalModel(contentComplexity, analysisType = 'standard') {
    const complexity = this.assessContentComplexity(contentComplexity);
    
    let selectedModel;
    switch (complexity) {
      case 'simple':
        selectedModel = this.config.fastModels[0] || 'gemma3:4b';
        break;
      case 'complex':
        selectedModel = this.config.complexModels[0] || 'gemma3:4b';
        break;
      default:
        selectedModel = this.config.standardModels[0] || 'gemma3:4b';
    }
    
    logger.debug('Selected optimal model for content complexity', { 
      component: 'performance-optimizer',
      selectedModel,
      complexity,
      analysisType
    });
    return selectedModel;
  }

  /**
   * STRATEGY 3: Adaptive Timeout Management
   * Use shorter timeouts for simple content, longer for complex analysis
   */
  getOptimalTimeout(contentComplexity, analysisType = 'standard') {
    const complexity = this.assessContentComplexity(contentComplexity);
    
    let timeout;
    switch (complexity) {
      case 'simple':
        timeout = this.config.fastTimeout;
        break;
      case 'complex':
        timeout = this.config.complexTimeout;
        break;
      default:
        timeout = this.config.standardTimeout;
    }
    
    // Add buffer for multi-step analysis
    if (analysisType === 'enhanced') {
      timeout *= 1.5;
    }
    
    logger.debug('Set optimal timeout for content complexity', { 
      component: 'performance-optimizer',
      timeout,
      complexity,
      analysisType
    });
    return timeout;
  }

  /**
   * STRATEGY 4: Intelligent Content Truncation
   * Truncate content based on complexity while preserving important information
   */
  optimizeContentForAnalysis(content, contentType = 'text') {
    if (!content || typeof content !== 'string') return content;
    
    const complexity = this.assessContentComplexity(content);
    const maxLength = this.config.contentTruncation[complexity];
    
    if (content.length <= maxLength) {
      return content;
    }
    
    // Smart truncation - preserve beginning and end, summarize middle
    const beginningLength = Math.floor(maxLength * 0.6);
    const endLength = Math.floor(maxLength * 0.3);
    const summaryLength = maxLength - beginningLength - endLength;
    
    const beginning = content.substring(0, beginningLength);
    const end = content.substring(content.length - endLength);
    const middle = content.substring(beginningLength, content.length - endLength);
    
    // Create a summary of the middle section
    const summary = this.createContentSummary(middle, summaryLength);
    
    const optimizedContent = `${beginning}\n\n[CONTENT SUMMARY: ${summary}]\n\n${end}`;
    
    logger.debug('Optimized content for analysis', { 
      component: 'performance-optimizer',
      originalLength: content.length,
      optimizedLength: optimizedContent.length,
      contentType,
      complexity
    });
    return optimizedContent;
  }

  /**
   * STRATEGY 5: Concurrent Analysis with Load Balancing
   * Process multiple files concurrently while managing system resources
   */
  async processConcurrentAnalyses(analysisRequests) {
    const maxConcurrent = this.config.maxConcurrentAnalyses;
    const results = [];
    
    logger.info('Starting concurrent analysis processing', { 
      component: 'performance-optimizer',
      totalRequests: analysisRequests.length,
      maxConcurrent
    });
    
    for (let i = 0; i < analysisRequests.length; i += maxConcurrent) {
      const batch = analysisRequests.slice(i, i + maxConcurrent);
      
      const batchPromises = batch.map(async (request, index) => {
        const startTime = Date.now();
        this.performanceMetrics.concurrentOperations++;
        
        try {
          // Add staggered delay to prevent thundering herd
          if (index > 0) {
            await new Promise((resolve) => setTimeout(resolve, index * 200));
          }
          
          const result = await request.analysisFunction(...request.args);
          const duration = Date.now() - startTime;
          
          this.updatePerformanceMetrics(duration);
          
          return {
            ...result,
            processingTime: duration,
            batchIndex: i + index
          };
        } catch (error) {
          logger.error('Batch analysis failed', { 
            component: 'performance-optimizer',
            error: error.message,
            batchIndex: i + index
          });
          return {
            error: error.message,
            batchIndex: i + index,
            processingTime: Date.now() - startTime
          };
        } finally {
          this.performanceMetrics.concurrentOperations--;
        }
      });
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            error: result.reason.message,
            processingTime: 0
          });
        }
      });
      
      // Brief pause between batches to allow system recovery
      if (i + maxConcurrent < analysisRequests.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    
    return results;
  }

  /**
   * STRATEGY 6: Parameter Optimization Caching
   * Cache optimized parameters for similar content to avoid recalculation
   */
  getCachedParameters(contentHash, taskType, complexity) {
    const paramKey = `${contentHash.substring(0, 16)}_${taskType}_${complexity}`;
    return this.performanceMetrics.parameterCache.get(paramKey);
  }

  setCachedParameters(contentHash, taskType, complexity, parameters) {
    const paramKey = `${contentHash.substring(0, 16)}_${taskType}_${complexity}`;
    this.performanceMetrics.parameterCache.set(paramKey, {
      parameters,
      timestamp: Date.now()
    });
  }

  /**
   * STRATEGY 7: Memory-Efficient Processing
   * Monitor and optimize memory usage during analysis
   */
  async processWithMemoryOptimization(processingFunction, ...args) {
    const initialMemory = process.memoryUsage();
    
    try {
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const result = await processingFunction(...args);
      
      const finalMemory = process.memoryUsage();
      const memoryDelta = finalMemory.heapUsed - initialMemory.heapUsed;
      
      if (memoryDelta > 50 * 1024 * 1024) { // 50MB threshold
        logger.warn('High memory usage detected during processing', { 
          component: 'performance-optimizer',
          memoryUsageMB: Math.round(memoryDelta / 1024 / 1024)
        });
        
        // Trigger cleanup if memory usage is high
        this.performMemoryCleanup();
      }
      
      return result;
    } catch (error) {
      // Cleanup on error
      this.performMemoryCleanup();
      throw error;
    }
  }

  /**
   * STRATEGY 8: Adaptive Batch Processing
   * Dynamically adjust batch sizes based on system performance
   */
  calculateOptimalBatchSize(systemLoad, contentComplexity) {
    let baseBatchSize = this.config.batchSize;
    
    // Adjust based on system load
    if (systemLoad > 0.8) {
      baseBatchSize = Math.max(1, Math.floor(baseBatchSize * 0.5));
    } else if (systemLoad < 0.3) {
      baseBatchSize = Math.min(20, Math.floor(baseBatchSize * 1.5));
    }
    
    // Adjust based on content complexity
    const complexity = this.assessContentComplexity(contentComplexity);
    switch (complexity) {
      case 'simple':
        return Math.min(20, baseBatchSize * 2);
      case 'complex':
        return Math.max(1, Math.floor(baseBatchSize * 0.5));
      default:
        return baseBatchSize;
    }
  }

  /**
   * UTILITY METHODS
   */
  
  generateCacheKey(contentHash, analysisType, smartFolders) {
    const folderHash = smartFolders.map((f) => f.name).sort().join('|');
    return `${contentHash}_${analysisType}_${this.hashString(folderHash)}`;
  }

  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  assessContentComplexity(content) {
    if (typeof content === 'string') {
      if (content.length < 1000) return 'simple';
      if (content.length > 8000) return 'complex';
      return 'medium';
    }
    return 'medium';
  }

  createContentSummary(content, maxLength) {
    if (content.length <= maxLength) return content;
    
    // Extract key sentences and keywords
    const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 10);
    const keywords = this.extractKeywords(content);
    
    let summary = keywords.slice(0, 10).join(', ');
    
    // Add important sentences if space allows
    for (const sentence of sentences.slice(0, 3)) {
      const addition = `. ${sentence.trim()}`;
      if (summary.length + addition.length <= maxLength) {
        summary += addition;
      } else {
        break;
      }
    }
    
    return summary;
  }

  extractKeywords(content) {
    // Simple keyword extraction
    const words = content.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((word) => word.length > 3)
      .filter((word) => !['this', 'that', 'with', 'have', 'will', 'been', 'from', 'they', 'them', 'were', 'said', 'each', 'which', 'their', 'time', 'would', 'there', 'could', 'other'].includes(word));
    
    // Count frequency
    const frequency = {};
    words.forEach((word) => {
      frequency[word] = (frequency[word] || 0) + 1;
    });
    
    // Return top keywords
    return Object.entries(frequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 20)
      .map(([word]) => word);
  }

  evictOldestCacheEntries(count) {
    const entries = Array.from(this.performanceMetrics.analysisCache.entries())
      .sort(([,a], [,b]) => a.timestamp - b.timestamp)
      .slice(0, count);
    
    entries.forEach(([key]) => {
      this.performanceMetrics.analysisCache.delete(key);
    });
    
    console.log(`[PERF-CACHE] Evicted ${count} oldest cache entries`);
  }

  cleanupCache() {
    const now = Date.now();
    let cleanedCount = 0;
    
    // Clean analysis cache
    for (const [key, value] of this.performanceMetrics.analysisCache.entries()) {
      if (now - value.timestamp > this.config.cacheExpiry) {
        this.performanceMetrics.analysisCache.delete(key);
        cleanedCount++;
      }
    }
    
    // Clean parameter cache
    for (const [key, value] of this.performanceMetrics.parameterCache.entries()) {
      if (now - value.timestamp > this.config.cacheExpiry) {
        this.performanceMetrics.parameterCache.delete(key);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`[PERF-CACHE] Cleaned up ${cleanedCount} expired cache entries`);
    }
  }

  performMemoryCleanup() {
    // Clear old cache entries more aggressively
    this.evictOldestCacheEntries(Math.floor(this.config.maxCacheSize * 0.2));
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      console.log('[PERF-MEMORY] Forced garbage collection');
    }
  }

  monitorMemoryUsage() {
    const usage = process.memoryUsage();
    this.performanceMetrics.memoryUsage.current = usage.heapUsed;
    
    if (usage.heapUsed > this.performanceMetrics.memoryUsage.peak) {
      this.performanceMetrics.memoryUsage.peak = usage.heapUsed;
    }
    
    // Alert if memory usage is high
    if (usage.heapUsed > 512 * 1024 * 1024) { // 512MB threshold
      console.warn(`[PERF-MEMORY] High memory usage: ${Math.round(usage.heapUsed / 1024 / 1024)}MB`);
      this.performMemoryCleanup();
    }
  }

  updateCacheHitRate(isHit) {
    this.performanceMetrics.totalRequests++;
    if (isHit) {
      this.performanceMetrics.cacheHitRate = 
        (this.performanceMetrics.cacheHitRate * (this.performanceMetrics.totalRequests - 1) + 1) / 
        this.performanceMetrics.totalRequests;
    } else {
      this.performanceMetrics.cacheHitRate = 
        (this.performanceMetrics.cacheHitRate * (this.performanceMetrics.totalRequests - 1)) / 
        this.performanceMetrics.totalRequests;
    }
  }

  updatePerformanceMetrics(duration) {
    this.performanceMetrics.averageResponseTime = 
      (this.performanceMetrics.averageResponseTime * (this.performanceMetrics.totalRequests - 1) + duration) / 
      this.performanceMetrics.totalRequests;
  }

  /**
   * Get comprehensive performance statistics
   */
  getPerformanceStats() {
    return {
      ...this.performanceMetrics,
      cacheSize: this.performanceMetrics.analysisCache.size,
      parameterCacheSize: this.performanceMetrics.parameterCache.size,
      memoryUsageMB: Math.round(this.performanceMetrics.memoryUsage.current / 1024 / 1024),
      peakMemoryUsageMB: Math.round(this.performanceMetrics.memoryUsage.peak / 1024 / 1024),
      cacheHitRatePercent: Math.round(this.performanceMetrics.cacheHitRate * 100),
      averageResponseTimeMs: Math.round(this.performanceMetrics.averageResponseTime)
    };
  }

  /**
   * Check if caching is enabled
   */
  isCachingEnabled() {
    return this.config.caching.enabled;
  }

  /**
   * Check if dynamic model selection is enabled
   */
  isDynamicModelSelectionEnabled() {
    return this.config.modelSelection.enabled;
  }

  /**
   * Check if timeout management is enabled
   */
  isTimeoutManagementEnabled() {
    return this.config.timeoutManagement.enabled;
  }

  /**
   * Check if content optimization is enabled
   */
  isContentOptimizationEnabled() {
    return this.config.contentOptimization.enabled;
  }

  /**
   * Check if memory optimization is enabled
   */
  isMemoryOptimizationEnabled() {
    return this.config.memoryOptimization.enabled;
  }

  /**
   * Check if adaptive timeout is enabled
   */
  isAdaptiveTimeoutEnabled() {
    return this.config.timeoutManagement.enabled;
  }

  /**
   * Check if concurrent processing is enabled
   */
  isConcurrentProcessingEnabled() {
    return this.config.concurrentProcessing.enabled;
  }
}

module.exports = PerformanceOptimizer; 