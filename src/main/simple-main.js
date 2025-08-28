const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  Menu,
  Tray,
  nativeImage,
} = require('electron');
const { autoUpdater } = require('electron-updater');

const isDev = process.env.NODE_ENV === 'development';

// Logging utility
const { logger } = require('../shared/logger');
const { MEMORY_THRESHOLDS, SERVICE_LIMITS } = require('../shared/constants');

// Import error handling system (not needed directly in this file)

const { scanDirectory } = require('./folderScanner');
const {
  getOllama,
  getOllamaModel,
  getOllamaVisionModel,
  getOllamaEmbeddingModel,
  getOllamaHost,
  setOllamaModel,
  setOllamaVisionModel,
  setOllamaEmbeddingModel,
  setOllamaHost,
  loadOllamaConfig,
} = require('./ollamaUtils');
const { buildOllamaOptions } = require('./services/PerformanceService');
const { ensureOllamaWithGpu } = require('./ollamaStartup');
const SettingsService = require('./services/SettingsService');
const DownloadWatcher = require('./services/DownloadWatcher');
const { systemMonitor } = require('./services/SystemMonitor');

// Import service integration
const ServiceIntegration = require('./services/ServiceIntegration');

// Import shared constants
const { IPC_CHANNELS } = require('../shared/constants');

// Lazy load heavy analysis modules
let analyzeDocumentFile, analyzeImageFile;

// Lazy load OCR library
let tesseract;

// Lazy load services
let ModelManager, ProcessingStateService, AnalysisHistoryService;

// Lazy loading functions
async function getAnalyzeDocumentFile() {
  if (!analyzeDocumentFile) {
    try {
      const module = require('./analysis/ollamaDocumentAnalysis');
      analyzeDocumentFile = module.analyzeDocumentFile;
    } catch (error) {
      logger.error(
        '[LAZY-LOAD] Failed to load document analysis module:',
        error,
      );
      // Return a fallback function that throws a meaningful error
      analyzeDocumentFile = async () => {
        throw new Error(
          'Document analysis module failed to load. Please check logs for details.',
        );
      };
    }
  }
  return analyzeDocumentFile;
}

async function getAnalyzeImageFile() {
  if (!analyzeImageFile) {
    try {
      const module = require('./analysis/ollamaImageAnalysis');
      analyzeImageFile = module.analyzeImageFile;
    } catch (error) {
      logger.error('[LAZY-LOAD] Failed to load image analysis module:', error);
      // Return a fallback function that throws a meaningful error
      analyzeImageFile = async () => {
        throw new Error(
          'Image analysis module failed to load. Please check logs for details.',
        );
      };
    }
  }
  return analyzeImageFile;
}

async function getTesseract() {
  if (!tesseract) {
    try {
      tesseract = require('node-tesseract-ocr');
      logger.debug('[LAZY-LOAD] Loaded Tesseract OCR library');
    } catch (error) {
      logger.error('[LAZY-LOAD] Failed to load Tesseract OCR library:', error);
      // Return a fallback function that throws a meaningful error
      tesseract = {
        recognize: async () => {
          throw new Error(
            'Tesseract OCR library failed to load. Please check logs for details.',
          );
        },
      };
    }
  }
  return tesseract;
}

let mainWindow;
let customFolders = []; // Initialize customFolders at module level

// Initialize service integration
let serviceIntegration;
let settingsService;
let downloadWatcher;
let currentSettings = {};
let isQuitting = false;

// Performance monitoring (testable via a shared utility)
const perfMonitor = require('./utils/perfMonitor')(logger);

