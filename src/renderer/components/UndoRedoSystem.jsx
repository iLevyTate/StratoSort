// Undo/Redo System - Implementing Shneiderman's Golden Rule #6: Action Reversal Infrastructure
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

// Undo/Redo Context
const UndoRedoContext = createContext();

// Simple notification interface for UndoRedo system
function useSimpleNotifications() {
  return {
    showSuccess: (title, description) => {
      console.log(`✅ ${title}: ${description}`);
      // Could integrate with window.electronAPI for toast notifications if available
    },
    showError: (title, description) => {
      console.error(`❌ ${title}: ${description}`);
      // Could integrate with window.electronAPI for toast notifications if available  
    },
    showInfo: (title, description) => {
      console.log(`ℹ️ ${title}: ${description}`);
      // Could integrate with window.electronAPI for toast notifications if available
    }
  };
}

// Action types that can be undone
const ACTION_TYPES = {
  FILE_MOVE: 'file_move',
  FILE_DELETE: 'file_delete',
  FILE_RENAME: 'file_rename',
  FOLDER_CREATE: 'folder_create',
  FOLDER_DELETE: 'folder_delete',
  FOLDER_RENAME: 'folder_rename',
  SETTINGS_CHANGE: 'settings_change',
  ANALYSIS_RESULT: 'analysis_result',
  BATCH_OPERATION: 'batch_operation'
};

// Action metadata for user-friendly descriptions
const ACTION_METADATA = {
  [ACTION_TYPES.FILE_MOVE]: {
    description: 'Move file',
    icon: '📁',
    category: 'File Operations'
  },
  [ACTION_TYPES.FILE_DELETE]: {
    description: 'Delete file',
    icon: '🗑️',
    category: 'File Operations'
  },
  [ACTION_TYPES.FILE_RENAME]: {
    description: 'Rename file',
    icon: '✏️',
    category: 'File Operations'
  },
  [ACTION_TYPES.FOLDER_CREATE]: {
    description: 'Create folder',
    icon: '📂',
    category: 'Folder Operations'
  },
  [ACTION_TYPES.FOLDER_DELETE]: {
    description: 'Delete folder',
    icon: '🗂️',
    category: 'Folder Operations'
  },
  [ACTION_TYPES.FOLDER_RENAME]: {
    description: 'Rename folder',
    icon: '📝',
    category: 'Folder Operations'
  },
  [ACTION_TYPES.SETTINGS_CHANGE]: {
    description: 'Change settings',
    icon: '⚙️',
    category: 'Configuration'
  },
  [ACTION_TYPES.ANALYSIS_RESULT]: {
    description: 'File analysis',
    icon: '🔍',
    category: 'Analysis'
  },
  [ACTION_TYPES.BATCH_OPERATION]: {
    description: 'Batch operation',
    icon: '📦',
    category: 'Batch Operations'
  }
};

// Undo Stack Manager
class UndoStack {
  constructor(maxSize = 100) {
    this.stack = [];
    this.pointer = -1;
    this.maxSize = maxSize;
    this.listeners = new Set();
  }

