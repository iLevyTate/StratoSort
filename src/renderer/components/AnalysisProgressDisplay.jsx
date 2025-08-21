import React, { useState, useEffect } from 'react';
import AnimatedProgressBar from './AnimatedProgressBar';

function AnalysisProgressDisplay({
  analysisProgress,
  currentAnalysisFile,
  isAnalyzing,
  className = '',
}) {
  const [fileProgress, setFileProgress] = useState({ current: 0, total: 0 });
  const [currentFileName, setCurrentFileName] = useState('');
  const [animationPhase, setAnimationPhase] = useState('idle'); // idle, analyzing, complete

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
      // Extract just the filename from the path for cleaner display
      const fileName =
        currentAnalysisFile.split(/[/\\]/).pop() || currentAnalysisFile;
      setCurrentFileName(fileName);
    }
  }, [currentAnalysisFile]);

  // Update animation phase
  useEffect(() => {
    if (!isAnalyzing) {
      setAnimationPhase('idle');
    } else if (
      fileProgress.current >= fileProgress.total &&
      fileProgress.total > 0
    ) {
      setAnimationPhase('complete');
    } else if (fileProgress.current > 0) {
      setAnimationPhase('analyzing');
    } else {
      setAnimationPhase('idle');
    }
  }, [isAnalyzing, fileProgress]);

  // Don't render if no progress to show
  if (!isAnalyzing && fileProgress.total === 0) {
    return null;
  }

  const getStatusIcon = () => {
    switch (animationPhase) {
      case 'analyzing':
        return (
          <div className="relative">
            <div className="w-4 h-4 border-2 border-stratosort-blue border-t-transparent rounded-full animate-spin" />
            <div className="absolute inset-0 w-4 h-4 border border-stratosort-blue/20 rounded-full animate-ping" />
          </div>
        );
      case 'complete':
        return (
          <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center animate-pulse">
            <svg
              className="w-3 h-3 text-white"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        );
      default:
        return <div className="w-4 h-4 bg-system-gray-300 rounded-full" />;
    }
  };

  const getStatusText = () => {
    if (!isAnalyzing) {
      return fileProgress.total > 0 ? 'Analysis complete' : 'Ready to analyze';
    }

    if (fileProgress.current === 0) {
      return 'Preparing analysis...';
    }

    if (fileProgress.current >= fileProgress.total) {
      return 'Finalizing results...';
    }

    return `Analyzing files (${fileProgress.current}/${fileProgress.total})`;
  };

  return (
    <div
      className={`bg-white border border-system-gray-200 rounded-lg p-4 ${className}`}
    >
      <div className="flex items-start gap-3">
        {/* Status Icon */}
        <div className="mt-0.5">{getStatusIcon()}</div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Status Text */}
          <div className="text-sm font-medium text-system-gray-900 mb-2">
            {getStatusText()}
          </div>

          {/* Current File */}
          {currentFileName && isAnalyzing && (
            <div className="text-xs text-system-gray-600 mb-3 truncate">
              <span className="inline-flex items-center gap-1">
                <svg
                  className="w-3 h-3 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="truncate">{currentFileName}</span>
              </span>
            </div>
          )}

          {/* Progress Bar */}
          <AnimatedProgressBar
            current={fileProgress.current}
            total={fileProgress.total}
            size="medium"
            color={animationPhase === 'complete' ? 'green' : 'blue'}
            showPercentage={true}
            showFraction={true}
            animated={true}
            className="mb-2"
          />

          {/* Additional Progress Details */}
          {isAnalyzing && fileProgress.total > 0 && (
            <div className="flex items-center justify-between text-xs text-system-gray-500">
              <span>
                {fileProgress.current > 0
                  ? `${fileProgress.current} of ${fileProgress.total} files processed`
                  : `${fileProgress.total} files queued for analysis`}
              </span>

              {/* Estimated time remaining (simple calculation) */}
              {fileProgress.current > 0 &&
                fileProgress.current < fileProgress.total && (
                  <span className="flex items-center gap-1">
                    <svg
                      className="w-3 h-3"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {Math.ceil(
                      (fileProgress.total - fileProgress.current) * 0.5,
                    )}{' '}
                    min remaining
                  </span>
                )}
            </div>
          )}
        </div>
      </div>

      {/* Subtle background animation when analyzing */}
      {isAnalyzing && (
        <div className="absolute inset-0 bg-gradient-to-r from-stratosort-blue/5 via-transparent to-stratosort-blue/5 animate-pulse rounded-lg pointer-events-none" />
      )}
    </div>
  );
}

export default AnalysisProgressDisplay;
