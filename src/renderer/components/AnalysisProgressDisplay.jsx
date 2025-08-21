import React, { useState, useEffect } from 'react';

function AnalysisProgressDisplay({
  analysisProgress,
  currentAnalysisFile,
  isAnalyzing,
  className = '',
}) {
  const [fileProgress, setFileProgress] = useState({ current: 0, total: 0 });
  const [currentFileName, setCurrentFileName] = useState('');

  // Update progress state
  useEffect(() => {
    if (analysisProgress) {
      setFileProgress({
        current: analysisProgress.current || 0,
        total: analysisProgress.total || 0,
      });
    }
  }, [analysisProgress]);

  // Update current file name
  useEffect(() => {
    if (currentAnalysisFile) {
      const fileName =
        currentAnalysisFile.split(/[/\\]/).pop() || currentAnalysisFile;
      setCurrentFileName(fileName);
    }
  }, [currentAnalysisFile]);

  // Don't render if no progress to show
  if (!isAnalyzing && fileProgress.total === 0) {
    return null;
  }

  // Only show actual progress, don't jump to 100% until truly complete
  const percent =
    fileProgress.total > 0
      ? (fileProgress.current / fileProgress.total) * 100
      : 0;

  const getStatusText = () => {
    if (!isAnalyzing) return 'Analysis complete';
    if (fileProgress.current === 0) return 'Starting analysis...';
    if (fileProgress.current >= fileProgress.total)
      return 'Finalizing results...';
    return 'Analyzing files';
  };

  const isComplete =
    !isAnalyzing &&
    fileProgress.current >= fileProgress.total &&
    fileProgress.total > 0;

  return (
    <div
      className={`bg-white border border-system-gray-200 rounded-lg p-4 ${className}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className={`w-2 h-2 rounded-full ${isComplete ? 'bg-green-500' : 'bg-blue-500'}`}
          />
          <span className="text-sm font-medium text-system-gray-900">
            {getStatusText()}
          </span>
        </div>
        {fileProgress.total > 0 && (
          <span className="text-sm text-system-gray-600 font-mono">
            {fileProgress.current}/{fileProgress.total}
          </span>
        )}
      </div>

      {/* Current file being processed */}
      {currentFileName &&
        isAnalyzing &&
        fileProgress.current < fileProgress.total && (
          <div className="text-xs text-system-gray-500 mb-2 truncate">
            {currentFileName}
          </div>
        )}

      {/* Progress bar */}
      <div className="w-full bg-system-gray-200 rounded-full h-2 overflow-hidden">
        <div
          className={`h-2 rounded-full transition-all duration-500 ease-out ${
            isComplete ? 'bg-green-500' : 'bg-blue-500'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export default AnalysisProgressDisplay;
