const path = require('path');
const { performance } = require('perf_hooks');
const {
  withErrorLogging,
  withValidation,
  withEnhancedValidation,
  schemas,
} = require('./withErrorLogging');
let z;
try {
  z = require('zod');
} catch {
  z = null;
}

function registerAnalysisIpc({
  ipcMain,
  IPC_CHANNELS,
  logger,
  tesseract,
  systemAnalytics,
  analyzeDocumentFile,
  analyzeImageFile,
  getServiceIntegration,
  getCustomFolders,
}) {
  const stringSchema = z ? z.string().min(1) : null;
  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS.ANALYZE_DOCUMENT,
    z && stringSchema
      ? withEnhancedValidation(
          logger,
          schemas?.filePath || schemas?.string,
          async (event, filePath) => {
            try {
              const startTime = performance.now();
              logger.info(
                `[IPC-ANALYSIS] Starting document analysis for: ${filePath}`,
              );

              // Check if file exists before analysis
              const fs = require('fs').promises;
              try {
                const stats = await fs.stat(filePath);
                logger.info(
                  `[IPC-ANALYSIS] File stats: size=${stats.size}, mtime=${stats.mtime}`,
                );
              } catch (fileError) {
                logger.error(
                  `[IPC-ANALYSIS] File access error:`,
                  fileError.message,
                );
                throw new Error(`Cannot access file: ${fileError.message}`);
              }

              const serviceIntegration =
                getServiceIntegration && getServiceIntegration();
              try {
                await serviceIntegration?.processingState?.markAnalysisStart(
                  filePath,
                );
              } catch (stateError) {
                logger.debug(
                  '[IPC-ANALYSIS] Processing state error:',
                  stateError?.message,
                );
              }

              const customFolders = getCustomFolders().filter(
                (f) => !f.isDefault || f.path,
              );
              const folderCategories = customFolders.map((f) => ({
                name: f.name,
                description: f.description || '',
                id: f.id,
              }));
              logger.info(
                `[IPC-ANALYSIS] Using ${folderCategories.length} smart folders for context:`,
                folderCategories.map((f) => f.name).join(', '),
              );

              logger.info(`[IPC-ANALYSIS] Calling analyzeDocumentFile...`);

              // Add timeout to analysis call
              const analysisTimeout = 120000; // 2 minutes timeout
              const analysisPromise = analyzeDocumentFile(
                filePath,
                folderCategories,
              );

              const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => {
                  reject(
                    new Error(`Analysis timed out after ${analysisTimeout}ms`),
                  );
                }, analysisTimeout);
              });

              const result = await Promise.race([
                analysisPromise,
                timeoutPromise,
              ]);
              const duration = performance.now() - startTime;
              logger.info(
                `[IPC-ANALYSIS] Analysis completed in ${duration}ms, result:`,
                result,
              );

              systemAnalytics.recordProcessingTime(duration);
              try {
                const stats = await require('fs').promises.stat(filePath);
                const fileInfo = {
                  path: filePath,
                  size: stats.size,
                  lastModified: stats.mtimeMs,
                  mimeType: null,
                };
                const normalized = {
                  subject: result.suggestedName || path.basename(filePath),
                  category: result.category || 'uncategorized',
                  tags: Array.isArray(result.keywords) ? result.keywords : [],
                  confidence:
                    typeof result.confidence === 'number'
                      ? result.confidence
                      : 0,
                  summary: result.purpose || result.summary || '',
                  extractedText: result.extractedText || null,
                  model: result.model || 'llm',
                  processingTime: duration,
                  smartFolder: result.smartFolder || null,
                  newName: result.suggestedName || null,
                  renamed: Boolean(result.suggestedName),
                };
                await serviceIntegration?.analysisHistory?.recordAnalysis(
                  fileInfo,
                  normalized,
                );
                logger.info(`[IPC-ANALYSIS] Analysis recorded to history`);
              } catch (historyError) {
                logger.warn(
                  '[ANALYSIS-HISTORY] Failed to record document analysis:',
                  historyError.message,
                );
              }
              try {
                await serviceIntegration?.processingState?.markAnalysisComplete(
                  filePath,
                );
                logger.info(`[IPC-ANALYSIS] Processing state marked complete`);
              } catch (completeError) {
                logger.debug(
                  '[IPC-ANALYSIS] Processing state complete error:',
                  completeError?.message,
                );
              }
              // Ensure the returned analysis result is structured-cloneable for IPC
              try {
                const {
                  validateAnalysisResult,
                } = require('../analysis/analysisUtils');
                const safe = validateAnalysisResult(result, {
                  category: 'document',
                  keywords: [],
                  confidence: 0,
                });
                return safe;
              } catch (e) {
                logger.debug(
                  '[IPC-ANALYSIS] Failed to validate result for IPC, returning minimal payload:',
                  e?.message || e,
                );
                return {
                  subject:
                    result && result.suggestedName
                      ? result.suggestedName
                      : path.basename(filePath),
                  category:
                    result && result.category
                      ? result.category
                      : 'uncategorized',
                  keywords: Array.isArray(result && result.keywords)
                    ? result.keywords
                    : [],
                  confidence:
                    typeof result?.confidence === 'number'
                      ? result.confidence
                      : 0,
                };
              }
            } catch (error) {
              logger.error(
                `[IPC] Document analysis failed for ${filePath}:`,
                error,
              );
              systemAnalytics.recordFailure(error);
              const serviceIntegration =
                getServiceIntegration && getServiceIntegration();
              try {
                await serviceIntegration?.processingState?.markAnalysisError(
                  filePath,
                  error.message,
                );
              } catch {}
              return {
                error: error.message,
                suggestedName: path.basename(filePath, path.extname(filePath)),
                category: 'documents',
                keywords: [],
                confidence: 0,
              };
            }
          },
        )
      : withErrorLogging(logger, async (event, filePath) => {
          try {
            const startTime = performance.now();
            logger.info(
              `[IPC-ANALYSIS] Starting document analysis for: ${filePath}`,
            );

            // Check if file exists before analysis
            const fs = require('fs').promises;
            try {
              const stats = await fs.stat(filePath);
              logger.info(
                `[IPC-ANALYSIS] File stats: size=${stats.size}, mtime=${stats.mtime}`,
              );
            } catch (fileError) {
              logger.error(
                `[IPC-ANALYSIS] File access error:`,
                fileError.message,
              );
              throw new Error(`Cannot access file: ${fileError.message}`);
            }

            const serviceIntegration =
              getServiceIntegration && getServiceIntegration();
            try {
              await serviceIntegration?.processingState?.markAnalysisStart(
                filePath,
              );
            } catch (stateError) {
              logger.debug(
                '[IPC-ANALYSIS] Processing state error:',
                stateError?.message,
              );
            }

            const customFolders = getCustomFolders().filter(
              (f) => !f.isDefault || f.path,
            );
            const folderCategories = customFolders.map((f) => ({
              name: f.name,
              description: f.description || '',
              id: f.id,
            }));
            logger.info(
              `[IPC-ANALYSIS] Using ${folderCategories.length} smart folders for context:`,
              folderCategories.map((f) => f.name).join(', '),
            );

            logger.info(`[IPC-ANALYSIS] Calling analyzeDocumentFile...`);

            // Add timeout to analysis call
            const analysisTimeout = 120000; // 2 minutes timeout
            const analysisPromise = analyzeDocumentFile(
              filePath,
              folderCategories,
            );

            const timeoutPromise = new Promise((_, reject) => {
              setTimeout(() => {
                reject(
                  new Error(`Analysis timed out after ${analysisTimeout}ms`),
                );
              }, analysisTimeout);
            });

            const result = await Promise.race([
              analysisPromise,
              timeoutPromise,
            ]);
            const duration = performance.now() - startTime;
            logger.info(
              `[IPC-ANALYSIS] Analysis completed in ${duration}ms, result:`,
              result,
            );

            systemAnalytics.recordProcessingTime(duration);
            try {
              const stats = await require('fs').promises.stat(filePath);
              const fileInfo = {
                path: filePath,
                size: stats.size,
                lastModified: stats.mtimeMs,
                mimeType: null,
              };
              const normalized = {
                subject: result.suggestedName || path.basename(filePath),
                category: result.category || 'uncategorized',
                tags: Array.isArray(result.keywords) ? result.keywords : [],
                confidence:
                  typeof result.confidence === 'number' ? result.confidence : 0,
                summary: result.purpose || result.summary || '',
                extractedText: result.extractedText || null,
                model: result.model || 'llm',
                processingTime: duration,
                smartFolder: result.smartFolder || null,
                newName: result.suggestedName || null,
                renamed: Boolean(result.suggestedName),
              };
              await serviceIntegration?.analysisHistory?.recordAnalysis(
                fileInfo,
                normalized,
              );
              logger.info(`[IPC-ANALYSIS] Analysis recorded to history`);
            } catch (historyError) {
              logger.warn(
                '[ANALYSIS-HISTORY] Failed to record document analysis:',
                historyError.message,
              );
            }
            try {
              await serviceIntegration?.processingState?.markAnalysisComplete(
                filePath,
              );
              logger.info(`[IPC-ANALYSIS] Processing state marked complete`);
            } catch (completeError) {
              logger.debug(
                '[IPC-ANALYSIS] Processing state complete error:',
                completeError?.message,
              );
            }
            // Ensure the returned analysis result is structured-cloneable for IPC
            try {
              const {
                validateAnalysisResult,
              } = require('../analysis/analysisUtils');
              const safe = validateAnalysisResult(result, {
                category: 'document',
                keywords: [],
                confidence: 0,
              });
              return safe;
            } catch (e) {
              logger.debug(
                '[IPC-ANALYSIS] Failed to validate result for IPC, returning minimal payload:',
                e?.message || e,
              );
              return {
                subject:
                  result && result.suggestedName
                    ? result.suggestedName
                    : path.basename(filePath),
                category:
                  result && result.category ? result.category : 'uncategorized',
                keywords: Array.isArray(result && result.keywords)
                  ? result.keywords
                  : [],
                confidence:
                  typeof result?.confidence === 'number'
                    ? result.confidence
                    : 0,
              };
            }
          } catch (error) {
            logger.error(
              `[IPC] Document analysis failed for ${filePath}:`,
              error,
            );
            systemAnalytics.recordFailure(error);
            const serviceIntegration =
              getServiceIntegration && getServiceIntegration();
            try {
              await serviceIntegration?.processingState?.markAnalysisError(
                filePath,
                error.message,
              );
            } catch {}
            return {
              error: error.message,
              suggestedName: path.basename(filePath, path.extname(filePath)),
              category: 'documents',
              keywords: [],
              confidence: 0,
            };
          }
        }),
  );

  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS.ANALYZE_IMAGE,
    z && stringSchema
      ? withValidation(logger, stringSchema, async (event, filePath) => {
          try {
            logger.info(`[IPC] Starting image analysis for: ${filePath}`);
            const serviceIntegration =
              getServiceIntegration && getServiceIntegration();
            try {
              await serviceIntegration?.processingState?.markAnalysisStart(
                filePath,
              );
            } catch {}
            const customFolders = getCustomFolders().filter(
              (f) => !f.isDefault || f.path,
            );
            const folderCategories = customFolders.map((f) => ({
              name: f.name,
              description: f.description || '',
              id: f.id,
            }));
            logger.info(
              `[IPC-IMAGE-ANALYSIS] Using ${folderCategories.length} smart folders for context:`,
              folderCategories.map((f) => f.name).join(', '),
            );
            const result = await analyzeImageFile(filePath, folderCategories);
            try {
              const stats = await require('fs').promises.stat(filePath);
              const fileInfo = {
                path: filePath,
                size: stats.size,
                lastModified: stats.mtimeMs,
                mimeType: null,
              };
              const normalized = {
                subject: result.suggestedName || path.basename(filePath),
                category: result.category || 'uncategorized',
                tags: Array.isArray(result.keywords) ? result.keywords : [],
                confidence:
                  typeof result.confidence === 'number' ? result.confidence : 0,
                summary: result.purpose || result.summary || '',
                extractedText: result.extractedText || null,
                model: result.model || 'vision',
                processingTime: 0,
                smartFolder: result.smartFolder || null,
                newName: result.suggestedName || null,
                renamed: Boolean(result.suggestedName),
              };
              await serviceIntegration?.analysisHistory?.recordAnalysis(
                fileInfo,
                normalized,
              );
            } catch (historyError) {
              logger.warn(
                '[ANALYSIS-HISTORY] Failed to record image analysis:',
                historyError.message,
              );
            }
            try {
              await serviceIntegration?.processingState?.markAnalysisComplete(
                filePath,
              );
            } catch {}
            return result;
          } catch (error) {
            logger.error(`[IPC] Image analysis failed for ${filePath}:`, error);
            const serviceIntegration =
              getServiceIntegration && getServiceIntegration();
            try {
              await serviceIntegration?.processingState?.markAnalysisError(
                filePath,
                error.message,
              );
            } catch {}
            return {
              error: error.message,
              suggestedName: path.basename(filePath, path.extname(filePath)),
              category: 'images',
              keywords: [],
              confidence: 0,
            };
          }
        })
      : withErrorLogging(logger, async (event, filePath) => {
          try {
            logger.info(`[IPC] Starting image analysis for: ${filePath}`);
            const serviceIntegration =
              getServiceIntegration && getServiceIntegration();
            try {
              await serviceIntegration?.processingState?.markAnalysisStart(
                filePath,
              );
            } catch {}
            const customFolders = getCustomFolders().filter(
              (f) => !f.isDefault || f.path,
            );
            const folderCategories = customFolders.map((f) => ({
              name: f.name,
              description: f.description || '',
              id: f.id,
            }));
            logger.info(
              `[IPC-IMAGE-ANALYSIS] Using ${folderCategories.length} smart folders for context:`,
              folderCategories.map((f) => f.name).join(', '),
            );
            const result = await analyzeImageFile(filePath, folderCategories);
            try {
              const stats = await require('fs').promises.stat(filePath);
              const fileInfo = {
                path: filePath,
                size: stats.size,
                lastModified: stats.mtimeMs,
                mimeType: null,
              };
              const normalized = {
                subject: result.suggestedName || path.basename(filePath),
                category: result.category || 'uncategorized',
                tags: Array.isArray(result.keywords) ? result.keywords : [],
                confidence:
                  typeof result.confidence === 'number' ? result.confidence : 0,
                summary: result.purpose || result.summary || '',
                extractedText: result.extractedText || null,
                model: result.model || 'vision',
                processingTime: 0,
                smartFolder: result.smartFolder || null,
                newName: result.suggestedName || null,
                renamed: Boolean(result.suggestedName),
              };
              await serviceIntegration?.analysisHistory?.recordAnalysis(
                fileInfo,
                normalized,
              );
            } catch (historyError) {
              logger.warn(
                '[ANALYSIS-HISTORY] Failed to record image analysis:',
                historyError.message,
              );
            }
            try {
              await serviceIntegration?.processingState?.markAnalysisComplete(
                filePath,
              );
            } catch {}
            return result;
          } catch (error) {
            logger.error(`[IPC] Image analysis failed for ${filePath}:`, error);
            const serviceIntegration =
              getServiceIntegration && getServiceIntegration();
            try {
              await serviceIntegration?.processingState?.markAnalysisError(
                filePath,
                error.message,
              );
            } catch {}
            return {
              error: error.message,
              suggestedName: path.basename(filePath, path.extname(filePath)),
              category: 'images',
              keywords: [],
              confidence: 0,
            };
          }
        }),
  );

  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS.EXTRACT_IMAGE_TEXT,
    z && stringSchema
      ? withValidation(logger, stringSchema, async (event, filePath) => {
          try {
            const start = performance.now();
            const text = await tesseract.recognize(filePath, {
              lang: 'eng',
              oem: 1,
              psm: 3,
            });
            const duration = performance.now() - start;
            systemAnalytics.recordProcessingTime(duration);
            return { success: true, text };
          } catch (error) {
            logger.error('OCR failed:', error);
            systemAnalytics.recordFailure(error);
            return { success: false, error: error.message };
          }
        })
      : withErrorLogging(logger, async (event, filePath) => {
          try {
            const start = performance.now();
            const text = await tesseract.recognize(filePath, {
              lang: 'eng',
              oem: 1,
              psm: 3,
            });
            const duration = performance.now() - start;
            systemAnalytics.recordProcessingTime(duration);
            return { success: true, text };
          } catch (error) {
            logger.error('OCR failed:', error);
            systemAnalytics.recordFailure(error);
            return { success: false, error: error.message };
          }
        }),
  );
}

module.exports = registerAnalysisIpc;
