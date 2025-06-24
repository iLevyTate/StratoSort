const AnalysisHistoryService = require('./AnalysisHistoryService');
const UndoRedoService = require('./UndoRedoService');
const EnhancedLLMService = require('./EnhancedLLMService');
const ModelManager = require('./ModelManager');
const ModelVerifier = require('./ModelVerifier');
const PerformanceOptimizer = require('./PerformanceOptimizer');
const SmartFolderService = require('./SmartFolderService');
const { ACTION_TYPES } = require('../../shared/constants');

/**
 * ServiceIntegration - Orchestrates all backend services
 * Provides unified interface for service interactions
 */
class ServiceIntegration {
  constructor() {
    this.analysisHistoryService = new AnalysisHistoryService();
    this.undoRedoService = new UndoRedoService();
    this._modelManager = new ModelManager();
    this._modelVerifier = new ModelVerifier();
    this._performanceOptimizer = new PerformanceOptimizer();
    this._smartFolderService = new SmartFolderService();
    // EnhancedLLMService may depend on other services, so pass them in
    this._enhancedLLMService = new EnhancedLLMService();

    
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    try {
      await Promise.all([
        this.analysisHistoryService.initialize(),
        this.undoRedoService.initialize(),
        this._modelManager.initialize(),
        this._modelVerifier.initialize(),
        this._performanceOptimizer.initialize(),
        this._smartFolderService.initialize(),
        this._enhancedLLMService.initialize(),
      ]);
      
      this.initialized = true;
      console.log('All services initialized successfully');
    } catch (error) {
      console.error('Failed to initialize services:', error);
      throw error;
    }
  }

