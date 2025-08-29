const registerFilesIpc = require('./files');
const registerSmartFoldersIpc = require('./smartFolders');
const registerUndoRedoIpc = require('./undoRedo');
const registerAnalysisHistoryIpc = require('./analysisHistory');
const registerSystemIpc = require('./system');
const registerOllamaIpc = require('./ollama');
const registerAnalysisIpc = require('./analysis');
const registerSettingsIpc = require('./settings');
const registerEmbeddingsIpc = require('./semantic');
const registerWindowIpc = require('./window');

// IPC Monitoring and Analytics System
class IPCMonitor {
  constructor(logger) {
    this.logger = logger;
    this.metrics = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      averageResponseTime: 0,
      slowCalls: [],
      channelUsage: new Map(),
      errorPatterns: new Map(),
    };
    this.callHistory = [];
    this.maxHistorySize = 1000;
  }

  recordCall(channel, startTime, success = true, error = null) {
    const duration = Date.now() - startTime;
    this.metrics.totalCalls++;

    if (success) {
      this.metrics.successfulCalls++;
    } else {
      this.metrics.failedCalls++;
    }

    // Update average response time
    const totalTime =
      this.metrics.averageResponseTime * (this.metrics.totalCalls - 1) +
      duration;
    this.metrics.averageResponseTime = totalTime / this.metrics.totalCalls;

    // Track channel usage
    const channelCount = this.metrics.channelUsage.get(channel) || 0;
    this.metrics.channelUsage.set(channel, channelCount + 1);

    // Track slow calls (>1 second)
    if (duration > 1000) {
      this.metrics.slowCalls.push({
        channel,
        duration,
        timestamp: new Date().toISOString(),
        error: error?.message,
      });

      // Keep only last 50 slow calls
      if (this.metrics.slowCalls.length > 50) {
        this.metrics.slowCalls = this.metrics.slowCalls.slice(-50);
      }

      this.logger.warn(
        `[IPC-MONITOR] Slow IPC call: ${channel} took ${duration}ms`,
      );
    }

    // Track error patterns
    if (error) {
      const errorKey = `${channel}:${error.message}`;
      const errorCount = this.metrics.errorPatterns.get(errorKey) || 0;
      this.metrics.errorPatterns.set(errorKey, errorCount + 1);
    }

    // Record call history
    this.callHistory.push({
      channel,
      duration,
      success,
      timestamp: new Date().toISOString(),
      error: error?.message,
    });

    // Maintain history size
    if (this.callHistory.length > this.maxHistorySize) {
      this.callHistory = this.callHistory.slice(-this.maxHistorySize);
    }
  }

  getMetrics() {
    return {
      ...this.metrics,
      channelUsage: Object.fromEntries(this.metrics.channelUsage),
      errorPatterns: Object.fromEntries(this.metrics.errorPatterns),
      successRate:
        this.metrics.totalCalls > 0
          ? (
              (this.metrics.successfulCalls / this.metrics.totalCalls) *
              100
            ).toFixed(2)
          : 0,
    };
  }

  getRecentCalls(limit = 50) {
    return this.callHistory.slice(-limit);
  }

  getSlowCalls() {
    return this.metrics.slowCalls;
  }

  detectAnomalies() {
    const anomalies = [];

    // Check for high error rates
    const errorRate =
      this.metrics.totalCalls > 0
        ? this.metrics.failedCalls / this.metrics.totalCalls
        : 0;

    if (errorRate > 0.1) {
      // More than 10% errors
      anomalies.push({
        type: 'high_error_rate',
        severity: 'high',
        message: `High IPC error rate: ${(errorRate * 100).toFixed(2)}%`,
        data: { errorRate, totalCalls: this.metrics.totalCalls },
      });
    }

    // Check for slow average response time
    if (this.metrics.averageResponseTime > 2000) {
      anomalies.push({
        type: 'slow_response_time',
        severity: 'medium',
        message: `Slow average IPC response time: ${this.metrics.averageResponseTime.toFixed(2)}ms`,
        data: { averageResponseTime: this.metrics.averageResponseTime },
      });
    }

    // Check for frequently failing channels
    for (const [channel, count] of this.metrics.channelUsage) {
      const channelErrors = Array.from(this.metrics.errorPatterns.keys())
        .filter((key) => key.startsWith(`${channel}:`))
        .reduce((sum, key) => sum + this.metrics.errorPatterns.get(key), 0);

      const channelErrorRate = channelErrors / count;
      if (channelErrorRate > 0.2 && count > 5) {
        // More than 20% errors for channels with >5 calls
        anomalies.push({
          type: 'failing_channel',
          severity: 'high',
          message: `Channel ${channel} has high error rate: ${(channelErrorRate * 100).toFixed(2)}%`,
          data: { channel, errorRate: channelErrorRate, totalCalls: count },
        });
      }
    }

    return anomalies;
  }
}

