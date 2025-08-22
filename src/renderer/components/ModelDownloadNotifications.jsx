import { useEffect } from 'react';
import { useNotification } from '../contexts/NotificationContext';

function ModelDownloadNotifications() {
  const { showInfo, showSuccess } = useNotification();

  useEffect(() => {
    const off = window.electronAPI?.events?.onOperationProgress?.((payload) => {
      try {
        if (!payload || !payload.type) return;

        if (payload.type === 'models-downloading') {
          // Show initial download notification in the same place as other notifications
          showInfo(
            '🤖 Downloading AI models in the background... You can continue using basic features.',
            8000,
            'model-download-start',
          );
        } else if (payload.type === 'models-download-complete') {
          // Show success notification
          showSuccess(
            '✅ AI models ready! All features are now fully available.',
            5000,
            'model-download-complete',
          );

          // Optional: Show native OS notification
          try {
            if (
              'Notification' in window &&
              Notification.permission === 'granted'
            ) {
              new Notification('StratoSort - AI Ready', {
                body: 'All AI models are downloaded and ready to use.',
                icon: '/icon.png', // Assuming you have an icon
              });
            }
          } catch {}
        } else if (payload.type === 'ollama-pull') {
          // Show model download progress
          const pct = payload?.progress?.percent;
          const model = payload?.model || 'AI model';

          if (typeof pct === 'number' && pct >= 0) {
            const progress = Math.max(0, Math.min(100, Math.round(pct)));

            if (progress < 100) {
              showInfo(
                `📥 Downloading ${model}... ${progress}%`,
                3000,
                'model-pull-progress',
              );
            } else {
              showSuccess(
                `✅ ${model} download complete!`,
                3000,
                'model-pull-complete',
              );
            }
          }
        }
      } catch (error) {
        console.error('[ModelDownload] Notification error:', error);
      }
    });

    return () => {
      if (typeof off === 'function') off();
    };
  }, [showInfo, showSuccess]);

  // No UI - this component only handles notifications
  return null;
}

export default ModelDownloadNotifications;
