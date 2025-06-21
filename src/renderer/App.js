import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import "./tailwind.css";

// ===== PROVIDERS & CONTEXTS =====
import { UndoRedoProvider } from "./components/UndoRedoSystem";
import { PhaseProvider, usePhase } from "./contexts/PhaseContext";
import { NotificationProvider, useNotification } from "./contexts/NotificationContext";

// ===== PHASE SCREENS =====
import WelcomePhase from "./phases/WelcomePhase";
import SetupPhase from "./phases/SetupPhase";
import DiscoverPhase from "./phases/DiscoverPhase";
import OrganizePhase from "./phases/OrganizePhase";
import CompletePhase from "./phases/CompletePhase";

// ===== SHARED UI =====
import NavigationBar from "./components/NavigationBar";
import ProgressIndicator from "./components/ProgressIndicator";
import useKeyboardShortcuts from "./hooks/useKeyboardShortcuts";

// ===== SHARED CONSTANTS =====
import { PHASES, PHASE_TRANSITIONS, PHASE_METADATA } from "../shared/constants";

/* --------------------------------------------------------------------------
 * SETTINGS PANEL
 * -------------------------------------------------------------------------- */
function SettingsPanel() {
  const { actions } = usePhase();
  const { addNotification } = useNotification();

  const [settings, setSettings] = useState({
    ollamaModel: "gemma3:4b", // Multimodal model for both text and vision analysis
    ollamaHost: "http://localhost:11434",
    maxConcurrentAnalysis: 3,
    autoOrganize: false,
    defaultSmartFolderLocation: "Documents",
  });

  const [ollamaModels, setOllamaModels] = useState([]);
  const [testResults, setTestResults] = useState({});
  const [isTestingApi, setIsTestingApi] = useState(false);

  /* ---------------------------- INITIAL LOAD ---------------------------- */
  useEffect(() => {
    let mounted = true;

    (async () => {
      if (!mounted) return;
      await loadSettings();
      await loadOllamaModels();
    })();

    return () => {
      mounted = false;
    };
  }, []);

  /* ------------------------------ HELPERS ------------------------------- */
  const loadSettings = async () => {
    try {
      const savedSettings = await window.electronAPI?.settings.get();
      if (savedSettings) setSettings((prev) => ({ ...prev, ...savedSettings }));
    } catch (err) {
      console.error("Failed to load settings:", err);
    }
  };

  const loadOllamaModels = async () => {
    try {
      const { models = [] } = (await window.electronAPI?.ollama.getModels()) || {};
      setOllamaModels(models);
    } catch (err) {
      console.error("Failed to load Ollama models:", err);
      setOllamaModels([]);
    }
  };

  const saveSettings = async () => {
    try {
      await window.electronAPI?.settings.save(settings);
      addNotification("Settings saved successfully!", "success");
    } catch (err) {
      console.error("Failed to save settings:", err);
      addNotification("Failed to save settings", "error");
    }
  };

  const runAPITests = async () => {
    setIsTestingApi(true);
    const results = {};

    /* ---------------------- FILE, FOLDER, HISTORY, … --------------------- */
    const tests = {
      fileOperations: () => window.electronAPI.files.getDocumentsPath(),
      smartFolders: () => window.electronAPI.smartFolders.get(),
      analysisHistory: () => window.electronAPI.analysisHistory.getStatistics(),
      undoRedo: () => window.electronAPI.undoRedo.canUndo(),
      systemMonitoring: () => window.electronAPI.system.getApplicationStatistics(),
      ollama: () => window.electronAPI.ollama.getModels(),
    };

    await Promise.all(
      Object.entries(tests).map(async ([key, fn]) => {
        try {
          await fn();
          results[key] = "✅ Working";
        } catch (err) {
          results[key] = `❌ Error: ${err.message}`;
        }
      })
    );

    setTestResults(results);
    setIsTestingApi(false);
    addNotification("API tests completed", "info");
  };

  /* ----------------------------- RENDERING ------------------------------ */
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-system-gray-200 p-6">
          <h2 className="text-xl font-bold text-system-gray-900">⚙️ Settings</h2>
          <button
            onClick={actions.toggleSettings}
            className="text-system-gray-500 hover:text-system-gray-700"
          >
            ✕
          </button>
        </div>

        <div className="space-y-8 p-6">
          {/* AI CONFIG */}
          <section>
            <h3 className="mb-3 text-lg font-semibold">🤖 AI Configuration</h3>
            <div className="space-y-3">
              <label className="block text-sm font-medium text-system-gray-700">Ollama Host URL</label>
              <input
                type="text"
                value={settings.ollamaHost}
                onChange={(e) => setSettings((p) => ({ ...p, ollamaHost: e.target.value }))}
                className="form-input-enhanced w-full"
                placeholder="http://localhost:11434"
              />

              <label className="block text-sm font-medium text-system-gray-700">AI Model</label>
              <select
                value={settings.ollamaModel}
                onChange={(e) => setSettings((p) => ({ ...p, ollamaModel: e.target.value }))}
                className="form-input-enhanced w-full"
              >
                {ollamaModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </section>

          {/* PERFORMANCE */}
          <section>
            <h3 className="mb-3 text-lg font-semibold">⚡ Performance</h3>
            <div className="space-y-3">
              <label className="block text-sm font-medium text-system-gray-700">
                Max Concurrent Analysis ({settings.maxConcurrentAnalysis})
              </label>
              <input
                type="range"
                min="1"
                max="8"
                value={settings.maxConcurrentAnalysis}
                onChange={(e) => setSettings((p) => ({ ...p, maxConcurrentAnalysis: +e.target.value }))}
                className="w-full"
              />

              <div className="flex items-center">
                <input
                  id="autoOrganize"
                  type="checkbox"
                  checked={settings.autoOrganize}
                  onChange={(e) => setSettings((p) => ({ ...p, autoOrganize: e.target.checked }))}
                  className="mr-2"
                />
                <label htmlFor="autoOrganize" className="text-sm text-system-gray-700">
                  Auto‑organize files after analysis
                </label>
              </div>
            </div>
          </section>

          {/* DEFAULT LOCATIONS */}
          <section>
            <h3 className="mb-3 text-lg font-semibold">📁 Default Locations</h3>
            <label className="block text-sm font-medium text-system-gray-700">Default Smart Folder Location</label>
            <input
              type="text"
              value={settings.defaultSmartFolderLocation}
              onChange={(e) => setSettings((p) => ({ ...p, defaultSmartFolderLocation: e.target.value }))}
              className="form-input-enhanced w-full"
              placeholder="Documents"
            />
            <p className="mt-1 text-xs text-system-gray-500">
              Where new smart folders will be created by default
            </p>
          </section>

          {/* BACKEND API TESTS */}
          <section>
            <h3 className="mb-3 text-lg font-semibold">🔧 Backend API Test</h3>
            <div className="rounded-lg bg-system-gray-50 p-4">
              <button
                className="btn-primary mb-2 w-full text-sm"
                disabled={isTestingApi}
                onClick={runAPITests}
              >
                {isTestingApi ? "Testing APIs…" : "Test All APIs"}
              </button>

              {Object.keys(testResults).length > 0 && (
                <div className="space-y-1 text-sm">
                  {Object.entries(testResults).map(([service, status]) => (
                    <div key={service} className="flex justify-between capitalize">
                      <span>{service.replace(/([A-Z])/g, " $1").trim()}:</span>
                      <span className="font-mono text-xs">{status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* FOOTER */}
        <div className="flex justify-end gap-3 border-t border-system-gray-200 p-6">
          <button onClick={actions.toggleSettings} className="btn-secondary">
            Cancel
          </button>
          <button onClick={saveSettings} className="btn-primary">
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
 * SYSTEM MONITORING WIDGET
 * -------------------------------------------------------------------------- */
function SystemMonitoring() {
  const [metrics, setMetrics] = useState({ cpu: 0, memory: { used: 0, total: 0 }, uptime: 0, disk: { used: 0, total: 0 } });
  const [active, setActive] = useState(false);

  useEffect(() => {
    let interval;
    (async () => {
      try {
        setActive(true);
        setMetrics(await window.electronAPI.system.getMetrics());
        interval = setInterval(async () => {
          try {
            setMetrics(await window.electronAPI.system.getMetrics());
          } catch (err) {
            console.warn("Failed to update system metrics:", err);
          }
        }, 5000);
      } catch (err) {
        console.error("System monitoring unavailable:", err);
        setActive(false);
      }
    })();

    return () => clearInterval(interval);
  }, []);

  if (!active) return <p className="text-sm text-system-gray-500">System monitoring unavailable</p>;

  return (
    <div className="space-y-2 text-sm">
      <h4 className="font-medium text-system-gray-700">📊 System Status</h4>
      <div className="grid grid-cols-2 gap-2">
        <Metric label="CPU" value={`${metrics.cpu?.toFixed(1) || 0}%`} />
        <Metric label="Memory" value={`${metrics.memory.used || 0} / ${metrics.memory.total || 0} MB`} />
        <Metric label="Uptime" value={`${Math.floor((metrics.uptime || 0) / 60)}m`} />
        <Metric label="Disk" value={`${((metrics.disk.used || 0) / 1_073_741_824).toFixed(1)}GB used`} />
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div>
      <span className="text-system-gray-600">{label}:</span>
      <span className="ml-2 font-medium">{value}</span>
    </div>
  );
}

/* --------------------------------------------------------------------------
 * PHASE RENDERER
 * -------------------------------------------------------------------------- */
function PhaseRenderer() {
  const { currentPhase, showSettings } = usePhase();
  useKeyboardShortcuts();

  const Component =
    {
      [PHASES.WELCOME]: WelcomePhase,
      [PHASES.SETUP]: SetupPhase,
      [PHASES.DISCOVER]: DiscoverPhase,
      [PHASES.ORGANIZE]: OrganizePhase,
      [PHASES.COMPLETE]: CompletePhase,
    }[currentPhase] || WelcomePhase;

  return (
    <>
      <Component />
      {showSettings && <SettingsPanel />} {/* Modal */}
    </>
  );
}

/* --------------------------------------------------------------------------
 * MAIN APP COMPONENT
 * -------------------------------------------------------------------------- */
function App() {
  return (
    <NotificationProvider>
      <UndoRedoProvider>
        <PhaseProvider>
          <div className="modern-scrollbar min-h-screen gradient-bg">
            <NavigationBar />
            <ProgressIndicator />
            <main className="container-centered animate-fade-in py-8">
              <PhaseRenderer />
            </main>
          </div>
        </PhaseProvider>
      </UndoRedoProvider>
    </NotificationProvider>
  );
}

/* --------------------------------------------------------------------------
 * ERROR BOUNDARY
 * -------------------------------------------------------------------------- */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("React Error Boundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
          <div className="p-8 max-w-md text-center bg-white rounded-lg shadow-lg">
            <h1 className="mb-4 text-2xl font-bold text-red-600">⚠️ Application Error</h1>
            <p className="mb-4 text-gray-600">
              Something went wrong. Please refresh the page to try again.
            </p>
            <button
              className="px-4 py-2 text-white bg-blue-600 rounded hover:bg-blue-700"
              onClick={() => window.location.reload()}
            >
              Reload Application
            </button>
            <details className="mt-4 text-left">
              <summary className="text-sm text-gray-500 cursor-pointer">Error Details</summary>
              <pre className="mt-2 overflow-auto text-xs text-red-600">
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
const root = ReactDOM.createRoot(document.getElementById("react-root"));
root.render(
  // Temporarily disable StrictMode in development to reduce duplicate API calls
  process.env.NODE_ENV === "production" ? (
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

console.log("🚀 Stratosort React app loaded successfully");
