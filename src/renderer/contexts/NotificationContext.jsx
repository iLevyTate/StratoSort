import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { ToastContainer, useToast } from '../components/Toast';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const {
    toasts,
    addToast,
    removeToast,
    clearAllToasts,
    showSuccess,
    showError,
    showWarning,
    showInfo,
  } = useToast();

  // Notification queue to prevent race conditions and spam
  const [notificationQueue, setNotificationQueue] = useState([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const queueProcessorRef = useRef(null);

  // Process notification queue sequentially
  const processNotificationQueue = useCallback(async () => {
    if (isProcessingQueue || notificationQueue.length === 0) return;

    setIsProcessingQueue(true);

    try {
      while (notificationQueue.length > 0) {
        const [nextNotification, ...remaining] = notificationQueue;

        // Add the notification using the existing toast system
        const toastId = addToast(
          nextNotification.message,
          nextNotification.severity,
          nextNotification.duration,
          nextNotification.groupKey,
        );

        // Update queue to remove processed notification
        setNotificationQueue(remaining);

        // Small delay between notifications to prevent spam
        if (remaining.length > 0) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    } catch (error) {
      console.error(
        '[NOTIFICATION] Error processing notification queue:',
        error,
      );
    } finally {
      setIsProcessingQueue(false);
    }
  }, [notificationQueue, isProcessingQueue, addToast]);

  // Process queue when it changes
  useEffect(() => {
    if (notificationQueue.length > 0 && !isProcessingQueue) {
      processNotificationQueue();
    }
  }, [notificationQueue, isProcessingQueue, processNotificationQueue]);

  const addNotification = useCallback(
    (message, severity = 'info', duration = 3000, groupKey = null) => {
      // Add notification to queue instead of directly calling addToast
      const notification = {
        message,
        severity,
        duration,
        groupKey,
        timestamp: Date.now(),
        id: `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      };

      setNotificationQueue((prev) => [...prev, notification]);

      // Return the notification ID for potential removal
      return notification.id;
    },
    [],
  );

  const removeNotification = useCallback(
    (id) => {
      removeToast(id);
    },
    [removeToast],
  );

  // Clear notification queue (useful for emergency cleanup)
  const clearNotificationQueue = useCallback(() => {
    setNotificationQueue([]);
    setIsProcessingQueue(false);
  }, []);

  // Enhanced clear all notifications that also clears the queue
  const clearAllNotifications = useCallback(() => {
    clearAllToasts();
    clearNotificationQueue();
  }, [clearAllToasts, clearNotificationQueue]);

  // Bridge main-process errors into our styled UI (toast/modal), avoiding OS dialogs
  useEffect(() => {
    const api = window?.electronAPI?.events;
    if (!api || typeof api.onAppError !== 'function') return;

    const cleanup = api.onAppError((payload) => {
      try {
        const { message, type } = payload || {};
        if (!message) return;
        if (type === 'error') showError(message, 5000);
        else if (type === 'warning') showWarning(message, 4000);
        else showInfo(message, 3000);
      } catch (e) {
        console.error('[Renderer] Failed to display app:error', e);
      }
    });

    return cleanup;
  }, [showError, showWarning, showInfo]);

  return (
    <NotificationContext.Provider
      value={{
        notifications: toasts,
        addNotification,
        removeNotification,
        clearAllNotifications,
        clearNotificationQueue,
        showSuccess,
        showError,
        showWarning,
        showInfo,
        // Debug info
        queueLength: notificationQueue.length,
        isProcessingQueue,
      }}
    >
      {children}
      <ToastContainer
        toasts={toasts}
        onRemoveToast={removeToast}
        onClearAll={clearAllNotifications}
      />
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context)
    throw new Error('useNotification must be used within NotificationProvider');
  return context;
}
