const fs = require('fs').promises;
const path = require('path');

/**
 * Enhanced AI Analysis Service
 * Consolidates specialized analyzers with comprehensive progress tracking
 * and intelligent fallback analysis for unsupported files
 */
class EnhancedAiAnalysis {
  constructor(aiService) {
    this.aiService = aiService;
    this.analyzers = new Map();
    this.progressCallbacks = new Set();
    this.processingStats = {
      totalFiles: 0,
      processedFiles: 0,
      successfulAnalyses: 0,
      failedAnalyses: 0,
      averageTimeMs: 0,
      memoryUsageMB: 0
    };
    
    this.initializeAnalyzers();
  }

  /**
   * Initialize specialized analyzers
   */
  initializeAnalyzers() {
    // Document analyzer
    this.analyzers.set('document', new DocumentAnalyzer(this.aiService));
    
    // Image analyzer
    this.analyzers.set('image', new ImageAnalyzer(this.aiService));
    
    // Audio analyzer
    this.analyzers.set('audio', new AudioAnalyzer(this.aiService));
    
    // Archive analyzer
    this.analyzers.set('archive', new ArchiveAnalyzer(this.aiService));
    
    // Fallback analyzer
    this.analyzers.set('fallback', new FallbackAnalyzer(this.aiService));
  }

  /**
   * Add progress callback
   * @param {Function} callback - Progress callback function
   */
  addProgressCallback(callback) {
    this.progressCallbacks.add(callback);
  }

  /**
   * Remove progress callback
   * @param {Function} callback - Progress callback function
   */
  removeProgressCallback(callback) {
    this.progressCallbacks.delete(callback);
  }

  /**
   * Emit progress update
   * @param {Object} progress - Progress data
   */
  emitProgress(progress) {
    for (const callback of this.progressCallbacks) {
      try {
        callback(progress);
      } catch (error) {
        console.warn('Progress callback error:', error);
      }
    }
  }

