import React, { useState, useEffect, useContext, createContext, useReducer, useCallback, useMemo } from 'react';
import './tailwind.css';
import AppShell from './components/layout/AppShell';
import TooltipManager from './components/TooltipManager';
import Button from './components/ui/Button';
import Card from './components/ui/Card';
import Input from './components/ui/Input';
import Textarea from './components/ui/Textarea';
import Select from './components/ui/Select';

// Import the UndoRedo system
import { UndoRedoProvider, useUndoRedo, UndoRedoToolbar } from './components/UndoRedoSystem';

// Import enhanced UI components
import { ToastContainer, useToast } from './components/Toast';
import Modal, { ConfirmModal } from './components/Modal';
// LoadingSkeleton components
import LoadingSkeleton, { 
  SmartFolderSkeleton, 
  FileAnalysisSkeleton, 
  DirectoryScanSkeleton, 
  LoadingOverlay 
} from './components/LoadingSkeleton';

// ===== IMPORT SHARED CONSTANTS =====
const { 
  PHASES, 
  PHASE_TRANSITIONS, 
  PHASE_METADATA 
} = require('../shared/constants');

// ===== ENHANCED NOTIFICATION SYSTEM =====
// Using the new Toast component system
const NotificationContext = createContext(null);

function NotificationProvider({ children }) {
  const { toasts, addToast, removeToast, showSuccess, showError, showWarning, showInfo } = useToast();

  const addNotification = useCallback((message, severity = 'info', duration = 3000) => {
    return addToast(message, severity, duration);
  }, [addToast]);

  const removeNotification = useCallback((id) => {
    removeToast(id);
  }, [removeToast]);

  // Bridge main-process errors into our styled UI (toast/modal), avoiding OS dialogs
  useEffect(() => {
    const api = window?.electronAPI?.events;
    if (!api || typeof api.onAppError !== 'function') return;

    const cleanup = api.onAppError((payload) => {
      try {
        const { message, type } = payload || {};
        if (!message) return;
        if (type === 'error') showError(message, 5000);
        else if (type === 'warning') showWarning(message, 4000);
        else showInfo(message, 3000);
      } catch (e) {
        console.error('[Renderer] Failed to display app:error', e);
      }
    });

    return cleanup;
  }, [showError, showWarning, showInfo]);

  return (
    <NotificationContext.Provider value={{ 
      notifications: toasts, 
      addNotification, 
      removeNotification,
      showSuccess,
      showError, 
      showWarning,
      showInfo
    }}>
      {children}
      <ToastContainer toasts={toasts} onRemoveToast={removeToast} />
    </NotificationContext.Provider>
  );
}

function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotification must be used within NotificationProvider');
  return context;
}



// ===== CONFIRMATION DIALOG HOOK =====
function useConfirmDialog() {
  const [confirmState, setConfirmState] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    variant: 'default',
    fileName: null,
    onConfirm: null
  });

  const showConfirm = useCallback(({
    title = 'Confirm Action',
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'default',
    fileName = null
  }) => {
    return new Promise((resolve) => {
      setConfirmState({
        isOpen: true,
        title,
        message,
        confirmText,
        cancelText,
        variant,
        fileName,
        onConfirm: () => {
          resolve(true);
          setConfirmState(prev => ({ ...prev, isOpen: false }));
        }
      });
    });
  }, []);

  const hideConfirm = useCallback(() => {
    setConfirmState(prev => ({ ...prev, isOpen: false }));
  }, []);

  const ConfirmDialog = useCallback(() => (
    <ConfirmModal
      isOpen={confirmState.isOpen}
      onClose={hideConfirm}
      onConfirm={confirmState.onConfirm}
      title={confirmState.title}
      message={confirmState.message}
      confirmText={confirmState.confirmText}
      cancelText={confirmState.cancelText}
      variant={confirmState.variant}
      fileName={confirmState.fileName}
    />
  ), [confirmState, hideConfirm]);

  return { showConfirm, ConfirmDialog };
}

// ===== DRAG AND DROP HOOK =====
function useDragAndDrop(onFilesDropped) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0 && onFilesDropped) {
      const fileObjects = files.map(file => ({
        path: file.path || file.name,
        name: file.name,
        type: 'file',
        size: file.size
      }));
      onFilesDropped(fileObjects);
    }
  }, [onFilesDropped]);

  return {
    isDragging,
    dragProps: {
      onDragEnter: handleDragEnter,
      onDragLeave: handleDragLeave,
      onDragOver: handleDragOver,
      onDrop: handleDrop
    }
  };
}

// ===== PHASE MANAGEMENT =====
function phaseReducer(state, action) {
  switch (action.type) {
    case 'ADVANCE_PHASE':
      const { targetPhase, data = {} } = action.payload;
      const allowedTransitions = PHASE_TRANSITIONS[state.currentPhase] || [];
      
      // Allow self-transitions (staying in the same phase) or valid transitions
      if (targetPhase !== state.currentPhase && !allowedTransitions.includes(targetPhase)) {
        console.warn(`Invalid transition from ${state.currentPhase} to ${targetPhase}`);
        return state;
      }

      return {
        ...state,
        currentPhase: targetPhase,
        phaseData: { ...state.phaseData, ...data }
      };

    case 'SET_PHASE_DATA':
      return {
        ...state,
        phaseData: { ...state.phaseData, [action.payload.key]: action.payload.value }
      };

    case 'SET_LOADING':
      return { ...state, isLoading: action.payload.isLoading };

    case 'TOGGLE_SETTINGS':
      return { ...state, showSettings: !state.showSettings };

    case 'RESTORE_STATE':
      return {
        ...state,
        currentPhase: action.payload.currentPhase,
        phaseData: action.payload.phaseData
      };

    case 'RESET_WORKFLOW':
      return {
        ...state,
        currentPhase: PHASES.WELCOME,
        phaseData: {
          smartFolders: [],
          selectedFiles: [],
          analysisResults: [],
          organizedFiles: []
        }
      };

    default:
      return state;
  }
}

const PhaseContext = createContext(null);

function PhaseProvider({ children }) {
  const [state, dispatch] = useReducer(phaseReducer, {
    currentPhase: PHASES.WELCOME,
    phaseData: {
      smartFolders: [],
      selectedFiles: [],
      analysisResults: [],
      organizedFiles: []
    },
    isLoading: false,
    showSettings: false
  });

  // Load saved workflow state on mount (using localStorage like vanilla HTML)
  useEffect(() => {
    const loadWorkflowState = () => {
      try {
        const savedState = localStorage.getItem('stratosort_workflow_state');
        if (savedState) {
          const parsed = JSON.parse(savedState);
          const age = Date.now() - parsed.timestamp;
          
          // Only restore if less than 1 hour old (allow COMPLETE phase restoration now)
          if (age < 3600000) {
            dispatch({ type: 'RESTORE_STATE', payload: parsed });
          }
        }
      } catch (error) {
        console.error('Failed to load workflow state:', error);
      }
    };

    loadWorkflowState();
  }, []);

  // Save workflow state when it changes (using localStorage like vanilla HTML)
  useEffect(() => {
    const saveWorkflowState = () => {
      try {
        // Don't save WELCOME phase, but DO save COMPLETE phase for navigation back
        if (state.currentPhase !== PHASES.WELCOME) {
          const workflowState = {
            currentPhase: state.currentPhase,
            phaseData: state.phaseData,
            timestamp: Date.now()
          };
          localStorage.setItem('stratosort_workflow_state', JSON.stringify(workflowState));
        }
      } catch (error) {
        console.error('Failed to save workflow state:', error);
      }
    };

    // Debounce saves to avoid too frequent writes
    const timeoutId = setTimeout(saveWorkflowState, 1000);
    return () => clearTimeout(timeoutId);
  }, [state.currentPhase, state.phaseData]);

  const actions = {
    advancePhase: useCallback((targetPhase, data) => {
      dispatch({ type: 'ADVANCE_PHASE', payload: { targetPhase, data } });
    }, []),
    
    setPhaseData: useCallback((key, value) => {
      dispatch({ type: 'SET_PHASE_DATA', payload: { key, value } });
    }, []),
    
    setLoading: useCallback((isLoading) => {
      dispatch({ type: 'SET_LOADING', payload: { isLoading } });
    }, []),

    toggleSettings: useCallback(() => {
      dispatch({ type: 'TOGGLE_SETTINGS' });
    }, []),

    resetWorkflow: useCallback(() => {
      try {
        localStorage.removeItem('stratosort_workflow_state');
        dispatch({ type: 'RESET_WORKFLOW' });
      } catch (error) {
        console.error('Failed to reset workflow:', error);
      }
    }, [])
  };

  return (
    <PhaseContext.Provider value={{ ...state, actions, getCurrentMetadata: () => PHASE_METADATA[state.currentPhase] }}>
      {children}
    </PhaseContext.Provider>
  );
}

function usePhase() {
  const context = useContext(PhaseContext);
  if (!context) throw new Error('usePhase must be used within a PhaseProvider');
  return context;
}

