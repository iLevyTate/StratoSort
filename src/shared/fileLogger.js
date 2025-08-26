/**
 * File Logger - Writes logs to text files for examination
 * Complements the main logger with persistent file storage
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class FileLogger {
  constructor() {
    this.baseLogDir = path.join(process.cwd(), 'logs');
    this.maxFileSize = 10 * 1024 * 1024; // 10MB per log file
    this.maxFilesPerType = 5; // Keep 5 files per log type
    this.enabled = true;

    // Ensure log directories exist
    this.initializeDirectories();
  }

  async initializeDirectories() {
    const dirs = [
      this.baseLogDir,
      path.join(this.baseLogDir, 'performance'),
      path.join(this.baseLogDir, 'actions'),
      path.join(this.baseLogDir, 'errors'),
      path.join(this.baseLogDir, 'ollama'),
    ];

    for (const dir of dirs) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (error) {
        console.error(`Failed to create log directory ${dir}:`, error);
      }
    }
  }

  getTimestamp() {
    return new Date().toISOString();
  }

  getLogFilename(type, date = new Date()) {
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD format
    return `${type}_${dateStr}.log`;
  }

  async getLogFilePath(type) {
    const filename = this.getLogFilename(type);
    const dir = path.join(this.baseLogDir, type);

    // Ensure the type-specific directory exists before returning the path
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (err) {
      // If directory creation fails, log to console but still return the path
      // so callers can handle the error via fs operations later.
      // Avoid throwing here to keep logging best-effort.
      // eslint-disable-next-line no-console
      console.error(`Failed to ensure log directory ${dir}:`, err);
    }

    return path.join(dir, filename);
  }

  async rotateLogFile(type) {
    try {
      const logPath = await this.getLogFilePath(type);
      const stats = await fs.stat(logPath).catch(() => null);

      if (stats && stats.size > this.maxFileSize) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const rotatedPath = path.join(
          this.baseLogDir,
          type,
          `${type}_${timestamp}.log`,
        );

        await fs.rename(logPath, rotatedPath);

        // Clean up old files
        await this.cleanupOldFiles(type);
      }
    } catch (error) {
      console.error(`Failed to rotate log file for ${type}:`, error);
    }
  }

  async cleanupOldFiles(type) {
    try {
      const typeDir = path.join(this.baseLogDir, type);
      const files = await fs.readdir(typeDir);
      const logFiles = files
        .filter((f) => f.endsWith('.log'))
        .sort()
        .reverse();

      if (logFiles.length > this.maxFilesPerType) {
        const filesToDelete = logFiles.slice(this.maxFilesPerType);
        for (const file of filesToDelete) {
          await fs.unlink(path.join(typeDir, file));
        }
      }
    } catch (error) {
      console.error(`Failed to cleanup old files for ${type}:`, error);
    }
  }

  async writeLog(type, message, data = {}) {
    if (!this.enabled) return;

    try {
      await this.rotateLogFile(type);
      const logPath = await this.getLogFilePath(type);

      const timestamp = this.getTimestamp();
      const logEntry = {
        timestamp,
        type,
        message,
        data,
        hostname: os.hostname(),
        pid: process.pid,
      };

      const logLine = JSON.stringify(logEntry, null, 2) + '\n---\n';
      await fs.appendFile(logPath, logLine, 'utf8');
    } catch (error) {
      console.error(`Failed to write ${type} log:`, error);
    }
  }

  // Specific logging methods for different types
  async logAction(action, data = {}) {
    await this.writeLog('actions', action, {
      ...data,
      actionId:
        data.actionId ||
        `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    });
  }

  async logPerformance(operation, duration, metadata = {}) {
    await this.writeLog('performance', `Performance: ${operation}`, {
      duration: `${duration}ms`,
      operation,
      ...metadata,
    });
  }

  async logOllamaCall(
    operation,
    model,
    duration,
    success = true,
    metadata = {},
  ) {
    await this.writeLog(
      'ollama',
      `${success ? 'SUCCESS' : 'ERROR'}: ${operation}`,
      {
        operation,
        model,
        duration: `${duration}ms`,
        success,
        callId:
          metadata.callId ||
          `ollama_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        ...metadata,
      },
    );
  }

  async logError(context, error, metadata = {}) {
    await this.writeLog('errors', `ERROR: ${context}`, {
      error: error.message || error.toString(),
      stack: error.stack,
      context,
      ...metadata,
    });
  }

  async logSystemInfo() {
    const systemInfo = {
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      cpus: os.cpus().length,
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      uptime: os.uptime(),
      nodeVersion: process.version,
      electronVersion: process.versions.electron,
      cwd: process.cwd(),
    };

    await this.writeLog('performance', 'SYSTEM_INFO', systemInfo);
  }

  // Get recent logs for a specific type
  async getRecentLogs(type, lines = 100) {
    try {
      const logPath = await this.getLogFilePath(type);
      const content = await fs.readFile(logPath, 'utf8');
      const entries = content.split('\n---\n').filter((entry) => entry.trim());

      return entries
        .slice(-lines)
        .map((entry) => {
          try {
            return JSON.parse(entry);
          } catch {
            return { raw: entry };
          }
        })
        .reverse();
    } catch (error) {
      console.error(`Failed to read ${type} logs:`, error);
      return [];
    }
  }

  // Get all log files for a type
  async getLogFiles(type) {
    try {
      const typeDir = path.join(this.baseLogDir, type);
      const files = await fs.readdir(typeDir);
      return files
        .filter((f) => f.endsWith('.log'))
        .sort()
        .reverse()
        .map((filename) => ({
          filename,
          path: path.join(typeDir, filename),
          date: filename.split('_')[1]?.split('.')[0] || 'unknown',
        }));
    } catch (error) {
      console.error(`Failed to get log files for ${type}:`, error);
      return [];
    }
  }

  // Enable/disable logging
  setEnabled(enabled) {
    this.enabled = enabled;
  }

  // Get log statistics
  async getStats() {
    const stats = {
      totalFiles: 0,
      totalSize: 0,
      byType: {},
    };

    const types = ['performance', 'actions', 'errors', 'ollama'];

    for (const type of types) {
      try {
        const files = await this.getLogFiles(type);
        stats.byType[type] = {
          fileCount: files.length,
          size: 0,
        };

        for (const file of files) {
          try {
            const fileStats = await fs.stat(file.path);
            stats.byType[type].size += fileStats.size;
            stats.totalSize += fileStats.size;
          } catch (error) {
            // File might not exist
          }
        }

        stats.totalFiles += files.length;
      } catch (error) {
        stats.byType[type] = { fileCount: 0, size: 0 };
      }
    }

    return stats;
  }
}

// Create singleton instance
const fileLogger = new FileLogger();

module.exports = {
  FileLogger,
  fileLogger,
};
