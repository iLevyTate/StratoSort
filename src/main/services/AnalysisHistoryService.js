const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

const { app } = require('electron');

class AnalysisHistoryService {
  constructor() {
    this.userDataPath = app.getPath('userData');
    this.historyPath = path.join(this.userDataPath, 'analysis-history.json');
    this.indexPath = path.join(this.userDataPath, 'analysis-index.json');
    this.configPath = path.join(this.userDataPath, 'analysis-config.json');
    
    this.analysisHistory = null;
    this.analysisIndex = null;
    this.config = null;
    this.initialized = false;
    
    // Schema version for future migration support
    this.SCHEMA_VERSION = '1.0.0';
    this.MAX_HISTORY_ENTRIES = 5000; // Reduced from 10000 to prevent memory issues
    
    // Add automatic cleanup interval (less aggressive)
    this.cleanupInterval = null;
  }

  async initialize() {
    if (this.initialized) return;
    
    try {
      await this.loadConfig();
      await this.loadHistory();
      await this.loadIndex();
      this.initialized = true;
      console.log('AnalysisHistoryService initialized successfully');
    } catch (error) {
      console.error('Failed to initialize AnalysisHistoryService:', error);
      await this.createDefaultStructures();
    }
  }

  async loadConfig() {
    try {
      const configData = await fs.readFile(this.configPath, 'utf8');
      this.config = JSON.parse(configData);
    } catch (error) {
      this.config = this.getDefaultConfig();
      await this.saveConfig();
    }
  }

