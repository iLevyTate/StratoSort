const { logger } = require('../../shared/logger');
const path = require('path');

/**
 * AutoOrganizeService - Handles automatic file organization
 * Uses the suggestion system behind the scenes for better accuracy
 * Only requires user intervention for low-confidence matches
 */
class AutoOrganizeService {
  constructor({
    suggestionService,
    settingsService,
    folderMatchingService,
    undoRedoService,
  }) {
    this.suggestionService = suggestionService;
    this.settings = settingsService;
    this.folderMatcher = folderMatchingService;
    this.undoRedo = undoRedoService;

    // Confidence thresholds for automatic organization
    this.thresholds = {
      autoApprove: 0.8, // Automatically approve >= 80% confidence
      requireReview: 0.5, // Require review for 50-79% confidence
      reject: 0.3, // Reject below 30% confidence
    };
  }

  /**
   * Automatically organize files based on their analysis
   * Uses suggestions behind the scenes for improved accuracy
   */
  async organizeFiles(files, smartFolders, options = {}) {
    const {
      requireConfirmation = false,
      confidenceThreshold = this.thresholds.autoApprove,
      defaultLocation = 'Documents',
      preserveNames = false,
    } = options;

    logger.info('[AutoOrganize] Starting automatic organization', {
      fileCount: files.length,
      smartFolderCount: smartFolders.length,
      confidenceThreshold,
    });

    const results = {
      organized: [],
      needsReview: [],
      failed: [],
      operations: [],
    };

    // Process each file
    for (const file of files) {
      try {
        // Skip files without analysis
        if (!file.analysis) {
          logger.warn(
            '[AutoOrganize] Skipping file without analysis:',
            file.name,
          );
          results.failed.push({
            file,
            reason: 'No analysis available',
          });
          continue;
        }

        // Get suggestion for the file
        const suggestion = await this.suggestionService.getSuggestionsForFile(
          file,
          smartFolders,
          { includeAlternatives: false },
        );

        if (!suggestion.success || !suggestion.primary) {
          // Use fallback logic from original system
          const fallbackDestination = this.getFallbackDestination(
            file,
            smartFolders,
            defaultLocation,
          );

          results.organized.push({
            file,
            destination: fallbackDestination,
            confidence: 0.3,
            method: 'fallback',
          });

          results.operations.push({
            type: 'move',
            source: file.path,
            destination: fallbackDestination,
          });
          continue;
        }

        const { primary } = suggestion;
        const confidence = suggestion.confidence || 0;

        // Determine action based on confidence
        if (confidence >= confidenceThreshold) {
          // High confidence - organize automatically
          const destination = this.buildDestinationPath(
            file,
            primary,
            defaultLocation,
            preserveNames,
          );

          results.organized.push({
            file,
            suggestion: primary,
            destination,
            confidence,
            method: 'automatic',
          });

          results.operations.push({
            type: 'move',
            source: file.path,
            destination,
          });

          // Record feedback for learning
          this.suggestionService.recordFeedback(file, primary, true);
        } else if (confidence >= this.thresholds.requireReview) {
          // Medium confidence - needs review
          results.needsReview.push({
            file,
            suggestion: primary,
            alternatives: suggestion.alternatives,
            confidence,
            explanation: suggestion.explanation,
          });
        } else {
          // Low confidence - use fallback
          const fallbackDestination = this.getFallbackDestination(
            file,
            smartFolders,
            defaultLocation,
          );

          results.organized.push({
            file,
            destination: fallbackDestination,
            confidence,
            method: 'low-confidence-fallback',
          });

          results.operations.push({
            type: 'move',
            source: file.path,
            destination: fallbackDestination,
          });
        }
      } catch (error) {
        logger.error('[AutoOrganize] Failed to process file:', {
          file: file.name,
          error: error.message,
        });
        results.failed.push({
          file,
          reason: error.message,
        });
      }
    }

    // Log summary
    logger.info('[AutoOrganize] Organization complete', {
      organized: results.organized.length,
      needsReview: results.needsReview.length,
      failed: results.failed.length,
    });

    return results;
  }

  /**
   * Batch organize with automatic confidence-based filtering
   */
  async batchOrganize(files, smartFolders, options = {}) {
    const {
      autoApproveThreshold = this.thresholds.autoApprove,
      groupByStrategy = true,
    } = options;

    logger.info('[AutoOrganize] Starting batch organization', {
      fileCount: files.length,
    });

    // Get batch suggestions
    const batchSuggestions = await this.suggestionService.getBatchSuggestions(
      files,
      smartFolders,
    );

    if (!batchSuggestions.success) {
      throw new Error('Failed to get batch suggestions');
    }

    const results = {
      operations: [],
      groups: [],
      skipped: [],
    };

    // Process groups
    for (const group of batchSuggestions.groups) {
      if (group.confidence >= autoApproveThreshold) {
        // Auto-approve high confidence groups
        for (const file of group.files) {
          const destination = this.buildDestinationPath(
            file,
            { folder: group.folder, path: group.path },
            options.defaultLocation || 'Documents',
            options.preserveNames,
          );

          results.operations.push({
            type: 'move',
            source: file.path,
            destination,
          });

          // Record positive feedback
          if (file.suggestion) {
            this.suggestionService.recordFeedback(file, file.suggestion, true);
          }
        }

        results.groups.push({
          folder: group.folder,
          files: group.files,
          confidence: group.confidence,
          autoApproved: true,
        });
      } else {
        // Skip low confidence groups for manual review
        results.skipped.push({
          folder: group.folder,
          files: group.files,
          confidence: group.confidence,
          reason: 'Low confidence',
        });
      }
    }

    logger.info('[AutoOrganize] Batch organization complete', {
      operationCount: results.operations.length,
      groupCount: results.groups.length,
      skippedCount: results.skipped.length,
    });

    return results;
  }

