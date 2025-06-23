const path = require('path');

const { contextBridge, ipcRenderer } = require('electron');

// Load constants path (relative to preload script)
const constantsPath = path.resolve(__dirname, '../shared/constants.js');
const { IPC_CHANNELS } = require(constantsPath);

// Debug mode check
const DEBUG_MODE = process.env.NODE_ENV === 'development';

if (DEBUG_MODE) {
  console.log('[PRELOAD] Secure preload script loaded');
}

// Dynamically derive allowed send channels from centralized IPC_CHANNELS to prevent drift
const ALLOWED_CHANNELS = {
  FILES: Object.values(IPC_CHANNELS.FILES),
  SMART_FOLDERS: Object.values(IPC_CHANNELS.SMART_FOLDERS),
  ANALYSIS: Object.values(IPC_CHANNELS.ANALYSIS),
  SETTINGS: Object.values(IPC_CHANNELS.SETTINGS),
  OLLAMA: Object.values(IPC_CHANNELS.OLLAMA),
  UNDO_REDO: Object.values(IPC_CHANNELS.UNDO_REDO),
  ANALYSIS_HISTORY: Object.values(IPC_CHANNELS.ANALYSIS_HISTORY),

  SYSTEM: Object.values(IPC_CHANNELS.SYSTEM),
  // Renderer still needs basic file-action helpers that are not request/response pairs
  FILE_ACTIONS: ['open-file', 'reveal-file', 'copy-file', 'open-folder']
};

