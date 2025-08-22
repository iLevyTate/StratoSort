import React, { useState, useEffect, useRef } from 'react';
import { ReadyFileItem } from './';

function AnimatedFileList({
  unprocessedFiles = [],
  getFileWithEdits,
  editingFiles,
  selectedFiles,
  toggleFileSelection,
  getFileStateDisplay,
  smartFolders,
  handleEditFile,
  findSmartFolderForCategory,
  defaultLocation,
}) {
  const [displayedFiles, setDisplayedFiles] = useState([]);
  const [animatingFiles, setAnimatingFiles] = useState(new Set());
  const previousCountRef = useRef(0);

  // Animate new files as they appear
  useEffect(() => {
    if (unprocessedFiles.length > displayedFiles.length) {
      const newFiles = unprocessedFiles.slice(displayedFiles.length);

      newFiles.forEach((file, index) => {
        const globalIndex = displayedFiles.length + index;
        const delay = index * 300; // Stagger animations by 300ms

        setTimeout(() => {
          // Add file with animation
          setAnimatingFiles((prev) => new Set(prev).add(globalIndex));
          setDisplayedFiles((prev) => [...prev, file]);

          // Remove animation class after animation completes
          setTimeout(() => {
            setAnimatingFiles((prev) => {
              const newSet = new Set(prev);
              newSet.delete(globalIndex);
              return newSet;
            });
          }, 600); // Animation duration
        }, delay);
      });
    }

    // Handle file removal (if files are removed from unprocessedFiles)
    if (unprocessedFiles.length < displayedFiles.length) {
      setDisplayedFiles(unprocessedFiles);
      setAnimatingFiles(new Set());
    }

    previousCountRef.current = unprocessedFiles.length;
  }, [unprocessedFiles.length, displayedFiles.length]);

  // Reset when analysis restarts
  useEffect(() => {
    if (unprocessedFiles.length === 0 && displayedFiles.length > 0) {
      setDisplayedFiles([]);
      setAnimatingFiles(new Set());
    }
  }, [unprocessedFiles.length, displayedFiles.length]);

  return (
    <div className="space-y-8">
      {displayedFiles.map((file, index) => {
        const fileWithEdits = getFileWithEdits(file, index);
        const currentCategory =
          editingFiles[index]?.category || fileWithEdits.analysis?.category;
        const smartFolder = findSmartFolderForCategory(currentCategory);
        const isSelected = selectedFiles.has(index);
        const stateDisplay = getFileStateDisplay(file.path, !!file.analysis);
        const destination = smartFolder
          ? smartFolder.path || `${defaultLocation}/${smartFolder.name}`
          : 'No matching folder';

        const isAnimating = animatingFiles.has(index);

        return (
          <div
            key={`${file.path}-${index}`}
            className={`
              transition-all duration-500 ease-out
              ${
                isAnimating
                  ? 'animate-in slide-in-from-bottom-2 fade-in scale-in-95 duration-500'
                  : ''
              }
            `}
            style={{
              animationDelay: isAnimating ? '0ms' : undefined,
              animationFillMode: 'both',
            }}
          >
            <ReadyFileItem
              file={fileWithEdits}
              index={index}
              isSelected={isSelected}
              onToggleSelected={toggleFileSelection}
              stateDisplay={stateDisplay}
              smartFolders={smartFolders}
              editing={editingFiles[index]}
              onEdit={handleEditFile}
              destination={destination}
              category={currentCategory}
            />
          </div>
        );
      })}

      {/* Loading indicator for files still being analyzed */}
      {displayedFiles.length < unprocessedFiles.length && (
        <div className="flex items-center justify-center py-6 opacity-60">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin"></div>
            <span className="text-sm text-gray-600">
              More files incoming...
            </span>
          </div>
        </div>
      )}

      {/* Show helpful message when no files are displayed yet */}
      {displayedFiles.length === 0 && unprocessedFiles.length === 0 && (
        <div className="text-center py-8">
          <div className="text-4xl mb-3">⏳</div>
          <p className="text-gray-600 mb-2">Waiting for analysis results...</p>
          <p className="text-sm text-gray-500">
            Files will appear here as they are analyzed in the background.
          </p>
        </div>
      )}
    </div>
  );
}

export default AnimatedFileList;
