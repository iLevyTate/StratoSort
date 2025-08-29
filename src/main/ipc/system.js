const { withErrorLogging, withValidation } = require('./withErrorLogging');
const { fileLogger } = require('../../shared/fileLogger');
const { systemMonitor } = require('../services/SystemMonitor');
let z;
try {
  z = require('zod');
} catch {
  z = null;
}

function registerSystemIpc({
  ipcMain,
  IPC_CHANNELS,
  logger,
  systemAnalytics,
  getServiceIntegration,
}) {
  ipcMain.handle(
    IPC_CHANNELS.SYSTEM.GET_APPLICATION_STATISTICS,
    withErrorLogging(logger, async () => {
      try {
        const [analysisStats, historyRecent] = await Promise.allSettled([
          getServiceIntegration()?.analysisHistory?.getStatistics?.() ||
            Promise.resolve({}),
          getServiceIntegration()?.analysisHistory?.getRecentAnalysis?.(20) ||
            Promise.resolve([]),
        ]).then((results) =>
          results.map((r) => (r.status === 'fulfilled' ? r.value : null)),
        );
        return {
          analysis: analysisStats,
          recentActions:
            getServiceIntegration()?.undoRedo?.getActionHistory?.(20) || [],
          recentAnalysis: historyRecent,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        logger.error('Failed to get system statistics:', error);
        return {};
      }
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.SYSTEM.GET_METRICS,
    withErrorLogging(logger, async () => {
      try {
        const metrics = await systemAnalytics.collectMetrics();
        // Return metrics directly for preload validation compatibility
        return metrics;
      } catch (error) {
        logger.error('Failed to collect system metrics:', error);
        return { error: error.message };
      }
    }),
  );

  // Apply update (if downloaded)
  ipcMain.handle(
    IPC_CHANNELS.SYSTEM.APPLY_UPDATE,
    withErrorLogging(logger, async () => {
      try {
        const { autoUpdater } = require('electron-updater');
        autoUpdater.quitAndInstall();
        return { success: true };
      } catch (error) {
        logger.error('Failed to apply update:', error);
        return { success: false, error: error.message };
      }
    }),
  );

  // Get log files for examination
  ipcMain.handle(
    IPC_CHANNELS.SYSTEM.GET_LOG_FILES,
    withErrorLogging(logger, async (event, type) => {
      try {
        if (!fileLogger) {
          return { success: false, error: 'File logger not available' };
        }

        const files = await fileLogger.getLogFiles(type || 'all');
        return { success: true, files };
      } catch (error) {
        logger.error('Failed to get log files:', error);
        return { success: false, error: error.message };
      }
    }),
  );

  // Read specific log file
  ipcMain.handle(
    IPC_CHANNELS.SYSTEM.READ_LOG_FILE,
    withErrorLogging(logger, async (event, type, filename) => {
      try {
        if (!fileLogger) {
          return { success: false, error: 'File logger not available' };
        }

        const fs = require('fs').promises;
        const path = require('path');

        // Security: validate type parameter
        const safeType = path.basename(type);
        if (safeType !== type) {
          return { success: false, error: 'Invalid log type' };
        }

        // Security: only allow access to log directory
        const { app } = require('electron');
        const logDir = path.join(app.getPath('userData'), 'logs', safeType);
        const safePath = path.join(logDir, path.basename(filename));

        // Ensure the resolved path is within the log directory
        if (!safePath.startsWith(logDir)) {
          return { success: false, error: 'Invalid file path' };
        }

        const content = await fs.readFile(safePath, 'utf8');
        return { success: true, content };
      } catch (error) {
        logger.error('Failed to read log file:', error);
        return { success: false, error: error.message };
      }
    }),
  );

  // Get recent logs for a type
  ipcMain.handle(
    IPC_CHANNELS.SYSTEM.GET_RECENT_LOGS,
    withErrorLogging(logger, async (event, type, lines = 100) => {
      try {
        if (!fileLogger) {
          return { success: false, error: 'File logger not available' };
        }

        const path = require('path');

        // Security: validate type parameter
        const safeType = path.basename(type);
        if (safeType !== type) {
          return { success: false, error: 'Invalid log type' };
        }

        const logs = await fileLogger.getRecentLogs(safeType, lines);
        return { success: true, logs };
      } catch (error) {
        logger.error('Failed to get recent logs:', error);
        return { success: false, error: error.message };
      }
    }),
  );

  // Get log statistics
  ipcMain.handle(
    IPC_CHANNELS.SYSTEM.GET_LOG_STATS,
    withErrorLogging(logger, async () => {
      try {
        if (!fileLogger) {
          return { success: false, error: 'File logger not available' };
        }

        const stats = await fileLogger.getStats();
        return { success: true, stats };
      } catch (error) {
        logger.error('Failed to get log stats:', error);
        return { success: false, error: error.message };
      }
    }),
  );

  // Get comprehensive system status
  ipcMain.handle(
    IPC_CHANNELS.SYSTEM.GET_SYSTEM_STATUS,
    withErrorLogging(logger, async () => {
      try {
        if (!systemMonitor) {
          return { success: false, error: 'System monitor not available' };
        }

        const status = systemMonitor.getSystemStatus();
        return { success: true, status };
      } catch (error) {
        logger.error('Failed to get system status:', error);
        return { success: false, error: error.message };
      }
    }),
  );

  // Perform manual health check
  ipcMain.handle(
    IPC_CHANNELS.SYSTEM.PERFORM_HEALTH_CHECK,
    withErrorLogging(logger, async () => {
      try {
        if (!systemMonitor) {
          return { success: false, error: 'System monitor not available' };
        }

        await systemMonitor.performHealthCheck();
        const status = systemMonitor.getSystemStatus();
        return { success: true, status };
      } catch (error) {
        logger.error('Failed to perform health check:', error);
        return { success: false, error: error.message };
      }
    }),
  );

  // Log user session data
  ipcMain.handle(
    IPC_CHANNELS.SYSTEM.LOG_USER_SESSION,
    withErrorLogging(logger, async (event, sessionData) => {
      try {
        if (!systemMonitor) {
          return { success: false, error: 'System monitor not available' };
        }

        await systemMonitor.logUserSession(sessionData);
        return { success: true };
      } catch (error) {
        logger.error('Failed to log user session:', error);
        return { success: false, error: error.message };
      }
    }),
  );

  // Log performance anomaly
  ipcMain.handle(
    IPC_CHANNELS.SYSTEM.LOG_PERFORMANCE_ANOMALY,
    withErrorLogging(logger, async (event, anomalyData) => {
      try {
        if (!systemMonitor) {
          return { success: false, error: 'System monitor not available' };
        }

        await systemMonitor.logPerformanceAnomaly(anomalyData);
        return { success: true };
      } catch (error) {
        logger.error('Failed to log performance anomaly:', error);
        return { success: false, error: error.message };
      }
    }),
  );
}

module.exports = registerSystemIpc;
