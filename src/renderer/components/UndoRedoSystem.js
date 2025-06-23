// Undo/Redo System - Implementing Shneiderman's Golden Rule #6: Action Reversal Infrastructure
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import Modal from './Modal';

// Undo/Redo Context (proxy to main-process service)
const UndoRedoContext = createContext();

// Simple notification interface for UndoRedo system
function useSimpleNotifications() {
  return {
    showSuccess: (title, description) => {
      console.log(`✅ ${title}: ${description}`);
    },
    showError: (title, description) => {
      console.error(`❌ ${title}: ${description}`);
    },
    showInfo: (title, description) => {
      console.log(`ℹ️ ${title}: ${description}`);
    }
  };
}

// Action types mirrored from shared constants (kept for metadata)
const ACTION_TYPES = {
  FILE_MOVE: 'FILE_MOVE',
  FILE_RENAME: 'FILE_RENAME',
  FILE_DELETE: 'FILE_DELETE',
  FOLDER_CREATE: 'FOLDER_CREATE',
  FOLDER_DELETE: 'FOLDER_DELETE',
  SETTINGS_CHANGE: 'SETTINGS_CHANGE',
  BATCH_OPERATION: 'BATCH_OPERATION'
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

// ------------------------------
// Provider now proxies to main service
// ------------------------------
export function UndoRedoProvider({ children }) {
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isHistoryVisible, setIsHistoryVisible] = useState(false);
  const { showSuccess, showError, showInfo } = useSimpleNotifications();

  // Fetch remote canUndo / canRedo after each change
  const refreshStatus = useCallback(async () => {
    try {
      const [undoAble, redoAble] = await Promise.all([
        window.electronAPI.undoRedo.canUndo(),
        window.electronAPI.undoRedo.canRedo()
      ]);
      setCanUndo(!!undoAble);
      setCanRedo(!!redoAble);
    } catch (err) {
      console.error('Failed to refresh undo/redo status:', err);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Execute action with undo capability
  const executeAction = async (actionConfig) => {
    try {
      // Execute the action
      const result = await actionConfig.execute();
      
      // Refresh status after backend recorded action
      await refreshStatus();

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

  // Get action description for UI
  const getActionDescription = (action) => {
    if (!action) return '';
    const metadata = ACTION_METADATA[action.type];
    if (metadata) {
      return `${metadata.icon} ${action.description || metadata.description}`;
    }
    return action.description || 'Unknown action';
  };

  // Clear history
  const clearHistory = async () => {
    try {
      await window.electronAPI.undoRedo.clear();
      showInfo('History Cleared', 'Undo/redo history has been cleared');
      refreshStatus();
    } catch (err) {
      showError('Clear History Failed', err.message);
    }
  };

  // Remote undo/redo helpers
  const undo = async () => {
    try {
      const result = await window.electronAPI.undoRedo.undo();
      if (result?.success) {
        showInfo('Action Undone', result.message || 'Undid last action');
      } else {
        showError('Undo Failed', result?.message || 'Unable to undo');
      }
    } catch (err) {
      showError('Undo Failed', err.message);
    } finally {
      refreshStatus();
    }
  };

  const redo = async () => {
    try {
      const result = await window.electronAPI.undoRedo.redo();
      if (result?.success) {
        showInfo('Action Redone', result.message || 'Redid last action');
      } else {
        showError('Redo Failed', result?.message || 'Unable to redo');
      }
    } catch (err) {
      showError('Redo Failed', err.message);
    } finally {
      refreshStatus();
    }
  };

  const toggleHistory = () => setIsHistoryVisible(v => !v);

  const contextValue = {
    executeAction,
    undo,
    redo,
    canUndo,
    canRedo,
    getHistory: async (limit = 100) => {
      try {
        return await window.electronAPI.undoRedo.getHistory(limit);
      } catch {
        return [];
      }
    },
    peek: () => null,
    peekRedo: () => null,
    getActionDescription,
    clearHistory,
    toggleHistory,
    isHistoryVisible
  };

  return (
    <UndoRedoContext.Provider value={contextValue}>
      {children}
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
function HistoryModal({ isOpen, onClose }) {
  const { getHistory, clearHistory, getActionDescription } = useUndoRedo();
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const fetchHistory = async () => {
        setIsLoading(true);
        const historyData = await getHistory(50);
        setHistory(historyData);
        setIsLoading(false);
      };
      fetchHistory();
    }
  }, [isOpen, getHistory]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Action History"
      size="large"
    >
      <div className="p-8">
        <div className="flex justify-between items-center mb-6">
          <p className="text-sm text-text-secondary">
            Review the sequence of actions. You can undo them sequentially.
          </p>
          <button onClick={clearHistory} className="btn-danger-secondary text-sm">
            Clear History
          </button>
        </div>
        
        {isLoading ? (
          <div className="text-center p-8">
             <div className="animate-spin w-8 h-8 border-3 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
             <p className="text-gray-500">Loading history...</p>
          </div>
        ) : history.length === 0 ? (
          <div className="text-center p-8 glass-card">
            <div className="text-4xl mb-4">📂</div>
            <h3 className="text-lg font-semibold text-on-glass mb-2">No Operations Yet</h3>
            <p className="text-readable-light">
              Start organizing files to see undo/redo options here.
            </p>
          </div>
        ) : (
          <ul className="space-y-4 max-h-[60vh] overflow-y-auto modern-scrollbar pr-4">
            {history.map((action, index) => (
              <li
                key={index}
                className="flex items-center p-4 glass-card"
              >
                <span className="text-lg mr-4">{getActionDescription(action).split(' ')[0]}</span>
                <div className="flex-grow">
                  <p className="font-medium text-gray-900">
                    {getActionDescription(action).substring(getActionDescription(action).indexOf(' ') + 1)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(action.timestamp).toLocaleString()}
                  </p>
                </div>
                {index === 0 && (
                  <span className="text-xs font-semibold uppercase text-blue-600 bg-blue-600/10 px-3 py-1 rounded-full">
                    Last Action
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

// ------------------------------
// Toolbar component
// ------------------------------
export function UndoRedoToolbar({ onUndo, onRedo, canUndo, canRedo, onToggleHistory, className = '' }) {
  const buttonClass = (enabled) =>
    `btn-secondary flex items-center gap-2 px-4 py-3 text-sm ${
      enabled ? 'text-gray-900' : 'text-gray-400 cursor-not-allowed'
    }`;
    
  return (
    <div className={`flex items-center gap-3 p-2 rounded-lg glass-card ${className}`}>
      <button onClick={onUndo} disabled={!canUndo} className={buttonClass(canUndo)} aria-label="Undo last action">
        <span className="text-lg">↩️</span>
        <span>Undo</span>
      </button>
      <button onClick={onRedo} disabled={!canRedo} className={buttonClass(canRedo)} aria-label="Redo last action">
        <span className="text-lg">↪️</span>
        <span>Redo</span>
      </button>
      <button
        onClick={onToggleHistory}
        className="btn-secondary flex items-center gap-2 px-4 py-3 text-sm text-gray-900"
        aria-label="View action history"
      >
        <span className="text-lg">📜</span>
        <span>History</span>
      </button>
    </div>
  );
}

// Helper functions for common actions
export const createFileAction = (type, description, filePath, operation) => ({
  type,
  description,
  execute: async () => {
    return await window.electronAPI.files.performOperation({
      operation,
      filePath,
      type
    });
  },
  undo: async () => {
    // Implement reverse operation
    const reverseOp = getReverseOperation(operation);
    return await window.electronAPI.files.performOperation({
      operation: reverseOp,
      filePath,
      type
    });
  },
  metadata: { filePath, operation }
});

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
