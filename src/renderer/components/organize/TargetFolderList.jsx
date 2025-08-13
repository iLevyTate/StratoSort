import React from 'react';

function TargetFolderList({ folders = [], defaultLocation = 'Documents' }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-fib-8">
      {folders.map(folder => (
        <div key={folder.id} className="p-fib-13 bg-surface-secondary rounded-lg border border-stratosort-blue/20">
          <div className="font-medium text-system-gray-900 mb-fib-2">{folder.name}</div>
          <div className="text-sm text-system-gray-600 mb-fib-3">📂 {folder.path || `${defaultLocation}/${folder.name}`}</div>
          {folder.description && (
            <div className="text-xs text-system-gray-500 bg-stratosort-blue/5 p-fib-5 rounded italic">"{folder.description}"</div>
          )}
        </div>
      ))}
    </div>
  );
}

export default TargetFolderList;


