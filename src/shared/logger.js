/**
 * Unified Logging System for StratoSort
 * Provides structured logging across main and renderer processes
 */

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4
};

const LOG_LEVEL_NAMES = ['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'];

class Logger {
  constructor() {
    this.level = LOG_LEVELS.INFO; // Default log level
    this.enableConsole = true;
    this.enableFile = false;
    this.logFile = null;
    this.context = '';
  }

  setLevel(level) {
    if (typeof level === 'string') {
      this.level = LOG_LEVELS[level.toUpperCase()] ?? LOG_LEVELS.INFO;
    } else {
      this.level = level;
    }
  }

  setContext(context) {
    this.context = context;
  }

  enableFileLogging(logFile) {
    this.enableFile = true;
    this.logFile = logFile;
  }

  disableConsoleLogging() {
    this.enableConsole = false;
  }

  formatMessage(level, message, data) {
    const timestamp = new Date().toISOString();
    const levelName = LOG_LEVEL_NAMES[level] || 'UNKNOWN';
    const contextStr = this.context ? ` [${this.context}]` : '';
    
    let formattedMessage = `${timestamp} ${levelName}${contextStr}: ${message}`;
    
    if (data && Object.keys(data).length > 0) {
      formattedMessage += `\n  Data: ${JSON.stringify(data, null, 2)}`;
    }
    
    return formattedMessage;
  }

  async writeToFile(formattedMessage) {
    if (!this.enableFile || !this.logFile) return;
    try {
      const fs = require('fs').promises;
      await fs.appendFile(this.logFile, formattedMessage + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  log(level, message, data = {}) {
    if (level > this.level) return;
    
    const formattedMessage = this.formatMessage(level, message, data);
    
    if (this.enableConsole) {
      const consoleMethod = this.getConsoleMethod(level);
      consoleMethod(formattedMessage);
    }
    
    if (this.enableFile) {
      this.writeToFile(formattedMessage);
    }
  }

  getConsoleMethod(level) {
    switch (level) {
      case LOG_LEVELS.ERROR:
        return console.error;
      case LOG_LEVELS.WARN:
        return console.warn;
      case LOG_LEVELS.DEBUG:
      case LOG_LEVELS.TRACE:
        return console.debug;
      default:
        return console.log;
    }
  }

  error(message, data) {
    this.log(LOG_LEVELS.ERROR, message, data);
  }

  warn(message, data) {
    this.log(LOG_LEVELS.WARN, message, data);
  }

  info(message, data) {
    this.log(LOG_LEVELS.INFO, message, data);
  }

  debug(message, data) {
    this.log(LOG_LEVELS.DEBUG, message, data);
  }

  trace(message, data) {
    this.log(LOG_LEVELS.TRACE, message, data);
  }

  // Convenience methods for common logging patterns
  fileOperation(operation, filePath, result = 'success') {
    this.info(`File ${operation}`, { filePath, result });
  }

  aiAnalysis(filePath, model, duration, confidence) {
    this.info('AI Analysis completed', { 
      filePath, 
      model, 
      duration: `${duration}ms`, 
      confidence: `${confidence}%` 
    });
  }

  phaseTransition(fromPhase, toPhase, data = {}) {
    this.info(`Phase transition: ${fromPhase} → ${toPhase}`, data);
  }

  performance(operation, duration, metadata = {}) {
    this.debug(`Performance: ${operation}`, { 
      duration: `${duration}ms`, 
      ...metadata 
    });
  }
}

// Create singleton instance
const logger = new Logger();

// Set log level based on environment
if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
  logger.setLevel(LOG_LEVELS.DEBUG);
} else {
  logger.setLevel(LOG_LEVELS.INFO);
}

// Export both the class and singleton
module.exports = {
  Logger,
  logger,
  LOG_LEVELS,
  LOG_LEVEL_NAMES
}; 