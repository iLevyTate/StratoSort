import React, { useState, useEffect } from 'react';

const Toast = ({ 
  message, 
  severity = 'info', 
  duration = 3000, // Reduced from 5000ms to 3000ms for less invasiveness
  onClose,
  show = true 
}) => {
  const [isVisible, setIsVisible] = useState(show);

  useEffect(() => {
    if (show && duration > 0) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(() => onClose?.(), 300); // Allow animation to complete
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [show, duration, onClose]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => onClose?.(), 300);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      handleClose();
    }
  };

  const getSeverityClasses = () => {
    switch (severity) {
      case 'success':
        return 'toast-success border-system-green bg-system-green/10 text-system-green';
      case 'error':
        return 'toast-error border-system-red bg-system-red/10 text-system-red';
      case 'warning':
        return 'toast-warning border-yellow-500 bg-yellow-100 text-yellow-800 dark:bg-yellow-900/90 dark:text-yellow-200';
      case 'info':
      default:
        return 'toast-info border-stratosort-blue bg-stratosort-blue/10 text-stratosort-blue';
    }
  };

  const getSeverityIcon = () => {
    switch (severity) {
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'info':
      default:
        return 'ℹ️';
    }
  };

  // Comprehensive fallback style that matches the CSS exactly
  const fallbackStyle = {
    transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
    transition: 'all 300ms ease-in-out'
  };

  if (!show && !isVisible) return null;

  return (
    <div
      className={`toast-enhanced ${getSeverityClasses()} ${isVisible ? 'show' : ''}`}
      style={fallbackStyle}
      role="alert"
      aria-live="polite"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-fib-5">
          <span className="text-sm flex-shrink-0 opacity-80" aria-hidden="true">
            {getSeverityIcon()}
          </span>
          <div className="flex-1">
            <div className="text-xs font-normal leading-tight opacity-90">
              {message}
            </div>
          </div>
        </div>
        <button
          onClick={handleClose}
          className="ml-fib-5 text-current opacity-50 hover:opacity-80 p-fib-1 rounded hover:bg-black/5 transition-all duration-150"
          aria-label="Close notification"
        >
          <span className="text-sm leading-none">×</span>
        </button>
      </div>
    </div>
  );
};

// Toast Container for managing multiple toasts
export const ToastContainer = ({ toasts = [], onRemoveToast }) => {
  return (
    <div 
      className="fixed bottom-fib-21 right-fib-21 z-40 space-y-fib-5 pointer-events-none"
      style={{ position: 'fixed', bottom: '21px', right: '21px', zIndex: 1000 }}
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast
            message={toast.message}
            severity={toast.severity || toast.type}
            duration={toast.duration}
            show={toast.show !== false}
            onClose={() => onRemoveToast?.(toast.id)}
          />
        </div>
      ))}
    </div>
  );
};

// Hook for using toasts
export const useToast = () => {
  const [toasts, setToasts] = useState([]);

  const addToast = (message, severity = 'info', duration = 3000) => {
    const id = Date.now() + Math.random();
    const toast = { id, message, severity, duration, show: true };
    
    setToasts(prev => [...prev, toast]);
    return id;
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const clearAllToasts = () => {
    setToasts([]);
  };

  return {
    toasts,
    addToast,
    removeToast,
    clearAllToasts,
    // Legacy alias used throughout app
    addNotification: addToast,
    // Convenience methods with shorter defaults for less invasiveness
    showSuccess: (message, duration = 2500) => addToast(message, 'success', duration),
    showError: (message, duration = 4000) => addToast(message, 'error', duration), // Errors stay longer
    showWarning: (message, duration = 3500) => addToast(message, 'warning', duration),
    showInfo: (message, duration = 2000) => addToast(message, 'info', duration) // Info disappears quickly
  };
};

export default Toast; 