const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { logger } = require('../../shared/logger');

/**
 * Multi-Layered Debugging Framework
 * Implements comprehensive debugging capabilities across all application layers
 */
class DebugFramework {
  constructor() {
    this.layers = {
      renderer: null,
      main: null,
      native: null,
      system: null,
    };
    this.debugSessions = [];
    this.maxSessions = 10;
    this.isInitialized = false;
    this.debugConfig = {
      enableInspector: false,
      enableLogging: true,
      enableMetrics: true,
      enableCrashReporting: true,
    };
  }

  /**
   * Initialize the debugging framework
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      logger.info(
        '[DEBUG-FRAMEWORK] Initializing multi-layered debugging framework',
      );

      // Load debug configuration
      await this.loadDebugConfig();

      // Initialize each debugging layer
      await this.initializeRendererDebugging();
      await this.initializeMainProcessDebugging();
      await this.initializeNativeDebugging();
      await this.initializeSystemDebugging();

      // Set up IPC handlers for debug communication
      this.setupDebugIPC();

      // Start session recording
      this.startDebugSession();

      this.isInitialized = true;
      logger.info(
        '[DEBUG-FRAMEWORK] Debugging framework initialized successfully',
      );
    } catch (error) {
      logger.error(
        '[DEBUG-FRAMEWORK] Failed to initialize debugging framework:',
        error,
      );
    }
  }

  /**
   * Load debug configuration
   */
  async loadDebugConfig() {
    try {
      const configPath = path.join(
        app.getPath('userData'),
        'debug-config.json',
      );

      try {
        const configData = await fs.readFile(configPath, 'utf8');
        const config = JSON.parse(configData);
        this.debugConfig = { ...this.debugConfig, ...config };
        logger.info(
          '[DEBUG-FRAMEWORK] Debug configuration loaded from:',
          configPath,
        );
      } catch (e) {
        // Config doesn't exist, use defaults and save
        await this.saveDebugConfig();
        logger.info('[DEBUG-FRAMEWORK] Using default debug configuration');
      }
    } catch (error) {
      logger.error('[DEBUG-FRAMEWORK] Failed to load debug config:', error);
    }
  }

  /**
   * Save debug configuration
   */
  async saveDebugConfig() {
    try {
      const configPath = path.join(
        app.getPath('userData'),
        'debug-config.json',
      );
      await fs.writeFile(configPath, JSON.stringify(this.debugConfig, null, 2));
    } catch (error) {
      logger.error('[DEBUG-FRAMEWORK] Failed to save debug config:', error);
    }
  }

  /**
   * Initialize renderer process debugging (Layer 1)
   */
  async initializeRendererDebugging() {
    try {
      logger.info(
        '[DEBUG-FRAMEWORK] Initializing renderer debugging (Layer 1)',
      );

      this.layers.renderer = {
        devToolsEnabled: false,
        consoleForwarding: true,
        errorTracking: true,
        performanceMonitoring: true,
      };

      // Enable DevTools in development
      if (process.env.NODE_ENV === 'development') {
        this.enableRendererDevTools();
      }

      // Set up renderer error forwarding
      this.setupRendererErrorForwarding();

      // Initialize performance monitoring
      this.setupRendererPerformanceMonitoring();

      logger.info('[DEBUG-FRAMEWORK] Renderer debugging initialized');
    } catch (error) {
      logger.error(
        '[DEBUG-FRAMEWORK] Failed to initialize renderer debugging:',
        error,
      );
    }
  }

  /**
   * Initialize main process debugging (Layer 2)
   */
  async initializeMainProcessDebugging() {
    try {
      logger.info(
        '[DEBUG-FRAMEWORK] Initializing main process debugging (Layer 2)',
      );

      this.layers.main = {
        inspectorEnabled: this.debugConfig.enableInspector,
        breakpointDebugging: false,
        asyncStackTraces: true,
        memoryProfiling: true,
      };

      // Enable Node.js inspector if configured
      if (this.debugConfig.enableInspector) {
        this.enableMainProcessInspector();
      }

      // Set up main process error tracking
      this.setupMainProcessErrorTracking();

      // Initialize memory profiling
      this.setupMainProcessMemoryProfiling();

      logger.info('[DEBUG-FRAMEWORK] Main process debugging initialized');
    } catch (error) {
      logger.error(
        '[DEBUG-FRAMEWORK] Failed to initialize main process debugging:',
        error,
      );
    }
  }

