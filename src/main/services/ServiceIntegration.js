const AnalysisHistoryService = require('./AnalysisHistoryService');
const UndoRedoService = require('./UndoRedoService');
const ProcessingStateService = require('./ProcessingStateService');
const { getInstance: getChromaDB } = require('./ChromaDBService');
const FolderMatchingService = require('./FolderMatchingService');
const OrganizationSuggestionService = require('./OrganizationSuggestionService');
const AutoOrganizeService = require('./AutoOrganizeService');

class ServiceIntegration {
  constructor() {
    this.analysisHistory = null;
    this.undoRedo = null;
    this.processingState = null;
    this.chromaDbService = null;
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

    // Initialize ChromaDB and folder matching
    this.chromaDbService = getChromaDB();
    this.folderMatchingService = new FolderMatchingService(
      this.chromaDbService,
    );

    // Initialize suggestion service
    const { getService: getSettingsService } = require('./SettingsService');
    this.suggestionService = new OrganizationSuggestionService({
      chromaDbService: this.chromaDbService,
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
      this.chromaDbService.initialize(),
    ]);

    this.initialized = true;
  }
}

module.exports = ServiceIntegration;
