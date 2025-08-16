const { withErrorLogging } = require('./withErrorLogging');

function registerAnalysisHistoryIpc({
  ipcMain,
  IPC_CHANNELS,
  logger,
  getServiceIntegration,
}) {
  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS_HISTORY.GET_STATISTICS,
    withErrorLogging(logger, async () => {
      try {
        return (
          (await getServiceIntegration()?.analysisHistory?.getStatistics()) ||
          {}
        );
      } catch (error) {
        logger.error('Failed to get analysis statistics:', error);
        return {};
      }
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS_HISTORY.GET,
    withErrorLogging(logger, async (event, options = {}) => {
      try {
        const { all = false, limit, offset = 0 } = options || {};
        if (all || limit === 'all') {
          const full =
            (await getServiceIntegration()?.analysisHistory?.getRecentAnalysis(
              Number.MAX_SAFE_INTEGER,
            )) || [];
          if (offset > 0) return full.slice(offset);
          return full;
        }
        const effLimit = typeof limit === 'number' && limit > 0 ? limit : 50;
        if (offset > 0) {
          const interim =
            (await getServiceIntegration()?.analysisHistory?.getRecentAnalysis(
              effLimit + offset,
            )) || [];
          return interim.slice(offset, offset + effLimit);
        }
        return (
          (await getServiceIntegration()?.analysisHistory?.getRecentAnalysis(
            effLimit,
          )) || []
        );
      } catch (error) {
        logger.error('Failed to get analysis history:', error);
        return [];
      }
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS_HISTORY.SEARCH,
    withErrorLogging(logger, async (event, query = '', options = {}) => {
      try {
        return (
          (await getServiceIntegration()?.analysisHistory?.searchAnalysis(
            query,
            options,
          )) || []
        );
      } catch (error) {
        logger.error('Failed to search analysis history:', error);
        return [];
      }
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS_HISTORY.GET_FILE_HISTORY,
    withErrorLogging(logger, async (event, filePath) => {
      try {
        return (
          (await getServiceIntegration()?.analysisHistory?.getAnalysisByPath(
            filePath,
          )) || null
        );
      } catch (error) {
        logger.error('Failed to get file analysis history:', error);
        return null;
      }
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS_HISTORY.CLEAR,
    withErrorLogging(logger, async () => {
      try {
        await getServiceIntegration()?.analysisHistory?.createDefaultStructures();
        return { success: true };
      } catch (error) {
        logger.error('Failed to clear analysis history:', error);
        return { success: false, error: error.message };
      }
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS_HISTORY.EXPORT,
    withErrorLogging(logger, async (event, format = 'json') => {
      try {
        const history =
          (await getServiceIntegration()?.analysisHistory?.getRecentAnalysis(
            10000,
          )) || [];
        if (format === 'json') {
          return {
            success: true,
            data: JSON.stringify(history, null, 2),
            mime: 'application/json',
            filename: 'analysis-history.json',
          };
        }
        if (format === 'csv') {
          const headers = [
            'fileName',
            'originalPath',
            'category',
            'confidence',
            'timestamp',
          ];
          const lines = [headers.join(',')];
          for (const entry of history) {
            const row = [
              JSON.stringify(entry.fileName || ''),
              JSON.stringify(entry.originalPath || ''),
              JSON.stringify(entry.analysis?.category || entry.category || ''),
              JSON.stringify(
                String(entry.analysis?.confidence ?? entry.confidence ?? ''),
              ),
              JSON.stringify(
                entry.timestamp ? new Date(entry.timestamp).toISOString() : '',
              ),
            ];
            lines.push(row.join(','));
          }
          return {
            success: true,
            data: lines.join('\n'),
            mime: 'text/csv',
            filename: 'analysis-history.csv',
          };
        }
        return { success: true, data: history };
      } catch (error) {
        logger.error('Failed to export analysis history:', error);
        return { success: false, error: error.message };
      }
    }),
  );
}

module.exports = registerAnalysisHistoryIpc;
