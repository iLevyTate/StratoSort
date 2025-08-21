import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from './Modal';

function GlobalDialogHost() {
  const [dialogState, setDialogState] = useState({
    isOpen: false,
    token: null,
    title: '',
    message: '',
    buttons: [],
    variant: 'info',
  });

  useEffect(() => {
    const api = window?.electronAPI?.events;
    if (!api || typeof api.onUiDialog !== 'function') return () => {};

    const off = api.onUiDialog((payload) => {
      try {
        const { token, title, message, buttons, variant } = payload || {};
        if (!token || !Array.isArray(buttons) || buttons.length === 0) return;
        setDialogState({
          isOpen: true,
          token,
          title: title || 'Confirm',
          message: message || '',
          buttons,
          variant: variant || 'info',
        });
      } catch {}
    });

    return () => {
      if (typeof off === 'function') off();
    };
  }, []);

  const handleClose = useCallback(() => {
    setDialogState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const handleSelect = useCallback(
    async (index) => {
      try {
        const token = dialogState.token;
        handleClose();
        await window?.electronAPI?.ui?.respondDialog?.(token, index);
      } catch {}
    },
    [dialogState.token, handleClose],
  );

  if (!dialogState.isOpen) return null;

  return (
    <Modal
      isOpen={dialogState.isOpen}
      onClose={() => handleSelect(dialogState.buttons.length - 1)}
      size="small"
      showCloseButton={false}
    >
      <div className="p-13">
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            {dialogState.title}
          </h3>
          {dialogState.message && (
            <div className="text-gray-600 whitespace-pre-line">
              {dialogState.message}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-5 justify-end">
          {dialogState.buttons.map((label, idx) => (
            <button
              key={`${dialogState.token}-${idx}`}
              className={
                idx === 0
                  ? 'px-8 py-5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
                  : 'px-8 py-5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-400'
              }
              onClick={() => handleSelect(idx)}
              autoFocus={idx === 0}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export default GlobalDialogHost;
