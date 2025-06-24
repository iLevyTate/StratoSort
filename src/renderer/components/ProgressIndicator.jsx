import React, { useState, useEffect } from 'react';
import { useProgress } from '../contexts/ProgressContext';

const ProgressIndicator = () => {
  const { progress, isVisible } = useProgress();
  const [timeEstimate, setTimeEstimate] = useState(null);
  const [startTime, setStartTime] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Calculate time estimates based on progress
  useEffect(() => {
    if (progress.current > 0 && progress.total > 0) {
      if (!startTime) {
        setStartTime(Date.now());
      }
      
      const currentTime = Date.now();
      const elapsed = Math.floor((currentTime - (startTime || currentTime)) / 1000);
      setElapsedTime(elapsed);
      
      if (elapsed > 3 && progress.current > 1) { // Wait for meaningful data
        const progressPercent = progress.current / progress.total;
        const estimatedTotal = elapsed / progressPercent;
        const remaining = estimatedTotal - elapsed;
        
        setTimeEstimate({
          remaining: Math.max(0, Math.floor(remaining)),
          total: Math.floor(estimatedTotal)
        });
      }
    } else {
      setStartTime(null);
      setTimeEstimate(null);
      setElapsedTime(0);
    }
  }, [progress.current, progress.total, startTime]);

  // Format time for display
  const formatTime = (seconds) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  // Calculate progress percentage
  const progressPercent = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;
  const isIndeterminate = progress.total === 0 || progress.current === 0;

  if (!isVisible || (!progress.message && progressPercent === 0)) {
    return null;
  }

  return (
    <div 
      className="glass-card border-0 shadow-sm backdrop-blur-md bg-white/20 progress-container"
      role="progressbar"
      aria-valuenow={isIndeterminate ? undefined : progress.current}
      aria-valuemin="0"
      aria-valuemax={isIndeterminate ? undefined : progress.total}
      aria-valuetext={progress.message || `${Math.round(progressPercent)}% complete`}
      aria-live="polite"
      aria-atomic="false"
    >
      <div className="px-4 py-2">
        <div className="flex items-center justify-between gap-4">
          {/* Progress Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {/* Status Icon */}
              <div className="flex-shrink-0">
                {isIndeterminate ? (
                  <div 
                    className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"
                    aria-hidden="true"
                  />
                ) : progressPercent === 100 ? (
                  <span className="text-green-500 text-sm" aria-hidden="true">✅</span>
                ) : (
                  <span className="text-blue-500 text-sm animate-pulse" aria-hidden="true">⏳</span>
                )}
              </div>

              {/* Progress Message */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-on-glass truncate">
                  {progress.message || 'Processing...'}
                </p>
              </div>

              {/* Progress Stats */}
              <div className="flex-shrink-0 text-xs text-readable-light">
                {!isIndeterminate && (
                  <span className="font-mono">
                    {progress.current} / {progress.total}
                  </span>
                )}
              </div>
            </div>

            {/* Progress Bar */}
            <div className="relative">
              <div className="w-full bg-gray-200/50 rounded-full h-2 overflow-hidden">
                {isIndeterminate ? (
                  <div 
                    className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full animate-pulse"
                    style={{
                      width: '40%',
                      animation: 'indeterminate 2s ease-in-out infinite'
                    }}
                    aria-hidden="true"
                  />
                ) : (
                  <div 
                    className={`h-full rounded-full transition-all duration-300 ease-out ${
                      progressPercent === 100 
                        ? 'bg-gradient-to-r from-green-400 to-green-600' 
                        : 'bg-gradient-to-r from-blue-400 to-blue-600'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
                    aria-hidden="true"
                  />
                )}
              </div>

              {/* Progress Percentage */}
              {!isIndeterminate && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-bold text-white drop-shadow-sm">
                    {Math.round(progressPercent)}%
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Time Information */}
          {(timeEstimate || elapsedTime > 0) && (
            <div className="flex-shrink-0 text-right">
              <div className="text-xs text-readable-light space-y-1">
                {elapsedTime > 0 && (
                  <div className="flex items-center gap-1">
                    <span aria-hidden="true">⏱️</span>
                    <span>Elapsed: {formatTime(elapsedTime)}</span>
                  </div>
                )}
                
                {timeEstimate && timeEstimate.remaining > 0 && (
                  <div className="flex items-center gap-1">
                    <span aria-hidden="true">⏰</span>
                    <span>
                      {timeEstimate.remaining < 60 
                        ? `~${formatTime(timeEstimate.remaining)} left`
                        : `~${formatTime(timeEstimate.remaining)} remaining`
                      }
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Current File/Operation Details */}
        {progress.currentFile && (
          <div className="mt-2 pt-2 border-t border-glass-border">
            <div className="flex items-center gap-2 text-xs text-readable-light">
              <span aria-hidden="true">📄</span>
              <span className="truncate flex-1">
                Currently processing: {progress.currentFile}
              </span>
            </div>
          </div>
        )}

        {/* Speed/Rate Information */}
        {!isIndeterminate && elapsedTime > 10 && progress.current > 5 && (
          <div className="mt-1 text-xs text-readable-light">
            <span className="flex items-center gap-1">
              <span aria-hidden="true">📊</span>
              Rate: ~{Math.round(progress.current / elapsedTime * 60)} items/min
            </span>
          </div>
        )}
      </div>

      <style>{`
        @keyframes indeterminate {
          0% {
            transform: translateX(-100%);
          }
          50% {
            transform: translateX(0%);
          }
          100% {
            transform: translateX(100%);
          }
        }
        
        .progress-container {
          transition: all 0.3s ease-in-out;
        }
        
        @media (prefers-reduced-motion: reduce) {
          .animate-spin,
          .animate-pulse {
            animation: none;
          }
          
          .progress-container {
            transition: none;
          }
        }
      `}</style>
    </div>
  );
};

export default ProgressIndicator;
