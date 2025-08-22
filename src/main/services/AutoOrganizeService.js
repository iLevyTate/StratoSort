const { logger } = require('../../shared/logger');
const path = require('path');
const {
  categoryMappingService,
} = require('../../shared/categoryMappingService');

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
      forceOrganize = false, // If true, generate operations even for medium confidence
      namingConvention = null, // Naming settings from Discover phase
    } = options;

    try {
      categoryMappingService.updateSmartFolders(smartFolders || []);
    } catch {}

    logger.info('[AutoOrganize] Starting automatic organization', {
      fileCount: files.length,
      smartFolderCount: smartFolders.length,
      confidenceThreshold,
      forceOrganize,
      preserveNames,
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
        // Skip files without analysis (unless forced)
        if (!file.analysis) {
          if (forceOrganize) {
            // Manual trigger - use fallback for unanalyzed files
            logger.info(
              '[AutoOrganize] Processing unanalyzed file with fallback (manual trigger):',
              file.name,
            );

            const fallbackDestination = this.getFallbackDestination(
              file,
              smartFolders,
              defaultLocation,
              namingConvention,
            );

            results.organized.push({
              file,
              destination: fallbackDestination,
              confidence: 0.3,
              method: 'manual-unanalyzed-fallback',
            });

            results.operations.push({
              type: 'move',
              source: file.path,
              destination: fallbackDestination,
            });
            continue;
          } else {
            // Automatic mode - skip unanalyzed files
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
            namingConvention,
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

        // Log the primary suggestion to debug path issues
        logger.debug('[AutoOrganize] Primary suggestion for file:', {
          fileName: file.name,
          suggestion: {
            folder: primary.folder,
            path: primary.path,
            description: primary.description,
            confidence: primary.confidence,
            source: primary.source,
            method: primary.method,
          },
        });

        // Validate the primary suggestion doesn't contain description text in path
        if (
          primary.path &&
          (primary.path.includes('To provide') ||
            primary.path.includes('addressing') ||
            primary.path.length > 200)
        ) {
          logger.warn(
            '[AutoOrganize] Invalid primary path contains description text:',
            {
              path: primary.path,
              file: file.name,
            },
          );

          // Fix the path by extracting only the folder structure
          if (primary.path.includes('\\')) {
            const parts = primary.path.split('\\');
            // Keep only valid folder parts (typically first 2-3 parts)
            primary.path = parts
              .filter((part) => part && part.length < 50 && !part.includes('.'))
              .slice(0, 2)
              .join('\\');
          }
        }

        // Determine action based on confidence
        if (confidence >= confidenceThreshold) {
          // High confidence - organize automatically
          const destination = this.buildDestinationPath(
            file,
            primary,
            defaultLocation,
            preserveNames,
            namingConvention,
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
          // Medium confidence - needs review (unless manually forced)
          if (forceOrganize) {
            // User manually triggered organization - organize even with medium confidence
            const destination = this.buildDestinationPath(
              file,
              primary,
              defaultLocation,
              preserveNames,
              namingConvention,
            );

            results.organized.push({
              file,
              suggestion: primary,
              destination,
              confidence,
              method: 'manual-approval',
            });

            results.operations.push({
              type: 'move',
              source: file.path,
              destination,
            });

            // Record positive feedback since user approved
            this.suggestionService.recordFeedback(file, primary, true);

            logger.debug(
              '[AutoOrganize] Medium confidence file organized due to manual trigger',
              {
                file: file.name,
                confidence,
                destination,
              },
            );
          } else {
            // Automatic mode - needs review
            results.needsReview.push({
              file,
              suggestion: primary,
              alternatives: suggestion.alternatives,
              confidence,
              explanation: suggestion.explanation,
            });
          }
        } else {
          // Low confidence - use fallback
          if (forceOrganize) {
            // Manual trigger - ALWAYS organize regardless of confidence
            const fallbackDestination = this.getFallbackDestination(
              file,
              smartFolders,
              defaultLocation,
              namingConvention,
            );

            results.organized.push({
              file,
              destination: fallbackDestination,
              confidence,
              method: 'manual-force-fallback',
            });

            results.operations.push({
              type: 'move',
              source: file.path,
              destination: fallbackDestination,
            });

            logger.debug(
              '[AutoOrganize] Very low confidence file forced to organize with fallback',
              {
                file: file.name,
                confidence,
                destination: fallbackDestination,
                forced: true,
              },
            );
          } else if (confidence >= 0.2) {
            // Automatic mode with minimal confidence
            const fallbackDestination = this.getFallbackDestination(
              file,
              smartFolders,
              defaultLocation,
              namingConvention,
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

            logger.debug('[AutoOrganize] Low confidence file using fallback', {
              file: file.name,
              confidence,
              destination: fallbackDestination,
              forced: false,
            });
          } else {
            // Very low confidence and not forced - skip
            results.failed.push({
              file,
              reason: 'Confidence too low for automatic organization',
              confidence,
            });
          }
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
      operations: results.operations.length,
      forceOrganize,
    });

    // Warn if manual organization generated no operations
    if (forceOrganize && results.operations.length === 0 && files.length > 0) {
      logger.warn(
        '[AutoOrganize] Manual organization generated no operations!',
        {
          filesProvided: files.length,
          organized: results.organized.length,
          needsReview: results.needsReview.length,
          failed: results.failed.length,
        },
      );
    }

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
            options.namingConvention,
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
  getFallbackDestination(
    file,
    smartFolders,
    defaultLocation,
    namingConvention,
  ) {
    // Try to match based on file type
    const fileType = this.getFileTypeCategory(file.extension);

    // Determine the file name to use
    let fileName = file.name;
    // Apply naming convention if provided and preserveNames is false (or undefined)
    if (namingConvention && namingConvention.preserveNames !== true) {
      fileName = this.applyNamingConvention(file, namingConvention);
    }

    // Look for a smart folder that matches the file type
    const typeFolder = smartFolders.find((f) =>
      f.name.toLowerCase().includes(fileType.toLowerCase()),
    );

    if (typeFolder) {
      const base = categoryMappingService.getDestinationPath(
        typeFolder.name,
        defaultLocation,
      );
      return path.join(base, fileName);
    }

    // Use category from analysis if available
    if (file.analysis?.category) {
      const categoryFolder = smartFolders.find(
        (f) => f.name.toLowerCase() === file.analysis.category.toLowerCase(),
      );

      if (categoryFolder) {
        const base = categoryMappingService.getDestinationPath(
          categoryFolder.name,
          defaultLocation,
        );
        return path.join(base, fileName);
      }

      const base = categoryMappingService.getDestinationPath(
        file.analysis.category,
        defaultLocation,
      );
      return path.join(base, fileName);
    }

    const base = categoryMappingService.getDestinationPath(
      fileType,
      defaultLocation,
    );
    return path.join(base, fileName);
  }

  /**
   * Build destination path for a file
   */
  buildDestinationPath(
    file,
    suggestion,
    defaultLocation,
    preserveNames,
    namingConvention,
  ) {
    // Ensure we have a valid folder path
    let folderPath;

    const invalidPath =
      !suggestion.path ||
      (suggestion.description &&
        typeof suggestion.path === 'string' &&
        suggestion.path.includes(suggestion.description)) ||
      (typeof suggestion.path === 'string' && suggestion.path.length > 240);

    // Use the category from analysis for consistent folder naming
    const category = file.analysis?.category || suggestion.folder || 'General';

    if (!invalidPath) {
      // Use the provided path, but prefer category-based path
      folderPath = suggestion.path;
    } else {
      // Always use category-based destination for consistency
      try {
        folderPath = categoryMappingService.getDestinationPath(
          category,
          defaultLocation,
        );
      } catch {
        folderPath = path.join(defaultLocation, category);
      }
    }

    logger.debug('[AutoOrganize] Using category for destination', {
      file: file.name,
      category,
      suggestionFolder: suggestion.folder,
      folderPath,
    });

    // Apply naming convention if provided, otherwise use suggested name
    let fileName;
    if (preserveNames) {
      fileName = file.name;
    } else if (namingConvention) {
      fileName = this.applyNamingConvention(file, namingConvention);
    } else {
      fileName = file.analysis?.suggestedName || file.name;
    }

    logger.debug('[AutoOrganize] File name determination', {
      file: file.name,
      preserveNames,
      hasNamingConvention: !!namingConvention,
      suggestedName: file.analysis?.suggestedName,
      finalFileName: fileName,
    });

    const destination = path.join(folderPath, fileName);

    logger.debug('[AutoOrganize] Built destination path', {
      file: file.name,
      folderPath,
      fileName,
      destination,
      suggestion: {
        folder: suggestion.folder,
        path: suggestion.path,
        description: suggestion.description,
      },
    });

    return destination;
  }

  /**
   * Apply naming convention to a file
   */
  applyNamingConvention(file, namingConvention) {
    const { convention, dateFormat, caseConvention, separator } =
      namingConvention;

    logger.debug('[AutoOrganizeService] Applying naming convention', {
      fileName: file.name,
      convention,
      dateFormat,
      caseConvention,
      separator,
    });

    // Base name should come from the analysis suggestion when available
    // Fall back to the original file name if no suggestion exists
    const baseName =
      file.analysis?.suggestedName || file.name.replace(/\.[^/.]+$/, '');
    const extension = file.name.includes('.')
      ? '.' + file.name.split('.').pop()
      : '';

    // Get the date (from analysis or current date)
    const date = file.analysis?.date
      ? new Date(file.analysis.date)
      : new Date();

    logger.debug('[AutoOrganizeService] Naming convention inputs', {
      fileName: file.name,
      baseName,
      extension,
      suggestedName: file.analysis?.suggestedName,
      date: date.toISOString(),
      namingConvention,
    });

    let newName = '';
    switch (convention) {
      case 'subject-date':
        newName = `${baseName}${separator}${this.formatDate(date, dateFormat)}`;
        break;
      case 'date-subject':
        newName = `${this.formatDate(date, dateFormat)}${separator}${baseName}`;
        break;
      case 'project-subject-date': {
        const project = file.analysis?.project || 'Project';
        newName = `${project}${separator}${baseName}${separator}${this.formatDate(date, dateFormat)}`;
        break;
      }
      case 'category-subject': {
        const category = file.analysis?.category || 'General';
        newName = `${category}${separator}${baseName}`;
        break;
      }
      case 'keep-original':
        newName = baseName;
        break;
      default:
        newName = baseName;
    }

    // Apply case convention
    newName = this.applyCaseConvention(newName, caseConvention);

    const finalName = newName + extension;
    logger.debug('[AutoOrganizeService] Name transformation', {
      original: file.name,
      baseName,
      newName,
      finalName,
    });

    return finalName;
  }

  formatDate(date, format) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    switch (format) {
      case 'YYYY-MM-DD':
        return `${year}-${month}-${day}`;
      case 'MM-DD-YYYY':
        return `${month}-${day}-${year}`;
      case 'DD-MM-YYYY':
        return `${day}-${month}-${year}`;
      case 'YYYYMMDD':
        return `${year}${month}${day}`;
      default:
        return `${year}-${month}-${day}`;
    }
  }

  applyCaseConvention(text, convention) {
    switch (convention) {
      case 'kebab-case':
        return text
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
      case 'snake_case':
        return text
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_|_$/g, '');
      case 'camelCase':
        return text
          .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) =>
            index === 0 ? word.toLowerCase() : word.toUpperCase(),
          )
          .replace(/\s+/g, '');
      case 'PascalCase':
        return text
          .replace(/(?:^\w|[A-Z]|\b\w)/g, (word) => word.toUpperCase())
          .replace(/\s+/g, '');
      case 'lowercase':
        return text.toLowerCase();
      case 'UPPERCASE':
        return text.toUpperCase();
      default:
        return text;
    }
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
          options.namingConvention,
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
