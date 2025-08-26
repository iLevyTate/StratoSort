const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');
const { backupAndReplace } = require('../../shared/atomicFileOperations');
const { atomicFileOps } = require('../../shared/atomicFileOperations');

class UndoRedoService {
  constructor() {
    this.userDataPath = null;
    this.actionsPath = null;
    this.maxActions = 100; // Maximum number of actions to keep

    this.actions = [];
    this.currentIndex = -1; // Points to the last executed action
    this.initialized = false;

    // Debouncing for file writes
    this.saveTimeout = null;
    this.dirty = false;
    this.DEBOUNCE_DELAY = 2000; // 2 seconds delay for saves
  }

  // Lazy initialize paths to avoid calling app.getPath before app is ready
  _initPaths() {
    if (!this.userDataPath) {
      this.userDataPath = app.getPath('userData');
      this.actionsPath = path.join(this.userDataPath, 'undo-actions.json');
    }
  }

  async ensureParentDirectory(filePath) {
    const parentDirectory = path.dirname(filePath);
    await fs.mkdir(parentDirectory, { recursive: true });
  }

  async initialize() {
    if (this.initialized) return;

    // Initialize paths first
    this._initPaths();

    try {
      await this.loadActions();
      this.initialized = true;
      console.log('UndoRedoService initialized successfully');
    } catch (error) {
      console.error('Failed to initialize UndoRedoService:', error);
      this.actions = [];
      this.currentIndex = -1;
      this.initialized = true;
    }
  }

  async loadActions() {
    try {
      const actionsData = await fs.readFile(this.actionsPath, 'utf8');
      const data = JSON.parse(actionsData);
      this.actions = Array.isArray(data.actions) ? data.actions : [];
      this.currentIndex = data.currentIndex ?? -1;
    } catch (error) {
      // File doesn't exist or is corrupted, start fresh
      this.actions = [];
      this.currentIndex = -1;
      await this.saveActions();
    }
  }