  getDefaultConfig() {
    return {
      schemaVersion: this.SCHEMA_VERSION,
      maxHistoryEntries: this.MAX_HISTORY_ENTRIES,
      retentionDays: 365, // Keep analysis for 1 year
      enableRAG: false, // Disabled until RAG integration complete
      enableFullTextSearch: false, // Disabled until full-text engine ready
      compressionEnabled: false, // For future use
      backupEnabled: true,
      backupFrequencyDays: 7,
      lastBackup: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  async loadHistory() {
    try {
      const historyData = await fs.readFile(this.historyPath, 'utf8');
      this.analysisHistory = JSON.parse(historyData);
      
      // Validate schema version
      if (this.analysisHistory.schemaVersion !== this.SCHEMA_VERSION) {
        await this.migrateHistory();
      }
    } catch (error) {
      this.analysisHistory = this.createEmptyHistory();
      await this.saveHistory();
    }
  }

  createEmptyHistory() {
    return {
      schemaVersion: this.SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      totalAnalyzed: 0,
      totalSize: 0,
      entries: {},
      metadata: {
        lastCleanup: null,
        totalEntries: 0,
        averageAnalysisTime: 0
      }
    };
  }

  async loadIndex() {
    try {
      const indexData = await fs.readFile(this.indexPath, 'utf8');
      this.analysisIndex = JSON.parse(indexData);
    } catch (error) {
      this.analysisIndex = this.createEmptyIndex();
      await this.saveIndex();
    }
  }

  createEmptyIndex() {
    return {
      schemaVersion: this.SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      fileHashes: {},
      pathLookup: {},
      tagIndex: {},
      categoryIndex: {},
      dateIndex: {},
      sizeIndex: {},
      lastOptimized: null
    };
  }

  async recordAnalysis(fileInfo, analysisResults) {
    await this.initialize();
    
    const timestamp = new Date().toISOString();
    const fileHash = this.generateFileHash(fileInfo.path, fileInfo.size, fileInfo.lastModified);
    
    const analysisEntry = {
      id: crypto.randomUUID(),
      fileHash,
      timestamp,
      
      // File information
      originalPath: fileInfo.path,
      fileName: path.basename(fileInfo.path),
      fileExtension: path.extname(fileInfo.path).toLowerCase(),
      fileSize: fileInfo.size,
      lastModified: fileInfo.lastModified,
      mimeType: fileInfo.mimeType || null,
      
      // Analysis results
      analysis: {
        subject: analysisResults.subject || null,
        category: analysisResults.category || null,
        tags: analysisResults.tags || [],
        confidence: analysisResults.confidence || 0,
        summary: analysisResults.summary || null,
        extractedText: analysisResults.extractedText || null,
        keyEntities: analysisResults.keyEntities || [],
        dates: analysisResults.dates || [],
        amounts: analysisResults.amounts || [],
        language: analysisResults.language || null,
        sentiment: analysisResults.sentiment || null
      },
      
      // Processing metadata
      processing: {
        model: analysisResults.model || 'unknown',
        processingTimeMs: analysisResults.processingTime || 0,
        version: this.SCHEMA_VERSION,
        errorCount: analysisResults.errorCount || 0,
        warnings: analysisResults.warnings || []
      },
      
      // Organization results (if file was moved/renamed)
      organization: {
        suggested: analysisResults.suggestedPath || null,
        actual: analysisResults.actualPath || null,
        renamed: analysisResults.renamed || false,
        newName: analysisResults.newName || null,
        smartFolder: analysisResults.smartFolder || null
      },
      
      // Future expansion fields
      embedding: null, // For RAG functionality
      relations: [], // Related files
      userFeedback: null, // User corrections/ratings
      exportHistory: [], // Export/share history
      accessCount: 0,
      lastAccessed: timestamp
    };

    // Store the entry
    this.analysisHistory.entries[analysisEntry.id] = analysisEntry;
    this.analysisHistory.totalAnalyzed++;
    this.analysisHistory.totalSize += fileInfo.size;
    this.analysisHistory.updatedAt = timestamp;
    this.analysisHistory.metadata.totalEntries++;

    // Update indexes
    await this.updateIndexes(analysisEntry);
    
    // Save to disk
    await Promise.all([
      this.saveHistory(),
      this.saveIndex()
    ]);

    // Cleanup if needed
    await this.performMaintenanceIfNeeded();
    
    return analysisEntry.id;
  }

  async updateIndexes(entry) {
    const timestamp = new Date().toISOString();
    this.analysisIndex.updatedAt = timestamp;
    
    // File hash index
    this.analysisIndex.fileHashes[entry.fileHash] = entry.id;
    
    // Path lookup index
    this.analysisIndex.pathLookup[entry.originalPath] = entry.id;
    
    // Tag index
    if (entry.analysis.tags) {
      entry.analysis.tags.forEach((tag) => {
        if (!this.analysisIndex.tagIndex[tag]) {
          this.analysisIndex.tagIndex[tag] = [];
        }
        this.analysisIndex.tagIndex[tag].push(entry.id);
      });
    }
    
    // Category index
    if (entry.analysis.category) {
      if (!this.analysisIndex.categoryIndex[entry.analysis.category]) {
        this.analysisIndex.categoryIndex[entry.analysis.category] = [];
      }
      this.analysisIndex.categoryIndex[entry.analysis.category].push(entry.id);
    }
    
    // Date index (by month)
    const dateKey = entry.timestamp.substring(0, 7); // YYYY-MM
    if (!this.analysisIndex.dateIndex[dateKey]) {
      this.analysisIndex.dateIndex[dateKey] = [];
    }
    this.analysisIndex.dateIndex[dateKey].push(entry.id);
    
    // Size index (by size ranges)
    const sizeRange = this.getSizeRange(entry.fileSize);
    if (!this.analysisIndex.sizeIndex[sizeRange]) {
      this.analysisIndex.sizeIndex[sizeRange] = [];
    }
    this.analysisIndex.sizeIndex[sizeRange].push(entry.id);
  }

  getSizeRange(size) {
    if (size < 1024) return 'tiny'; // < 1KB
    if (size < 1024 * 1024) return 'small'; // < 1MB
    if (size < 10 * 1024 * 1024) return 'medium'; // < 10MB
    if (size < 100 * 1024 * 1024) return 'large'; // < 100MB
    return 'huge'; // >= 100MB
  }

  generateFileHash(filePath, size, lastModified) {
    const hashInput = `${filePath}:${size}:${lastModified}`;
    return crypto.createHash('sha256').update(hashInput).digest('hex').substring(0, 16);
  }

  async searchAnalysis(query) {
    await this.initialize();
    
    const results = [];
    const _searchTerms = query.toLowerCase().split(' ');
    
    for (const [_id, entry] of Object.entries(this.analysisHistory.entries)) {
      let score = 0;
      
      // Search in file name
      if (entry.fileName.toLowerCase().includes(query.toLowerCase())) {
        score += 10;
      }
      
      // Search in analysis fields
      if (entry.analysis.subject && entry.analysis.subject.toLowerCase().includes(query.toLowerCase())) {
        score += 8;
      }
      
      if (entry.analysis.summary && entry.analysis.summary.toLowerCase().includes(query.toLowerCase())) {
        score += 6;
      }
      
      // Search in tags
      const tagMatches = entry.analysis.tags?.filter((tag) => 
        tag.toLowerCase().includes(query.toLowerCase())
      ) || [];
      score += tagMatches.length * 4;
      
      // Search in extracted text (if available)
      if (entry.analysis.extractedText && entry.analysis.extractedText.toLowerCase().includes(query.toLowerCase())) {
        score += 3;
      }
      
      if (score > 0) {
        results.push({
          ...entry,
          searchScore: score
        });
      }
    }
    
    return results.sort((a, b) => b.searchScore - a.searchScore);
  }

  async getAnalysisByPath(filePath) {
    await this.initialize();
    const entryId = this.analysisIndex.pathLookup[filePath];
    return entryId ? this.analysisHistory.entries[entryId] : null;
  }

  async getAnalysisByCategory(category) {
    await this.initialize();
    const entryIds = this.analysisIndex.categoryIndex[category] || [];
    return entryIds.map((id) => this.analysisHistory.entries[id]).filter(Boolean);
  }

  async getAnalysisByTag(tag) {
    await this.initialize();
    const entryIds = this.analysisIndex.tagIndex[tag] || [];
    return entryIds.map((id) => this.analysisHistory.entries[id]).filter(Boolean);
  }

  async getRecentAnalysis(limit = 50) {
    await this.initialize();
    const entries = Object.values(this.analysisHistory.entries);
    return entries
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  async getStatistics() {
    await this.initialize();
    
    const entries = Object.values(this.analysisHistory.entries);
    const categories = Object.keys(this.analysisIndex.categoryIndex);
    const tags = Object.keys(this.analysisIndex.tagIndex);
    
    return {
      totalFiles: entries.length,
      totalSize: this.analysisHistory.totalSize,
      categoriesCount: categories.length,
      tagsCount: tags.length,
      averageConfidence: entries.reduce((sum, e) => sum + (e.analysis.confidence || 0), 0) / entries.length,
      averageProcessingTime: entries.reduce((sum, e) => sum + (e.processing.processingTimeMs || 0), 0) / entries.length,
      oldestAnalysis: entries.length > 0 ? entries.reduce((oldest, e) => 
        new Date(e.timestamp) < new Date(oldest.timestamp) ? e : oldest
      ).timestamp : null,
      newestAnalysis: entries.length > 0 ? entries.reduce((newest, e) => 
        new Date(e.timestamp) > new Date(newest.timestamp) ? e : newest
      ).timestamp : null
    };
  }

  async performMaintenanceIfNeeded() {
    // Cleanup old entries if we exceed the limit
    const entryCount = Object.keys(this.analysisHistory.entries).length;
    if (entryCount > this.config.maxHistoryEntries) {
      await this.cleanupOldEntries();
    }
    
    // Remove entries older than retention period
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);
    await this.removeExpiredEntries(cutoffDate);
  }

  async cleanupOldEntries() {
    const entries = Object.entries(this.analysisHistory.entries);
    const sortedEntries = entries.sort((a, b) => new Date(a[1].timestamp) - new Date(b[1].timestamp));
    
    const toRemove = sortedEntries.slice(0, entries.length - this.config.maxHistoryEntries);
    
    for (const [id, entry] of toRemove) {
      delete this.analysisHistory.entries[id];
      await this.removeFromIndexes(entry);
    }
    
    this.analysisHistory.metadata.lastCleanup = new Date().toISOString();
    await this.saveHistory();
    await this.saveIndex();
  }

  async removeExpiredEntries(cutoffDate) {
    const entries = Object.entries(this.analysisHistory.entries);
    let removedCount = 0;
    
    for (const [id, entry] of entries) {
      if (new Date(entry.timestamp) < cutoffDate) {
        delete this.analysisHistory.entries[id];
        await this.removeFromIndexes(entry);
        removedCount++;
      }
    }
    
    if (removedCount > 0) {
      console.log(`Removed ${removedCount} expired analysis entries`);
      await this.saveHistory();
      await this.saveIndex();
    }
  }

  async removeFromIndexes(entry) {
    // Remove from various indexes
    delete this.analysisIndex.fileHashes[entry.fileHash];
    delete this.analysisIndex.pathLookup[entry.originalPath];
    
    // Remove from tag index
    if (entry.analysis.tags) {
      entry.analysis.tags.forEach((tag) => {
        const tagEntries = this.analysisIndex.tagIndex[tag] || [];
        this.analysisIndex.tagIndex[tag] = tagEntries.filter((id) => id !== entry.id);
        if (this.analysisIndex.tagIndex[tag].length === 0) {
          delete this.analysisIndex.tagIndex[tag];
        }
      });
    }
    
    // Remove from category index
    if (entry.analysis.category) {
      const categoryEntries = this.analysisIndex.categoryIndex[entry.analysis.category] || [];
      this.analysisIndex.categoryIndex[entry.analysis.category] = categoryEntries.filter((id) => id !== entry.id);
      if (this.analysisIndex.categoryIndex[entry.analysis.category].length === 0) {
        delete this.analysisIndex.categoryIndex[entry.analysis.category];
      }
    }
  }

  async migrateHistory() {
    try {
      console.log('[MIGRATE] Starting analysis-history schema migration');

      // For first migration simply bump schema version and ensure required fields exist
      this.analysisHistory.schemaVersion = this.SCHEMA_VERSION;

      // Add missing fields that may be required by newer code
      this.analysisHistory.metadata = this.analysisHistory.metadata || {};
      this.analysisHistory.metadata.lastCleanup = this.analysisHistory.metadata.lastCleanup || null;

      // Persist immediately so older installs don't repeat migration every boot
      await this.saveHistory();
      console.log('[MIGRATE] Analysis-history migration complete');
    } catch (error) {
      console.error('[MIGRATE] Failed to migrate analysis-history:', error);
      // Fallback: create fresh structures to prevent runtime crash
      await this.createDefaultStructures();
    }
  }

  async createDefaultStructures() {
    this.config = this.getDefaultConfig();
    this.analysisHistory = this.createEmptyHistory();
    this.analysisIndex = this.createEmptyIndex();
    
    await Promise.all([
      this.saveConfig(),
      this.saveHistory(),
      this.saveIndex()
    ]);
    
    this.initialized = true;
  }

  async saveConfig() {
    this.config.updatedAt = new Date().toISOString();
    await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
  }

  async saveHistory() {
    this.analysisHistory.updatedAt = new Date().toISOString();
    await fs.writeFile(this.historyPath, JSON.stringify(this.analysisHistory, null, 2));
  }

  async saveIndex() {
    this.analysisIndex.updatedAt = new Date().toISOString();
    await fs.writeFile(this.indexPath, JSON.stringify(this.analysisIndex, null, 2));
  }

  // Add missing getHistory method that IPC handlers expect
  async getHistory(options = {}) {
    await this.initialize();
    const limit = options.limit || 50;
    return this.getRecentAnalysis(limit);
  }

  // Add missing export functionality
  async exportHistory(format = 'json') {
    await this.initialize();
    
    const entries = Object.values(this.analysisHistory.entries);
    const exportData = {
      exportedAt: new Date().toISOString(),
      version: this.SCHEMA_VERSION,
      totalEntries: entries.length,
      entries
    };

    try {
      const { app } = require('electron');
      const exportDir = path.join(app.getPath('downloads'), 'StratoSort-Exports');
      
      // Ensure export directory exists
      await fs.mkdir(exportDir, { recursive: true });
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      let exportPath;
      let exportContent;

      if (format === 'csv') {
        exportPath = path.join(exportDir, `analysis-history-${timestamp}.csv`);
        
        // Convert to CSV format
        const csvHeaders = 'FileName,FilePath,Category,Confidence,ProcessingTime,Timestamp,Keywords';
        const csvRows = entries.map(entry => {
          const keywords = (entry.analysis.keywords || []).join(';');
          return `"${entry.fileName}","${entry.originalPath}","${entry.analysis.category || ''}","${entry.analysis.confidence || 0}","${entry.processing.processingTimeMs || 0}","${entry.timestamp}","${keywords}"`;
        });
        
        exportContent = [csvHeaders, ...csvRows].join('\n');
      } else {
        // Default to JSON
        exportPath = path.join(exportDir, `analysis-history-${timestamp}.json`);
        exportContent = JSON.stringify(exportData, null, 2);
      }

      await fs.writeFile(exportPath, exportContent, 'utf8');
      
      // Open the export directory
      const { shell } = require('electron');
      await shell.openPath(exportDir);

      return {
        success: true,
        exportPath,
        recordCount: entries.length,
        format
      };
    } catch (error) {
      console.error('Failed to export analysis history:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = AnalysisHistoryService; 