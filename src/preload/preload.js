const { contextBridge, ipcRenderer } = require('electron');
let sanitizeHtml;
try {
  sanitizeHtml = require('sanitize-html');
} catch (e) {
  // Fallback minimal sanitizer if the module isn't available in the preload bundle
  console.warn(
    '[PRELOAD] sanitize-html not available, using minimal fallback sanitizer',
  );
  sanitizeHtml = function (input) {
    if (typeof input !== 'string') return input;
    return input.replace(/<[^>]*>?/gm, '');
  };
}

// Import centralized IPC channel map - simplified for sandbox compatibility
// The main process will provide the IPC channels via a synchronous IPC call
let IPC_CHANNELS = null;

try {
  // Request IPC channels from main process synchronously
  IPC_CHANNELS = ipcRenderer.sendSync('get-ipc-channels');
} catch (error) {
  console.error('Failed to get IPC channels:', error);
  // Fallback to empty object to prevent crashes
  IPC_CHANNELS = {};
}

// Dynamically derive allowed send channels from centralized IPC_CHANNELS to prevent drift
// Be defensive: IPC_CHANNELS may be an empty object in some sandboxed contexts
const ALLOWED_CHANNELS = {
  FILES:
    IPC_CHANNELS && IPC_CHANNELS.FILES ? Object.values(IPC_CHANNELS.FILES) : [],
  SMART_FOLDERS:
    IPC_CHANNELS && IPC_CHANNELS.SMART_FOLDERS
      ? Object.values(IPC_CHANNELS.SMART_FOLDERS)
      : [],
  ANALYSIS:
    IPC_CHANNELS && IPC_CHANNELS.ANALYSIS
      ? Object.values(IPC_CHANNELS.ANALYSIS)
      : [],
  SETTINGS:
    IPC_CHANNELS && IPC_CHANNELS.SETTINGS
      ? Object.values(IPC_CHANNELS.SETTINGS)
      : [],
  OLLAMA:
    IPC_CHANNELS && IPC_CHANNELS.OLLAMA
      ? Object.values(IPC_CHANNELS.OLLAMA)
      : [],
  UNDO_REDO:
    IPC_CHANNELS && IPC_CHANNELS.UNDO_REDO
      ? Object.values(IPC_CHANNELS.UNDO_REDO)
      : [],
  ANALYSIS_HISTORY:
    IPC_CHANNELS && IPC_CHANNELS.ANALYSIS_HISTORY
      ? Object.values(IPC_CHANNELS.ANALYSIS_HISTORY)
      : [],
  EMBEDDINGS:
    IPC_CHANNELS && IPC_CHANNELS.EMBEDDINGS
      ? Object.values(IPC_CHANNELS.EMBEDDINGS)
      : [],
  SYSTEM:
    IPC_CHANNELS && IPC_CHANNELS.SYSTEM
      ? Object.values(IPC_CHANNELS.SYSTEM)
      : [],
  WINDOW:
    IPC_CHANNELS && IPC_CHANNELS.WINDOW
      ? Object.values(IPC_CHANNELS.WINDOW)
      : [],
};

// Fast-path receive channels (Set-based for quick lookups)
const ALLOWED_RECEIVE_CHANNELS_SET = new Set([
  'system-metrics',
  'operation-progress',
  'app:error',
  'app:update',
  'ai-status-update',
]);
// Flatten allowed send channels for validation into a Set for O(1) lookups
const ALL_SEND_CHANNELS_SET = new Set(
  [].concat(...Object.values(ALLOWED_CHANNELS)),
);

// Backwards-compatible aliases: some code paths expect arrays, others Sets
const ALL_SEND_CHANNELS = Array.from(ALL_SEND_CHANNELS_SET);
const ALLOWED_RECEIVE_CHANNELS = Array.from(ALLOWED_RECEIVE_CHANNELS_SET);

/**
 * Enhanced IPC validation with security checks
 */
class SecureIPCManager {
  constructor() {
    this.activeListeners = new Map();
    this.rateLimiter = new Map();
    this.maxRequestsPerSecond = 200; // Increased from 100 to handle large file selections
  }