// ===== GPU PREFERENCES (Windows rendering stability) =====
try {
  // Try OpenGL/ANGLE backend. On Windows prefer 'd3d11' which is broadly compatible
  const defaultAngle = process.platform === 'win32' ? 'd3d11' : 'gl';
  const angleBackend = process.env.ANGLE_BACKEND || defaultAngle; // alternatives: 'd3d11', 'd3d9'
  app.commandLine.appendSwitch('use-angle', angleBackend);

  // Disable problematic GPU features that cause command buffer errors
  app.commandLine.appendSwitch('disable-gpu-sandbox');
  app.commandLine.appendSwitch('disable-software-rasterizer');

  // Use GPU but with safer settings
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('ignore-gpu-blocklist');

  // Disable features that commonly cause issues
  app.commandLine.appendSwitch('disable-features', 'VizDisplayCompositor');

  logger.info(`[GPU] Flags set: ANGLE=${angleBackend}`);
} catch (e) {
  try {
    logger.warn('[GPU] Failed to apply GPU flags:', e?.message);
  } catch (logError) {
    // Silent catch for logging errors - critical path for GPU setup
    console.error(
      '[GPU] Could not log GPU error:',
      logError?.message || logError,
    );
  }
}

// --- GPU Manager: initialize early to select discrete GPU where available ---
try {
  const { initializeGpuEnvironment } = require('./services/gpuManager');

  (async () => {
    try {
      await initializeGpuEnvironment();
    } catch (e) {
      logger.error('[GPU] GPU initialization failed:', e?.message || e);
      // Defer user dialog until app is ready, then show and exit
      app.on('ready', () => {
        try {
          const { dialog } = require('electron');
          dialog.showErrorBox(
            'GPU Configuration Error',
            `A critical error occurred while configuring the GPU environment. The application cannot continue.\n\nDetails: ${e?.message || e}`,
          );
        } catch (dialogErr) {
          // fallback
          console.error(
            '[GPU] Failed to show error dialog:',
            dialogErr?.message || dialogErr,
          );
        } finally {
          try {
            app.quit();
          } catch (qErr) {
            /* ignore */
          }
        }
      });
    }
  })();
} catch (err) {
  logger.debug('[GPU] GPU manager not available:', err?.message || err);
}

// Custom folders helpers
const {
  loadCustomFolders,
  saveCustomFolders,
} = require('./core/customFolders');

// System monitoring and analytics
const systemAnalytics = require('./core/systemAnalytics');

// Window creation
const createMainWindow = require('./core/createWindow');

