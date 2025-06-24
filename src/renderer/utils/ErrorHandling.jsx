/**
 * Centralized Error Handling for Renderer Process
 * Provides consistent error reporting and user feedback
 */

import React, { useState, useEffect, useCallback } from 'react';
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
 * Enhanced Error Handling System for React Components
 * Provides centralized error management with user-friendly notifications
 */

// Error severity levels
export const ERROR_SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

// Error categories for better organization
export const ERROR_CATEGORIES = {
  NETWORK: 'network',
  FILE_SYSTEM: 'file_system',
  AI_ANALYSIS: 'ai_analysis',
  VALIDATION: 'validation',
  PERMISSION: 'permission',
  TIMEOUT: 'timeout',
  UNKNOWN: 'unknown'
};

// Error classification helper
const classifyError = (error, context = '') => {
  const message = error?.message?.toLowerCase() || '';
  const contextLower = context.toLowerCase();
  
  // Network errors
  if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
    return { category: ERROR_CATEGORIES.NETWORK, severity: ERROR_SEVERITY.MEDIUM };
  }
  
  // File system errors
  if (message.includes('enoent') || message.includes('eacces') || message.includes('file') || 
      contextLower.includes('file') || contextLower.includes('folder')) {
    return { category: ERROR_CATEGORIES.FILE_SYSTEM, severity: ERROR_SEVERITY.MEDIUM };
  }
  
  // AI/Analysis errors
  if (message.includes('ollama') || message.includes('analysis') || message.includes('model') ||
      contextLower.includes('ai') || contextLower.includes('analysis') || contextLower.includes('ollama')) {
    return { category: ERROR_CATEGORIES.AI_ANALYSIS, severity: ERROR_SEVERITY.MEDIUM };
  }
  
  // Validation errors
  if (message.includes('validation') || message.includes('invalid') || message.includes('required')) {
    return { category: ERROR_CATEGORIES.VALIDATION, severity: ERROR_SEVERITY.LOW };
  }
  
  // Permission errors
  if (message.includes('permission') || message.includes('unauthorized') || message.includes('access denied')) {
    return { category: ERROR_CATEGORIES.PERMISSION, severity: ERROR_SEVERITY.HIGH };
  }
  
  // Timeout errors
  if (message.includes('timeout') || message.includes('timed out')) {
    return { category: ERROR_CATEGORIES.TIMEOUT, severity: ERROR_SEVERITY.MEDIUM };
  }
  
  return { category: ERROR_CATEGORIES.UNKNOWN, severity: ERROR_SEVERITY.MEDIUM };
};

// Generate user-friendly error messages
const generateUserMessage = (error, context, classification) => {
  const { category, severity } = classification;
  
  switch (category) {
    case ERROR_CATEGORIES.NETWORK:
      return `Connection issue while ${context}. Please check your internet connection and try again.`;
    
    case ERROR_CATEGORIES.FILE_SYSTEM:
      return `File system error during ${context}. Please check file permissions and disk space.`;
    
    case ERROR_CATEGORIES.AI_ANALYSIS:
      return `AI analysis error during ${context}. Please verify Ollama is running and try again.`;
    
    case ERROR_CATEGORIES.VALIDATION:
      return `Validation error: ${error.message}`;
    
    case ERROR_CATEGORIES.PERMISSION:
      return `Permission denied during ${context}. Please check file/folder permissions.`;
    
    case ERROR_CATEGORIES.TIMEOUT:
      return `Operation timed out during ${context}. Please try again with a smaller batch.`;
    
    default:
      return `An error occurred during ${context}: ${error.message}`;
  }
};

// Custom hook for error handling
export const useErrorHandler = () => {
  const { addNotification, showError, showWarning } = useNotification();
  const [errorHistory, setErrorHistory] = useState([]);

  // Log error to system (replaces console logging)
  const logError = useCallback(async (error, context, classification) => {
    try {
      if (window.electronAPI?.system?.logError) {
        await window.electronAPI.system.logError({
          message: error.message,
          stack: error.stack,
          context,
          category: classification.category,
          severity: classification.severity,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent
        });
      }
    } catch (logError) {
      // Fallback - store in memory if system logging fails
      setErrorHistory(prev => [...prev.slice(-99), {
        error: error.message,
        context,
        timestamp: new Date().toISOString()
      }]);
    }
  }, []);

  // Main error handler
  const handleError = useCallback(async (error, context = 'Unknown', showToUser = true) => {
    // Validate inputs
    if (!error) return;
    
    const errorObj = error instanceof Error ? error : new Error(String(error));
    const classification = classifyError(errorObj, context);
    
    // Log error to system
    await logError(errorObj, context, classification);
    
    // Show user notification if requested
    if (showToUser) {
      const userMessage = generateUserMessage(errorObj, context, classification);
      
      if (classification.severity === ERROR_SEVERITY.CRITICAL) {
        showError(userMessage);
      } else if (classification.severity === ERROR_SEVERITY.HIGH) {
        showError(userMessage);
      } else {
        showWarning(userMessage);
      }
    }
    
    return classification;
  }, [logError, showError, showWarning]);

  // Warning handler
  const handleWarning = useCallback(async (message, context = 'Unknown', showToUser = true) => {
    const warningObj = new Error(message);
    const classification = { category: ERROR_CATEGORIES.VALIDATION, severity: ERROR_SEVERITY.LOW };
    
    // Log warning to system
    await logError(warningObj, context, classification);
    
    // Show user notification if requested
    if (showToUser) {
      showWarning(message);
    }
    
    return classification;
  }, [logError, showWarning]);

  // Retry wrapper with exponential backoff
  const withRetry = useCallback(async (operation, maxRetries = 3, context = 'Operation') => {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          await handleError(error, `${context} (Final Attempt)`, true);
          throw error;
        }
        
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        
        await handleError(error, `${context} (Attempt ${attempt})`, false);
      }
    }
    
    throw lastError;
  }, [handleError]);

  return {
    handleError,
    handleWarning,
    withRetry,
    errorHistory,
    ERROR_SEVERITY,
    ERROR_CATEGORIES
  };
};

// Higher-order component for error boundary
export const withErrorHandling = (WrappedComponent, errorFallback = null) => {
  return function WithErrorHandlingComponent(props) {
    const { handleError } = useErrorHandler();
    
    const handleComponentError = useCallback((error, errorInfo) => {
      handleError(error, `Component: ${WrappedComponent.name}`, true);
    }, [handleError]);
    
    return (
      <ErrorBoundary onError={handleComponentError} fallback={errorFallback}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };
};

// Error Boundary Component
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      
      return (
        <div className="error-boundary p-4 bg-red-50 border border-red-200 rounded-lg">
          <h3 className="text-red-800 font-semibold mb-2">Something went wrong</h3>
          <p className="text-red-600 text-sm mb-3">
            An unexpected error occurred. Please try refreshing the page.
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default {
  logError,
  useErrorHandler,
  withErrorHandling,
  ERROR_LEVELS
}; 