  async saveActions() {
    const data = {
      actions: this.actions,
      currentIndex: this.currentIndex,
      lastSaved: new Date().toISOString(),
    };
    const result = await backupAndReplace(
      this.actionsPath,
      JSON.stringify(data, null, 2),
    );
    if (!result.success) {
      console.error('[UNDO-REDO] Failed to save actions:', result.error);
    }
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
      if (this.dirty && this.actions) {
        try {
          await this.saveActions();
          this.dirty = false;
        } catch (error) {
          console.error('[UNDO-REDO] Failed to save actions:', error);
          // Keep dirty flag so we retry later
        }
      }
    }, this.DEBOUNCE_DELAY);
  }

  /**
   * Force immediate save (for testing and critical operations)
   */
  async forceSave() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }

    if (this.dirty && this.actions) {
      await this.saveActions();
      this.dirty = false;
    }
  }

  async recordAction(actionType, actionData) {
    await this.initialize();

    const action = {
      id: this.generateId(),
      type: actionType,
      timestamp: new Date().toISOString(),
      data: actionData,
      description: this.getActionDescription(actionType, actionData),
    };

    // Remove any actions after the current index (if we're not at the end)
    if (this.currentIndex < this.actions.length - 1) {
      this.actions = this.actions.slice(0, this.currentIndex + 1);
    }

    // Add the new action
    this.actions.push(action);
    this.currentIndex = this.actions.length - 1;

    // Trim actions if we exceed the maximum
    if (this.actions.length > this.maxActions) {
      this.actions.shift();
      this.currentIndex--;
    }

    this.debouncedSave();
    return action.id;
  }

  async undo() {
    await this.initialize();

    if (!this.canUndo()) {
      throw new Error('No actions to undo');
    }

    const action = this.actions[this.currentIndex];

    try {
      await this.executeReverseAction(action);
      this.currentIndex--;
      this.debouncedSave();
      return {
        success: true,
        action: action,
        message: `Undid: ${action.description}`,
      };
    } catch (error) {
      console.error('Failed to undo action:', error);
      throw new Error(`Failed to undo action: ${error.message}`);
    }
  }

  async redo() {
    await this.initialize();

    if (!this.canRedo()) {
      throw new Error('No actions to redo');
    }

    const action = this.actions[this.currentIndex + 1];

    try {
      await this.executeForwardAction(action);
      this.currentIndex++;
      this.debouncedSave();
      return {
        success: true,
        action: action,
        message: `Redid: ${action.description}`,
      };
    } catch (error) {
      console.error('Failed to redo action:', error);
      throw new Error(`Failed to redo action: ${error.message}`);
    }
  }

  canUndo() {
    return this.currentIndex >= 0;
  }

  canRedo() {
    return this.currentIndex < this.actions.length - 1;
  }

  async executeReverseAction(action) {
    switch (action.type) {
      case 'FILE_MOVE':
        // Move file back to original location
        await atomicFileOps.atomicMove(
          action.data.newPath,
          action.data.originalPath,
        );
        break;

      case 'FILE_RENAME':
        // Skip if source and destination are identical
        if (action.data.newPath === action.data.originalPath) {
          console.log(
            '[FILE_OP] Reverse rename skipped – paths are identical:',
            action.data.originalPath,
          );
          break;
        }
        // If a file exists at originalPath, handle or report conflict
        if (await this.fileExists(action.data.originalPath)) {
          throw new Error(
            `Cannot reverse rename: target file already exists at ${action.data.originalPath}`,
          );
        }
        // Perform the reverse rename (atomic move)
        await atomicFileOps.atomicMove(
          action.data.newPath,
          action.data.originalPath,
        );
        break;

      case 'FILE_DELETE':
        // Restore file from backup (if we have one)
        if (
          action.data.backupPath &&
          (await this.fileExists(action.data.backupPath))
        ) {
          await atomicFileOps.atomicMove(
            action.data.backupPath,
            action.data.originalPath,
          );
        } else {
          throw new Error('Cannot restore deleted file - backup not found');
        }
        break;

      case 'FOLDER_CREATE':
        // Remove the created folder (if empty)
        try {
          await fs.rmdir(action.data.folderPath);
        } catch (error) {
          // Folder might not be empty, try to restore to original state
          console.warn(
            'Could not remove folder, might contain files:',
            error.message,
          );
        }
        break;

      case 'BATCH_ORGANIZE':
      case 'BATCH_OPERATION': {
        // Backwards/forwards compatibility with shared ACTION_TYPES
        // Reverse each file operation in the batch (clone array to preserve original order)
        const reversedOperations = [...action.data.operations].reverse();

        // Track successful operations for potential rollback
        const successfulOperations = [];
        let batchError = null;

        // Execute reverse operations with rollback capability
        for (let i = 0; i < reversedOperations.length; i++) {
          const operation = reversedOperations[i];
          try {
            await this.reverseFileOperation(operation);
            successfulOperations.push(operation);
          } catch (error) {
            batchError = error;
            console.error(
              `[UNDO] Failed to reverse operation ${i + 1}/${reversedOperations.length}:`,
              error.message,
            );

            // Attempt to rollback successful operations to restore state
            if (successfulOperations.length > 0) {
              console.warn(
                `[UNDO] Attempting to rollback ${successfulOperations.length} successful operations`,
              );
              let rollbackErrors = 0;

              for (const successfulOp of successfulOperations.reverse()) {
                try {
                  // Re-execute the operation to restore original state
                  await this.executeFileOperation(successfulOp);
                } catch (rollbackError) {
                  rollbackErrors++;
                  console.error(
                    `[UNDO] Rollback failed for operation:`,
                    rollbackError.message,
                  );
                }
              }

              if (rollbackErrors > 0) {
                console.error(
                  `[UNDO] ${rollbackErrors} operations could not be rolled back - system may be in inconsistent state`,
                );
              }
            }

            // Mark the batch action as partially undone and stop further processing
            throw new Error(
              `Batch undo partially failed: ${error.message}. ${successfulOperations.length} operations were undone, ${reversedOperations.length - successfulOperations.length} failed.`,
            );
          }
        }
        break;
      }

      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  async executeForwardAction(action) {
    switch (action.type) {
      case 'FILE_MOVE':
        // Move file to new location
        await atomicFileOps.atomicMove(
          action.data.originalPath,
          action.data.newPath,
        );
        break;

      case 'FILE_RENAME':
        // Skip if source and destination are identical
        if (action.data.originalPath === action.data.newPath) {
          console.log(
            '[FILE_OP] Rename skipped – original and new paths are identical:',
            action.data.originalPath,
          );
          break;
        }
        // If a file exists at newPath, handle or report conflict
        if (await this.fileExists(action.data.newPath)) {
          throw new Error(
            `Cannot rename: target file already exists at ${action.data.newPath}`,
          );
        }
        // Perform the rename (atomic move)
        await atomicFileOps.atomicMove(
          action.data.originalPath,
          action.data.newPath,
        );
        break;

      case 'FILE_DELETE':
        // Delete file again (move to backup if configured)
        if (action.data.createBackup) {
          await atomicFileOps.atomicMove(
            action.data.originalPath,
            action.data.backupPath,
          );
        } else {
          await fs.unlink(action.data.originalPath);
        }
        break;

      case 'FOLDER_CREATE':
        // Create the folder again
        await fs.mkdir(action.data.folderPath, { recursive: true });
        break;

      case 'BATCH_ORGANIZE':
      case 'BATCH_OPERATION': // Backwards/forwards compatibility with shared ACTION_TYPES
        // Re-execute each file operation in the batch with error handling
        try {
          for (const operation of action.data.operations) {
            await this.executeFileOperation(operation);
          }
        } catch (error) {
          console.error('[REDO] Batch redo failed:', error);
          throw error;
        }
        break;

      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  async reverseFileOperation(operation) {
    switch (operation.type) {
      case 'move':
        await atomicFileOps.atomicMove(
          operation.newPath,
          operation.originalPath,
        );
        break;
      case 'rename':
        // Skip if source and destination are identical
        if (operation.newPath === operation.originalPath) {
          console.log(
            '[FILE_OP] Reverse rename skipped – paths are identical:',
            operation.originalPath,
          );
          break;
        }
        // If a file exists at originalPath, handle or report conflict
        if (await this.fileExists(operation.originalPath)) {
          throw new Error(
            `Cannot reverse rename: target file already exists at ${operation.originalPath}`,
          );
        }
        // Perform the reverse rename (atomic move)
        await atomicFileOps.atomicMove(
          operation.newPath,
          operation.originalPath,
        );
        break;
      case 'delete':
        if (
          operation.backupPath &&
          (await this.fileExists(operation.backupPath))
        ) {
          await atomicFileOps.atomicMove(
            operation.backupPath,
            operation.originalPath,
          );
        }
        break;
    }
  }

  async executeFileOperation(operation) {
    switch (operation.type) {
      case 'move':
        await atomicFileOps.atomicMove(
          operation.originalPath,
          operation.newPath,
        );
        break;
      case 'rename':
        // Skip if source and destination are identical
        if (operation.originalPath === operation.newPath) {
          console.log(
            '[FILE_OP] Rename skipped – original and new paths are identical:',
            operation.originalPath,
          );
          break;
        }
        // If a file exists at newPath, handle or report conflict
        if (await this.fileExists(operation.newPath)) {
          throw new Error(
            `Cannot rename: target file already exists at ${operation.newPath}`,
          );
        }
        // Perform the rename (atomic move)
        await atomicFileOps.atomicMove(
          operation.originalPath,
          operation.newPath,
        );
        break;
      case 'delete':
        if (operation.createBackup) {
          await atomicFileOps.atomicMove(
            operation.originalPath,
            operation.backupPath,
          );
        } else {
          await fs.unlink(operation.originalPath);
        }
        break;
    }
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  getActionDescription(actionType, actionData) {
    switch (actionType) {
      case 'FILE_MOVE':
        return `Move ${path.basename(actionData.originalPath)} to ${path.dirname(actionData.newPath)}`;
      case 'FILE_RENAME':
        return `Rename ${path.basename(actionData.originalPath)} to ${path.basename(actionData.newPath)}`;
      case 'FILE_DELETE':
        return `Delete ${path.basename(actionData.originalPath)}`;
      case 'FOLDER_CREATE':
        return `Create folder ${path.basename(actionData.folderPath)}`;
      case 'BATCH_ORGANIZE':
        return `Organize ${actionData.operations.length} files`;
      default:
        return `Unknown action: ${actionType}`;
    }
  }

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  getActionHistory(limit = 10) {
    const history = this.actions.slice(
      Math.max(0, this.currentIndex - limit + 1),
      this.currentIndex + 1,
    );
    return history.map((action) => ({
      id: action.id,
      description: action.description,
      timestamp: action.timestamp,
      type: action.type,
    }));
  }

  getRedoHistory(limit = 10) {
    const history = this.actions.slice(
      this.currentIndex + 1,
      this.currentIndex + 1 + limit,
    );
    return history.map((action) => ({
      id: action.id,
      description: action.description,
      timestamp: action.timestamp,
      type: action.type,
    }));
  }

  async clearHistory() {
    this.actions = [];
    this.currentIndex = -1;
    await this.forceSave();
  }
}

module.exports = UndoRedoService;
