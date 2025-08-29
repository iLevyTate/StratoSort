import React, { useState, useEffect, useRef, useCallback } from 'react';

const ITEM_HEIGHT = 120; // Estimated height of each file item
const BUFFER_SIZE = 5; // Number of items to render outside viewport
const CONTAINER_HEIGHT = 600; // Fixed height for the virtualized container

function VirtualizedFileItem({
  file,
  index,
  style,
  onFileAction,
  getFileStateDisplay,
}) {
  const stateDisplay = getFileStateDisplay(file.path, !!file.analysis);

  return (
    <div style={style} className="border rounded-lg p-13">
      <div className="flex items-start gap-13">
        <div className="text-2xl">📄</div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-system-gray-900 truncate">
            {file.name}
          </div>
          <div className="text-xs text-system-gray-500">
            {file.source?.replace('_', ' ')}
            {file.size ? ` • ${Math.round(file.size / 1024)} KB` : ''}
          </div>
          {file.analysis?.category && (
            <div className="text-xs text-system-gray-600 mt-3">
              Category:{' '}
              <span className="text-stratosort-blue">
                {file.analysis.category}
              </span>
            </div>
          )}
        </div>
        <div
          className={`text-sm font-medium flex items-center gap-3 ${stateDisplay.color}`}
        >
          <span className={stateDisplay.spinning ? 'animate-spin' : ''}>
            {stateDisplay.icon}
          </span>
          <span>{stateDisplay.label}</span>
        </div>
      </div>
      <div className="flex items-center gap-8 mt-8">
        <button
          onClick={() => onFileAction('open', file.path)}
          className="text-blue-600 hover:underline text-sm"
        >
          Open
        </button>
        <button
          onClick={() => onFileAction('reveal', file.path)}
          className="text-blue-600 hover:underline text-sm"
        >
          Reveal
        </button>
        <button
          onClick={() => onFileAction('delete', file.path)}
          className="text-system-red-600 hover:underline text-sm"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function AnalysisResultsList({
  results = [],
  onFileAction,
  getFileStateDisplay,
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(CONTAINER_HEIGHT);
  const containerRef = useRef(null);

  const handleScroll = useCallback((e) => {
    setScrollTop(e.target.scrollTop);
  }, []);

  // Calculate visible range
  const startIndex = Math.max(
    0,
    Math.floor(scrollTop / ITEM_HEIGHT) - BUFFER_SIZE,
  );
  const endIndex = Math.min(
    results.length - 1,
    Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + BUFFER_SIZE,
  );

  // Get visible items
  const visibleItems = results.slice(startIndex, endIndex + 1);

  // Calculate total height
  const totalHeight = results.length * ITEM_HEIGHT;

  if (!Array.isArray(results) || results.length === 0) {
    return (
      <div className="text-center text-system-gray-500 py-8">
        No files to display
      </div>
    );
  }

  // Use regular rendering for small lists to avoid virtualization overhead
  if (results.length <= 20) {
    return (
      <div className="space-y-8 overflow-x-auto">
        {results.map((file, index) => {
          const stateDisplay = getFileStateDisplay(file.path, !!file.analysis);
          return (
            <div key={file.path} className="border rounded-lg p-13">
              <div className="flex items-start gap-13">
                <div className="text-2xl">📄</div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-system-gray-900 truncate">
                    {file.name}
                  </div>
                  <div className="text-xs text-system-gray-500">
                    {file.source?.replace('_', ' ')}
                    {file.size ? ` • ${Math.round(file.size / 1024)} KB` : ''}
                  </div>
                  {file.analysis?.category && (
                    <div className="text-xs text-system-gray-600 mt-3">
                      Category:{' '}
                      <span className="text-stratosort-blue">
                        {file.analysis.category}
                      </span>
                    </div>
                  )}
                </div>
                <div
                  className={`text-sm font-medium flex items-center gap-3 ${stateDisplay.color}`}
                >
                  <span className={stateDisplay.spinning ? 'animate-spin' : ''}>
                    {stateDisplay.icon}
                  </span>
                  <span>{stateDisplay.label}</span>
                </div>
              </div>
              <div className="flex items-center gap-8 mt-8">
                <button
                  onClick={() => onFileAction('open', file.path)}
                  className="text-blue-600 hover:underline text-sm"
                >
                  Open
                </button>
                <button
                  onClick={() => onFileAction('reveal', file.path)}
                  className="text-blue-600 hover:underline text-sm"
                >
                  Reveal
                </button>
                <button
                  onClick={() => onFileAction('delete', file.path)}
                  className="text-system-red-600 hover:underline text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Info about virtualization for large lists */}
      <div className="text-xs text-system-gray-500 mb-4">
        Showing {results.length} files (virtualized for performance)
      </div>

      {/* Virtualized container */}
      <div
        ref={containerRef}
        className="overflow-y-auto border rounded-lg"
        style={{ height: containerHeight }}
        onScroll={handleScroll}
      >
        <div style={{ height: totalHeight, position: 'relative' }}>
          {visibleItems.map((file, index) => {
            const actualIndex = startIndex + index;
            return (
              <VirtualizedFileItem
                key={file.path}
                file={file}
                index={actualIndex}
                style={{
                  position: 'absolute',
                  top: actualIndex * ITEM_HEIGHT,
                  width: '100%',
                  height: ITEM_HEIGHT,
                }}
                onFileAction={onFileAction}
                getFileStateDisplay={getFileStateDisplay}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default AnalysisResultsList;
