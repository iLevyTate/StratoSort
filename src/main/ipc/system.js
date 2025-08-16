const { withErrorLogging, withValidation } = require('./withErrorLogging');
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
        const [analysisStats, historyRecent] = await Promise.all([
          getServiceIntegration()?.analysisHistory?.getStatistics?.() ||
            Promise.resolve({}),
          getServiceIntegration()?.analysisHistory?.getRecentAnalysis?.(20) ||
            Promise.resolve([]),
        ]);
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
        return await systemAnalytics.collectMetrics();
      } catch (error) {
        logger.error('Failed to collect system metrics:', error);
        return {};
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
}

module.exports = registerSystemIpc;
