const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { existsSync } = require('fs');
const os = require('os');
const { performance } = require('perf_hooks');
const isDev = process.env.NODE_ENV === 'development';

// Import error handling system
const { 
  AnalysisError, 
  ModelMissingError, 
  FileProcessingError,
  OllamaConnectionError 
} = require('./errors/AnalysisError');

const { scanDirectory } = require('./folderScanner');
const { getOrganizationSuggestions } = require('./llmService');
const { getOllama, getOllamaModel, setOllamaModel, loadOllamaConfig, getOllamaConfigPath } = require('./ollamaUtils');

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
const { setupFileHandlers } = require("./ipc/fileHandlers");
const { setupSmartFolderHandlers, getSmartFolders, setSmartFolders } = require('./ipc/smartFolderHandlers');
let customFolders = []; // Initialize customFolders at module level

// Initialize service integration
let serviceIntegration;

// Persistent storage path for custom folders
const getCustomFoldersPath = () => {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'custom-folders.json');
};

// Load custom folders from persistent storage
async function loadCustomFolders() {
  try {
    const filePath = getCustomFoldersPath();
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.log('[STARTUP] No saved custom folders found, using defaults');
    // Return default smart folders
    return [
      {
        id: 'financial',
        name: 'Financial Documents',
        description: 'Invoices, receipts, tax documents, financial statements, bank records',
        path: null,
        isDefault: true
      },
      {
        id: 'projects',
        name: 'Project Files',
        description: 'Project documentation, proposals, specifications, project plans',
        path: null,
        isDefault: true
      }
    ];
  }
}

// Save custom folders to persistent storage
async function saveCustomFolders(folders) {
  try {
    const filePath = getCustomFoldersPath();
    await fs.writeFile(filePath, JSON.stringify(folders, null, 2));
    console.log('[STORAGE] Saved custom folders to:', filePath);
  } catch (error) {
    console.error('[ERROR] Failed to save custom folders:', error);
  }
}

// System monitoring and analytics
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
      stack: error.stack
    });
    // Keep only last 100 errors
    if (this.errors.length > 100) {
      this.errors = this.errors.slice(-100);
    }
  },

  async collectMetrics() {
    const uptime = Date.now() - this.startTime;
    const avgProcessingTime = this.processedFiles > 0 ? this.totalProcessingTime / this.processedFiles : 0;
    
    // Basic system metrics
    const metrics = {
      uptime,
      processedFiles: this.processedFiles,
      successfulOperations: this.successfulOperations,
      failedOperations: this.failedOperations,
      avgProcessingTime: Math.round(avgProcessingTime),
      errorRate: this.processedFiles > 0 ? (this.failedOperations / this.processedFiles) * 100 : 0,
      recentErrors: this.errors.slice(-10),
      ollamaHealth: this.ollamaHealth
    };

    // Try to get basic Node.js process metrics
    try {
      const memUsage = process.memoryUsage();
      metrics.memory = {
        used: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
        total: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
        rss: Math.round(memUsage.rss / 1024 / 1024) // MB
      };
    } catch (error) {
      console.warn('Could not collect memory metrics:', error.message);
    }

    return metrics;
  },

  getFailureRate() {
    return this.processedFiles > 0 ? (this.failedOperations / this.processedFiles) * 100 : 0;
  },

  destroy() {
    // Cleanup analytics data
    this.errors = [];
    console.log('[ANALYTICS] System analytics cleaned up');
  }
};

