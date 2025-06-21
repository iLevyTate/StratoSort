Here’s a clean, conflict-free version that keeps both hooks and exports them properly:

```javascript
import { useState, useCallback } from 'react';
import { ConfirmModal } from '../components/Modal';

/* ---------- CONFIRM DIALOG HOOK ---------- */
function useConfirmDialog() {
  const [confirmState, setConfirmState] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    variant: 'default',
    fileName: null,
    onConfirm: null,
  });

  const showConfirm = useCallback(
    ({
      title = 'Confirm Action',
      message = '',
      confirmText = 'Confirm',
      cancelText = 'Cancel',
      variant = 'default',
      fileName = null,
    } = {}) =>
      new Promise((resolve) => {
        setConfirmState({
          isOpen: true,
          title,
          message,
          confirmText,
          cancelText,
          variant,
          fileName,
          onConfirm: () => {
            setConfirmState((prev) => ({ ...prev, isOpen: false }));
            resolve(true);
          },
        });
      }),
    [],
  );

  const hideConfirm = useCallback(
    () => setConfirmState((prev) => ({ ...prev, isOpen: false })),
    [],
  );

  const ConfirmDialog = useCallback(
    () => (
      <ConfirmModal
        isOpen={confirmState.isOpen}
        onClose={hideConfirm}
        onConfirm={confirmState.onConfirm}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        cancelText={confirmState.cancelText}
        variant={confirmState.variant}
        fileName={confirmState.fileName}
      />
    ),
    [confirmState, hideConfirm],
  );

  return { showConfirm, ConfirmDialog };
}

/* ---------- DRAG & DROP HOOK ---------- */
function useDragAndDrop(onFilesDropped) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget)) return; // still inside
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length && onFilesDropped) {
        const fileObjects = files.map((file) => ({
          path: file.path || file.name,
          name: file.name,
          type: file.type || 'file',
          size: file.size,
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

export default useConfirmDialog;
export { useDragAndDrop };
```
