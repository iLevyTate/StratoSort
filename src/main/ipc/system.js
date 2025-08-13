function registerSystemIpc({ ipcMain, IPC_CHANNELS, logger, systemAnalytics, getServiceIntegration }) {
  ipcMain.handle(IPC_CHANNELS.SYSTEM.GET_APPLICATION_STATISTICS, async () => {
    try {
      const [analysisStats, historyRecent] = await Promise.all([
        getServiceIntegration()?.analysisHistory?.getStatistics?.() || Promise.resolve({}),
        getServiceIntegration()?.analysisHistory?.getRecentAnalysis?.(20) || Promise.resolve([])
      ]);
      return {
        analysis: analysisStats,
        recentActions: getServiceIntegration()?.undoRedo?.getActionHistory?.(20) || [],
        recentAnalysis: historyRecent,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to get system statistics:', error);
      return {};
    }
  });

  ipcMain.handle(IPC_CHANNELS.SYSTEM.GET_METRICS, async () => {
    try {
      return await systemAnalytics.collectMetrics();
    } catch (error) {
      logger.error('Failed to collect system metrics:', error);
      return {};
    }
  });
}

module.exports = registerSystemIpc;


