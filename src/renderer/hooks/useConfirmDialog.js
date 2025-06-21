import { useState, useCallback } from "react";
import { ConfirmModal } from "../components/Modal";

function useConfirmDialog() {
  const [confirmState, setConfirmState] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    variant: 'default',
    fileName: null,
    onConfirm: null
  });

  const showConfirm = useCallback(({
    title = 'Confirm Action',
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'default',
    fileName = null
  }) => {
    return new Promise((resolve) => {
      setConfirmState({
        isOpen: true,
        title,
        message,
        confirmText,
        cancelText,
        variant,
        fileName,
        onConfirm: () => {
          resolve(true);
          setConfirmState((prev) => ({ ...prev, isOpen: false }));
        }
      });
    });
  }, []);

  const hideConfirm = useCallback(() => {
    setConfirmState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const ConfirmDialog = useCallback(() => (
    <ConfirmModal
      isOpen={confirmState.isOpen}
      onClose={hideConfirm}
      onConfirm={confirmState.onConfirm}
      title={confirmState.title}
      message={confirmState.message}
      confirmText={confirmState.confirmText}
      cancelText={confirmState.cancelText}
      cancelText={confirmState.cancelText}
      variant={confirmState.variant}
      fileName={confirmState.fileName}
    />
  ), [confirmState, hideConfirm]);

  return { showConfirm, ConfirmDialog };
}

// ===== DRAG AND DROP HOOK =====
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
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0 && onFilesDropped) {
      const fileObjects = files.map((file) => ({
        path: file.path || file.name,
        name: file.name,
        type: 'file',
        size: file.size
        size: file.size
      }));
      onFilesDropped(fileObjects);
    }
  }, [onFilesDropped]);

  return {
    isDragging,
    dragProps: {
      onDragEnter: handleDragEnter,
      onDragLeave: handleDragLeave,
\nexport default useConfirmDialog;