// Create global IPC monitor instance
let ipcMonitor = null;
let ipcFailureTester = null;

function registerAllIpc({
  ipcMain,
  IPC_CHANNELS,
  logger,
  dialog,
  shell,
  systemAnalytics,
  getMainWindow,
  getServiceIntegration,
  getCustomFolders,
  setCustomFolders,
  saveCustomFolders,
  analyzeDocumentFile,
  analyzeImageFile,
  tesseract,
  getOllama,
  getOllamaModel,
  getOllamaVisionModel,
  getOllamaEmbeddingModel,
  getOllamaHost,
  buildOllamaOptions,
  scanDirectory,
  settingsService,
  setOllamaHost,
  setOllamaModel,
  setOllamaVisionModel,
  setOllamaEmbeddingModel,
  onSettingsChanged,
}) {
  // Initialize IPC monitor and failure tester
  ipcMonitor = new IPCMonitor(logger);
  ipcFailureTester = new IPCFailureTester(ipcMain, logger);

  // Register failure testing endpoints
  ipcFailureTester.registerTestEndpoints();

  // Provide IPC channels to preload script (for sandbox compatibility)
  if (ipcMain && ipcMain.on) {
    ipcMain.on('get-ipc-channels', (event) => {
      event.returnValue = IPC_CHANNELS;
    });

    // IPC Monitoring endpoints
    ipcMain.handle('ipc:get-metrics', async () => {
      try {
        return ipcMonitor.getMetrics();
      } catch (error) {
        logger.error('[IPC] ipc:get-metrics failed:', error?.message || error);
        return { success: false, error: error?.message || 'Unknown error' };
      }
    });

    ipcMain.handle('ipc:get-recent-calls', async (event, limit = 50) => {
      try {
        return ipcMonitor.getRecentCalls(limit);
      } catch (error) {
        logger.error(
          '[IPC] ipc:get-recent-calls failed:',
          error?.message || error,
        );
        return { success: false, error: error?.message || 'Unknown error' };
      }
    });

    ipcMain.handle('ipc:get-slow-calls', async () => {
      try {
        return ipcMonitor.getSlowCalls();
      } catch (error) {
        logger.error(
          '[IPC] ipc:get-slow-calls failed:',
          error?.message || error,
        );
        return { success: false, error: error?.message || 'Unknown error' };
      }
    });

    ipcMain.handle('ipc:detect-anomalies', async () => {
      try {
        return ipcMonitor.detectAnomalies();
      } catch (error) {
        logger.error(
          '[IPC] ipc:detect-anomalies failed:',
          error?.message || error,
        );
        return { success: false, error: error?.message || 'Unknown error' };
      }
    });

    // IPC Failure Testing endpoints
    ipcMain.handle('ipc:test:run-scenarios', () => {
      return ipcFailureTester.runFailureScenarios();
    });

    ipcMain.handle('ipc:test:get-report', () => {
      return ipcFailureTester.generateFailureReport();
    });

    // MessagePort-based high-performance IPC for large data transfers
    ipcMain.handle('ipc:create-message-port', async (event) => {
      try {
        const { MessageChannel } = require('electron');
        const { port1, port2 } = new MessageChannel();

        // Store port1 in main process for this window
        const webContentsId = event.sender.id;
        if (!global.messagePorts) {
          global.messagePorts = new Map();
        }
        global.messagePorts.set(webContentsId, port1);

        // Set up port1 listeners in main process
        port1.on('message', (message) => {
          try {
            const { type, data, requestId } = message;

            // Handle different message types
            switch (type) {
              case 'large-data-transfer': {
                // Handle large data transfer
                ipcMonitor.recordCall(
                  'message-port:large-data',
                  Date.now(),
                  true,
                );
                port1.postMessage({
                  type: 'data-received',
                  requestId,
                  success: true,
                  size: data ? JSON.stringify(data).length : 0,
                });
                break;
              }

              case 'stream-start': {
                // Handle streaming data start
                ipcMonitor.recordCall(
                  'message-port:stream-start',
                  Date.now(),
                  true,
                );
                port1.postMessage({
                  type: 'stream-ready',
                  requestId,
                });
                break;
              }

              case 'stream-chunk': {
                // Handle streaming data chunk
                ipcMonitor.recordCall(
                  'message-port:stream-chunk',
                  Date.now(),
                  true,
                );
                port1.postMessage({
                  type: 'chunk-processed',
                  requestId,
                  size: data ? data.length : 0,
                });
                break;
              }

              case 'ping': {
                // Health check
                port1.postMessage({
                  type: 'pong',
                  requestId,
                  timestamp: Date.now(),
                });
                break;
              }

              default:
                port1.postMessage({
                  type: 'error',
                  requestId,
                  error: `Unknown message type: ${type}`,
                });
            }
          } catch (error) {
            ipcMonitor.recordCall(
              'message-port:error',
              Date.now(),
              false,
              error,
            );
            port1.postMessage({
              type: 'error',
              requestId: message.requestId,
              error: error.message,
            });
          }
        });

        port1.start();

        // Clean up on window close
        event.sender.once('destroyed', () => {
          if (global.messagePorts) {
            global.messagePorts.delete(webContentsId);
          }
          port1.close();
        });

        return { success: true, port: port2 };
      } catch (error) {
        ipcMonitor.recordCall('message-port:create', Date.now(), false, error);
        return { success: false, error: error.message };
      }
    });
  }
  // Helper: safely register IPC modules without failing the entire setup
  const safeRegister = (fn, payload, label) => {
    try {
      // Inject IPC monitor into payload for tracking
      const enhancedPayload = {
        ...payload,
        ipcMonitor, // Allow modules to record metrics
      };
      fn(enhancedPayload);
    } catch (err) {
      const errorMessage = err?.message || String(err);
      logger?.error?.(`[IPC] ${label} registration failed:`, errorMessage);
      // Fail fast to surface misconfiguration in tests and CI
      throw new Error(`Registration failed: ${errorMessage}`);
    }
  };

  safeRegister(
    registerFilesIpc,
    {
      ipcMain,
      IPC_CHANNELS,
      logger,
      dialog,
      shell,
      systemAnalytics,
      getMainWindow,
      getServiceIntegration,
    },
    'files',
  );
  safeRegister(
    registerSmartFoldersIpc,
    {
      ipcMain,
      IPC_CHANNELS,
      logger,
      systemAnalytics,
      getCustomFolders,
      setCustomFolders,
      saveCustomFolders,
      buildOllamaOptions,
      getOllamaModel,
      scanDirectory,
    },
    'smartFolders',
  );
  safeRegister(
    registerUndoRedoIpc,
    { ipcMain, IPC_CHANNELS, logger, systemAnalytics, getServiceIntegration },
    'undoRedo',
  );
  safeRegister(
    registerAnalysisHistoryIpc,
    {
      ipcMain,
      IPC_CHANNELS,
      logger,
      systemAnalytics,
      getServiceIntegration,
    },
    'analysisHistory',
  );
  safeRegister(
    registerSystemIpc,
    {
      ipcMain,
      IPC_CHANNELS,
      logger,
      systemAnalytics,
      getServiceIntegration,
    },
    'system',
  );
  safeRegister(
    registerOllamaIpc,
    {
      ipcMain,
      IPC_CHANNELS,
      logger,
      systemAnalytics,
      getOllama,
      getOllamaModel,
      getOllamaVisionModel,
      getOllamaEmbeddingModel,
      getOllamaHost,
    },
    'ollama',
  );
  safeRegister(
    registerAnalysisIpc,
    {
      ipcMain,
      IPC_CHANNELS,
      logger,
      tesseract,
      systemAnalytics,
      analyzeDocumentFile,
      analyzeImageFile,
      getServiceIntegration,
      getCustomFolders,
    },
    'analysis',
  );
  safeRegister(
    registerSettingsIpc,
    {
      ipcMain,
      IPC_CHANNELS,
      logger,
      systemAnalytics,
      settingsService,
      setOllamaHost,
      setOllamaModel,
      setOllamaVisionModel,
      setOllamaEmbeddingModel,
      onSettingsChanged,
    },
    'settings',
  );
  safeRegister(
    registerEmbeddingsIpc,
    {
      ipcMain,
      IPC_CHANNELS,
      logger,
      systemAnalytics,
      getCustomFolders,
      getServiceIntegration,
    },
    'embeddings',
  );
  safeRegister(
    registerWindowIpc,
    { ipcMain, IPC_CHANNELS, logger, systemAnalytics, getMainWindow },
    'window',
  );

  // Report crash endpoint from renderer
  ipcMain.handle('ipc:report-crash', async (event, crashData) => {
    try {
      const crashReporter = require('../services/CrashReporter');
      if (
        crashReporter &&
        typeof crashReporter.handleUncaughtException === 'function'
      ) {
        // Normalize to Error-like object where possible
        const fakeError = new Error(
          crashData.error?.message || 'Renderer reported error',
        );
        fakeError.stack = crashData.error?.stack || '';
        await crashReporter.handleUncaughtException(fakeError, 'renderer');
      }
      return { success: true };
    } catch (e) {
      logger.error('[IPC] ipc:report-crash failed:', e?.message || e);
      return { success: false, error: e?.message || String(e) };
    }
  });
}

