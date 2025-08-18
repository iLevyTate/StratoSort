import React, { useEffect, useState } from 'react';

export default function UpdateIndicator() {
  const [status, setStatus] = useState('idle');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Listen for update events from main
    const off = window.electronAPI?.events?.onAppUpdate?.((payload) => {
      try {
        if (!payload || !payload.status) return;
        if (payload.status === 'ready') {
          setStatus('ready');
          setVisible(true);
        } else if (payload.status === 'available') {
          setStatus('downloading');
          setVisible(false);
        } else if (payload.status === 'none') {
          setVisible(false);
        }
      } catch (error) {
        console.error('[UpdateIndicator] Error handling update event:', error);
      }
    });
    return () => {
      if (typeof off === 'function') off();
    };
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={async () => {
        try {
          setStatus('applying');
          const res = await window.electronAPI?.system?.applyUpdate?.();
          if (!res?.success) {
            setStatus('error');
            console.error('[UpdateIndicator] Failed to apply update');
          }
        } catch (error) {
          setStatus('error');
          console.error('[UpdateIndicator] Error applying update:', error);
        }
      }}
      className="px-6 py-5 text-sm rounded-lg border border-border-light hover:bg-system-gray-50"
      title="Apply downloaded update"
      aria-label="Apply update"
    >
      {status === 'applying'
        ? 'Updating…'
        : status === 'ready'
          ? 'Update Ready'
          : 'Update'}
    </button>
  );
}
