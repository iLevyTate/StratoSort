import React, { createContext, useContext, useState, useCallback } from 'react';

const ProgressContext = createContext(null);

export const ProgressProvider = ({ children }) => {
  const [progress, setProgress] = useState({
    current: 0,
    total: 0,
    message: '',
    currentFile: ''
  });
  const [isVisible, setIsVisible] = useState(false);

  const updateProgress = useCallback((progressData) => {
    setProgress(prev => ({
      ...prev,
      ...progressData
    }));
    
    // Auto-show when progress starts
    if (progressData.current > 0 || progressData.message) {
      setIsVisible(true);
    }
    
    // Auto-hide when complete
    if (progressData.current >= progressData.total && progressData.total > 0) {
      setTimeout(() => {
        setIsVisible(false);
        setProgress({ current: 0, total: 0, message: '', currentFile: '' });
      }, 2000);
    }
  }, []);

  const showProgress = useCallback((message = '', total = 0) => {
    setProgress({
      current: 0,
      total,
      message,
      currentFile: ''
    });
    setIsVisible(true);
  }, []);

  const hideProgress = useCallback(() => {
    setIsVisible(false);
    setTimeout(() => {
      setProgress({ current: 0, total: 0, message: '', currentFile: '' });
    }, 300);
  }, []);

  const incrementProgress = useCallback((message = '', currentFile = '') => {
    setProgress(prev => ({
      ...prev,
      current: prev.current + 1,
      message: message || prev.message,
      currentFile: currentFile || prev.currentFile
    }));
  }, []);

  const value = {
    progress,
    isVisible,
    updateProgress,
    showProgress,
    hideProgress,
    incrementProgress
  };

  return (
    <ProgressContext.Provider value={value}>
      {children}
    </ProgressContext.Provider>
  );
};

export const useProgress = () => {
  const context = useContext(ProgressContext);
  if (!context) {
    throw new Error('useProgress must be used within a ProgressProvider');
  }
  return context;
};

export default ProgressContext; 