// ===== SETTINGS PANEL =====
function SettingsPanel() {
  const { actions } = usePhase();
  const { addNotification } = useNotification();
  const [settings, setSettings] = useState({
    ollamaHost: 'http://127.0.0.1:11434',
    textModel: 'llama3.2:latest',
    visionModel: 'llava:latest',
    embeddingModel: 'mxbai-embed-large',
    maxConcurrentAnalysis: 3,
    autoOrganize: false,
    defaultSmartFolderLocation: 'Documents'
  });
  const [ollamaModels, setOllamaModels] = useState({ models: [], categories: { text: [], vision: [], embedding: [] }});
  const [testResults, setTestResults] = useState({});
  const [isTestingApi, setIsTestingApi] = useState(false);

  useEffect(() => {
    let mounted = true;
    
    const loadSettingsIfMounted = async () => {
      if (mounted) {
        await loadSettings();
      }
    };
    
    const loadOllamaModelsIfMounted = async () => {
      if (mounted) {
        await loadOllamaModels();
      }
    };
    
    loadSettingsIfMounted();
    loadOllamaModelsIfMounted();
    
    return () => { mounted = false; };
  }, []);

  const loadSettings = async () => {
    try {
      const savedSettings = await window.electronAPI.settings.get();
      if (savedSettings) {
        setSettings(prev => ({ ...prev, ...savedSettings }));
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const loadOllamaModels = async () => {
    try {
      const response = await window.electronAPI.ollama.getModels();
      // Expected: { models, categories: {text, vision, embedding}, selected, host }
      setOllamaModels({
        models: response?.models || [],
        categories: response?.categories || { text: [], vision: [], embedding: [] }
      });
      if (response?.selected) {
        setSettings(prev => ({
          ...prev,
          textModel: response.selected.textModel || prev.textModel,
          visionModel: response.selected.visionModel || prev.visionModel,
          embeddingModel: response.selected.embeddingModel || prev.embeddingModel,
          ollamaHost: response.host || prev.ollamaHost
        }));
      }
    } catch (error) {
      console.error('Failed to load Ollama models:', error);
      setOllamaModels({ models: [], categories: { text: [], vision: [], embedding: [] } });
    }
  };

  const saveSettings = async () => {
    try {
      await window.electronAPI.settings.save(settings);
      addNotification('Settings saved successfully!', 'success');
    } catch (error) {
      console.error('Failed to save settings:', error);
      addNotification('Failed to save settings', 'error');
    }
  };

  const runAPITests = async () => {
    setIsTestingApi(true);
    const results = {};

    // Test File Operations
    try {
      await window.electronAPI.files.getDocumentsPath();
      results.fileOperations = '✅ Working';
    } catch (error) {
      results.fileOperations = `❌ Error: ${error.message}`;
    }

    // Test Smart Folders
    try {
      await window.electronAPI.smartFolders.get();
      results.smartFolders = '✅ Working';
    } catch (error) {
      results.smartFolders = `❌ Error: ${error.message}`;
    }

    // Test Analysis History
    try {
      await window.electronAPI.analysisHistory.getStatistics();
      results.analysisHistory = '✅ Working';
    } catch (error) {
      results.analysisHistory = `❌ Error: ${error.message}`;
    }

    // Test Undo/Redo
    try {
      await window.electronAPI.undoRedo.canUndo();
      results.undoRedo = '✅ Working';
    } catch (error) {
      results.undoRedo = `❌ Error: ${error.message}`;
    }



    // Test System Monitoring
    try {
      await window.electronAPI.system.getApplicationStatistics();
      results.systemMonitoring = '✅ Working';
    } catch (error) {
      results.systemMonitoring = `❌ Error: ${error.message}`;
    }

    // Test Ollama
    try {
      await window.electronAPI.ollama.getModels();
      results.ollama = '✅ Working';
    } catch (error) {
      results.ollama = `❌ Error: ${error.message}`;
    }

    setTestResults(results);
    setIsTestingApi(false);
    addNotification('API tests completed', 'info');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-fib-21 max-h-[80vh] overflow-auto">
        <div className="p-fib-21 border-b border-system-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-system-gray-900">⚙️ Settings</h2>
            <Button
              onClick={actions.toggleSettings}
              variant="ghost"
              className="text-system-gray-500 hover:text-system-gray-700 p-fib-5"
              aria-label="Close settings"
              title="Close settings"
            >
              ✕
            </Button>
          </div>
        </div>

        <div className="p-fib-21 space-y-fib-21">
          {/* Ollama Configuration */}
          <div>
            <h3 className="text-lg font-semibold mb-fib-13">🤖 AI Configuration</h3>
            <div className="space-y-fib-13">
              <div>
                <label className="block text-sm font-medium text-system-gray-700 mb-fib-5">Ollama Host URL</label>
                <Input
                  type="text"
                  value={settings.ollamaHost}
                  onChange={(e) => setSettings(prev => ({ ...prev, ollamaHost: e.target.value }))}
                  placeholder="http://127.0.0.1:11434"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-fib-13">
                <div>
                  <label className="block text-sm font-medium text-system-gray-700 mb-fib-5">Text Model</label>
                  <Select
                    value={settings.textModel}
                    onChange={(e) => setSettings(prev => ({ ...prev, textModel: e.target.value }))}
                  >
                    {(ollamaModels.categories.text.length ? ollamaModels.categories.text : ollamaModels.models).map(model => (
                      <option key={model} value={model}>{model}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-system-gray-700 mb-fib-5">Vision Model</label>
                  <Select
                    value={settings.visionModel}
                    onChange={(e) => setSettings(prev => ({ ...prev, visionModel: e.target.value }))}
                  >
                    {(ollamaModels.categories.vision.length ? ollamaModels.categories.vision : ollamaModels.models).map(model => (
                      <option key={model} value={model}>{model}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-system-gray-700 mb-fib-5">Embedding Model</label>
                  <Select
                    value={settings.embeddingModel}
                    onChange={(e) => setSettings(prev => ({ ...prev, embeddingModel: e.target.value }))}
                  >
                    {(ollamaModels.categories.embedding.length ? ollamaModels.categories.embedding : ollamaModels.models).map(model => (
                      <option key={model} value={model}>{model}</option>
                    ))}
                  </Select>
                </div>
              </div>
            </div>
          </div>

          {/* Performance Settings */}
          <div>
            <h3 className="text-lg font-semibold mb-fib-13">⚡ Performance</h3>
            <div className="space-y-fib-13">
              <div>
                <label className="block text-sm font-medium text-system-gray-700 mb-fib-5">
                  Max Concurrent Analysis ({settings.maxConcurrentAnalysis})
                </label>
                <input
                  type="range"
                  min="1"
                  max="8"
                  value={settings.maxConcurrentAnalysis}
                  onChange={(e) => setSettings(prev => ({ ...prev, maxConcurrentAnalysis: parseInt(e.target.value) }))}
                  className="w-full"
                />
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="autoOrganize"
                  checked={settings.autoOrganize}
                  onChange={(e) => setSettings(prev => ({ ...prev, autoOrganize: e.target.checked }))}
                  className="mr-fib-8"
                />
                <label htmlFor="autoOrganize" className="text-sm text-system-gray-700">
                  Auto-organize files after analysis
                </label>
              </div>
            </div>
          </div>

          {/* Default Locations */}
          <div>
            <h3 className="text-lg font-semibold mb-fib-13">📁 Default Locations</h3>
            <div className="space-y-fib-13">
              <div>
                <label className="block text-sm font-medium text-system-gray-700 mb-fib-5">Default Smart Folder Location</label>
                <div className="flex gap-fib-8">
                  <Input
                    type="text"
                    value={settings.defaultSmartFolderLocation}
                    onChange={(e) => setSettings(prev => ({ ...prev, defaultSmartFolderLocation: e.target.value }))}
                    className="flex-1"
                    placeholder="Documents"
                  />
                  <Button
                    onClick={async () => {
                      const res = await window.electronAPI.files.selectDirectory();
                      if (res?.success && res.folder) {
                        setSettings(prev => ({ ...prev, defaultSmartFolderLocation: res.folder }));
                      }
                    }}
                    variant="secondary"
                    type="button"
                    title="Browse"
                    aria-label="Browse for default folder"
                  >
                    📁 Browse
                  </Button>
                </div>
                <p className="text-xs text-system-gray-500 mt-fib-3">Where new smart folders will be created by default</p>
              </div>
            </div>
          </div>



          {/* Backend API Test */}
          <div>
            <h3 className="text-lg font-semibold mb-fib-13">🔧 Backend API Test</h3>
            <div className="p-fib-13 bg-system-gray-50 rounded-lg">
              <Button
                onClick={runAPITests}
                disabled={isTestingApi}
                variant="primary"
                className="text-sm mb-fib-8 w-full"
              >
                {isTestingApi ? 'Testing APIs...' : 'Test All APIs'}
              </Button>
              
              {Object.keys(testResults).length > 0 && (
                <div className="space-y-fib-3 text-sm">
                  {Object.entries(testResults).map(([service, status]) => (
                    <div key={service} className="flex justify-between">
                      <span className="capitalize">{service.replace(/([A-Z])/g, ' $1').trim()}:</span>
                      <span className="font-mono text-xs">{status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-fib-21 border-t border-system-gray-200 flex justify-end gap-fib-13">
          <Button onClick={actions.toggleSettings} variant="secondary">Cancel</Button>
          <Button onClick={saveSettings} variant="primary">Save Settings</Button>
        </div>
      </div>
    </div>
  );
}



// ===== WELCOME PHASE =====
function WelcomePhase() {
  const { actions } = usePhase();

  return (
        <div className="container-narrow text-center py-fib-34 animate-slide-up">
      <div className="mb-fib-21">
        <header role="banner">
          <h1 id="welcome-heading" className="heading-primary text-center" aria-level="1">
            <span className="animate-float inline-block" role="img" aria-label="rocket">🚀</span> Welcome to{' '}
            <span className="text-gradient inline-block">
              StratoSort
            </span>
          </h1>
        </header>
        <p className="text-lg text-system-gray-600 mb-fib-21 leading-relaxed">
          AI-powered file organization that learns your preferences and automatically sorts your files into smart folders.
        </p>
      </div>

      <div className="space-y-fib-13" role="navigation" aria-label="Main actions">
        <Button 
          onClick={() => actions.advancePhase(PHASES.DISCOVER)}
          variant="primary"
          className="text-lg px-fib-21 py-fib-13"
          aria-describedby="organize-help"
        >
          <span role="img" aria-label="folder">🗂️</span> Organize My Files Now
        </Button>
        <div id="organize-help" className="text-xs text-system-gray-500 mt-fib-3">
          Start organizing files immediately with AI-powered analysis.
        </div>
        
        <Button 
          onClick={() => actions.advancePhase(PHASES.SETUP)}
          variant="secondary"
          className="text-lg px-fib-21 py-fib-13"
          aria-describedby="setup-help"
        >
          <span role="img" aria-label="settings">⚙️</span> Setup Configuration First
        </Button>
        <div id="setup-help" className="text-xs text-system-gray-500 mt-fib-3">
          Configure smart folders and AI settings before organizing files.
        </div>
      </div>

      <div className="mt-fib-21 card-enhanced">
        <h3 className="heading-tertiary text-center">How StratoSort Works:</h3>
        <div className="grid md:grid-cols-3 gap-fib-13 text-sm text-system-gray-600">
          <div className="text-center p-fib-13 rounded-lg hover:bg-surface-secondary transition-colors duration-200">
            <div className="text-3xl mb-fib-5 animate-bounce-subtle">🔍</div>
            <strong className="text-system-gray-700">Discover</strong><br/>
            <span className="text-muted">Select files or scan folders</span>
          </div>
          <div className="text-center p-fib-13 rounded-lg hover:bg-surface-secondary transition-colors duration-200">
            <div className="text-3xl mb-fib-5 animate-bounce-subtle" style={{animationDelay: '0.1s'}}>🧠</div>
            <strong className="text-system-gray-700">Analyze</strong><br/>
            <span className="text-muted">AI analyzes content & suggests organization</span>
          </div>
          <div className="text-center p-fib-13 rounded-lg hover:bg-surface-secondary transition-colors duration-200">
            <div className="text-3xl mb-fib-5 animate-bounce-subtle" style={{animationDelay: '0.2s'}}>📂</div>
            <strong className="text-system-gray-700">Organize</strong><br/>
            <span className="text-muted">Review suggestions & auto-organize files</span>
          </div>
        </div>
      </div>
    </div>
  );
}



// ===== SYSTEM MONITORING COMPONENT =====
function SystemMonitoring() {
  const [systemMetrics, setSystemMetrics] = useState({
    uptime: 0,
    cpu: 0,
    memory: { used: 0, total: 0 },
    disk: { used: 0, total: 0 }
  });
  const [isMonitoring, setIsMonitoring] = useState(false);

  useEffect(() => {
    let intervalId;
    
    const startMonitoring = async () => {
      setIsMonitoring(true);
      try {
        // Get initial metrics
        const metrics = await window.electronAPI.system.getMetrics();
        setSystemMetrics(metrics);
        
        // Set up periodic updates
        intervalId = setInterval(async () => {
          try {
            const updatedMetrics = await window.electronAPI.system.getMetrics();
            setSystemMetrics(updatedMetrics);
          } catch (error) {
            console.warn('Failed to update system metrics:', error);
          }
        }, 5000); // Update every 5 seconds
        
      } catch (error) {
        console.error('Failed to start system monitoring:', error);
        setIsMonitoring(false);
      }
    };

    startMonitoring();

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
      setIsMonitoring(false);
    };
  }, []);

  if (!isMonitoring) {
    return (
      <div className="text-sm text-system-gray-500">
        System monitoring unavailable
      </div>
    );
  }

  return (
    <div className="space-y-fib-8">
      <h4 className="font-medium text-system-gray-700">📊 System Status</h4>
      <div className="grid grid-cols-2 gap-fib-8 text-sm">
        <div>
          <span className="text-system-gray-600">CPU:</span>
          <span className="ml-2 font-medium">{systemMetrics.cpu?.toFixed(1) || 0}%</span>
        </div>
        <div>
          <span className="text-system-gray-600">Memory:</span>
          <span className="ml-2 font-medium">
            {systemMetrics.memory?.used || 0} / {systemMetrics.memory?.total || 0} MB
          </span>
        </div>
        <div>
          <span className="text-system-gray-600">Uptime:</span>
          <span className="ml-2 font-medium">
            {Math.floor((systemMetrics.uptime || 0) / 60)}m
          </span>
        </div>
        <div>
          <span className="text-system-gray-600">Disk:</span>
          <span className="ml-2 font-medium">
            {((systemMetrics.disk?.used || 0) / (1024*1024*1024)).toFixed(1)}GB used
          </span>
        </div>
      </div>
    </div>
  );
}

// ===== SETUP PHASE =====
function SetupPhase() {
  const { actions, phaseData } = usePhase();
  const { showConfirm, ConfirmDialog } = useConfirmDialog();
  const { toasts, addToast, removeToast, showSuccess, showError, showWarning, showInfo } = useToast();
  const [smartFolders, setSmartFolders] = useState([]);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderPath, setNewFolderPath] = useState('');
  const [newFolderDescription, setNewFolderDescription] = useState('');
  const [editingFolder, setEditingFolder] = useState(null);
  const [defaultLocation, setDefaultLocation] = useState('Documents');
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [isEditingFolder, setIsEditingFolder] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDeletingFolder, setIsDeletingFolder] = useState(null);
  const [isCreatingAllFolders, setIsCreatingAllFolders] = useState(false);


  useEffect(() => {
    const initializeSetup = async () => {
      setIsLoading(true);
      try {
        await Promise.all([
          loadSmartFolders(),
          loadDefaultLocation()
        ]);
      } catch (error) {
        console.error('Failed to initialize setup:', error);
        showError('Failed to load setup data');
      } finally {
        setIsLoading(false);
      }
    };
    
    initializeSetup();
  }, []);

  // Handle ESC key for canceling edit mode
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && editingFolder) {
        setEditingFolder(null);
        setIsEditingFolder(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [editingFolder]);

  const loadDefaultLocation = async () => {
    try {
      const settings = await window.electronAPI.settings.get();
      if (settings?.defaultSmartFolderLocation) {
        setDefaultLocation(settings.defaultSmartFolderLocation);
      } else {
        // If no explicit default is configured, fall back to the OS Documents directory
        const documentsPath = await window.electronAPI.files.getDocumentsPath();
        if (documentsPath) {
          setDefaultLocation(documentsPath);
        }
      }
    } catch (error) {
      console.error('Failed to load default location:', error);
    }
  };

  const loadSmartFolders = async () => {
    try {
      console.log('[SETUP-DEBUG] Loading smart folders...');
      const folders = await window.electronAPI.smartFolders.get();
      console.log('[SETUP-DEBUG] Smart folders received from API:', {
        folders: folders,
        foldersLength: folders?.length,
        foldersType: typeof folders
      });
      
      setSmartFolders(folders || []);
      actions.setPhaseData('smartFolders', folders || []);
      
      console.log('[SETUP-DEBUG] Smart folders set to phase data:', folders || []);
      
      // Update all phase data that depends on smart folders
      await propagateSmartFolderChanges(folders || []);
      
      // Only show notification if this isn't the initial load
      if (folders && folders.length > 0 && smartFolders.length > 0) {
        showInfo('Smart folders updated. Files may need re-analysis to match new folder structure.', 7000);
      }
    } catch (error) {
      console.error('Failed to load smart folders:', error);
      showError('Failed to load smart folders');
    }
  };

  // Propagate smart folder changes to other phases
  const propagateSmartFolderChanges = async (folders) => {
    try {
      // Update phase data for all phases that use smart folders
      actions.setPhaseData('smartFolders', folders);
      
      // Notify other components about smart folder changes
      window.dispatchEvent(new CustomEvent('smartFoldersUpdated', { 
        detail: { folders } 
      }));
    } catch (error) {
      console.error('Failed to propagate smart folder changes:', error);
    }
  };

  const handleAddFolder = async () => {
    if (!newFolderName.trim()) {
      showWarning('Please enter a folder name');
      return;
    }
    
    setIsAddingFolder(true);
    try {
      let targetPath;
      
      if (newFolderPath.trim()) {
        // User provided a specific path
        targetPath = newFolderPath.trim();
      } else {
        // Use default location - resolve it to full path if needed
        let resolvedDefaultLocation = defaultLocation;
        
        // If defaultLocation is just "Documents" or relative, resolve to full path
        if (!/^[A-Za-z]:[\\/]/.test(resolvedDefaultLocation) && !resolvedDefaultLocation.startsWith('/')) {
          try {
            const documentsPath = await window.electronAPI.files.getDocumentsPath();
            if (documentsPath) {
              resolvedDefaultLocation = documentsPath;
            }
          } catch (error) {
            console.warn('Failed to resolve documents path, using defaultLocation as-is');
          }
        }
        
        targetPath = `${resolvedDefaultLocation}/${newFolderName.trim()}`;
      }
      
      // If the target path is still relative, resolve using Documents path
      if (!/^[A-Za-z]:[\\/]/.test(targetPath) && !targetPath.startsWith('/')) {
        try {
          const documentsPath = await window.electronAPI.files.getDocumentsPath();
          if (documentsPath) {
            targetPath = `${documentsPath}/${targetPath}`;
          }
        } catch (error) {
          console.warn('Failed to resolve documents path, continuing with provided path');
        }
      }
      
      // Normalize path separators (convert backslashes to forward slashes)
      targetPath = targetPath.replace(/\\\\/g, '/').replace(/\\/g, '/');
      
      // Enhanced client-side validation
      const illegalChars = /[<>:"|?*\x00-\x1f]/g;
      if (illegalChars.test(newFolderName)) {
        showError('Folder name contains invalid characters. Please avoid: < > : " | ? *');
        return;
      }
      
      // Check if folder already exists in configuration
      const existingFolder = smartFolders.find(f => 
        f.name.toLowerCase() === newFolderName.trim().toLowerCase() ||
        (f.path && f.path.toLowerCase() === targetPath.toLowerCase())
      );
      
      if (existingFolder) {
        showWarning(`A smart folder with name "${existingFolder.name}" or path "${existingFolder.path}" already exists`);
        return;
      }
      
      // Validate write permissions for parent directory (optional client-side check)
      const parentPath = targetPath.substring(0, targetPath.lastIndexOf('/') || targetPath.lastIndexOf('\\'));
      try {
        if (parentPath) {
          const parentStats = await window.electronAPI.files.getStats(parentPath);
          if (!parentStats || !parentStats.isDirectory) {
            showError(`Parent directory "${parentPath}" does not exist or is not accessible`);
            return;
          }
        }
      } catch (error) {
        showWarning('Cannot verify parent directory permissions. Folder creation may fail.');
      }
      
      const newFolder = {
        name: newFolderName.trim(),
        path: targetPath,
        description: newFolderDescription.trim() || `Smart folder for ${newFolderName.trim()}`,
        isDefault: false
      };
      
      const result = await window.electronAPI.smartFolders.add(newFolder);
      
      if (result.success) {
        if (result.directoryCreated) {
          showSuccess(`✅ Added smart folder and created directory: ${newFolder.name}`);
        } else if (result.directoryExisted) {
          showSuccess(`✅ Added smart folder: ${newFolder.name} (directory already exists)`);
        } else {
          showSuccess(`✅ Added smart folder: ${newFolder.name}`);
        }
        
        if (result.llmEnhanced) {
          showInfo('🤖 Smart folder enhanced with AI suggestions', 5000);
        }
        
        showInfo('💡 Tip: You can reanalyze files to see how they fit with your new smart folder', 5000);
        
        await loadSmartFolders();
        setNewFolderName('');
        setNewFolderPath('');
        setNewFolderDescription('');
      } else {
        showError(`❌ Failed to add folder: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to add smart folder:', error);
      showError('Failed to add smart folder');
    } finally {
      setIsAddingFolder(false);
    }
  };

  const handleEditFolder = (folder) => {
    setEditingFolder({...folder});
    setIsEditingFolder(true);
  };

  const handleSaveEdit = async () => {
    if (!editingFolder.name.trim()) {
      showWarning('Folder name cannot be empty');
      return;
    }

    setIsSavingEdit(true);
    try {
      const result = await window.electronAPI.smartFolders.edit(editingFolder.id, editingFolder);
      
      if (result.success) {
        showSuccess(`✅ Updated folder: ${editingFolder.name}`);
        showInfo('💡 Tip: You can reanalyze files to see how they fit with updated smart folders', 5000);
        await loadSmartFolders();
        setEditingFolder(null);
      } else {
        showError(`❌ Failed to update folder: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to update folder:', error);
      showError('Failed to update folder');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingFolder(null);
    setIsEditingFolder(false);
  };

  const handleDeleteFolder = async (folderId) => {
    const folder = smartFolders.find(f => f.id === folderId);
    if (!folder) return;

    const confirmDelete = await showConfirm({
      title: 'Delete Smart Folder',
      message: 'Are you sure you want to remove this smart folder? This will also delete the physical directory and any files inside it.',
      confirmText: 'Delete Folder & Directory',
      cancelText: 'Cancel',
      variant: 'danger',
      fileName: folder.name
    });
    
    if (!confirmDelete) return;

    setIsDeletingFolder(folderId);
    try {
      const result = await window.electronAPI.smartFolders.delete(folderId);
      
      if (result.success) {
        if (result.deletedFolder) {
          showSuccess(`✅ Removed smart folder: ${result.deletedFolder.name}`);
        } else {
          showSuccess(`✅ Removed smart folder`);
        }
        await loadSmartFolders();
      } else {
        showError(`❌ Failed to delete folder: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to delete folder:', error);
      showError('❌ Failed to delete folder');
    } finally {
      setIsDeletingFolder(null);
    }
  };

  const deleteFolderFromFileSystem = async (folderPath) => {
    try {
      // This would need to be implemented as an IPC call
      // For now, return a placeholder response
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const handleCreateAllFolders = async () => {
    if (smartFolders.length === 0) {
      showWarning('No smart folders to create');
      return;
    }

    setIsCreatingAllFolders(true);
    try {
      let createdCount = 0;
      let existedCount = 0;
      let errorCount = 0;

      for (const folder of smartFolders) {
        try {
          // Check if directory already exists
          const stats = await window.electronAPI.files.getStats(folder.path);
          if (stats && stats.isDirectory) {
            existedCount++;
          } else {
            // Create directory
            await window.electronAPI.files.createFolder(folder.path);
            createdCount++;
          }
        } catch (error) {
          console.error(`Failed to create folder ${folder.path}:`, error);
          errorCount++;
        }
      }

      if (createdCount > 0) {
        showSuccess(`✅ Created ${createdCount} smart folder directories`);
      }
      if (existedCount > 0) {
        showInfo(`📁 ${existedCount} directories already existed`);
      }
      if (errorCount > 0) {
        showWarning(`⚠️ Failed to create ${errorCount} directories`);
      }
      if (createdCount === 0 && errorCount === 0) {
        showInfo(`📁 All smart folder directories already exist`);
      }
    } catch (error) {
      console.error('Failed to create folders:', error);
      showError('Failed to create folder directories');
    } finally {
      setIsCreatingAllFolders(false);
    }
  };

  const handleBrowseFolder = async () => {
    try {
      const folderPath = await window.electronAPI.files.selectDirectory();
      if (folderPath) {
        setNewFolderPath(folderPath);
      }
    } catch (error) {
      console.error('Failed to browse folder:', error);
      showError('Failed to browse folder');
    }
  };

  const handleOpenFolder = async (folderPath) => {
    try {
      const result = await window.electronAPI.files.openFolder(folderPath);
      if (result?.success) {
        showSuccess(`📁 Opened folder: ${folderPath.split(/[/\\]/).pop()}`);
      } else {
        showError(`Failed to open folder: ${result?.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to open folder:', error);
      showError('Failed to open folder');
    }
  };

  const createSingleFolder = async (folderPath) => {
    try {
      // Use the files.createFolder API to create the directory
      await window.electronAPI.files.createFolder(folderPath);
      return { success: true };
    } catch (error) {
      console.error('Failed to create folder:', error);
      return { success: false, error: error.message };
    }
  };

  const canProceed = () => {
    if (smartFolders.length === 0) {
      showWarning('Please add at least one smart folder before continuing');
      return false;
    }
    return true;
  };

  return (
    <div className="w-full animate-slide-up">
      <div className="mb-fib-21 text-center">
        <h2 className="heading-primary">
          ⚙️ Configure{' '}
          <span className="text-gradient inline-block">
            Smart Folders
          </span>
        </h2>
        <p className="text-lg text-system-gray-600 leading-relaxed">
          Set up smart folders where StratoSort will organize your files based on AI analysis.
        </p>
      </div>

      {/* Current Smart Folders */}
      <div className="card-enhanced mb-fib-21" role="region" aria-labelledby="current-folders-heading">
        <div className="flex justify-between items-center mb-fib-13">
          <h3 id="current-folders-heading" className="heading-tertiary">📁 Current Smart Folders</h3>
            {smartFolders.length > 0 && (
              <Button
                onClick={handleCreateAllFolders}
                variant="primary"
                className="text-sm"
                title="Create all smart folder directories"
              >
                📁 Create All Folders
              </Button>
            )}
        </div>
        {isLoading ? (
          <SmartFolderSkeleton count={3} />
        ) : smartFolders.length === 0 ? (
          <div className="text-center py-fib-21">
            <div className="text-4xl mb-fib-8 opacity-50" role="img" aria-label="empty folder">📂</div>
            <p className="text-muted italic">No smart folders configured yet.</p>
          </div>
        ) : (
          <div className="space-y-fib-8">
            {smartFolders.map((folder, index) => (
              <div key={folder.id} className="p-fib-13 bg-surface-secondary rounded-lg hover:bg-surface-tertiary transition-colors duration-200 animate-slide-in-right" style={{animationDelay: `${index * 0.1}s`}}>
                {editingFolder?.id === folder.id ? (
                  // Edit mode
                  <div className="space-y-fib-8" role="form" aria-label="Edit smart folder">
                    <div className="flex gap-fib-8">
                      <Input
                        type="text"
                        value={editingFolder.name}
                        onChange={(e) => setEditingFolder({...editingFolder, name: e.target.value})}
                        className="flex-1"
                        placeholder="Folder name"
                        aria-label="Folder name"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit();
                          if (e.key === 'Escape') handleCancelEdit();
                        }}
                      />
                      <Input
                        type="text"
                        value={editingFolder.path}
                        onChange={(e) => setEditingFolder({...editingFolder, path: e.target.value})}
                        className="flex-1"
                        placeholder="Folder path"
                        aria-label="Folder path"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit();
                          if (e.key === 'Escape') handleCancelEdit();
                        }}
                      />
                    </div>
                    <div>
                      <Textarea
                        value={editingFolder.description || ''}
                        onChange={(e) => setEditingFolder({...editingFolder, description: e.target.value})}
                        className="w-full"
                        placeholder="Describe what types of files should go in this folder (helps AI make better decisions)"
                        rows={2}
                        aria-label="Folder description"
                      />
                    </div>
                    <div className="flex gap-fib-5">
                      <Button
                        onClick={handleSaveEdit}
                        disabled={isSavingEdit}
                        variant="primary"
                        className="text-sm"
                      >
                        {isSavingEdit ? (
                          <>
                            <div className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full inline-block mr-2"></div>
                            Saving...
                          </>
                        ) : (
                          <>💾 Save</>
                        )}
                      </Button>
                      <Button
                        onClick={handleCancelEdit}
                        disabled={isSavingEdit}
                        variant="secondary"
                        className="text-sm"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  // View mode
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-system-gray-700 mb-fib-2">{folder.name}</div>
                      <div className="text-small text-muted mb-fib-3">{folder.path}</div>
                      {folder.description && (
                        <div className="text-sm text-system-gray-600 bg-stratosort-blue/5 p-fib-8 rounded-lg border-l-4 border-stratosort-blue/30">
                          <div className="font-medium text-stratosort-blue mb-fib-2">📝 AI Context:</div>
                          <div className="italic">{folder.description}</div>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-fib-8">
                      <div className="flex items-center gap-fib-5">
                        <div className="status-dot success"></div>
                        <span className="text-sm font-medium text-stratosort-success">Active</span>
                      </div>
                      {folder.physicallyExists ? (
                        <div className="flex items-center gap-fib-3 px-fib-8 py-fib-3 bg-green-50 rounded-lg border border-green-200">
                          <span className="text-xs text-green-600">📁</span>
                          <span className="text-xs font-medium text-green-700">Directory Ready</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-fib-3 px-fib-8 py-fib-3 bg-amber-50 rounded-lg border border-amber-200">
                          <span className="text-xs text-amber-600">📂</span>
                          <span className="text-xs font-medium text-amber-700">Needs Creation</span>
                        </div>
                                              )}
                        <div className="flex gap-fib-5">
                        {!folder.physicallyExists && (
                          <Button
                            onClick={async () => {
                              const result = await createSingleFolder(folder.path);
                              if (result.success) {
                                addNotification(`✅ Created directory: ${folder.name}`, 'success');
                                await loadSmartFolders();
                              } else {
                                addNotification(`❌ Failed to create directory: ${result.error}`, 'error');
                              }
                            }}
                            className="p-fib-5 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                            title="Create this folder directory"
                            aria-label={`Create directory for ${folder.name}`}
                          >
                            <span role="img" aria-label="create folder">📁</span>
                          </Button>
                        )}
                        <Button
                          onClick={() => handleOpenFolder(folder.path)}
                          className={`p-fib-5 rounded transition-colors ${
                            folder.physicallyExists 
                              ? 'text-green-600 hover:bg-green-100' 
                              : 'text-gray-400 cursor-not-allowed'
                          }`}
                          title={folder.physicallyExists ? "Open folder in file explorer" : "Folder doesn't exist yet"}
                          aria-label={`Open folder ${folder.name}`}
                          disabled={!folder.physicallyExists}
                        >
                          <span role="img" aria-label="open folder">📂</span>
                        </Button>
                        <Button
                          onClick={() => handleEditFolder(folder)}
                          className="p-fib-5 text-stratosort-blue hover:bg-stratosort-blue/10 rounded transition-colors"
                          title="Edit folder"
                          aria-label={`Edit folder ${folder.name}`}
                        >
                          <span role="img" aria-label="edit">✏️</span>
                        </Button>
                        <Button
                          onClick={() => handleDeleteFolder(folder.id)}
                          disabled={isDeletingFolder === folder.id}
                          className="p-fib-5 text-system-red-600 hover:bg-system-red-100 rounded transition-colors disabled:opacity-50"
                          title={folder.physicallyExists ? "Remove from config and delete directory" : "Remove from config only"}
                          aria-label={`Delete folder ${folder.name}`}
                        >
                          {isDeletingFolder === folder.id ? (
                            <div className="animate-spin w-3 h-3 border-2 border-system-red-600 border-t-transparent rounded-full"></div>
                          ) : (
                            <span role="img" aria-label="delete">🗑️</span>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add New Folder */}
      <div className="card-enhanced mb-fib-21" role="region" aria-labelledby="add-folder-heading">
        <h3 id="add-folder-heading" className="text-lg font-semibold mb-fib-13">Add New Smart Folder</h3>
        <div className="space-y-fib-13">
          <div>
            <label className="block text-sm font-medium text-system-gray-700 mb-fib-5">
              Folder Name
            </label>
            <Input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newFolderName.trim() && !isAddingFolder) {
                  handleAddFolder();
                }
              }}
              placeholder="e.g., Documents, Photos, Projects"
              className="w-full"
              aria-describedby="folder-name-help"
            />
            <div id="folder-name-help" className="text-xs text-system-gray-500 mt-fib-3">
              Enter a descriptive name for your smart folder. Press Enter to add the folder.
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-system-gray-700 mb-fib-5">
              Target Path (optional)
            </label>
            <div className="flex gap-fib-8">
              <Input
                type="text"
                value={newFolderPath}
                onChange={(e) => setNewFolderPath(e.target.value)}
                placeholder="e.g., Documents/Work, Pictures/Family"
                className="flex-1"
              />
              <Button
                onClick={handleBrowseFolder}
                variant="secondary"
                title="Browse for folder"
              >
                📁 Browse
              </Button>
            </div>
            <p className="text-xs text-system-gray-500 mt-fib-3">
              Leave empty to use default {defaultLocation}/{newFolderName || 'FolderName'}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-system-gray-700 mb-fib-5">
              Description <span className="text-stratosort-blue font-semibold">(Important for AI)</span>
            </label>
            <Textarea
              value={newFolderDescription}
              onChange={(e) => setNewFolderDescription(e.target.value)}
              placeholder="Describe what types of files should go in this folder. E.g., 'Work documents, contracts, and business correspondence' or 'Family photos from vacations and special events'"
              className="w-full"
              rows={3}
              aria-describedby="description-help"
            />
            <div id="description-help" className="text-xs text-system-gray-500 mt-fib-3">
              💡 <strong>Tip:</strong> The more specific your description, the better the AI will organize your files. Include file types, content themes, and use cases.
            </div>
          </div>
          <Button 
            onClick={handleAddFolder}
            disabled={!newFolderName.trim() || isAddingFolder}
            variant="primary"
            aria-label={isAddingFolder ? 'Adding folder...' : 'Add smart folder'}
          >
            {isAddingFolder ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full inline-block mr-2"></div>
                Adding...
              </>
            ) : (
              <>➕ Add Smart Folder</>
            )}
          </Button>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button 
          onClick={() => actions.advancePhase(PHASES.WELCOME)}
          variant="secondary"
        >
          ← Back to Welcome
        </Button>
        <Button 
          onClick={() => {
            if (smartFolders.length === 0) {
              showWarning('Please add at least one smart folder before continuing');
            } else {
              actions.advancePhase(PHASES.DISCOVER);
            }
          }}
          variant="primary"
        >
          Continue to File Discovery →
        </Button>
      </div>

      {/* Confirmation Dialog */}
      <ConfirmDialog />
      
      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onRemoveToast={removeToast} />

      {isCreatingAllFolders && <LoadingSkeleton message="Creating folders..." />}


    </div>
  );
}

// Reusable analysis details renderer to keep Discover and Review consistent
const AnalysisDetails = React.memo(function AnalysisDetails({ analysis, options = {} }) {
  if (!analysis) return null;
  const { showName = true, showCategory = true } = options;
  const hasKeywords = Array.isArray(analysis.keywords) && analysis.keywords.length > 0;
  const hasColors = Array.isArray(analysis.colors) && analysis.colors.length > 0;
  const displayDate = analysis.date;
  const displayProject = analysis.project;
  const displayPurpose = analysis.purpose;
  const displayContentType = analysis.content_type || analysis.contentType;
  const displayHasText = typeof analysis.has_text === 'boolean' ? analysis.has_text : (typeof analysis.hasText === 'boolean' ? analysis.hasText : undefined);

  return (
    <div className="space-y-fib-3">
      {showName && analysis.suggestedName && (
        <div className="text-sm text-system-gray-700">
          <strong>Suggested Name:</strong>{' '}
          <span className="text-stratosort-blue font-mono">{analysis.suggestedName}</span>
        </div>
      )}

      {showCategory && analysis.category && (
        <div className="text-sm text-system-gray-700">
          <strong>Category:</strong>{' '}
          <span className="text-stratosort-blue">{analysis.category}</span>
        </div>
      )}

      {displayPurpose && (
        <div className="text-sm text-system-gray-600">
          <strong>Purpose:</strong> {displayPurpose}
        </div>
      )}

      {displayProject && (
        <div className="text-sm text-system-gray-600">
          <strong>Project:</strong> {displayProject}
        </div>
      )}

      {displayDate && (
        <div className="text-sm text-system-gray-600">
          <strong>Date:</strong> {displayDate}
        </div>
      )}

      {hasKeywords && (
        <div className="text-sm text-system-gray-500">
          <strong>Keywords:</strong> {analysis.keywords.join(', ')}
        </div>
      )}

      {typeof analysis.confidence !== 'undefined' && analysis.confidence !== null && (
        <div className="text-xs text-system-gray-400">
          <strong>AI Confidence:</strong> {analysis.confidence}%
        </div>
      )}

      {displayContentType && (
        <div className="text-xs text-system-gray-500">
          <strong>Content Type:</strong> {displayContentType}
        </div>
      )}

      {typeof displayHasText !== 'undefined' && (
        <div className="text-xs text-system-gray-500">
          <strong>Has Text:</strong> {displayHasText ? 'Yes' : 'No'}
        </div>
      )}

      {hasColors && (
        <div className="text-xs text-system-gray-500">
          <strong>Colors:</strong> {analysis.colors.join(', ')}
        </div>
      )}

      {analysis.ocrText && (
        <div className="text-xs text-system-gray-500 line-clamp-2">
          <strong>OCR:</strong> {analysis.ocrText.slice(0,120)}{analysis.ocrText.length>120?'…':''}
        </div>
      )}

      {analysis.transcript && (
        <div className="text-xs text-system-gray-500 line-clamp-2">
          <strong>Transcript:</strong> {analysis.transcript.slice(0,120)}{analysis.transcript.length>120?'…':''}
        </div>
      )}
    </div>
  );
});

// ===== DISCOVER PHASE =====
function DiscoverPhase() {
  const { actions, phaseData } = usePhase();
  const { addNotification } = useNotification();
  const { showConfirm, ConfirmDialog } = useConfirmDialog();
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [analysisResults, setAnalysisResults] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [currentAnalysisFile, setCurrentAnalysisFile] = useState('');
  const [analysisProgress, setAnalysisProgress] = useState({ current: 0, total: 0 });
  const [showAnalysisHistory, setShowAnalysisHistory] = useState(false);
  const [analysisStats, setAnalysisStats] = useState(null);
  
  // NEW: Naming convention state
  const [namingConvention, setNamingConvention] = useState('subject-date');
  const [dateFormat, setDateFormat] = useState('YYYY-MM-DD');
  const [caseConvention, setCaseConvention] = useState('kebab-case');
  const [separator, setSeparator] = useState('-');
  
  // NEW: File processing states tracking
  const [fileStates, setFileStates] = useState({}); // { filePath: { state: 'pending|analyzing|ready|error', timestamp: Date } }

  // Load persisted data from previous sessions
  useEffect(() => {
    const loadPersistedData = () => {
      console.log('[DISCOVER-PHASE] Loading persisted data:', {
        analysisResultsCount: (phaseData.analysisResults || []).length,
        selectedFilesCount: (phaseData.selectedFiles || []).length,
        fileStatesCount: Object.keys(phaseData.fileStates || {}).length,
        hasNamingConvention: !!phaseData.namingConvention
      });
      
      // Load previous analysis results if they exist
      const persistedResults = phaseData.analysisResults || [];
      const persistedFiles = phaseData.selectedFiles || [];
      const persistedStates = phaseData.fileStates || {};
      const persistedNaming = phaseData.namingConvention || {};
      const persistedIsAnalyzing = !!phaseData.isAnalyzing;
      const persistedProgress = phaseData.analysisProgress || { current: 0, total: 0 };
      const persistedCurrent = phaseData.currentAnalysisFile || '';
      
      if (persistedResults.length > 0) {
        console.log('[DISCOVER-PHASE] Restoring persisted data');
        setAnalysisResults(persistedResults);
        setSelectedFiles(persistedFiles);
        setFileStates(persistedStates);
        // Restore ongoing analysis state so UI shows progress if analysis continues in background
        setIsAnalyzing(persistedIsAnalyzing);
        setAnalysisProgress(persistedProgress);
        setCurrentAnalysisFile(persistedCurrent);
        
        // Restore naming convention settings
        setNamingConvention(persistedNaming.convention || 'subject-date');
        setDateFormat(persistedNaming.dateFormat || 'YYYY-MM-DD');
        setCaseConvention(persistedNaming.caseConvention || 'kebab-case');
        setSeparator(persistedNaming.separator || '-');
        
        console.log('[DISCOVER-PHASE] State restored successfully', {
          analysisResults: persistedResults.length,
          selectedFiles: persistedFiles.length,
          fileStates: Object.keys(persistedStates).length
        });
      } else {
        console.log('[DISCOVER-PHASE] No persisted data to restore');
      }
    };
    
    loadPersistedData();
  }, [phaseData]);

  // NEW: Update file state helper with error recovery
  const updateFileState = (filePath, state, metadata = {}) => {
    try {
      setFileStates(prev => {
        // Validate previous state
        if (!prev || typeof prev !== 'object') {
          console.warn('Invalid fileStates detected, resetting...');
          prev = {};
        }
        
        let newStates = { ...prev };
        
        // Cleanup old entries (keep only last 100 entries to prevent memory issues)
        const entries = Object.entries(newStates);
        if (entries.length > 100) {
          const sortedEntries = entries.sort((a, b) => 
            new Date(b[1].timestamp) - new Date(a[1].timestamp)
          );
          const keepEntries = sortedEntries.slice(0, 100);
          newStates = Object.fromEntries(keepEntries);
        }
        
        newStates[filePath] = {
          state,
          timestamp: new Date().toISOString(),
          ...metadata
        };
        
        return newStates;
      });
    } catch (error) {
      console.error('Error updating file state:', error);
      // Reset file states if corrupted
      setFileStates({
        [filePath]: {
          state,
          timestamp: new Date().toISOString(),
          ...metadata
        }
      });
    }
  };

  // NEW: Get current file state
  const getFileState = (filePath) => {
    return fileStates[filePath]?.state || 'pending';
  };

  // NEW: Get file state icon and label
  const getFileStateDisplay = (filePath, hasAnalysis) => {
    const state = getFileState(filePath);
    
    if (state === 'analyzing') {
      return { icon: '🔄', label: 'Analyzing...', color: 'text-blue-600', spinning: true };
    } else if (state === 'error') {
      return { icon: '❌', label: 'Error', color: 'text-red-600', spinning: false };
    } else if (hasAnalysis && state === 'ready') {
      return { icon: '✅', label: 'Ready', color: 'text-green-600', spinning: false };
    } else if (state === 'pending') {
      return { icon: '⏳', label: 'Pending', color: 'text-yellow-600', spinning: false };
    } else {
      return { icon: '❌', label: 'Failed', color: 'text-red-600', spinning: false };
    }
  };

  // NEW: Naming convention preview
  const generatePreviewName = (originalName) => {
    const baseName = originalName.replace(/\.[^/.]+$/, ''); // Remove extension
    const extension = originalName.includes('.') ? '.' + originalName.split('.').pop() : '';
    const today = new Date();
    
    let previewName = '';
    
    switch (namingConvention) {
      case 'subject-date':
        previewName = `${baseName}${separator}${formatDate(today, dateFormat)}`;
        break;
      case 'date-subject':
        previewName = `${formatDate(today, dateFormat)}${separator}${baseName}`;
        break;
      case 'project-subject-date':
        previewName = `Project${separator}${baseName}${separator}${formatDate(today, dateFormat)}`;
        break;
      case 'category-subject':
        previewName = `Category${separator}${baseName}`;
        break;
      case 'keep-original':
        previewName = baseName;
        break;
      default:
        previewName = baseName;
    }
    
    // Apply case convention
    previewName = applyCaseConvention(previewName, caseConvention);
    
    return previewName + extension;
  };

  // NEW: Helper functions for naming conventions
  const formatDate = (date, format) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    switch (format) {
      case 'YYYY-MM-DD': return `${year}-${month}-${day}`;
      case 'MM-DD-YYYY': return `${month}-${day}-${year}`;
      case 'DD-MM-YYYY': return `${day}-${month}-${year}`;
      case 'YYYYMMDD': return `${year}${month}${day}`;
      default: return `${year}-${month}-${day}`;
    }
  };

  const applyCaseConvention = (text, convention) => {
    switch (convention) {
      case 'kebab-case':
        return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      case 'snake_case':
        return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      case 'camelCase':
        return text.replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => 
          index === 0 ? word.toLowerCase() : word.toUpperCase()).replace(/\s+/g, '');
      case 'PascalCase':
        return text.replace(/(?:^\w|[A-Z]|\b\w)/g, word => word.toUpperCase()).replace(/\s+/g, '');
      case 'lowercase':
        return text.toLowerCase();
      case 'UPPERCASE':
        return text.toUpperCase();
      default:
        return text;
    }
  };

  // Define handleFileDrop BEFORE using it in useDragAndDrop
  const handleFileDrop = async (files) => {
    if (files && files.length > 0) {
      addNotification(`Processing ${files.length} dropped files...`, 'info');
      
      // Enhance dropped files with metadata
      const enhancedFiles = files.map(file => ({
        ...file,
        source: 'drag_drop',
        droppedAt: new Date().toISOString()
      }));
      
      setSelectedFiles(enhancedFiles);
      actions.setPhaseData('selectedFiles', enhancedFiles);
      
      // Initialize file states
      enhancedFiles.forEach(file => {
        updateFileState(file.path, 'pending');
      });
      
      addNotification(`Dropped ${files.length} files for analysis`, 'success');
      await analyzeFiles(enhancedFiles);
    }
  };

  const { isDragging, dragProps } = useDragAndDrop(handleFileDrop);

  // Enhanced helper function to determine file type with more categories
  const getFileType = (extension) => {
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'tiff', 'ico'];
    // const audioExts = ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'wma', 'opus']; // REMOVED - audio analysis disabled
    const videoExts = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', '3gp'];
    const docExts = ['pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'odt', 'pages'];
    const codeExts = ['js', 'ts', 'py', 'java', 'cpp', 'c', 'html', 'css', 'json', 'xml'];
    const archiveExts = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'];
    
    if (imageExts.includes(extension)) return 'image';
          // if (audioExts.includes(extension)) return 'audio'; // REMOVED - audio analysis disabled
    if (videoExts.includes(extension)) return 'video';
    if (docExts.includes(extension)) return 'document';
    if (codeExts.includes(extension)) return 'code';
    if (archiveExts.includes(extension)) return 'archive';
    return 'file';
  };

  // Global error handler for uncaught errors
  React.useEffect(() => {
    const handleUnhandledError = (event) => {
      console.error('Unhandled error:', event.error);
      addNotification(`Unexpected error: ${event.error?.message || 'Unknown error'}`, 'error');
    };

    const handleUnhandledRejection = (event) => {
      console.error('Unhandled promise rejection:', event.reason);
      addNotification(`Promise error: ${event.reason?.message || 'Unknown promise error'}`, 'error');
      event.preventDefault(); // Prevent default browser behavior
    };

    window.addEventListener('error', handleUnhandledError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleUnhandledError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [addNotification]);

  // Batch file stats processing to avoid rate limiting
  const getBatchFileStats = async (filePaths, batchSize = 25) => {
    console.log('[BATCH-STATS-DEBUG] Starting batch file stats for', filePaths.length, 'files');
    const results = [];
    
    for (let i = 0; i < filePaths.length; i += batchSize) {
      const batch = filePaths.slice(i, i + batchSize);
      console.log('[BATCH-STATS-DEBUG] Processing batch', i / batchSize + 1, 'with', batch.length, 'files');
      
      const batchResults = await Promise.allSettled(
        batch.map(async (filePath) => {
          try {
            // Lightweight jitter only to avoid thundering herd
            if (i > 0) await new Promise(resolve => setTimeout(resolve, 5));
            
            console.log('[BATCH-STATS-DEBUG] Getting stats for:', filePath);
            const stats = await window.electronAPI.files.getStats(filePath);
            console.log('[BATCH-STATS-DEBUG] Stats received for:', filePath, stats);
            
            const fileName = filePath.split(/[/\\]/).pop();
            const extension = fileName.includes('.') ? '.' + fileName.split('.').pop().toLowerCase() : '';
            
            const result = {
              name: fileName,
              path: filePath,
              extension: extension,
              size: stats?.size || 0,
              type: 'file',
              created: stats?.created,
              modified: stats?.modified,
              success: true
            };
            
            console.log('[BATCH-STATS-DEBUG] Processed file object:', result);
            return result;
          } catch (error) {
            console.warn('[BATCH-STATS-DEBUG] Could not get file stats for:', filePath, error);
            const fileName = filePath.split(/[/\\]/).pop();
            
            return {
              name: fileName,
              path: filePath,
              extension: fileName.includes('.') ? '.' + fileName.split('.').pop().toLowerCase() : '',
              size: 0,
              type: 'file',
              success: false,
              error: error.message
            };
          }
        })
      );
      
      // Process batch results
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          const filePath = batch[index];
          const fileName = filePath.split(/[/\\]/).pop();
          results.push({
            name: fileName,
            path: filePath,
            extension: fileName.includes('.') ? '.' + fileName.split('.').pop().toLowerCase() : '',
            size: 0,
            type: 'file',
            success: false,
            error: result.reason?.message || 'Unknown error'
          });
        }
      });
      
      // Reduce inter-batch delay for faster scans
      if (i + batchSize < filePaths.length) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    
    console.log('[BATCH-STATS-DEBUG] Completed batch processing, returning', results.length, 'results');
    return results;
  };

  const handleFileSelection = async () => {
    try {
      console.log('[FILE-SELECTION-DEBUG] === STARTING FILE SELECTION ===');
      console.log('[FILE-SELECTION-DEBUG] isScanning:', isScanning);
      console.log('[FILE-SELECTION-DEBUG] isAnalyzing:', isAnalyzing);
      
      setIsScanning(true);
      addNotification('Opening file picker...', 'info');
      
      console.log('[FILE-SELECTION-DEBUG] Checking window.electronAPI availability...');
      if (!window.electronAPI) {
        throw new Error('electronAPI is not available on window object');
      }
      
      console.log('[FILE-SELECTION-DEBUG] electronAPI available, checking files property...');
      if (!window.electronAPI.files) {
        throw new Error('electronAPI.files is not available');
      }
      
      console.log('[FILE-SELECTION-DEBUG] files property available, checking select method...');
      if (!window.electronAPI.files.select) {
        throw new Error('electronAPI.files.select method is not available');
      }
      
      console.log('[FILE-SELECTION-DEBUG] All checks passed, calling select method...');
      const result = await window.electronAPI.files.select();
      console.log('[FILE-SELECTION-DEBUG] Selection result received:', result);
      
      if (result?.success && result?.files?.length > 0) {
        console.log('[FILE-SELECTION-DEBUG] Success! Processing', result.files.length, 'files');
        const { files, summary } = result;
        
        // Show summary notification
        let message = `Found ${files.length} supported files`;
        if (summary?.totalSelected > 1) {
          message += ` from ${summary.totalSelected} selected items`;
        }
        if (summary?.duplicatesRemoved > 0) {
          message += ` (${summary.duplicatesRemoved} duplicates removed)`;
        }
        addNotification(message, 'success');
        
        console.log('[FILE-SELECTION-DEBUG] Initializing file states...');
        // Initialize file states
        files.forEach(filePath => {
          console.log('[FILE-SELECTION-DEBUG] Setting state for:', filePath);
          updateFileState(filePath, 'pending');
        });
        
        console.log('[FILE-SELECTION-DEBUG] Getting batch file stats...');
        // Get file stats for the selected files
        const fileObjects = await getBatchFileStats(files);
        console.log('[FILE-SELECTION-DEBUG] File stats received:', fileObjects.length, 'objects');
        
        // Add source metadata
        const enhancedFiles = fileObjects.map(file => ({
          ...file,
          source: 'file_selection'
        }));
        
        console.log('[FILE-SELECTION-DEBUG] Setting selected files...');
        setSelectedFiles(enhancedFiles);
        actions.setPhaseData('selectedFiles', enhancedFiles);
        
        // Report any files that failed to get stats
        const failedFiles = fileObjects.filter(f => !f.success);
        if (failedFiles.length > 0) {
          console.log('[FILE-SELECTION-DEBUG] Warning:', failedFiles.length, 'files had issues');
          addNotification(`Warning: ${failedFiles.length} files had issues loading metadata`, 'warning');
        }
        
        console.log('[FILE-SELECTION-DEBUG] Starting analysis...');
        // Start analysis
        await analyzeFiles(enhancedFiles);
        console.log('[FILE-SELECTION-DEBUG] Analysis completed');
      } else {
        console.log('[FILE-SELECTION-DEBUG] No files selected or selection cancelled:', result);
        addNotification('No files selected', 'info');
      }
    } catch (error) {
      console.error('[FILE-SELECTION-DEBUG] ERROR OCCURRED:', error);
      console.error('[FILE-SELECTION-DEBUG] Error stack:', error.stack);
      console.error('[FILE-SELECTION-DEBUG] Error name:', error.name);
      console.error('[FILE-SELECTION-DEBUG] Error message:', error.message);
      addNotification(`Error selecting files: ${error.message}`, 'error');
    } finally {
      console.log('[FILE-SELECTION-DEBUG] === FINISHING FILE SELECTION ===');
      setIsScanning(false);
    }
  };

  const handleFolderSelection = async () => {
    try {
      console.log('[FOLDER-SELECTION-DEBUG] === STARTING FOLDER SELECTION ===');
      
      setIsScanning(true);
      addNotification('Opening folder picker...', 'info');
      
      // Use the selectDirectory method specifically for folders
      const result = await window.electronAPI.files.selectDirectory();
      console.log('[FOLDER-SELECTION-DEBUG] Folder selection result:', result);
      
      if (result?.success && result?.folder) {
        addNotification(`Scanning folder: ${result.folder}`, 'info');
        
        // Get files in the selected folder
        const scanResult = await window.electronAPI.smartFolders.scanStructure(result.folder);
        console.log('[FOLDER-SELECTION-DEBUG] Scan result:', scanResult);
        
        if (scanResult && scanResult.files && scanResult.files.length > 0) {
          // Filter for supported files
          const supportedExts = ['.pdf', '.doc', '.docx', '.txt', '.md', '.rtf', '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.mp3', '.wav', '.m4a', '.flac', '.ogg', '.zip', '.rar', '.7z', '.tar', '.gz'];
          const supportedFiles = scanResult.files.filter(file => {
            const ext = file.name.includes('.') ? '.' + file.name.split('.').pop().toLowerCase() : '';
            return supportedExts.includes(ext);
          });
          
          if (supportedFiles.length === 0) {
            addNotification('No supported files found in the selected folder', 'warning');
            return;
          }
          
          addNotification(`Found ${supportedFiles.length} supported files in folder`, 'success');
          
          // Initialize file states
          supportedFiles.forEach(file => {
            updateFileState(file.path, 'pending');
          });
          
          // Get file stats
          const fileObjects = await getBatchFileStats(supportedFiles.map(f => f.path));
          
          // Add source metadata
          const enhancedFiles = fileObjects.map(file => ({
            ...file,
            source: 'folder_scan'
          }));
          
          setSelectedFiles(enhancedFiles);
          actions.setPhaseData('selectedFiles', enhancedFiles);
          
          // Start analysis
          await analyzeFiles(enhancedFiles);
        } else {
          addNotification('No files found in the selected folder', 'warning');
        }
      } else if (result?.success === false && result?.folder === null) {
        addNotification('Folder selection cancelled', 'info');
      } else {
        addNotification('No folder selected', 'info');
      }
    } catch (error) {
      console.error('[FOLDER-SELECTION-DEBUG] Error:', error);
      addNotification(`Error selecting folder: ${error.message}`, 'error');
    } finally {
      setIsScanning(false);
    }
  };

  const handleFileAction = async (action, filePath, fileObj = null) => {
    try {
      switch (action) {
        case 'open':
          await window.electronAPI.files.open(filePath);
          addNotification(`Opened: ${filePath.split(/[/\\]/).pop()}`, 'success');
          break;
          
        case 'reveal':
          await window.electronAPI.files.reveal(filePath);
          addNotification(`Revealed: ${filePath.split(/[/\\]/).pop()}`, 'success');
          break;
          
        case 'delete':
          const fileName = filePath.split(/[/\\]/).pop();
          const confirmDelete = await showConfirm({
            title: 'Delete File',
            message: 'This action cannot be undone. Are you sure you want to permanently delete this file?',
            confirmText: 'Delete',
            cancelText: 'Cancel',
            variant: 'danger',
            fileName: fileName
          });
          
          if (confirmDelete) {
            const result = await window.electronAPI.files.delete(filePath);
            if (result.success) {
              // Remove from analysis results
              setAnalysisResults(prev => prev.filter(f => f.path !== filePath));
              setSelectedFiles(prev => prev.filter(f => f.path !== filePath));
              addNotification(`Deleted: ${fileName}`, 'success');
            } else {
              addNotification(`Failed to delete: ${fileName}`, 'error');
            }
          }
          break;
          
        default:
          addNotification(`Unknown action: ${action}`, 'error');
      }
    } catch (error) {
      console.error('File action failed:', error);
      addNotification(`Action failed: ${error.message}`, 'error');
    }
  };

  const analyzeFiles = async (files) => {
    if (!files || files.length === 0) return;
    
    setIsAnalyzing(true);
    setAnalysisProgress({ current: 0, total: files.length });
    setCurrentAnalysisFile('');
    // Persist analysis state for cross-phase continuity
    actions.setPhaseData('isAnalyzing', true);
    actions.setPhaseData('analysisProgress', { current: 0, total: files.length });
    actions.setPhaseData('currentAnalysisFile', '');
    const results = [];
    const concurrency = Math.max(1, Math.min(Number(settings.maxConcurrentAnalysis) || 3, 8));
    
    try {
      addNotification(`Starting AI analysis of ${files.length} files...`, 'info');
      
      // Process files with concurrency
      let index = 0;
      const worker = async () => {
        while (true) {
          const i = index++;
          if (i >= files.length) break;

          const file = files[i];
          const fileName = file.name || file.path.split(/[/\\]/).pop();

          // Update progress BEFORE starting analysis
          setCurrentAnalysisFile(fileName);
          setAnalysisProgress({ current: i, total: files.length });
          actions.setPhaseData('currentAnalysisFile', fileName);
          actions.setPhaseData('analysisProgress', { current: i, total: files.length });

          // Update file state to analyzing
          updateFileState(file.path, 'analyzing', { fileName });

          // Allow UI to paint without adding artificial per-file latency
          await new Promise((resolve) => setTimeout(resolve, 0));

          addNotification(`Analyzing file ${i + 1}/${files.length}: ${fileName}`, 'info');

          try {
            // Use existing file stats if available, avoid additional API calls
            const fileInfo = {
              ...file,
              size: file.size || 0,
              created: file.created,
              modified: file.modified,
            };

            console.log(`[ANALYSIS-DEBUG] Starting analysis for: ${fileName}`);
            console.log(`[ANALYSIS-DEBUG] File path: ${file.path}`);
            console.log(`[ANALYSIS-DEBUG] File size: ${fileInfo.size} bytes`);

            // Perform AI analysis with timeout
            const analysisPromise = window.electronAPI.files.analyze(file.path);
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Analysis timeout after 3 minutes')), 180000)
            );

            const analysis = await Promise.race([analysisPromise, timeoutPromise]);

            console.log(`[ANALYSIS-DEBUG] Raw analysis result for ${fileName}:`, analysis);

            if (analysis && !analysis.error) {
              // Apply naming convention to suggested name
              const enhancedAnalysis = {
                ...analysis,
                suggestedName: generatePreviewName(analysis.suggestedName || fileName),
                namingConvention: {
                  convention: namingConvention,
                  dateFormat,
                  caseConvention,
                  separator,
                },
              };

              const result = {
                ...fileInfo,
                analysis: enhancedAnalysis,
                status: 'analyzed',
                analyzedAt: new Date().toISOString(),
              };

              results.push(result);

              // Update file state to ready
              updateFileState(file.path, 'ready', {
                analysis: enhancedAnalysis,
                analyzedAt: new Date().toISOString(),
              });

              addNotification(`✓ Analysis complete for: ${fileName}`, 'success');
            } else {
              console.error('Analysis failed for file:', fileName, analysis?.error);

              const result = {
                ...fileInfo,
                analysis: null,
                error: analysis?.error || 'Analysis failed',
                status: 'failed',
                analyzedAt: new Date().toISOString(),
              };

              results.push(result);

              // Update file state to error
              updateFileState(file.path, 'error', {
                error: analysis?.error || 'Analysis failed',
                analyzedAt: new Date().toISOString(),
              });

              addNotification(`⚠️ Analysis failed for: ${fileName}`, 'warning');
            }
          } catch (error) {
            console.error('Error analyzing file:', fileName, error);

            const result = {
              ...file,
              analysis: null,
              error: error.message,
              status: 'failed',
              analyzedAt: new Date().toISOString(),
            };

            results.push(result);

            // Update file state to error
            updateFileState(file.path, 'error', {
              error: error.message,
              analyzedAt: new Date().toISOString(),
            });

            addNotification(`❌ Error analyzing: ${fileName}`, 'error');
          }

          // Update progress AFTER processing each file
          setAnalysisProgress((prev) => ({ current: Math.min(files.length, prev.current + 1), total: files.length }));
          actions.setPhaseData('analysisProgress', { current: Math.min(files.length, i + 1), total: files.length });
          // Yield back to the event loop
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      };

      const workers = Array.from({ length: concurrency }, () => worker());
      await Promise.all(workers);
      
      setAnalysisResults(results);
      
      // Persist data for use in organize phase
      setAnalysisResults(results);

      // Build a fresh updatedStates from results to avoid relying on async state callbacks
      const updatedStates = {};
      results.forEach(result => {
        if (result.analysis && !result.error) {
          updatedStates[result.path] = {
            state: 'ready',
            timestamp: new Date().toISOString(),
            analysis: result.analysis,
            analyzedAt: result.analyzedAt
          };
        } else if (result.error) {
          updatedStates[result.path] = {
            state: 'error',
            timestamp: new Date().toISOString(),
            error: result.error,
            analyzedAt: result.analyzedAt
          };
        }
      });

      // Update state and phase data synchronously from computed values
      setFileStates(updatedStates);

      const finalPhaseData = {
        analysisResults: results,
        selectedFiles: files,
        fileStates: updatedStates,
        smartFolders: phaseData.smartFolders || [],
        namingConvention: {
          convention: namingConvention,
          dateFormat,
          caseConvention,
          separator
        }
      };

      actions.setPhaseData('analysisResults', finalPhaseData.analysisResults);
      actions.setPhaseData('selectedFiles', finalPhaseData.selectedFiles);
      actions.setPhaseData('fileStates', finalPhaseData.fileStates);
      actions.setPhaseData('namingConvention', finalPhaseData.namingConvention);
      
      const successCount = results.filter(r => r.analysis).length;
      const failureCount = results.length - successCount;
      
      if (successCount > 0) {
        addNotification(`🎉 Analysis complete! ${successCount} files ready for organization`, 'success');
        // Auto-advance to organize phase after successful analysis, using finalized data
        setTimeout(() => {
          addNotification('📂 Proceeding to organize phase...', 'info');
          actions.advancePhase(PHASES.ORGANIZE, finalPhaseData);
        }, 2000);
      }
      if (failureCount > 0) {
        addNotification(`⚠️ ${failureCount} files failed analysis`, 'warning');
      }
      
    } catch (error) {
      console.error('Batch analysis failed:', error);
      addNotification(`Analysis process failed: ${error.message}`, 'error');
    } finally {
      setIsAnalyzing(false);
      setCurrentAnalysisFile('');
      setAnalysisProgress({ current: 0, total: 0 });
      actions.setPhaseData('isAnalyzing', false);
      actions.setPhaseData('currentAnalysisFile', '');
      actions.setPhaseData('analysisProgress', { current: 0, total: 0 });
    }
  };

  return (
    <div className="w-full">
      {/* Global analysis status (if analysis running in background) */}
      {isAnalyzing && (
        <div className="mb-fib-13 p-fib-8 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-fib-8 text-blue-700">
            <div className="animate-spin w-fib-8 h-fib-8 border-2 border-blue-500 border-t-transparent rounded-full" />
            <span>
              Analysis in progress: {analysisProgress.current}/{analysisProgress.total}{currentAnalysisFile ? ` • ${currentAnalysisFile}` : ''}
            </span>
          </div>
          <button
            onClick={() => actions.advancePhase(PHASES.DISCOVER)}
            className="text-blue-700 hover:text-blue-900 underline text-sm"
          >
            View details
          </button>
        </div>
      )}
      <div className="mb-fib-21">
        <h2 className="text-2xl font-bold text-system-gray-900 mb-fib-8">
          🔍 Discover & Analyze Files
        </h2>
        <p className="text-system-gray-600">
          Select files for AI-powered analysis and organization. Configure naming conventions to match your preferences.
        </p>
      </div>

      {/* NEW: Naming Convention Configuration */}
      <div className="card-enhanced mb-fib-21">
        <h3 className="text-lg font-semibold mb-fib-13 flex items-center gap-fib-5">
          🏷️ Naming Convention Settings
          <span className="text-sm font-normal text-system-gray-500">(Applied during analysis)</span>
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-fib-13 mb-fib-13">
          <div>
            <label className="block text-sm font-medium text-system-gray-700 mb-fib-3">
              Convention Pattern
            </label>
            <Select
              value={namingConvention}
              onChange={(e) => setNamingConvention(e.target.value)}
              className="w-full"
            >
              <option value="subject-date">Subject + Date</option>
              <option value="date-subject">Date + Subject</option>
              <option value="project-subject-date">Project + Subject + Date</option>
              <option value="category-subject">Category + Subject</option>
              <option value="keep-original">Keep Original</option>
            </Select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-system-gray-700 mb-fib-3">
              Date Format
            </label>
            <Select
              value={dateFormat}
              onChange={(e) => setDateFormat(e.target.value)}
              className="w-full"
              disabled={namingConvention === 'keep-original'}
            >
              <option value="YYYY-MM-DD">2024-12-17</option>
              <option value="MM-DD-YYYY">12-17-2024</option>
              <option value="DD-MM-YYYY">17-12-2024</option>
              <option value="YYYYMMDD">20241217</option>
            </Select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-system-gray-700 mb-fib-3">
              Case Style
            </label>
            <Select
              value={caseConvention}
              onChange={(e) => setCaseConvention(e.target.value)}
              className="w-full"
              disabled={namingConvention === 'keep-original'}
            >
              <option value="kebab-case">kebab-case</option>
              <option value="snake_case">snake_case</option>
              <option value="camelCase">camelCase</option>
              <option value="PascalCase">PascalCase</option>
              <option value="lowercase">lowercase</option>
              <option value="UPPERCASE">UPPERCASE</option>
            </Select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-system-gray-700 mb-fib-3">
              Separator
            </label>
            <Select
              value={separator}
              onChange={(e) => setSeparator(e.target.value)}
              className="w-full"
              disabled={namingConvention === 'keep-original'}
            >
              <option value="-">Hyphen (-)</option>
              <option value="_">Underscore (_)</option>
              <option value=".">Dot (.)</option>
              <option value=" ">Space ( )</option>
            </Select>
          </div>
        </div>
        
        {/* Preview */}
        <div className="bg-stratosort-blue/5 p-fib-13 rounded-lg border border-stratosort-blue/20">
          <div className="text-sm font-medium text-system-gray-700 mb-fib-3">Preview:</div>
          <div className="text-system-gray-900 font-mono">
            {generatePreviewName('example-document.pdf')}
          </div>
        </div>
      </div>

      {/* File Selection Options */}
      <div className="max-w-4xl mx-auto mb-fib-21">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-fib-13">
          {/* Select Files */}
          <div 
            className={`card-enhanced text-center transition-all duration-200 cursor-pointer hover:border-stratosort-blue/50 ${
              isScanning || isAnalyzing ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            onClick={!isScanning && !isAnalyzing ? handleFileSelection : undefined}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && !isScanning && !isAnalyzing) {
                e.preventDefault();
                handleFileSelection();
              }
            }}
          >
            <div className="text-5xl mb-fib-8">📄</div>
            <h3 className="text-xl font-bold mb-fib-5 text-stratosort-blue">Select Files</h3>
            <p className="text-system-gray-600 mb-fib-8">Choose individual files to organize</p>
            <div className="text-sm text-system-gray-500">
              Supports: PDF, Word, Images, Archives (Audio temporarily disabled)
            </div>
          </div>

          {/* Select Folder */}
          <div 
            className={`card-enhanced text-center transition-all duration-200 cursor-pointer hover:border-stratosort-blue/50 ${
              isScanning || isAnalyzing ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            onClick={!isScanning && !isAnalyzing ? handleFolderSelection : undefined}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && !isScanning && !isAnalyzing) {
                e.preventDefault();
                handleFolderSelection();
              }
            }}
          >
            <div className="text-5xl mb-fib-8">📁</div>
            <h3 className="text-xl font-bold mb-fib-5 text-stratosort-blue">Scan Folder</h3>
            <p className="text-system-gray-600 mb-fib-8">Scan entire folder for files</p>
            <div className="text-sm text-system-gray-500">
              Auto-scans up to 3 levels deep
            </div>
          </div>
        </div>
      </div>

      {/* Drag and Drop Area */}
      <div className="max-w-2xl mx-auto mb-fib-21">
        <div 
          {...dragProps}
          className={`card-enhanced text-center transition-all duration-200 ${
            isDragging ? 'border-stratosort-blue bg-stratosort-blue/10 scale-105' : 'border-dashed border-2 border-system-gray-300'
          }`}
        >
          <div className="text-5xl mb-fib-8">
            {isDragging ? '✨' : '⬇️'}
          </div>
          <h3 className="text-lg font-semibold mb-fib-5 text-system-gray-700">
            {isDragging ? 'Drop Files Here' : 'Or Drag & Drop Files Here'}
          </h3>
          <p className="text-sm text-system-gray-500">
            {isDragging ? 'Release to analyze files' : 'Drop multiple files at once'}
          </p>
        </div>
      </div>

      {/* Analysis Progress */}
      {isAnalyzing && (
        <div className="card-enhanced mb-fib-21">
          <div className="flex items-center justify-center gap-fib-13 mb-fib-13">
            <div className="animate-spin w-fib-21 h-fib-21 border-3 border-stratosort-blue border-t-transparent rounded-full"></div>
            <div className="text-lg font-semibold text-stratosort-blue">AI Analysis in Progress</div>
          </div>
          
          {/* Enhanced Progress Bar */}
          <div className="mb-fib-8">
            <div className="flex justify-between text-sm text-system-gray-600 mb-fib-3">
              <span>Progress: {analysisProgress.current} of {analysisProgress.total}</span>
              <span>{analysisProgress.total > 0 ? Math.round((analysisProgress.current / analysisProgress.total) * 100) : 0}%</span>
            </div>
            <div className="w-full bg-system-gray-200 rounded-full h-fib-8">
              <div 
                className="bg-stratosort-blue h-fib-8 rounded-full transition-all duration-300"
                style={{ width: `${analysisProgress.total > 0 ? (analysisProgress.current / analysisProgress.total) * 100 : 0}%` }}
              ></div>
            </div>
          </div>
          
          <div className="text-center">
            <div className="text-sm font-medium text-system-gray-700 mb-fib-3">
              {currentAnalysisFile ? `Analyzing: ${currentAnalysisFile}` : 'Analyzing files with artificial intelligence...'}
            </div>
            <div className="text-xs text-system-gray-500">
              This may take a few moments depending on file size and complexity
            </div>
          </div>
        </div>
      )}

      {/* Analysis Results */}
      {analysisResults.length > 0 && !isAnalyzing && (
        <div className="card-enhanced mb-fib-21">
          <div className="flex items-center justify-between mb-fib-13">
            <h3 className="text-lg font-semibold">📊 Analysis Results</h3>
            <div className="flex items-center gap-fib-8">
              <Button
                onClick={() => analyzeFiles(selectedFiles)}
                variant="primary"
                className="text-sm"
                disabled={!selectedFiles.length}
                aria-label="Reanalyze all files with current smart folder settings"
              >
                🔄 Reanalyze Files
              </Button>
              <Button
                onClick={() => setShowAnalysisHistory(true)}
                variant="secondary"
                className="text-sm"
                aria-label="View detailed analysis history"
              >
                📊 History
              </Button>
            </div>
          </div>
          
          <div className="space-y-fib-8">
            {analysisResults.map((file, index) => {
              const stateDisplay = getFileStateDisplay(file.path, !!file.analysis);
              
              return (
                <div key={index} className="border border-system-gray-200 rounded-lg p-fib-13">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-fib-8 mb-fib-5">
                        <div className="text-2xl">
                          {getFileType(file.extension?.replace('.', '')) === 'document' ? '📄' :
                           getFileType(file.extension?.replace('.', '')) === 'image' ? '🖼️' :
                           // getFileType(file.extension?.replace('.', '')) === 'audio' ? '🎵' : // REMOVED - audio analysis disabled
                           getFileType(file.extension?.replace('.', '')) === 'video' ? '🎬' :
                           getFileType(file.extension?.replace('.', '')) === 'code' ? '💻' :
                           getFileType(file.extension?.replace('.', '')) === 'archive' ? '📦' : '📄'}
                        </div>
                        <div>
                          <div className="font-medium text-system-gray-900">{file.name}</div>
                          <div className="text-sm text-system-gray-500">
                            {file.size ? `${Math.round(file.size / 1024)} KB` : 'Unknown size'} • {file.source?.replace('_', ' ')}
                          </div>
                        </div>
                      </div>
                      
                      {file.analysis && (
                        <AnalysisDetails analysis={file.analysis} />
                      )}
                      
                      {file.error && (
                        <div className="text-sm text-system-red-600 mt-fib-3">
                          <strong>Error:</strong> {file.error}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-fib-8">
                      <div className="flex items-center gap-fib-3">
                        <Button
                          onClick={() => analyzeFiles([file])}
                          variant="outline"
                          className="text-xs px-fib-8 py-fib-3"
                          disabled={isAnalyzing}
                          aria-label={`Reanalyze ${file.name}`}
                          title="Reanalyze this file"
                        >
                          🔄
                        </Button>
                        <Button
                          onClick={() => handleFileAction('open', file.path)}
                          variant="outline"
                          className="text-xs px-fib-8 py-fib-3"
                          aria-label={`Open ${file.name}`}
                          title="Open file"
                        >
                          📄
                        </Button>
                        <Button
                          onClick={() => handleFileAction('reveal', file.path)}
                          variant="outline"
                          className="text-xs px-fib-8 py-fib-3"
                          aria-label={`Show ${file.name} in folder`}
                          title="Show in folder"
                        >
                          📁
                        </Button>
                        <Button
                          onClick={() => handleFileAction('delete', file.path, file)}
                          variant="outline"
                          className="text-xs px-fib-8 py-fib-3 text-red-600 hover:bg-red-50"
                          aria-label={`Delete ${file.name}`}
                          title="Delete file"
                        >
                          🗑️
                        </Button>
                      </div>
                      <div className={`text-sm font-medium flex items-center gap-fib-3 ${stateDisplay.color}`}>
                        <span className={stateDisplay.spinning ? 'animate-spin' : ''}>{stateDisplay.icon}</span>
                        <span>{stateDisplay.label}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between" role="navigation" aria-label="Phase navigation">
        <Button 
          onClick={() => actions.advancePhase(PHASES.SETUP)}
          variant="secondary"
          disabled={false} // Allow navigation even during analysis
          aria-label="Go back to setup phase"
        >
          ← Back to Setup
        </Button>
        <Button 
          onClick={() => {
            console.log('[DISCOVER-PHASE] Advancing to ORGANIZE with data:');
            console.log('[DISCOVER-PHASE] analysisResults:', analysisResults.length);
            console.log('[DISCOVER-PHASE] fileStates:', Object.keys(fileStates).length);
            console.log('[DISCOVER-PHASE] smartFolders:', phaseData.smartFolders?.length || 0);
            
            // Use functional state update to ensure we capture the most current state
            setFileStates(currentFileStates => {
              const finalData = {
                analysisResults,
                fileStates: currentFileStates,
                selectedFiles,
                isAnalyzing,
                analysisProgress,
                namingConvention: {
                  convention: namingConvention,
                  dateFormat,
                  caseConvention,
                  separator
                }
              };
              
              console.log('[DISCOVER-PHASE] Final data being passed:', finalData);
              
              // Save all phase data before advancing (including current analysis state)
              actions.setPhaseData('analysisResults', analysisResults);
              actions.setPhaseData('fileStates', currentFileStates);
              actions.setPhaseData('selectedFiles', selectedFiles);
              actions.setPhaseData('isAnalyzing', isAnalyzing);
              actions.setPhaseData('analysisProgress', analysisProgress);
              actions.setPhaseData('namingConvention', {
                convention: namingConvention,
                dateFormat,
                caseConvention,
                separator
              });
              
              // Advance to organize phase with the complete data (also persisted in phaseData)
              actions.advancePhase(PHASES.ORGANIZE, finalData);
              
              return currentFileStates; // Return unchanged state
            });
          }}
          disabled={analysisResults.length === 0} // Only disable if no files analyzed yet
          className={`${analysisResults.length === 0 ? 'opacity-50 cursor-not-allowed' : ''} ${isAnalyzing ? 'animate-pulse' : ''}`}
          aria-label={`Proceed to organize ${analysisResults.length} analyzed files${isAnalyzing ? ' (analysis in progress)' : ''}`}
          aria-describedby={analysisResults.length === 0 ? "no-files-message" : (isAnalyzing ? "analysis-in-progress" : undefined)}
        >
          {isAnalyzing ? `Organize Files → (${analysisProgress.current}/${analysisProgress.total} analyzing)` : 'Organize Files →'}
        </Button>
        {analysisResults.length === 0 && (
          <div id="no-files-message" className="sr-only">
            No files have been analyzed yet. Please select and analyze files before proceeding.
          </div>
        )}
        {isAnalyzing && (
          <div id="analysis-in-progress" className="sr-only">
            Analysis is currently in progress. You can navigate to other phases and the analysis will continue in the background.
          </div>
        )}
      </div>

      {/* Analysis History Modal */}
      {showAnalysisHistory && (
        <AnalysisHistoryModal 
          onClose={() => setShowAnalysisHistory(false)}
          analysisStats={analysisStats}
          setAnalysisStats={setAnalysisStats}
        />
      )}

      {/* Confirmation Dialog */}
      <ConfirmDialog />
    </div>
  );
}

// ===== ANALYSIS HISTORY MODAL =====
function AnalysisHistoryModal({ onClose, analysisStats, setAnalysisStats }) {
  const { addNotification } = useNotification();
  const [historyData, setHistoryData] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState('statistics');

  useEffect(() => {
    loadAnalysisData();
  }, []);

  const loadAnalysisData = async () => {
    setIsLoading(true);
    try {
      const [stats, history] = await Promise.all([
        window.electronAPI.analysisHistory.getStatistics(),
        window.electronAPI.analysisHistory.get({ all: true })
      ]);
      
      setAnalysisStats(stats);
      setHistoryData(history);
    } catch (error) {
      console.error('Failed to load analysis data:', error);
      addNotification('Failed to load analysis history', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const searchHistory = async () => {
    if (!searchQuery.trim()) return;
    
    try {
      const results = await window.electronAPI.analysisHistory.search(searchQuery, { limit: 200 });
      setHistoryData(results);
    } catch (error) {
      console.error('Search failed:', error);
      addNotification('Search failed', 'error');
    }
  };

  const exportHistory = async (format) => {
    try {
      await window.electronAPI.analysisHistory.export(format);
      addNotification(`Analysis history exported as ${format.toUpperCase()}`, 'success');
    } catch (error) {
      console.error('Export failed:', error);
      addNotification('Export failed', 'error');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-fib-21 max-h-[90vh] overflow-hidden">
        <div className="p-fib-21 border-b border-system-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-system-gray-900">📊 Analysis History & Statistics</h2>
            <button
              onClick={onClose}
              className="text-system-gray-500 hover:text-system-gray-700"
            >
              ✕
            </button>
          </div>
          
          {/* Tab Navigation */}
          <div className="flex mt-fib-13 border-b border-system-gray-200">
            <button
              onClick={() => setSelectedTab('statistics')}
              className={`px-fib-13 py-fib-8 text-sm font-medium border-b-2 ${
                selectedTab === 'statistics' 
                  ? 'border-stratosort-blue text-stratosort-blue' 
                  : 'border-transparent text-system-gray-500 hover:text-system-gray-700'
              }`}
            >
              📈 Statistics
            </button>
            <button
              onClick={() => setSelectedTab('history')}
              className={`px-fib-13 py-fib-8 text-sm font-medium border-b-2 ${
                selectedTab === 'history' 
                  ? 'border-stratosort-blue text-stratosort-blue' 
                  : 'border-transparent text-system-gray-500 hover:text-system-gray-700'
              }`}
            >
              📋 History
            </button>
          </div>
        </div>

        <div className="p-fib-21 overflow-y-auto max-h-[70vh]">
          {isLoading ? (
            <div className="text-center py-fib-21">
              <div className="animate-spin w-fib-21 h-fib-21 border-3 border-stratosort-blue border-t-transparent rounded-full mx-auto mb-fib-8"></div>
              <p>Loading analysis data...</p>
            </div>
          ) : (
            <>
              {selectedTab === 'statistics' && analysisStats && (
                <div className="space-y-fib-21">
                  {/* Overview Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-fib-13">
                    <div className="card-enhanced text-center">
                      <div className="text-2xl font-bold text-stratosort-blue">{analysisStats.totalFiles || 0}</div>
                      <div className="text-sm text-system-gray-600">Total Files</div>
                    </div>
                    <div className="card-enhanced text-center">
                      <div className="text-2xl font-bold text-green-600">{Math.round(analysisStats.averageConfidence || 0)}%</div>
                      <div className="text-sm text-system-gray-600">Avg Confidence</div>
                    </div>
                    <div className="card-enhanced text-center">
                      <div className="text-2xl font-bold text-purple-600">{analysisStats.categoriesCount || 0}</div>
                      <div className="text-sm text-system-gray-600">Categories</div>
                    </div>
                    <div className="card-enhanced text-center">
                      <div className="text-2xl font-bold text-orange-600">{Math.round(analysisStats.averageProcessingTime || 0)}ms</div>
                      <div className="text-sm text-system-gray-600">Avg Time</div>
                    </div>
                  </div>

                  {/* Export Options */}
            <div className="card-enhanced">
                    <h3 className="font-semibold mb-fib-8">📤 Export Options</h3>
                    <div className="flex gap-fib-8">
                <Button onClick={() => exportHistory('json')} variant="outline" className="text-sm">
                  Export JSON
                </Button>
                <Button onClick={() => exportHistory('csv')} variant="outline" className="text-sm">
                  Export CSV
                </Button>
                    </div>
                  </div>
                </div>
              )}

              {selectedTab === 'history' && (
                <div className="space-y-fib-13">
                  {/* Search */}
                  <div className="flex gap-fib-8">
                    <Input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search analysis history..."
                      className="flex-1"
                      onKeyDown={(e) => e.key === 'Enter' && searchHistory()}
                    />
                    <Button onClick={searchHistory} variant="primary">Search</Button>
                    <Button onClick={loadAnalysisData} variant="outline">Reset</Button>
                  </div>

                  {/* History List */}
                  <div className="space-y-fib-8">
                    {historyData.map((entry, index) => (
                      <div key={index} className="card-enhanced">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="font-medium text-system-gray-900">{entry.fileName || 'Unknown File'}</div>
                            <div className="text-sm text-system-gray-600 mt-fib-3">
                              <span className="text-stratosort-blue">{entry.category || 'Uncategorized'}</span>
                              {entry.confidence && <span className="ml-fib-8">Confidence: {entry.confidence}%</span>}
                            </div>
                            {entry.keywords && entry.keywords.length > 0 && (
                              <div className="flex flex-wrap gap-fib-3 mt-fib-5">
                                {entry.keywords.slice(0, 5).map((keyword, i) => (
                                  <span key={i} className="text-xs bg-stratosort-blue/10 text-stratosort-blue px-fib-3 py-fib-1 rounded-full">
                                    {keyword}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="text-xs text-system-gray-500">
                            {entry.timestamp ? new Date(entry.timestamp).toLocaleDateString() : 'Unknown Date'}
                          </div>
                        </div>
                      </div>
                    ))}
                    
                    {historyData.length === 0 && (
                      <div className="text-center py-fib-21 text-system-gray-500">
                        No analysis history found
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}



// ===== ORGANIZE PHASE =====
function OrganizePhase() {
  const { actions, phaseData } = usePhase();
  const { addNotification } = useNotification();
  const { executeAction } = useUndoRedo();
  const [organizedFiles, setOrganizedFiles] = useState([]);
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, currentFile: '' });
  const [documentsPath, setDocumentsPath] = useState('');
  const [editingFiles, setEditingFiles] = useState({});
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [bulkEditMode, setBulkEditMode] = useState(false);
  const [bulkCategory, setBulkCategory] = useState('');
  const [defaultLocation, setDefaultLocation] = useState('Documents');
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // NEW: File processing states from discover phase
  const [fileStates, setFileStates] = useState({});
  const [processedFileIds, setProcessedFileIds] = useState(new Set()); // Track which files have been processed

  const analysisResults = (phaseData.analysisResults && Array.isArray(phaseData.analysisResults)) ? phaseData.analysisResults : [];
  const smartFolders = phaseData.smartFolders || [];
  
  // DEBUG: Log organize phase data summary
  console.log('[ORGANIZE-PHASE-DEBUG] Phase data summary:', {
    smartFoldersCount: smartFolders.length,
    analysisResultsCount: analysisResults.length,
    fileStatesCount: Object.keys(phaseData.fileStates || {}).length,
    phaseDataKeys: Object.keys(phaseData)
  });

  // Ensure smart folders are available even if user skipped Setup
  useEffect(() => {
    const loadSmartFoldersIfMissing = async () => {
      try {
        if (!Array.isArray(smartFolders) || smartFolders.length === 0) {
          const folders = await window.electronAPI.smartFolders.get();
          if (Array.isArray(folders) && folders.length > 0) {
            actions.setPhaseData('smartFolders', folders);
            addNotification(`Loaded ${folders.length} smart folder${folders.length > 1 ? 's' : ''}`, 'info');
          } else {
            console.warn('[ORGANIZE-PHASE] No smart folders returned from API');
          }
        }
      } catch (error) {
        console.error('Failed to load smart folders in Organize phase:', error);
      }
    };
    loadSmartFoldersIfMissing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // NEW: Load persisted file states and processed files
  useEffect(() => {
    const loadPersistedData = () => {
      console.log('[ORGANIZE-PHASE] Loading persisted data:', {
        analysisResultsCount: (phaseData.analysisResults || []).length,
        fileStatesCount: Object.keys(phaseData.fileStates || {}).length,
        selectedFilesCount: (phaseData.selectedFiles || []).length,
        organizedFilesCount: (phaseData.organizedFiles || []).length
      });
      
      // Load file states from discover phase
      const persistedStates = phaseData.fileStates || {};
      setFileStates(persistedStates);
      
      // If we have file states but no analysis results, reconstruct analysisResults from fileStates
      if ((phaseData.analysisResults || []).length === 0 && Object.keys(persistedStates).length > 0) {
        console.log('[ORGANIZE-PHASE] Reconstructing analysisResults from fileStates');
        const reconstructedResults = Object.entries(persistedStates).map(([filePath, stateObj]) => {
          const fileName = filePath.split(/[/\\]/).pop();
          return {
            name: fileName,
            path: filePath,
            size: 0,
            type: 'file',
            source: 'reconstructed',
            analysis: stateObj.analysis || null,
            error: stateObj.error,
            analyzedAt: stateObj.analyzedAt,
            status: stateObj.state === 'ready' ? 'analyzed' : (stateObj.state === 'error' ? 'failed' : 'unknown')
          };
        });
        actions.setPhaseData('analysisResults', reconstructedResults);
      }

      // If we don't have file states but we have analysis results, reconstruct them
      if (Object.keys(persistedStates).length === 0 && analysisResults.length > 0) {
        console.log('[ORGANIZE-PHASE] Reconstructing file states from analysis results');
        const reconstructedStates = {};
        
        analysisResults.forEach(file => {
          if (file.analysis && !file.error) {
            reconstructedStates[file.path] = {
              state: 'ready',
              timestamp: file.analyzedAt || new Date().toISOString(),
              analysis: file.analysis,
              analyzedAt: file.analyzedAt
            };
          } else if (file.error) {
            reconstructedStates[file.path] = {
              state: 'error',
              timestamp: file.analyzedAt || new Date().toISOString(),
              error: file.error,
              analyzedAt: file.analyzedAt
            };
          } else {
            reconstructedStates[file.path] = {
              state: 'pending',
              timestamp: new Date().toISOString()
            };
          }
        });
        
        setFileStates(reconstructedStates);
        // Update phase data with reconstructed states
        actions.setPhaseData('fileStates', reconstructedStates);
      }
      
      // Load previously organized files to avoid re-processing
      const previouslyOrganized = phaseData.organizedFiles || [];
      const processedIds = new Set(previouslyOrganized.map(file => file.originalPath || file.path));
      setProcessedFileIds(processedIds);
      
      if (previouslyOrganized.length > 0) {
        setOrganizedFiles(previouslyOrganized);
      }
    };
    
    loadPersistedData();
  }, [phaseData, analysisResults, actions]);

  // Show analysis status if analysis is still running from discover phase
  const isAnalysisRunning = phaseData.isAnalyzing || false;
  const analysisProgressFromDiscover = phaseData.analysisProgress || { current: 0, total: 0 };

  // NEW: Get current file state from discover phase
  const getFileState = (filePath) => {
    return fileStates[filePath]?.state || 'pending';
  };

  // NEW: Get file state display (consistent with discover phase)
  const getFileStateDisplay = (filePath, hasAnalysis, isProcessed = false) => {
    if (isProcessed) {
      return { icon: '✅', label: 'Organized', color: 'text-green-600', spinning: false };
    }
    
    const state = getFileState(filePath);
    
    if (state === 'analyzing') {
      return { icon: '🔄', label: 'Analyzing...', color: 'text-blue-600', spinning: true };
    } else if (state === 'error') {
      return { icon: '❌', label: 'Error', color: 'text-red-600', spinning: false };
    } else if (hasAnalysis && state === 'ready') {
      return { icon: '📂', label: 'Ready', color: 'text-stratosort-blue', spinning: false };
    } else if (state === 'pending') {
      return { icon: '⏳', label: 'Pending', color: 'text-yellow-600', spinning: false };
    } else {
      return { icon: '❌', label: 'Failed', color: 'text-red-600', spinning: false };
    }
  };

  // NEW: Filter files to show unprocessed and processed separately
  const unprocessedFiles = Array.isArray(analysisResults)
    ? analysisResults.filter(file => !processedFileIds.has(file.path) && file && file.analysis)
    : [];
  
  const processedFiles = Array.isArray(organizedFiles)
    ? organizedFiles.filter(file => processedFileIds.has(file?.originalPath || file?.path))
    : [];

  // Pre-match categories to smart folders using embeddings/LLM when no direct match
  useEffect(() => {
    const preMatchCategories = async () => {
      try {
        if (!Array.isArray(smartFolders) || smartFolders.length === 0) return;
        if (!Array.isArray(analysisResults) || analysisResults.length === 0) return;

        // Iterate unprocessed files and attempt AI matching where needed
        for (let i = 0; i < unprocessedFiles.length; i++) {
          const file = unprocessedFiles[i];
          if (!file || !file.analysis) continue;

          const currentCategory = editingFiles[i]?.category || file.analysis.category;
          const direct = findSmartFolderForCategory(currentCategory);
          if (direct) continue; // already resolvable

          const description = [
            file.analysis?.purpose,
            (file.analysis?.keywords || []).join(', '),
            file.analysis?.category,
            file.name
          ]
            .filter(Boolean)
            .join(' | ');

          try {
            const match = await window.electronAPI.smartFolders.match(description, smartFolders);
            if (match && match.success && match.folder && match.folder.name) {
              setEditingFiles(prev => ({
                ...prev,
                [i]: { ...(prev[i] || {}), category: match.folder.name }
              }));
            }
          } catch (e) {
            // Non-fatal; leave for organize-time fallback
            console.warn('[PRE-MATCH] smartFolders.match failed:', e.message);
          }
        }
      } catch (error) {
        console.warn('[PRE-MATCH] Error during pre-matching:', error.message);
      }
    };
    preMatchCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smartFolders, analysisResults, processedFileIds]);

  useEffect(() => {
    // Get the documents path when component mounts
    const loadDocumentsPath = async () => {
      try {
        const path = await window.electronAPI.files.getDocumentsPath();
        setDocumentsPath(path);
        
        // Also load default location from settings
        const settings = await window.electronAPI.settings.get();
        if (settings?.defaultSmartFolderLocation) {
          setDefaultLocation(settings.defaultSmartFolderLocation);
        }
      } catch (error) {
        console.error('Failed to get documents path:', error);
      }
    };
    loadDocumentsPath();
    checkUndoRedoStatus();

    // Listen for operation progress events
    const progressCleanup = window.electronAPI.events.onOperationProgress((progressData) => {
      console.log('[ORGANIZE-PHASE] Operation progress:', progressData);
      if (progressData.type === 'batch_organize' && progressData.current !== undefined) {
        setBatchProgress({
          current: progressData.current,
          total: progressData.total,
          currentFile: progressData.currentFile || ''
        });
        
        // Update notification for long operations
        if (progressData.total > 5 && progressData.current > 0) {
          addNotification(
            `Processing file ${progressData.current}/${progressData.total}: ${progressData.currentFile || 'Unknown file'}`,
            'info',
            1000 // Short duration since these update frequently
          );
        }
      }
    });

    return () => {
      // Cleanup event listeners
      if (progressCleanup) progressCleanup();
    };
  }, [addNotification]);

  // Check undo/redo status
  const checkUndoRedoStatus = async () => {
    try {
      const canUndoResult = await window.electronAPI.undoRedo.canUndo();
      const canRedoResult = await window.electronAPI.undoRedo.canRedo();
      setCanUndo(canUndoResult);
      setCanRedo(canRedoResult);
    } catch (error) {
      console.error('Failed to check undo/redo status:', error);
    }
  };

  // Handle undo operation
  const handleUndo = async () => {
    try {
      await window.electronAPI.undoRedo.undo();
      addNotification('Operation undone successfully', 'success');
      checkUndoRedoStatus();
    } catch (error) {
      console.error('Undo failed:', error);
      addNotification(`Undo failed: ${error.message}`, 'error');
    }
  };

  // Handle redo operation
  const handleRedo = async () => {
    try {
      await window.electronAPI.undoRedo.redo();
      addNotification('Operation redone successfully', 'success');
      checkUndoRedoStatus();
    } catch (error) {
      console.error('Redo failed:', error);
      addNotification(`Redo failed: ${error.message}`, 'error');
    }
  };

  // Toggle file selection
  const toggleFileSelection = (index) => {
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedFiles(newSelected);
  };

  // Select all files
  const selectAllFiles = () => {
    if (selectedFiles.size === unprocessedFiles.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(Array.from({ length: unprocessedFiles.length }, (_, i) => i)));
    }
  };

  // Apply bulk category change
  const applyBulkCategoryChange = () => {
    if (!bulkCategory) return;
    
    const newEdits = {};
    selectedFiles.forEach(index => {
      newEdits[index] = {
        ...editingFiles[index],
        category: bulkCategory
      };
    });
    
    setEditingFiles(prev => ({ ...prev, ...newEdits }));
    setBulkEditMode(false);
    setBulkCategory('');
    setSelectedFiles(new Set());
    addNotification(`Applied category "${bulkCategory}" to ${selectedFiles.size} files`, 'success');
  };

  // Approve selected files for organization
  const approveSelectedFiles = () => {
    if (selectedFiles.size === 0) return;
    
    addNotification(`Approved ${selectedFiles.size} files for organization`, 'success');
    setSelectedFiles(new Set());
  };

  // Find smart folder for category with enhanced matching (memoized for performance)
  const findSmartFolderForCategory = useMemo(() => {
    const folderCache = new Map();
    
    return (category) => {
      if (!category) return null;
      
      // Check cache first
      if (folderCache.has(category)) {
        return folderCache.get(category);
      }
      
      // Only log in development mode to reduce console spam
      if (process.env.NODE_ENV === 'development') {
        console.log(`[FOLDER-MATCH] Finding smart folder for category: "${category}"`);
        console.log(`[FOLDER-MATCH] Available smart folders:`, smartFolders.map(f => ({ name: f?.name, type: typeof f?.name })));
      }
    
    // Normalize category for matching
    const normalizedCategory = category.toLowerCase().trim();
    
    // 1. Exact match first (case-insensitive)
    if (process.env.NODE_ENV === 'development') {
      console.log(`[FOLDER-MATCH] Searching for exact match with normalized category: "${normalizedCategory}"`);
    }
    let folder = smartFolders.find(f => {
      const folderNameNormalized = f?.name?.toLowerCase()?.trim();
      const isMatch = folderNameNormalized === normalizedCategory;
      if (process.env.NODE_ENV === 'development' && isMatch) {
        console.log(`[FOLDER-MATCH] Exact match candidate: "${f.name}" (normalized: "${folderNameNormalized}") vs "${normalizedCategory}"`);
      }
      return isMatch;
    });
    if (folder) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[FOLDER-MATCH] Exact match found: "${folder.name}"`);
      }
      folderCache.set(category, folder);
      return folder;
    }
    
    // 2. Handle common variations (plural/singular, spacing)
    const categoryVariations = [
      normalizedCategory,
      normalizedCategory.replace(/s$/, ''), // Remove trailing 's'
      normalizedCategory + 's', // Add trailing 's'
      normalizedCategory.replace(/\s+/g, ''), // Remove spaces
      normalizedCategory.replace(/\s+/g, '-'), // Replace spaces with dashes
      normalizedCategory.replace(/\s+/g, '_'), // Replace spaces with underscores
    ];
    
    for (const variant of categoryVariations) {
      folder = smartFolders.find(f => 
        f.name.toLowerCase().trim() === variant ||
        f.name.toLowerCase().replace(/\s+/g, '') === variant ||
        f.name.toLowerCase().replace(/\s+/g, '-') === variant ||
        f.name.toLowerCase().replace(/\s+/g, '_') === variant
      );
      if (folder) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[FOLDER-MATCH] Variation match found: "${folder.name}" for variant "${variant}"`);
        }
        folderCache.set(category, folder);
        return folder;
      }
    }
    
    // 3. Partial word matching with scoring
    let bestMatch = null;
    let bestScore = 0;
    
    smartFolders.forEach(f => {
      let score = 0;
      const folderName = f.name.toLowerCase();
      
      // Check if category is contained in folder name
      if (folderName.includes(normalizedCategory)) {
        score += 10;
      }
      
      // Check if folder name is contained in category
      if (normalizedCategory.includes(folderName)) {
        score += 8;
      }
      
      // Word-by-word matching
      const categoryWords = normalizedCategory.split(/[\s_-]+/);
      const folderWords = folderName.split(/[\s_-]+/);
      
      categoryWords.forEach(cWord => {
        folderWords.forEach(fWord => {
          if (cWord === fWord) {
            score += 5;
          } else if (cWord.includes(fWord) || fWord.includes(cWord)) {
            score += 3;
          }
        });
      });
      
      // Check description match
      if (f.description) {
        const descLower = f.description.toLowerCase();
        if (descLower.includes(normalizedCategory)) {
          score += 4;
        }
        categoryWords.forEach(word => {
          if (descLower.includes(word)) {
            score += 2;
          }
        });
      }
      
      // Check keywords match
      if (f.keywords && Array.isArray(f.keywords)) {
        f.keywords.forEach(keyword => {
          if (keyword.toLowerCase() === normalizedCategory) {
            score += 4;
          } else if (keyword.toLowerCase().includes(normalizedCategory) || 
                     normalizedCategory.includes(keyword.toLowerCase())) {
            score += 2;
          }
        });
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = f;
      }
    });
    
    // Return best match if score is meaningful
    if (bestScore >= 3) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[FOLDER-MATCH] Best match found: "${bestMatch.name}" with score ${bestScore}`);
      }
      folderCache.set(category, bestMatch);
      return bestMatch;
    }
    
    // 4. Default folder fallback
    const defaultFolder = smartFolders.find(f => 
      f.name.toLowerCase() === 'general' || 
      f.name.toLowerCase() === 'other' ||
      f.name.toLowerCase() === 'miscellaneous' ||
      f.name.toLowerCase() === 'documents'
    );
    
    if (defaultFolder) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[FOLDER-MATCH] Using default folder: "${defaultFolder.name}" for category "${category}"`);
      }
      folderCache.set(category, defaultFolder);
      return defaultFolder;
    }
    
    // 5. Intelligent category mapping for common mismatches
    const categoryMappings = {
      'archive': ['Research', 'Documents', 'Files'],
      'archives': ['Research', 'Documents', 'Files'],
      'interface': ['Logos', 'Design', 'Screenshots'],
      'interfaces': ['Logos', 'Design', 'Screenshots'],
      'ui': ['Logos', 'Design', 'Screenshots'],
      'screenshot': ['Logos', 'Design', 'Screenshots'],
      'screenshots': ['Logos', 'Design', 'Screenshots'],
      'diagram': ['Logos', 'Design', 'Research'],
      'diagrams': ['Logos', 'Design', 'Research'],
      'chart': ['Research', 'Documents'],
      'charts': ['Research', 'Documents'],
      'logo': ['Logos', 'Design'],
      'logos': ['Logos', 'Design'],
      'image': ['Logos', 'Design', 'Recovery'],
      'images': ['Logos', 'Design', 'Recovery'],
      'photo': ['Recovery', 'Personal'],
      'photos': ['Recovery', 'Personal'],
      'document': ['Documents', 'Research'],
      'documents': ['Documents', 'Research'],
      'file': ['Documents', 'Research'],
      'files': ['Documents', 'Research']
    };
    
    const possibleMappings = categoryMappings[normalizedCategory] || [];
    for (const mapping of possibleMappings) {
      const mappedFolder = smartFolders.find(f => 
        f.name.toLowerCase() === mapping.toLowerCase() ||
        f.name.toLowerCase().includes(mapping.toLowerCase())
      );
      if (mappedFolder) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[FOLDER-MATCH] Mapped category "${category}" to "${mappedFolder.name}" via intelligent mapping`);
        }
        folderCache.set(category, mappedFolder);
        return mappedFolder;
      }
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[FOLDER-MATCH] No match found for category: "${category}"`);
    }
    folderCache.set(category, null);
    return null;
    };
  }, [smartFolders]); // Memoize based on smartFolders changes

  // Handle editing file properties
  const handleEditFile = (fileIndex, field, value) => {
    setEditingFiles(prev => ({
      ...prev,
      [fileIndex]: {
        ...prev[fileIndex],
        [field]: value
      }
    }));
  };

  // Apply edits to analysis results
  const getFileWithEdits = (file, index) => {
    const edits = editingFiles[index];
    if (!edits) return file;
    
    return {
      ...file,
      analysis: {
        ...file.analysis,
        suggestedName: edits.suggestedName || file.analysis?.suggestedName,
        category: edits.category || file.analysis?.category
      }
    };
  };

  // NEW: Mark files as processed after organization
  const markFilesAsProcessed = (filePaths) => {
    setProcessedFileIds(prev => {
      const newSet = new Set(prev);
      filePaths.forEach(path => newSet.add(path));
      return newSet;
    });
  };

  // NEW: Remove files from processed list (for undo operations)
  const unmarkFilesAsProcessed = (filePaths) => {
    setProcessedFileIds(prev => {
      const newSet = new Set(prev);
      filePaths.forEach(path => newSet.delete(path));
      return newSet;
    });
  };

  const handleOrganizeFiles = async () => {
    if (unprocessedFiles.length === 0) {
      addNotification('No files to organize', 'warning');
      return;
    }
    
    console.log('[ORGANIZE-START] Starting organization process');
    console.log('[ORGANIZE-START] documentsPath:', documentsPath);
    console.log('[ORGANIZE-START] smartFolders:', smartFolders);
    console.log('[ORGANIZE-START] unprocessedFiles:', unprocessedFiles.length);
    
    if (!documentsPath) {
      addNotification('Documents path not loaded. Please refresh the page.', 'error');
      return;
    }
    
    setIsOrganizing(true);
    setBatchProgress({ current: 0, total: unprocessedFiles.length, currentFile: '' });
    
    try {
      addNotification(`Starting organization of ${unprocessedFiles.length} files...`, 'info');
      
      // Build operations with proper destination paths
      const operations = [];
      const skippedFiles = [];
      
      for (let i = 0; i < unprocessedFiles.length; i++) {
        const file = getFileWithEdits(unprocessedFiles[i], i);
        
        // Skip files without analysis
        if (!file.analysis || !file.analysis.category) {
          skippedFiles.push({ name: file.name, reason: 'No analysis data' });
          continue;
        }
        
        // Find the appropriate smart folder
        let smartFolder = findSmartFolderForCategory(file.analysis.category);
        
        // If no exact match found, try fallback strategies
        if (!smartFolder) {
          console.log(`[FOLDER-FALLBACK] No match for category "${file.analysis.category}", trying fallbacks...`);
          
          // Semantic matching via main-process (embeddings/LLM)
          try {
            const description = [
              file.analysis?.purpose,
              (file.analysis?.keywords || []).join(', '),
              file.analysis?.category
            ].filter(Boolean).join(' | ');
            const match = await window.electronAPI.smartFolders.match(
              description || file.name,
              smartFolders
            );
            if (match && match.success && match.folder) {
              smartFolder = match.folder;
              console.log(`[FOLDER-FALLBACK] Semantic match (${match.method}) → ${smartFolder.name}`);
              addNotification(`Mapped "${file.analysis.category}" to "${smartFolder.name}" via AI`, 'info');
            }
          } catch (e) {
            console.warn('[FOLDER-FALLBACK] Semantic match failed:', e.message);
          }

          // If still nothing, try general/default
          if (!smartFolder) {
            smartFolder = smartFolders.find(f => 
              f.name?.toLowerCase().includes('general') ||
              f.name?.toLowerCase().includes('other') ||
              f.name?.toLowerCase().includes('misc') ||
              f.name?.toLowerCase().includes('default') ||
              f.name?.toLowerCase().includes('documents')
            ) || smartFolders[0] || { name: 'Documents', path: documentsPath };
            console.log(`[FOLDER-FALLBACK] Using ultimate fallback → ${smartFolder?.name || 'Documents'}`);
          }
        }
        
        // Build the full destination path with proper validation
        let destinationFolder;
        try {
          if (smartFolder.path && (smartFolder.path.startsWith('/') || smartFolder.path.includes(':'))) {
            // Absolute path
            destinationFolder = smartFolder.path;
            console.log(`[PATH-CONSTRUCTION] Using absolute path: ${destinationFolder}`);
          } else if (smartFolder.path) {
            // Relative path from Documents
            destinationFolder = `${documentsPath}/${smartFolder.path}`.replace(/\\/g, '/').replace(/\/+/g, '/');
            console.log(`[PATH-CONSTRUCTION] Using relative path: ${smartFolder.path} → ${destinationFolder}`);
          } else {
            // Default to Documents/FolderName
            destinationFolder = `${documentsPath}/${smartFolder.name}`.replace(/\\/g, '/').replace(/\/+/g, '/');
            console.log(`[PATH-CONSTRUCTION] Using default path: ${smartFolder.name} → ${destinationFolder}`);
          }
          
          console.log(`[PATH-CONSTRUCTION] Final destination folder: ${destinationFolder}`);
          
        } catch (pathError) {
          console.error('[PATH-CONSTRUCTION] Path construction error:', pathError);
          skippedFiles.push({ name: file.name, reason: 'Invalid destination path' });
          continue;
        }
        
        // Ensure the suggested name has an extension
        let fileName = file.analysis.suggestedName || file.name;
        const originalExt = file.name.includes('.') ? '.' + file.name.split('.').pop() : '';
        if (!fileName.includes('.') && originalExt) {
          fileName += originalExt;
        }
        
        // Validate file name
        if (!fileName || fileName.trim() === '') {
          fileName = file.name; // Fallback to original name
        }
        
        const destination = `${destinationFolder}/${fileName}`.replace(/\\/g, '/');
        
        console.log(`[FILE-OPERATION] Preparing to move:
          Source: ${file.path}
          Destination: ${destination}
          Smart Folder: ${smartFolder.name}
          Category: ${file.analysis.category}`);
        
        operations.push({
          type: 'move',
          source: file.path,
          destination: destination,
          metadata: {
            ...file.analysis,
            smartFolder: smartFolder.name,
            originalName: file.name,
            originalPath: file.path
          }
        });
      }

      if (operations.length === 0) {
        addNotification('No files ready for organization', 'warning');
        return;
      }

      if (skippedFiles.length > 0) {
        addNotification(`Skipping ${skippedFiles.length} files without proper analysis`, 'info');
      }

      // Execute with undo capability and progress tracking
      console.log('[ORGANIZE-FILES] Starting file organization with operations:', operations);
      
      const results = await executeAction({
        type: 'BATCH_OPERATION',
        description: `Organize ${operations.length} files`,
        execute: async () => {
          setBatchProgress({
            current: 0,
            total: operations.length,
            currentFile: 'Starting...'
          });

          console.log('[ORGANIZE-FILES] About to call performOperation with:', {
            type: 'batch_organize',
            operationsCount: operations.length,
            operations: operations.map(op => ({
              type: op.type,
              source: op.source,
              destination: op.destination,
              smartFolder: op.metadata?.smartFolder
            }))
          });

          try {
            const result = await window.electronAPI.files.performOperation({
              type: 'batch_organize',
              operations: operations
            });
            
            console.log('[ORGANIZE-FILES] File operation result:', result);
            console.log('[ORGANIZE-FILES] Success count:', result?.successCount);
            console.log('[ORGANIZE-FILES] Fail count:', result?.failCount);
            
            if (result?.results) {
              result.results.forEach((res, index) => {
                if (res.success) {
                  console.log(`[ORGANIZE-FILES] ✅ Operation ${index + 1}: ${res.source} → ${res.destination}`);
                } else {
                  console.log(`[ORGANIZE-FILES] ❌ Operation ${index + 1} failed: ${res.error}`);
                }
              });
            }
            
            setBatchProgress({
              current: operations.length,
              total: operations.length,
              currentFile: 'Complete!'
            });
            return result;
          } catch (error) {
            console.error('[ORGANIZE-FILES] File operation failed:', error);
            setBatchProgress({
              current: 0,
              total: operations.length,
              currentFile: 'Error occurred'
            });
            throw error;
          }
        },
        undo: async () => {
          // Implement undo logic - move files back to original locations
          const undoOperations = operations.map(op => ({
            type: 'move',
            source: op.destination,
            destination: op.source
          }));
          
          // Unmark files as processed when undoing
          const filePaths = operations.map(op => op.source);
          unmarkFilesAsProcessed(filePaths);
          
          return await window.electronAPI.files.performOperation({
            type: 'batch_organize',
            operations: undoOperations
          });
        },
        metadata: {
          fileCount: operations.length,
          operations: operations
        }
      });

      // NEW: Mark organized files as processed
      const organizedFilePaths = operations.map(op => op.source);
      markFilesAsProcessed(organizedFilePaths);

      // NEW: Create organized file records with proper metadata
      const newOrganizedFiles = operations.map((op, index) => ({
        originalPath: op.source,
        newPath: op.destination,
        originalName: op.metadata.originalName,
        newName: op.destination.split(/[/\\]/).pop(),
        smartFolder: op.metadata.smartFolder,
        category: op.metadata.category,
        organizedAt: new Date().toISOString(),
        success: true
      }));

      setOrganizedFiles(prev => [...prev, ...newOrganizedFiles]);
      
      // Persist organized files data
      actions.setPhaseData('organizedFiles', [...organizedFiles, ...newOrganizedFiles]);
      actions.setPhaseData('processedFileIds', Array.from(processedFileIds));
      
      // Remove organized files from discover/analysis persistence so they don't reappear
      try {
        const organizedFilePathsSet = new Set(organizedFilePaths);
        const remainingAnalysisResults = (analysisResults || []).filter(f => !organizedFilePathsSet.has(f.path));
        actions.setPhaseData('analysisResults', remainingAnalysisResults);

        // Remove from fileStates as well
        const newFileStates = { ...(phaseData.fileStates || {}) };
        organizedFilePaths.forEach(p => { delete newFileStates[p]; });
        actions.setPhaseData('fileStates', newFileStates);

        // Remove from selectedFiles
        const remainingSelectedFiles = (phaseData.selectedFiles || []).filter(f => !organizedFilePathsSet.has(f.path));
        actions.setPhaseData('selectedFiles', remainingSelectedFiles);
      } catch (cleanupError) {
        console.warn('[ORGANIZE-CLEANUP] Failed to clean discover persistence:', cleanupError.message);
      }
      
      addNotification(`Successfully organized ${operations.length} files!`, 'success');
      
      // Don't auto-advance if there are still unprocessed files
      const remainingUnprocessed = analysisResults.filter(file => 
        !processedFileIds.has(file.path) && !organizedFilePaths.includes(file.path) && file.analysis
      );
      
      if (remainingUnprocessed.length === 0) {
        // Auto-advance to complete phase only if all files are processed
        setTimeout(() => {
          actions.advancePhase(PHASES.COMPLETE, { 
            organizedFiles: [...organizedFiles, ...newOrganizedFiles],
            analysisResults: [],
            selectedFiles: [],
            fileStates: {}
          });
        }, 1500);
      } else {
        addNotification(`${remainingUnprocessed.length} files remaining for organization`, 'info');
      }
      
    } catch (error) {
      console.error('Organization failed:', error);
      addNotification(`File organization failed: ${error.message}`, 'error');
    } finally {
      setIsOrganizing(false);
      setBatchProgress({ current: 0, total: 0, currentFile: '' });
    }
  };

  return (
    <div className="w-full">
      <div className="mb-fib-21">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-system-gray-900 mb-fib-8">
              📂 Review & Organize
            </h2>
            <p className="text-system-gray-600">
              Review AI suggestions and organize your files into smart folders. Unprocessed files remain available for future organization.
            </p>
            
            {/* Analysis Status Banner if still running */}
            {isAnalysisRunning && (
              <div className="mt-fib-13 p-fib-13 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-fib-8">
                  <div className="animate-spin w-fib-13 h-fib-13 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                  <div className="text-sm font-medium text-blue-700">
                    Analysis continuing in background: {analysisProgressFromDiscover.current}/{analysisProgressFromDiscover.total} files
                  </div>
                </div>
              </div>
            )}
          </div>
          
          {/* Undo/Redo Toolbar */}
          <UndoRedoToolbar className="flex-shrink-0" />
        </div>
      </div>

      {/* Smart Folders Summary */}
      {smartFolders.length > 0 && (
        <div className="card-enhanced mb-fib-21">
          <h3 className="text-lg font-semibold mb-fib-8">📁 Target Smart Folders</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-fib-8">
            {smartFolders.map(folder => (
              <div key={folder.id} className="p-fib-13 bg-surface-secondary rounded-lg border border-stratosort-blue/20">
                <div className="font-medium text-system-gray-900 mb-fib-2">{folder.name}</div>
                <div className="text-sm text-system-gray-600 mb-fib-3">
                  📂 {folder.path || `${defaultLocation}/${folder.name}`}
                </div>
                {folder.description && (
                  <div className="text-xs text-system-gray-500 bg-stratosort-blue/5 p-fib-5 rounded italic">
                    "{folder.description}"
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* NEW: File Status Overview */}
      {(unprocessedFiles.length > 0 || processedFiles.length > 0) && (
        <div className="card-enhanced mb-fib-21">
          <h3 className="text-lg font-semibold mb-fib-8">📊 File Status Overview</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-fib-13">
            <div className="text-center p-fib-13 bg-blue-50 rounded-lg border border-blue-200">
              <div className="text-2xl font-bold text-blue-600">{unprocessedFiles.length}</div>
              <div className="text-sm text-blue-700">Ready to Organize</div>
            </div>
            <div className="text-center p-fib-13 bg-green-50 rounded-lg border border-green-200">
              <div className="text-2xl font-bold text-green-600">{processedFiles.length}</div>
              <div className="text-sm text-green-700">Already Organized</div>
            </div>
            <div className="text-center p-fib-13 bg-gray-50 rounded-lg border border-gray-200">
              <div className="text-2xl font-bold text-gray-600">{analysisResults.filter(f => !f.analysis).length}</div>
              <div className="text-sm text-gray-700">Failed Analysis</div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Operations Bar */}
      {unprocessedFiles.length > 0 && (
        <div className="card-enhanced mb-fib-21">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-fib-13">
              <input
                type="checkbox"
                checked={selectedFiles.size === unprocessedFiles.length}
                onChange={selectAllFiles}
                className="form-checkbox"
              />
              <span className="text-sm font-medium">
                {selectedFiles.size > 0 ? `${selectedFiles.size} selected` : 'Select all'}
              </span>
              
              {selectedFiles.size > 0 && (
                <div className="flex items-center gap-fib-8">
                  <Button
                    onClick={approveSelectedFiles}
                    variant="primary"
                    className="text-sm"
                  >
                    ✓ Approve Selected
                  </Button>
                  <Button
                    onClick={() => setBulkEditMode(!bulkEditMode)}
                    variant="secondary"
                    className="text-sm"
                  >
                    ✏️ Bulk Edit
                  </Button>
                </div>
              )}
            </div>
            
            {bulkEditMode && (
              <div className="flex items-center gap-fib-5">
                <Select
                  value={bulkCategory}
                  onChange={(e) => setBulkCategory(e.target.value)}
                  className="text-sm"
                >
                  <option value="">Select category...</option>
                  {smartFolders.map(folder => (
                    <option key={folder.id} value={folder.name}>{folder.name}</option>
                  ))}
                </Select>
                <Button
                  onClick={applyBulkCategoryChange}
                  variant="primary"
                  className="text-sm"
                  disabled={!bulkCategory}
                >
                  Apply
                </Button>
                <Button
                  onClick={() => {setBulkEditMode(false); setBulkCategory('');}}
                  variant="secondary"
                  className="text-sm"
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* File Review */}
      <div className="card-enhanced mb-fib-21">
        <h3 className="text-lg font-semibold mb-fib-13">Files Ready for Organization</h3>
        
        {unprocessedFiles.length === 0 ? (
          <div className="text-center py-fib-21">
            <div className="text-4xl mb-fib-13">
              {processedFiles.length > 0 ? '✅' : '📭'}
            </div>
            <p className="text-system-gray-500 italic">
              {processedFiles.length > 0 
                ? 'All files have been organized! Check the results below.'
                : 'No files ready for organization yet.'
              }
            </p>
            {processedFiles.length === 0 && (
              <Button
                onClick={() => actions.advancePhase(PHASES.DISCOVER)}
                variant="primary"
                className="mt-fib-13"
              >
                ← Go Back to Select Files
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-fib-8">
            {unprocessedFiles.map((file, index) => {
              const fileWithEdits = getFileWithEdits(file, index);
              // Get the current category (either edited or original)
              const currentCategory = editingFiles[index]?.category || fileWithEdits.analysis?.category;
              const smartFolder = findSmartFolderForCategory(currentCategory);
              const isSelected = selectedFiles.has(index);
              const stateDisplay = getFileStateDisplay(file.path, !!file.analysis);
              
              return (
                <div key={index} className={`border rounded-lg p-fib-13 transition-all duration-200 ${
                  isSelected ? 'border-stratosort-blue bg-stratosort-blue/5' : 'border-system-gray-200'
                }`}>
                  <div className="flex items-start gap-fib-13">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleFileSelection(index)}
                      className="form-checkbox mt-fib-3"
                    />
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-fib-8 mb-fib-5">
                        <div className="text-2xl">📄</div>
                        <div>
                          <div className="font-medium text-system-gray-900">{file.name}</div>
                          <div className="text-sm text-system-gray-500">
                            {file.size ? `${Math.round(file.size / 1024)} KB` : 'Unknown size'} • {file.source?.replace('_', ' ')}
                          </div>
                        </div>
                      </div>
                      
                      {fileWithEdits.analysis ? (
                        <>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-fib-8 mb-fib-8">
                            <div>
                              <label className="block text-xs font-medium text-system-gray-700 mb-fib-2">
                                Suggested Name
                              </label>
                              <Input
                                type="text"
                                value={editingFiles[index]?.suggestedName || fileWithEdits.analysis.suggestedName}
                                onChange={(e) => handleEditFile(index, 'suggestedName', e.target.value)}
                                className="text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-system-gray-700 mb-fib-2">
                                Category
                              </label>
                              <Select
                                value={editingFiles[index]?.category || fileWithEdits.analysis.category}
                                onChange={(e) => handleEditFile(index, 'category', e.target.value)}
                                className="text-sm"
                              >
                                {smartFolders.map(folder => (
                                  <option key={folder.id} value={folder.name}>{folder.name}</option>
                                ))}
                              </Select>
                            </div>
                          </div>
                          
                          <div className="text-sm text-system-gray-600">
                            <strong>Destination:</strong>{' '}
                            <span className="text-stratosort-blue">
                              {smartFolder ? (smartFolder.path || `${defaultLocation}/${smartFolder.name}`) : 'No matching folder'}
                            </span>
                          </div>
                          
                          <AnalysisDetails analysis={file.analysis} options={{ showName: false, showCategory: false }} />
                        </>
                      ) : (
                        <div className="text-sm text-system-red-600 mt-fib-3">
                          Analysis failed - will be skipped
                        </div>
                      )}
                    </div>
                    
                    <div className={`text-sm font-medium flex items-center gap-fib-3 ${stateDisplay.color}`}>
                      <span className={stateDisplay.spinning ? 'animate-spin' : ''}>{stateDisplay.icon}</span>
                      <span>{stateDisplay.label}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* NEW: Previously Organized Files */}
      {processedFiles.length > 0 && (
        <div className="card-enhanced mb-fib-21">
          <h3 className="text-lg font-semibold mb-fib-13">✅ Previously Organized Files</h3>
          <div className="space-y-fib-5 max-h-64 overflow-y-auto">
            {processedFiles.map((file, index) => (
              <div key={index} className="flex items-center justify-between p-fib-8 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-center gap-fib-8">
                  <span className="text-green-600">✅</span>
                  <div>
                    <div className="text-sm font-medium text-system-gray-900">
                      {file.originalName} → {file.newName}
                    </div>
                    <div className="text-xs text-system-gray-500">
                      Moved to {file.smartFolder} • {new Date(file.organizedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-green-600 font-medium">Organized</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Organization Action */}
      {unprocessedFiles.length > 0 && (
        <div className="card-enhanced mb-fib-21 text-center">
          <h3 className="text-lg font-semibold mb-fib-13">Ready to Organize</h3>
          <p className="text-system-gray-600 mb-fib-13">
            StratoSort will move and rename <strong>{unprocessedFiles.filter(f => f.analysis).length} files</strong> according to AI suggestions.
          </p>
          <p className="text-xs text-system-gray-500 mb-fib-13">
            💡 Don't worry - you can undo this operation if needed
          </p>
          
          {isOrganizing ? (
            <div className="py-fib-13">
              <div className="flex items-center justify-center gap-fib-8 text-stratosort-blue mb-fib-8">
                <div className="animate-spin w-fib-21 h-fib-21 border-3 border-stratosort-blue border-t-transparent rounded-full"></div>
                <span className="text-lg font-medium">Organizing Files...</span>
              </div>
              
              {/* Batch Progress */}
              {batchProgress.total > 0 && (
                <div className="mb-fib-8">
                  <div className="flex justify-between text-sm text-system-gray-600 mb-fib-3">
                    <span>Progress: {batchProgress.current} of {batchProgress.total}</span>
                    <span>{Math.round((batchProgress.current / batchProgress.total) * 100)}%</span>
                  </div>
                  <div className="w-full bg-system-gray-200 rounded-full h-fib-5">
                    <div 
                      className="bg-stratosort-blue h-fib-5 rounded-full transition-all duration-300"
                      style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                    ></div>
                  </div>
                  {batchProgress.currentFile && (
                    <div className="text-xs text-system-gray-500 mt-fib-3 truncate">
                      Currently processing: {batchProgress.currentFile}
                    </div>
                  )}
                </div>
              )}
              
              <p className="text-sm text-system-gray-600">
                Please wait while your files are being organized
              </p>
            </div>
          ) : (
            <Button 
              onClick={handleOrganizeFiles}
              variant="success"
              className="text-lg px-fib-21 py-fib-13"
              disabled={unprocessedFiles.filter(f => f.analysis).length === 0}
            >
              ✨ Organize Files Now
            </Button>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button 
          onClick={() => actions.advancePhase(PHASES.DISCOVER)}
          variant="secondary"
          disabled={isOrganizing}
        >
          ← Back to Discovery
        </Button>
        <Button 
          onClick={() => actions.advancePhase(PHASES.COMPLETE)}
          disabled={processedFiles.length === 0 || isOrganizing}
          className={`${processedFiles.length === 0 || isOrganizing ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          View Results →
        </Button>
      </div>
    </div>
  );
}

// ===== COMPLETE PHASE =====
function CompletePhase() {
  const { actions, phaseData } = usePhase();
  const organizedFiles = phaseData.organizedFiles || [];

  return (
    <div className="container-narrow text-center py-fib-34">
      <div className="mb-fib-21">
        <div className="text-6xl mb-fib-13">✅</div>
        <h2 className="text-2xl font-bold text-system-gray-900 mb-fib-8">
          Organization Complete!
        </h2>
        <p className="text-lg text-system-gray-600">
          Successfully organized {organizedFiles.length} files using AI-powered analysis.
        </p>
      </div>

      {organizedFiles.length > 0 && (
        <div className="card-enhanced mb-fib-21 text-left">
          <h3 className="text-lg font-semibold mb-fib-13 text-center">Organization Summary</h3>
          <div className="space-y-fib-5">
            {organizedFiles.slice(0, 5).map((file, index) => (
              <div key={index} className="text-sm">
                <span className="text-system-gray-600">✓</span> {file.originalName || `File ${index + 1}`} → {file.newLocation || 'Organized'}
              </div>
            ))}
            {organizedFiles.length > 5 && (
              <div className="text-sm text-system-gray-500 italic">
                ...and {organizedFiles.length - 5} more files
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-fib-13 mt-fib-21">
        {/* Navigation Back Options */}
        <div className="flex gap-fib-8">
          <Button 
            onClick={() => actions.advancePhase(PHASES.ORGANIZE)}
            variant="secondary"
            className="flex-1"
          >
            ← Back to Organization
          </Button>
          <Button 
            onClick={() => actions.advancePhase(PHASES.DISCOVER)}
            variant="outline"
            className="flex-1"
          >
            ← Back to Discovery
          </Button>
        </div>
        
        {/* New Session Options */}
        <Button 
          onClick={() => actions.resetWorkflow()}
          variant="primary"
          className="px-fib-34 py-fib-13"
        >
          🚀 Start New Organization Session
        </Button>
      </div>
    </div>
  );
}

// ===== NAVIGATION COMPONENT =====
function NavigationBar() {
  const { currentPhase, actions } = usePhase();
  
  const handlePhaseChange = (newPhase) => {
    const allowedTransitions = PHASE_TRANSITIONS[currentPhase] || [];
    if (allowedTransitions.includes(newPhase) || newPhase === currentPhase) {
      actions.advancePhase(newPhase);
    }
  };

  return (
    <nav className="glass-card border-b border-border-light px-fib-21 py-fib-13 sticky top-0 z-40">
      <div className="container-enhanced">
        <div className="flex items-center justify-between">
          {/* Logo and Brand */}
          <div className="flex items-center space-x-fib-21">
            <div className="flex items-center space-x-fib-8">
              <div className="text-fib-21 animate-float">🚀</div>
              <h1 className="text-xl font-bold">
                <span className="text-gradient">
                  StratoSort
                </span>
              </h1>
            </div>
            
            {/* Phase Navigation */}
            <div className="flex items-center space-x-fib-5">
              {Object.entries(PHASES).map(([key, phase]) => {
                const isActive = currentPhase === phase;
                const metadata = PHASE_METADATA[phase];
                const allowedTransitions = PHASE_TRANSITIONS[currentPhase] || [];
                const canNavigate = allowedTransitions.includes(phase) || isActive;
                
                return (
                  <button
                    key={phase}
                    onClick={() => handlePhaseChange(phase)}
                    disabled={!canNavigate}
                    className={`
                      flex items-center space-x-fib-5 px-fib-13 py-fib-8 rounded-lg text-sm font-medium transition-all
                      ${isActive 
                        ? 'bg-stratosort-blue text-white shadow-sm' 
                        : canNavigate
                          ? 'text-system-gray-600 hover:text-stratosort-blue hover:bg-system-gray-50'
                          : 'text-system-gray-400 cursor-not-allowed'
                      }
                    `}
                  >
                    <span>{metadata.icon}</span>
                    <span className="hidden md:inline">{metadata.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
          
          {/* Right Side Controls */}
          <div className="flex items-center space-x-fib-13">
            {/* Undo/Redo Toolbar */}
            <UndoRedoToolbar />
            
            {/* Settings */}
            <button
              onClick={actions.toggleSettings}
              className="p-fib-8 text-system-gray-600 hover:text-stratosort-blue hover:bg-system-gray-100 rounded-lg transition-colors"
              title="Settings"
              aria-label="Open settings"
            >
              <span role="img" aria-label="settings">⚙️</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

// ===== PROGRESS INDICATOR =====
function ProgressIndicator() {
  const { currentPhase, getCurrentMetadata } = usePhase();
  const metadata = getCurrentMetadata();
  
  const phases = Object.values(PHASES);
  const currentIndex = phases.indexOf(currentPhase);
  
  return (
    <div className="bg-surface-secondary/50 border-b border-border-light px-fib-21 py-fib-8 backdrop-blur-sm">
      <div className="container-enhanced">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-fib-8">
            <span className="text-2xl">{metadata.icon}</span>
            <div>
              <div className="font-semibold text-system-gray-900">{metadata.title}</div>
              <div className="text-sm text-system-gray-600">Step {currentIndex + 1} of {phases.length}</div>
            </div>
          </div>
          
          <div className="flex items-center gap-fib-13">
            {/* Progress Bar */}
            <div className="flex items-center gap-fib-8">
              <div className="text-sm text-system-gray-600">{metadata.progress}%</div>
              <div className="w-32 h-2 bg-system-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-stratosort-blue transition-all duration-500"
                  style={{ width: `${metadata.progress}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== KEYBOARD SHORTCUTS HOOK =====
function useKeyboardShortcuts() {
  const { actions, currentPhase } = usePhase();
  const { executeAction } = useUndoRedo();
  const { addNotification } = useNotification();

  useEffect(() => {
    const handleKeyDown = (event) => {
      // Ctrl/Cmd + Z for Undo
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        if (typeof executeAction === 'function') {
          // executeAction is the function itself, not an object with undo/redo methods
          // Use the actual undo/redo handlers from the component
          try {
            // This would need to be handled by the component's undo handler
            addNotification('Use Ctrl+Z in organize phase for undo', 'info', 2000);
          } catch (error) {
            console.error('Undo shortcut failed:', error);
          }
        }
      }
      
      // Ctrl/Cmd + Shift + Z for Redo
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && event.shiftKey) {
        event.preventDefault();
        if (typeof executeAction === 'function') {
          try {
            // This would need to be handled by the component's redo handler
            addNotification('Use Ctrl+Shift+Z in organize phase for redo', 'info', 2000);
          } catch (error) {
            console.error('Redo shortcut failed:', error);
          }
        }
      }
      
      // Ctrl/Cmd + , for Settings
      if ((event.ctrlKey || event.metaKey) && event.key === ',') {
        event.preventDefault();
        actions.toggleSettings();
      }
      
      // Escape to close modals
      if (event.key === 'Escape') {
        actions.toggleSettings(); // Close settings if open
      }
      
      // Arrow keys for phase navigation
      if (event.altKey) {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          // Navigate to previous phase
          const phases = Object.values(PHASES);
          const currentIndex = phases.indexOf(currentPhase);
          if (currentIndex > 0) {
            const previousPhase = phases[currentIndex - 1];
            const allowedTransitions = PHASE_TRANSITIONS[currentPhase] || [];
            if (allowedTransitions.includes(previousPhase)) {
              actions.advancePhase(previousPhase);
              addNotification(`Navigated to ${PHASE_METADATA[previousPhase].title}`, 'info', 2000);
            }
          }
        }
        
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          // Navigate to next phase
          const phases = Object.values(PHASES);
          const currentIndex = phases.indexOf(currentPhase);
          if (currentIndex < phases.length - 1) {
            const nextPhase = phases[currentIndex + 1];
            const allowedTransitions = PHASE_TRANSITIONS[currentPhase] || [];
            if (allowedTransitions.includes(nextPhase)) {
              actions.advancePhase(nextPhase);
              addNotification(`Navigated to ${PHASE_METADATA[nextPhase].title}`, 'info', 2000);
            }
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [actions, currentPhase, executeAction, addNotification]);
}

// ===== PHASE RENDERER =====
function PhaseRenderer() {
  const { currentPhase, showSettings } = usePhase();
  
  // Enable keyboard shortcuts inside the PhaseProvider context
  useKeyboardShortcuts();

  const renderCurrentPhase = () => {
    switch (currentPhase) {
      case PHASES.WELCOME: return <WelcomePhase />;
      case PHASES.SETUP: return <SetupPhase />;
      case PHASES.DISCOVER: return <DiscoverPhase />;
      case PHASES.ORGANIZE: return <OrganizePhase />;
      case PHASES.COMPLETE: return <CompletePhase />;
      default: return <WelcomePhase />;
    }
  };

  return (
    <>
      {renderCurrentPhase()}
      {/* Settings Modal */}
      {showSettings && <SettingsPanel />}
    </>
  );
}

// ===== MAIN APP COMPONENT =====
function App() {
  return (
    <NotificationProvider>
      <UndoRedoProvider>
        <PhaseProvider>
          <AppShell header={<NavigationBar />} subheader={<ProgressIndicator />}> 
            <PhaseRenderer />
            {/* Global tooltip layer */}
            <TooltipManager />
          </AppShell>
        </PhaseProvider>
      </UndoRedoProvider>
    </NotificationProvider>
  );
}

// ===== ERROR BOUNDARY =====
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('React Error Boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
          <div className="text-center p-8 bg-white rounded-lg shadow-lg max-w-md">
            <h1 className="text-2xl font-bold text-red-600 mb-4">⚠️ Application Error</h1>
            <p className="text-gray-600 mb-4">
              Something went wrong. Please refresh the page to try again.
            </p>
            <button 
              onClick={() => window.location.reload()} 
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Reload Application
            </button>
            <details className="mt-4 text-left">
              <summary className="cursor-pointer text-sm text-gray-500">Error Details</summary>
              <pre className="mt-2 text-xs text-red-600 overflow-auto">
                {this.state.error?.toString()}
              </pre>
            </details>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// ===== EXPORT APP COMPONENT =====
export default App; 