// Create the browser window
function createWindow() {
  console.log('[DEBUG] createWindow() called');
  
  // Prevent creating multiple windows
  if (mainWindow && !mainWindow.isDestroyed()) {
    console.log('[DEBUG] Window already exists, focusing...');
    mainWindow.focus();
    return;
  }
  
  console.log('[DEBUG] Creating new window...');
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      enableRemoteModule: false,
      preload: path.join(__dirname, '../preload/preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      // Production optimizations
      backgroundThrottling: false,
      devTools: isDev, // Only enable dev tools in development
      // GPU acceleration settings
      hardwareAcceleration: true,
      enableWebGL: true
    },
    icon: path.join(__dirname, '../../assets/stratosort-logo.png'),
    show: false,
    titleBarStyle: 'default',
    autoHideMenuBar: !isDev // Hide menu bar in production
  });
  
  console.log('[DEBUG] BrowserWindow created');

  // Load the app
  if (isDev) {
    // Try to load from webpack dev server, fallback to built files
    mainWindow.loadURL('http://localhost:3000').catch((error) => {
      console.log('Development server not available:', error.message);
      console.log('Loading from built files instead...');
      const distPath = path.join(__dirname, '../../dist/index.html');
      mainWindow.loadFile(distPath).catch((fileError) => {
        console.error('Failed to load from built files, trying original:', fileError);
        mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
      });
    });
    // Only open dev tools in development mode if explicitly requested
    if (process.env.FORCE_DEV_TOOLS === 'true') {
      mainWindow.webContents.openDevTools();
    }
  } else {
    // In production, load from built files
    const distPath = path.join(__dirname, '../../dist/index.html');
    mainWindow.loadFile(distPath).catch((error) => {
      console.error('Failed to load from dist, falling back:', error);
      mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    });
  }

  // Set additional security headers
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' http://localhost:11434 ws://localhost:*; object-src 'none'; base-uri 'self'; form-action 'self';"
        ]
      }
    });
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus(); // Ensure window is focused
    console.log('✅ StratoSort window ready and focused');
    console.log('[DEBUG] Window state:', {
      isVisible: mainWindow.isVisible(),
      isFocused: mainWindow.isFocused(),
      isMinimized: mainWindow.isMinimized()
    });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const allowedDomains = [
      'https://github.com',
      'https://docs.github.com',
      'https://microsoft.com',
      'https://docs.microsoft.com',
      'https://ollama.ai'
    ];
    
    if (allowedDomains.some(domain => url.startsWith(domain))) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

// ===== IPC HANDLERS =====
// ALL IPC handlers must be registered BEFORE app.whenReady()

// NOTE: Old handle-file-selection handler removed - using IPC_CHANNELS.FILES.SELECT instead

// NOTE: Old select-directory handler removed - using IPC_CHANNELS.FILES.SELECT_DIRECTORY instead
setupFileHandlers(ipcMain, () => mainWindow);
setupSmartFolderHandlers(ipcMain);

// NOTE: Old get-documents-path handler removed - using IPC_CHANNELS.FILES.GET_DOCUMENTS_PATH instead

// NOTE: Old get-file-stats handler removed - using IPC_CHANNELS.FILES.GET_FILE_STATS instead

ipcMain.handle(IPC_CHANNELS.ANALYSIS.ANALYZE_DOCUMENT, async (event, filePath) => {
  try {
    const startTime = performance.now();
    console.log(`[IPC-ANALYSIS] Starting document analysis for: ${filePath}`);
    
    // Check if file exists
    try {
      await fs.access(filePath);
      console.log(`[IPC-ANALYSIS] ✅ File exists: ${filePath}`);
    } catch (accessError) {
      console.error(`[IPC-ANALYSIS] ❌ File not found: ${filePath}`);
      return {
        error: `File not found: ${filePath}`,
        suggestedName: path.basename(filePath, path.extname(filePath)),
        category: 'documents',
        keywords: [],
        confidence: 0
      };
    }
    
    // Get current smart folders to pass to analysis
    const smartFolders = customFolders.filter(f => !f.isDefault || f.path);
    const folderCategories = smartFolders.map(f => ({
      name: f.name,
      description: f.description || '',
      id: f.id
    }));
    
    console.log(`[IPC-ANALYSIS] Using ${folderCategories.length} smart folders for context:`, folderCategories.map(f => f.name).join(', '));
    
    const result = await analyzeDocumentFile(filePath, folderCategories);
    
    const duration = performance.now() - startTime;
    systemAnalytics.recordProcessingTime(duration);
    
    console.log(`[IPC-ANALYSIS] Document analysis completed for: ${filePath}`);
    console.log(`[IPC-ANALYSIS] Result summary:`, {
      success: !result.error,
      category: result.category,
      keywords: result.keywords?.length || 0,
      confidence: result.confidence,
      extractionMethod: result.extractionMethod
    });
    
    return result;
  } catch (error) {
    console.error(`[IPC] Document analysis failed for ${filePath}:`, error);
    systemAnalytics.recordFailure(error);
    return {
      error: error.message,
      suggestedName: path.basename(filePath, path.extname(filePath)),
      category: 'documents',
      keywords: [],
      confidence: 0
    };
  }
});

