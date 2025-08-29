import React, { useState, useEffect } from 'react';
// Use the preload-provided legacy compatibility layer or context bridge
const ipcRenderer = (typeof window !== 'undefined' &&
  window.electron &&
  window.electron.ipcRenderer) || {
  invoke: async () => {
    throw new Error(
      'IPC not available in renderer. Use window.electronAPI or enable preload.',
    );
  },
};

const LogViewer = ({ isOpen, onClose }) => {
  const useIsMounted = require('../hooks/useIsMounted').default;
  const mounted = useIsMounted();

  const [selectedType, setSelectedType] = useState('all');
  const [logFilesRaw, setLogFilesRaw] = useState([]);
  const logFiles = logFilesRaw;
  const setLogFiles = (v) => mounted.current && setLogFilesRaw(v);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContentRaw, setFileContentRaw] = useState('');
  const fileContent = fileContentRaw;
  const setFileContent = (v) => mounted.current && setFileContentRaw(v);
  const [recentLogsRaw, setRecentLogsRaw] = useState([]);
  const recentLogs = recentLogsRaw;
  const setRecentLogs = (v) => mounted.current && setRecentLogsRaw(v);
  const [logStatsRaw, setLogStatsRaw] = useState(null);
  const logStats = logStatsRaw;
  const setLogStats = (v) => mounted.current && setLogStatsRaw(v);
  const [loadingRaw, setLoadingRaw] = useState(false);
  const loading = loadingRaw;
  const setLoading = (v) => mounted.current && setLoadingRaw(v);
  const [searchTerm, setSearchTerm] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);

  const logTypes = [
    { value: 'all', label: 'All Logs' },
    { value: 'performance', label: 'Performance' },
    { value: 'actions', label: 'User Actions' },
    { value: 'errors', label: 'Errors' },
    { value: 'ollama', label: 'Ollama Calls' },
  ];

  const fetchLogFiles = async (type = selectedType) => {
    try {
      const result = await window.electronAPI.system.getLogFiles(type);
      if (result && result.success) {
        // Defensive: ensure files is an array
        setLogFiles(Array.isArray(result.files) ? result.files : []);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to fetch log files:', error);
    }
  };

  const fetchRecentLogs = async (type = selectedType) => {
    if (type === 'all') return;

    try {
      const result = await window.electronAPI.system.getRecentLogs(type, 200);
      if (result.success) {
        setRecentLogs(result.logs);
      }
    } catch (error) {
      console.error('Failed to fetch recent logs:', error);
    }
  };

  const fetchLogStats = async () => {
    try {
      const result = await window.electronAPI.system.getLogStats();
      if (result.success) {
        setLogStats(result.stats);
      }
    } catch (error) {
      console.error('Failed to fetch log stats:', error);
    }
  };

  const loadFileContent = async (file) => {
    setLoading(true);
    try {
      const result = await window.electronAPI.system.readLogFile(
        file.type || selectedType,
        file.filename,
      );
      if (result.success) {
        setFileContent(result.content);
        setSelectedFile(file);
      }
    } catch (error) {
      console.error('Failed to load file content:', error);
      setFileContent('Error loading file content');
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  const filteredLogs = recentLogsRaw.filter((log) => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      log.message?.toLowerCase().includes(searchLower) ||
      log.type?.toLowerCase().includes(searchLower) ||
      JSON.stringify(log.data || {})
        .toLowerCase()
        .includes(searchLower)
    );
  });

  useEffect(() => {
    if (isOpen) {
      fetchLogFiles();
      fetchLogStats();
      if (selectedType !== 'all') {
        fetchRecentLogs();
      }
    }
  }, [isOpen, selectedType]);

  useEffect(() => {
    if (!autoRefresh || !isOpen) return;

    const interval = setInterval(() => {
      if (selectedType !== 'all') {
        fetchRecentLogs();
      }
      fetchLogStats();
    }, 5000);

    return () => clearInterval(interval);
  }, [autoRefresh, isOpen, selectedType]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-7xl w-full mx-4 max-h-[95vh] overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Log Viewer
          </h2>
          <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Auto-refresh
              </span>
            </label>
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

        <div className="flex h-[calc(95vh-80px)]">
          {/* Sidebar */}
          <div className="w-80 border-r dark:border-gray-700 p-4 overflow-y-auto">
            <div className="space-y-4">
              {/* Log Type Selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Log Type
                </label>
                <select
                  value={selectedType}
                  onChange={(e) => {
                    setSelectedType(e.target.value);
                    setSelectedFile(null);
                    setFileContent('');
                  }}
                  className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                >
                  {logTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Log Statistics */}
              {logStats && (
                <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                    Statistics
                  </h4>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">
                        Total Files:
                      </span>
                      <span className="text-gray-900 dark:text-white">
                        {logStats.totalFiles}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">
                        Total Size:
                      </span>
                      <span className="text-gray-900 dark:text-white">
                        {formatFileSize(logStats.totalSize)}
                      </span>
                    </div>
                    {Object.entries(logStats.byType).map(([type, data]) => (
                      <div key={type} className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400 capitalize">
                          {type}:
                        </span>
                        <span className="text-gray-900 dark:text-white">
                          {data.fileCount} files ({formatFileSize(data.size)})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Log Files List */}
              {selectedType !== 'all' && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                    Log Files ({logFiles.length})
                  </h4>
                  <div className="space-y-1 max-h-96 overflow-y-auto">
                    {logFiles.map((file) => (
                      <button
                        key={file.filename}
                        onClick={() => loadFileContent(file)}
                        className={`w-full text-left px-3 py-2 rounded text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                          selectedFile?.filename === file.filename
                            ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                            : 'text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        <div className="font-mono text-xs">{file.filename}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-500">
                          {file.date}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 p-4 overflow-y-auto">
            {selectedType === 'all' ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <p>Select a specific log type to view recent entries</p>
                <p className="text-sm mt-2">
                  Choose from Performance, Actions, Errors, or Ollama Calls
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Search */}
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    placeholder="Search logs..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="flex-1 px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {filteredLogs.length} entries
                  </span>
                </div>

                {/* File Content or Recent Logs */}
                {selectedFile ? (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {selectedFile.filename}
                      </h3>
                      <button
                        onClick={() => {
                          setSelectedFile(null);
                          setFileContent('');
                        }}
                        className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        ← Back to Recent Logs
                      </button>
                    </div>
                    {loading ? (
                      <div className="flex justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                      </div>
                    ) : (
                      <pre className="bg-gray-50 dark:bg-gray-700 p-4 rounded text-sm font-mono overflow-x-auto max-h-96 whitespace-pre-wrap">
                        {fileContent}
                      </pre>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Recent {selectedType} Logs
                    </h3>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {filteredLogs.map((log, index) => {
                        const key = `${log.timestamp}-${index}`;
                        return (
                          <div
                            key={key}
                            className="bg-gray-50 dark:bg-gray-700 p-3 rounded border-l-4 border-blue-500"
                          >
                            <div className="flex justify-between items-start mb-2">
                              <span className="text-sm font-medium text-gray-900 dark:text-white">
                                {log.message || log.raw}
                              </span>
                              <span className="text-xs text-gray-500 dark:text-gray-500">
                                {formatTimestamp(log.timestamp)}
                              </span>
                            </div>
                            {log.data && Object.keys(log.data).length > 0 && (
                              <div className="text-xs text-gray-600 dark:text-gray-400 font-mono bg-gray-100 dark:bg-gray-800 p-2 rounded">
                                {JSON.stringify(log.data, null, 2)}
                              </div>
                            )}
                            <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                              {log.hostname} • PID {log.pid}
                            </div>
                          </div>
                        );
                      })}
                      {filteredLogs.length === 0 && (
                        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                          {searchTerm
                            ? 'No logs match your search'
                            : 'No recent logs found'}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LogViewer;
