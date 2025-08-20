const { withErrorLogging } = require('./withErrorLogging');
const { logger } = require('../../shared/logger');

function registerOrganizeIpc({
  ipcMain,
  IPC_CHANNELS,
  getServiceIntegration,
  getCustomFolders,
}) {
  // Auto-organize files
  ipcMain.handle(
    IPC_CHANNELS.ORGANIZE.AUTO,
    withErrorLogging(
      logger,
      async (event, { files, smartFolders, options = {} }) => {
        try {
          logger.info('[ORGANIZE] Starting auto-organize', {
            fileCount: files.length,
          });

          const serviceIntegration = getServiceIntegration();
          if (!serviceIntegration || !serviceIntegration.autoOrganizeService) {
            throw new Error('Auto-organize service not available');
          }

          const folders = smartFolders || getCustomFolders();
          const result =
            await serviceIntegration.autoOrganizeService.organizeFiles(
              files,
              folders,
              options,
            );

          logger.info('[ORGANIZE] Auto-organize complete', {
            organized: result.organized.length,
            needsReview: result.needsReview.length,
            failed: result.failed.length,
          });

          return result;
        } catch (error) {
          logger.error('[ORGANIZE] Auto-organize failed:', error);
          throw error;
        }
      },
    ),
  );

  // Batch organize with auto-approval
  ipcMain.handle(
    IPC_CHANNELS.ORGANIZE.BATCH,
    withErrorLogging(
      logger,
      async (event, { files, smartFolders, options = {} }) => {
        try {
          logger.info('[ORGANIZE] Starting batch organize', {
            fileCount: files.length,
          });

          const serviceIntegration = getServiceIntegration();
          if (!serviceIntegration || !serviceIntegration.autoOrganizeService) {
            throw new Error('Auto-organize service not available');
          }

          const folders = smartFolders || getCustomFolders();
          const result =
            await serviceIntegration.autoOrganizeService.batchOrganize(
              files,
              folders,
              options,
            );

          logger.info('[ORGANIZE] Batch organize complete', {
            operationCount: result.operations.length,
            groupCount: result.groups.length,
          });

          return result;
        } catch (error) {
          logger.error('[ORGANIZE] Batch organize failed:', error);
          throw error;
        }
      },
    ),
  );

  // Process new file (for auto-organize on download)
  ipcMain.handle(
    IPC_CHANNELS.ORGANIZE.PROCESS_NEW,
    withErrorLogging(logger, async (event, { filePath, options = {} }) => {
      try {
        logger.info('[ORGANIZE] Processing new file', { filePath });

        const serviceIntegration = getServiceIntegration();
        if (!serviceIntegration || !serviceIntegration.autoOrganizeService) {
          throw new Error('Auto-organize service not available');
        }

        const smartFolders = getCustomFolders();
        const result =
          await serviceIntegration.autoOrganizeService.processNewFile(
            filePath,
            smartFolders,
            options,
          );

        if (result) {
          logger.info('[ORGANIZE] New file organized', result);
        } else {
          logger.info(
            '[ORGANIZE] New file not organized (low confidence or disabled)',
          );
        }

        return result;
      } catch (error) {
        logger.error('[ORGANIZE] Failed to process new file:', error);
        throw error;
      }
    }),
  );

  // Get organization statistics
  ipcMain.handle(
    IPC_CHANNELS.ORGANIZE.GET_STATS,
    withErrorLogging(logger, async (event) => {
      try {
        const serviceIntegration = getServiceIntegration();
        if (!serviceIntegration || !serviceIntegration.autoOrganizeService) {
          return {
            userPatterns: 0,
            feedbackHistory: 0,
            folderUsageStats: [],
            thresholds: {},
          };
        }

        const stats =
          await serviceIntegration.autoOrganizeService.getStatistics();
        return stats;
      } catch (error) {
        logger.error('[ORGANIZE] Failed to get statistics:', error);
        return {
          userPatterns: 0,
          feedbackHistory: 0,
          folderUsageStats: [],
          thresholds: {},
        };
      }
    }),
  );

  // Update confidence thresholds
  ipcMain.handle(
    IPC_CHANNELS.ORGANIZE.UPDATE_THRESHOLDS,
    withErrorLogging(logger, async (event, { thresholds }) => {
      try {
        const serviceIntegration = getServiceIntegration();
        if (!serviceIntegration || !serviceIntegration.autoOrganizeService) {
          throw new Error('Auto-organize service not available');
        }

        serviceIntegration.autoOrganizeService.updateThresholds(thresholds);

        return {
          success: true,
          thresholds,
        };
      } catch (error) {
        logger.error('[ORGANIZE] Failed to update thresholds:', error);
        return {
          success: false,
          error: error.message,
        };
      }
    }),
  );

  logger.info('[IPC] Auto-organize handlers registered');
}

module.exports = { registerOrganizeIpc };
