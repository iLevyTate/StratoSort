import React, { useState, useEffect, useContext, createContext, useReducer, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom/client';

import './tailwind.css';

// Import phase components

// Import the UndoRedo system
import LoadingSkeleton, { 
  SmartFolderSkeleton 
} from './components/LoadingSkeleton';
import { ConfirmModal } from './components/Modal';
import NavigationBar from './components/NavigationBar';
// Toast system handled by NotificationContext
import PerformanceMonitor, { PerformanceProvider } from './components/PerformanceMonitor';
import ProgressIndicator from './components/ProgressIndicator';
import Toast from './components/Toast';
import { UndoRedoProvider } from './components/UndoRedoSystem';
import { NotificationProvider , useNotification } from './contexts/NotificationContext';
import { PhaseProvider, usePhase } from './contexts/PhaseContext';
import { ProgressProvider } from './contexts/ProgressContext';
import useKeyboardShortcuts from './hooks/useKeyboardShortcuts';
import CompletePhase from './phases/CompletePhase';
import DiscoverPhase from './phases/DiscoverPhase';
import OrganizePhase from './phases/OrganizePhase';
import SetupPhase from './phases/SetupPhase';
import WelcomePhase from './phases/WelcomePhase';
import { useErrorHandler } from './utils/ErrorHandling';

// Import enhanced UI components
// LoadingSkeleton components

// ===== IMPORT SHARED CONSTANTS =====
const { 
  PHASES, 
  PHASE_TRANSITIONS, 
  PHASE_METADATA 
} = require('../shared/constants');

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
          setConfirmState((prev) => ({ ...prev, isOpen: false }));
        }
      });
    });
  }, []);

  const hideConfirm = useCallback(() => {
    setConfirmState((prev) => ({ ...prev, isOpen: false }));
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
// Moved to ./hooks/useDragAndDrop.jsx to avoid duplication

// ===== PHASE MANAGEMENT (using external context) =====

// Local PhaseProvider and usePhase removed - using external context from ./contexts/PhaseContext

// ===== SETTINGS PANEL =====
function SettingsPanel() {
  const { actions } = usePhase();
  const { addNotification } = useNotification();
  const { handleError } = useErrorHandler();
  const [settings, setSettings] = useState({
    ollamaModel: 'gemma3:4b', // Multimodal model for both text and vision analysis
    ollamaHost: 'http://localhost:11434',
    maxConcurrentAnalysis: 3,
    autoOrganize: false,
    defaultSmartFolderLocation: 'Documents'
  });
  const [ollamaModels, setOllamaModels] = useState([]);
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
        setSettings((prev) => ({ ...prev, ...savedSettings }));
      }
    } catch (error) {
      handleError(error, 'Settings Load', false);
    }
  };

  const loadOllamaModels = async () => {
    try {
      const response = await window.electronAPI.ollama.getModels();
      // Handle the response structure: { models: [], selectedModel: '', ollamaHealth: {} }
      setOllamaModels(response?.models || []);
    } catch (error) {
      handleError(error, 'Ollama Models Load', false);
      setOllamaModels([]); // Ensure it's always an array
    }
  };

  const saveSettings = async () => {
    try {
      await window.electronAPI.settings.save(settings);
      addNotification('Settings saved successfully!', 'success');
    } catch (error) {
      handleError(error, 'Settings Save');
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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="glass-card-strong max-w-3xl w-full mx-6 max-h-[85vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="glass-card p-6 border-0 border-b border-white/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚙️</span>
              <h2 className="text-2xl font-bold text-on-glass">Settings</h2>
            </div>
            <button
              onClick={actions.toggleSettings}
              className="glass-button w-10 h-10 flex items-center justify-center hover:scale-105 transition-all duration-300"
            >
              <span className="text-lg">✕</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-8 max-h-[60vh] overflow-y-auto glass-scroll">
          {/* AI Configuration */}
          <div className="glass-card p-6">
            <div className="flex items-center gap-3 mb-6">
              <span className="text-2xl">🤖</span>
              <h3 className="text-xl font-bold text-on-glass">AI Configuration</h3>
            </div>
            <div className="space-y-6">
              <div>
                <label className="block text-readable-light text-sm font-medium mb-2">
                  Ollama Host URL
                </label>
                <input
                  type="text"
                  value={settings.ollamaHost}
                  onChange={(e) => setSettings((prev) => ({ ...prev, ollamaHost: e.target.value }))}
                  className="glass-input w-full"
                  placeholder="http://localhost:11434"
                />
              </div>
              
              <div>
                <label className="block text-readable-light text-sm font-medium mb-2">
                  AI Model
                </label>
                <select
                  value={settings.ollamaModel}
                  onChange={(e) => setSettings((prev) => ({ ...prev, ollamaModel: e.target.value }))}
                  className="glass-input w-full"
                >
                  {ollamaModels.map((model) => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Performance Settings */}
          <div className="glass-card p-6">
            <div className="flex items-center gap-3 mb-6">
              <span className="text-2xl">⚡</span>
              <h3 className="text-xl font-bold text-on-glass">Performance</h3>
            </div>
            <div className="space-y-6">
              <div>
                <label className="block text-readable-light text-sm font-medium mb-2">
                  Max Concurrent Analysis: {settings.maxConcurrentAnalysis}
                </label>
                <input
                  type="range"
                  min="1"
                  max="8"
                  value={settings.maxConcurrentAnalysis}
                  onChange={(e) => setSettings((prev) => ({ ...prev, maxConcurrentAnalysis: parseInt(e.target.value) }))}
                  className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-xs text-readable-light mt-1">
                  <span>Slower</span>
                  <span>Faster</span>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="autoOrganize"
                  checked={settings.autoOrganize}
                  onChange={(e) => setSettings((prev) => ({ ...prev, autoOrganize: e.target.checked }))}
                  className="w-4 h-4 text-blue-600 bg-white/20 border-white/30 rounded focus:ring-blue-500"
                />
                <label htmlFor="autoOrganize" className="text-readable-light text-sm">
                  Auto-organize files after analysis
                </label>
              </div>
            </div>
          </div>

          {/* Default Locations */}
          <div className="glass-card p-6">
            <div className="flex items-center gap-3 mb-6">
              <span className="text-2xl">📁</span>
              <h3 className="text-xl font-bold text-on-glass">Default Locations</h3>
            </div>
            <div>
              <label className="block text-readable-light text-sm font-medium mb-2">
                  Default Smart Folder Location
              </label>
              <input
                type="text"
                value={settings.defaultSmartFolderLocation}
                onChange={(e) => setSettings((prev) => ({ ...prev, defaultSmartFolderLocation: e.target.value }))}
                className="glass-input w-full"
                placeholder="Documents"
              />
              <p className="text-xs text-readable-light mt-2 opacity-75">
                  Where new smart folders will be created by default
              </p>
            </div>
          </div>

          {/* Backend API Test */}
          <div className="glass-card p-6">
            <div className="flex items-center gap-3 mb-6">
              <span className="text-2xl">🔧</span>
              <h3 className="text-xl font-bold text-on-glass">Backend API Test</h3>
            </div>
            <div className="glass-card p-4 bg-white/5">
              <button
                onClick={runAPITests}
                disabled={isTestingApi}
                className={`glass-button-primary w-full mb-4 ${isTestingApi ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isTestingApi ? 'Testing APIs...' : 'Test All APIs'}
              </button>
              
              {Object.keys(testResults).length > 0 && (
                <div className="space-y-2">
                  {Object.entries(testResults).map(([service, status]) => (
                    <div key={service} className="flex justify-between items-center p-2 glass-card">
                      <span className="text-readable-light text-sm font-medium capitalize">
                        {service.replace(/([A-Z])/g, ' $1').trim()}:
                      </span>
                      <span className="text-xs font-mono text-on-glass">{status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="glass-card p-6 border-0 border-t border-white/20 flex justify-end gap-4">
          <button
            onClick={actions.toggleSettings}
            className="glass-button px-6 py-3"
          >
            Cancel
          </button>
          <button
            onClick={saveSettings}
            className="glass-button-primary px-6 py-3"
          >
            Save Settings
          </button>
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
            // Failed to update system metrics
          }
        }, 5000); // Update every 5 seconds
        
      } catch (error) {
        // Failed to start system monitoring
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
      <div className="text-sm text-gray-500">
        System monitoring unavailable
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="font-medium text-gray-700">📊 System Status</h4>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-gray-600">CPU:</span>
          <span className="ml-2 font-medium">{systemMetrics.cpu?.toFixed(1) || 0}%</span>
        </div>
        <div>
          <span className="text-gray-600">Memory:</span>
          <span className="ml-2 font-medium">
            {systemMetrics.memory?.used || 0} / {systemMetrics.memory?.total || 0} MB
          </span>
        </div>
        <div>
          <span className="text-gray-600">Uptime:</span>
          <span className="ml-2 font-medium">
            {Math.floor((systemMetrics.uptime || 0) / 60)}m
          </span>
        </div>
        <div>
          <span className="text-gray-600">Disk:</span>
          <span className="ml-2 font-medium">
            {((systemMetrics.disk?.used || 0) / (1024*1024*1024)).toFixed(1)}GB used
          </span>
        </div>
      </div>
    </div>
  );
}

// ===== EMBEDDED COMPONENTS BELOW =====
// The PhaseRenderer above uses the external components from ./phases/ directory
// This component has been moved to ./phases/SetupPhase.js and is imported as ExternalSetupPhase
// This component has been moved to ./phases/DiscoverPhase.js and is imported as ExternalDiscoverPhase
// DiscoverPhase is now imported from ./phases/DiscoverPhase.js
// AnalysisHistoryModal is now imported from ./components/AnalysisHistoryModal.js
// OrganizePhase is now imported from ./phases/OrganizePhase.js
// CompletePhase is now imported from ./phases/CompletePhase.js

// ===== PHASE RENDERER =====
function PhaseRenderer() {
  const { currentPhase, showSettings } = usePhase();
  
  // Keyboard shortcuts handled by shared hook
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
    <PhaseProvider>
      <NotificationProvider>
        <UndoRedoProvider>
          <ProgressProvider>
            <PerformanceProvider>
              <div className="h-screen w-screen overflow-hidden flex flex-col phase-container"
                style={{ padding: 0 }}>
                {/* Navigation - Fixed height */}
                <NavigationBar />
                
                {/* Progress Indicator - Fixed height */}
                <ProgressIndicator />
                
                {/* Main Content - Fills remaining space */}
                <main 
                  id="main-content" 
                  className="flex-1 overflow-hidden"
                  role="main"
                  aria-label="Main application content"
                >
                  <PhaseRenderer />
                </main>
                
                {/* Toast notifications */}
                <Toast />
                
                {/* Performance Monitor - Development only */}
                {process.env.NODE_ENV === 'development' && <PerformanceMonitor />}
              </div>
            </PerformanceProvider>
          </ProgressProvider>
        </UndoRedoProvider>
      </NotificationProvider>
    </PhaseProvider>
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
    // React Error Boundary caught an error - logged internally
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="phase-container">
          <div className="phase-content">
            <div className="glass-card-strong p-8 text-center max-w-md">
              <h1 className="text-2xl font-bold text-red-600 mb-4">⚠️ Application Error</h1>
              <p className="text-on-glass mb-4">
                Something went wrong. Please refresh the page to try again.
              </p>
              <button 
                onClick={() => window.location.reload()} 
                className="action-button-primary mb-4"
              >
                Reload Application
              </button>
              <details className="mt-4 text-left">
                <summary className="cursor-pointer text-sm text-readable-light">Error Details</summary>
                <pre className="mt-2 text-xs text-red-600 overflow-auto">
                  {this.state.error?.toString()}
                </pre>
              </details>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// ===== RENDER APP =====
const root = ReactDOM.createRoot(document.getElementById('react-root'));
root.render(
  // Temporarily disable StrictMode in development to reduce duplicate API calls
  process.env.NODE_ENV === 'production' ? (
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  ) : (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )
);

// App loaded successfully 