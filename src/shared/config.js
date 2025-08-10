/**
 * Centralized Configuration Management
 * Handles environment variables, defaults, and validation
 */

const path = require('path');
const os = require('os');

// Load environment variables
const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

/**
 * Application Configuration
 */
const config = {
  // Environment
  env: {
    isDevelopment,
    isProduction,
    isTest,
    nodeEnv: process.env.NODE_ENV || 'development',
  },

  // Application
  app: {
    name: 'StratoSort',
    version: require('../../package.json').version,
    userDataPath: '', // Set at runtime
    logLevel: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE_MB || '100') * 1024 * 1024,
    maxConcurrentAnalysis: parseInt(process.env.MAX_CONCURRENT_ANALYSIS || '3'),
    analysisTimeout: parseInt(process.env.ANALYSIS_TIMEOUT_MS || '60000'),
  },

  // Ollama Configuration
  ollama: {
    host: process.env.OLLAMA_HOST || 'http://localhost:11434',
    timeout: parseInt(process.env.OLLAMA_TIMEOUT || '30000'),
    retryAttempts: parseInt(process.env.OLLAMA_RETRY_ATTEMPTS || '3'),
    models: {
      text: 'llama3.2:latest',
      vision: 'llava:latest',
      audio: 'dimavz/whisper-tiny:latest',
    },
  },

  // Paths
  paths: {
    documents: process.env.DEFAULT_DOCUMENTS_PATH || path.join(os.homedir(), 'Documents'),
    temp: os.tmpdir(),
    logs: '', // Set at runtime
    cache: '', // Set at runtime
  },

  // Security
  security: {
    cspEnabled: process.env.CSP_ENABLED !== 'false',
    contextIsolation: process.env.CONTEXT_ISOLATION !== 'false',
    nodeIntegration: process.env.NODE_INTEGRATION === 'true',
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
  },

  // Performance
  performance: {
    webpackCache: process.env.WEBPACK_CACHE !== 'false',
    electronLogging: process.env.ELECTRON_ENABLE_LOGGING === 'true',
    reactFastRefresh: process.env.REACT_FAST_REFRESH === 'true' && isDevelopment,
  },

  // Features
  features: {
    autoUpdate: process.env.ENABLE_AUTO_UPDATE === 'true' && isProduction,
    crashReporting: process.env.ENABLE_CRASH_REPORTING === 'true' && isProduction,
    analytics: process.env.ENABLE_ANALYTICS === 'true' && isProduction,
    telemetry: isProduction,
  },

  // Build
  build: {
    target: process.platform,
    arch: process.arch,
    bundleId: 'com.stratosort.app',
  },
};

/**
 * Initialize runtime paths
 */
function initializePaths(app) {
  if (app && app.getPath) {
    config.app.userDataPath = app.getPath('userData');
    config.paths.logs = path.join(config.app.userDataPath, 'logs');
    config.paths.cache = path.join(config.app.userDataPath, 'cache');
  }
}

/**
 * Validate configuration
 */
function validateConfig() {
  const errors = [];

  // Validate required paths
  if (!config.paths.documents) {
    errors.push('Documents path is not configured');
  }

  // Validate Ollama configuration
  if (!config.ollama.host.startsWith('http')) {
    errors.push('Invalid Ollama host URL');
  }

  // Validate numeric values
  if (config.ollama.timeout < 1000) {
    errors.push('Ollama timeout too low (minimum 1000ms)');
  }

  if (config.app.maxFileSize < 1024) {
    errors.push('Maximum file size too low (minimum 1KB)');
  }

  return errors;
}

/**
 * Get configuration for specific context
 */
function getConfig(context = 'main') {
  const contextConfigs = {
    main: {
      ...config,
      // Main process specific overrides
    },
    renderer: {
      // Only expose safe config to renderer
      app: {
        name: config.app.name,
        version: config.app.version,
        logLevel: config.app.logLevel,
      },
      ollama: {
        timeout: config.ollama.timeout,
      },
      features: config.features,
      env: {
        isDevelopment: config.env.isDevelopment,
        isProduction: config.env.isProduction,
      },
    },
  };

  return contextConfigs[context] || config;
}

module.exports = {
  config,
  getConfig,
  initializePaths,
  validateConfig,
  isDevelopment,
  isProduction,
  isTest,
};