  /**
   * Analyze file with specialized analyzer
   * @param {string} filePath - Path to file
   * @param {Object} options - Analysis options
   * @returns {Object} Analysis result
   */
  async analyzeFile(filePath, options = {}) {
    const startTime = Date.now();
    
    try {
      // Update stats
      this.processingStats.totalFiles++;
      
      // Emit progress
      this.emitProgress({
        type: 'file-start',
        filePath,
        progress: {
          current: this.processingStats.processedFiles + 1,
          total: this.processingStats.totalFiles
        }
      });

      // Determine file type and get appropriate analyzer
      const fileType = this.getFileType(filePath);
      const analyzer = this.analyzers.get(fileType) || this.analyzers.get('fallback');

      // Perform analysis
      const result = await analyzer.analyze(filePath, options);
      
      // Update stats
      this.processingStats.processedFiles++;
      this.processingStats.successfulAnalyses++;
      
      const processingTime = Date.now() - startTime;
      this.updateAverageTime(processingTime);
      this.updateMemoryUsage();

      // Emit progress
      this.emitProgress({
        type: 'file-complete',
        filePath,
        result,
        processingTime,
        progress: {
          current: this.processingStats.processedFiles,
          total: this.processingStats.totalFiles
        }
      });

      return {
        ...result,
        processingTime,
        analyzer: fileType,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      this.processingStats.processedFiles++;
      this.processingStats.failedAnalyses++;

      const processingTime = Date.now() - startTime;
      
      // Emit error progress
      this.emitProgress({
        type: 'file-error',
        filePath,
        error: error.message,
        processingTime,
        progress: {
          current: this.processingStats.processedFiles,
          total: this.processingStats.totalFiles
        }
      });

      throw new FileProcessingError(
        `Analysis failed for ${filePath}`,
        'ANALYSIS_FAILED',
        { originalError: error.message, processingTime }
      );
    }
  }

  /**
   * Batch analyze multiple files
   * @param {Array} filePaths - Array of file paths
   * @param {Object} options - Analysis options
   * @returns {Array} Analysis results
   */
  async analyzeFiles(filePaths, options = {}) {
    const { concurrent = 3, timeout = 300000 } = options;
    
    this.processingStats.totalFiles = filePaths.length;
    this.processingStats.processedFiles = 0;
    
    // Emit batch start
    this.emitProgress({
      type: 'batch-start',
      totalFiles: filePaths.length
    });

    const results = [];
    const errors = [];

    // Process in batches
    for (let i = 0; i < filePaths.length; i += concurrent) {
      const batch = filePaths.slice(i, i + concurrent);
      
      const batchPromises = batch.map(async (filePath) => {
        try {
          const result = await Promise.race([
            this.analyzeFile(filePath, options),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Analysis timeout')), timeout)
            )
          ]);
          
          return { filePath, result, success: true };
        } catch (error) {
          return { filePath, error: error.message, success: false };
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      
      for (const promiseResult of batchResults) {
        if (promiseResult.status === 'fulfilled') {
          const { filePath, result, error, success } = promiseResult.value;
          
          if (success) {
            results.push({ filePath, result });
          } else {
            errors.push({ filePath, error });
          }
        } else {
          errors.push({ 
            filePath: 'unknown', 
            error: promiseResult.reason?.message || 'Unknown error' 
          });
        }
      }
    }

    // Emit batch complete
    this.emitProgress({
      type: 'batch-complete',
      totalFiles: filePaths.length,
      successCount: results.length,
      errorCount: errors.length,
      stats: this.getProcessingStats()
    });

    return { results, errors };
  }

  /**
   * Determine file type for analysis
   * @param {string} filePath - File path
   * @returns {string} File type
   */
  getFileType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    
    const documentTypes = ['.pdf', '.doc', '.docx', '.txt', '.md', '.rtf'];
    const imageTypes = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];
    const audioTypes = ['.mp3', '.wav', '.flac', '.ogg', '.aac', '.m4a'];
    const archiveTypes = ['.zip', '.rar', '.7z', '.tar', '.gz'];

    if (documentTypes.includes(ext)) return 'document';
    if (imageTypes.includes(ext)) return 'image';
    if (audioTypes.includes(ext)) return 'audio';
    if (archiveTypes.includes(ext)) return 'archive';
    
    return 'fallback';
  }

  /**
   * Update average processing time
   * @param {number} newTime - New processing time
   */
  updateAverageTime(newTime) {
    const totalProcessed = this.processingStats.processedFiles;
    const currentAverage = this.processingStats.averageTimeMs;
    
    this.processingStats.averageTimeMs = 
      ((currentAverage * (totalProcessed - 1)) + newTime) / totalProcessed;
  }

  /**
   * Update memory usage statistics
   */
  updateMemoryUsage() {
    const memUsage = process.memoryUsage();
    this.processingStats.memoryUsageMB = memUsage.heapUsed / 1024 / 1024;
  }

  /**
   * Get processing statistics
   * @returns {Object} Processing stats
   */
  getProcessingStats() {
    return {
      ...this.processingStats,
      successRate: this.processingStats.totalFiles > 0 
        ? (this.processingStats.successfulAnalyses / this.processingStats.totalFiles) * 100 
        : 0,
      estimatedTimeRemaining: this.estimateTimeRemaining()
    };
  }

  /**
   * Estimate time remaining for batch processing
   * @returns {number} Estimated time in milliseconds
   */
  estimateTimeRemaining() {
    const remaining = this.processingStats.totalFiles - this.processingStats.processedFiles;
    return remaining * this.processingStats.averageTimeMs;
  }

  /**
   * Reset processing statistics
   */
  resetStats() {
    this.processingStats = {
      totalFiles: 0,
      processedFiles: 0,
      successfulAnalyses: 0,
      failedAnalyses: 0,
      averageTimeMs: 0,
      memoryUsageMB: 0
    };
  }
}

/**
 * Base analyzer class
 */
class BaseAnalyzer {
  constructor(aiService) {
    this.aiService = aiService;
  }

  async analyze(filePath, options) {
    throw new Error('analyze method must be implemented by subclass');
  }
}

/**
 * Document analyzer for text-based files
 */
class DocumentAnalyzer extends BaseAnalyzer {
  async analyze(filePath, options) {
    const content = await this.extractContent(filePath);
    
    return await this.aiService.analyzeDocument(content, {
      filename: path.basename(filePath),
      smartFolders: options.smartFolders || [],
      ...options
    });
  }

  async extractContent(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    
    switch (ext) {
      case '.txt':
      case '.md':
        return await fs.readFile(filePath, 'utf8');
      case '.pdf':
        return await this.extractPdfContent(filePath);
      case '.doc':
      case '.docx':
        return await this.extractDocContent(filePath);
      default:
        return await fs.readFile(filePath, 'utf8');
    }
  }

