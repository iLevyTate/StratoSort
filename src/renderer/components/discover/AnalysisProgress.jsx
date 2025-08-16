import React from 'react';

function AnalysisProgress({
  progress = { current: 0, total: 0 },
  currentFile = '',
}) {
  const percent =
    progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;
  return (
    <div className="mt-13 p-13 bg-blue-50 border border-blue-200 rounded-lg">
      <div className="flex items-center gap-8 mb-8">
        <div className="animate-spin w-13 h-13 border-2 border-blue-500 border-t-transparent rounded-full"></div>
        <div className="text-sm font-medium text-blue-700">
          Analyzing {progress.current} of {progress.total}
        </div>
      </div>
      {progress.total > 0 && (
        <div className="mb-5">
          <div className="w-full bg-system-gray-200 rounded-full h-5">
            <div
              className="bg-stratosort-blue h-5 rounded-full transition-all duration-300"
              style={{ width: `${percent}%` }}
            ></div>
          </div>
          {currentFile && (
            <div className="text-xs text-system-gray-500 mt-3 truncate">
              {currentFile}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AnalysisProgress;
