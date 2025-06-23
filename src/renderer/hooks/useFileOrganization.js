import { useState, useCallback } from 'react';

/**
 * Custom hook for managing file organization operations
 * Extracted from OrganizePhase to reduce component complexity
 */
export function useFileOrganization() {
  const [organizedFiles, setOrganizedFiles] = useState([]);
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, currentFile: '' });
  const [processedFileIds, setProcessedFileIds] = useState(new Set());
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [editingFiles, setEditingFiles] = useState({});

  // Mark files as processed
  const markFilesAsProcessed = useCallback((filePaths) => {
    const pathArray = Array.isArray(filePaths) ? filePaths : [filePaths];
    setProcessedFileIds(prev => new Set([...prev, ...pathArray]));
  }, []);

  // Unmark files as processed
  const unmarkFilesAsProcessed = useCallback((filePaths) => {
    const pathArray = Array.isArray(filePaths) ? filePaths : [filePaths];
    setProcessedFileIds(prev => {
      const newSet = new Set(prev);
      pathArray.forEach(path => newSet.delete(path));
      return newSet;
    });
  }, []);

  // Toggle file selection
  const toggleFileSelection = useCallback((index) => {
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  }, []);

  // Select all files
  const selectAllFiles = useCallback((fileCount) => {
    setSelectedFiles(new Set(Array.from({ length: fileCount }, (_, i) => i)));
  }, []);

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedFiles(new Set());
  }, []);

  // Handle file editing
  const handleEditFile = useCallback((fileIndex, field, value) => {
    setEditingFiles(prev => ({
      ...prev,
      [fileIndex]: {
        ...prev[fileIndex],
        [field]: value
      }
    }));
  }, []);

  // Get file with edits applied
  const getFileWithEdits = useCallback((file, index) => {
    const edits = editingFiles[index];
    if (!edits) return file;

    return {
      ...file,
      analysis: {
        ...file.analysis,
        suggestedName: edits.name || file.analysis.suggestedName,
        suggestedCategory: edits.category || file.analysis.suggestedCategory
      }
    };
  }, [editingFiles]);

  // Find smart folder for category
  const findSmartFolderForCategory = useCallback((category, smartFolders) => {
    if (!category || !smartFolders) return null;
    
    const categoryLower = category.toLowerCase();
    
    // First, try exact match
    let matchingFolder = smartFolders.find(folder => 
      folder.name.toLowerCase() === categoryLower
    );
    
    if (matchingFolder) return matchingFolder;
    
    // Then try partial match
    matchingFolder = smartFolders.find(folder => 
      folder.name.toLowerCase().includes(categoryLower) ||
      categoryLower.includes(folder.name.toLowerCase())
    );
    
    if (matchingFolder) return matchingFolder;
    
    // Finally, try keywords match
    matchingFolder = smartFolders.find(folder => {
      if (!folder.keywords) return false;
      return folder.keywords.some(keyword => 
        keyword.toLowerCase().includes(categoryLower) ||
        categoryLower.includes(keyword.toLowerCase())
      );
    });
    
    return matchingFolder;
  }, []);

  // Organize files function
  const organizeFiles = useCallback(async (filesToOrganize, smartFolders, documentsPath) => {
    if (!filesToOrganize || filesToOrganize.length === 0) {
      throw new Error('No files to organize');
    }

    setIsOrganizing(true);
    setBatchProgress({ current: 0, total: filesToOrganize.length, currentFile: '' });

    try {
      const operations = [];
      
      for (let i = 0; i < filesToOrganize.length; i++) {
        const file = filesToOrganize[i];
        const fileWithEdits = getFileWithEdits(file, i);
        
        setBatchProgress({ 
          current: i + 1, 
          total: filesToOrganize.length, 
          currentFile: file.name 
        });

        const category = fileWithEdits.analysis?.suggestedCategory || 'Uncategorized';
        const suggestedName = fileWithEdits.analysis?.suggestedName || file.name;
        
        // Find matching smart folder
        const matchingFolder = findSmartFolderForCategory(category, smartFolders);
        const targetDirectory = matchingFolder ? matchingFolder.path : `${documentsPath}/Uncategorized`;
        
        // Ensure file extension is preserved
        const originalExtension = file.name.split('.').pop();
        const finalName = suggestedName.includes('.') ? suggestedName : `${suggestedName}.${originalExtension}`;
        const targetPath = `${targetDirectory}/${finalName}`;

        operations.push({
          type: 'move',
          source: file.path,
          target: targetPath,
          metadata: {
            originalName: file.name,
            suggestedName: finalName,
            category: category,
            smartFolder: matchingFolder?.name || 'Uncategorized',
            analysis: fileWithEdits.analysis
          }
        });
      }

      // Execute batch operations
      const result = await window.electronAPI.files.executeBatchOperations(operations);
      
      if (result.success) {
        const successfulOperations = result.results.filter(r => r.success);
        const failedOperations = result.results.filter(r => !r.success);
        
        // Update organized files
        const newOrganizedFiles = successfulOperations.map(op => ({
          originalPath: op.operation.source,
          newPath: op.operation.target,
          name: op.operation.metadata.suggestedName,
          category: op.operation.metadata.category,
          smartFolder: op.operation.metadata.smartFolder,
          organizedAt: new Date().toISOString(),
          analysis: op.operation.metadata.analysis
        }));

        setOrganizedFiles(prev => [...prev, ...newOrganizedFiles]);
        markFilesAsProcessed(successfulOperations.map(op => op.operation.source));

        return {
          success: true,
          organized: successfulOperations.length,
          failed: failedOperations.length,
          organizedFiles: newOrganizedFiles,
          errors: failedOperations.map(op => op.error)
        };
      } else {
        throw new Error(result.error || 'Batch operation failed');
      }
    } catch (error) {
      console.error('Organization failed:', error);
      throw error;
    } finally {
      setIsOrganizing(false);
      setBatchProgress({ current: 0, total: 0, currentFile: '' });
    }
  }, [getFileWithEdits, findSmartFolderForCategory, markFilesAsProcessed]);

  return {
    // State
    organizedFiles,
    isOrganizing,
    batchProgress,
    processedFileIds,
    selectedFiles,
    editingFiles,
    
    // Actions
    markFilesAsProcessed,
    unmarkFilesAsProcessed,
    toggleFileSelection,
    selectAllFiles,
    clearSelection,
    handleEditFile,
    getFileWithEdits,
    findSmartFolderForCategory,
    organizeFiles,
    
    // Setters for loading persisted data
    setOrganizedFiles,
    setProcessedFileIds
  };
} 