  /**
   * Initialize native module debugging (Layer 3)
   */
  async initializeNativeDebugging() {
    try {
      logger.info('[DEBUG-FRAMEWORK] Initializing native debugging (Layer 3)');

      this.layers.native = {
        crashReporting: this.debugConfig.enableCrashReporting,
        moduleLoading: true,
        abiCompatibility: true,
        memoryLeaks: true,
      };

      // Set up native crash reporting
      if (this.debugConfig.enableCrashReporting) {
        this.setupNativeCrashReporting();
      }

      // Initialize native module monitoring
      this.setupNativeModuleMonitoring();

      // Set up ABI compatibility checking
      this.setupABICompatibilityChecking();

      logger.info('[DEBUG-FRAMEWORK] Native debugging initialized');
    } catch (error) {
      logger.error(
        '[DEBUG-FRAMEWORK] Failed to initialize native debugging:',
        error,
      );
    }
  }

  /**
   * Initialize system-level debugging (Layer 4)
   */
  async initializeSystemDebugging() {
    try {
      logger.info('[DEBUG-FRAMEWORK] Initializing system debugging (Layer 4)');

      this.layers.system = {
        processMonitoring: true,
        resourceTracking: true,
        externalProcessMonitoring: true,
        hardwareDiagnostics: true,
      };

      // Set up system process monitoring
      this.setupSystemProcessMonitoring();

      // Initialize resource tracking
      this.setupSystemResourceTracking();

      // Set up external process monitoring
      this.setupExternalProcessMonitoring();

      logger.info('[DEBUG-FRAMEWORK] System debugging initialized');
    } catch (error) {
      logger.error(
        '[DEBUG-FRAMEWORK] Failed to initialize system debugging:',
        error,
      );
    }
  }

  /**
   * Enable renderer DevTools
   */
  enableRendererDevTools() {
    try {
      // DevTools will be enabled per window when created
      this.layers.renderer.devToolsEnabled = true;
      logger.info('[DEBUG-FRAMEWORK] Renderer DevTools enabled');
    } catch (error) {
      logger.error(
        '[DEBUG-FRAMEWORK] Failed to enable renderer DevTools:',
        error,
      );
    }
  }

  /**
   * Enable main process inspector
   */
  enableMainProcessInspector() {
    try {
      // Enable Node.js inspector
      const inspector = require('inspector');
      if (!inspector.url()) {
        inspector.open(0, '127.0.0.1', false);
        logger.info('[DEBUG-FRAMEWORK] Main process inspector enabled');
      }

      this.layers.main.breakpointDebugging = true;
    } catch (error) {
      logger.error(
        '[DEBUG-FRAMEWORK] Failed to enable main process inspector:',
        error,
      );
    }
  }

  /**
   * Set up renderer error forwarding
   */
  setupRendererErrorForwarding() {
    try {
      // IPC handler for renderer errors
      ipcMain.on('renderer-error', (event, errorData) => {
        logger.error('[DEBUG-FRAMEWORK] Renderer error received:', errorData);
        this.logDebugEvent('renderer-error', errorData);
      });

      // IPC handler for renderer console messages
      ipcMain.on('renderer-console', (event, logData) => {
        if (this.layers.renderer.consoleForwarding) {
          logger.debug(
            `[DEBUG-FRAMEWORK] Renderer console [${logData.level}]:`,
            logData.message,
          );
        }
      });

      logger.info('[DEBUG-FRAMEWORK] Renderer error forwarding configured');
    } catch (error) {
      logger.error(
        '[DEBUG-FRAMEWORK] Failed to setup renderer error forwarding:',
        error,
      );
    }
  }

