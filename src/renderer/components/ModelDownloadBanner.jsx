import React, { useEffect, useState } from 'react';
import { useNotification } from '../contexts/NotificationContext';

function ModelDownloadBanner() {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState(
    'Downloading essential AI models in the background...',
  );
  const { showInfo, showSuccess } = useNotification();

  useEffect(() => {
    const off = window.electronAPI?.events?.onOperationProgress?.((payload) => {
      try {
        if (!payload || !payload.type) return;
        if (payload.type === 'models-downloading') {
          setMessage(
            payload.message ||
              'Downloading essential AI models in the background...',
          );
          setVisible(true);
          try {
            showInfo(
              'Model downloads started. You can continue using basic features.',
              4000,
            );
          } catch {}
        } else if (payload.type === 'models-download-complete') {
          setVisible(false);
          try {
            showSuccess('Models ready. AI features are fully available.', 3000);
          } catch {}
          // Native notification via tray (Windows) or Notification API (if allowed)
          try {
            if ('Notification' in window) {
              if (Notification.permission === 'granted') {
                new Notification('StratoSort', {
                  body: 'All recommended AI models are ready.',
                });
              } else if (Notification.permission !== 'denied') {
                Notification.requestPermission().then((p) => {
                  if (p === 'granted') {
                    new Notification('StratoSort', {
                      body: 'All recommended AI models are ready.',
                    });
                  }
                });
              }
            }
          } catch {}
        } else if (payload.type === 'ollama-pull') {
          // Optional: show incremental progress if needed
          const pct = payload?.progress?.percent;
          if (typeof pct === 'number') {
            setMessage(
              `Fetching ${payload.model} — ${Math.max(0, Math.min(100, Math.round(pct)))}%`,
            );
            setVisible(true);
          }
        }
      } catch {}
    });
    return () => {
      if (typeof off === 'function') off();
    };
  }, [showInfo, showSuccess]);

  if (!visible) return null;

  return (
    <div className="w-full bg-yellow-50 border-b border-yellow-200">
      <div className="max-w-screen-lg mx-auto px-13 py-8 flex items-center gap-8">
        <div className="w-10 h-10 rounded-full border-2 border-yellow-500 border-t-transparent animate-spin" />
        <div className="flex-1">
          <div className="text-sm font-medium text-yellow-800">
            AI setup in progress
          </div>
          <div className="text-xs text-yellow-700">{message}</div>
        </div>
      </div>
    </div>
  );
}

export default ModelDownloadBanner;
