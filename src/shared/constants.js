/**
 * Shared Constants
 * Constants used across main and renderer processes
 */

// ===== STRATOSORT SHARED CONSTANTS =====

// Application phases - centralized for consistency
const PHASES = {
  WELCOME: 'welcome',
  SETUP: 'setup',
  DISCOVER: 'discover',
  ORGANIZE: 'organize',
  COMPLETE: 'complete'
};

// Phase transition rules - defines valid navigation paths
const PHASE_TRANSITIONS = {
  [PHASES.WELCOME]: [PHASES.SETUP, PHASES.DISCOVER],
  [PHASES.SETUP]: [PHASES.DISCOVER, PHASES.WELCOME],
  [PHASES.DISCOVER]: [PHASES.ORGANIZE, PHASES.SETUP],
  [PHASES.ORGANIZE]: [PHASES.COMPLETE, PHASES.DISCOVER],
  [PHASES.COMPLETE]: [PHASES.WELCOME, PHASES.ORGANIZE, PHASES.DISCOVER] // Allow going back without losing data
};

// Phase metadata for UI display
const PHASE_METADATA = {
  [PHASES.WELCOME]: { title: 'Welcome to StratoSort', icon: '🚀', progress: 0 },
  [PHASES.SETUP]: { title: 'Configure Smart Folders', icon: '⚙️', progress: 20 },
  [PHASES.DISCOVER]: { title: 'Discover & Analyze Files', icon: '🔍', progress: 50 },
  [PHASES.ORGANIZE]: { title: 'Review & Organize', icon: '📂', progress: 80 },
  [PHASES.COMPLETE]: { title: 'Organization Complete', icon: '✅', progress: 100 }
};

// IPC Channel constants - centralized to avoid magic strings
const IPC_CHANNELS = {
  // File Operations
  FILES: {
    SELECT: 'handle-file-selection',
    SELECT_DIRECTORY: 'select-directory',
    GET_DOCUMENTS_PATH: 'get-documents-path',
    CREATE_FOLDER: 'create-folder',
    CREATE_FOLDER_DIRECT: 'create-folder-direct',
    GET_FILE_STATS: 'get-file-stats',
    GET_FILES_IN_DIRECTORY: 'get-files-in-directory',
    DELETE_FOLDER: 'delete-folder',
    DELETE_FILE: 'delete-file',
    OPEN_FILE: 'open-file',
    REVEAL_FILE: 'reveal-file',
    COPY_FILE: 'copy-file',
    OPEN_FOLDER: 'open-folder',
    PERFORM_OPERATION: 'perform-file-operation'
  },
  
  // Smart Folders
  SMART_FOLDERS: {
    GET: 'get-smart-folders',
    GET_CUSTOM: 'get-custom-folders',
    SAVE: 'save-smart-folders',
    UPDATE_CUSTOM: 'update-custom-folders',
    SCAN_STRUCTURE: 'scan-folder-structure',
    ADD: 'add-smart-folder',
    EDIT: 'edit-smart-folder',
    DELETE: 'delete-smart-folder'
  },
  
  // Analysis
  ANALYSIS: {
    ANALYZE_DOCUMENT: 'analyze-document',
    ANALYZE_IMAGE: 'analyze-image',
    // ANALYZE_AUDIO: 'analyze-audio', // REMOVED - audio analysis disabled
    EXTRACT_IMAGE_TEXT: 'extract-text-from-image',
    // TRANSCRIBE_AUDIO: 'transcribe-audio' // REMOVED - audio analysis disabled
  },
  
  // Settings
  SETTINGS: {
    GET: 'get-settings',
    SAVE: 'save-settings'
  },
  
  // Ollama
  OLLAMA: {
    GET_MODELS: 'get-ollama-models',
    TEST_CONNECTION: 'test-ollama-connection'
  },
  
  // Undo/Redo
  UNDO_REDO: {
    CAN_UNDO: 'can-undo',
    CAN_REDO: 'can-redo',
    UNDO: 'undo-action',
    REDO: 'redo-action',
    GET_HISTORY: 'get-action-history',
    CLEAR_HISTORY: 'clear-action-history'
  },
  
  // Analysis History
  ANALYSIS_HISTORY: {
    GET: 'get-analysis-history',
    SEARCH: 'search-analysis-history',
    GET_STATISTICS: 'get-analysis-statistics',
    GET_FILE_HISTORY: 'get-file-analysis-history',
    CLEAR: 'clear-analysis-history',
    EXPORT: 'export-analysis-history'
  },
  

  
  // System Monitoring
  SYSTEM: {
    GET_APPLICATION_STATISTICS: 'get-application-statistics',
    GET_METRICS: 'get-system-metrics'
  },
  
  // Menu Actions
  MENU: {
    NEW_ANALYSIS: 'menu-new-analysis',
    UNDO: 'menu-undo',
    REDO: 'menu-redo'
  }
};

// System status constants
const SYSTEM_STATUS = {
  CHECKING: 'checking',
  HEALTHY: 'healthy',
  UNHEALTHY: 'unhealthy',
  OFFLINE: 'offline'
};

// Notification types
const NOTIFICATION_TYPES = {
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error'
};

// File processing states
const FILE_STATES = {
  PENDING: 'pending',
  ANALYZING: 'analyzing',
  CATEGORIZED: 'categorized',
  APPROVED: 'approved',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  ERROR: 'error',
  CANCELLED: 'cancelled'
};

// Error types
const ERROR_TYPES = {
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  INVALID_FORMAT: 'INVALID_FORMAT',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  AI_UNAVAILABLE: 'AI_UNAVAILABLE',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  UNKNOWN: 'UNKNOWN'
};

// Action types for undo/redo
const ACTION_TYPES = {
  FILE_MOVE: 'FILE_MOVE',
  FILE_RENAME: 'FILE_RENAME',
  FILE_DELETE: 'FILE_DELETE',
  FOLDER_CREATE: 'FOLDER_CREATE',
  FOLDER_DELETE: 'FOLDER_DELETE',
  BATCH_OPERATION: 'BATCH_OPERATION'
};

// Theme constants
const THEMES = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system'
};

// Keyboard shortcuts
const SHORTCUTS = {
  UNDO: 'Ctrl+Z',
  REDO: 'Ctrl+Y',
  SELECT_ALL: 'Ctrl+A',
  DELETE: 'Delete',
  ESCAPE: 'Escape',
  ENTER: 'Enter',
  TAB: 'Tab',
  SPACE: 'Space'
};

// File size limits
const LIMITS = {
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
  MAX_BATCH_SIZE: 50,
  MAX_PATH_LENGTH: 260,
  MAX_FILENAME_LENGTH: 255
};

// Time constants
const TIMEOUTS = {
  AI_REQUEST: 180000, // 3 minutes for multimodal analysis (Gemma 3:4b)
  FILE_OPERATION: 10000, // 10 seconds
  DEBOUNCE: 300,
  THROTTLE: 100
};

// CommonJS exports for Node.js compatibility (main process)
module.exports = {
  PHASES,
  PHASE_TRANSITIONS,
  PHASE_METADATA,
  IPC_CHANNELS,
  SYSTEM_STATUS,
  NOTIFICATION_TYPES,
  FILE_STATES,
  ERROR_TYPES,
  ACTION_TYPES,
  THEMES,
  SHORTCUTS,
  LIMITS,
  TIMEOUTS
}; 