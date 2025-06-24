import { useState, useCallback, useRef } from 'react';
import { useNotification } from '../contexts/NotificationContext';

/**
 * Hook for managing file organization operations
 * @returns {Object} File organization state and methods
 */
export function useFileOrganization() {
  const [organizedFiles, setOrganizedFiles] = useState([]);
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [organizationProgress, setOrganizationProgress] = useState({
    current: 0,
    total: 0,
    currentFile: ''
  });
  
  const { addNotification } = useNotification();
  const abortControllerRef = useRef(null);

  /**
   * Organize files according to analysis results and smart folders
   * @param {Array} files - Array of files to organize
   * @param {Array} smartFolders - Array of smart folder configurations
   * @param {Object} options - Organization options
   */
  const organizeFiles = useCallback(async (files, smartFolders = [], options = {}) => {
    if (isOrganizing) {
      addNotification('Organization already in progress', 'warning');
      return { success: false, error: 'Organization in progress' };
    }

    setIsOrganizing(true);
    setOrganizationProgress({ current: 0, total: files.length, currentFile: '' });
    
    // Create abort controller for cancellation
    abortControllerRef.current = new AbortController();
    
    try {
      const operations = [];
      const results = [];
      
      for (let i = 0; i < files.length; i++) {
        if (abortControllerRef.current?.signal.aborted) {
          throw new Error('Organization cancelled by user');
        }
        
        const file = files[i];
        setOrganizationProgress({
          current: i + 1,
          total: files.length,
          currentFile: file.name || file.path
        });
        
        // Determine target folder based on analysis and smart folders
        const targetFolder = determineTargetFolder(file, smartFolders, options);
        
        if (targetFolder && targetFolder !== file.directory) {
          const operation = {
            type: 'move',
            source: file.path,
            destination: `${targetFolder}/${file.name}`,
            file: file
          };
          
          operations.push(operation);
          
          // Perform the actual file operation via IPC
          try {
            const result = await window.electronAPI.files.performOperation(operation);
            results.push({
              file: file.path,
              success: true,
              newPath: operation.destination,
              operation: 'move'
            });
          } catch (error) {
            results.push({
              file: file.path,
              success: false,
              error: error.message,
              operation: 'move'
            });
          }
        } else {
          results.push({
            file: file.path,
            success: true,
            newPath: file.path,
            operation: 'skip',
            reason: 'Already in correct location'
          });
        }
      }
      
      setOrganizedFiles(prev => [...prev, ...results.filter(r => r.success)]);
      
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      
      addNotification(
        `Organization complete: ${successCount} files organized${failCount > 0 ? `, ${failCount} failed` : ''}`,
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
      addNotification(`Organization failed: ${error.message}`, 'error');
      return {
        success: false,
        error: error.message
      };
    } finally {
      setIsOrganizing(false);
      setOrganizationProgress({ current: 0, total: 0, currentFile: '' });
      abortControllerRef.current = null;
    }
  }, [isOrganizing, addNotification]);

  /**
   * Cancel ongoing organization operation
   */
  const cancelOrganization = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      addNotification('Organization cancelled', 'info');
    }
  }, [addNotification]);

  /**
   * Clear organized files history
   */
  const clearOrganizedFiles = useCallback(() => {
    setOrganizedFiles([]);
  }, []);

  /**
   * Get organization statistics
   */
  const getOrganizationStats = useCallback(() => {
    return {
      totalOrganized: organizedFiles.length,
      isOrganizing,
      progress: organizationProgress
    };
  }, [organizedFiles.length, isOrganizing, organizationProgress]);

  return {
    organizedFiles,
    isOrganizing,
    organizationProgress,
    organizeFiles,
    cancelOrganization,
    clearOrganizedFiles,
    getOrganizationStats
  };
}

/**
 * Determine target folder for a file based on analysis and smart folders
 * @param {Object} file - File object with analysis results
 * @param {Array} smartFolders - Array of smart folder configurations
 * @param {Object} options - Organization options
 * @returns {string|null} Target folder path or null if no move needed
 */
function determineTargetFolder(file, smartFolders, options = {}) {
  // If file has analysis results, use them for smart folder matching
  if (file.analysis) {
    const { category, contentType, confidence } = file.analysis;
    
    // Find matching smart folder
    const matchingFolder = smartFolders.find(folder => {
      if (folder.rules) {
        return folder.rules.some(rule => {
          switch (rule.type) {
            case 'category':
              return rule.value.toLowerCase() === category?.toLowerCase();
            case 'content_type':
              return rule.value.toLowerCase() === contentType?.toLowerCase();
            case 'confidence':
              return confidence >= rule.value;
            case 'file_type':
              return file.extension?.toLowerCase() === rule.value.toLowerCase();
            default:
              return false;
          }
        });
      }
      return false;
    });
    
    if (matchingFolder) {
      return matchingFolder.path;
    }
  }
  
  // Fallback to basic file type organization
  if (options.useBasicOrganization) {
    const extension = file.extension?.toLowerCase();
    const basicFolders = {
      'pdf': 'Documents/PDFs',
      'doc': 'Documents',
      'docx': 'Documents',
      'txt': 'Documents/Text',
      'jpg': 'Pictures',
      'jpeg': 'Pictures',
      'png': 'Pictures',
      'gif': 'Pictures',
      'mp4': 'Videos',
      'avi': 'Videos',
      'mov': 'Videos',
      'mp3': 'Music',
      'wav': 'Music',
      'flac': 'Music'
    };
    
    return basicFolders[extension] || null;
  }
  
  return null;
}

export default useFileOrganization; 