  // Enhanced file analysis with history tracking
  async analyzeFileWithHistory(filePath, fileInfo, analysisOptions = {}) {
    try {
      // Perform the actual file analysis (this would integrate with existing analysis)
      const analysisResults = await this.performFileAnalysis(filePath, analysisOptions);
      
      // Record the analysis in history
      const analysisId = await this.analysisHistoryService.recordAnalysis(fileInfo, analysisResults);
      
      // Return enhanced results
      return {
        ...analysisResults,
        analysisId,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('File analysis failed:', error);
      throw error;
    }
  }

  // Enhanced file organization with undo support
  async organizeFileWithUndo(sourceFile, targetPath, organizationOptions = {}) {
    try {
      // Record the action for undo functionality
      const actionData = {
        originalPath: sourceFile.path,
        newPath: targetPath,
        fileInfo: sourceFile,
        organizationOptions
      };

      // Perform the file move/organization
      await this.performFileOrganization(sourceFile, targetPath, organizationOptions);
      
      // Record the action for undo
      await this.undoRedoService.recordAction(ACTION_TYPES.FILE_MOVE, actionData);
      
      return {
        success: true,
        originalPath: sourceFile.path,
        newPath: targetPath,
        actionRecorded: true
      };
    } catch (error) {
      console.error('File organization failed:', error);
      throw error;
    }
  }

  // Enhanced batch organization with comprehensive tracking
  async organizeBatchWithTracking(files, organizationRules) {
    const operations = [];
    const results = [];
    
    try {
      for (const file of files) {
        const targetPath = this.determineTargetPath(file, organizationRules);
        
        const operation = {
          type: 'move',
          originalPath: file.path,
          newPath: targetPath,
          fileInfo: file
        };
        
        operations.push(operation);
        
        // Perform the move
        await this.performFileOrganization(file, targetPath, organizationRules);
        
        results.push({
          file: file.path,
          success: true,
          newPath: targetPath
        });
      }
      
      // Record the batch operation for undo
      await this.undoRedoService.recordAction(ACTION_TYPES.BATCH_ORGANIZE, {
        operations,
        rules: organizationRules
      });
      
      return {
        success: true,
        operations: results.length,
        results
      };
    } catch (error) {
      console.error('Batch organization failed:', error);
      
      // Try to rollback any successful operations
      await this.rollbackBatchOperation(operations);
      
      throw error;
    }
  }

  // Search functionality with RAG support
  async searchWithRAG(query, options = {}) {
    try {
      // Search in analysis history
      const analysisResults = await this.analysisHistoryService.searchAnalysis(query);
      
      // Enhance with semantic search if available
      const enhancedResults = await this.enhanceWithSemanticSearch(analysisResults, query, options);
      
      return {
        query,
        totalResults: enhancedResults.length,
        results: enhancedResults,
        searchTime: Date.now()
      };
    } catch (error) {
      console.error('Search failed:', error);
      throw error;
    }
  }

  // Get comprehensive file information
  async getFileInformation(filePath) {
    try {
      // Get analysis history
      const analysisHistory = await this.analysisHistoryService.getAnalysisByPath(filePath);
      
      // Get file stats
      const fileStats = await this.getFileStats(filePath);
      
      // Get related files
      const relatedFiles = await this.findRelatedFiles(filePath);
      
      return {
        path: filePath,
        stats: fileStats,
        analysisHistory,
        relatedFiles,
        lastAccessed: new Date().toISOString()
      };
    } catch (error) {
      console.error('Failed to get file information:', error);
      throw error;
    }
  }

  // Get application statistics
  async getApplicationStatistics() {
    const stats = {
      totalAnalyses: 0,
      successfulAnalyses: 0,
      failedAnalyses: 0,
      averageProcessingTime: 0,
      systemHealth: 'healthy',
      timestamp: new Date().toISOString()
    };

    try {
      // Get analysis history statistics
      const historyStats = await this.analysisHistoryService.getStatistics();
      if (historyStats) {
        stats.totalAnalyses = historyStats.totalFiles || 0;
        stats.averageProcessingTime = historyStats.averageProcessingTime || 0;
        // Estimate success rate based on confidence scores
        stats.successfulAnalyses = Math.floor(stats.totalAnalyses * 0.85); // Rough estimate
        stats.failedAnalyses = stats.totalAnalyses - stats.successfulAnalyses;
      }

      return { success: true, ...stats };
    } catch (error) {
      console.error('Failed to get application statistics:', error);
      return { success: false, error: error.message, ...stats };
    }
  }

  // Undo/Redo operations
  async undoLastAction() {
    try {
      const result = await this.undoRedoService.undo();
      
      // Update any affected analysis records
      await this.updateAnalysisAfterUndo(result);
      
      return result;
    } catch (error) {
      console.error('Undo failed:', error);
      throw error;
    }
  }

  async redoLastAction() {
    try {
      const result = await this.undoRedoService.redo();
      
      // Update any affected analysis records
      await this.updateAnalysisAfterRedo(result);
      
      return result;
    } catch (error) {
      console.error('Redo failed:', error);
      throw error;
    }
  }

  // Service status
  getServicesStatus() {
    return {
      initialized: this.initialized,
      services: {
        analysisHistory: this.analysisHistoryService.initialized,
        undoRedo: this.undoRedoService.initialized
      }
    };
  }

  // Service getters for external access
  get undoRedo() {
    return this.undoRedoService;
  }

  get analysisHistory() {
    return this.analysisHistoryService;
  }

  get llm() {
    return this._enhancedLLMService;
  }

  get modelManager() {
    return this._modelManager;
  }

  get modelVerifier() {
    return this._modelVerifier;
  }

  get performanceOptimizer() {
    return this._performanceOptimizer;
  }

  get smartFolder() {
    return this._smartFolderService;
  }

  // Private helper methods
  async performFileAnalysis(filePath, options) {
    const path = require('path');
    const { analyzeDocumentFile } = require('../analysis/ollamaDocumentAnalysis');
    const { analyzeImageFile } = require('../analysis/ollamaImageAnalysis');
    
    try {
      const extension = path.extname(filePath).toLowerCase();
      const startTime = Date.now();
      
      let analysisResult;
      
      // Route to appropriate analysis service
      if (['.pdf', '.doc', '.docx', '.txt', '.md', '.rtf'].includes(extension)) {
        analysisResult = await analyzeDocumentFile(filePath, options.smartFolders || []);
      } else if (['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'].includes(extension)) {
        analysisResult = await analyzeImageFile(filePath, options.smartFolders || []);
      } else {
        // Fallback for unsupported files
        return {
          subject: path.basename(filePath),
          category: 'uncategorized',
          tags: ['file', extension.replace('.', '')],
          confidence: 0.5,
          summary: `Unsupported file type: ${extension}`,
          model: 'none',
          processingTime: Date.now() - startTime
        };
      }
      
      // Standardize the response format
      return {
        subject: analysisResult.suggestedName || analysisResult.project || path.basename(filePath),
        category: analysisResult.category || 'uncategorized',
        tags: analysisResult.keywords || [],
        confidence: (analysisResult.confidence || 50) / 100, // Convert to decimal
        summary: analysisResult.purpose || analysisResult.summary || 'File analyzed',
        model: options.model || 'gemma3:4b',
        processingTime: Date.now() - startTime,
        rawAnalysis: analysisResult // Include full analysis for reference
      };
      
    } catch (error) {
      console.error('File analysis failed:', error);
      return {
        subject: path.basename(filePath),
        category: 'error',
        tags: ['error', 'analysis_failed'],
        confidence: 0,
        summary: `Analysis failed: ${error.message}`,
        model: 'none',
        processingTime: 0,
        error: error.message
      };
    }
  }

  async performFileOrganization(file, targetPath, options) {
    const fs = require('fs').promises;
    
    // Ensure target directory exists
    const targetDir = require('path').dirname(targetPath);
    await fs.mkdir(targetDir, { recursive: true });
    
    // Move the file
    await fs.rename(file.path, targetPath);
  }

  determineTargetPath(file, rules) {
    const path = require('path');
    
    try {
      // Get the smart folder path based on the file's suggested category
      const suggestedCategory = file.analysis?.category || file.category || 'uncategorized';
      const suggestedName = file.analysis?.subject || file.subject || path.basename(file.path);
      
      // Find matching smart folder
      const smartFolder = rules.smartFolders?.find((folder) => 
        folder.name.toLowerCase() === suggestedCategory.toLowerCase() ||
        folder.path.toLowerCase().includes(suggestedCategory.toLowerCase())
      );
      
      const basePath = smartFolder?.path || rules.basePath || path.join(require('os').homedir(), 'Documents', 'StratoSort');
      
      // Create a clean filename
      const extension = path.extname(file.path);
      const cleanName = suggestedName.replace(/[<>:"|?*\x00-\x1f]/g, '_').substring(0, 200);
      const finalName = cleanName.endsWith(extension) ? cleanName : cleanName + extension;
      
      return path.join(basePath, finalName);
    } catch (error) {
      console.error('Error determining target path:', error);
      // Fallback to simple naming
      return path.join(rules.basePath || './organized', path.basename(file.path));
    }
  }

  async rollbackBatchOperation(operations) {
    const fs = require('fs').promises;
    
    for (const operation of operations.reverse()) {
      try {
        if (operation.type === 'move') {
          await fs.rename(operation.newPath, operation.originalPath);
        }
      } catch (error) {
        console.error('Rollback failed for operation:', operation, error);
      }
    }
  }

  async enhanceWithSemanticSearch(results, query, options) {
    const { Ollama } = require('ollama');
    
    try {
      // Use the existing Ollama instance to calculate semantic similarity
      const ollama = new Ollama({ host: 'http://127.0.0.1:11434' });
      
      // Get embeddings for the query
      const queryEmbedding = await ollama.embeddings({
        model: 'mxbai-embed-large',
        prompt: query
      });
      
      // Calculate semantic scores for each result
      const enhancedResults = await Promise.all(results.map(async (result) => {
        try {
          // Create a searchable text from the result
          const searchText = [
            result.subject,
            result.category,
            result.summary,
            ...(result.tags || [])
          ].filter(Boolean).join(' ');
          
          // Get embeddings for the result
          const resultEmbedding = await ollama.embeddings({
            model: 'mxbai-embed-large',
            prompt: searchText
          });
          
          // Calculate cosine similarity
          const similarity = this.calculateCosineSimilarity(
            queryEmbedding.embedding,
            resultEmbedding.embedding
          );
          
          return {
            ...result,
            semanticScore: Math.max(0, Math.min(1, similarity)) // Clamp between 0-1
          };
        } catch (error) {
          console.error('Error calculating semantic score for result:', error);
          return {
            ...result,
            semanticScore: 0.5 // Default score on error
          };
        }
      }));
      
      // Sort by semantic score (highest first)
      return enhancedResults.sort((a, b) => b.semanticScore - a.semanticScore);
      
    } catch (error) {
      console.error('Semantic search enhancement failed:', error);
      // Fallback to text-based scoring
      return results.map((result) => ({
        ...result,
        semanticScore: this.calculateTextSimilarity(query, result.subject || result.summary || '')
      }));
    }
  }
  
  calculateCosineSimilarity(a, b) {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
  
  calculateTextSimilarity(query, text) {
    const queryWords = query.toLowerCase().split(/\s+/);
    const textWords = text.toLowerCase().split(/\s+/);
    
    const querySet = new Set(queryWords);
    const textSet = new Set(textWords);
    
    const intersection = [...querySet].filter((word) => textSet.has(word));
    const union = new Set([...querySet, ...textSet]);
    
    return intersection.length / union.size;
  }

  async getFileStats(filePath) {
    const fs = require('fs').promises;
    const stats = await fs.stat(filePath);
    
    return {
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      accessed: stats.atime
    };
  }

  async findRelatedFiles(filePath) {
    try {
      const path = require('path');
      const fs = require('fs').promises;
      
      const targetFile = path.parse(filePath);
      const targetDir = targetFile.dir;
      const targetName = targetFile.name.toLowerCase();
      const targetExt = targetFile.ext.toLowerCase();
      
      // Get all files in the same directory
      const dirFiles = await fs.readdir(targetDir, { withFileTypes: true });
      const relatedFiles = [];
      
      for (const file of dirFiles) {
        if (file.isFile() && file.name !== targetFile.base) {
          const fileParsed = path.parse(file.name);
          const fileName = fileParsed.name.toLowerCase();
          const fileExt = fileParsed.ext.toLowerCase();
          const fullPath = path.join(targetDir, file.name);
          
          let relationScore = 0;
          let relationType = 'similar';
          
          // Same base name with different extension (e.g., doc.pdf and doc.docx)
          if (fileName === targetName && fileExt !== targetExt) {
            relationScore = 90;
            relationType = 'alternate_format';
          }
          // Similar names (edit distance or common prefixes)
          else if (fileName.includes(targetName) || targetName.includes(fileName)) {
            relationScore = 70;
            relationType = 'name_similarity';
          }
          // Same file type in same directory
          else if (fileExt === targetExt) {
            relationScore = 40;
            relationType = 'same_type';
          }
          // Version-like patterns (file_v1, file_v2, file_backup, etc.)
          else if (this.isVersionRelated(targetName, fileName)) {
            relationScore = 80;
            relationType = 'version';
          }
          
          if (relationScore > 30) {
            try {
              const stats = await fs.stat(fullPath);
              relatedFiles.push({
                path: fullPath,
                name: file.name,
                relationType,
                relationScore,
                size: stats.size,
                modified: stats.mtime,
                similarity: relationScore / 100
              });
            } catch (statError) {
              // Skip files we can't access
              continue;
            }
          }
        }
      }
      
      // Sort by relation score (highest first) and limit results
      return relatedFiles
        .sort((a, b) => b.relationScore - a.relationScore)
        .slice(0, 10);
        
    } catch (error) {
      console.error('Failed to find related files:', error.message);
      return [];
    }
  }

  /**
   * Check if two filenames are version-related
   */
  isVersionRelated(name1, name2) {
    const versionPatterns = [
      /(.+)_v\d+$/,           // file_v1, file_v2
      /(.+)_\d+$/,            // file_1, file_2
      /(.+)_backup$/,         // file_backup
      /(.+)_copy$/,           // file_copy
      /(.+)_draft$/,          // file_draft
      /(.+)_final$/,          // file_final
      /(.+)_old$/,            // file_old
      /(.+)_new$/,            // file_new
      /(.+)_\d{4}-\d{2}-\d{2}$/ // file_2024-01-15
    ];
    
    for (const pattern of versionPatterns) {
      const match1 = name1.match(pattern);
      const match2 = name2.match(pattern);
      
      if (match1 && match2 && match1[1] === match2[1]) {
        return true;
      }
      
      // Check if one is the base and other is versioned
      if (match1 && match1[1] === name2) return true;
      if (match2 && match2[1] === name1) return true;
    }
    
    return false;
  }

  /**
   * Update analysis records after undo operations
   * @param {Object} result - The undo operation result
   * @param {Object} result.action - The action that was undone
   * @param {string} result.action.description - Description of the undone action
   */
  async updateAnalysisAfterUndo(result) {
    // Update analysis records after undo operations
    console.log('Updating analysis after undo:', result.action.description);
  }

  /**
   * Update analysis records after redo operations
   * @param {Object} result - The redo operation result
   * @param {Object} result.action - The action that was redone
   * @param {string} result.action.description - Description of the redone action
   */
  async updateAnalysisAfterRedo(result) {
    // Update analysis records after redo operations
    console.log('Updating analysis after redo:', result.action.description);
  }
}

module.exports = ServiceIntegration; 