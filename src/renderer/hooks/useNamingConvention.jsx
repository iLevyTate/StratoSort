import { useState, useCallback, useMemo } from 'react';
import { useNotification } from '../contexts/NotificationContext';

/**
 * Available naming convention patterns
 */
const NAMING_PATTERNS = {
  'subject-date': {
    name: 'Subject - Date',
    pattern: '{subject} - {date}',
    description: 'Document Title - YYYY-MM-DD',
    example: 'Meeting Notes - 2024-06-24'
  },
  'date-subject': {
    name: 'Date - Subject',
    pattern: '{date} - {subject}',
    description: 'YYYY-MM-DD - Document Title',
    example: '2024-06-24 - Meeting Notes'
  },
  'category-subject-date': {
    name: 'Category/Subject - Date',
    pattern: '{category}/{subject} - {date}',
    description: 'Category/Document Title - YYYY-MM-DD',
    example: 'Work/Meeting Notes - 2024-06-24'
  },
  'date-category-subject': {
    name: 'Date - Category - Subject',
    pattern: '{date} - {category} - {subject}',
    description: 'YYYY-MM-DD - Category - Document Title',
    example: '2024-06-24 - Work - Meeting Notes'
  },
  'original': {
    name: 'Keep Original',
    pattern: '{original}',
    description: 'Keep the original filename unchanged',
    example: 'document.pdf'
  }
};

/**
 * Hook for managing file naming conventions
 * @returns {Object} Naming convention state and methods
 */
