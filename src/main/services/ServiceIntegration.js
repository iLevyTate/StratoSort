const AnalysisHistoryService = require('./AnalysisHistoryService');
const UndoRedoService = require('./UndoRedoService');
const ProcessingStateService = require('./ProcessingStateService');
const { getInstance: getEmbeddingIndex } = require('./EmbeddingIndexService');
const FolderMatchingService = require('./FolderMatchingService');
const OrganizationSuggestionService = require('./OrganizationSuggestionService');
const AutoOrganizeService = require('./AutoOrganizeService');

class ServiceIntegration {
  constructor() {
    this.analysisHistory = null;
    this.undoRedo = null;
    this.processingState = null;
    this.embeddingService = null;
    this.folderMatchingService = null;
    this.suggestionService = null;
    this.autoOrganizeService = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    // Initialize core services
    this.analysisHistory = new AnalysisHistoryService();
    this.undoRedo = new UndoRedoService();
    this.processingState = new ProcessingStateService();

    // Initialize JSON embedding storage and folder matching
    this.embeddingService = getEmbeddingIndex();
    this.folderMatchingService = new FolderMatchingService(
      this.embeddingService,
    );

    // Initialize suggestion service
    const { getService: getSettingsService } = require('./SettingsService');
    this.suggestionService = new OrganizationSuggestionService({
      embeddingService: this.embeddingService,
      folderMatchingService: this.folderMatchingService,
      settingsService: getSettingsService(),
    });

    // Initialize auto-organize service
    this.autoOrganizeService = new AutoOrganizeService({
      suggestionService: this.suggestionService,
      settingsService: getSettingsService(),
      folderMatchingService: this.folderMatchingService,
      undoRedoService: this.undoRedo,
    });

    // Initialize all services
    await Promise.all([
      this.analysisHistory.initialize(),
      this.undoRedo.initialize(),
      this.processingState.initialize(),
      this.embeddingService.initialize(),
    ]);

    this.initialized = true;
  }
}

module.exports = ServiceIntegration;
