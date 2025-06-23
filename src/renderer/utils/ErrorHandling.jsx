/**
 * Centralized Error Handling for Renderer Process
 * Provides consistent error reporting and user feedback
 */

import { useNotification } from '../contexts/NotificationContext';

// Error severity levels
export const ERROR_LEVELS = {
  INFO: 'info',
  WARNING: 'warning', 
  ERROR: 'error',
  CRITICAL: 'critical'
};

// Development mode flag
const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Log error with appropriate severity
 * @param {Error|string} error - Error object or message
 * @param {string} context - Context where error occurred
 * @param {string} level - Error severity level
 * @param {Object} metadata - Additional metadata
 */
export function logError(error, context = 'Unknown', level = ERROR_LEVELS.ERROR, metadata = {}) {
  const errorInfo = {
    message: error?.message || error || 'Unknown error',
    context,
    level,
    timestamp: new Date().toISOString(),
    stack: error?.stack,
    ...metadata
  };

  // In development, log to console with full details
  if (isDevelopment) {
    const logMethod = getConsoleMethod(level);
    logMethod(`[${context.toUpperCase()}] ${errorInfo.message}`, errorInfo);
  }

  // Send to main process for logging (in production)
  if (window.electronAPI?.system?.logError) {
    window.electronAPI.system.logError(errorInfo).catch(() => {
      // Fallback to console if IPC fails
      console.error('Failed to send error to main process:', errorInfo);
    });
  }

  return errorInfo;
}

/**
 * Get appropriate console method for error level
 * @param {string} level - Error level
 * @returns {Function} Console method
 */
function getConsoleMethod(level) {
  switch (level) {
    case ERROR_LEVELS.CRITICAL:
    case ERROR_LEVELS.ERROR:
      return console.error;
    case ERROR_LEVELS.WARNING:
      return console.warn;
    case ERROR_LEVELS.INFO:
      return console.info;
    default:
      return console.log;
  }
}

/**
 * React hook for error handling with notifications
 * @returns {Object} Error handling functions
 */
export function useErrorHandler() {
  const { showError, showWarning, showInfo } = useNotification();

  const handleError = (error, context = 'Operation', showToUser = true, metadata = {}) => {
    const errorInfo = logError(error, context, ERROR_LEVELS.ERROR, metadata);
    
    if (showToUser) {
      showError(`${context} failed: ${errorInfo.message}`);
    }
    
    return errorInfo;
  };

  const handleWarning = (message, context = 'Operation', showToUser = true, metadata = {}) => {
    const errorInfo = logError(message, context, ERROR_LEVELS.WARNING, metadata);
    
    if (showToUser) {
      showWarning(`${context}: ${message}`);
    }
    
    return errorInfo;
  };

  const handleInfo = (message, context = 'Operation', showToUser = false, metadata = {}) => {
    const errorInfo = logError(message, context, ERROR_LEVELS.INFO, metadata);
    
    if (showToUser) {
      showInfo(`${context}: ${message}`);
    }
    
    return errorInfo;
  };

  const handleCritical = (error, context = 'System', metadata = {}) => {
    const errorInfo = logError(error, context, ERROR_LEVELS.CRITICAL, metadata);
    
    // Critical errors always show to user
    showError(`Critical ${context} error: ${errorInfo.message}`);
    
    return errorInfo;
  };

  return {
    handleError,
    handleWarning, 
    handleInfo,
    handleCritical,
    logError
  };
}

/**
 * Async operation wrapper with error handling
 * @param {Function} operation - Async operation to wrap
 * @param {string} context - Context for error reporting
 * @param {Object} options - Error handling options
 * @returns {Promise} Operation result or error
 */
export async function withErrorHandling(operation, context = 'Operation', options = {}) {
  const { showUserError = true, fallbackValue = null, retries = 0 } = options;
  
  let lastError;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (attempt < retries) {
        logError(error, context, ERROR_LEVELS.WARNING, { 
          attempt: attempt + 1, 
          retriesRemaining: retries - attempt 
        });
        // Wait before retry (exponential backoff)
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }
  
  // All retries failed
  logError(lastError, context, ERROR_LEVELS.ERROR, { 
    totalAttempts: retries + 1,
    failed: true 
  });
  
  if (showUserError && window.electronAPI?.notification?.showError) {
    window.electronAPI.notification.showError(`${context} failed: ${lastError.message}`);
  }
  
  return fallbackValue;
}

export default {
  logError,
  useErrorHandler,
  withErrorHandling,
  ERROR_LEVELS
}; 