  push(action) {
    // Remove any actions after current pointer (when undoing then doing new action)
    this.stack = this.stack.slice(0, this.pointer + 1);
    
    // Add new action
    this.stack.push({
      ...action,
      id: `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString()
    });
    
    // Maintain max size
    if (this.stack.length > this.maxSize) {
      this.stack.shift();
    } else {
      this.pointer++;
    }
    
    this.notifyListeners();
  }

  canUndo() {
    return this.pointer >= 0;
  }

  canRedo() {
    return this.pointer < this.stack.length - 1;
  }

  undo() {
    if (!this.canUndo()) return null;
    
    const action = this.stack[this.pointer];
    this.pointer--;
    this.notifyListeners();
    
    return action;
  }

  redo() {
    if (!this.canRedo()) return null;
    
    this.pointer++;
    const action = this.stack[this.pointer];
    this.notifyListeners();
    
    return action;
  }

  peek() {
    return this.canUndo() ? this.stack[this.pointer] : null;
  }

  peekRedo() {
    return this.canRedo() ? this.stack[this.pointer + 1] : null;
  }

  getHistory() {
    return this.stack.slice(0, this.pointer + 1);
  }

  clear() {
    this.stack = [];
    this.pointer = -1;
    this.notifyListeners();
  }

  addListener(listener) {
    this.listeners.add(listener);
  }

  removeListener(listener) {
    this.listeners.delete(listener);
  }

  notifyListeners() {
    this.listeners.forEach(listener => listener());
  }
}

// Undo/Redo Provider Component
export function UndoRedoProvider({ children }) {
  const [undoStack] = useState(() => new UndoStack());
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isHistoryVisible, setIsHistoryVisible] = useState(false);
  const { showSuccess, showError, showInfo } = useSimpleNotifications();

  // Update state when stack changes
  const updateState = useCallback(() => {
    setCanUndo(undoStack.canUndo());
    setCanRedo(undoStack.canRedo());
  }, [undoStack]);

  useEffect(() => {
    undoStack.addListener(updateState);
    return () => undoStack.removeListener(updateState);
  }, [undoStack, updateState]);

  // Execute action with undo capability
  const executeAction = async (actionConfig) => {
    try {
      // Execute the action
      const result = await actionConfig.execute();
      
      // Add to undo stack if successful
      undoStack.push({
        type: actionConfig.type,
        description: actionConfig.description,
        undo: actionConfig.undo,
        redo: actionConfig.redo || actionConfig.execute,
        metadata: actionConfig.metadata || {},
        result
      });

      showSuccess(
        'Action Completed',
        `${actionConfig.description} completed successfully`
      );

      return result;
    } catch (error) {
      showError(
        'Action Failed',
        `Failed to ${actionConfig.description.toLowerCase()}: ${error.message}`
      );
      throw error;
    }
  };

  // Undo last action with confirmation for important operations
  const undo = async () => {
    const action = undoStack.peek();
    if (!action) return;

    // Show confirmation for important operations (like file organization)
    if (action.description && (
      action.description.toLowerCase().includes('organize') ||
      action.description.toLowerCase().includes('move') ||
      action.description.toLowerCase().includes('delete')
    )) {
      const confirmed = window.confirm(
        `Are you sure you want to undo: "${action.description}"?\n\n` +
        `This will reverse the file operation and move files back to their original locations.`
      );
      if (!confirmed) {
        return; // User cancelled the undo
      }
    }

    const undoAction = undoStack.undo();
    if (!undoAction) return;

    try {
      await undoAction.undo();
      showInfo(
        'Action Undone',
        `Undid: ${undoAction.description}`
      );
    } catch (error) {
      // If undo fails, restore the action to the stack
      undoStack.push(undoAction);
      showError(
        'Undo Failed',
        `Failed to undo ${undoAction.description}: ${error.message}`
      );
    }
  };

  // Redo last undone action
  const redo = async () => {
    const action = undoStack.redo();
    if (!action) return;

    try {
      await action.redo();
      showInfo(
        'Action Redone',
        `Redid: ${action.description}`
      );
    } catch (error) {
      // If redo fails, move pointer back
      undoStack.pointer--;
      undoStack.notifyListeners();
      showError(
        'Redo Failed',
        `Failed to redo ${action.description}: ${error.message}`
      );
    }
  };

  // Get action description for UI
  const getActionDescription = (action) => {
    const metadata = ACTION_METADATA[action.type];
    if (metadata) {
      return `${metadata.icon} ${action.description || metadata.description}`;
    }
    return action.description || 'Unknown action';
  };

  // Clear history
  const clearHistory = () => {
    undoStack.clear();
    showInfo('History Cleared', 'Undo/redo history has been cleared');
  };

  const contextValue = {
    executeAction,
    undo,
    redo,
    canUndo,
    canRedo,
    getHistory: () => undoStack.getHistory(),
    peek: () => undoStack.peek(),
    peekRedo: () => undoStack.peekRedo(),
    getActionDescription,
    clearHistory,
    isHistoryVisible,
    setIsHistoryVisible
  };

  return (
    <UndoRedoContext.Provider value={contextValue}>
      {children}
      {isHistoryVisible && <HistoryModal />}
    </UndoRedoContext.Provider>
  );
}

// Hook to use undo/redo
export function useUndoRedo() {
  const context = useContext(UndoRedoContext);
  if (!context) {
    throw new Error('useUndoRedo must be used within an UndoRedoProvider');
  }
  return context;
}

// History Modal Component
function HistoryModal() {
  const { 
    getHistory, 
    setIsHistoryVisible, 
    getActionDescription, 
    clearHistory 
  } = useUndoRedo();

  const history = getHistory();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" style={{position:'fixed', inset:0, display:'flex', justifyContent:'center', alignItems:'center', zIndex:2147483645}}>
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">Action History</h2>
          <div className="flex items-center space-x-2">
            <button
              onClick={clearHistory}
              className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
            >
              Clear History
            </button>
            <button
              onClick={() => setIsHistoryVisible(false)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {history.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p>No actions in history</p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.slice().reverse().map((action, index) => (
                <div
                  key={action.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-lg">
                      {ACTION_METADATA[action.type]?.icon || '📄'}
                    </span>
                    <div>
                      <div className="font-medium text-gray-900">
                        {action.description}
                      </div>
                      <div className="text-sm text-gray-500">
                        {new Date(action.timestamp).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm text-gray-400">
                    #{history.length - index}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Undo/Redo Toolbar Component
export function UndoRedoToolbar({ className = '' }) {
  const { 
    undo, 
    redo, 
    canUndo, 
    canRedo, 
    peek, 
    peekRedo, 
    getActionDescription,
    setIsHistoryVisible 
  } = useUndoRedo();

  const lastAction = peek();
  const nextAction = peekRedo();

  // Check if the last action is an important operation that needs confirmation
  const isImportantOperation = lastAction?.description && (
    lastAction.description.toLowerCase().includes('organize') ||
    lastAction.description.toLowerCase().includes('move') ||
    lastAction.description.toLowerCase().includes('delete')
  );

  return (
    <div className={`flex items-center space-x-1 ${className}`}>
      <button
        onClick={undo}
        disabled={!canUndo}
        className={`p-2 rounded-lg transition-colors border
          ${!canUndo 
            ? 'text-gray-300 cursor-not-allowed border-transparent' 
            : isImportantOperation
              ? 'text-orange-700 hover:bg-orange-50 hover:text-orange-900 border-orange-200 hover:border-orange-300' 
              : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900 border-transparent hover:border-gray-200'
          }
        `}
        title={lastAction ? `⚠️ Undo: ${getActionDescription(lastAction)}${isImportantOperation ? ' (Will ask for confirmation)' : ''}` : 'Nothing to undo'}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
        </svg>
      </button>
      
      <button
        onClick={redo}
        disabled={!canRedo}
        className={`
          p-2 rounded-lg transition-colors
          ${canRedo 
            ? 'text-gray-700 hover:bg-gray-100 hover:text-gray-900' 
            : 'text-gray-300 cursor-not-allowed'
          }
        `}
        title={nextAction ? `Redo: ${getActionDescription(nextAction)}` : 'Nothing to redo'}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" />
        </svg>
      </button>
      
      <div className="w-px h-6 bg-gray-300 mx-1" />
      
      <button
        onClick={() => setIsHistoryVisible(true)}
        className="p-2 rounded-lg text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors"
        title="View action history"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>
    </div>
  );
}

// Helper functions for common actions
export const createFileAction = (type, description, filePath, operation) => ({
  type,
  description,
  execute: async () => {
    const payload = buildOperationPayload(operation, filePath);
    return await window.electronAPI.files.performOperation(payload);
  },
  undo: async () => {
    const reverseOp = getReverseOperation(operation);
    const payload = buildOperationPayload(reverseOp, filePath, { reverse: true });
    return await window.electronAPI.files.performOperation(payload);
  },
  metadata: { filePath, operation }
});

function buildOperationPayload(op, filePath, options = {}) {
  // For simplicity, use metadata options to infer source/destination when available in the callsite
  // Consumers should pass a full payload if needed; this helper supports simple single-file ops
  if (typeof op === 'object' && op !== null) {
    return op;
  }
  const type = String(op);
  switch (type) {
    case 'move':
      // Expect caller to provide { source, destination } via object; fallback keeps API explicit
      return { type: 'move', source: filePath?.source || filePath, destination: filePath?.destination };
    case 'copy':
      return { type: 'copy', source: filePath?.source || filePath, destination: filePath?.destination };
    case 'delete':
      return { type: 'delete', source: filePath?.source || filePath };
    case 'restore':
      // For restore, caller should pass originalPath via object form for correctness
      return { type: 'move', source: filePath?.backupPath || filePath, destination: filePath?.originalPath };
    default:
      return { type, source: filePath };
  }
}

export const createSettingsAction = (description, newSettings, oldSettings) => ({
  type: ACTION_TYPES.SETTINGS_CHANGE,
  description,
  execute: async () => {
    return await window.electronAPI.settings.save(newSettings);
  },
  undo: async () => {
    return await window.electronAPI.settings.save(oldSettings);
  },
  metadata: { newSettings, oldSettings }
});

export const createBatchAction = (description, actions) => ({
  type: ACTION_TYPES.BATCH_OPERATION,
  description,
  execute: async () => {
    const results = [];
    for (const action of actions) {
      results.push(await action.execute());
    }
    return results;
  },
  undo: async () => {
    const results = [];
    // Undo in reverse order
    for (const action of actions.slice().reverse()) {
      results.push(await action.undo());
    }
    return results;
  },
  metadata: { actionCount: actions.length }
});

// Helper to get reverse operation
function getReverseOperation(operation) {
  const reverseMap = {
    'move': 'move', // Move back to original location
    'delete': 'restore',
    'rename': 'rename', // Rename back to original name
    'create': 'delete'
  };
  return reverseMap[operation] || operation;
}

export default {
  UndoRedoProvider,
  useUndoRedo,
  UndoRedoToolbar,
  ACTION_TYPES,
  createFileAction,
  createSettingsAction,
  createBatchAction
}; 
