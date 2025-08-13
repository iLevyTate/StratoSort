const path = require('path');
const { performance } = require('perf_hooks');

function registerAnalysisIpc({ ipcMain, IPC_CHANNELS, logger, tesseract, systemAnalytics, analyzeDocumentFile, analyzeImageFile, serviceIntegration, getCustomFolders }) {
  ipcMain.handle(IPC_CHANNELS.ANALYSIS.ANALYZE_DOCUMENT, async (event, filePath) => {
    try {
      const startTime = performance.now();
      logger.info(`[IPC-ANALYSIS] Starting document analysis for: ${filePath}`);
      try { await serviceIntegration?.processingState?.markAnalysisStart(filePath); } catch {}
      const customFolders = getCustomFolders().filter(f => !f.isDefault || f.path);
      const folderCategories = customFolders.map(f => ({ name: f.name, description: f.description || '', id: f.id }));
      logger.info(`[IPC-ANALYSIS] Using ${folderCategories.length} smart folders for context:`, folderCategories.map(f => f.name).join(', '));
      const result = await analyzeDocumentFile(filePath, folderCategories);
      const duration = performance.now() - startTime; systemAnalytics.recordProcessingTime(duration);
      try {
        const stats = await require('fs').promises.stat(filePath);
        const fileInfo = { path: filePath, size: stats.size, lastModified: stats.mtimeMs, mimeType: null };
        const normalized = { subject: result.suggestedName || path.basename(filePath), category: result.category || 'uncategorized', tags: Array.isArray(result.keywords) ? result.keywords : [], confidence: typeof result.confidence === 'number' ? result.confidence : 0, summary: result.purpose || result.summary || '', extractedText: result.extractedText || null, model: result.model || 'llm', processingTime: duration, smartFolder: result.smartFolder || null, newName: result.suggestedName || null, renamed: Boolean(result.suggestedName) };
        await serviceIntegration?.analysisHistory?.recordAnalysis(fileInfo, normalized);
      } catch (historyError) { logger.warn('[ANALYSIS-HISTORY] Failed to record document analysis:', historyError.message); }
      try { await serviceIntegration?.processingState?.markAnalysisComplete(filePath); } catch {}
      return result;
    } catch (error) {
      logger.error(`[IPC] Document analysis failed for ${filePath}:`, error);
      systemAnalytics.recordFailure(error);
      try { await serviceIntegration?.processingState?.markAnalysisError(filePath, error.message); } catch {}
      return { error: error.message, suggestedName: path.basename(filePath, path.extname(filePath)), category: 'documents', keywords: [], confidence: 0 };
    }
  });

  ipcMain.handle(IPC_CHANNELS.ANALYSIS.ANALYZE_IMAGE, async (event, filePath) => {
    try {
      logger.info(`[IPC] Starting image analysis for: ${filePath}`);
      try { await serviceIntegration?.processingState?.markAnalysisStart(filePath); } catch {}
      const customFolders = getCustomFolders().filter(f => !f.isDefault || f.path);
      const folderCategories = customFolders.map(f => ({ name: f.name, description: f.description || '', id: f.id }));
      logger.info(`[IPC-IMAGE-ANALYSIS] Using ${folderCategories.length} smart folders for context:`, folderCategories.map(f => f.name).join(', '));
      const result = await analyzeImageFile(filePath, folderCategories);
      try {
        const stats = await require('fs').promises.stat(filePath);
        const fileInfo = { path: filePath, size: stats.size, lastModified: stats.mtimeMs, mimeType: null };
        const normalized = { subject: result.suggestedName || path.basename(filePath), category: result.category || 'uncategorized', tags: Array.isArray(result.keywords) ? result.keywords : [], confidence: typeof result.confidence === 'number' ? result.confidence : 0, summary: result.purpose || result.summary || '', extractedText: result.extractedText || null, model: result.model || 'vision', processingTime: 0, smartFolder: result.smartFolder || null, newName: result.suggestedName || null, renamed: Boolean(result.suggestedName) };
        await serviceIntegration?.analysisHistory?.recordAnalysis(fileInfo, normalized);
      } catch (historyError) { logger.warn('[ANALYSIS-HISTORY] Failed to record image analysis:', historyError.message); }
      try { await serviceIntegration?.processingState?.markAnalysisComplete(filePath); } catch {}
      return result;
    } catch (error) {
      logger.error(`[IPC] Image analysis failed for ${filePath}:`, error);
      try { await serviceIntegration?.processingState?.markAnalysisError(filePath, error.message); } catch {}
      return { error: error.message, suggestedName: path.basename(filePath, path.extname(filePath)), category: 'images', keywords: [], confidence: 0 };
    }
  });

  ipcMain.handle(IPC_CHANNELS.ANALYSIS.EXTRACT_IMAGE_TEXT, async (event, filePath) => {
    try {
      const start = performance.now();
      const text = await tesseract.recognize(filePath, { lang: 'eng', oem: 1, psm: 3 });
      const duration = performance.now() - start; systemAnalytics.recordProcessingTime(duration);
      return { success: true, text };
    } catch (error) {
      logger.error('OCR failed:', error);
      systemAnalytics.recordFailure(error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = registerAnalysisIpc;