  /**
   * Rate limiting to prevent IPC abuse
   */
  checkRateLimit(channel) {
    const now = Date.now();
    const channelData = this.rateLimiter.get(channel) || {
      count: 0,
      resetTime: now + 1000,
    };

    if (now > channelData.resetTime) {
      channelData.count = 1;
      channelData.resetTime = now + 1000;
    } else {
      channelData.count++;
    }

    this.rateLimiter.set(channel, channelData);

    if (channelData.count > this.maxRequestsPerSecond) {
      const resetIn = Math.ceil((channelData.resetTime - now) / 1000);
      throw new Error(
        `Rate limit exceeded for channel: ${channel}. Please wait ${resetIn}s before retrying. Consider reducing concurrent requests.`,
      );
    }

    return true;
  }

  /**
   * Secure invoke with validation and error handling
   */
  async safeInvoke(channel, ...args) {
    const startTime = performance.now();

    try {
      // Channel validation
      if (!ALL_SEND_CHANNELS.includes(channel)) {
        console.warn(
          `[PRELOAD] Blocked invoke to unauthorized channel: ${channel}`,
        );
        throw new Error(`Unauthorized IPC channel: ${channel}`);
      }

      // Rate limiting
      this.checkRateLimit(channel);

      // File path validation for file-related operations
      const fileChannels = [
        ...(IPC_CHANNELS.FILES ? Object.values(IPC_CHANNELS.FILES) : []),
        ...(IPC_CHANNELS.ANALYSIS ? Object.values(IPC_CHANNELS.ANALYSIS) : []),
      ];

      if (fileChannels.includes(channel)) {
        for (const arg of args) {
          if (typeof arg === 'string' && !this.validateFilePath(arg)) {
            throw new Error(`Invalid file path detected: ${arg}`);
          }
          // Recursively validate file paths in objects and arrays
          if (typeof arg === 'object' && arg !== null) {
            this.validateObjectPaths(arg);
          }
        }
      }

      // Argument sanitization
      const sanitizedArgs = this.sanitizeArguments(args);

      // Performance monitoring for slow operations
      const invokePromise = ipcRenderer.invoke(channel, ...sanitizedArgs);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error('IPC timeout after 30 seconds')),
          30000,
        );
      });

      const result = await Promise.race([invokePromise, timeoutPromise]);

      // Result validation
      const validatedResult = this.validateResult(result, channel);

      // Performance logging for slow operations (>500ms)
      const duration = performance.now() - startTime;
      if (duration > 500) {
        console.warn(
          `[PERF] Slow IPC operation: ${channel} took ${duration.toFixed(2)}ms`,
        );
      }

      return validatedResult;
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(
        `[PRELOAD] IPC invoke error for ${channel} (${duration.toFixed(2)}ms):`,
        error.message,
      );

      // Enhanced error classification
      if (error.message.includes('timeout')) {
        this.logSecurityEvent('ipc_timeout', { channel, duration });
      } else if (error.message.includes('Unauthorized')) {
        this.logSecurityEvent('unauthorized_channel', { channel });
      }

      throw new Error(`IPC Error: ${error.message}`);
    }
  }

  /**
   * Secure event listener with cleanup tracking
   */
  safeOn(channel, callback) {
    if (!ALLOWED_RECEIVE_CHANNELS.includes(channel)) {
      console.warn(
        `[PRELOAD] Blocked listener on unauthorized channel: ${channel}`,
      );
      return () => {};
    }

    const wrappedCallback = (event, ...args) => {
      try {
        // Validate event source
        if (!this.validateEventSource(event)) {
          console.warn(
            `[PRELOAD] Rejected event from invalid source on channel: ${channel}`,
          );
          return;
        }

        // Sanitize incoming data
        const sanitizedArgs = this.sanitizeArguments(args);

        // Special handling for different event types
        if (channel === 'system-metrics' && sanitizedArgs.length === 1) {
          const data = sanitizedArgs[0];
          if (this.isValidSystemMetrics(data)) {
            callback(data);
          } else {
            console.warn('[PRELOAD] Invalid system-metrics data rejected');
          }
        } else {
          callback(...sanitizedArgs);
        }
      } catch (error) {
        console.error(`[PRELOAD] Error in ${channel} event handler:`, error);
      }
    };

    ipcRenderer.on(channel, wrappedCallback);

    // Track listener for cleanup
    const listenerKey = `${channel}_${Date.now()}`;
    this.activeListeners.set(listenerKey, {
      channel,
      callback: wrappedCallback,
    });

    // Return cleanup function
    return () => {
      ipcRenderer.removeListener(channel, wrappedCallback);
      this.activeListeners.delete(listenerKey);
    };
  }

  /**
   * Validate event source to prevent spoofing
   */
  validateEventSource(event) {
    // Basic validation - in production, implement more sophisticated checks
    return event && event.sender && typeof event.sender === 'object';
  }

  /**
   * Validate file paths to prevent path traversal attacks
   */
  validateFilePath(filePath) {
    if (typeof filePath !== 'string') {
      return false;
    }

    // Check for path traversal attempts
    if (
      filePath.includes('..') ||
      filePath.includes('../') ||
      filePath.includes('..\\')
    ) {
      console.warn(`[PRELOAD] Path traversal attempt detected: ${filePath}`);
      return false;
    }

    // Check for absolute paths that might be problematic
    if (filePath.startsWith('/') || filePath.match(/^[A-Za-z]:/)) {
      // Allow absolute paths but log them for monitoring
      console.log(`[PRELOAD] Absolute path used: ${filePath}`);
    }

    return true;
  }

  /**
   * Recursively validate file paths within objects and arrays
   */
  validateObjectPaths(obj) {
    if (Array.isArray(obj)) {
      return obj.forEach((item) => this.validateObjectPaths(item));
    }

    if (obj && typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string' && !this.validateFilePath(value)) {
          throw new Error(
            `Invalid file path detected in object property "${key}": ${value}`,
          );
        }
        if (typeof value === 'object' && value !== null) {
          this.validateObjectPaths(value);
        }
      }
    }
  }

  /**
   * Sanitize arguments to prevent injection attacks
   */
  sanitizeArguments(args) {
    return args.map((arg) => this.sanitizeObject(arg));
  }

  /**
   * Deep sanitization for objects
   */
  sanitizeObject(obj) {
    if (typeof obj === 'string') {
      return sanitizeHtml(obj, { allowedTags: [], allowedAttributes: {} });
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeObject(item));
    }

    if (obj && typeof obj === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        const cleanKey = sanitizeHtml(key, {
          allowedTags: [],
          allowedAttributes: {},
        });
        sanitized[cleanKey] = this.sanitizeObject(value);
      }
      return sanitized;
    }

    return obj;
  }

  /**
   * Validate system metrics data structure
   */
  isValidSystemMetrics(data) {
    // Accept flexible shapes produced by main: ensure object with some expected keys
    if (!data || typeof data !== 'object') return false;
    const hasUptime =
      typeof data.uptime === 'number' || typeof data.uptime === 'string';
    const hasMemory =
      typeof data.memory === 'object' || typeof data.memory?.used === 'number';
    return hasUptime || hasMemory;
  }

  /**
   * Validate IPC results
   */
  validateResult(result, channel) {
    // Channel-specific validation
    switch (channel) {
      case 'get-system-metrics':
        // Handle both direct metrics and error responses
        if (result && result.error) {
          console.error('System metrics error:', result.error);
          return null;
        }
        return this.isValidSystemMetrics(result) ? result : null;
      case 'select-directory':
        // Main returns { success, folder } now
        return result && typeof result === 'object'
          ? result
          : { success: false, folder: null };
      case 'get-custom-folders':
        return Array.isArray(result) ? result : [];
      default:
        return result;
    }
  }

  /**
   * Log security events for monitoring and analysis
   */
  logSecurityEvent(eventType, details = {}) {
    const securityEvent = {
      timestamp: new Date().toISOString(),
      type: eventType,
      ...details,
    };

    // Store in local security log (limited to prevent memory issues)
    if (!this.securityEvents) {
      this.securityEvents = [];
    }

    this.securityEvents.push(securityEvent);

    // Keep only last 100 events
    if (this.securityEvents.length > 100) {
      this.securityEvents = this.securityEvents.slice(-100);
    }

    console.warn(`[SECURITY] ${eventType}:`, details);
  }

  /**
   * Get security events for debugging
   */
  getSecurityEvents() {
    return this.securityEvents || [];
  }

  /**
   * Enhanced cleanup with security event summary
   */
  cleanup() {
    for (const [_key, { channel, callback }] of this.activeListeners) {
      ipcRenderer.removeListener(channel, callback);
    }
    this.activeListeners.clear();

    // Log security summary on cleanup
    const securityEvents = this.getSecurityEvents();
    if (securityEvents.length > 0) {
      console.log(
        `[PRELOAD] Cleanup: ${securityEvents.length} security events recorded`,
      );
    }

    console.log('[PRELOAD] All IPC listeners cleaned up');
  }
}

