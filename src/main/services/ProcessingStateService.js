const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');
const { backupAndReplace } = require('../../shared/atomicFileOperations');
const { logger } = require('../../shared/logger');

/**
 * ProcessingStateService
 * - Persists analysis jobs and organize batches to disk so work can resume after crashes/restarts
 */
class ProcessingStateService {
  constructor() {
    this.userDataPath = null;
    this.statePath = null;
    this.state = null;
    this.initialized = false;
    this.exitHandlersSetup = false; // Track if exit handlers have been registered
    this.SCHEMA_VERSION = '1.0.0';
    this.saveTimeout = null;
    this.dirty = false;
    this.DEBOUNCE_DELAY = 2000; // 2 seconds delay for saves

    // Save queue to prevent concurrent writes and corruption
    this.saveQueue = Promise.resolve();
    this.isSaving = false;
  }

  // Lazy initialize paths to avoid calling app.getPath before app is ready
  _initPaths() {
    if (!this.userDataPath) {
      this.userDataPath = app.getPath('userData');
      this.statePath = path.join(this.userDataPath, 'processing-state.json');
    }
  }

  async initialize() {
    if (this.initialized) return;

    // Initialize paths first
    this._initPaths();

    // Set up process exit handlers to ensure data is saved before exit
    this._setupExitHandlers();

    try {
      await this.loadState();
      this.initialized = true;
    } catch (error) {
      this.state = this.createEmptyState();
      await this.forceSave();
      this.initialized = true;
    }
  }

  /**
   * Set up process exit handlers to ensure data is saved before shutdown
   */
  _setupExitHandlers() {
    if (this.exitHandlersSetup) return;
    this.exitHandlersSetup = true;

    // Handle various exit scenarios
    const handleExit = async (signal) => {
      console.log(
        `[PROCESSING-STATE] Received ${signal}, forcing save before exit...`,
      );
      try {
        await this.forceSave();
        console.log(
          '[PROCESSING-STATE] Save completed successfully before exit',
        );
      } catch (error) {
        logger.error('[PROCESSING-STATE] Failed to save before exit:', error);
      }
    };

    // Handle different exit signals
    process.on('beforeExit', () => handleExit('beforeExit'));
    process.on('SIGTERM', () => handleExit('SIGTERM'));
    process.on('SIGINT', () => handleExit('SIGINT'));
  }

  createEmptyState() {
    const now = new Date().toISOString();
    return {
      schemaVersion: this.SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now,
      analysis: {
        jobs: {}, // key: filePath, value: { status: 'pending'|'in_progress'|'done'|'failed', startedAt, completedAt, error }
        lastUpdated: now,
      },
      organize: {
        batches: {}, // key: batchId, value: { id, operations: [{ source, destination, status, error }], startedAt, completedAt }
        lastUpdated: now,
      },
    };
  }

  async loadState() {
    try {
      const raw = await fs.readFile(this.statePath, 'utf8');
      this.state = JSON.parse(raw);
      if (!this.state.schemaVersion) {
        this.state.schemaVersion = this.SCHEMA_VERSION;
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.state = this.createEmptyState();
      } else {
        throw error;
      }
    }
  }

  /**
   * Queued save to prevent concurrent writes and file corruption
   */
  async saveState() {
    this.state.updatedAt = new Date().toISOString();

    // Add this save operation to the queue
    this.saveQueue = this.saveQueue
      .then(async () => {
        if (this.isSaving) {
          console.log(
            '[PROCESSING-STATE] Save already in progress, queuing...',
          );
        }

        this.isSaving = true;
        try {
          const result = await backupAndReplace(
            this.statePath,
            JSON.stringify(this.state, null, 2),
          );
          if (!result.success) {
            logger.error('[PROCESSING-STATE] Save failed:', result.error);
            throw new Error(result.error);
          }
          return result;
        } catch (error) {
          logger.error('[PROCESSING-STATE] Save operation failed:', error);
          throw error;
        } finally {
          this.isSaving = false;
        }
      })
      .catch((error) => {
        logger.error('[PROCESSING-STATE] Save failed:', error);
        this.isSaving = false;
        throw error;
      });

    return this.saveQueue;
  }

