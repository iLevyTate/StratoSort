import React from 'react';

function OrganizeProgress({ isOrganizing, batchProgress }) {
  if (!isOrganizing) return null;
  const percent = batchProgress.total > 0 ? Math.round((batchProgress.current / batchProgress.total) * 100) : 0;
  return (
    <div className="py-fib-13">
      <div className="flex items-center justify-center gap-fib-8 text-stratosort-blue mb-fib-8">
        <div className="animate-spin w-fib-21 h-fib-21 border-3 border-stratosort-blue border-t-transparent rounded-full"></div>
        <span className="text-lg font-medium">Organizing Files...</span>
      </div>
      {batchProgress.total > 0 && (
        <div className="mb-fib-8">
          <div className="flex justify-between text-sm text-system-gray-600 mb-fib-3">
            <span>Progress: {batchProgress.current} of {batchProgress.total}</span>
            <span>{percent}%</span>
          </div>
          <div className="w-full bg-system-gray-200 rounded-full h-fib-5">
            <div className="bg-stratosort-blue h-fib-5 rounded-full transition-all duration-300" style={{ width: `${percent}%` }}></div>
          </div>
          {batchProgress.currentFile && (
            <div className="text-xs text-system-gray-500 mt-fib-3 truncate">Currently processing: {batchProgress.currentFile}</div>
          )}
        </div>
      )}
      <p className="text-sm text-system-gray-600">Please wait while your files are being organized</p>
    </div>
  );
}

export default OrganizeProgress;


