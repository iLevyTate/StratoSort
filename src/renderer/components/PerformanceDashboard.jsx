import React, { useState, useEffect } from 'react';
// Use preload-provided ipcRenderer if available
const ipcRenderer = (typeof window !== 'undefined' &&
  window.electron &&
  window.electron.ipcRenderer) || {
  invoke: async () => {
    throw new Error(
      'IPC not available in renderer. Use window.electronAPI or enable preload.',
    );
  },
};

const PerformanceDashboard = ({ isOpen, onClose, onOpenLogViewer }) => {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5000); // 5 seconds
  const [systemStatus, setSystemStatus] = useState(null);
  const [showSystemStatus, setShowSystemStatus] = useState(false);

  const fetchMetrics = async () => {
    try {
      const result = await window.electronAPI.system.getMetrics();
      if (result.success) {
        setMetrics(result.metrics);
      }
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSystemStatus = async () => {
    try {
      const result = await window.electronAPI.system.getSystemStatus();
      if (result.success) {
        setSystemStatus(result.status);
      }
    } catch (error) {
      console.error('Failed to fetch system status:', error);
    }
  };

  const performHealthCheck = async () => {
    try {
      const result = await window.electronAPI.system.performHealthCheck();
      if (result.success) {
        setSystemStatus(result.status);
      }
    } catch (error) {
      console.error('Failed to perform health check:', error);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchMetrics();
      const interval = setInterval(fetchMetrics, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [isOpen, refreshInterval]);

  const formatDuration = (ms) => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatNumber = (num) => {
    return new Intl.NumberFormat().format(num);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh] overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Performance Dashboard
          </h2>
          <div className="flex items-center space-x-4">
            <select
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              className="px-3 py-1 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            >
              <option value={1000}>1s</option>
              <option value={5000}>5s</option>
              <option value={10000}>10s</option>
              <option value={30000}>30s</option>
            </select>
            <button
              onClick={fetchSystemStatus}
              className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors text-sm"
              title="Check System Status"
            >
              System Status
            </button>
            <button
              onClick={performHealthCheck}
              className="px-3 py-1 bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors text-sm"
              title="Run Health Check"
            >
              Health Check
            </button>
            <button
              onClick={onOpenLogViewer}
              className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm"
              title="View Detailed Logs"
            >
              View Logs
            </button>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-4 overflow-y-auto max-h-[calc(90vh-80px)]">
          {loading ? (
            <div className="flex justify-center items-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : metrics ? (
            <div className="space-y-6">
              {/* System Overview */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {formatNumber(metrics.processedFiles)}
                  </div>
                  <div className="text-sm text-blue-600 dark:text-blue-400">
                    Files Processed
                  </div>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {metrics.successfulOperations}
                  </div>
                  <div className="text-sm text-green-600 dark:text-green-400">
                    Success
                  </div>
                </div>
                <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                    {metrics.failedOperations}
                  </div>
                  <div className="text-sm text-red-600 dark:text-red-400">
                    Failed
                  </div>
                </div>
                <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                    {Math.round(metrics.uptime / 1000 / 60)}m
                  </div>
                  <div className="text-sm text-purple-600 dark:text-purple-400">
                    Uptime
                  </div>
                </div>
              </div>

              {/* Memory Usage */}
              {metrics.memory && (
                <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
                    Memory Usage
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Used
                      </div>
                      <div className="text-lg font-semibold text-gray-900 dark:text-white">
                        {metrics.memory.used} MB
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Total
                      </div>
                      <div className="text-lg font-semibold text-gray-900 dark:text-white">
                        {metrics.memory.total} MB
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Usage
                      </div>
                      <div className="text-lg font-semibold text-gray-900 dark:text-white">
                        {Math.round(
                          (metrics.memory.used / metrics.memory.total) * 100,
                        )}
                        %
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* IPC Calls Performance */}
              {metrics.actionMetrics &&
                Object.keys(metrics.actionMetrics.ipcCalls).length > 0 && (
                  <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                    <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                      IPC Calls ({metrics.actionMetrics.totalIpcCalls})
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b dark:border-gray-600">
                            <th className="text-left py-2 text-gray-900 dark:text-white">
                              Handler
                            </th>
                            <th className="text-right py-2 text-gray-900 dark:text-white">
                              Count
                            </th>
                            <th className="text-right py-2 text-gray-900 dark:text-white">
                              Avg Time
                            </th>
                            <th className="text-right py-2 text-gray-900 dark:text-white">
                              Success Rate
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(metrics.actionMetrics.ipcCalls).map(
                            ([name, data]) => (
                              <tr
                                key={name}
                                className="border-b dark:border-gray-600"
                              >
                                <td className="py-2 text-gray-900 dark:text-white font-mono text-xs">
                                  {name}
                                </td>
                                <td className="text-right py-2 text-gray-900 dark:text-white">
                                  {data.count}
                                </td>
                                <td className="text-right py-2 text-gray-900 dark:text-white">
                                  {formatDuration(data.avgDuration)}
                                </td>
                                <td className="text-right py-2">
                                  <span
                                    className={`px-2 py-1 rounded text-xs ${
                                      data.successRate >= 95
                                        ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                                        : data.successRate >= 80
                                          ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
                                          : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                                    }`}
                                  >
                                    {Math.round(data.successRate)}%
                                  </span>
                                </td>
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

              {/* Ollama Calls Performance */}
              {metrics.actionMetrics &&
                Object.keys(metrics.actionMetrics.ollamaCalls).length > 0 && (
                  <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                    <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                      Ollama Calls ({metrics.actionMetrics.totalOllamaCalls})
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b dark:border-gray-600">
                            <th className="text-left py-2 text-gray-900 dark:text-white">
                              Operation
                            </th>
                            <th className="text-left py-2 text-gray-900 dark:text-white">
                              Model
                            </th>
                            <th className="text-right py-2 text-gray-900 dark:text-white">
                              Count
                            </th>
                            <th className="text-right py-2 text-gray-900 dark:text-white">
                              Avg Time
                            </th>
                            <th className="text-right py-2 text-gray-900 dark:text-white">
                              Queue Wait
                            </th>
                            <th className="text-right py-2 text-gray-900 dark:text-white">
                              Success Rate
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(
                            metrics.actionMetrics.ollamaCalls,
                          ).map(([key, data]) => (
                            <tr
                              key={key}
                              className="border-b dark:border-gray-600"
                            >
                              <td className="py-2 text-gray-900 dark:text-white">
                                {data.operation}
                              </td>
                              <td className="py-2 text-gray-900 dark:text-white font-mono text-xs">
                                {data.model}
                              </td>
                              <td className="text-right py-2 text-gray-900 dark:text-white">
                                {data.count}
                              </td>
                              <td className="text-right py-2 text-gray-900 dark:text-white">
                                {formatDuration(data.avgDuration)}
                              </td>
                              <td className="text-right py-2 text-gray-900 dark:text-white">
                                {formatDuration(data.avgQueueWait)}
                              </td>
                              <td className="text-right py-2">
                                <span
                                  className={`px-2 py-1 rounded text-xs ${
                                    data.successRate >= 95
                                      ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                                      : data.successRate >= 80
                                        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
                                        : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                                  }`}
                                >
                                  {Math.round(data.successRate)}%
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

              {/* Recent Actions */}
              {metrics.actionMetrics &&
                metrics.actionMetrics.recentActions.length > 0 && (
                  <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                    <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                      Recent Actions
                    </h3>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {metrics.actionMetrics.recentActions.map(
                        (action, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between py-2 px-3 bg-white dark:bg-gray-800 rounded"
                          >
                            <div className="flex items-center space-x-3">
                              <span
                                className={`px-2 py-1 rounded text-xs font-semibold ${
                                  action.type === 'ipc_call'
                                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                                    : action.type === 'ollama_call'
                                      ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400'
                                      : 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
                                }`}
                              >
                                {action.type === 'ipc_call'
                                  ? 'IPC'
                                  : action.type === 'ollama_call'
                                    ? 'OLLAMA'
                                    : action.type}
                              </span>
                              <span className="text-sm text-gray-900 dark:text-white">
                                {action.type === 'ipc_call'
                                  ? action.name
                                  : action.type === 'ollama_call'
                                    ? `${action.operation} (${action.model})`
                                    : action.name || 'Unknown'}
                              </span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <span
                                className={`px-2 py-1 rounded text-xs ${
                                  action.success
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                                    : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                                }`}
                              >
                                {action.success ? '✓' : '✗'}
                              </span>
                              <span className="text-sm text-gray-600 dark:text-gray-400">
                                {formatDuration(action.duration)}
                              </span>
                              <span className="text-xs text-gray-500 dark:text-gray-500">
                                {new Date(
                                  action.timestamp,
                                ).toLocaleTimeString()}
                              </span>
                            </div>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                )}

              {/* Recent Errors */}
              {metrics.recentErrors && metrics.recentErrors.length > 0 && (
                <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold mb-4 text-red-800 dark:text-red-400">
                    Recent Errors ({metrics.recentErrors.length})
                  </h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {metrics.recentErrors.map((error, index) => (
                      <div
                        key={index}
                        className="bg-white dark:bg-gray-800 p-3 rounded border-l-4 border-red-500"
                      >
                        <div className="text-sm text-gray-900 dark:text-white font-mono">
                          {error.message}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                          {new Date(error.timestamp).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* System Status */}
              {systemStatus && (
                <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold mb-4 text-green-800 dark:text-green-400">
                    System Status
                  </h3>

                  {/* System Information */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div className="bg-white dark:bg-gray-800 p-3 rounded">
                      <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                        System Info
                      </h4>
                      <div className="text-sm space-y-1">
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">
                            Platform:
                          </span>
                          <span className="text-gray-900 dark:text-white">
                            {systemStatus.systemInfo.platform}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">
                            Architecture:
                          </span>
                          <span className="text-gray-900 dark:text-white">
                            {systemStatus.systemInfo.arch}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">
                            Memory:
                          </span>
                          <span className="text-gray-900 dark:text-white">
                            {Math.round(
                              systemStatus.systemInfo.totalMemory / 1024 / 1024,
                            )}
                            MB
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">
                            CPUs:
                          </span>
                          <span className="text-gray-900 dark:text-white">
                            {systemStatus.systemInfo.cpus}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 p-3 rounded">
                      <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                        GPU Status
                      </h4>
                      <div className="text-sm space-y-1">
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">
                            Available:
                          </span>
                          <span
                            className={`font-medium ${systemStatus.gpuInfo.available ? 'text-green-600' : 'text-red-600'}`}
                          >
                            {systemStatus.gpuInfo.available ? 'Yes' : 'No'}
                          </span>
                        </div>
                        {systemStatus.gpuInfo.vendor && (
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">
                              Vendor:
                            </span>
                            <span className="text-gray-900 dark:text-white">
                              {systemStatus.gpuInfo.vendor}
                            </span>
                          </div>
                        )}
                        {systemStatus.gpuInfo.name && (
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">
                              Name:
                            </span>
                            <span className="text-gray-900 dark:text-white">
                              {systemStatus.gpuInfo.name}
                            </span>
                          </div>
                        )}
                        {systemStatus.gpuInfo.memory && (
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">
                              Memory:
                            </span>
                            <span className="text-gray-900 dark:text-white">
                              {systemStatus.gpuInfo.memory.free}MB /{' '}
                              {systemStatus.gpuInfo.memory.total}MB
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Ollama Health */}
                  <div className="bg-white dark:bg-gray-800 p-3 rounded mb-4">
                    <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                      Ollama Health
                    </h4>
                    <div className="text-sm space-y-1">
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">
                          Status:
                        </span>
                        <span
                          className={`font-medium ${systemStatus.ollamaHealth.healthy ? 'text-green-600' : 'text-red-600'}`}
                        >
                          {systemStatus.ollamaHealth.healthy
                            ? 'Healthy'
                            : 'Unhealthy'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">
                          Reachable:
                        </span>
                        <span
                          className={`font-medium ${systemStatus.ollamaHealth.reachable ? 'text-green-600' : 'text-red-600'}`}
                        >
                          {systemStatus.ollamaHealth.reachable ? 'Yes' : 'No'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">
                          Models Available:
                        </span>
                        <span className="text-gray-900 dark:text-white">
                          {systemStatus.ollamaHealth.modelsAvailable}
                        </span>
                      </div>
                      {systemStatus.ollamaHealth.models &&
                        systemStatus.ollamaHealth.models.length > 0 && (
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">
                              Models:
                            </span>
                            <span className="text-gray-900 dark:text-white text-xs">
                              {systemStatus.ollamaHealth.models
                                .slice(0, 3)
                                .join(', ')}
                              {systemStatus.ollamaHealth.models.length > 3 &&
                                '...'}
                            </span>
                          </div>
                        )}
                      {systemStatus.ollamaHealth.responseTime && (
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">
                            Response Time:
                          </span>
                          <span className="text-gray-900 dark:text-white">
                            {systemStatus.ollamaHealth.responseTime}ms
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Monitoring Status */}
                  <div className="bg-white dark:bg-gray-800 p-3 rounded">
                    <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                      Monitoring
                    </h4>
                    <div className="text-sm space-y-1">
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">
                          Active:
                        </span>
                        <span
                          className={`font-medium ${systemStatus.isMonitoring ? 'text-green-600' : 'text-red-600'}`}
                        >
                          {systemStatus.isMonitoring ? 'Yes' : 'No'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">
                          Last Checked:
                        </span>
                        <span className="text-gray-900 dark:text-white text-xs">
                          {new Date(systemStatus.lastChecked).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              Failed to load metrics
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PerformanceDashboard;
