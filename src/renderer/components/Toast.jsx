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
export const ToastContainer = ({ toasts = [], onRemoveToast, onClearAll }) => {
  const [position, setPosition] = useState(() => {
    try { return localStorage.getItem('toastPosition') || 'bottom-right'; } catch { return 'bottom-right'; }
  });
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('toastCollapsed') === 'true'; } catch { return false; }
  });

  const containerStyle = () => {
    const base = { position: 'fixed', zIndex: 1000 };
    switch (position) {
      case 'top-right': return { ...base, top: '21px', right: '21px' };
      case 'top-left': return { ...base, top: '21px', left: '21px' };
      case 'bottom-left': return { ...base, bottom: '21px', left: '21px' };
      default: return { ...base, bottom: '21px', right: '21px' };
    }
  };

  const updatePosition = (pos) => {
    setPosition(pos);
    try { localStorage.setItem('toastPosition', pos); } catch {}
  };

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      try { localStorage.setItem('toastCollapsed', String(!prev)); } catch {}
      return !prev;
    });
  };

  return (
    <div aria-live="polite" aria-label="Notifications" className="z-40 pointer-events-none" style={containerStyle()}>
      {/* Controls */}
      <div className="pointer-events-auto mb-fib-5 flex items-center gap-fib-5 bg-white/80 backdrop-blur border border-system-gray-200 rounded px-fib-5 py-fib-3 shadow-sm">
        <button onClick={toggleCollapsed} className="text-xs text-system-gray-700 hover:text-system-gray-900">{collapsed ? 'Expand' : 'Minimize'}</button>
        <span className="text-system-gray-300">•</span>
        <button onClick={() => onClearAll?.()} className="text-xs text-system-gray-700 hover:text-system-gray-900">Clear</button>
        <span className="text-system-gray-300">•</span>
        <label className="text-xs text-system-gray-700">Position</label>
        <select value={position} onChange={(e) => updatePosition(e.target.value)} className="text-xs border border-system-gray-200 rounded px-fib-3 py-fib-1 bg-white">
          <option value="top-right">Top Right</option>
          <option value="top-left">Top Left</option>
          <option value="bottom-right">Bottom Right</option>
          <option value="bottom-left">Bottom Left</option>
        </select>
      </div>

      {/* Toasts */}
      {!collapsed && toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto mb-fib-5">
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

// Hook for using toasts (with simple grouping and caps)
export const useToast = () => {
  const [toasts, setToasts] = useState([]);

  const MAX_VISIBLE_TOASTS = 5;
  const GROUP_WINDOW_MS = 2000; // merge toasts with same groupKey within 2s

  const getHighestSeverity = (a, b) => {
    const order = { error: 3, warning: 2, success: 1, info: 0 };
    const aScore = order[a] ?? 0;
    const bScore = order[b] ?? 0;
    return aScore >= bScore ? a : b;
  };

  const addToast = (message, severity = 'info', duration = 3000, groupKey = null) => {
    const id = Date.now() + Math.random();
    const now = Date.now();

    setToasts(prev => {
      // If grouping, try to merge with an existing toast
      if (groupKey) {
        const idx = prev.findIndex(t => t.groupKey === groupKey && (now - (t.createdAt || now)) <= GROUP_WINDOW_MS);
        if (idx !== -1) {
          const existing = prev[idx];
          const updated = {
            ...existing,
            id: existing.id, // keep id stable for animation
            message,
            severity: getHighestSeverity(existing.severity || 'info', severity || 'info'),
            duration: duration ?? existing.duration,
            createdAt: existing.createdAt || now
          };
          const copy = prev.slice();
          copy[idx] = updated;
          return copy;
        }
      }

      const next = [...prev, { id, message, severity, duration, show: true, groupKey: groupKey || null, createdAt: now }];
      // Cap visible toasts
      if (next.length > MAX_VISIBLE_TOASTS) {
        next.shift();
      }
      return next;
    });

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