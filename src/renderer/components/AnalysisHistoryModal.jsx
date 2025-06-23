import React, { useState, useEffect } from 'react';

import LoadingSkeleton from './LoadingSkeleton';
import Modal from './Modal';

/**
 * Analysis History Modal Component
 * Extracted from DiscoverPhase to reduce component complexity
 */
function AnalysisHistoryModal({ onClose, analysisStats, setAnalysisStats }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Load analysis data on mount
  const loadAnalysisData = async () => {
    try {
      const [stats, history] = await Promise.all([
        window.electronAPI.analysisHistory.getStatistics(),
        window.electronAPI.analysisHistory.get({ limit: 50 })
      ]);
      
      setAnalysisStats(stats);
      setSearchResults(history);
    } catch (error) {
      console.error('Failed to load analysis data:', error);
    }
  };

  useEffect(() => {
    loadAnalysisData();
  }, [setAnalysisStats]);

  // Search history
  const searchHistory = async () => {
    if (!searchQuery.trim()) {
      await loadAnalysisData();
      return;
    }

    setIsSearching(true);
    try {
      const results = await window.electronAPI.analysisHistory.search(searchQuery, { limit: 50 });
      setSearchResults(results);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  };

  // Export history
  const exportHistory = async (format) => {
    try {
      await window.electronAPI.analysisHistory.export(format);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Analysis History"
      className="max-w-4xl"
    >
      <div className="space-y-6">
        {/* Statistics Section */}
        {analysisStats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="glass-card p-4">
              <h3 className="font-semibold text-on-glass">Total Analyses</h3>
              <p className="text-2xl font-bold text-blue-600">{analysisStats.totalAnalyses}</p>
            </div>
            <div className="glass-card p-4">
              <h3 className="font-semibold text-on-glass">Success Rate</h3>
              <p className="text-2xl font-bold text-green-600">
                {((analysisStats.successfulAnalyses / analysisStats.totalAnalyses) * 100).toFixed(1)}%
              </p>
            </div>
            <div className="glass-card p-4">
              <h3 className="font-semibold text-on-glass">Avg. Processing Time</h3>
              <p className="text-2xl font-bold text-purple-600">
                {(analysisStats.averageProcessingTime / 1000).toFixed(1)}s
              </p>
            </div>
          </div>
        )}

        {/* Search Section */}
        <div className="flex gap-4">
          <div className="flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files..."
              className="glass-input w-full"
            />
          </div>
          <button
            onClick={searchHistory}
            disabled={isSearching}
            className="glass-button-primary px-6 py-2 disabled:opacity-50"
          >
            {isSearching ? 'Searching...' : 'Search'}
          </button>
        </div>

        {/* Export Section */}
        <div className="flex gap-2">
          <button
            onClick={() => exportHistory('json')}
            className="glass-button px-4 py-2"
          >
            Export JSON
          </button>
          <button
            onClick={() => exportHistory('csv')}
            className="glass-button px-4 py-2"
          >
            Export CSV
          </button>
        </div>

        {/* Results Section */}
        <div className="max-h-96 overflow-y-auto glass-scroll">
          {isSearching ? (
            <LoadingSkeleton count={5} />
          ) : searchResults.length > 0 ? (
            <div className="space-y-3">
              {searchResults.map((result, index) => (
                <div key={index} className="glass-card p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-semibold text-on-glass">{result.fileName}</h4>
                    <span className="text-sm text-readable-light">
                      {new Date(result.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-readable-light mb-2">{result.filePath}</p>
                  {result.analysis && (
                    <div className="text-sm text-readable">
                      <p><strong>Category:</strong> {result.analysis.suggestedCategory}</p>
                      <p><strong>Suggested Name:</strong> {result.analysis.suggestedName}</p>
                      {result.analysis.keywords && (
                        <p><strong>Keywords:</strong> {result.analysis.keywords.join(', ')}</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-readable-light">
              <p>No analysis history found</p>
              {searchQuery && (
                <p className="text-sm mt-2">Try adjusting your search terms</p>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default AnalysisHistoryModal; 