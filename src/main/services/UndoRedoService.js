const fs = require('fs').promises;
const path = require('path');

const { app } = require('electron');
const { ACTION_TYPES } = require('../shared/constants');

class UndoRedoService {
  constructor() {
    this.userDataPath = app.getPath('userData');
    this.actionsPath = path.join(this.userDataPath, 'undo-actions.json');
    this.maxActions = 100; // Maximum number of actions to keep
    
    this.actions = [];
    this.currentIndex = -1; // Points to the last executed action
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
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
      this.actions = data.actions || [];
      this.currentIndex = data.currentIndex || -1;
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
      lastSaved: new Date().toISOString()
    };
    await fs.writeFile(this.actionsPath, JSON.stringify(data, null, 2));
  }

  async recordAction(actionType, actionData) {
    await this.initialize();
    
    const action = {
      id: this.generateId(),
      type: actionType,
      timestamp: new Date().toISOString(),
      data: actionData,
      description: this.getActionDescription(actionType, actionData)
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

    await this.saveActions();
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
      await this.saveActions();
      return {
        success: true,
        action,
        message: `Undid: ${action.description}`
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
      await this.saveActions();
      return {
        success: true,
        action,
        message: `Redid: ${action.description}`
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
      case ACTION_TYPES.FILE_MOVE:
        // Move file back to original location
        await fs.rename(action.data.newPath, action.data.originalPath);
        break;
        
      case ACTION_TYPES.FILE_RENAME:
        // Rename file back to original name
        await fs.rename(action.data.newPath, action.data.originalPath);
        break;
        
      case ACTION_TYPES.FILE_DELETE:
        // Restore file from backup (if we have one)
        if (action.data.backupPath && await this.fileExists(action.data.backupPath)) {
          await fs.rename(action.data.backupPath, action.data.originalPath);
        } else {
          throw new Error('Cannot restore deleted file - backup not found');
        }
        break;
        
      case ACTION_TYPES.FOLDER_CREATE:
        // Remove the created folder (if empty)
        try {
          await fs.rmdir(action.data.folderPath);
        } catch (error) {
          // Folder might not be empty, try to restore to original state
          console.warn('Could not remove folder, might contain files:', error.message);
        }
        break;
        
      case ACTION_TYPES.BATCH_ORGANIZE:
        // Reverse each file operation in the batch
        for (const operation of action.data.operations.reverse()) {
          await this.reverseFileOperation(operation);
        }
        break;
        
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  async executeForwardAction(action) {
    switch (action.type) {
      case ACTION_TYPES.FILE_MOVE:
        // Move file to new location
        await fs.rename(action.data.originalPath, action.data.newPath);
        break;
        
      case ACTION_TYPES.FILE_RENAME:
        // Rename file to new name
        await fs.rename(action.data.originalPath, action.data.newPath);
        break;
        
      case ACTION_TYPES.FILE_DELETE:
        // Delete file again (move to backup if configured)
        if (action.data.createBackup) {
          await fs.rename(action.data.originalPath, action.data.backupPath);
        } else {
          await fs.unlink(action.data.originalPath);
        }
        break;
        
      case ACTION_TYPES.FOLDER_CREATE:
        // Create the folder again
        await fs.mkdir(action.data.folderPath, { recursive: true });
        break;
        
      case ACTION_TYPES.BATCH_ORGANIZE:
        // Re-execute each file operation in the batch
        for (const operation of action.data.operations) {
          await this.executeFileOperation(operation);
        }
        break;
        
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  async reverseFileOperation(operation) {
    switch (operation.type) {
      case 'move':
        await fs.rename(operation.newPath, operation.originalPath);
        break;
      case 'rename':
        await fs.rename(operation.newPath, operation.originalPath);
        break;
      case 'delete':
        if (operation.backupPath && await this.fileExists(operation.backupPath)) {
          await fs.rename(operation.backupPath, operation.originalPath);
        }
        break;
    }
  }

  async executeFileOperation(operation) {
    switch (operation.type) {
      case 'move':
        await fs.rename(operation.originalPath, operation.newPath);
        break;
      case 'rename':
        await fs.rename(operation.originalPath, operation.newPath);
        break;
      case 'delete':
        if (operation.createBackup) {
          await fs.rename(operation.originalPath, operation.backupPath);
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
      case ACTION_TYPES.FILE_MOVE:
        return `Move ${path.basename(actionData.originalPath)} to ${path.dirname(actionData.newPath)}`;
      case ACTION_TYPES.FILE_RENAME:
        return `Rename ${path.basename(actionData.originalPath)} to ${path.basename(actionData.newPath)}`;
      case ACTION_TYPES.FILE_DELETE:
        return `Delete ${path.basename(actionData.originalPath)}`;
      case ACTION_TYPES.FOLDER_CREATE:
        return `Create folder ${path.basename(actionData.folderPath)}`;
      case ACTION_TYPES.FOLDER_RENAME:
        return `Rename folder ${path.basename(actionData.originalPath)} to ${path.basename(actionData.newPath)}`;
      case ACTION_TYPES.BATCH_ORGANIZE:
        return `Organize ${actionData.operations.length} files`;
      case ACTION_TYPES.ANALYSIS_RESULT:
        return `Analyze ${path.basename(actionData.filePath)}`;
      default:
        return `Unknown action: ${actionType}`;
    }
  }

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  getActionHistory(limit = 10) {
    const history = this.actions.slice(Math.max(0, this.currentIndex - limit + 1), this.currentIndex + 1);
    return history.map((action) => ({
      id: action.id,
      description: action.description,
      timestamp: action.timestamp,
      type: action.type
    }));
  }

  getRedoHistory(limit = 10) {
    const history = this.actions.slice(this.currentIndex + 1, this.currentIndex + 1 + limit);
    return history.map((action) => ({
      id: action.id,
      description: action.description,
      timestamp: action.timestamp,
      type: action.type
    }));
  }

  async clearHistory() {
    this.actions = [];
    this.currentIndex = -1;
    await this.saveActions();
  }
}

module.exports = UndoRedoService; 