import { useCallback, useState } from 'react';

export function useDragAndDrop(onFilesDropped) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e) => {
      if (!e) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const dt = e.dataTransfer;
      if (!dt) return;

      const files = Array.from(dt.files || []);
      if (files.length > 0 && typeof onFilesDropped === 'function') {
        const fileObjects = files.map((file) => ({
          path: file.path || file.name || '',
          name: file.name || (file.path || '').split(/[\\/]/).pop() || '',
          type: 'file',
          size: file.size || 0,
        }));
        onFilesDropped(fileObjects);
      }
    },
    [onFilesDropped],
  );

  return {
    isDragging,
    dragProps: {
      onDragEnter: handleDragEnter,
      onDragLeave: handleDragLeave,
      onDragOver: handleDragOver,
      onDrop: handleDrop,
    },
  };
}
