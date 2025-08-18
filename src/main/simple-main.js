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
// const { performance } = require('perf_hooks'); // no longer used
const isDev = process.env.NODE_ENV === 'development';

// Logging utility
const { logger } = require('../shared/logger');

// Import error handling system (not needed directly in this file)

const { scanDirectory } = require('./folderScanner');
// const { getOrganizationSuggestions } = require('./llmService'); // not used currently
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
// const ModelManager = require('./services/ModelManager'); // not used currently
const { buildOllamaOptions } = require('./services/PerformanceService');
const SettingsService = require('./services/SettingsService');

// Import service integration
const ServiceIntegration = require('./services/ServiceIntegration');

// Import shared constants
const { IPC_CHANNELS } = require('../shared/constants');

// Import services
const { analyzeDocumentFile } = require('./analysis/ollamaDocumentAnalysis');
const { analyzeImageFile } = require('./analysis/ollamaImageAnalysis');
// Audio analysis removed - const { analyzeAudioFile } = require('./analysis/ollamaAudioAnalysis');

// Import OCR library
const tesseract = require('node-tesseract-ocr');

let mainWindow;
let customFolders = []; // Initialize customFolders at module level

// Initialize service integration
let serviceIntegration;
let settingsService;

// Custom folders helpers
const {
  loadCustomFolders,
  saveCustomFolders,
} = require('./core/customFolders');

// System monitoring and analytics
const systemAnalytics = require('./core/systemAnalytics');

