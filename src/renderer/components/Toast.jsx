import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNotification } from '../contexts/NotificationContext';

// Toast hook for managing toast notifications
export const useToast = () => {
  const [toasts, setToasts] = useState([]);
  let idCounter = useRef(0);

  const addToast = useCallback((message, type = 'info', duration = 5000) => {
    const id = ++idCounter.current;
    const newToast = {
      id,
      message,
      type,
      duration,
      timestamp: Date.now()
    };

    setToasts(prev => [...prev, newToast]);

    // Auto-remove toast after duration (except for errors)
    if (type !== 'error' && duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(toast => toast.id !== id));
      }, duration);
    }

    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const showSuccess = useCallback((message, duration = 3000) => 
    addToast(message, 'success', duration), [addToast]);
  
  const showError = useCallback((message, duration = 0) => 
    addToast(message, 'error', duration), [addToast]);
  
  const showWarning = useCallback((message, duration = 4000) => 
    addToast(message, 'warning', duration), [addToast]);
  
  const showInfo = useCallback((message, duration = 3000) => 
    addToast(message, 'info', duration), [addToast]);

  return {
    toasts,
    addToast,
    removeToast,
    showSuccess,
    showError,
    showWarning,
    showInfo
  };
};

// ToastContainer component for rendering toasts
export const ToastContainer = ({ toasts, onRemoveToast }) => {
  const toastRefs = useRef({});

  // Auto-focus new error notifications for screen readers
  useEffect(() => {
    const errorNotifications = toasts.filter(n => n.type === 'error');
    if (errorNotifications.length > 0) {
      const latestError = errorNotifications[errorNotifications.length - 1];
      const toastElement = toastRefs.current[latestError.id];
      if (toastElement) {
        toastElement.focus();
      }
    }
  }, [toasts]);

  const getToastStyles = (type) => {
    const baseStyles = "relative flex items-start gap-3 p-4 rounded-lg shadow-lg backdrop-blur-md border transition-all duration-300 transform";
    
    switch (type) {
      case 'success':
        return `${baseStyles} bg-green-50/90 border-green-200 text-green-800`;
      case 'error':
        return `${baseStyles} bg-red-50/90 border-red-200 text-red-800 ring-2 ring-red-300`;
      case 'warning':
        return `${baseStyles} bg-yellow-50/90 border-yellow-200 text-yellow-800`;
      case 'info':
        return `${baseStyles} bg-blue-50/90 border-blue-200 text-blue-800`;
      default:
        return `${baseStyles} bg-white/90 border-gray-200 text-gray-800`;
    }
  };

  const getIcon = (type) => {
    switch (type) {
      case 'success':
        return { icon: '✅', label: 'Success' };
      case 'error':
        return { icon: '❌', label: 'Error' };
      case 'warning':
        return { icon: '⚠️', label: 'Warning' };
      case 'info':
        return { icon: 'ℹ️', label: 'Information' };
      default:
        return { icon: '📝', label: 'Notification' };
    }
  };

  const handleKeyDown = (event, notificationId) => {
    if (event.key === 'Escape' || event.key === 'Enter') {
      onRemoveToast(notificationId);
    }
  };

  if (toasts.length === 0) return null;

  return (
    <div 
      className="fixed top-20 right-4 z-50 space-y-2 max-w-md"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((notification) => {
        const iconData = getIcon(notification.type);
        
        return (
          <div
            key={notification.id}
            ref={el => toastRefs.current[notification.id] = el}
            className={getToastStyles(notification.type)}
            role={notification.type === 'error' ? 'alert' : 'status'}
            aria-live={notification.type === 'error' ? 'assertive' : 'polite'}
            tabIndex={notification.type === 'error' ? 0 : -1}
            onKeyDown={(e) => handleKeyDown(e, notification.id)}
            style={{
              animation: 'slideInRight 0.3s ease-out',
            }}
          >
            {/* Icon */}
            <div 
              className="flex-shrink-0 mt-0.5"
              role="img"
              aria-label={iconData.label}
            >
              <span className="text-lg" aria-hidden="true">
                {iconData.icon}
              </span>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              {notification.title && (
                <h4 className="font-semibold text-sm mb-1">
                  {notification.title}
                </h4>
              )}
              <p className="text-sm leading-relaxed">
                {notification.message}
              </p>
              
              {/* Error details for debugging */}
              {notification.type === 'error' && notification.details && (
                <details className="mt-2">
                  <summary className="text-xs cursor-pointer hover:underline">
                    Technical details
                  </summary>
                  <pre className="text-xs mt-1 p-2 bg-black/10 rounded border overflow-x-auto">
                    {notification.details}
                  </pre>
                </details>
              )}
            </div>

            {/* Close button */}
            <button
              onClick={() => onRemoveToast(notification.id)}
              onKeyDown={(e) => handleKeyDown(e, notification.id)}
              className="flex-shrink-0 ml-2 p-1 rounded-full hover:bg-black/10 focus:outline-none focus:ring-2 focus:ring-current focus:ring-offset-1 transition-colors"
              aria-label={`Dismiss ${iconData.label.toLowerCase()} notification`}
              title="Dismiss notification (Esc)"
            >
              <span className="text-sm" aria-hidden="true">✕</span>
            </button>

            {/* Auto-dismiss progress bar for non-error notifications */}
            {notification.type !== 'error' && (
              <div 
                className="absolute bottom-0 left-0 h-1 bg-current opacity-30 rounded-b-lg"
                style={{
                  animation: `shrinkWidth ${notification.duration || 5000}ms linear`,
                  width: '100%'
                }}
                aria-hidden="true"
              />
            )}
          </div>
        );
      })}

      <style>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        @keyframes shrinkWidth {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
};

const Toast = () => {
  const { notifications, removeNotification } = useNotification();
  return <ToastContainer toasts={notifications} onRemoveToast={removeNotification} />;
};

export default Toast; 