// Image analysis handler
ipcMain.handle(IPC_CHANNELS.ANALYSIS.ANALYZE_IMAGE, async (event, filePath) => {
  try {
    console.log(`[IPC] Starting image analysis for: ${filePath}`);
    
    // Get current smart folders to pass to analysis
    const smartFolders = customFolders.filter(f => !f.isDefault || f.path);
    const folderCategories = smartFolders.map(f => ({
      name: f.name,
      description: f.description || '',
      id: f.id
    }));
    
    console.log(`[IPC-IMAGE-ANALYSIS] Using ${folderCategories.length} smart folders for context:`, folderCategories.map(f => f.name).join(', '));
    
    const result = await analyzeImageFile(filePath, folderCategories);
    
    console.log(`[IPC-IMAGE-ANALYSIS] Result:`, {
      success: !result.error,
      category: result.category,
      keywords: result.keywords?.length || 0,
      confidence: result.confidence
    });
    
    return result;
  } catch (error) {
    console.error(`[IPC] Image analysis failed for ${filePath}:`, error);
    return {
      error: error.message,
      suggestedName: path.basename(filePath, path.extname(filePath)),
      category: 'images',
      keywords: [],
      confidence: 0
    };
  }
});

// OCR handler
ipcMain.handle(IPC_CHANNELS.ANALYSIS.EXTRACT_IMAGE_TEXT, async (event, filePath) => {
  try {
    const start = performance.now();
    const text = await tesseract.recognize(filePath, { lang: 'eng', oem: 1, psm: 3 });
    const duration = performance.now() - start;
    systemAnalytics.recordProcessingTime(duration);
    return { success: true, text };
  } catch (error) {
    console.error('OCR failed:', error);
    systemAnalytics.recordFailure(error);
    return { success: false, error: error.message };
  }
});

// Audio analysis handlers
ipcMain.handle(IPC_CHANNELS.ANALYSIS.ANALYZE_AUDIO, async (event, filePath) => {
  console.log('[IPC] Audio analysis requested for:', filePath);
  
  try {
    const { analyzeAudioFile } = require('./analysis/ollamaAudioAnalysis');
    const smartFolders = await getSmartFolders();
    
    const startTime = Date.now();
    const result = await analyzeAudioFile(filePath, smartFolders);
    const processingTime = Date.now() - startTime;
    
    systemAnalytics.recordProcessingTime(processingTime);
    systemAnalytics.recordSuccess();
    
    // Record in analysis history
    if (serviceIntegration?.analysisHistory) {
      await serviceIntegration.analysisHistory.recordAnalysis({
        path: filePath,
        size: await getFileSize(filePath),
        lastModified: await getFileModified(filePath),
        mimeType: 'audio/*'
      }, {
        ...result,
        processingTime
      });
    }
    
    console.log(`[IPC] Audio analysis completed in ${processingTime}ms`);
    mainWindow?.webContents.send('analysis-progress', {
      filePath,
      status: 'completed',
      result
    });
    
    return result;
  } catch (error) {
    console.error('[IPC] Audio analysis failed:', error);
    systemAnalytics.recordFailure(error);
    mainWindow?.webContents.send('analysis-error', {
      filePath,
      error: error.message,
      type: 'audio'
    });
    throw error;
  }
});