const ALLOWED_RECEIVE_CHANNELS = [
  'system-metrics',
  'analysis-progress',
  'analysis-error',
  'operation-progress'
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
    const channelData = this.rateLimiter.get(channel) || { count: 0, resetTime: now + 1000 };
    
    if (now > channelData.resetTime) {
      channelData.count = 1;
      channelData.resetTime = now + 1000;
    } else {
      channelData.count++;
    }
    
    this.rateLimiter.set(channel, channelData);
    
    if (channelData.count > this.maxRequestsPerSecond) {
      const resetIn = Math.ceil((channelData.resetTime - now) / 1000);
      throw new Error(`Rate limit exceeded for channel: ${channel}. Please wait ${resetIn}s before retrying. Consider reducing concurrent requests.`);
    }
    
    return true;
  }

  /**
   * Safe IPC invoke with channel validation and error handling
   */
  async safeInvoke(channel, ...args) {
    // Validate channel is in allowed list - properly flatten nested channel objects
    const allowedChannels = this.getAllowedChannels();
    if (!allowedChannels.includes(channel)) {
      if (DEBUG_MODE) {
        console.warn(`[PRELOAD] Blocked invoke to unauthorized channel: ${channel}`);
      }
      throw new Error(`Unauthorized IPC channel: ${channel}`);
    }
    
    try {
      // Sanitize arguments to prevent potential attacks
      const sanitizedArgs = args.map(arg => 
        typeof arg === 'string' && arg.length > 10000 ? arg.substring(0, 10000) : arg
      );
      
      if (DEBUG_MODE) {
        console.log(`[PRELOAD] Secure invoke: ${channel}`, sanitizedArgs.length > 0 ? '[with args]' : '');
      }
      
      const result = await ipcRenderer.invoke(channel, ...sanitizedArgs);
      return result;
    } catch (error) {
      if (DEBUG_MODE) {
        console.error(`[PRELOAD] IPC invoke error for ${channel}:`, error.message);
      }
      throw error;
    }
  }

  /**
   * Safe IPC listener with validation
   */
  safeOn(channel, callback) {
    const allowedChannels = this.getAllowedChannels();
    if (!allowedChannels.includes(channel)) {
      if (DEBUG_MODE) {
        console.warn(`[PRELOAD] Blocked listener on unauthorized channel: ${channel}`);
      }
      return;
    }
    
    // Wrap callback with security validation
    const wrappedCallback = (event, ...args) => {
      // Validate event source
      if (!event || !event.sender) {
        if (DEBUG_MODE) {
          console.warn(`[PRELOAD] Rejected event from invalid source on channel: ${channel}`);
        }
        return;
      }
      
      try {
        // Special validation for system metrics
        if (channel === IPC_CHANNELS.SYSTEM.METRICS && args[0]) {
          const data = args[0];
          if (!data || typeof data !== 'object' || 
              typeof data.cpu !== 'number' || 
              typeof data.memory !== 'number') {
            if (DEBUG_MODE) {
              console.warn('[PRELOAD] Invalid system-metrics data rejected');
            }
            return;
          }
        }
        
        callback(event, ...args);
      } catch (error) {
        if (DEBUG_MODE) {
          console.error(`[PRELOAD] Error in ${channel} event handler:`, error);
        }
      }
    };

    ipcRenderer.on(channel, wrappedCallback);
    
    // Track listener for cleanup
    const listenerKey = `${channel}_${Date.now()}`;
    this.activeListeners.set(listenerKey, { channel, callback: wrappedCallback });

    // Return cleanup function
    return () => {
      ipcRenderer.removeListener(channel, wrappedCallback);
      this.activeListeners.delete(listenerKey);
    };
  }

  /**
   * Get all allowed IPC channels by properly flattening nested objects
   */
  getAllowedChannels() {
    const channels = [];
    
    function flattenChannels(obj) {
      for (const value of Object.values(obj)) {
        if (typeof value === 'string') {
          channels.push(value);
        } else if (Array.isArray(value)) {
          // Handle arrays of strings (like FILE_ACTIONS)
          channels.push(...value);
        } else if (typeof value === 'object' && value !== null) {
          flattenChannels(value);
        }
      }
    }
    
    // Process both IPC_CHANNELS and ALLOWED_CHANNELS
    flattenChannels(IPC_CHANNELS);
    flattenChannels(ALLOWED_CHANNELS);
    
    // Remove duplicates and return
    return [...new Set(channels)];
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
    return args.map((arg) => {
      if (typeof arg === 'string') {
        // Basic XSS prevention
        return arg.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      }
      if (typeof arg === 'object' && arg !== null) {
        // Deep sanitization for objects
        return this.sanitizeObject(arg);
      }
      return arg;
    });
  }

  /**
   * Deep sanitization for objects
   */
  sanitizeObject(obj) {
    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeObject(item));
    }
    
    if (typeof obj === 'object' && obj !== null) {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        const cleanKey = key.replace(/[<>'"]/g, '');
        sanitized[cleanKey] = this.sanitizeObject(value);
      }
      return sanitized;
    }
    
    if (typeof obj === 'string') {
      return obj.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    }
    
    return obj;
  }

  /**
   * Validate system metrics data structure
   */
  isValidSystemMetrics(data) {
    return data && 
           typeof data === 'object' &&
           Array.isArray(data.cpu) &&
           Array.isArray(data.memory) &&
           typeof data.analysisQueue === 'number';
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
        return typeof result === 'string' || result === null ? result : null;
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
    for (const [key, { channel, callback }] of this.activeListeners) {
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
    selectDirectory: () => secureIPC.safeInvoke(IPC_CHANNELS.FILES.SELECT_DIRECTORY),
    getDocumentsPath: () => secureIPC.safeInvoke(IPC_CHANNELS.FILES.GET_DOCUMENTS_PATH),
    createFolder: (fullPath) => secureIPC.safeInvoke(IPC_CHANNELS.FILES.CREATE_FOLDER_DIRECT, fullPath),
    getStats: (filePath) => secureIPC.safeInvoke(IPC_CHANNELS.FILES.GET_FILE_STATS, filePath),
    getDirectoryContents: (dirPath) => secureIPC.safeInvoke(IPC_CHANNELS.FILES.GET_FILES_IN_DIRECTORY, dirPath),
    organize: (operations) => secureIPC.safeInvoke(IPC_CHANNELS.FILES.PERFORM_OPERATION, { type: 'batch_organize', operations }),
    performOperation: (operations) => secureIPC.safeInvoke(IPC_CHANNELS.FILES.PERFORM_OPERATION, operations),
    executeBatchOperations: (operations) => secureIPC.safeInvoke(IPC_CHANNELS.FILES.PERFORM_OPERATION, { type: 'batch', operations }),
    delete: (filePath) => secureIPC.safeInvoke(IPC_CHANNELS.FILES.DELETE_FILE, filePath),
    // Add missing file operations that the UI is calling
    open: (filePath) => secureIPC.safeInvoke(IPC_CHANNELS.FILES.OPEN_FILE, filePath),
    reveal: (filePath) => secureIPC.safeInvoke(IPC_CHANNELS.FILES.REVEAL_IN_FOLDER, filePath),
    copy: (sourcePath, destinationPath) => secureIPC.safeInvoke(IPC_CHANNELS.FILES.COPY_FILE, sourcePath, destinationPath),
    deleteFolder: (folderPath) => secureIPC.safeInvoke(IPC_CHANNELS.FILES.DELETE_FOLDER, folderPath),
    openFolder: (folderPath) => secureIPC.safeInvoke(IPC_CHANNELS.FILES.OPEN_FOLDER, folderPath),
    // Add file analysis method that routes to appropriate analyzer
    analyze: (filePath) => {
      // Determine file type and route to appropriate analyzer
      const ext = filePath.split('.').pop()?.toLowerCase();
      const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
      // const audioExts = ['mp3', 'wav', 'flac', 'ogg', 'aac', 'm4a']; // REMOVED - audio analysis disabled
      
      if (imageExts.includes(ext)) {
        return secureIPC.safeInvoke(IPC_CHANNELS.ANALYSIS.ANALYZE_IMAGE, filePath);
      } else {
        // Audio analysis removed - all non-image files go to document analysis
        return secureIPC.safeInvoke(IPC_CHANNELS.ANALYSIS.ANALYZE_DOCUMENT, filePath);
      }
    }
  },

  // Smart Folders
  smartFolders: {
    get: () => secureIPC.safeInvoke(IPC_CHANNELS.SMART_FOLDERS.GET),
    save: (folders) => secureIPC.safeInvoke(IPC_CHANNELS.SMART_FOLDERS.SAVE, folders),
    updateCustom: (folders) => secureIPC.safeInvoke(IPC_CHANNELS.SMART_FOLDERS.UPDATE_CUSTOM, folders),
    getCustom: () => secureIPC.safeInvoke(IPC_CHANNELS.SMART_FOLDERS.GET_CUSTOM),
    scanStructure: (rootPath) => secureIPC.safeInvoke(IPC_CHANNELS.SMART_FOLDERS.SCAN_STRUCTURE, rootPath),
    add: (folder) => secureIPC.safeInvoke(IPC_CHANNELS.SMART_FOLDERS.ADD, folder),
    edit: (folderId, updatedFolder) => secureIPC.safeInvoke(IPC_CHANNELS.SMART_FOLDERS.EDIT, folderId, updatedFolder),
    delete: (folderId) => secureIPC.safeInvoke(IPC_CHANNELS.SMART_FOLDERS.DELETE, folderId)
  },

  // Analysis
  analysis: {
    document: (filePath) => secureIPC.safeInvoke(IPC_CHANNELS.ANALYSIS.ANALYZE_DOCUMENT, filePath),
    image: (filePath) => secureIPC.safeInvoke(IPC_CHANNELS.ANALYSIS.ANALYZE_IMAGE, filePath),
    // audio: (filePath) => secureIPC.safeInvoke(IPC_CHANNELS.ANALYSIS.ANALYZE_AUDIO, filePath), // REMOVED - audio analysis disabled
    extractText: (filePath) => secureIPC.safeInvoke(IPC_CHANNELS.ANALYSIS.EXTRACT_IMAGE_TEXT, filePath)
    // transcribe: (filePath) => secureIPC.safeInvoke(IPC_CHANNELS.ANALYSIS.TRANSCRIBE_AUDIO, filePath) // REMOVED - audio analysis disabled
  },

  // Analysis History
  analysisHistory: {
    get: (options) => secureIPC.safeInvoke(IPC_CHANNELS.ANALYSIS_HISTORY.GET, options),
    search: (query, options) => secureIPC.safeInvoke(IPC_CHANNELS.ANALYSIS_HISTORY.SEARCH, query, options),
    getStatistics: () => secureIPC.safeInvoke(IPC_CHANNELS.ANALYSIS_HISTORY.GET_STATISTICS),
    getFileHistory: (filePath) => secureIPC.safeInvoke(IPC_CHANNELS.ANALYSIS_HISTORY.GET_FILE_HISTORY, filePath),
    clear: () => secureIPC.safeInvoke(IPC_CHANNELS.ANALYSIS_HISTORY.CLEAR),
    export: (format) => secureIPC.safeInvoke(IPC_CHANNELS.ANALYSIS_HISTORY.EXPORT, format)
  },

  // Undo/Redo System
  undoRedo: {
    undo: () => secureIPC.safeInvoke(IPC_CHANNELS.UNDO_REDO.UNDO),
    redo: () => secureIPC.safeInvoke(IPC_CHANNELS.UNDO_REDO.REDO),
    getHistory: (limit) => secureIPC.safeInvoke(IPC_CHANNELS.UNDO_REDO.GET_HISTORY, limit),
    clear: () => secureIPC.safeInvoke(IPC_CHANNELS.UNDO_REDO.CLEAR_HISTORY),
    canUndo: () => secureIPC.safeInvoke(IPC_CHANNELS.UNDO_REDO.CAN_UNDO),
    canRedo: () => secureIPC.safeInvoke(IPC_CHANNELS.UNDO_REDO.CAN_REDO)
  },

  // System Monitoring (only metrics and app statistics currently implemented)
  system: {
    getMetrics: () => secureIPC.safeInvoke(IPC_CHANNELS.SYSTEM.GET_METRICS),
    getApplicationStatistics: () => secureIPC.safeInvoke(IPC_CHANNELS.SYSTEM.GET_APPLICATION_STATISTICS),
    scanCommonDirectories: () => secureIPC.safeInvoke(IPC_CHANNELS.SYSTEM.SCAN_COMMON_DIRECTORIES)
  },

  // Ollama (only implemented endpoints)
  ollama: {
    getModels: () => secureIPC.safeInvoke(IPC_CHANNELS.OLLAMA.GET_MODELS),
    testConnection: (hostUrl) => secureIPC.safeInvoke(IPC_CHANNELS.OLLAMA.TEST_CONNECTION, hostUrl),
    setModel: (modelName) => secureIPC.safeInvoke(IPC_CHANNELS.OLLAMA.SET_MODEL, modelName)
  },

  // Event Listeners (with automatic cleanup)
  events: {
    onAnalysisProgress: (callback) => secureIPC.safeOn('analysis-progress', callback),
    onAnalysisError: (callback) => secureIPC.safeOn('analysis-error', callback),
    onOperationProgress: (callback) => secureIPC.safeOn('operation-progress', callback)
  },

  // Settings
  settings: {
    get: () => secureIPC.safeInvoke(IPC_CHANNELS.SETTINGS.GET),
    save: (settings) => secureIPC.safeInvoke(IPC_CHANNELS.SETTINGS.SAVE, settings)
  }
});

// Legacy compatibility layer (deprecated but maintained for migration)
contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    invoke: (channel, ...args) => {
      console.warn('[PRELOAD] Using deprecated electron.ipcRenderer.invoke - migrate to window.electronAPI');
      return secureIPC.safeInvoke(channel, ...args);
    },
    on: (channel, callback) => {
      console.warn('[PRELOAD] Using deprecated electron.ipcRenderer.on - migrate to window.electronAPI.events');
      return secureIPC.safeOn(channel, callback);
    }
  }
});

  if (DEBUG_MODE) {
    console.log('[PRELOAD] Secure context bridge exposed with structured API');
  } 