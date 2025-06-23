import React, { useState, useEffect } from 'react';

function Toast({ 
  message, 
  severity = 'info', 
  duration = 3000, // Reduced from 5000ms to 3000ms for less invasiveness
  onClose,
  show = true 
}) {
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
        return 'toast-success border-success bg-success/10 text-text-on-success-bg';
      case 'error':
        return 'toast-error border-danger bg-danger/10 text-text-on-danger-bg';
      case 'warning':
        return 'toast-warning border-warning bg-warning/10 text-text-on-warning-bg';
      case 'info':
      default:
        return 'toast-info border-primary bg-primary/10 text-text-on-primary-bg';
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
      className={`toast-enhanced relative ${getSeverityClasses()} ${isVisible ? 'show' : ''}`}
      style={fallbackStyle}
      role="alert"
      aria-live="polite"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
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
          className="ml-2 text-current opacity-60 hover:opacity-100 p-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-all duration-150"
          aria-label="Close notification"
        >
          <span className="text-sm leading-none">×</span>
        </button>
      </div>
      {duration > 0 && (
        <div
          className="toast-progress pointer-events-none"
          style={{ animationDuration: `${duration}ms` }}
          aria-hidden="true"
          role="presentation"
        />
      )}
    </div>
  );
}

// Toast Container for managing multiple toasts
export function ToastContainer({ toasts = [], onRemoveToast }) {
  return (
    <div 
      className="fixed bottom-6 right-6 z-40 space-y-2 pointer-events-none"
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
}

// Hook for using toasts
export const useToast = () => {
  const [toasts, setToasts] = useState([]);

  const addToast = (message, severity = 'info', duration = 3000) => {
    const id = Date.now() + Math.random();
    const toast = { id, message, severity, duration, show: true };
    
    setToasts((prev) => [...prev, toast]);
    return id;
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
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