/**
 * Enhanced Error Recovery System for IPC
 */
class IPCErrorRecovery {
  constructor(secureIPC) {
    this.secureIPC = secureIPC;
    this.retryQueue = new Map();
    this.circuitBreakers = new Map();
    this.failureCounts = new Map();
    this.maxRetries = 3;
    this.baseDelay = 1000; // 1 second
    this.maxDelay = 30000; // 30 seconds
    this.circuitBreakerThreshold = 5; // Open circuit after 5 failures
    this.circuitBreakerTimeout = 60000; // 1 minute
  }

  /**
   * Execute IPC call with automatic retry and error recovery
   */
  async executeWithRecovery(channel, args = [], options = {}) {
    const {
      maxRetries = this.maxRetries,
      retryCondition = (error) => this.isRetryableError(error),
      fallbackFn = null,
      onRetry = null,
    } = options;

    // Check circuit breaker
    if (this.isCircuitOpen(channel)) {
      if (fallbackFn) {
        console.warn(`[RECOVERY] Circuit open for ${channel}, using fallback`);
        return await fallbackFn(...args);
      }
      throw new Error(`Circuit breaker open for channel: ${channel}`);
    }

    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.secureIPC.safeInvoke(channel, ...args);

        // Success - reset circuit breaker and failure count
        this.resetCircuitBreaker(channel);
        this.failureCounts.delete(channel);

        return result;
      } catch (error) {
        lastError = error;

        // Record failure
        this.recordFailure(channel, error);

        // Check if error is retryable
        if (!retryCondition(error) || attempt === maxRetries) {
          break;
        }

        // Calculate delay with exponential backoff and jitter
        const delay = this.calculateDelay(attempt);
        console.warn(
          `[RECOVERY] Attempt ${attempt + 1} failed for ${channel}, retrying in ${delay}ms:`,
          error.message,
        );

        if (onRetry) {
          onRetry(attempt + 1, error, delay);
        }

        await this.delay(delay);
      }
    }

    // All retries exhausted
    if (fallbackFn) {
      console.warn(
        `[RECOVERY] All retries exhausted for ${channel}, using fallback`,
      );
      try {
        return await fallbackFn(...args);
      } catch (fallbackError) {
        console.error(
          `[RECOVERY] Fallback also failed for ${channel}:`,
          fallbackError,
        );
        throw fallbackError;
      }
    }

    // Open circuit breaker if we've had multiple failures
    this.openCircuitBreaker(channel);
    throw lastError;
  }

  /**
   * Determine if an error is retryable
   */
  isRetryableError(error) {
    const retryablePatterns = [
      'timeout',
      'network',
      'connection',
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
    ];

    const errorMessage = error.message.toLowerCase();
    return retryablePatterns.some((pattern) => errorMessage.includes(pattern));
  }

  /**
   * Calculate delay with exponential backoff and jitter
   */
  calculateDelay(attempt) {
    const exponentialDelay = this.baseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
    return Math.min(exponentialDelay + jitter, this.maxDelay);
  }

  /**
   * Record a failure for circuit breaker logic
   */
  recordFailure(channel, error) {
    const count = (this.failureCounts.get(channel) || 0) + 1;
    this.failureCounts.set(channel, count);

    if (count >= this.circuitBreakerThreshold) {
      this.openCircuitBreaker(channel);
    }
  }

  /**
   * Open circuit breaker for a channel
   */
  openCircuitBreaker(channel) {
    this.circuitBreakers.set(channel, {
      openTime: Date.now(),
      failureCount: this.failureCounts.get(channel) || 0,
    });
    console.error(`[RECOVERY] Circuit breaker opened for ${channel}`);
  }

  /**
   * Reset circuit breaker for a channel
   */
  resetCircuitBreaker(channel) {
    if (this.circuitBreakers.has(channel)) {
      this.circuitBreakers.delete(channel);
      this.failureCounts.delete(channel);
      console.log(`[RECOVERY] Circuit breaker reset for ${channel}`);
    }
  }

  /**
   * Check if circuit breaker is open
   */
  isCircuitOpen(channel) {
    const breaker = this.circuitBreakers.get(channel);
    if (!breaker) return false;

    // Check if circuit breaker should be reset
    if (Date.now() - breaker.openTime > this.circuitBreakerTimeout) {
      this.resetCircuitBreaker(channel);
      return false;
    }

    return true;
  }

  /**
   * Utility delay function
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get recovery statistics
   */
  getRecoveryStats() {
    return {
      activeCircuitBreakers: Array.from(this.circuitBreakers.keys()),
      failureCounts: Object.fromEntries(this.failureCounts),
      retryQueue: this.retryQueue.size,
    };
  }
}

