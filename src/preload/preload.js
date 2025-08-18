const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');
const sanitizeHtml = require('sanitize-html');

console.log('[PRELOAD] Secure preload script loaded');

// Import centralized IPC channel map using an absolute path to avoid resolution issues when the preload is bundled or moved
const constantsPath = path.resolve(__dirname, '..', 'shared', 'constants.js');
const { IPC_CHANNELS } = require(constantsPath);

// Dynamically derive allowed send channels from centralized IPC_CHANNELS to prevent drift
const ALLOWED_CHANNELS = {
  FILES: Object.values(IPC_CHANNELS.FILES),
  SMART_FOLDERS: Object.values(IPC_CHANNELS.SMART_FOLDERS),
  ANALYSIS: Object.values(IPC_CHANNELS.ANALYSIS),
  SETTINGS: Object.values(IPC_CHANNELS.SETTINGS),
  OLLAMA: Object.values(IPC_CHANNELS.OLLAMA),
  UNDO_REDO: Object.values(IPC_CHANNELS.UNDO_REDO),
  ANALYSIS_HISTORY: Object.values(IPC_CHANNELS.ANALYSIS_HISTORY),
  EMBEDDINGS: Object.values(IPC_CHANNELS.EMBEDDINGS),
  SYSTEM: Object.values(IPC_CHANNELS.SYSTEM),
  WINDOW: Object.values(IPC_CHANNELS.WINDOW || {}),
};

const ALLOWED_RECEIVE_CHANNELS = [
  'system-metrics',
  'operation-progress',
  'app:error',
  'app:update',
];

// Flatten allowed send channels for validation
const ALL_SEND_CHANNELS = Object.values(ALLOWED_CHANNELS).flat();

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

      // Argument sanitization
      const sanitizedArgs = this.sanitizeArguments(args);

      console.log(
        `[PRELOAD] Secure invoke: ${channel}`,
        sanitizedArgs.length > 0 ? '[with args]' : '',
      );

      const result = await ipcRenderer.invoke(channel, ...sanitizedArgs);

      // Result validation
      return this.validateResult(result, channel);
    } catch (error) {
      console.error(
        `[PRELOAD] IPC invoke error for ${channel}:`,
        error.message,
      );
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
   * Cleanup all active listeners
   */
  cleanup() {
    for (const [_key, { channel, callback }] of this.activeListeners) {
      ipcRenderer.removeListener(channel, callback);
    }
    this.activeListeners.clear();
    console.log('[PRELOAD] All IPC listeners cleaned up');
  }
}

// Initialize secure IPC manager
const secureIPC = new SecureIPCManager();

// Cleanup on window unload
window.addEventListener('beforeunload', () => {
  secureIPC.cleanup();
});

// Expose secure, typed API through context bridge
contextBridge.exposeInMainWorld('electronAPI', {
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
        return path.normalize(p);
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

  // System Monitoring (only metrics and app statistics currently implemented)
  system: {
    getMetrics: () => secureIPC.safeInvoke(IPC_CHANNELS.SYSTEM.GET_METRICS),
    getApplicationStatistics: () =>
      secureIPC.safeInvoke(IPC_CHANNELS.SYSTEM.GET_APPLICATION_STATISTICS),
    applyUpdate: () =>
      IPC_CHANNELS.SYSTEM.APPLY_UPDATE
        ? secureIPC.safeInvoke(IPC_CHANNELS.SYSTEM.APPLY_UPDATE)
        : undefined,
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
  },

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
