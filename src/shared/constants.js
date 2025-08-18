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
  COMPLETE: 'complete',
};

// Phase transition rules - defines valid navigation paths
const PHASE_TRANSITIONS = {
  [PHASES.WELCOME]: [PHASES.SETUP, PHASES.DISCOVER],
  [PHASES.SETUP]: [PHASES.DISCOVER, PHASES.WELCOME],
  [PHASES.DISCOVER]: [PHASES.ORGANIZE, PHASES.SETUP],
  [PHASES.ORGANIZE]: [PHASES.COMPLETE, PHASES.DISCOVER],
  [PHASES.COMPLETE]: [PHASES.WELCOME, PHASES.ORGANIZE, PHASES.DISCOVER], // Allow going back without losing data
};

// Phase metadata for UI display
const PHASE_METADATA = {
  [PHASES.WELCOME]: {
    title: 'Welcome to StratoSort',
    navLabel: 'Welcome',
    icon: '🚀',
    progress: 0,
  },
  [PHASES.SETUP]: {
    title: 'Configure Smart Folders',
    navLabel: 'Smart Folders',
    icon: '⚙️',
    progress: 20,
  },
  [PHASES.DISCOVER]: {
    title: 'Discover & Analyze Files',
    navLabel: 'Discover Files',
    icon: '🔎',
    progress: 50,
  },
  [PHASES.ORGANIZE]: {
    title: 'Review & Organize',
    navLabel: 'Review Organize',
    icon: '📂',
    progress: 80,
  },
  [PHASES.COMPLETE]: {
    title: 'Organization Complete',
    navLabel: 'Complete',
    icon: '✅',
    progress: 100,
  },
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
    PERFORM_OPERATION: 'perform-file-operation',
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
    DELETE: 'delete-smart-folder',
    MATCH: 'match-smart-folder',
  },

  // Analysis
  ANALYSIS: {
    ANALYZE_DOCUMENT: 'analyze-document',
    ANALYZE_IMAGE: 'analyze-image',
    EXTRACT_IMAGE_TEXT: 'extract-text-from-image',
  },

  // Settings
  SETTINGS: {
    GET: 'get-settings',
    SAVE: 'save-settings',
  },

  // Embeddings / Semantic Matching
  EMBEDDINGS: {
    REBUILD_FOLDERS: 'embeddings-rebuild-folders',
    REBUILD_FILES: 'embeddings-rebuild-files',
    CLEAR_STORE: 'embeddings-clear-store',
  },

  // Ollama
  OLLAMA: {
    GET_MODELS: 'get-ollama-models',
    TEST_CONNECTION: 'test-ollama-connection',
    PULL_MODELS: 'ollama-pull-models',
  },

  // Undo/Redo
  UNDO_REDO: {
    CAN_UNDO: 'can-undo',
    CAN_REDO: 'can-redo',
    UNDO: 'undo-action',
    REDO: 'redo-action',
    GET_HISTORY: 'get-action-history',
    CLEAR_HISTORY: 'clear-action-history',
  },

  // Analysis History
  ANALYSIS_HISTORY: {
    GET: 'get-analysis-history',
    SEARCH: 'search-analysis-history',
    GET_STATISTICS: 'get-analysis-statistics',
    GET_FILE_HISTORY: 'get-file-analysis-history',
    CLEAR: 'clear-analysis-history',
    EXPORT: 'export-analysis-history',
  },

  // System Monitoring
  SYSTEM: {
    GET_APPLICATION_STATISTICS: 'get-application-statistics',
    GET_METRICS: 'get-system-metrics',
    APPLY_UPDATE: 'apply-update',
  },

  // Window Controls
  WINDOW: {
    MINIMIZE: 'window-minimize',
    MAXIMIZE: 'window-maximize',
    UNMAXIMIZE: 'window-unmaximize',
    TOGGLE_MAXIMIZE: 'window-toggle-maximize',
    IS_MAXIMIZED: 'window-is-maximized',
    CLOSE: 'window-close',
  },

  // Menu Actions
  MENU: {
    NEW_ANALYSIS: 'menu-new-analysis',
    UNDO: 'menu-undo',
    REDO: 'menu-redo',
  },
};

// System status constants
const SYSTEM_STATUS = {
  CHECKING: 'checking',
  HEALTHY: 'healthy',
  UNHEALTHY: 'unhealthy',
  OFFLINE: 'offline',
};

// Notification types
const NOTIFICATION_TYPES = {
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error',
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
  CANCELLED: 'cancelled',
};

// Error types
const ERROR_TYPES = {
  UNKNOWN: 'UNKNOWN',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  AI_UNAVAILABLE: 'AI_UNAVAILABLE',
  INVALID_FORMAT: 'INVALID_FORMAT',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  PROCESSING_FAILED: 'PROCESSING_FAILED',
};

// Action types for undo/redo
const ACTION_TYPES = {
  FILE_MOVE: 'FILE_MOVE',
  FILE_RENAME: 'FILE_RENAME',
  FILE_DELETE: 'FILE_DELETE',
  FOLDER_CREATE: 'FOLDER_CREATE',
  FOLDER_DELETE: 'FOLDER_DELETE',
  FOLDER_RENAME: 'FOLDER_RENAME',
  BATCH_OPERATION: 'BATCH_OPERATION',
  SETTINGS_CHANGE: 'SETTINGS_CHANGE',
  ANALYSIS_RESULT: 'ANALYSIS_RESULT',
};