  /**
   * Debounced save - delays actual file write to batch multiple changes
   */
  debouncedSave() {
    this.dirty = true;

    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(async () => {
      if (this.dirty && this.state) {
        try {
          await this.saveState();
          this.dirty = false;
        } catch (error) {
          logger.error('[PROCESSING-STATE] Failed to save state:', error);
          // Keep dirty flag so we retry later
        }
      }
    }, this.DEBOUNCE_DELAY);
  }

  /**
   * Force immediate save (for critical operations)
   */
  async forceSave() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }

    if (this.dirty && this.state) {
      await this.saveState();
      this.dirty = false;
    }
  }

  // ===== Analysis tracking =====
  async markAnalysisStart(filePath) {
    await this.initialize();
    const now = new Date().toISOString();
    this.state.analysis.jobs[filePath] = {
      ...(this.state.analysis.jobs[filePath] || {}),
      status: 'in_progress',
      startedAt: now,
      completedAt: null,
      error: null,
    };
    this.state.analysis.lastUpdated = now;
    this.debouncedSave();
  }

  async markAnalysisComplete(filePath) {
    await this.initialize();
    const now = new Date().toISOString();
    this.state.analysis.jobs[filePath] = {
      ...(this.state.analysis.jobs[filePath] || {}),
      status: 'done',
      completedAt: now,
      error: null,
    };
    this.state.analysis.lastUpdated = now;
    this.debouncedSave();
  }

  async markAnalysisError(filePath, errorMessage) {
    await this.initialize();
    const now = new Date().toISOString();
    this.state.analysis.jobs[filePath] = {
      ...(this.state.analysis.jobs[filePath] || {}),
      status: 'failed',
      completedAt: now,
      error: errorMessage || 'Unknown analysis error',
    };
    this.state.analysis.lastUpdated = now;
    this.debouncedSave();
  }

  getIncompleteAnalysisJobs() {
    if (!this.state) return [];
    return Object.entries(this.state.analysis.jobs)
      .filter(([, j]) => j.status === 'in_progress' || j.status === 'pending')
      .map(([filePath, j]) => ({ filePath, ...j }));
  }

  // ===== Organize batch tracking =====
  async createOrLoadOrganizeBatch(batchId, operations) {
    await this.initialize();
    const now = new Date().toISOString();
    if (!this.state.organize.batches[batchId]) {
      this.state.organize.batches[batchId] = {
        id: batchId,
        operations: operations.map((op) => ({
          ...op,
          status: 'pending',
          error: null,
        })),
        startedAt: now,
        completedAt: null,
      };
      this.state.organize.lastUpdated = now;
      this.debouncedSave();
    }
    return this.state.organize.batches[batchId];
  }

  async markOrganizeOpStarted(batchId, index) {
    await this.initialize();
    const batch = this.state.organize.batches[batchId];
    if (!batch) return;
    batch.operations[index].status = 'in_progress';
    batch.operations[index].error = null;
    this.state.organize.lastUpdated = new Date().toISOString();
    this.debouncedSave();
  }

  async markOrganizeOpDone(batchId, index, updatedOp = null) {
    await this.initialize();
    const batch = this.state.organize.batches[batchId];
    if (!batch) return;
    if (updatedOp) {
      batch.operations[index] = { ...batch.operations[index], ...updatedOp };
    }
    batch.operations[index].status = 'done';
    batch.operations[index].error = null;
    this.state.organize.lastUpdated = new Date().toISOString();
    this.debouncedSave();
  }

  async markOrganizeOpError(batchId, index, errorMessage) {
    await this.initialize();
    const batch = this.state.organize.batches[batchId];
    if (!batch) return;
    batch.operations[index].status = 'failed';
    batch.operations[index].error = errorMessage || 'Unknown organize error';
    this.state.organize.lastUpdated = new Date().toISOString();
    this.debouncedSave();
  }

  async completeOrganizeBatch(batchId) {
    await this.initialize();
    const batch = this.state.organize.batches[batchId];
    if (!batch) return;
    batch.completedAt = new Date().toISOString();
    this.state.organize.lastUpdated = batch.completedAt;
    await this.forceSave();
  }

  getIncompleteOrganizeBatches() {
    if (!this.state) return [];
    return Object.values(this.state.organize.batches).filter(
      (batch) => !batch.completedAt,
    );
  }
}

module.exports = ProcessingStateService;