export function useNamingConvention() {
  const [namingConvention, setNamingConvention] = useState('subject-date');
  const [customPattern, setCustomPattern] = useState('');
  const [dateFormat, setDateFormat] = useState('YYYY-MM-DD');
  const [isApplying, setIsApplying] = useState(false);
  
  const { addNotification } = useNotification();

  /**
   * Get current naming pattern configuration
   */
  const currentPattern = useMemo(() => {
    if (namingConvention === 'custom') {
      return {
        name: 'Custom Pattern',
        pattern: customPattern,
        description: 'User-defined naming pattern',
        example: 'Preview based on pattern'
      };
    }
    return NAMING_PATTERNS[namingConvention] || NAMING_PATTERNS['subject-date'];
  }, [namingConvention, customPattern]);

  /**
   * Apply naming convention to a single file
   * @param {Object} file - File object with metadata
   * @param {Object} options - Naming options
   * @returns {string} New filename
   */
  const generateFileName = useCallback((file, options = {}) => {
    const pattern = options.pattern || currentPattern.pattern;
    const format = options.dateFormat || dateFormat;
    
    // Extract metadata from file analysis or file properties
    const metadata = {
      original: file.originalName || file.name,
      subject: file.analysis?.title || file.analysis?.subject || extractSubjectFromFilename(file.name),
      category: file.analysis?.category || 'Uncategorized',
      date: formatDate(file.dateModified || file.dateCreated || new Date(), format),
      extension: file.extension || getFileExtension(file.name),
      contentType: file.analysis?.contentType || 'document'
    };
    
    // Replace placeholders in pattern
    let newName = pattern;
    Object.entries(metadata).forEach(([key, value]) => {
      const placeholder = `{${key}}`;
      newName = newName.replace(new RegExp(placeholder, 'g'), value || '');
    });
    
    // Clean up the filename
    newName = cleanFileName(newName);
    
    // Ensure extension is preserved
    if (metadata.extension && !newName.endsWith(metadata.extension)) {
      newName += metadata.extension;
    }
    
    return newName;
  }, [currentPattern, dateFormat]);

  /**
   * Apply naming convention to multiple files
   * @param {Array} files - Array of file objects
   * @param {Object} options - Naming options
   */
  const applyNaming = useCallback(async (files, options = {}) => {
    if (isApplying) {
      addNotification('Naming operation already in progress', 'warning');
      return { success: false, error: 'Operation in progress' };
    }

    setIsApplying(true);
    
    try {
      const results = [];
      const operations = [];
      
      for (const file of files) {
        const newName = generateFileName(file, options);
        
        if (newName !== file.name) {
          const operation = {
            type: 'rename',
            source: file.path,
            newName: newName,
            originalName: file.name
          };
          
          operations.push(operation);
          
          try {
            // Perform rename operation via IPC
            await window.electronAPI.files.performOperation(operation);
            results.push({
              file: file.path,
              success: true,
              oldName: file.name,
              newName: newName,
              operation: 'rename'
            });
          } catch (error) {
            results.push({
              file: file.path,
              success: false,
              error: error.message,
              oldName: file.name,
              newName: newName,
              operation: 'rename'
            });
          }
        } else {
          results.push({
            file: file.path,
            success: true,
            oldName: file.name,
            newName: file.name,
            operation: 'skip',
            reason: 'Name unchanged'
          });
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      
      addNotification(
        `Naming complete: ${successCount} files renamed${failCount > 0 ? `, ${failCount} failed` : ''}`,
        failCount > 0 ? 'warning' : 'success'
      );
      
      return {
        success: true,
        operations: results.length,
        successCount,
        failCount,
        results
      };
      
    } catch (error) {
      addNotification(`Naming failed: ${error.message}`, 'error');
      return {
        success: false,
        error: error.message
      };
    } finally {
      setIsApplying(false);
    }
  }, [isApplying, generateFileName, addNotification]);

  /**
   * Preview how files will be renamed
   * @param {Array} files - Array of file objects
   * @param {Object} options - Naming options
   * @returns {Array} Array of preview objects
   */
  const previewNaming = useCallback((files, options = {}) => {
    return files.map(file => ({
      originalPath: file.path,
      originalName: file.name,
      newName: generateFileName(file, options),
      changed: generateFileName(file, options) !== file.name
    }));
  }, [generateFileName]);

  /**
   * Update naming convention
   * @param {string} convention - New naming convention
   */
  const updateNamingConvention = useCallback((convention) => {
    if (NAMING_PATTERNS[convention] || convention === 'custom') {
      setNamingConvention(convention);
    }
  }, []);

  /**
   * Get available naming patterns
   */
  const getAvailablePatterns = useCallback(() => {
    return Object.entries(NAMING_PATTERNS).map(([key, pattern]) => ({
      id: key,
      ...pattern
    }));
  }, []);

  return {
    namingConvention,
    customPattern,
    dateFormat,
    currentPattern,
    isApplying,
    generateFileName,
    applyNaming,
    previewNaming,
    updateNamingConvention,
    setCustomPattern,
    setDateFormat,
    getAvailablePatterns,
    availablePatterns: getAvailablePatterns()
  };
}

/**
 * Extract subject from filename by removing extension and cleaning up
 * @param {string} filename - Original filename
 * @returns {string} Extracted subject
 */
function extractSubjectFromFilename(filename) {
  if (!filename) return 'Untitled';
  
  // Remove extension
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
  
  // Clean up common patterns
  return nameWithoutExt
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, l => l.toUpperCase()) // Title case
    || 'Untitled';
}

/**
 * Get file extension including the dot
 * @param {string} filename - Filename
 * @returns {string} File extension
 */
function getFileExtension(filename) {
  if (!filename) return '';
  const match = filename.match(/\.[^/.]+$/);
  return match ? match[0] : '';
}

/**
 * Format date according to specified format
 * @param {Date|string} date - Date to format
 * @param {string} format - Date format pattern
 * @returns {string} Formatted date string
 */
function formatDate(date, format) {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  
  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day);
}

/**
 * Clean filename by removing invalid characters
 * @param {string} filename - Filename to clean
 * @returns {string} Cleaned filename
 */
function cleanFileName(filename) {
  if (!filename) return 'Untitled';
  
  return filename
    .replace(/[<>:"/\\|?*]/g, '') // Remove invalid characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
    .substring(0, 255); // Limit length
}

export default useNamingConvention; 