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
    this.sessionId = this.generateSessionId();
  }

  generateSessionId() {
    return Math.random().toString(36).substring(2, 15);
  }

  setContext(context) {
    this.context = context;
    return this;
  }

  createChildLogger(context) {
    const child = new Logger();
    child.level = this.level;
    child.enableConsole = this.enableConsole;
    child.enableFile = this.enableFile;
    child.logFile = this.logFile;
    child.context = this.context ? `${this.context}:${context}` : context;
    child.sessionId = this.sessionId;
    return child;
  }

  setLevel(level) {
    if (typeof level === 'string') {
      this.level = LOG_LEVELS[level.toUpperCase()] ?? LOG_LEVELS.INFO;
    } else {
      this.level = level;
    }
  }

  formatMessage(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const levelName = LOG_LEVEL_NAMES[level] || 'UNKNOWN';
    const contextStr = this.context ? `[${this.context}]` : '';
    const sessionStr = `[${this.sessionId}]`;
    
    let formattedMessage = `${timestamp} ${sessionStr} ${contextStr} [${levelName}] ${message}`;
    
    if (Object.keys(data).length > 0) {
      formattedMessage += ` ${JSON.stringify(data)}`;
    }
    
    return formattedMessage;
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

  writeToFile(message) {
    if (!this.logFile) return;
    
    try {
      // In Node.js environment
      if (typeof require !== 'undefined') {
        const fs = require('fs');
        fs.appendFileSync(this.logFile, `${message  }\n`);
      }
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  enableFileLogging(logFile) {
    this.enableFile = true;
    this.logFile = logFile;
  }

  disableFileLogging() {
    this.enableFile = false;
    this.logFile = null;
  }

  // Performance timing utilities
  time(label) {
    this.debug(`Timer started: ${label}`);
    return {
      end: () => {
        this.debug(`Timer ended: ${label}`);
      }
    };
  }

  // Cleanup method for testing
  cleanup() {
    this.context = '';
    this.enableFile = false;
    this.logFile = null;
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