  async extractPdfContent(filePath) {
    // PDF extraction logic would go here
    // For now, return placeholder
    return `PDF content from ${path.basename(filePath)}`;
  }

  async extractDocContent(filePath) {
    // DOC/DOCX extraction logic would go here
    // For now, return placeholder
    return `Document content from ${path.basename(filePath)}`;
  }
}

/**
 * Image analyzer for visual files
 */
class ImageAnalyzer extends BaseAnalyzer {
  async analyze(filePath, options) {
    const metadata = await this.extractMetadata(filePath);
    
    return await this.aiService.analyzeImage(filePath, {
      metadata,
      smartFolders: options.smartFolders || [],
      ...options
    });
  }

  async extractMetadata(filePath) {
    // Image metadata extraction would go here
    const stats = await fs.stat(filePath);
    
    return {
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      filename: path.basename(filePath)
    };
  }
}

/**
 * Audio analyzer for audio files
 */
class AudioAnalyzer extends BaseAnalyzer {
  async analyze(filePath, options) {
    const metadata = await this.extractMetadata(filePath);
    
    return await this.aiService.analyzeAudio(filePath, {
      metadata,
      smartFolders: options.smartFolders || [],
      ...options
    });
  }

  async extractMetadata(filePath) {
    // Audio metadata extraction would go here
    const stats = await fs.stat(filePath);
    
    return {
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      filename: path.basename(filePath)
    };
  }
}

/**
 * Archive analyzer for compressed files
 */
class ArchiveAnalyzer extends BaseAnalyzer {
  async analyze(filePath, options) {
    const contents = await this.extractContents(filePath);
    
    return {
      suggestedName: this.generateArchiveName(filePath, contents),
      suggestedCategory: 'Archives',
      keywords: this.extractKeywords(contents),
      confidence: 85,
      summary: `Archive containing ${contents.length} items`,
      metadata: {
        fileCount: contents.length,
        archiveType: path.extname(filePath).toLowerCase()
      }
    };
  }

  async extractContents(filePath) {
    // Archive content extraction would go here
    // For now, return placeholder
    return [`file1.txt`, `file2.pdf`, `folder/file3.jpg`];
  }

  generateArchiveName(filePath, contents) {
    const baseName = path.basename(filePath, path.extname(filePath));
    const date = new Date().toISOString().split('T')[0];
    return `${baseName}_archive_${date}`;
  }

  extractKeywords(contents) {
    const extensions = contents.map(f => path.extname(f).toLowerCase())
      .filter(ext => ext)
      .filter((ext, index, arr) => arr.indexOf(ext) === index);
    
    return ['archive', 'compressed', ...extensions];
  }
}

/**
 * Fallback analyzer for unsupported files
 */
class FallbackAnalyzer extends BaseAnalyzer {
  async analyze(filePath, options) {
    const stats = await fs.stat(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const baseName = path.basename(filePath, ext);
    
    return {
      suggestedName: this.generateFallbackName(baseName),
      suggestedCategory: this.getCategoryFromExtension(ext),
      keywords: this.extractKeywordsFromFilename(baseName),
      confidence: 60,
      summary: `File analysis based on filename and metadata`,
      metadata: {
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        extension: ext,
        analysisType: 'fallback'
      }
    };
  }

  generateFallbackName(baseName) {
    const date = new Date().toISOString().split('T')[0];
    return `${baseName}_${date}`;
  }

  getCategoryFromExtension(ext) {
    const categoryMap = {
      '.exe': 'Applications',
      '.dll': 'System Files',
      '.config': 'Configuration',
      '.log': 'Logs',
      '.json': 'Data',
      '.xml': 'Data',
      '.csv': 'Data'
    };
    
    return categoryMap[ext] || 'Miscellaneous';
  }

  extractKeywordsFromFilename(filename) {
    return filename.toLowerCase()
      .split(/[_\-\s]+/)
      .filter(word => word.length > 2)
      .slice(0, 5);
  }
}

/**
 * File Processing Error class
 */
class FileProcessingError extends Error {
  constructor(message, code, metadata = {}) {
    super(message);
    this.name = 'FileProcessingError';
    this.code = code;
    this.metadata = metadata;
  }
}

module.exports = {
  EnhancedAiAnalysis,
  FileProcessingError,
  DocumentAnalyzer,
  ImageAnalyzer,
  AudioAnalyzer,
  ArchiveAnalyzer,
  FallbackAnalyzer
}; 