  /**
   * Set up renderer performance monitoring
   */
  setupRendererPerformanceMonitoring() {
    try {
      // IPC handler for performance metrics
      ipcMain.on('renderer-performance', (event, metrics) => {
        if (this.layers.renderer.performanceMonitoring) {
          logger.debug(
            '[DEBUG-FRAMEWORK] Renderer performance metrics:',
            metrics,
          );
          this.logDebugEvent('renderer-performance', metrics);
        }
      });

      // Periodic performance checks
      setInterval(() => {
        this.broadcastDebugCommand('collect-performance-metrics');
      }, 30000); // Every 30 seconds

      logger.info(
        '[DEBUG-FRAMEWORK] Renderer performance monitoring configured',
      );
    } catch (error) {
      logger.error(
        '[DEBUG-FRAMEWORK] Failed to setup renderer performance monitoring:',
        error,
      );
    }
  }

  /**
   * Set up main process error tracking
   */
  setupMainProcessErrorTracking() {
    try {
      // Enhanced uncaught exception handler
      process.on('uncaughtException', (error) => {
        logger.error(
          '[DEBUG-FRAMEWORK] Main process uncaught exception:',
          error,
        );
        this.logDebugEvent('main-uncaught-exception', {
          message: error.message,
          stack: error.stack,
          name: error.name,
        });

        // Continue with crash reporter
        const crashReporter = require('./CrashReporter');
        crashReporter.handleUncaughtException(error, 'main-enhanced');
      });

      // Enhanced unhandled rejection handler
      process.on('unhandledRejection', (reason, promise) => {
        logger.error(
          '[DEBUG-FRAMEWORK] Main process unhandled rejection:',
          reason,
        );
        this.logDebugEvent('main-unhandled-rejection', {
          reason:
            reason instanceof Error
              ? {
                  message: reason.message,
                  stack: reason.stack,
                  name: reason.name,
                }
              : reason,
          promise: String(promise),
        });

        // Continue with crash reporter
        const crashReporter = require('./CrashReporter');
        crashReporter.handleUnhandledRejection(reason, promise);
      });

      logger.info('[DEBUG-FRAMEWORK] Main process error tracking configured');
    } catch (error) {
      logger.error(
        '[DEBUG-FRAMEWORK] Failed to setup main process error tracking:',
        error,
      );
    }
  }

