import React, { useState, useCallback } from 'react';

/**
 * Custom hook for managing file naming conventions
 * Extracted from DiscoverPhase to reduce component complexity
 */
export function useNamingConvention() {
  const [namingConvention, setNamingConvention] = useState('subject-date');
  const [dateFormat, setDateFormat] = useState('YYYY-MM-DD');
  const [caseConvention, setCaseConvention] = useState('kebab-case');
  const [separator, setSeparator] = useState('-');

  // Helper function to format dates
  const formatDate = useCallback((date, format) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    switch (format) {
      case 'YYYY-MM-DD': return `${year}-${month}-${day}`;
      case 'MM-DD-YYYY': return `${month}-${day}-${year}`;
      case 'DD-MM-YYYY': return `${day}-${month}-${year}`;
      case 'YYYYMMDD': return `${year}${month}${day}`;
      default: return `${year}-${month}-${day}`;
    }
  }, []);

  // Helper function to apply case conventions
  const applyCaseConvention = useCallback((text, convention) => {
    switch (convention) {
      case 'kebab-case':
        return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      case 'snake_case':
        return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      case 'camelCase':
        return text.replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => 
          index === 0 ? word.toLowerCase() : word.toUpperCase()).replace(/\s+/g, '');
      case 'PascalCase':
        return text.replace(/(?:^\w|[A-Z]|\b\w)/g, (word) => word.toUpperCase()).replace(/\s+/g, '');
      case 'lowercase':
        return text.toLowerCase();
      case 'UPPERCASE':
        return text.toUpperCase();
      default:
        return text;
    }
  }, []);

  // Generate preview name based on current settings
  const generatePreviewName = useCallback((originalName) => {
    const baseName = originalName.replace(/\.[^/.]+$/, ''); // Remove extension
    const extension = originalName.includes('.') ? `.${originalName.split('.').pop()}` : '';
    const today = new Date();
    
    let previewName = '';
    
    switch (namingConvention) {
      case 'subject-date':
        previewName = `${baseName}${separator}${formatDate(today, dateFormat)}`;
        break;
      case 'date-subject':
        previewName = `${formatDate(today, dateFormat)}${separator}${baseName}`;
        break;
      case 'project-subject-date':
        previewName = `Project${separator}${baseName}${separator}${formatDate(today, dateFormat)}`;
        break;
      case 'category-subject':
        previewName = `Category${separator}${baseName}`;
        break;
      case 'keep-original':
        previewName = baseName;
        break;
      default:
        previewName = baseName;
    }
    
    // Apply case convention
    previewName = applyCaseConvention(previewName, caseConvention);
    
    return previewName + extension;
  }, [namingConvention, separator, dateFormat, caseConvention, formatDate, applyCaseConvention]);

  // Load persisted naming convention settings
  const loadPersistedNaming = useCallback((persistedNaming) => {
    if (persistedNaming) {
      setNamingConvention(persistedNaming.convention || 'subject-date');
      setDateFormat(persistedNaming.dateFormat || 'YYYY-MM-DD');
      setCaseConvention(persistedNaming.caseConvention || 'kebab-case');
      setSeparator(persistedNaming.separator || '-');
    }
  }, []);

  // Get current naming settings as object
  const getNamingSettings = useCallback(() => {
    return {
      convention: namingConvention,
      dateFormat,
      caseConvention,
      separator
    };
  }, [namingConvention, dateFormat, caseConvention, separator]);

  return {
    // State
    namingConvention,
    dateFormat,
    caseConvention,
    separator,
    
    // Actions
    setNamingConvention,
    setDateFormat,
    setCaseConvention,
    setSeparator,
    generatePreviewName,
    loadPersistedNaming,
    getNamingSettings,
    
    // Utilities
    formatDate,
    applyCaseConvention
  };
} 