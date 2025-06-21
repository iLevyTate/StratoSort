import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './tailwind.css';

// Import the UndoRedo system
import { UndoRedoProvider } from './components/UndoRedoSystem';
import { PhaseProvider, usePhase } from './contexts/PhaseContext';
import { NotificationProvider, useNotification } from './contexts/NotificationContext';
import WelcomePhase from './phases/WelcomePhase';
import SetupPhase from './phases/SetupPhase';
import DiscoverPhase from './phases/DiscoverPhase';
import OrganizePhase from './phases/OrganizePhase';
import CompletePhase from './phases/CompletePhase';

import NavigationBar from "./components/NavigationBar";
import ProgressIndicator from "./components/ProgressIndicator";
import useKeyboardShortcuts from "./hooks/useKeyboardShortcuts";
// Import enhanced UI components

// ===== IMPORT SHARED CONSTANTS =====
const { 
  PHASES, 
  PHASE_TRANSITIONS, 
  PHASE_METADATA 
} = require('../shared/constants');

// ===== ENHANCED NOTIFICATION SYSTEM =====
  return context;
}



// ===== CONFIRMATION DIALOG HOOK =====
      onDrop: handleDrop
    }
  };
}

// ===== PHASE MANAGEMENT =====

// ===== SETTINGS PANEL =====
function SettingsPanel() {
  const { actions } = usePhase();
  const { addNotification } = useNotification();
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
      console.error('Failed to load settings:', error);
    }
  };

  const loadOllamaModels = async () => {
    try {
      const response = await window.electronAPI.ollama.getModels();
      // Handle the response structure: { models: [], selectedModel: '', ollamaHealth: {} }
      setOllamaModels(response?.models || []);
    } catch (error) {
      console.error('Failed to load Ollama models:', error);
      setOllamaModels([]); // Ensure it's always an array
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
            <button
              onClick={actions.toggleSettings}
              className="text-system-gray-500 hover:text-system-gray-700"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-fib-21 space-y-fib-21">
          {/* Ollama Configuration */}
          <div>
            <h3 className="text-lg font-semibold mb-fib-13">🤖 AI Configuration</h3>
            <div className="space-y-fib-13">
              <div>
                <label className="block text-sm font-medium text-system-gray-700 mb-fib-5">
                  Ollama Host URL
                </label>
                <input
                  type="text"
                  value={settings.ollamaHost}
                  onChange={(e) => setSettings((prev) => ({ ...prev, ollamaHost: e.target.value }))}
                  className="form-input-enhanced w-full"
                  placeholder="http://localhost:11434"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-system-gray-700 mb-fib-5">
                  AI Model
                </label>
                <select
                  value={settings.ollamaModel}
                  onChange={(e) => setSettings((prev) => ({ ...prev, ollamaModel: e.target.value }))}
                  className="form-input-enhanced w-full"
                >
                  {ollamaModels.map((model) => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
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
                  onChange={(e) => setSettings((prev) => ({ ...prev, maxConcurrentAnalysis: parseInt(e.target.value) }))}
                  className="w-full"
                />
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="autoOrganize"
                  checked={settings.autoOrganize}
                  onChange={(e) => setSettings((prev) => ({ ...prev, autoOrganize: e.target.checked }))}
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
                <label className="block text-sm font-medium text-system-gray-700 mb-fib-5">
                  Default Smart Folder Location
                </label>
                <input
                  type="text"
                  value={settings.defaultSmartFolderLocation}
                  onChange={(e) => setSettings((prev) => ({ ...prev, defaultSmartFolderLocation: e.target.value }))}
                  className="form-input-enhanced w-full"
                  placeholder="Documents"
                />
                <p className="text-xs text-system-gray-500 mt-fib-3">
                  Where new smart folders will be created by default
                </p>
              </div>
            </div>
          </div>



          {/* Backend API Test */}
          <div>
            <h3 className="text-lg font-semibold mb-fib-13">🔧 Backend API Test</h3>
            <div className="p-fib-13 bg-system-gray-50 rounded-lg">
              <button
                onClick={runAPITests}
                disabled={isTestingApi}
                className="btn-primary text-sm mb-fib-8 w-full"
              >
                {isTestingApi ? 'Testing APIs...' : 'Test All APIs'}
              </button>
              
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
          <button
            onClick={actions.toggleSettings}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button
            onClick={saveSettings}
            className="btn-primary"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}



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
          <div className="min-h-screen gradient-bg modern-scrollbar">
            <NavigationBar />
            <ProgressIndicator />
            <main className="container-centered py-fib-21 animate-fade-in">
              <PhaseRenderer />
            </main>
          </div>
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

console.log('🚀 Stratosort React app loaded successfully'); 
