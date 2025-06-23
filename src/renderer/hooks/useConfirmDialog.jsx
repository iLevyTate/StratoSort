import React, { useState, useCallback } from 'react';

import { ConfirmModal } from '../components/Modal';

function useConfirmDialog() {
  const [state, setState] = useState({
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
    message = '',
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'default',
    fileName = null
  } = {}) => {
    return new Promise((resolve) => {
      setState({
        isOpen: true,
        title,
        message,
        confirmText,
        cancelText,
        variant,
        fileName,
        onConfirm: () => {
          setState((prev) => ({ ...prev, isOpen: false }));
          resolve(true);
        }
      });
    });
  }, []);

  const hideConfirm = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const ConfirmDialog = useCallback(() => (
    <ConfirmModal
      isOpen={state.isOpen}
      onClose={hideConfirm}
      onConfirm={state.onConfirm}
      title={state.title}
      message={state.message}
      confirmText={state.confirmText}
      cancelText={state.cancelText}
      variant={state.variant}
      fileName={state.fileName}
    />
  ), [state, hideConfirm]);

  return { showConfirm, ConfirmDialog };
}

export default useConfirmDialog;
