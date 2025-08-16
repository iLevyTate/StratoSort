import React, { useEffect, useState } from 'react';
import { useNotification } from '../contexts/NotificationContext';
import Button from './ui/Button';
import Input from './ui/Input';

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
        window.electronAPI.analysisHistory.get({ all: true }),
      ]);
      setAnalysisStats(stats);
      setHistoryData(history);
    } catch (error) {
      addNotification('Failed to load analysis history', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const searchHistory = async () => {
    if (!searchQuery.trim()) return;
    try {
      const results = await window.electronAPI.analysisHistory.search(
        searchQuery,
        { limit: 200 },
      );
      setHistoryData(results);
    } catch (error) {
      addNotification('Search failed', 'error');
    }
  };

  const exportHistory = async (format) => {
    try {
      await window.electronAPI.analysisHistory.export(format);
      addNotification(
        `Analysis history exported as ${format.toUpperCase()}`,
        'success',
      );
    } catch (error) {
      addNotification('Export failed', 'error');
    }
  };

  const getDestinationLabel = (entry) => {
    try {
      const actual = entry?.organization?.actual;
      if (actual && typeof actual === 'string') {
        const normalized = actual.replace(/\\+/g, '/');
        const segments = normalized.split('/').filter(Boolean);
        if (segments.length > 1) {
          const last = segments[segments.length - 1];
          const isFile = /\.[A-Za-z0-9]+$/.test(last);
          const folder = isFile ? segments[segments.length - 2] : last;
          if (folder) return folder;
        }
      }
      if (entry?.organization?.smartFolder)
        return entry.organization.smartFolder;
      if (entry?.analysis?.category) return entry.analysis.category;
    } catch {}
    return 'Uncategorized';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-21 max-h-[90vh] overflow-hidden">
        <div className="p-21 border-b border-system-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-system-gray-900">
              📊 Analysis History & Statistics
            </h2>
            <button
              onClick={onClose}
              className="text-system-gray-500 hover:text-system-gray-700"
            >
              ✕
            </button>
          </div>
          <div className="flex mt-13 border-b border-system-gray-200">
            <button
              onClick={() => setSelectedTab('statistics')}
              className={`px-13 py-8 text-sm font-medium border-b-2 ${selectedTab === 'statistics' ? 'border-stratosort-blue text-stratosort-blue' : 'border-transparent text-system-gray-500 hover:text-system-gray-700'}`}
            >
              📈 Statistics
            </button>
            <button
              onClick={() => setSelectedTab('history')}
              className={`px-13 py-8 text-sm font-medium border-b-2 ${selectedTab === 'history' ? 'border-stratosort-blue text-stratosort-blue' : 'border-transparent text-system-gray-500 hover:text-system-gray-700'}`}
            >
              📋 History
            </button>
          </div>
        </div>
        <div className="p-21 overflow-y-auto max-h-[70vh]">
          {isLoading ? (
            <div className="text-center py-21">
              <div className="animate-spin w-21 h-21 border-3 border-stratosort-blue border-t-transparent rounded-full mx-auto mb-8"></div>
              <p>Loading analysis data...</p>
            </div>
          ) : (
            <>
              {selectedTab === 'statistics' && analysisStats && (
                <div className="space-y-21">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-13">
                    <div className="bg-surface-primary rounded-xl border border-border-light shadow-sm p-21 text-center">
                      <div className="text-2xl font-bold text-stratosort-blue">
                        {analysisStats.totalFiles || 0}
                      </div>
                      <div className="text-sm text-system-gray-600">
                        Total Files
                      </div>
                    </div>
                    <div className="bg-surface-primary rounded-xl border border-border-light shadow-sm p-21 text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {Math.round(analysisStats.averageConfidence || 0)}%
                      </div>
                      <div className="text-sm text-system-gray-600">
                        Avg Confidence
                      </div>
                    </div>
                    <div className="bg-surface-primary rounded-xl border border-border-light shadow-sm p-21 text-center">
                      <div className="text-2xl font-bold text-purple-600">
                        {analysisStats.categoriesCount || 0}
                      </div>
                      <div className="text-sm text-system-gray-600">
                        Categories
                      </div>
                    </div>
                    <div className="bg-surface-primary rounded-xl border border-border-light shadow-sm p-21 text-center">
                      <div className="text-2xl font-bold text-orange-600">
                        {Math.round(analysisStats.averageProcessingTime || 0)}ms
                      </div>
                      <div className="text-sm text-system-gray-600">
                        Avg Time
                      </div>
                    </div>
                  </div>
                  <div className="bg-surface-primary rounded-xl border border-border-light shadow-sm p-21">
                    <h3 className="font-semibold mb-8">📤 Export Options</h3>
                    <div className="flex gap-8">
                      <Button
                        onClick={() => exportHistory('json')}
                        variant="outline"
                        className="text-sm"
                      >
                        Export JSON
                      </Button>
                      <Button
                        onClick={() => exportHistory('csv')}
                        variant="outline"
                        className="text-sm"
                      >
                        Export CSV
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              {selectedTab === 'history' && (
                <div className="space-y-13">
                  <div className="flex gap-8">
                    <Input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search analysis history..."
                      className="flex-1"
                      onKeyDown={(e) => e.key === 'Enter' && searchHistory()}
                    />
                    <Button onClick={searchHistory} variant="primary">
                      Search
                    </Button>
                    <Button onClick={loadAnalysisData} variant="outline">
                      Reset
                    </Button>
                  </div>
                  <div className="space-y-8">
                    {historyData.map((entry, index) => (
                      <div
                        key={index}
                        className="bg-surface-primary rounded-xl border border-border-light shadow-sm p-21"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="font-medium text-system-gray-900">
                              {entry.fileName || 'Unknown File'}
                            </div>
                            <div className="text-sm text-system-gray-600 mt-3">
                              <span className="text-stratosort-blue">
                                {getDestinationLabel(entry)}
                              </span>
                              {(entry?.analysis?.confidence ||
                                entry?.confidence) && (
                                <span className="ml-8">
                                  Confidence:{' '}
                                  {entry?.analysis?.confidence ??
                                    entry?.confidence}
                                  %
                                </span>
                              )}
                            </div>
                            {entry.keywords && entry.keywords.length > 0 && (
                              <div className="flex flex-wrap gap-3 mt-5">
                                {entry.keywords
                                  .slice(0, 5)
                                  .map((keyword, i) => (
                                    <span
                                      key={i}
                                      className="text-xs bg-stratosort-blue/10 text-stratosort-blue px-3 py-1 rounded-full"
                                    >
                                      {keyword}
                                    </span>
                                  ))}
                              </div>
                            )}
                            {!entry.keywords &&
                              entry?.analysis?.tags &&
                              entry.analysis.tags.length > 0 && (
                                <div className="flex flex-wrap gap-3 mt-5">
                                  {entry.analysis.tags
                                    .slice(0, 5)
                                    .map((tag, i) => (
                                      <span
                                        key={i}
                                        className="text-xs bg-stratosort-blue/10 text-stratosort-blue px-3 py-1 rounded-full"
                                      >
                                        {tag}
                                      </span>
                                    ))}
                                </div>
                              )}
                          </div>
                          <div className="text-xs text-system-gray-500">
                            {entry.timestamp
                              ? new Date(entry.timestamp).toLocaleDateString()
                              : 'Unknown Date'}
                          </div>
                        </div>
                      </div>
                    ))}
                    {historyData.length === 0 && (
                      <div className="text-center py-21 text-system-gray-500">
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

export default AnalysisHistoryModal;