ipcMain.handle(IPC_CHANNELS.ANALYSIS.TRANSCRIBE_AUDIO, async (event, filePath) => {
  console.log('[IPC] Audio transcription requested for:', filePath);
  
  try {
    const { analyzeAudioFile } = require('./analysis/ollamaAudioAnalysis');
    const result = await analyzeAudioFile(filePath, [], { transcriptOnly: true });
    
    return { 
      success: true, 
      transcript: result.transcript || result.text || result.summary || ''
    };
  } catch (error) {
    console.error('[IPC] Audio transcription failed:', error);
    return { success: false, error: error.message };
  }
});

// Settings handlers
ipcMain.handle(IPC_CHANNELS.SETTINGS.GET, async () => {
  try {
    // Return default settings for now - could be expanded to use a proper settings service
    return {
      theme: 'system',
      autoAnalyze: true,
      concurrentAnalysis: 3,
      smartFolderDefaults: true,
      notifications: true
    };
  } catch (error) {
    console.error('Failed to get settings:', error);
    return {};
  }
});

ipcMain.handle(IPC_CHANNELS.SETTINGS.SAVE, async (event, settings) => {
  try {
    // For now, just return success - could be expanded to persist settings
    console.log('[SETTINGS] Saving settings:', settings);
    return { success: true, settings };
  } catch (error) {
    console.error('Failed to save settings:', error);
    return { success: false, error: error.message };
  }
});

// NOTE: Removed all old-style handlers that have IPC_CHANNELS constant-based duplicates
// This prevents "Attempted to register a second handler" errors
// All functionality is handled by the constant-based handlers above

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
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
    app.commandLine.appendSwitch('enable-gpu-memory-buffer-compositor-resources');
    app.commandLine.appendSwitch('enable-native-gpu-memory-buffers');
    app.commandLine.appendSwitch('ignore-gpu-blacklist');
    app.commandLine.appendSwitch('disable-software-rasterizer');
    
    // Performance optimizations
    app.commandLine.appendSwitch('enable-zero-copy');
    app.commandLine.appendSwitch('enable-hardware-overlays');
    
    console.log('[PRODUCTION] GPU acceleration optimizations enabled');
  } else {
    console.log('[DEVELOPMENT] GPU acceleration using default settings');
  }

  // Initialize services after app is ready
  app.whenReady().then(async () => {
    try {
      // Load custom folders
      customFolders = await loadCustomFolders();
      console.log('[STARTUP] Loaded custom folders:', customFolders.length, 'folders');
      
      // Initialize service integration
      serviceIntegration = new ServiceIntegration();
      setSmartFolders(customFolders);
      await serviceIntegration.initialize();
      console.log('[MAIN] Service integration initialized successfully');
      
      // Verify AI models on startup
      const { ModelVerifier } = require('./services/ModelVerifier');
      const modelVerifier = new ModelVerifier();
      const modelStatus = await modelVerifier.verifyEssentialModels();
      
      if (!modelStatus.success) {
        console.warn('[STARTUP] Missing AI models detected:', modelStatus.missingModels);
        console.log('[STARTUP] Install missing models:');
        modelStatus.installationCommands.forEach(cmd => console.log('  ', cmd));
      } else {
        console.log('[STARTUP] ✅ All essential AI models verified and ready');
        if (modelStatus.hasWhisper) {
          console.log('[STARTUP] ✅ Whisper model available for audio analysis');
        }
      }
      
      createWindow();
      
      // Load Ollama config
      await loadOllamaConfig();
      console.log('[STARTUP] Ollama configuration loaded');
      
    } catch (error) {
      console.error('[STARTUP] Failed to initialize:', error);
      createWindow();
    }
  });
}

