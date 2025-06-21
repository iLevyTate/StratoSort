import React from "react";
import { usePhase } from "../contexts/PhaseContext";
const { PHASES } = require("../../shared/constants");

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
        <button 
          onClick={() => actions.advancePhase(PHASES.DISCOVER)}
          className="btn-primary text-lg px-fib-21 py-fib-13"
          aria-describedby="organize-help"
        >
          <span role="img" aria-label="folder">🗂️</span> Organize My Files Now
        </button>
        <div id="organize-help" className="text-xs text-system-gray-500 mt-fib-3">
          Start organizing files immediately with AI-powered analysis.
        </div>
        
        <button 
          onClick={() => actions.advancePhase(PHASES.SETUP)}
          className="btn-secondary text-lg px-fib-21 py-fib-13"
          aria-describedby="setup-help"
        >
          <span role="img" aria-label="settings">⚙️</span> Setup Configuration First
        </button>
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
            <div className="text-3xl mb-fib-5 animate-bounce-subtle" style={{ animationDelay: '0.1s' }}>🧠</div>
            <strong className="text-system-gray-700">Analyze</strong><br/>
            <span className="text-muted">AI analyzes content & suggests organization</span>
          </div>
          <div className="text-center p-fib-13 rounded-lg hover:bg-surface-secondary transition-colors duration-200">
            <div className="text-3xl mb-fib-5 animate-bounce-subtle" style={{ animationDelay: '0.2s' }}>📂</div>
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

export default WelcomePhase;