// Theme constants
const THEMES = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
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
  SPACE: 'Space',
};

// File size limits
const LIMITS = {
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
  MAX_PATH_LENGTH: 260,
  MAX_FILENAME_LENGTH: 255,
};

// Time constants - Optimized for faster models
const TIMEOUTS = {
  AI_REQUEST: 60000, // 1 minute for faster models (llama3.2, whisper-tiny)
  FILE_OPERATION: 10000, // 10 seconds
  DEBOUNCE: 300,
  THROTTLE: 100,
};

// File type mappings
const SUPPORTED_TEXT_EXTENSIONS = [
  '.txt',
  '.md',
  '.rtf',
  '.json',
  '.csv',
  '.xml',
  '.html',
  '.htm',
  '.js',
  '.ts',
  '.jsx',
  '.tsx',
  '.py',
  '.java',
  '.cpp',
  '.c',
  '.h',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.sql',
  '.sh',
  '.bat',
  '.ps1',
  '.yaml',
  '.yml',
  '.ini',
  '.conf',
  '.log',
];

const SUPPORTED_DOCUMENT_EXTENSIONS = [
  '.pdf',
  '.doc',
  '.docx',
  '.xlsx',
  '.pptx',
  // Legacy Office
  '.xls',
  '.ppt',
  // OpenDocument formats
  '.odt',
  '.ods',
  '.odp',
  // E-books and email
  '.epub',
  '.eml',
  '.msg',
  // Geospatial packages (treat as documents for analysis)
  '.kml',
  '.kmz',
];

const SUPPORTED_IMAGE_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.webp',
  '.tiff',
  '.svg',
];

// Audio analysis disabled - removed for performance optimization
const SUPPORTED_AUDIO_EXTENSIONS = [];

const SUPPORTED_VIDEO_EXTENSIONS = ['.mp4', '.avi', '.mov', '.mkv'];

const SUPPORTED_ARCHIVE_EXTENSIONS = ['.zip', '.rar', '.7z', '.tar', '.gz'];

// All supported extensions combined
const ALL_SUPPORTED_EXTENSIONS = [
  ...SUPPORTED_TEXT_EXTENSIONS,
  ...SUPPORTED_DOCUMENT_EXTENSIONS,
  ...SUPPORTED_IMAGE_EXTENSIONS,
  ...SUPPORTED_AUDIO_EXTENSIONS,
  ...SUPPORTED_VIDEO_EXTENSIONS,
  ...SUPPORTED_ARCHIVE_EXTENSIONS,
];

// AI Model configurations - Optimized for speed with smallest available models
const DEFAULT_AI_MODELS = {
  TEXT_ANALYSIS: 'llama3.2:latest', // 2.0GB - Fastest text model
  IMAGE_ANALYSIS: 'llava:latest', // 4.7GB - Vision capable model
  // AUDIO_ANALYSIS removed while audio features are disabled
  FALLBACK_MODELS: [
    'llama3.2:latest',
    'gemma3:4b',
    'llama3',
    'mistral',
    'phi3',
  ],
};

// AI defaults centralized for analyzers
const AI_DEFAULTS = {
  TEXT: {
    MODEL: 'llama3.2:latest',
    HOST: 'http://127.0.0.1:11434',
    MAX_CONTENT_LENGTH: 12000,
    TEMPERATURE: 0.1,
    MAX_TOKENS: 800,
  },
  IMAGE: {
    MODEL: 'llava:latest',
    HOST: 'http://127.0.0.1:11434',
    TEMPERATURE: 0.2,
    MAX_TOKENS: 1000,
  },
};

// File size limits
const FILE_SIZE_LIMITS = {
  MAX_TEXT_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  MAX_IMAGE_FILE_SIZE: 100 * 1024 * 1024, // 100MB
  MAX_AUDIO_FILE_SIZE: 500 * 1024 * 1024, // 500MB
  MAX_DOCUMENT_FILE_SIZE: 200 * 1024 * 1024, // 200MB
};

// Processing limits - Optimized for faster models
const PROCESSING_LIMITS = {
  MAX_CONCURRENT_ANALYSIS: 3,
  MAX_BATCH_SIZE: 100,
  ANALYSIS_TIMEOUT: 60000, // 1 minute for faster models
  RETRY_ATTEMPTS: 3,
};

// Renderer/UI specific constants
const UI_WORKFLOW = {
  RESTORE_MAX_AGE_MS: 60 * 60 * 1000, // 1 hour
  SAVE_DEBOUNCE_MS: 1000, // 1s
};

const RENDERER_LIMITS = {
  FILE_STATS_BATCH_SIZE: 25,
  ANALYSIS_TIMEOUT_MS: 3 * 60 * 1000, // 3 minutes
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
  TIMEOUTS,
  SUPPORTED_TEXT_EXTENSIONS,
  SUPPORTED_DOCUMENT_EXTENSIONS,
  SUPPORTED_IMAGE_EXTENSIONS,
  SUPPORTED_AUDIO_EXTENSIONS,
  SUPPORTED_VIDEO_EXTENSIONS,
  SUPPORTED_ARCHIVE_EXTENSIONS,
  ALL_SUPPORTED_EXTENSIONS,
  DEFAULT_AI_MODELS,
  AI_DEFAULTS,
  FILE_SIZE_LIMITS,
  PROCESSING_LIMITS,
  UI_WORKFLOW,
  RENDERER_LIMITS,
};