  /**
   * Get fallback destination for files with no good match
   */
  getFallbackDestination(file, smartFolders, defaultLocation) {
    // Try to match based on file type
    const fileType = this.getFileTypeCategory(file.extension);

    // Look for a smart folder that matches the file type
    const typeFolder = smartFolders.find((f) =>
      f.name.toLowerCase().includes(fileType.toLowerCase()),
    );

    if (typeFolder) {
      return path.join(
        typeFolder.path || `${defaultLocation}/${typeFolder.name}`,
        file.name,
      );
    }

    // Use category from analysis if available
    if (file.analysis?.category) {
      const categoryFolder = smartFolders.find(
        (f) => f.name.toLowerCase() === file.analysis.category.toLowerCase(),
      );

      if (categoryFolder) {
        return path.join(
          categoryFolder.path || `${defaultLocation}/${categoryFolder.name}`,
          file.name,
        );
      }

      // Create new folder based on category
      return path.join(defaultLocation, file.analysis.category, file.name);
    }

    // Ultimate fallback - organize by file type
    return path.join(defaultLocation, fileType, file.name);
  }

  /**
   * Build destination path for a file
   */
  buildDestinationPath(file, suggestion, defaultLocation, preserveNames) {
    const folderPath =
      suggestion.path || path.join(defaultLocation, suggestion.folder);

    const fileName = preserveNames
      ? file.name
      : file.analysis?.suggestedName || file.name;

    return path.join(folderPath, fileName);
  }

  /**
   * Get file type category
   */
  getFileTypeCategory(extension) {
    const categories = {
      documents: ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'],
      spreadsheets: ['xls', 'xlsx', 'csv', 'ods'],
      presentations: ['ppt', 'pptx', 'odp'],
      images: ['jpg', 'jpeg', 'png', 'gif', 'svg', 'bmp'],
      videos: ['mp4', 'avi', 'mov', 'wmv', 'flv'],
      audio: ['mp3', 'wav', 'flac', 'aac', 'm4a'],
      code: ['js', 'py', 'java', 'cpp', 'html', 'css'],
      archives: ['zip', 'rar', '7z', 'tar', 'gz'],
    };

    const ext = extension.toLowerCase().replace('.', '');

    for (const [category, extensions] of Object.entries(categories)) {
      if (extensions.includes(ext)) {
        return category.charAt(0).toUpperCase() + category.slice(1);
      }
    }

    return 'Files';
  }

  /**
   * Monitor and auto-organize new files (for Downloads folder watching)
   */
  async processNewFile(filePath, smartFolders, options = {}) {
    const {
      autoOrganizeEnabled = false,
      confidenceThreshold = 0.9, // Higher threshold for automatic processing
    } = options;

    if (!autoOrganizeEnabled) {
      logger.info(
        '[AutoOrganize] Auto-organize disabled, skipping file:',
        filePath,
      );
      return null;
    }

    try {
      // Analyze the file first
      const {
        analyzeDocumentFile,
        analyzeImageFile,
      } = require('../analysis/ollamaDocumentAnalysis');
      const extension = path.extname(filePath).toLowerCase();

      let analysis;
      if (['.jpg', '.jpeg', '.png', '.gif', '.bmp'].includes(extension)) {
        analysis = await analyzeImageFile(filePath, smartFolders);
      } else {
        analysis = await analyzeDocumentFile(filePath, smartFolders);
      }

      if (!analysis || analysis.error) {
        logger.warn('[AutoOrganize] Could not analyze file:', filePath);
        return null;
      }

      // Create file object
      const file = {
        name: path.basename(filePath),
        path: filePath,
        extension,
        analysis,
      };

      // Get suggestion
      const suggestion = await this.suggestionService.getSuggestionsForFile(
        file,
        smartFolders,
        { includeAlternatives: false },
      );

      // Only auto-organize if confidence is very high
      if (
        suggestion.success &&
        suggestion.primary &&
        suggestion.confidence >= confidenceThreshold
      ) {
        const destination = this.buildDestinationPath(
          file,
          suggestion.primary,
          options.defaultLocation || 'Documents',
          false,
        );

        logger.info('[AutoOrganize] Auto-organizing new file', {
          file: filePath,
          destination,
          confidence: suggestion.confidence,
        });

        // Record the action for undo
        const action = {
          type: 'FILE_MOVE',
          data: {
            originalPath: filePath,
            newPath: destination,
          },
          timestamp: Date.now(),
          description: `Auto-organized ${file.name}`,
        };

        if (this.undoRedo) {
          await this.undoRedo.recordAction(action);
        }

        return {
          source: filePath,
          destination,
          confidence: suggestion.confidence,
          suggestion: suggestion.primary,
        };
      }

      logger.info(
        '[AutoOrganize] File confidence too low for auto-organization',
        {
          file: filePath,
          confidence: suggestion.confidence || 0,
          threshold: confidenceThreshold,
        },
      );

      return null;
    } catch (error) {
      logger.error('[AutoOrganize] Error processing new file:', {
        file: filePath,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Get organization statistics
   */
  async getStatistics() {
    return {
      userPatterns: this.suggestionService.userPatterns.size,
      feedbackHistory: this.suggestionService.feedbackHistory.length,
      folderUsageStats: Array.from(
        this.suggestionService.folderUsageStats.entries(),
      ),
      thresholds: this.thresholds,
    };
  }

  /**
   * Update confidence thresholds
   */
  updateThresholds(newThresholds) {
    this.thresholds = {
      ...this.thresholds,
      ...newThresholds,
    };
    logger.info('[AutoOrganize] Updated thresholds:', this.thresholds);
  }
}

module.exports = AutoOrganizeService;
