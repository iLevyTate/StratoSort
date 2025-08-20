const { withErrorLogging } = require('./withErrorLogging');
const OrganizationSuggestionService = require('../services/OrganizationSuggestionService');
const { logger } = require('../../shared/logger');

function registerSuggestionsIpc({
  ipcMain,
  IPC_CHANNELS,
  chromaDbService,
  folderMatchingService,
  settingsService,
  getCustomFolders,
}) {
  // Initialize the suggestion service
  const suggestionService = new OrganizationSuggestionService({
    chromaDbService,
    folderMatchingService,
    settingsService,
  });

  // Get suggestions for a single file
  ipcMain.handle(
    IPC_CHANNELS.SUGGESTIONS.GET_FILE_SUGGESTIONS,
    withErrorLogging(logger, async (event, { file, options = {} }) => {
      try {
        logger.info('[SUGGESTIONS] Getting suggestions for file:', file.name);

        const smartFolders = getCustomFolders();
        const suggestions = await suggestionService.getSuggestionsForFile(
          file,
          smartFolders,
          options,
        );

        logger.info('[SUGGESTIONS] Generated suggestions:', {
          file: file.name,
          primary: suggestions.primary?.folder,
          alternatives: suggestions.alternatives?.length || 0,
          confidence: suggestions.confidence,
        });

        return suggestions;
      } catch (error) {
        logger.error('[SUGGESTIONS] Failed to get file suggestions:', error);
        return {
          success: false,
          error: error.message,
        };
      }
    }),
  );

  // Get batch suggestions for multiple files
  ipcMain.handle(
    IPC_CHANNELS.SUGGESTIONS.GET_BATCH_SUGGESTIONS,
    withErrorLogging(logger, async (event, { files, options = {} }) => {
      try {
        logger.info(
          '[SUGGESTIONS] Getting batch suggestions for',
          files.length,
          'files',
        );

        const smartFolders = getCustomFolders();
        const batchSuggestions = await suggestionService.getBatchSuggestions(
          files,
          smartFolders,
        );

        logger.info('[SUGGESTIONS] Generated batch suggestions:', {
          fileCount: files.length,
          groups: batchSuggestions.groups?.length || 0,
          recommendations: batchSuggestions.recommendations?.length || 0,
        });

        return batchSuggestions;
      } catch (error) {
        logger.error('[SUGGESTIONS] Failed to get batch suggestions:', error);
        return {
          success: false,
          error: error.message,
          groups: [],
        };
      }
    }),
  );

  // Record user feedback on suggestions
  ipcMain.handle(
    IPC_CHANNELS.SUGGESTIONS.RECORD_FEEDBACK,
    withErrorLogging(logger, async (event, { file, suggestion, accepted }) => {
      try {
        logger.info('[SUGGESTIONS] Recording feedback:', {
          file: file.name,
          suggestion: suggestion?.folder,
          accepted,
        });

        suggestionService.recordFeedback(file, suggestion, accepted);

        return {
          success: true,
        };
      } catch (error) {
        logger.error('[SUGGESTIONS] Failed to record feedback:', error);
        return {
          success: false,
          error: error.message,
        };
      }
    }),
  );

  // Get organization strategies
  ipcMain.handle(
    IPC_CHANNELS.SUGGESTIONS.GET_STRATEGIES,
    withErrorLogging(logger, async (event) => {
      try {
        logger.info('[SUGGESTIONS] Getting organization strategies');

        return {
          success: true,
          strategies: Object.entries(suggestionService.strategies).map(
            ([id, strategy]) => ({
              id,
              ...strategy,
            }),
          ),
        };
      } catch (error) {
        logger.error('[SUGGESTIONS] Failed to get strategies:', error);
        return {
          success: false,
          error: error.message,
          strategies: [],
        };
      }
    }),
  );

  // Apply a specific strategy to files
  ipcMain.handle(
    IPC_CHANNELS.SUGGESTIONS.APPLY_STRATEGY,
    withErrorLogging(logger, async (event, { files, strategyId }) => {
      try {
        logger.info('[SUGGESTIONS] Applying strategy:', {
          strategy: strategyId,
          fileCount: files.length,
        });

        const strategy = suggestionService.strategies[strategyId];
        if (!strategy) {
          throw new Error(`Unknown strategy: ${strategyId}`);
        }

        const smartFolders = getCustomFolders();
        const results = [];

        for (const file of files) {
          const folder = suggestionService.mapFileToStrategy(
            file,
            strategy,
            smartFolders,
          );
          results.push({
            file,
            folder,
            strategy: strategyId,
          });
        }

        return {
          success: true,
          results,
        };
      } catch (error) {
        logger.error('[SUGGESTIONS] Failed to apply strategy:', error);
        return {
          success: false,
          error: error.message,
        };
      }
    }),
  );

  // Get user patterns (for debugging/UI display)
  ipcMain.handle(
    IPC_CHANNELS.SUGGESTIONS.GET_USER_PATTERNS,
    withErrorLogging(logger, async (event) => {
      try {
        logger.info('[SUGGESTIONS] Getting user patterns');

        const patterns = Array.from(
          suggestionService.userPatterns.entries(),
        ).map(([pattern, data]) => ({
          pattern,
          ...data,
        }));

        return {
          success: true,
          patterns,
        };
      } catch (error) {
        logger.error('[SUGGESTIONS] Failed to get user patterns:', error);
        return {
          success: false,
          error: error.message,
          patterns: [],
        };
      }
    }),
  );

  // Clear user patterns (for testing/reset)
  ipcMain.handle(
    IPC_CHANNELS.SUGGESTIONS.CLEAR_PATTERNS,
    withErrorLogging(logger, async (event) => {
      try {
        logger.info('[SUGGESTIONS] Clearing user patterns');

        suggestionService.userPatterns.clear();
        suggestionService.feedbackHistory = [];

        return {
          success: true,
        };
      } catch (error) {
        logger.error('[SUGGESTIONS] Failed to clear patterns:', error);
        return {
          success: false,
          error: error.message,
        };
      }
    }),
  );

  // Analyze folder structure for improvements
  ipcMain.handle(
    IPC_CHANNELS.SUGGESTIONS.ANALYZE_FOLDER_STRUCTURE,
    withErrorLogging(logger, async (event, { files = [] }) => {
      try {
        logger.info('[SUGGESTIONS] Analyzing folder structure');

        const smartFolders = getCustomFolders();
        const improvements = await suggestionService.analyzeFolderStructure(
          smartFolders,
          files,
        );

        logger.info('[SUGGESTIONS] Folder analysis complete:', {
          improvementCount: improvements.length,
          smartFolderCount: smartFolders.length,
        });

        return {
          success: true,
          improvements,
          smartFolders,
        };
      } catch (error) {
        logger.error(
          '[SUGGESTIONS] Failed to analyze folder structure:',
          error,
        );
        return {
          success: false,
          error: error.message,
          improvements: [],
        };
      }
    }),
  );

  // Suggest new smart folder
  ipcMain.handle(
    IPC_CHANNELS.SUGGESTIONS.SUGGEST_NEW_FOLDER,
    withErrorLogging(logger, async (event, { file }) => {
      try {
        logger.info('[SUGGESTIONS] Suggesting new folder for:', file.name);

        const smartFolders = getCustomFolders();
        const suggestion = await suggestionService.suggestNewSmartFolder(
          file,
          smartFolders,
        );

        return {
          success: true,
          suggestion,
        };
      } catch (error) {
        logger.error('[SUGGESTIONS] Failed to suggest new folder:', error);
        return {
          success: false,
          error: error.message,
        };
      }
    }),
  );

  logger.info('[IPC] Suggestions handlers registered');

  return suggestionService;
}

module.exports = { registerSuggestionsIpc };