// Create themed application menu
function createApplicationMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Select Files',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-action', 'select-files');
            }
          },
        },
        {
          label: 'Select Folder',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-action', 'select-folder');
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-action', 'open-settings');
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          },
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Y', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        {
          label: 'Force Reload',
          accelerator: 'CmdOrCtrl+Shift+R',
          role: 'forceReload',
        },
        { type: 'separator' },
        {
          label: 'Toggle Fullscreen',
          accelerator: 'F11',
          role: 'togglefullscreen',
        },
        ...(isDev
          ? [
              { type: 'separator' },
              {
                label: 'Toggle Developer Tools',
                accelerator: 'F12',
                role: 'toggleDevTools',
              },
            ]
          : []),
      ],
    },
    {
      label: 'Window',
      submenu: [
        { label: 'Minimize', accelerator: 'CmdOrCtrl+M', role: 'minimize' },
        { label: 'Close', accelerator: 'CmdOrCtrl+W', role: 'close' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About StratoSort',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-action', 'show-about');
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Documentation',
          click: () => {
            shell.openExternal('https://github.com');
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  logger.debug('[DEBUG] createWindow() called');
  if (mainWindow && !mainWindow.isDestroyed()) {
    logger.debug('[DEBUG] Window already exists, focusing...');
    mainWindow.focus();
    return;
  }
  mainWindow = createMainWindow();
  // startupTimings.windowReady = Date.now();
  mainWindow.on('close', (e) => {
    if (!isQuitting && currentSettings?.backgroundMode) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function updateDownloadWatcher(settings) {
  const enabled = settings?.autoOrganize;
  if (enabled) {
    if (!downloadWatcher) {
      downloadWatcher = new DownloadWatcher({
        analyzeDocumentFile: getAnalyzeDocumentFile,
        analyzeImageFile: getAnalyzeImageFile,
        getCustomFolders: () => customFolders,
      });
      downloadWatcher.start();
    }
  } else if (downloadWatcher) {
    downloadWatcher.stop();
    downloadWatcher = null;
  }
}

function handleSettingsChanged(settings) {
  currentSettings = settings || {};
  updateDownloadWatcher(settings);
  try {
    updateTrayMenu();
  } catch (error) {
    logger.warn('[SETTINGS] Failed to update tray menu:', error);
  }
}

// ===== IPC HANDLERS =====
// ALL IPC handlers must be registered BEFORE app.whenReady()
const { registerAllIpc } = require('./ipc');

// NOTE: Old handle-file-selection handler removed - using IPC_CHANNELS.FILES.SELECT instead

// NOTE: Old select-directory handler removed - using IPC_CHANNELS.FILES.SELECT_DIRECTORY instead

// NOTE: Old get-documents-path handler removed - using IPC_CHANNELS.FILES.GET_DOCUMENTS_PATH instead

// NOTE: Old get-file-stats handler removed - using IPC_CHANNELS.FILES.GET_FILE_STATS instead

// File-related handlers moved to ipc/files.js

// Smart Folders matching and helpers moved to ipc/smartFolders.js

// Resume service
const { resumeIncompleteBatches } = require('./services/OrganizeResumeService');

// Delete folder and its contents
// File-related handlers moved to ipc/files.js

// File-related handlers moved to ipc/files.js

// File-related handlers moved to ipc/files.js

// File-related handlers moved to ipc/files.js

// File-related handlers moved to ipc/files.js

// File-related handlers moved to ipc/files.js

// Enhanced folder opening with better path handling
// File-related handlers moved to ipc/files.js

// Enhanced Smart Folders with comprehensive validation and atomic operations
// Smart folders handlers moved to ipc/smartFolders.js

// Smart folders handlers moved to ipc/smartFolders.js

// Smart folders handlers moved to ipc/smartFolders.js

// Smart folders handlers moved to ipc/smartFolders.js

// Smart folders handlers moved to ipc/smartFolders.js

// Smart folders handlers moved to ipc/smartFolders.js

// NOTE: Old get-analysis-statistics handler removed - using IPC_CHANNELS.ANALYSIS_HISTORY.GET_STATISTICS instead

// NOTE: Old duplicate handlers removed - using IPC_CHANNELS constants instead

// Smart Folders scan moved to ipc/smartFolders.js

// NOTE: Old analyze-document handler removed - using IPC_CHANNELS.ANALYSIS.ANALYZE_DOCUMENT instead

// Semantic similarity helpers moved to services/SmartFoldersLLMService.js

// NOTE: Old analyze-image and analyze-audio handlers removed - using IPC_CHANNELS constants instead

// Ollama handlers moved to ipc/ollama.js

// IPC groups moved to ./ipc/* modules

// File operation handlers
// File selection moved to ipc/files.js

// Directory selection moved to ipc/files.js

// Document path moved to ipc/files.js

// File stats moved to ipc/files.js

// Analysis handlers moved to ipc/analysis.js

// Audio analysis handlers
// Audio analysis is disabled in the current UI and preload. IPC handlers removed to avoid drift and runtime errors.

// Settings handlers moved to ipc/settings.js

// NOTE: Removed all old-style handlers that have IPC_CHANNELS constant-based duplicates
// This prevents "Attempted to register a second handler" errors
// All functionality is handled by the constant-based handlers above

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, _commandLine, _workingDirectory) => {
    // Someone tried to run a second instance, focus our window if present,
    // otherwise attempt to create a new window (e.g., app running in tray)
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      return;
    }

    try {
      // If no window exists, create one so the user's launch actually shows UI
      createWindow();
    } catch (e) {
      logger.warn(
        '[SECOND-INSTANCE] Failed to create window on second-instance:',
        e?.message,
      );
    }
  });

  // Production optimizations - ensure GPU acceleration
  if (!isDev) {
    // Production GPU optimizations
    app.commandLine.appendSwitch('enable-gpu-rasterization');
    app.commandLine.appendSwitch(
      'enable-gpu-memory-buffer-compositor-resources',
    );
    app.commandLine.appendSwitch('enable-native-gpu-memory-buffers');
    // Use the modern, documented flag name consistently
    app.commandLine.appendSwitch('ignore-gpu-blocklist');
    app.commandLine.appendSwitch('disable-software-rasterizer');

    // Performance optimizations
    app.commandLine.appendSwitch('enable-zero-copy');
    app.commandLine.appendSwitch('enable-hardware-overlays');
    app.commandLine.appendSwitch(
      'enable-features',
      'Vulkan,CanvasOopRasterization,UseSkiaRenderer,VaapiVideoDecoder,VaapiVideoEncoder',
    );

    // Memory optimization
    app.commandLine.appendSwitch('--expose-gc');

    logger.info('[PRODUCTION] GPU acceleration optimizations enabled');
  } else {
    // Even in dev, prefer GPU acceleration where possible
    app.commandLine.appendSwitch('enable-gpu-rasterization');
    app.commandLine.appendSwitch('enable-zero-copy');
    app.commandLine.appendSwitch(
      'enable-features',
      'Vulkan,CanvasOopRasterization,UseSkiaRenderer',
    );

    // Memory optimization for development
    app.commandLine.appendSwitch('--expose-gc');

    logger.info('[DEVELOPMENT] GPU acceleration flags enabled for development');
  }

  // Initialize services after app is ready
  app.whenReady().then(async () => {
    // Initialize file logger with userData path for consistent log locations
    try {
      const { initializeForMainProcess } = require('../shared/fileLogger');
      initializeForMainProcess(app.getPath('userData'));
    } catch (e) {
      logger.warn('[STARTUP] File logger initialization failed:', e?.message);
    }

    // Initialize comprehensive system monitoring
    try {
      await systemMonitor.initialize();
      logger.info('[STARTUP] System monitoring initialized');
    } catch (e) {
      // Non-fatal: log and continue startup
      logger.warn(
        '[STARTUP] System monitoring initialization failed:',
        e?.message,
      );
    }

    // Ensure Ollama is started with GPU-enabled configuration on app startup
    try {
      await ensureOllamaWithGpu();
    } catch (e) {
      // Non-fatal: log and continue startup
      logger.debug('[OLLAMA] GPU startup check failed:', e?.message);
    }
    perfMonitor.mark('app.whenReady() completed');
    try {
      // Load custom folders
      const loadedCustomFolders = await perfMonitor.measure(
        'loadCustomFolders()',
        async () => await loadCustomFolders(),
      );
      customFolders = Array.isArray(loadedCustomFolders)
        ? loadedCustomFolders
        : [];
      logger.info(
        '[STARTUP] Loaded custom folders:',
        customFolders.length,
        'folders',
      );

      // Initialize service integration (deferred for better startup performance)
      serviceIntegration = new ServiceIntegration();
      // Use background initialization to avoid blocking the UI on heavy I/O
      setTimeout(() => {
        try {
          perfMonitor.measure('serviceIntegration.initializeBackground()', () =>
            serviceIntegration.initializeBackground(),
          );
        } catch (error) {
          logger.warn(
            '[MAIN] Service integration background init failed:',
            error.message,
          );
        }
      }, 1000);

      // Add memory monitoring and cleanup with progressive thresholds
      let lastGcTime = 0;
      const GC_COOLDOWN_MS = SERVICE_LIMITS.GC_COOLDOWN;

      setInterval(() => {
        try {
          const memUsage = process.memoryUsage();
          const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
          const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
          const heapUsagePercent =
            (memUsage.heapUsed / memUsage.heapTotal) * 100;

          // Progressive thresholds with different actions
          if (heapUsedMB > MEMORY_THRESHOLDS.CRITICAL_MB) {
            logger.error('[MEMORY] Critical memory usage:', {
              heapUsed: `${heapUsedMB.toFixed(2)}MB`,
              heapTotal: `${heapTotalMB.toFixed(2)}MB`,
              usagePercent: `${heapUsagePercent.toFixed(1)}%`,
              recommendation: 'Consider restarting the application',
            });

            // Force GC only if cooldown period has passed
            const now = Date.now();
            if (global.gc && now - lastGcTime > GC_COOLDOWN_MS) {
              global.gc();
              lastGcTime = now;
              logger.warn(
                '[MEMORY] Forced garbage collection due to critical usage',
              );
            }
          } else if (heapUsedMB > MEMORY_THRESHOLDS.HIGH_MB) {
            logger.warn('[MEMORY] High memory usage:', {
              heapUsed: `${heapUsedMB.toFixed(2)}MB`,
              heapTotal: `${heapTotalMB.toFixed(2)}MB`,
              usagePercent: `${heapUsagePercent.toFixed(1)}%`,
              recommendation: 'Monitor for potential memory leaks',
            });

            // Force GC only if cooldown period has passed
            const now = Date.now();
            if (global.gc && now - lastGcTime > GC_COOLDOWN_MS) {
              global.gc();
              lastGcTime = now;
              logger.info(
                '[MEMORY] Forced garbage collection due to high usage',
              );
            }
          } else if (heapUsedMB > 1024) {
            // 1GB - Moderate
            logger.info('[MEMORY] Moderate memory usage:', {
              heapUsed: `${heapUsedMB.toFixed(2)}MB`,
              heapTotal: `${heapTotalMB.toFixed(2)}MB`,
              usagePercent: `${heapUsagePercent.toFixed(1)}%`,
            });

            // Only force GC for moderate usage if it's been very long
            const now = Date.now();
            if (global.gc && now - lastGcTime > GC_COOLDOWN_MS * 2) {
              global.gc();
              lastGcTime = now;
              logger.debug('[MEMORY] Periodic garbage collection');
            }
          } else if (heapUsagePercent > 80) {
            // High percentage regardless of absolute size
            logger.info('[MEMORY] High memory percentage:', {
              usagePercent: `${heapUsagePercent.toFixed(1)}%`,
              heapUsed: `${heapUsedMB.toFixed(2)}MB`,
              heapTotal: `${heapTotalMB.toFixed(2)}MB`,
            });
          }
        } catch (error) {
          logger.debug('[MEMORY] Memory monitoring failed:', error.message);
        }
      }, 120000); // Check every 2 minutes (reduced frequency)
      // Initialize settings service
      settingsService = new SettingsService();
      const initialSettings = await perfMonitor.measure(
        'settingsService.load()',
        async () => await settingsService.load(),
      );
      currentSettings = initialSettings;
      perfMonitor.mark('Settings loaded');

      // Resume any incomplete organize batches (best-effort)
      try {
        const incompleteBatches =
          serviceIntegration?.processingState?.getIncompleteOrganizeBatches?.() ||
          [];
        if (incompleteBatches.length > 0) {
          logger.warn(
            `[RESUME] Found ${incompleteBatches.length} incomplete organize batch(es). They will resume when a new organize request starts.`,
          );
        }
      } catch (resumeErr) {
        logger.warn(
          '[RESUME] Failed to check incomplete batches:',
          resumeErr.message,
        );
      }

      // Decide whether to skip AI model verification based on settings (default: false)
      const skipVerification =
        typeof currentSettings.skipAIModelVerification === 'boolean'
          ? currentSettings.skipAIModelVerification
          : false;
      // startupTimings.modelVerificationStarted = Date.now();

      if (skipVerification) {
        logger.info(
          '[STARTUP] Skipping AI model verification for better performance',
        );
        // Send notification to renderer about skipped AI status
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('ai-status-update', {
            status: 'skipped',
            message: 'AI model verification skipped for performance',
          });
        }
      }

      // startupTimings.modelVerificationCompleted = Date.now();

      // Register IPC groups now that services and state are ready
      const getMainWindow = () => mainWindow;
      const getServiceIntegration = () => serviceIntegration;
      const getCustomFolders = () => customFolders;
      const setCustomFolders = (folders) => {
        customFolders = folders;
      };

      // Grouped IPC registration (single entry)
      perfMonitor.measure('registerAllIpc()', () => {
        registerAllIpc({
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
          analyzeDocumentFile: getAnalyzeDocumentFile,
          analyzeImageFile: getAnalyzeImageFile,
          tesseract: getTesseract,
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
          onSettingsChanged: handleSettingsChanged,
        });
      });
      perfMonitor.mark('IPC registered');

      // Create application menu with theme
      createApplicationMenu();

      createWindow();
      handleSettingsChanged(initialSettings);

      // Start periodic system metrics broadcast to renderer
      try {
        const metricsInterval = setInterval(async () => {
          try {
            const win = BrowserWindow.getAllWindows()[0];
            if (!win || win.isDestroyed()) return;
            const metrics = await systemAnalytics.collectMetrics();
            win.webContents.send('system-metrics', metrics);
          } catch (metricsError) {
            // Silent catch for metrics collection - non-critical background task
            logger.debug(
              '[METRICS] Failed to collect system metrics:',
              metricsError?.message,
            );
          }
        }, 300000); // Increased from 30s to 5 minutes for better performance
        if (metricsInterval && typeof metricsInterval.unref === 'function') {
          try {
            metricsInterval.unref();
          } catch (e) {
            /* ignore */
          }
        }
      } catch (intervalError) {
        // Silent catch for metrics interval setup - non-critical feature
        logger.warn(
          '[METRICS] Failed to setup metrics collection interval:',
          intervalError?.message,
        );
      }

      // Create system tray with quick actions
      try {
        createSystemTray();
      } catch (e) {
        logger.warn('[TRAY] Failed to initialize tray:', e.message);
      }

      // Handle app command-line tasks (Windows Jump List)
      try {
        const args = process.argv.slice(1);
        if (args.includes('--open-documents')) {
          try {
            const docs = app.getPath('documents');
            shell.openPath(docs);
          } catch (shellError) {
            // Silent catch for shell operations - non-critical feature
            logger.debug(
              '[SHELL] Failed to open documents path:',
              shellError?.message,
            );
          }
        }
        if (args.includes('--analyze-folder')) {
          // Bring window to front and trigger select directory
          const win = BrowserWindow.getAllWindows()[0];
          if (win) {
            win.focus();
            try {
              win.webContents.send('operation-progress', {
                type: 'hint',
                message: 'Use Select Directory to analyze a folder',
              });
            } catch (ipcError) {
              // Silent catch for IPC operations - window might be destroyed
              logger.debug(
                '[IPC] Failed to send hint message:',
                ipcError?.message,
              );
            }
          }
        }
      } catch (argsError) {
        // Silent catch for command line argument processing - non-critical feature
        logger.debug(
          '[ARGS] Failed to process command line arguments:',
          argsError?.message,
        );
      }
      // Windows Jump List tasks
      try {
        if (process.platform === 'win32') {
          app.setAppUserModelId('com.stratosort.app');
          app.setJumpList([
            {
              type: 'tasks',
              items: [
                {
                  type: 'task',
                  title: 'Analyze Folder…',
                  program: process.execPath,
                  args: '--analyze-folder',
                  iconPath: process.execPath,
                  iconIndex: 0,
                },
                {
                  type: 'task',
                  title: 'Open Documents Folder',
                  program: process.execPath,
                  args: '--open-documents',
                  iconPath: process.execPath,
                  iconIndex: 0,
                },
              ],
            },
          ]);
        }
      } catch (jumpListError) {
        // Silent catch for Jump List setup - Windows-specific feature
        logger.debug(
          '[JUMPLIST] Failed to setup Windows Jump List:',
          jumpListError?.message,
        );
      }
      // Fire-and-forget resume of incomplete batches shortly after window is ready
      setTimeout(() => {
        try {
          const getMainWindow = () => mainWindow;
          resumeIncompleteBatches(serviceIntegration, logger, getMainWindow);
        } catch (e) {
          logger.warn(
            '[RESUME] Failed to schedule resume of incomplete batches:',
            e?.message,
          );
        }
      }, 500);

      // Defer Ollama config loading for better startup performance
      setTimeout(async () => {
        try {
          const cfg = await loadOllamaConfig();
          if (cfg.selectedTextModel)
            await setOllamaModel(cfg.selectedTextModel);
          if (cfg.selectedVisionModel)
            await setOllamaVisionModel(cfg.selectedVisionModel);
          if (cfg.selectedEmbeddingModel)
            await setOllamaEmbeddingModel(cfg.selectedEmbeddingModel);
          logger.info('[STARTUP] Ollama configuration loaded');
        } catch (error) {
          logger.warn('[STARTUP] Failed to load Ollama config:', error.message);
        }
      }, 2000);

      // Install React DevTools in development (opt-in to avoid noisy warnings)
      try {
        if (isDev && process.env.REACT_DEVTOOLS === 'true') {
          const {
            default: installExtension,
            REACT_DEVELOPER_TOOLS,
          } = require('electron-devtools-installer');
          await installExtension(REACT_DEVELOPER_TOOLS).catch(
            (installError) => {
              logger.debug(
                '[DEVTOOLS] Failed to install React DevTools:',
                installError?.message,
              );
            },
          );
        }
      } catch (devToolsError) {
        // Silent catch for dev tools installation - development-only feature
        logger.debug(
          '[DEVTOOLS] Failed to setup React DevTools:',
          devToolsError?.message,
        );
      }

      // Auto-updates (production only)
      try {
        if (!isDev) {
          autoUpdater.autoDownload = true;
          autoUpdater.on('error', (err) =>
            logger.error('[UPDATER] Error:', err),
          );
          autoUpdater.on('update-available', () => {
            logger.info('[UPDATER] Update available');
            try {
              const win = BrowserWindow.getAllWindows()[0];
              if (win && !win.isDestroyed())
                win.webContents.send('app:update', { status: 'available' });
            } catch (updateError) {
              // Silent catch for update notification - window might be destroyed
              logger.debug(
                '[UPDATE] Failed to send update notification:',
                updateError?.message,
              );
            }
          });
          autoUpdater.on('update-not-available', () => {
            logger.info('[UPDATER] No updates available');
            try {
              const win = BrowserWindow.getAllWindows()[0];
              if (win && !win.isDestroyed())
                win.webContents.send('app:update', { status: 'none' });
            } catch (updateError) {
              // Silent catch for update notification - window might be destroyed
              logger.debug(
                '[UPDATE] Failed to send no-update notification:',
                updateError?.message,
              );
            }
          });
          autoUpdater.on('update-downloaded', () => {
            logger.info('[UPDATER] Update downloaded');
            try {
              const win = BrowserWindow.getAllWindows()[0];
              if (win && !win.isDestroyed())
                win.webContents.send('app:update', { status: 'ready' });
            } catch (updateError) {
              // Silent catch for update notification - window might be destroyed
              logger.debug(
                '[UPDATE] Failed to send update-ready notification:',
                updateError?.message,
              );
            }
          });
          autoUpdater
            .checkForUpdatesAndNotify()
            .catch((e) => logger.error('[UPDATER] check failed', e));
        }
      } catch (updaterError) {
        // Silent catch for auto-updater setup - non-critical feature
        logger.debug(
          '[UPDATER] Failed to setup auto-updater:',
          updaterError?.message,
        );
      }
    } catch (error) {
      logger.error('[STARTUP] Failed to initialize:', error);
      createWindow();
    }
  });
}