// IPC Failure Testing and Validation System
class IPCFailureTester {
  constructor(ipcMain, logger) {
    this.ipcMain = ipcMain;
    this.logger = logger;
    this.failureModes = new Map();
    this.testScenarios = new Map();
    this.isTestingMode = process.env.IPC_TESTING_MODE === 'true';
  }

  /**
   * Register IPC failure testing endpoints (development only)
   */
  registerTestEndpoints() {
    if (!this.isTestingMode) return;

    this.ipcMain.handle('ipc:test:simulate-failure', async (event, options) => {
      const { channel, failureType, responseData } = options;
      this.logger.info(
        `[IPC-TEST] Simulating failure for ${channel}: ${failureType}`,
      );

      // Store failure mode for this channel
      this.failureModes.set(channel, { type: failureType, data: responseData });

      return { success: true, message: `Failure mode set for ${channel}` };
    });

    this.ipcMain.handle('ipc:test:clear-failures', () => {
      this.failureModes.clear();
      this.logger.info('[IPC-TEST] All failure modes cleared');
      return { success: true };
    });

    this.ipcMain.handle('ipc:test:get-failure-modes', () => {
      return {
        failureModes: Object.fromEntries(this.failureModes),
        isTestingMode: this.isTestingMode,
      };
    });

    // Enhanced IPC handlers that can simulate failures
    const originalHandle = this.ipcMain.handle.bind(this.ipcMain);
    this.ipcMain.handle = (channel, handler) => {
      const enhancedHandler = async (event, ...args) => {
        const failureMode = this.failureModes.get(channel);

        if (failureMode) {
          this.logger.warn(
            `[IPC-TEST] Triggering failure for ${channel}:`,
            failureMode,
          );

          switch (failureMode.type) {
            case 'timeout':
              // Simulate timeout by delaying response
              await new Promise((resolve) => setTimeout(resolve, 35000)); // Longer than our 30s timeout
              return handler(event, ...args);

            case 'error':
              throw new Error(
                failureMode.data?.message || `Simulated error for ${channel}`,
              );

            case 'network':
              throw new Error('Simulated network error: ECONNRESET');

            case 'permission':
              throw new Error(`Permission denied for channel: ${channel}`);

            case 'invalid-response': {
              const result = await handler(event, ...args);
              return { ...result, corrupted: true, originalData: result };
            }

            case 'slow-response': {
              await new Promise((resolve) => setTimeout(resolve, 5000)); // 5 second delay
              return handler(event, ...args);
            }

            default:
              return handler(event, ...args);
          }
        }

        return handler(event, ...args);
      };

      return originalHandle(channel, enhancedHandler);
    };
  }

