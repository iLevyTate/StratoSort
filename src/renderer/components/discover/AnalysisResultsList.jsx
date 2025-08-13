import React from 'react';

function AnalysisResultsList({ results = [], onFileAction, getFileStateDisplay }) {
  if (!Array.isArray(results) || results.length === 0) return null;
  return (
    <div className="space-y-fib-8">
      {results.map((file, index) => {
        const stateDisplay = getFileStateDisplay(file.path, !!file.analysis);
        return (
          <div key={index} className="border rounded-lg p-fib-13">
            <div className="flex items-start gap-fib-13">
              <div className="text-2xl">📄</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-system-gray-900 truncate">{file.name}</div>
                <div className="text-xs text-system-gray-500">{file.source?.replace('_', ' ')}{file.size ? ` • ${Math.round(file.size / 1024)} KB` : ''}</div>
                {file.analysis?.category && (
                  <div className="text-xs text-system-gray-600 mt-fib-3">Category: <span className="text-stratosort-blue">{file.analysis.category}</span></div>
                )}
              </div>
              <div className={`text-sm font-medium flex items-center gap-fib-3 ${stateDisplay.color}`}>
                <span className={stateDisplay.spinning ? 'animate-spin' : ''}>{stateDisplay.icon}</span>
                <span>{stateDisplay.label}</span>
              </div>
            </div>
            <div className="flex items-center gap-fib-8 mt-fib-8">
              <button onClick={() => onFileAction('open', file.path)} className="text-blue-600 hover:underline text-sm">Open</button>
              <button onClick={() => onFileAction('reveal', file.path)} className="text-blue-600 hover:underline text-sm">Reveal</button>
              <button onClick={() => onFileAction('delete', file.path)} className="text-system-red-600 hover:underline text-sm">Delete</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default AnalysisResultsList;