// ===== APP LIFECYCLE =====
logger.info(
  '[STARTUP] Organizer AI App - Main Process Started with Full AI Features',
);
logger.info('[UI] Modern UI loaded with GPU acceleration');

// App lifecycle
app.on('before-quit', async () => {
  isQuitting = true;
  try {
    systemAnalytics.destroy();
  } catch (destroyError) {
    // Silent catch for analytics cleanup - non-critical during app shutdown
    logger.debug(
      '[ANALYTICS] Failed to destroy system analytics:',
      destroyError?.message,
    );
  }

  // Cleanup embedding services
  try {
    // Cleanup embedding service from IPC registration
    const registerEmbeddingsIpc = require('./ipc/semantic');
    if (
      registerEmbeddingsIpc.embeddingIndex &&
      typeof registerEmbeddingsIpc.embeddingIndex.destroy === 'function'
    ) {
      await registerEmbeddingsIpc.embeddingIndex.destroy();
    }
  } catch (embeddingError) {
    logger.debug(
      '[EMBEDDINGS] Failed to destroy IPC embedding service:',
      embeddingError?.message,
    );
  }

  try {
    // Cleanup shared services from analysis utils
    const { cleanupSharedServices } = require('./analysis/analysisUtils');
    if (typeof cleanupSharedServices === 'function') {
      await cleanupSharedServices();
    }
  } catch (sharedServicesError) {
    logger.debug(
      '[SHARED-SERVICES] Failed to cleanup shared services:',
      sharedServicesError?.message,
    );
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    // Add retry mechanism for window creation
    const createWindowWithRetry = (retries = 2) => {
      try {
        createWindow();
      } catch (error) {
        logger.warn(
          `[WINDOW] Failed to create window (attempt ${3 - retries}/3):`,
          error?.message,
        );
        if (retries > 0) {
          setTimeout(() => createWindowWithRetry(retries - 1), 1000);
        } else {
          logger.error('[WINDOW] Failed to create window after 3 attempts');
          // Show error dialog as last resort
          dialog.showErrorBox(
            'Window Creation Failed',
            'Failed to create the main application window. Please restart the application.',
          );
        }
      }
    };
    createWindowWithRetry();
  }
});