  /**
   * Set up main process memory profiling
   */
  setupMainProcessMemoryProfiling() {
    try {
      // Periodic memory usage logging
      setInterval(() => {
        const memUsage = process.memoryUsage();
        const memoryData = {
          heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
          heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)}MB`,
          external: `${(memUsage.external / 1024 / 1024).toFixed(2)}MB`,
          rss: `${(memUsage.rss / 1024 / 1024).toFixed(2)}MB`,
          uptime: process.uptime(),
        };

        logger.debug(
          '[DEBUG-FRAMEWORK] Main process memory usage:',
          memoryData,
        );
        this.logDebugEvent('main-memory-usage', memoryData);
      }, 60000); // Every minute

      logger.info('[DEBUG-FRAMEWORK] Main process memory profiling configured');
    } catch (error) {
      logger.error(
        '[DEBUG-FRAMEWORK] Failed to setup main process memory profiling:',
        error,
      );
    }
  }

  /**
   * Set up native crash reporting
   */
  setupNativeCrashReporting() {
    try {
      const crashReporter = require('./CrashReporter');

      // Native crash reporting is handled by CrashReporter service
      logger.info(
        '[DEBUG-FRAMEWORK] Native crash reporting configured via CrashReporter',
      );
    } catch (error) {
      logger.error(
        '[DEBUG-FRAMEWORK] Failed to setup native crash reporting:',
        error,
      );
    }
  }

  /**
   * Set up native module monitoring
   */
  setupNativeModuleMonitoring() {
    try {
      // Monitor native module loading
      const Module = require('module');
      const originalLoad = Module._load;

      Module._load = (request, parent) => {
        try {
          const result = originalLoad.apply(Module, [request, parent]);

          // Log native module loading
          if (request.endsWith('.node')) {
            logger.info(`[DEBUG-FRAMEWORK] Native module loaded: ${request}`);
            this.logDebugEvent('native-module-loaded', {
              module: request,
              parent: parent.filename,
            });
          }

          return result;
        } catch (error) {
          logger.error(
            `[DEBUG-FRAMEWORK] Failed to load module ${request}:`,
            error,
          );
          this.logDebugEvent('native-module-load-error', {
            module: request,
            error: error.message,
            stack: error.stack,
          });
          throw error;
        }
      };

      logger.info('[DEBUG-FRAMEWORK] Native module monitoring configured');
    } catch (error) {
      logger.error(
        '[DEBUG-FRAMEWORK] Failed to setup native module monitoring:',
        error,
      );
    }
  }

  /**
   * Set up ABI compatibility checking
   */
  setupABICompatibilityChecking() {
    try {
      // Check Node.js ABI version
      const nodeAbi = process.versions.modules;
      logger.info(`[DEBUG-FRAMEWORK] Node.js ABI version: ${nodeAbi}`);

      // Check Electron ABI version
      const electronAbi = process.versions.electron;
      logger.info(`[DEBUG-FRAMEWORK] Electron version: ${electronAbi}`);

      this.logDebugEvent('abi-info', {
        nodeAbi,
        electronAbi,
        platform: process.platform,
        arch: process.arch,
      });

      logger.info('[DEBUG-FRAMEWORK] ABI compatibility checking configured');
    } catch (error) {
      logger.error(
        '[DEBUG-FRAMEWORK] Failed to setup ABI compatibility checking:',
        error,
      );
    }
  }

  /**
   * Set up system process monitoring
   */
  setupSystemProcessMonitoring() {
    try {
      // Monitor main process health
      setInterval(() => {
        const processData = {
          pid: process.pid,
          ppid: process.ppid,
          uptime: process.uptime(),
          cpuUsage: process.cpuUsage(),
          memoryUsage: process.memoryUsage(),
          resourceUsage: process.resourceUsage(),
        };

        logger.debug('[DEBUG-FRAMEWORK] System process status:', processData);
        this.logDebugEvent('system-process-status', processData);
      }, 120000); // Every 2 minutes

      logger.info('[DEBUG-FRAMEWORK] System process monitoring configured');
    } catch (error) {
      logger.error(
        '[DEBUG-FRAMEWORK] Failed to setup system process monitoring:',
        error,
      );
    }
  }

  /**
   * Set up system resource tracking
   */
  setupSystemResourceTracking() {
    try {
      const os = require('os');

      // Monitor system resources
      setInterval(() => {
        const systemData = {
          platform: os.platform(),
          arch: os.arch(),
          release: os.release(),
          hostname: os.hostname(),
          cpus: os.cpus().length,
          totalMemory: `${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)}GB`,
          freeMemory: `${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)}GB`,
          uptime: os.uptime(),
          loadAverage: os.loadavg(),
        };

        logger.debug('[DEBUG-FRAMEWORK] System resource status:', systemData);
        this.logDebugEvent('system-resource-status', systemData);
      }, 300000); // Every 5 minutes

      logger.info('[DEBUG-FRAMEWORK] System resource tracking configured');
    } catch (error) {
      logger.error(
        '[DEBUG-FRAMEWORK] Failed to setup system resource tracking:',
        error,
      );
    }
  }

  /**
   * Set up external process monitoring
   */
  setupExternalProcessMonitoring() {
    try {
      // Monitor Ollama process via OllamaMonitor service
      const ollamaMonitor = require('./OllamaMonitor');

      // Periodic external process status checks
      setInterval(async () => {
        try {
          const ollamaStatus = ollamaMonitor.getStatus();
          this.logDebugEvent('external-process-status', {
            ollama: ollamaStatus,
          });
        } catch (error) {
          logger.debug(
            '[DEBUG-FRAMEWORK] External process check failed:',
            error.message,
          );
        }
      }, 60000); // Every minute

      logger.info('[DEBUG-FRAMEWORK] External process monitoring configured');
    } catch (error) {
      logger.error(
        '[DEBUG-FRAMEWORK] Failed to setup external process monitoring:',
        error,
      );
    }
  }

  /**
   * Set up IPC handlers for debug communication
   */
  setupDebugIPC() {
    try {
      // Debug command handler
      ipcMain.on('debug-command', (event, command) => {
        this.handleDebugCommand(command, event.sender);
      });

      // Debug info request handler
      ipcMain.on('debug-info-request', (event, request) => {
        this.handleDebugInfoRequest(request, event.sender);
      });

      logger.info('[DEBUG-FRAMEWORK] Debug IPC handlers configured');
    } catch (error) {
      logger.error('[DEBUG-FRAMEWORK] Failed to setup debug IPC:', error);
    }
  }

  /**
   * Handle debug commands
   */
  async handleDebugCommand(command, sender) {
    try {
      logger.info('[DEBUG-FRAMEWORK] Received debug command:', command);

      const result = await this.executeDebugCommand(command);

      // Send result back to sender
      if (sender && !sender.isDestroyed()) {
        sender.send('debug-command-result', { command, result });
      }

      this.logDebugEvent('debug-command-executed', { command, result });
    } catch (error) {
      logger.error('[DEBUG-FRAMEWORK] Failed to handle debug command:', error);

      if (sender && !sender.isDestroyed()) {
        sender.send('debug-command-result', {
          command,
          error: error.message,
        });
      }
    }
  }

  /**
   * Execute debug command
   */
  async executeDebugCommand(command) {
    try {
      switch (command.type) {
        case 'get-debug-status':
          return this.getDebugStatus();

        case 'toggle-inspector':
          return this.toggleInspector(command.enable);

        case 'collect-diagnostics':
          return await this.collectDiagnostics();

        case 'clear-debug-logs':
          return this.clearDebugLogs();

        case 'export-debug-data':
          return await this.exportDebugData(command.filepath);

        case 'run-health-check':
          return await this.runHealthCheck();

        default:
          throw new Error(`Unknown debug command: ${command.type}`);
      }
    } catch (error) {
      logger.error('[DEBUG-FRAMEWORK] Failed to execute debug command:', error);
      throw error;
    }
  }

  /**
   * Handle debug info requests
   */
  async handleDebugInfoRequest(request, sender) {
    try {
      const info = await this.getDebugInfo(request.type);

      if (sender && !sender.isDestroyed()) {
        sender.send('debug-info-response', { request, info });
      }
    } catch (error) {
      logger.error(
        '[DEBUG-FRAMEWORK] Failed to handle debug info request:',
        error,
      );

      if (sender && !sender.isDestroyed()) {
        sender.send('debug-info-response', {
          request,
          error: error.message,
        });
      }
    }
  }

  /**
   * Get debug information
   */
  async getDebugInfo(type) {
    try {
      switch (type) {
        case 'layers':
          return this.layers;

        case 'sessions':
          return this.debugSessions.slice(-5);

        case 'config':
          return this.debugConfig;

        case 'status':
          return this.getDebugStatus();

        case 'diagnostics':
          return await this.collectDiagnostics();

        default:
          throw new Error(`Unknown debug info type: ${type}`);
      }
    } catch (error) {
      logger.error('[DEBUG-FRAMEWORK] Failed to get debug info:', error);
      throw error;
    }
  }

  /**
   * Get debug status
   */
  getDebugStatus() {
    return {
      initialized: this.isInitialized,
      layers: this.layers,
      config: this.debugConfig,
      sessionCount: this.debugSessions.length,
      currentSession: this.debugSessions[this.debugSessions.length - 1],
    };
  }

  /**
   * Toggle inspector
   */
  toggleInspector(enable) {
    try {
      if (enable && !this.layers.main.inspectorEnabled) {
        this.enableMainProcessInspector();
        this.debugConfig.enableInspector = true;
      } else if (!enable && this.layers.main.inspectorEnabled) {
        // Note: Once enabled, inspector cannot be fully disabled in running process
        logger.info(
          '[DEBUG-FRAMEWORK] Inspector remains enabled (cannot be disabled at runtime)',
        );
      }

      this.saveDebugConfig();
      return { inspectorEnabled: this.layers.main.inspectorEnabled };
    } catch (error) {
      logger.error('[DEBUG-FRAMEWORK] Failed to toggle inspector:', error);
      throw error;
    }
  }

  /**
   * Collect comprehensive diagnostics
   */
  async collectDiagnostics() {
    try {
      const diagnostics = {
        timestamp: new Date().toISOString(),
        framework: this.getDebugStatus(),
        system: await this.getSystemDiagnostics(),
        processes: await this.getProcessDiagnostics(),
        performance: await this.getPerformanceDiagnostics(),
      };

      logger.info('[DEBUG-FRAMEWORK] Diagnostics collected');
      return diagnostics;
    } catch (error) {
      logger.error('[DEBUG-FRAMEWORK] Failed to collect diagnostics:', error);
      throw error;
    }
  }

  /**
   * Get system diagnostics
   */
  async getSystemDiagnostics() {
    try {
      const os = require('os');
      const gpuDiagnostics = require('./GPUDiagnostics');

      return {
        platform: os.platform(),
        arch: os.arch(),
        release: os.release(),
        hostname: os.hostname(),
        cpus: os.cpus().length,
        memory: {
          total: `${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)}GB`,
          free: `${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)}GB`,
        },
        uptime: os.uptime(),
        loadAverage: os.loadavg(),
        gpuStatus: await gpuDiagnostics.getDiagnosticReport(),
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Get process diagnostics
   */
  async getProcessDiagnostics() {
    try {
      const ollamaMonitor = require('./OllamaMonitor');

      return {
        main: {
          pid: process.pid,
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          cpuUsage: process.cpuUsage(),
        },
        ollama: ollamaMonitor.getStatus(),
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Get performance diagnostics
   */
  async getPerformanceDiagnostics() {
    try {
      const perfMonitor = require('../utils/perfMonitor')(logger);

      return {
        mainProcess: {
          memoryUsage: process.memoryUsage(),
          cpuUsage: process.cpuUsage(),
          resourceUsage: process.resourceUsage(),
        },
        v8: {
          heapStatistics: require('v8').getHeapStatistics(),
          heapSpaceStatistics: require('v8').getHeapSpaceStatistics(),
        },
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Clear debug logs
   */
  clearDebugLogs() {
    try {
      this.debugSessions = [];
      logger.info('[DEBUG-FRAMEWORK] Debug logs cleared');
      return { cleared: true };
    } catch (error) {
      logger.error('[DEBUG-FRAMEWORK] Failed to clear debug logs:', error);
      throw error;
    }
  }

  /**
   * Export debug data
   */
  async exportDebugData(filepath) {
    try {
      const data = {
        timestamp: new Date().toISOString(),
        config: this.debugConfig,
        sessions: this.debugSessions,
        diagnostics: await this.collectDiagnostics(),
      };

      await fs.writeFile(filepath, JSON.stringify(data, null, 2));
      logger.info(`[DEBUG-FRAMEWORK] Debug data exported to: ${filepath}`);

      return { exported: true, filepath };
    } catch (error) {
      logger.error('[DEBUG-FRAMEWORK] Failed to export debug data:', error);
      throw error;
    }
  }

  /**
   * Run comprehensive health check
   */
  async runHealthCheck() {
    try {
      const healthCheck = {
        timestamp: new Date().toISOString(),
        layers: {},
        overall: 'unknown',
      };

      // Check each layer
      healthCheck.layers.renderer = await this.checkRendererHealth();
      healthCheck.layers.main = await this.checkMainHealth();
      healthCheck.layers.native = await this.checkNativeHealth();
      healthCheck.layers.system = await this.checkSystemHealth();

      // Determine overall health
      const layerStatuses = Object.values(healthCheck.layers).map(
        (l) => l.status,
      );
      if (layerStatuses.includes('critical')) {
        healthCheck.overall = 'critical';
      } else if (layerStatuses.includes('warning')) {
        healthCheck.overall = 'warning';
      } else if (layerStatuses.every((s) => s === 'healthy')) {
        healthCheck.overall = 'healthy';
      } else {
        healthCheck.overall = 'degraded';
      }

      logger.info(
        '[DEBUG-FRAMEWORK] Health check completed:',
        healthCheck.overall,
      );
      return healthCheck;
    } catch (error) {
      logger.error('[DEBUG-FRAMEWORK] Health check failed:', error);
      throw error;
    }
  }

  /**
   * Check renderer health
   */
  async checkRendererHealth() {
    try {
      const windows = BrowserWindow.getAllWindows();
      return {
        status: windows.length > 0 ? 'healthy' : 'warning',
        windowCount: windows.length,
        crashedWindows: windows.filter((w) => w.isDestroyed()).length,
      };
    } catch (error) {
      return { status: 'error', error: error.message };
    }
  }

  /**
   * Check main process health
   */
  async checkMainHealth() {
    try {
      const memUsage = process.memoryUsage();
      const heapUsedMB = memUsage.heapUsed / 1024 / 1024;

      return {
        status: heapUsedMB > 1024 ? 'warning' : 'healthy',
        memoryUsage: `${heapUsedMB.toFixed(2)}MB`,
        uptime: process.uptime(),
      };
    } catch (error) {
      return { status: 'error', error: error.message };
    }
  }

  /**
   * Check native health
   */
  async checkNativeHealth() {
    try {
      // Check if sharp can be loaded
      try {
        require('sharp');
        return { status: 'healthy', sharpLoaded: true };
      } catch (error) {
        return { status: 'warning', sharpLoaded: false, error: error.message };
      }
    } catch (error) {
      return { status: 'error', error: error.message };
    }
  }

  /**
   * Check system health
   */
  async checkSystemHealth() {
    try {
      const os = require('os');
      const freeMemoryPercent = (os.freemem() / os.totalmem()) * 100;

      return {
        status: freeMemoryPercent < 10 ? 'warning' : 'healthy',
        freeMemoryPercent: freeMemoryPercent.toFixed(1),
        loadAverage: os.loadavg(),
      };
    } catch (error) {
      return { status: 'error', error: error.message };
    }
  }

  /**
   * Start debug session
   */
  startDebugSession() {
    try {
      const session = {
        id: `session_${Date.now()}`,
        startTime: new Date().toISOString(),
        layers: { ...this.layers },
        config: { ...this.debugConfig },
        events: [],
      };

      this.debugSessions.push(session);

      // Maintain session history limit
      if (this.debugSessions.length > this.maxSessions) {
        this.debugSessions = this.debugSessions.slice(-this.maxSessions);
      }

      logger.info(`[DEBUG-FRAMEWORK] Debug session started: ${session.id}`);
    } catch (error) {
      logger.error('[DEBUG-FRAMEWORK] Failed to start debug session:', error);
    }
  }

  /**
   * Log debug event
   */
  logDebugEvent(type, data) {
    try {
      const event = {
        timestamp: new Date().toISOString(),
        type,
        data,
      };

      // Add to current session if exists
      if (this.debugSessions.length > 0) {
        const currentSession =
          this.debugSessions[this.debugSessions.length - 1];
        currentSession.events.push(event);

        // Limit events per session
        if (currentSession.events.length > 1000) {
          currentSession.events = currentSession.events.slice(-1000);
        }
      }

      // Also log to main logger for immediate visibility
      logger.debug(`[DEBUG-FRAMEWORK] Event logged: ${type}`);
    } catch (error) {
      // Avoid recursive logging errors
      logger.error('[DEBUG-FRAMEWORK] Failed to log debug event:', error);
    }
  }

  /**
   * Broadcast debug command to all renderer processes
   */
  broadcastDebugCommand(command, data = {}) {
    try {
      const windows = BrowserWindow.getAllWindows();
      windows.forEach((window) => {
        if (!window.isDestroyed()) {
          window.webContents.send('debug-command-broadcast', { command, data });
        }
      });
    } catch (error) {
      logger.error(
        '[DEBUG-FRAMEWORK] Failed to broadcast debug command:',
        error,
      );
    }
  }

  /**
   * Get current debug session
   */
  getCurrentSession() {
    return this.debugSessions.length > 0
      ? this.debugSessions[this.debugSessions.length - 1]
      : null;
  }

  /**
   * End current debug session
   */
  endCurrentSession() {
    try {
      if (this.debugSessions.length > 0) {
        const currentSession =
          this.debugSessions[this.debugSessions.length - 1];
        currentSession.endTime = new Date().toISOString();
        currentSession.duration =
          Date.now() - new Date(currentSession.startTime).getTime();

        logger.info(
          `[DEBUG-FRAMEWORK] Debug session ended: ${currentSession.id}`,
        );
      }
    } catch (error) {
      logger.error('[DEBUG-FRAMEWORK] Failed to end debug session:', error);
    }
  }

  /**
   * Cleanup debugging framework
   */
  cleanup() {
    try {
      this.endCurrentSession();
      this.isInitialized = false;
      logger.info('[DEBUG-FRAMEWORK] Debugging framework cleanup completed');
    } catch (error) {
      logger.error(
        '[DEBUG-FRAMEWORK] Failed to cleanup debugging framework:',
        error,
      );
    }
  }
}

// Export singleton instance
module.exports = new DebugFramework();