// Initialize secure IPC manager and error recovery
const secureIPC = new SecureIPCManager();
const ipcRecovery = new IPCErrorRecovery(secureIPC);

// Cleanup on window unload
window.addEventListener('beforeunload', () => {
  secureIPC.cleanup();
});

// Expose secure, typed API through context bridge
contextBridge.exposeInMainWorld('electronAPI', {
  // Security monitoring and debugging (development only)
  security: {
    getSecurityEvents: () => secureIPC.getSecurityEvents(),
    getIPCMetrics: () => ({
      activeListeners: secureIPC.activeListeners.size,
      rateLimiterSize: secureIPC.rateLimiter.size,
      totalSecurityEvents: secureIPC.getSecurityEvents().length,
    }),
    auditSecurity: () => {
      const events = secureIPC.getSecurityEvents();
      const recentEvents = events.filter((event) => {
        const eventTime = new Date(event.timestamp);
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        return eventTime > oneHourAgo;
      });

      return {
        totalEvents: events.length,
        recentEvents: recentEvents.length,
        eventTypes: events.reduce((acc, event) => {
          acc[event.type] = (acc[event.type] || 0) + 1;
          return acc;
        }, {}),
        lastEvent: events[events.length - 1] || null,
      };
    },
    getRecoveryStats: () => ipcRecovery.getRecoveryStats(),
    executeWithRecovery: (channel, args, options) =>
      ipcRecovery.executeWithRecovery(channel, args, options),
  },

  // IPC Monitoring (development and debugging)
  monitoring: {
    getMetrics: () => secureIPC.safeInvoke('ipc:get-metrics'),
    getRecentCalls: (limit = 50) =>
      secureIPC.safeInvoke('ipc:get-recent-calls', limit),
    getSlowCalls: () => secureIPC.safeInvoke('ipc:get-slow-calls'),
    detectAnomalies: () => secureIPC.safeInvoke('ipc:detect-anomalies'),
  },

  // IPC Testing (development only)
  testing: {
    simulateFailure: (channel, failureType, responseData) =>
      secureIPC.safeInvoke('ipc:test:simulate-failure', {
        channel,
        failureType,
        responseData,
      }),
    clearFailures: () => secureIPC.safeInvoke('ipc:test:clear-failures'),
    getFailureModes: () => secureIPC.safeInvoke('ipc:test:get-failure-modes'),
    runScenarios: () => secureIPC.safeInvoke('ipc:test:run-scenarios'),
    getReport: () => secureIPC.safeInvoke('ipc:test:get-report'),
  },

  // High-Performance MessagePort Communication
  messagePort: {
    /**
     * Create a MessagePort for high-throughput communication
     * Useful for large data transfers, streaming, or real-time updates
     */
    create: async () => {
      try {
        const result = await secureIPC.safeInvoke('ipc:create-message-port');
        if (result.success && result.port) {
          const port = result.port;

          // Set up the port in the renderer
          port.onmessage = (event) => {
            const { type, requestId, ...data } = event.data;
            // Handle responses based on type
            console.log(`[MESSAGEPORT] Received: ${type}`, data);
          };

          port.start();

          return {
            success: true,
            port,
            sendMessage: (type, data, requestId = Date.now()) => {
              port.postMessage({ type, data, requestId });
            },
            close: () => port.close(),
          };
        }
        return result;
      } catch (error) {
        console.error('[MESSAGEPORT] Failed to create MessagePort:', error);
        return { success: false, error: error.message };
      }
    },

    /**
     * Utility for sending large data efficiently
     */
    sendLargeData: async (data, onProgress) => {
      const portResult = await window.electronAPI.messagePort.create();
      if (!portResult.success) {
        throw new Error('Failed to create MessagePort for large data transfer');
      }

      const { port, sendMessage } = portResult;

      return new Promise((resolve, reject) => {
        const totalSize = JSON.stringify(data).length;
        let sentSize = 0;

        // Set up response handler
        port.onmessage = (event) => {
          const { type, success, error, size } = event.data;
          if (type === 'data-received' && success) {
            sentSize += size;
            if (onProgress) {
              onProgress(sentSize / totalSize);
            }
            if (sentSize >= totalSize) {
              port.close();
              resolve({ success: true, totalSize });
            }
          } else if (type === 'error') {
            port.close();
            reject(new Error(error));
          }
        };

        // Send data in chunks if needed
        if (totalSize > 1024 * 1024) {
          // 1MB threshold
          // For very large data, send in chunks
          const chunkSize = 512 * 1024; // 512KB chunks
          const chunks = [];
          const dataStr = JSON.stringify(data);

          for (let i = 0; i < dataStr.length; i += chunkSize) {
            chunks.push(dataStr.slice(i, i + chunkSize));
          }

          // Send stream start
          sendMessage('stream-start', {
            totalChunks: chunks.length,
            totalSize,
          });

          // Send chunks
          chunks.forEach((chunk, index) => {
            setTimeout(() => {
              sendMessage('stream-chunk', chunk, `chunk_${index}`);
            }, index * 10); // Small delay between chunks
          });
        } else {
          // Send as single transfer
          sendMessage('large-data-transfer', data);
        }
      });
    },
  },
  // File Operations
  files: {
    select: () => secureIPC.safeInvoke(IPC_CHANNELS.FILES.SELECT),
    selectDirectory: () =>
      secureIPC.safeInvoke(IPC_CHANNELS.FILES.SELECT_DIRECTORY),
    getDocumentsPath: () =>
      secureIPC.safeInvoke(IPC_CHANNELS.FILES.GET_DOCUMENTS_PATH),
    createFolder: (fullPath) =>
      secureIPC.safeInvoke(IPC_CHANNELS.FILES.CREATE_FOLDER_DIRECT, fullPath),
    normalizePath: (p) => {
      try {
        if (typeof p !== 'string') return p;
        // Simple path normalization for sandbox compatibility
        // Replace multiple slashes with single slash, remove trailing slash
        return p.replace(/\/+/g, '/').replace(/\/$/, '');
      } catch {
        return p;
      }
    },
    getStats: (filePath) =>
      secureIPC.safeInvoke(IPC_CHANNELS.FILES.GET_FILE_STATS, filePath),
    getDirectoryContents: (dirPath) =>
      secureIPC.safeInvoke(IPC_CHANNELS.FILES.GET_FILES_IN_DIRECTORY, dirPath),
    organize: (operations) =>
      secureIPC.safeInvoke(IPC_CHANNELS.FILES.PERFORM_OPERATION, {
        type: 'batch_organize',
        operations,
      }),
    performOperation: (operations) =>
      secureIPC.safeInvoke(IPC_CHANNELS.FILES.PERFORM_OPERATION, operations),
    delete: (filePath) =>
      secureIPC.safeInvoke(IPC_CHANNELS.FILES.DELETE_FILE, filePath),
    // Add missing file operations that the UI is calling
    open: (filePath) =>
      secureIPC.safeInvoke(IPC_CHANNELS.FILES.OPEN_FILE, filePath),
    reveal: (filePath) =>
      secureIPC.safeInvoke(IPC_CHANNELS.FILES.REVEAL_FILE, filePath),
    copy: (sourcePath, destinationPath) =>
      secureIPC.safeInvoke(
        IPC_CHANNELS.FILES.COPY_FILE,
        sourcePath,
        destinationPath,
      ),
    openFolder: (folderPath) =>
      secureIPC.safeInvoke(IPC_CHANNELS.FILES.OPEN_FOLDER, folderPath),
    // Add file analysis method that routes to appropriate analyzer
    analyze: (filePath) => {
      // Determine file type and route to appropriate analyzer
      const ext = filePath.split('.').pop()?.toLowerCase();
      const imageExts = [
        'jpg',
        'jpeg',
        'png',
        'gif',
        'bmp',
        'webp',
        'svg',
        'tiff',
      ];
      // const audioExts = ['mp3', 'wav', 'flac', 'ogg', 'aac', 'm4a']; // REMOVED - audio analysis disabled

      if (imageExts.includes(ext)) {
        return secureIPC.safeInvoke(
          IPC_CHANNELS.ANALYSIS.ANALYZE_IMAGE,
          filePath,
        );
      } else {
        // Audio analysis removed - all non-image files go to document analysis
        return secureIPC.safeInvoke(
          IPC_CHANNELS.ANALYSIS.ANALYZE_DOCUMENT,
          filePath,
        );
      }
    },
  },

  // Smart Folders
  smartFolders: {
    get: () => secureIPC.safeInvoke(IPC_CHANNELS.SMART_FOLDERS.GET),
    save: (folders) =>
      secureIPC.safeInvoke(IPC_CHANNELS.SMART_FOLDERS.SAVE, folders),
    updateCustom: (folders) =>
      secureIPC.safeInvoke(IPC_CHANNELS.SMART_FOLDERS.UPDATE_CUSTOM, folders),
    getCustom: () =>
      secureIPC.safeInvoke(IPC_CHANNELS.SMART_FOLDERS.GET_CUSTOM),
    scanStructure: (rootPath) =>
      secureIPC.safeInvoke(IPC_CHANNELS.SMART_FOLDERS.SCAN_STRUCTURE, rootPath),
    add: (folder) =>
      secureIPC.safeInvoke(IPC_CHANNELS.SMART_FOLDERS.ADD, folder),
    edit: (folderId, updatedFolder) =>
      secureIPC.safeInvoke(
        IPC_CHANNELS.SMART_FOLDERS.EDIT,
        folderId,
        updatedFolder,
      ),
    delete: (folderId) =>
      secureIPC.safeInvoke(IPC_CHANNELS.SMART_FOLDERS.DELETE, folderId),
    match: (text, folders) =>
      secureIPC.safeInvoke(IPC_CHANNELS.SMART_FOLDERS.MATCH, {
        text,
        smartFolders: folders,
      }),
  },

  // Analysis
  analysis: {
    document: (filePath) =>
      secureIPC.safeInvoke(IPC_CHANNELS.ANALYSIS.ANALYZE_DOCUMENT, filePath),
    image: (filePath) =>
      secureIPC.safeInvoke(IPC_CHANNELS.ANALYSIS.ANALYZE_IMAGE, filePath),
    extractText: (filePath) =>
      secureIPC.safeInvoke(IPC_CHANNELS.ANALYSIS.EXTRACT_IMAGE_TEXT, filePath),
  },

  // Analysis History
  analysisHistory: {
    get: (options) =>
      secureIPC.safeInvoke(IPC_CHANNELS.ANALYSIS_HISTORY.GET, options),
    search: (query, options) =>
      secureIPC.safeInvoke(
        IPC_CHANNELS.ANALYSIS_HISTORY.SEARCH,
        query,
        options,
      ),
    getStatistics: () =>
      secureIPC.safeInvoke(IPC_CHANNELS.ANALYSIS_HISTORY.GET_STATISTICS),
    getFileHistory: (filePath) =>
      secureIPC.safeInvoke(
        IPC_CHANNELS.ANALYSIS_HISTORY.GET_FILE_HISTORY,
        filePath,
      ),
    clear: () => secureIPC.safeInvoke(IPC_CHANNELS.ANALYSIS_HISTORY.CLEAR),
    export: (format) =>
      secureIPC.safeInvoke(IPC_CHANNELS.ANALYSIS_HISTORY.EXPORT, format),
  },

  // Embeddings / Semantic
  embeddings: {
    rebuildFolders: () =>
      secureIPC.safeInvoke(IPC_CHANNELS.EMBEDDINGS.REBUILD_FOLDERS),
    rebuildFiles: () =>
      secureIPC.safeInvoke(IPC_CHANNELS.EMBEDDINGS.REBUILD_FILES),
    clearStore: () => secureIPC.safeInvoke(IPC_CHANNELS.EMBEDDINGS.CLEAR_STORE),
  },

  // Undo/Redo System
  undoRedo: {
    undo: () => secureIPC.safeInvoke(IPC_CHANNELS.UNDO_REDO.UNDO),
    redo: () => secureIPC.safeInvoke(IPC_CHANNELS.UNDO_REDO.REDO),
    getHistory: (limit) =>
      secureIPC.safeInvoke(IPC_CHANNELS.UNDO_REDO.GET_HISTORY, limit),
    clear: () => secureIPC.safeInvoke(IPC_CHANNELS.UNDO_REDO.CLEAR_HISTORY),
    canUndo: () => secureIPC.safeInvoke(IPC_CHANNELS.UNDO_REDO.CAN_UNDO),
    canRedo: () => secureIPC.safeInvoke(IPC_CHANNELS.UNDO_REDO.CAN_REDO),
  },

  // System Monitoring (including log management)
  system: {
    getMetrics: () => secureIPC.safeInvoke(IPC_CHANNELS.SYSTEM.GET_METRICS),
    getApplicationStatistics: () =>
      secureIPC.safeInvoke(IPC_CHANNELS.SYSTEM.GET_APPLICATION_STATISTICS),
    applyUpdate: () =>
      IPC_CHANNELS.SYSTEM.APPLY_UPDATE
        ? secureIPC.safeInvoke(IPC_CHANNELS.SYSTEM.APPLY_UPDATE)
        : undefined,
    // Log management functions for LogViewer component
    getLogFiles: (type) =>
      secureIPC.safeInvoke(IPC_CHANNELS.SYSTEM.GET_LOG_FILES, type),
    getLogStats: () => secureIPC.safeInvoke(IPC_CHANNELS.SYSTEM.GET_LOG_STATS),
    getRecentLogs: (type, lines = 100) =>
      secureIPC.safeInvoke(IPC_CHANNELS.SYSTEM.GET_RECENT_LOGS, type, lines),
    readLogFile: (type, filename) =>
      secureIPC.safeInvoke(IPC_CHANNELS.SYSTEM.READ_LOG_FILE, type, filename),
    getSystemStatus: () =>
      secureIPC.safeInvoke(IPC_CHANNELS.SYSTEM.GET_SYSTEM_STATUS),
    performHealthCheck: () =>
      secureIPC.safeInvoke(IPC_CHANNELS.SYSTEM.PERFORM_HEALTH_CHECK),
  },

  // Window controls (Windows custom title bar)
  window: {
    minimize: () =>
      IPC_CHANNELS.WINDOW?.MINIMIZE
        ? secureIPC.safeInvoke(IPC_CHANNELS.WINDOW.MINIMIZE)
        : undefined,
    maximize: () =>
      IPC_CHANNELS.WINDOW?.MAXIMIZE
        ? secureIPC.safeInvoke(IPC_CHANNELS.WINDOW.MAXIMIZE)
        : undefined,
    unmaximize: () =>
      IPC_CHANNELS.WINDOW?.UNMAXIMIZE
        ? secureIPC.safeInvoke(IPC_CHANNELS.WINDOW.UNMAXIMIZE)
        : undefined,
    toggleMaximize: () =>
      IPC_CHANNELS.WINDOW?.TOGGLE_MAXIMIZE
        ? secureIPC.safeInvoke(IPC_CHANNELS.WINDOW.TOGGLE_MAXIMIZE)
        : undefined,
    isMaximized: () =>
      IPC_CHANNELS.WINDOW?.IS_MAXIMIZED
        ? secureIPC.safeInvoke(IPC_CHANNELS.WINDOW.IS_MAXIMIZED)
        : undefined,
    close: () =>
      IPC_CHANNELS.WINDOW?.CLOSE
        ? secureIPC.safeInvoke(IPC_CHANNELS.WINDOW.CLOSE)
        : undefined,
  },

  // Ollama (only implemented endpoints)
  ollama: {
    getModels: () => secureIPC.safeInvoke(IPC_CHANNELS.OLLAMA.GET_MODELS),
    testConnection: (hostUrl) =>
      secureIPC.safeInvoke(IPC_CHANNELS.OLLAMA.TEST_CONNECTION, hostUrl),
    pullModels: (models) =>
      secureIPC.safeInvoke(IPC_CHANNELS.OLLAMA.PULL_MODELS, models),
    deleteModel: (model) =>
      secureIPC.safeInvoke(IPC_CHANNELS.OLLAMA.DELETE_MODEL, model),
  },

  // Event Listeners (with automatic cleanup)
  events: {
    onOperationProgress: (callback) =>
      secureIPC.safeOn('operation-progress', callback),
    onAppError: (callback) => secureIPC.safeOn('app:error', callback),
    onAppUpdate: (callback) => secureIPC.safeOn('app:update', callback),
    onAiStatusUpdate: (callback) =>
      secureIPC.safeOn('ai-status-update', callback),
  },

  // Reporting / crash helpers - allow renderer to notify main crash reporter
  reportCrash: (crashData) =>
    secureIPC.safeInvoke('ipc:report-crash', crashData),

  // Settings
  settings: {
    get: () => secureIPC.safeInvoke(IPC_CHANNELS.SETTINGS.GET),
    save: (settings) =>
      secureIPC.safeInvoke(IPC_CHANNELS.SETTINGS.SAVE, settings),
  },
});

// Legacy compatibility layer (deprecated but maintained for migration)
contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    invoke: (channel, ...args) => {
      console.warn(
        '[PRELOAD] Using deprecated electron.ipcRenderer.invoke - migrate to window.electronAPI',
      );
      return secureIPC.safeInvoke(channel, ...args);
    },
    on: (channel, callback) => {
      console.warn(
        '[PRELOAD] Using deprecated electron.ipcRenderer.on - migrate to window.electronAPI.events',
      );
      return secureIPC.safeOn(channel, callback);
    },
  },
});

console.log('[PRELOAD] Secure context bridge exposed with structured API');

module.exports = { SecureIPCManager };