// ===== APP LIFECYCLE =====
console.log('[STARTUP] Organizer AI App - Main Process Started with Full AI Features');
console.log('[UI] Modern UI loaded with GPU acceleration');

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

}

// Error handling
process.on('uncaughtException', (error) => {

// Add comprehensive error handling
process.on('uncaughtException', (error) => {
  console.error('🔥 UNCAUGHT EXCEPTION:', error);
  console.error('Stack:', error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

// Keep the process alive for debugging
console.log('[DEBUG] Process should stay alive. If you see this and the app closes, check for errors above.');

// Analysis History handlers
ipcMain.handle(IPC_CHANNELS.ANALYSIS_HISTORY.GET, async (event, options = {}) => {
  try {
    const limit = options.limit || 50;
    return await serviceIntegration?.analysisHistory?.getRecentAnalysis(limit) || [];
  } catch (error) {
    console.error('Failed to get analysis history:', error);
    return [];
  }
});

ipcMain.handle(IPC_CHANNELS.ANALYSIS_HISTORY.SEARCH, async (event, query = '', options = {}) => {
  try {
    return await serviceIntegration?.analysisHistory?.searchAnalysis(query, options) || [];
  } catch (error) {
    console.error('Failed to search analysis history:', error);
    return [];
  }
});

ipcMain.handle(IPC_CHANNELS.ANALYSIS_HISTORY.GET_FILE_HISTORY, async (event, filePath) => {
  try {
    return await serviceIntegration?.analysisHistory?.getAnalysisByPath(filePath) || null;
  } catch (error) {
    console.error('Failed to get file analysis history:', error);
    return null;
  }
});

ipcMain.handle(IPC_CHANNELS.ANALYSIS_HISTORY.CLEAR, async () => {
  try {
    await serviceIntegration?.analysisHistory?.createDefaultStructures();
    return { success: true };
  } catch (error) {
    console.error('Failed to clear analysis history:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle(IPC_CHANNELS.ANALYSIS_HISTORY.EXPORT, async (event, format = 'json') => {
  try {
    const history = await serviceIntegration?.analysisHistory?.getRecentAnalysis(10000) || [];
    if (format === 'json') {
      return { success: true, data: JSON.stringify(history, null, 2) };
    }
    // Future: handle csv or other formats
    return { success: true, data: history };
  } catch (error) {
    console.error('Failed to export analysis history:', error);
    return { success: false, error: error.message };
  }
});

// System metrics handler
ipcMain.handle(IPC_CHANNELS.SYSTEM.GET_METRICS, async () => {
  try {
    return await systemAnalytics.collectMetrics();
  } catch (error) {
    console.error('Failed to collect system metrics:', error);
    return {};
  }
});

// Audio analysis handler REMOVED - audio analysis disabled
// ipcMain.handle(IPC_CHANNELS.ANALYSIS.ANALYZE_AUDIO, async (event, filePath) => {
//   try {
//     console.log(`[IPC-AUDIO-ANALYSIS] Starting audio analysis for: ${filePath}`);
//     
//     // Get current smart folders to pass to analysis
//     const smartFolders = customFolders.filter(f => !f.isDefault || f.path);
//     const folderCategories = smartFolders.map(f => ({
//       name: f.name,
//       description: f.description || '',
//       id: f.id
//     }));
//     
//     console.log(`[IPC-AUDIO-ANALYSIS] Using ${folderCategories.length} smart folders for context:`, folderCategories.map(f => f.name).join(', '));
//     
//     const result = await analyzeAudioFile(filePath, folderCategories);
//     
//     console.log(`[IPC-AUDIO-ANALYSIS] Result:`, {
//       success: !result.error,
//       category: result.category,
//       keywords: result.keywords?.length || 0,
//       confidence: result.confidence,
//       has_transcription: result.has_transcription
//     });
//     
//     return result;
//   } catch (error) {
//     console.error(`[IPC] Audio analysis failed for ${filePath}:`, error);
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