// Window creation
const createMainWindow = require('./core/createWindow');
function createWindow() {
  logger.debug('[DEBUG] createWindow() called');
  if (mainWindow && !mainWindow.isDestroyed()) {
    logger.debug('[DEBUG] Window already exists, focusing...');
    mainWindow.focus();
    return;
  }
  mainWindow = createMainWindow();
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
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
    // Someone tried to run a second instance, focus our window instead
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
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
    app.commandLine.appendSwitch('ignore-gpu-blacklist');
    app.commandLine.appendSwitch('disable-software-rasterizer');

    // Performance optimizations
    app.commandLine.appendSwitch('enable-zero-copy');
    app.commandLine.appendSwitch('enable-hardware-overlays');
    app.commandLine.appendSwitch(
      'enable-features',
      'Vulkan,CanvasOopRasterization,UseSkiaRenderer,VaapiVideoDecoder,VaapiVideoEncoder',
    );

    logger.info('[PRODUCTION] GPU acceleration optimizations enabled');
  } else {
    // Even in dev, prefer GPU acceleration where possible
    app.commandLine.appendSwitch('enable-gpu-rasterization');
    app.commandLine.appendSwitch('enable-zero-copy');
    app.commandLine.appendSwitch(
      'enable-features',
      'Vulkan,CanvasOopRasterization,UseSkiaRenderer',
    );
    logger.info('[DEVELOPMENT] GPU acceleration flags enabled for development');
  }

  // Initialize services after app is ready
  app.whenReady().then(async () => {
    try {
      // Load custom folders
      customFolders = await loadCustomFolders();
      logger.info(
        '[STARTUP] Loaded custom folders:',
        customFolders.length,
        'folders',
      );

      // Initialize service integration
      serviceIntegration = new ServiceIntegration();
      await serviceIntegration.initialize();
      logger.info('[MAIN] Service integration initialized successfully');
      // Initialize settings service
      settingsService = new SettingsService();

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

      // Verify AI models on startup
      const ModelVerifier = require('./services/ModelVerifier');
      const modelVerifier = new ModelVerifier();
      const modelStatus = await modelVerifier.verifyEssentialModels();

      if (!modelStatus.success) {
        logger.warn(
          '[STARTUP] Missing AI models detected:',
          modelStatus.missingModels,
        );
        logger.info('[STARTUP] Install missing models:');
        modelStatus.installationCommands.forEach((cmd) =>
          logger.info('  ', cmd),
        );
      } else {
        logger.info('[STARTUP] ✅ All essential AI models verified and ready');
        if (modelStatus.hasWhisper) {
          logger.info(
            '[STARTUP] ✅ Whisper model available for audio analysis',
          );
        }
      }

      // Register IPC groups now that services and state are ready
      const getMainWindow = () => mainWindow;
      const getServiceIntegration = () => serviceIntegration;
      const getCustomFolders = () => customFolders;
      const setCustomFolders = (folders) => {
        customFolders = folders;
      };

      // Grouped IPC registration (single entry)
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
      });

      createWindow();
      // Start periodic system metrics broadcast to renderer
      try {
        setInterval(async () => {
          try {
            const win = BrowserWindow.getAllWindows()[0];
            if (!win || win.isDestroyed()) return;
            const metrics = await systemAnalytics.collectMetrics();
            win.webContents.send('system-metrics', metrics);
          } catch {}
        }, 10000);
      } catch {}
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
          } catch {}
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
            } catch {}
          }
        }
      } catch {}
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
      } catch {}
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

      // Load Ollama config and apply any saved selections
      const cfg = await loadOllamaConfig();
      if (cfg.selectedTextModel) await setOllamaModel(cfg.selectedTextModel);
      if (cfg.selectedVisionModel)
        await setOllamaVisionModel(cfg.selectedVisionModel);
      if (cfg.selectedEmbeddingModel)
        await setOllamaEmbeddingModel(cfg.selectedEmbeddingModel);
      logger.info('[STARTUP] Ollama configuration loaded');

      // Install React DevTools in development (opt-in to avoid noisy warnings)
      try {
        if (isDev && process.env.REACT_DEVTOOLS === 'true') {
          const {
            default: installExtension,
            REACT_DEVELOPER_TOOLS,
          } = require('electron-devtools-installer');
          await installExtension(REACT_DEVELOPER_TOOLS).catch(() => {});
        }
      } catch {}

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
            } catch {}
          });
          autoUpdater.on('update-not-available', () => {
            logger.info('[UPDATER] No updates available');
            try {
              const win = BrowserWindow.getAllWindows()[0];
              if (win && !win.isDestroyed())
                win.webContents.send('app:update', { status: 'none' });
            } catch {}
          });
          autoUpdater.on('update-downloaded', () => {
            logger.info('[UPDATER] Update downloaded');
            try {
              const win = BrowserWindow.getAllWindows()[0];
              if (win && !win.isDestroyed())
                win.webContents.send('app:update', { status: 'ready' });
            } catch {}
          });
          autoUpdater
            .checkForUpdatesAndNotify()
            .catch((e) => logger.error('[UPDATER] check failed', e));
        }
      } catch {}
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
app.on('window-all-closed', () => {
  systemAnalytics.destroy();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  systemAnalytics.destroy();
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

// Audio analysis handler REMOVED - audio analysis disabled
// ipcMain.handle(IPC_CHANNELS.ANALYSIS.ANALYZE_AUDIO, async (event, filePath) => {
//   try {
//     logger.info(`[IPC-AUDIO-ANALYSIS] Starting audio analysis for: ${filePath}`);
//
//     // Get current smart folders to pass to analysis
//     const smartFolders = customFolders.filter(f => !f.isDefault || f.path);
//     const folderCategories = smartFolders.map(f => ({
//       name: f.name,
//       description: f.description || '',
//       id: f.id
//     }));
//
//     logger.info(`[IPC-AUDIO-ANALYSIS] Using ${folderCategories.length} smart folders for context:`, folderCategories.map(f => f.name).join(', '));
//
//     const result = await analyzeAudioFile(filePath, folderCategories);
//
//     logger.info(`[IPC-AUDIO-ANALYSIS] Result:`, {
//       success: !result.error,
//       category: result.category,
//       keywords: result.keywords?.length || 0,
//       confidence: result.confidence,
//       has_transcription: result.has_transcription
//     });
//
//     return result;
//   } catch (error) {
//     logger.error(`[IPC] Audio analysis failed for ${filePath}:`, error);
//     return {
//       error: error.message,
//       suggestedName: path.basename(filePath, path.extname(filePath)),
//       category: 'audio',
//       keywords: [],
//       confidence: 0,
//       has_transcription: false
//     };
//   }
// });

// NOTE: Duplicate TRANSCRIBE_AUDIO handler removed to prevent registration error

// ===== TRAY INTEGRATION =====
let tray = null;
function createSystemTray() {
  try {
    const iconPath = require('path').join(
      __dirname,
      '../../assets/icons/icons/win/icon.ico',
    );
    const trayIcon = nativeImage.createFromPath(iconPath);
    tray = new Tray(trayIcon);
    tray.setToolTip('StratoSort');
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
        label: 'Analyze Folder…',
        click: async () => {
          const win = BrowserWindow.getAllWindows()[0] || createWindow();
          if (win && win.isMinimized()) win.restore();
          if (win) {
            win.show();
            win.focus();
          }
          try {
            const { canceled, filePaths } = await dialog.showOpenDialog(win, {
              properties: ['openDirectory', 'dontAddToRecent'],
            });
            if (!canceled && filePaths && filePaths[0]) {
              win.webContents.send('operation-progress', {
                type: 'hint',
                message: `Selected folder: ${filePaths[0]}`,
              });
            }
          } catch {}
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.quit();
        },
      },
    ]);
    tray.setContextMenu(contextMenu);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[TRAY] initialization failed', e);
  }
}