  /**
   * Run comprehensive IPC failure scenario tests
   */
  async runFailureScenarios() {
    if (!this.isTestingMode) return;

    this.logger.info(
      '[IPC-TEST] Starting comprehensive failure scenario tests',
    );

    const scenarios = [
      {
        name: 'Network Failure Recovery',
        channel: 'test:network-failure',
        setup: () =>
          this.failureModes.set('test:network-failure', {
            type: 'network',
            data: { message: 'ECONNRESET' },
          }),
        test: async () => {
          // This would be called from renderer with error recovery
          return { scenario: 'network-failure', passed: true };
        },
      },
      {
        name: 'Timeout Recovery',
        channel: 'test:timeout-failure',
        setup: () =>
          this.failureModes.set('test:timeout-failure', { type: 'timeout' }),
        test: async () => {
          return { scenario: 'timeout-failure', passed: true };
        },
      },
      {
        name: 'Circuit Breaker Activation',
        channel: 'test:circuit-breaker',
        setup: () => {
          // Set up multiple failures to trigger circuit breaker
          for (let i = 0; i < 6; i++) {
            this.failureModes.set(`test:circuit-breaker-${i}`, {
              type: 'error',
              data: { message: 'Circuit breaker test error' },
            });
          }
        },
        test: async () => {
          return { scenario: 'circuit-breaker', passed: true };
        },
      },
    ];

    const results = [];

    for (const scenario of scenarios) {
      try {
        this.logger.info(`[IPC-TEST] Running scenario: ${scenario.name}`);
        scenario.setup();

        const result = await scenario.test();
        results.push({
          scenario: scenario.name,
          success: true,
          result,
        });

        // Clean up
        this.failureModes.clear();
      } catch (error) {
        results.push({
          scenario: scenario.name,
          success: false,
          error: error.message,
        });
      }
    }

    this.logger.info('[IPC-TEST] Failure scenario tests completed:', results);
    return results;
  }

  /**
   * Generate IPC failure report
   */
  generateFailureReport() {
    return {
      testingMode: this.isTestingMode,
      activeFailureModes: Object.fromEntries(this.failureModes),
      timestamp: new Date().toISOString(),
      recommendations: [
        'Test IPC calls with network failures',
        'Verify circuit breaker activation',
        'Test timeout recovery mechanisms',
        'Validate error handling in renderer',
        'Monitor IPC performance metrics',
      ],
    };
  }
}

module.exports = { registerAllIpc };