// Smart folders add moved to ipc/smartFolders.js

// SmartFolders LLM enhancement moved to services/SmartFoldersLLMService.js

// Error handling
logger.info('✅ StratoSort main process initialized');

// Add comprehensive error handling (single registration)
process.on('uncaughtException', (error) => {
  logger.error('UNCAUGHT EXCEPTION:', {
    message: error.message,
    stack: error.stack,
  });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('UNHANDLED REJECTION', { reason, promise: String(promise) });
});

// Keep the process alive for debugging
logger.debug(
  '[DEBUG] Process should stay alive. If you see this and the app closes, check for errors above.',
);

// All Analysis History and System metrics handlers are registered via ./ipc/* modules

// ===== TRAY INTEGRATION =====
let tray = null;
function createSystemTray() {
  try {
    const path = require('path');
    const iconPath = path.join(
      __dirname,
      process.platform === 'win32'
        ? '../../assets/icons/icons/win/icon.ico'
        : process.platform === 'darwin'
          ? '../../assets/icons/icons/png/24x24.png'
          : '../../assets/icons/icons/png/16x16.png',
    );
    let trayIcon = nativeImage.createFromPath(iconPath);
    // If the icon is missing or empty, fallback to bundled logo
    if (
      !trayIcon ||
      (typeof trayIcon.isEmpty === 'function' && trayIcon.isEmpty())
    ) {
      const fallback = path.join(
        __dirname,
        '../../../assets/stratosort-logo.png',
      );
      trayIcon = nativeImage.createFromPath(fallback);
    }
    if (
      process.platform === 'darwin' &&
      trayIcon &&
      typeof trayIcon.setTemplateImage === 'function'
    ) {
      trayIcon.setTemplateImage(true);
    }
    tray = new Tray(trayIcon);
    tray.setToolTip('StratoSort');
    updateTrayMenu();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[TRAY] initialization failed', e);
  }
}

function updateTrayMenu() {
  if (!tray) return;
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open StratoSort',
      click: () => {
        const win = BrowserWindow.getAllWindows()[0] || createWindow();
        if (win && win.isMinimized()) win.restore();
        if (win) {
          win.show();
          win.focus();
        }
      },
    },
    {
      label: downloadWatcher ? 'Pause Auto-Sort' : 'Resume Auto-Sort',
      click: async () => {
        const enable = !downloadWatcher;
        try {
          if (settingsService) {
            const merged = await settingsService.save({
              autoOrganize: enable,
            });
            handleSettingsChanged(merged);
          } else {
            handleSettingsChanged({ autoOrganize: enable });
          }
        } catch (err) {
          logger.warn('[TRAY] Failed to toggle auto-sort:', err.message);
        }
        updateTrayMenu();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);
}
