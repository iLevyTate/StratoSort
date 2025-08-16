/**
 * Centralized Error Handler
 * Manages all application errors with proper logging and user notification
 */

const { app, dialog, BrowserWindow } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const { ERROR_TYPES } = require('../../shared/constants');

class ErrorHandler {
  constructor() {
    this.logPath = path.join(app.getPath('userData'), 'logs');
    this.currentLogFile = null;
    this.errorQueue = [];
    this.isInitialized = false;
  }

  async initialize() {
    try {
      // Create logs directory
      await fs.mkdir(this.logPath, { recursive: true });

      // Set up log file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      this.currentLogFile = path.join(
        this.logPath,
        `stratosort-${timestamp}.log`,
      );

      // Set up global error handlers
      this.setupGlobalHandlers();

      this.isInitialized = true;
      await this.log('info', 'ErrorHandler initialized successfully');
    } catch (error) {
      console.error('Failed to initialize ErrorHandler:', error);
    }
  }

  setupGlobalHandlers() {
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.handleCriticalError('Uncaught Exception', error);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, _promise) => {
      this.handleCriticalError('Unhandled Promise Rejection', reason);
    });

    // Handle Electron errors
    app.on('render-process-gone', (event, webContents, details) => {
      this.handleCriticalError('Renderer Process Crashed', details);
    });

    app.on('child-process-gone', (event, details) => {
      this.handleCriticalError('Child Process Crashed', details);
    });
  }

  /**
   * Handle different types of errors
   */
  async handleError(error, context = {}) {
    const errorInfo = this.parseError(error);
    const severity = this.determineSeverity(errorInfo.type);

    // Log the error
    await this.log(severity, errorInfo.message, {
      ...errorInfo,
      context,
      timestamp: new Date().toISOString(),
    });

    // Handle based on severity
    switch (severity) {
      case 'critical':
        await this.handleCriticalError(errorInfo.message, error);
        break;
      case 'error':
        await this.notifyUser(errorInfo.message, 'error');
        break;
      case 'warning':
        await this.notifyUser(errorInfo.message, 'warning');
        break;
      default:
        // Info level errors are just logged
        break;
    }

    return errorInfo;
  }

  /**
   * Parse error to extract useful information
   */
  parseError(error) {
    const errorInfo = {
      type: ERROR_TYPES.UNKNOWN,
      message: 'An unexpected error occurred',
      details: {},
      stack: error?.stack,
    };

    if (error instanceof Error) {
      errorInfo.message = error.message;

      // Determine error type
      if (error.code === 'ENOENT') {
        errorInfo.type = ERROR_TYPES.FILE_NOT_FOUND;
        errorInfo.message = 'File or directory not found';
      } else if (error.code === 'EACCES' || error.code === 'EPERM') {
        errorInfo.type = ERROR_TYPES.PERMISSION_DENIED;
        errorInfo.message = 'Permission denied';
      } else if (
        error.message.includes('network') ||
        error.code === 'ENOTFOUND'
      ) {
        errorInfo.type = ERROR_TYPES.NETWORK_ERROR;
        errorInfo.message = 'Network connection error';
      } else if (
        error.message.includes('AI') ||
        error.message.includes('Ollama')
      ) {
        errorInfo.type = ERROR_TYPES.AI_UNAVAILABLE;
        errorInfo.message = 'AI service is unavailable';
      }
    }

    return errorInfo;
  }

  /**
   * Determine error severity
   */
  determineSeverity(errorType) {
    switch (errorType) {
      case ERROR_TYPES.PERMISSION_DENIED:
      case ERROR_TYPES.UNKNOWN:
        return 'critical';
      case ERROR_TYPES.FILE_NOT_FOUND:
      case ERROR_TYPES.AI_UNAVAILABLE:
        return 'error';
      case ERROR_TYPES.INVALID_FORMAT:
      case ERROR_TYPES.FILE_TOO_LARGE:
        return 'warning';
      default:
        return 'info';
    }
  }

  /**
   * Handle critical errors that may crash the app
   */
  async handleCriticalError(message, error) {
    console.error('CRITICAL ERROR:', message, error);

    // Log to file
    await this.log('critical', message, {
      error: error?.toString(),
      stack: error?.stack,
    });

    // Show error dialog
    const response = await dialog.showMessageBox({
      type: 'error',
      title: 'Critical Error',
      message: 'Stratosort encountered a critical error',
      detail: `${message}\n\nWould you like to restart the application?`,
      buttons: ['Restart', 'Quit'],
      defaultId: 0,
    });

    if (response.response === 0) {
      app.relaunch();
    }
    app.quit();
  }

  /**
   * Notify user of errors
   */
  async notifyUser(message, type = 'error') {
    const mainWindow = BrowserWindow.getFocusedWindow();

    if (mainWindow && !mainWindow.isDestroyed()) {
      // Send to renderer process
      mainWindow.webContents.send('app:error', {
        message,
        type,
        timestamp: new Date().toISOString(),
      });
    } else {
      // Fallback to dialog
      await dialog.showMessageBox({
        type,
        title: type.charAt(0).toUpperCase() + type.slice(1),
        message,
        buttons: ['OK'],
      });
    }
  }

  /**
   * Log messages to file
   */
  async log(level, message, data = {}) {
    if (!this.isInitialized) {
      console.log(`[${level.toUpperCase()}] ${message}`, data);
      return;
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message,
      data,
    };

    try {
      const logLine = JSON.stringify(logEntry) + '\n';
      await fs.appendFile(this.currentLogFile, logLine);
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  /**
   * Get recent errors for debugging
   */
  async getRecentErrors(count = 50) {
    try {
      const logContent = await fs.readFile(this.currentLogFile, 'utf-8');
      const lines = logContent.trim().split('\n');
      const errors = lines
        .slice(-count)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(
          (entry) => entry && ['ERROR', 'CRITICAL'].includes(entry.level),
        );

      return errors;
    } catch (error) {
      console.error('Failed to read error log:', error);
      return [];
    }
  }

  /**
   * Clean up old log files
   */
  async cleanupLogs(daysToKeep = 7) {
    try {
      const files = await fs.readdir(this.logPath);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      for (const file of files) {
        if (file.startsWith('stratosort-') && file.endsWith('.log')) {
          const filePath = path.join(this.logPath, file);
          const stats = await fs.stat(filePath);

          if (stats.mtime < cutoffDate) {
            await fs.unlink(filePath);
            await this.log('info', `Cleaned up old log file: ${file}`);
          }
        }
      }
    } catch (error) {
      console.error('Failed to cleanup logs:', error);
    }
  }
}

// Export singleton instance
module.exports = new ErrorHandler();
