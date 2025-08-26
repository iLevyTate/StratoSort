/**
 * Unified Logging System for StratoSort
 * Provides structured logging across main and renderer processes
 */

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4,
};

const LOG_LEVEL_NAMES = ['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'];

class Logger {
  constructor() {
    this.level = LOG_LEVELS.INFO; // Default log level
    this.enableConsole = true;
    this.enableFile = true; // Enable file logging by default
    this.logFile = null;
    this.context = '';
    this.fileLogger = null;

    // Try to load file logger (only in main process)
    try {
      // Check if we're in main process (has access to Node.js modules)
      if (
        typeof process !== 'undefined' &&
        process.versions &&
        process.versions.node
      ) {
        const { fileLogger } = require('./fileLogger');
        this.fileLogger = fileLogger;
      } else {
        // In renderer process, disable file logging
        this.enableFile = false;
        this.fileLogger = null;
      }
    } catch (error) {
      console.warn('File logger not available:', error.message);
      this.enableFile = false;
      this.fileLogger = null;
    }
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

  async writeToFile(formattedMessage, logData = {}) {
    if (!this.enableFile) return;

    // Use file logger if available
    if (this.fileLogger) {
      try {
        // Extract log type from data or determine from message content
        let logType = 'performance'; // default
        if (logData.type) {
          logType = logData.type;
        } else if (formattedMessage.includes('[ACTION]')) {
          logType = 'actions';
        } else if (formattedMessage.includes('[OLLAMA]')) {
          logType = 'ollama';
        } else if (
          formattedMessage.includes('ERROR') ||
          formattedMessage.includes('Failed')
        ) {
          logType = 'errors';
        }

        await this.fileLogger.writeLog(logType, formattedMessage, logData);
      } catch (error) {
        console.error('Failed to write to file logger:', error);
      }
    }

    // Fallback to basic file logging if fileLogger is not available
    if (this.logFile) {
      try {
        const fs = require('fs').promises;
        await fs.appendFile(this.logFile, formattedMessage + '\n');
      } catch (error) {
        console.error('Failed to write to log file:', error);
      }
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
      this.writeToFile(formattedMessage, data);
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
      confidence: `${confidence}%`,
    });
  }

  phaseTransition(fromPhase, toPhase, data = {}) {
    this.info(`Phase transition: ${fromPhase} → ${toPhase}`, data);
  }

  performance(operation, duration, metadata = {}) {
    this.debug(`Performance: ${operation}`, {
      duration: `${duration}ms`,
      ...metadata,
    });
  }

  // Enhanced action tracking for user interactions
  actionTrack(action, data = {}) {
    const logData = {
      type: 'actions',
      timestamp: new Date().toISOString(),
      ...data,
    };
    this.info(`[ACTION] ${action}`, logData);

    // Also write directly to file logger for better organization
    if (this.fileLogger) {
      this.fileLogger
        .logAction(action, data)
        .catch((err) => console.error('Failed to log action to file:', err));
    }
  }

  // Ollama-specific performance tracking
  ollamaCall(operation, model, duration, metadata = {}) {
    const logData = {
      type: 'ollama',
      model,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
      ...metadata,
    };
    this.info(`[OLLAMA] ${operation}`, logData);

    // Also write directly to file logger
    if (this.fileLogger) {
      const success = !metadata.error;
      this.fileLogger
        .logOllamaCall(operation, model, duration, success, metadata)
        .catch((err) =>
          console.error('Failed to log Ollama call to file:', err),
        );
    }
  }

  // Queue performance tracking
  queueMetrics(queueName, stats = {}) {
    const logData = {
      type: 'performance',
      timestamp: new Date().toISOString(),
      queueName,
      ...stats,
    };
    this.debug(`[QUEUE] ${queueName}`, logData);
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
  LOG_LEVEL_NAMES,
};
