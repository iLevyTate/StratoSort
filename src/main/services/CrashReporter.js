const { crashReporter, app, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { logger } = require('../../shared/logger');

/**
 * Comprehensive Crash Reporter and Error Handler
 * Implements the diagnostic framework for capturing and reporting application failures
 */
class CrashReporter {
  constructor() {
    this.crashLogs = [];
    this.maxCrashLogs = 10;
    this.crashLogPath = null;
    this.isInitialized = false;
  }

  /**
   * Initialize the crash reporter system
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      // Set up crash log directory
      const userData = app.getPath('userData');
      this.crashLogPath = path.join(userData, 'crash-reports');
      await fs.mkdir(this.crashLogPath, { recursive: true });

      // Configure Electron crash reporter
      this.setupElectronCrashReporter();

      // Set up comprehensive error handlers
      this.setupGlobalErrorHandlers();

      // Set up process monitoring
      this.setupProcessMonitoring();

      this.isInitialized = true;
      logger.info('[CRASH-REPORTER] Initialized successfully');
    } catch (error) {
      logger.error('[CRASH-REPORTER] Failed to initialize:', error);
    }
  }

  /**
   * Configure Electron's built-in crash reporter
   */
  setupElectronCrashReporter() {
    try {
      crashReporter.start({
        productName: 'StratoSort',
        companyName: 'StratoSort Team',
        submitURL: false, // We'll handle submission manually for better control
        uploadToServer: false,
        compress: true,
        rateLimit: false,
      });

      logger.info('[CRASH-REPORTER] Electron crash reporter configured');
    } catch (error) {
      logger.error(
        '[CRASH-REPORTER] Failed to setup Electron crash reporter:',
        error,
      );
    }
  }

  /**
   * Set up comprehensive global error handlers
   */
  setupGlobalErrorHandlers() {
    // Prevent double registration
    if (this.handlersRegistered) return;
    this.handlersRegistered = true;

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.handleUncaughtException(error);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.handleUnhandledRejection(reason, promise);
    });

    // Handle warnings
    process.on('warning', (warning) => {
      this.handleWarning(warning);
    });

    // Handle Electron app uncaught exceptions
    app.on('uncaughtException', (error) => {
      this.handleUncaughtException(error, 'app');
    });

    logger.info('[CRASH-REPORTER] Global error handlers configured');
  }

  /**
   * Set up process monitoring for resource usage and stability
   */
  setupProcessMonitoring() {
    // Monitor memory usage
    setInterval(() => {
      this.monitorMemoryUsage();
    }, 30000); // Check every 30 seconds

    // Monitor for hanging processes
    this.setupHangingProcessDetection();
  }

  /**
   * Handle uncaught exceptions
   */
  async handleUncaughtException(error, source = 'process') {
    try {
      const crashData = {
        type: 'uncaughtException',
        source,
        timestamp: new Date().toISOString(),
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
        process: {
          pid: process.pid,
          platform: process.platform,
          arch: process.arch,
          versions: process.versions,
          memoryUsage: process.memoryUsage(),
          uptime: process.uptime(),
        },
        system: await this.getSystemInfo(),
      };

      await this.logCrash(crashData);
      await this.notifyUser(crashData);

      // For critical errors, show error dialog and exit gracefully
      if (this.isCriticalError(error)) {
        await this.handleCriticalError(crashData);
      }

      logger.error('[CRASH-REPORTER] Uncaught exception handled:', crashData);
    } catch (logError) {
      // Fallback logging if our crash reporter fails
      logger.error(
        '[CRASH-REPORTER] Failed to handle uncaught exception:',
        logError,
      );
      logger.error('[CRASH-REPORTER] Original error:', error);
    }
  }

  /**
   * Handle unhandled promise rejections
   */
  async handleUnhandledRejection(reason, promise) {
    try {
      const crashData = {
        type: 'unhandledRejection',
        timestamp: new Date().toISOString(),
        reason:
          reason instanceof Error
            ? {
                message: reason.message,
                stack: reason.stack,
                name: reason.name,
              }
            : reason,
        promise: String(promise),
        process: {
          pid: process.pid,
          memoryUsage: process.memoryUsage(),
          uptime: process.uptime(),
        },
      };

      await this.logCrash(crashData);

      // Log but don't show user dialog for rejections unless critical
      if (this.isCriticalRejection(reason)) {
        await this.notifyUser(crashData);
      }

      logger.error('[CRASH-REPORTER] Unhandled rejection handled:', crashData);
    } catch (logError) {
      logger.error(
        '[CRASH-REPORTER] Failed to handle unhandled rejection:',
        logError,
      );
      logger.error('[CRASH-REPORTER] Original reason:', reason);
    }
  }

  /**
   * Handle process warnings
   */
  async handleWarning(warning) {
    try {
      const warningData = {
        type: 'warning',
        timestamp: new Date().toISOString(),
        warning: {
          message: warning.message,
          stack: warning.stack,
          name: warning.name,
        },
        process: {
          pid: process.pid,
          memoryUsage: process.memoryUsage(),
        },
      };

      // Only log significant warnings
      if (this.isSignificantWarning(warning)) {
        await this.logCrash(warningData);
        logger.warn(
          '[CRASH-REPORTER] Significant warning logged:',
          warningData,
        );
      }
    } catch (logError) {
      logger.error('[CRASH-REPORTER] Failed to handle warning:', logError);
    }
  }

  /**
   * Monitor memory usage for potential memory leaks
   */
  async monitorMemoryUsage() {
    try {
      const memUsage = process.memoryUsage();
      const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
      const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
      const usagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

      // Alert on high memory usage
      if (heapUsedMB > 1024 || usagePercent > 85) {
        // 1GB or 85%
        const memoryData = {
          type: 'memoryWarning',
          timestamp: new Date().toISOString(),
          memory: {
            heapUsed: `${heapUsedMB.toFixed(2)}MB`,
            heapTotal: `${heapTotalMB.toFixed(2)}MB`,
            usagePercent: `${usagePercent.toFixed(1)}%`,
            external: `${(memUsage.external / 1024 / 1024).toFixed(2)}MB`,
            rss: `${(memUsage.rss / 1024 / 1024).toFixed(2)}MB`,
          },
          process: {
            pid: process.pid,
            uptime: process.uptime(),
          },
        };

        await this.logCrash(memoryData);

        if (heapUsedMB > 1536 || usagePercent > 90) {
          // 1.5GB or 90%
          logger.error(
            '[CRASH-REPORTER] Critical memory usage detected:',
            memoryData,
          );
          await this.notifyUser(memoryData);
        } else {
          logger.warn(
            '[CRASH-REPORTER] High memory usage detected:',
            memoryData,
          );
        }
      }
    } catch (error) {
      logger.debug('[CRASH-REPORTER] Memory monitoring failed:', error.message);
    }
  }

  /**
   * Get system information for crash reports
   */
  async getSystemInfo() {
    try {
      const os = require('os');

      return {
        platform: process.platform,
        arch: process.arch,
        release: os.release(),
        hostname: os.hostname(),
        cpus: os.cpus().length,
        totalMemory: `${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)}GB`,
        freeMemory: `${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)}GB`,
        uptime: os.uptime(),
        nodeVersion: process.version,
        electronVersion: process.versions.electron,
        chromeVersion: process.versions.chrome,
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Log crash data to file
   */
  async logCrash(crashData) {
    try {
      if (!this.crashLogPath) return;

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `crash-${crashData.type}-${timestamp}.json`;
      const filepath = path.join(this.crashLogPath, filename);

      await fs.writeFile(filepath, JSON.stringify(crashData, null, 2));

      // Maintain crash log history
      this.crashLogs.unshift(filepath);
      if (this.crashLogs.length > this.maxCrashLogs) {
        const oldFile = this.crashLogs.pop();
        try {
          await fs.unlink(oldFile);
        } catch (e) {
          // Ignore cleanup errors
        }
      }

      logger.info(`[CRASH-REPORTER] Crash logged to: ${filepath}`);
    } catch (error) {
      logger.error('[CRASH-REPORTER] Failed to log crash:', error);
    }
  }

  /**
   * Notify user of crash/error
   */
  async notifyUser(crashData) {
    try {
      const { BrowserWindow } = require('electron');
      const windows = BrowserWindow.getAllWindows();

      if (windows.length > 0) {
        // Send to renderer process
        windows[0].webContents.send('crash-notification', crashData);
      } else {
        // Show dialog if no windows available
        await this.showCrashDialog(crashData);
      }
    } catch (error) {
      logger.error('[CRASH-REPORTER] Failed to notify user:', error);
    }
  }

  /**
   * Show crash dialog to user
   */
  async showCrashDialog(crashData) {
    try {
      const message = this.formatCrashMessage(crashData);
      const choice = await dialog.showMessageBox({
        type: 'error',
        title: 'StratoSort Error',
        message: 'An error occurred in StratoSort',
        detail: message,
        buttons: ['Restart Application', 'Report Issue', 'Continue'],
        defaultId: 0,
        cancelId: 2,
      });

      if (choice.response === 0) {
        // Restart application
        app.relaunch();
        app.quit();
      } else if (choice.response === 1) {
        // Report issue
        await this.reportIssue(crashData);
      }
      // Choice 2 (Continue) just closes the dialog
    } catch (error) {
      logger.error('[CRASH-REPORTER] Failed to show crash dialog:', error);
    }
  }

  /**
   * Handle critical errors that require immediate action
   */
  async handleCriticalError(crashData) {
    try {
      const message = `A critical error occurred:\n\n${crashData.error.message}\n\nThe application will restart to maintain stability.`;

      await dialog.showMessageBox({
        type: 'error',
        title: 'Critical Error - Restarting',
        message: 'StratoSort encountered a critical error',
        detail: message,
        buttons: ['OK'],
      });

      // Log additional diagnostic info
      await this.collectDiagnosticInfo();

      // Restart application
      app.relaunch();
      app.quit();
    } catch (error) {
      logger.error('[CRASH-REPORTER] Failed to handle critical error:', error);
      // Force quit if we can't handle gracefully
      app.quit();
    }
  }

  /**
   * Collect additional diagnostic information
   */
  async collectDiagnosticInfo() {
    try {
      const diagnosticData = {
        type: 'diagnostic',
        timestamp: new Date().toISOString(),
        gpuInfo: await this.getGPUInfo(),
        processInfo: {
          pid: process.pid,
          ppid: process.ppid,
          env: Object.keys(process.env)
            .filter((key) =>
              ['PATH', 'NODE_ENV', 'ELECTRON_IS_DEV'].includes(key),
            )
            .reduce((obj, key) => ({ ...obj, [key]: process.env[key] }), {}),
        },
        recentLogs: await this.getRecentLogs(),
      };

      await this.logCrash(diagnosticData);
    } catch (error) {
      logger.error('[CRASH-REPORTER] Failed to collect diagnostics:', error);
    }
  }

  /**
   * Get GPU information
   */
  async getGPUInfo() {
    try {
      const { getGPUFeatureStatus } = require('electron');
      return getGPUFeatureStatus();
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Get recent application logs
   */
  async getRecentLogs() {
    // This would integrate with your existing logging system
    // For now, return a placeholder
    return ['Log collection not yet implemented'];
  }

  /**
   * Report issue to external service
   */
  async reportIssue(crashData) {
    try {
      const issueBody = this.formatIssueReport(crashData);
      const issueUrl = `https://github.com/stratosort/stratosort/issues/new?title=Crash Report&body=${encodeURIComponent(issueBody)}`;

      const { shell } = require('electron');
      shell.openExternal(issueUrl);

      logger.info('[CRASH-REPORTER] Issue report opened in browser');
    } catch (error) {
      logger.error('[CRASH-REPORTER] Failed to report issue:', error);
    }
  }

  /**
   * Format crash message for user display
   */
  formatCrashMessage(crashData) {
    const type = crashData.type;
    const message =
      crashData.error?.message || crashData.reason?.message || 'Unknown error';

    return `Type: ${type}\nMessage: ${message}\nTime: ${crashData.timestamp}\n\nA crash report has been saved to help diagnose this issue.`;
  }

  /**
   * Format issue report for GitHub
   */
  formatIssueReport(crashData) {
    return `## Crash Report

**Type:** ${crashData.type}
**Timestamp:** ${crashData.timestamp}
**Platform:** ${crashData.process?.platform || 'Unknown'}
**Electron Version:** ${crashData.process?.versions?.electron || 'Unknown'}

### Error Details
\`\`\`
${crashData.error?.message || crashData.reason || 'Unknown error'}
\`\`\`

### Stack Trace
\`\`\`
${crashData.error?.stack || 'No stack trace available'}
\`\`\`

### System Information
- OS: ${crashData.system?.platform || 'Unknown'}
- Architecture: ${crashData.system?.arch || 'Unknown'}
- Memory: ${crashData.system?.totalMemory || 'Unknown'}

### Process Information
- PID: ${crashData.process?.pid || 'Unknown'}
- Uptime: ${crashData.process?.uptime || 'Unknown'} seconds
- Memory Usage: ${crashData.process?.memoryUsage ? JSON.stringify(crashData.process.memoryUsage, null, 2) : 'Unknown'}

### Steps to Reproduce
1. [Please describe what you were doing when the crash occurred]

### Additional Context
[Add any other context about the crash here]`;
  }

  /**
   * Determine if an error is critical
   */
  isCriticalError(error) {
    const criticalPatterns = [
      /segmentation fault/i,
      /access violation/i,
      /cannot find module/i,
      /module did not self-register/i,
      /sharp.*libvips/i,
    ];

    return criticalPatterns.some((pattern) => pattern.test(error.message));
  }

  /**
   * Determine if a rejection is critical
   */
  isCriticalRejection(reason) {
    const criticalPatterns = [
      /timeout/i,
      /network/i,
      /database/i,
      /file system/i,
    ];

    const message = reason?.message || String(reason);
    return criticalPatterns.some((pattern) => pattern.test(message));
  }

  /**
   * Determine if a warning is significant
   */
  isSignificantWarning(warning) {
    const significantPatterns = [
      /deprecated/i,
      /memory/i,
      /leak/i,
      /native module/i,
    ];

    return significantPatterns.some((pattern) => pattern.test(warning.message));
  }

  /**
   * Get crash report history
   */
  async getCrashHistory() {
    try {
      if (!this.crashLogPath) return [];

      const files = await fs.readdir(this.crashLogPath);
      const crashFiles = files
        .filter((file) => file.startsWith('crash-') && file.endsWith('.json'))
        .sort()
        .reverse();

      const history = [];
      for (const file of crashFiles.slice(0, 5)) {
        try {
          const content = await fs.readFile(
            path.join(this.crashLogPath, file),
            'utf8',
          );
          history.push(JSON.parse(content));
        } catch (e) {
          // Skip corrupted files
        }
      }

      return history;
    } catch (error) {
      logger.error('[CRASH-REPORTER] Failed to get crash history:', error);
      return [];
    }
  }

  /**
   * Clean up old crash reports
   */
  async cleanup() {
    try {
      if (!this.crashLogPath) return;

      const files = await fs.readdir(this.crashLogPath);
      const crashFiles = files
        .filter((file) => file.startsWith('crash-') && file.endsWith('.json'))
        .map((file) => ({
          name: file,
          path: path.join(this.crashLogPath, file),
          stats: null,
        }));

      // Get file stats
      for (const file of crashFiles) {
        try {
          file.stats = await fs.stat(file.path);
        } catch (e) {
          // Skip files we can't stat
        }
      }

      // Keep only recent files (last 30 days)
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const oldFiles = crashFiles.filter(
        (file) => file.stats && file.stats.mtime.getTime() < thirtyDaysAgo,
      );

      for (const file of oldFiles) {
        try {
          await fs.unlink(file.path);
          logger.debug(
            `[CRASH-REPORTER] Cleaned up old crash report: ${file.name}`,
          );
        } catch (e) {
          logger.debug(`[CRASH-REPORTER] Failed to cleanup: ${file.name}`);
        }
      }

      logger.info(
        `[CRASH-REPORTER] Cleaned up ${oldFiles.length} old crash reports`,
      );
    } catch (error) {
      logger.error('[CRASH-REPORTER] Failed to cleanup crash reports:', error);
    }
  }
}

// Export singleton instance
module.exports = new CrashReporter();
