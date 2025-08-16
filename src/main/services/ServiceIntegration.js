const AnalysisHistoryService = require('./AnalysisHistoryService');
const UndoRedoService = require('./UndoRedoService');
const ProcessingStateService = require('./ProcessingStateService');

class ServiceIntegration {
  constructor() {
    this.analysisHistory = null;
    this.undoRedo = null;
    this.processingState = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    this.analysisHistory = new AnalysisHistoryService();
    this.undoRedo = new UndoRedoService();
    this.processingState = new ProcessingStateService();
    await Promise.all([
      this.analysisHistory.initialize(),
      this.undoRedo.initialize(),
      this.processingState.initialize(),
    ]);
    this.initialized = true;
  }
}

module.exports = ServiceIntegration;
