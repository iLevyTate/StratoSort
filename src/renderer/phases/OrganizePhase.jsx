import React, { useState, useEffect } from 'react';

import { UndoRedoToolbar, useUndoRedo } from '../components/UndoRedoSystem';
import { useNotification } from '../contexts/NotificationContext';
import { usePhase } from '../contexts/PhaseContext';
import { useErrorHandler, withErrorHandling } from '../utils/ErrorHandling';
import PhaseLayout from '../layout/PhaseLayout';
import Badge, { BadgeGroup } from '../components/Badge';
import Button, { ButtonGroup } from '../components/Button';

const { PHASES } = require('../../shared/constants');

// Debug mode for development - can be toggled
const DEBUG_ORGANIZE = process.env.NODE_ENV === 'development' && false; // Set to true only when debugging

function debugLog(message, data = {}) {
  // Debug logging disabled in production and by default in development
  if (DEBUG_ORGANIZE && process.env.NODE_ENV === 'development') {
    // Use proper logging instead of console.log
    if (window.electronAPI?.system?.logError) {
      window.electronAPI.system.logError({
        message: `[ORGANIZE-DEBUG] ${message}`,
        context: 'OrganizePhase',
        level: 'info',
        metadata: data
      });
    }
  }
}

// Import the HistoryModal component
const HistoryModal = ({ onClose }) => {
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  
  useEffect(() => {
    const fetchHistory = async () => {
      setIsLoading(true);
      try {
        const historyData = await window.electronAPI.undoRedo.getHistory();
        setHistory(historyData || []);
      } catch (error) {
        console.error('Failed to fetch history:', error);
        setHistory([]);
      }
      setIsLoading(false);
    };
    fetchHistory();
  }, []);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="glass-card max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
        <div className="p-6 border-b border-white/20">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-on-glass">📜 Action History</h2>
            <button
              onClick={onClose}
              className="glass-button p-2 rounded-full hover:bg-white/20"
            >
              ✕
            </button>
          </div>
        </div>
        
        <div className="p-6 overflow-y-auto max-h-96">
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-readable-light">Loading history...</p>
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-4">📂</div>
              <h3 className="text-lg font-semibold text-on-glass mb-2">No Operations Yet</h3>
              <p className="text-readable-light">
                Start organizing files to see operation history here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((action, index) => (
                <div key={index} className="glass-card p-4">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">📝</span>
                    <div className="flex-1">
                      <p className="font-medium text-on-glass">{action.description || 'Unknown action'}</p>
                      <p className="text-sm text-readable-light">
                        {action.timestamp ? new Date(action.timestamp).toLocaleString() : 'Unknown time'}
                      </p>
                    </div>
                    {index === 0 && (
                      <span className="px-2 py-1 bg-blue-500/20 text-blue-300 text-xs rounded-full">
                        Latest
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function OrganizePhase() {
  const { actions, phaseData } = usePhase();
  const { addNotification } = useNotification();
  const { executeAction } = useUndoRedo();
  const { handleError, handleWarning } = useErrorHandler();
  const [organizedFiles, setOrganizedFiles] = useState([]);
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, currentFile: '' });
  const [documentsPath, setDocumentsPath] = useState('');
  const [editingFiles, setEditingFiles] = useState({});
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [bulkEditMode, setBulkEditMode] = useState(false);
  const [bulkCategory, setBulkCategory] = useState('');
  const [defaultLocation, setDefaultLocation] = useState('Documents');
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isHistoryVisible, setIsHistoryVisible] = useState(false);

  // File state tracking
  const [fileStates, setFileStates] = useState({});
  const [processedFileIds, setProcessedFileIds] = useState(new Set()); // Track which files have been processed

  // Load persisted data from previous phases
  useEffect(() => {
    const loadPersistedData = () => {
      if (phaseData.organizedFiles) {
        setOrganizedFiles(phaseData.organizedFiles);
      }
      
      if (phaseData.analysisResults) {
        // Analysis results are passed from DiscoverPhase
        debugLog('Loaded analysis results', { count: phaseData.analysisResults.length });
      }
    };
    
    loadPersistedData();
  }, [phaseData]);

  // Get analysis results from phase data
  const analysisResults = phaseData.analysisResults || [];
  const [smartFolders, setSmartFolders] = useState([]);
  
  console.log('OrganizePhase received data:', {
    analysisResults: analysisResults.length,
    smartFolders: smartFolders.length,
    analysisResultsStructure: analysisResults[0]
  });

  // Initialize component
  useEffect(() => {
    const loadDocumentsPath = async () => {
      try {
        const path = await window.electronAPI.files.getDocumentsPath();
        setDocumentsPath(path);
        
        const settings = await window.electronAPI.settings.get();
        if (settings && settings.defaultSmartFolderLocation) {
          setDefaultLocation(settings.defaultSmartFolderLocation);
        }
      } catch (error) {
        handleError(error, 'Documents Path Load', false);
        setDocumentsPath('Documents'); // Fallback
      }
    };

    const loadSmartFolders = async () => {
      try {
        const response = await window.electronAPI.smartFolders.get();
        if (response && response.success) {
          setSmartFolders(response.folders || []);
          console.log('Loaded smart folders:', response.folders?.length || 0);
        }
      } catch (error) {
        handleError(error, 'Smart Folders Load', false);
      }
    };

    loadDocumentsPath();
    loadSmartFolders();
    
    // Set up progress monitoring
    const progressCleanup = window.electronAPI.events.onOperationProgress((progressData) => {
      if (progressData.type === 'batch_organize' && progressData.current !== undefined) {
        setBatchProgress({
          current: progressData.current,
          total: progressData.total || 0,
          currentFile: progressData.currentFile || ''
        });
      }
    });

    return () => {
      if (progressCleanup) {
        progressCleanup();
      }
    };
  }, [handleError]);

  // Load undo/redo status
  useEffect(() => {
    checkUndoRedoStatus();
  }, []);

  // Check undo/redo availability
  const checkUndoRedoStatus = async () => {
    try {
      const canUndoResult = await window.electronAPI.undoRedo.canUndo();
      const canRedoResult = await window.electronAPI.undoRedo.canRedo();
      setCanUndo(!!canUndoResult);
      setCanRedo(!!canRedoResult);
    } catch (error) {
      handleError(error, 'Undo/Redo Status Check', false);
    }
  };

  // Handle undo
  const handleUndo = async () => {
    try {
      await window.electronAPI.undoRedo.undo();
      addNotification('Action undone successfully', 'success');
      await checkUndoRedoStatus();
    } catch (error) {
      handleError(error, 'Undo Operation');
    }
  };

  // Handle redo
  const handleRedo = async () => {
    try {
      await window.electronAPI.undoRedo.redo();
      addNotification('Action redone successfully', 'success');
      await checkUndoRedoStatus();
    } catch (error) {
      handleError(error, 'Redo Operation');
    }
  };

  // Show analysis status if analysis is still running from discover phase
  const isAnalysisRunning = phaseData.isAnalyzing || false;
  const analysisProgressFromDiscover = phaseData.analysisProgress || { current: 0, total: 0 };

  // NEW: Get current file state from discover phase
  const getFileState = (filePath) => {
    return fileStates[filePath]?.state || 'pending';
  };

  // NEW: Get file state display (consistent with discover phase)
  const getFileStateDisplay = (filePath, hasAnalysis, isProcessed = false) => {
    if (isProcessed) {
      return { icon: '✅', label: 'Organized', color: 'text-green-600', spinning: false };
    }
    
    const state = getFileState(filePath);
    
    if (state === 'analyzing') {
      return { icon: '🔄', label: 'Analyzing...', color: 'text-blue-600', spinning: true };
    } else if (state === 'error') {
      return { icon: '❌', label: 'Error', color: 'text-red-600', spinning: false };
    } else if (hasAnalysis && state === 'ready') {
      return { icon: '📂', label: 'Ready', color: 'text-blue-600', spinning: false };
    } else if (state === 'pending') {
      return { icon: '⏳', label: 'Pending', color: 'text-yellow-600', spinning: false };
    } else {
      return { icon: '❌', label: 'Failed', color: 'text-red-600', spinning: false };
    }
  };

  // NEW: Filter files to show unprocessed and processed separately
  const unprocessedFiles = analysisResults.filter((result) => 
    !processedFileIds.has(result.file.path) && result.analysis
  );
  
  const processedFiles = organizedFiles.filter((file) => 
    processedFileIds.has(file.originalPath || file.path)
  );

  // Toggle file selection
  const toggleFileSelection = (index) => {
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedFiles(newSelected);
  };

  // Select all files
  const selectAllFiles = () => {
    if (selectedFiles.size === unprocessedFiles.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(Array.from({ length: unprocessedFiles.length }, (_, i) => i)));
    }
  };

  // Apply bulk category change
  const applyBulkCategoryChange = () => {
    if (!bulkCategory) return;
    
    const newEdits = {};
    selectedFiles.forEach((index) => {
      newEdits[index] = {
        ...editingFiles[index],
        category: bulkCategory
      };
    });
    
    setEditingFiles((prev) => ({ ...prev, ...newEdits }));
    setBulkEditMode(false);
    setBulkCategory('');
    setSelectedFiles(new Set());
    addNotification(`Applied category "${bulkCategory}" to ${selectedFiles.size} files`, 'success');
  };

  // Approve selected files for organization
  const approveSelectedFiles = () => {
    if (selectedFiles.size === 0) return;
    
    addNotification(`Approved ${selectedFiles.size} files for organization`, 'success');
    setSelectedFiles(new Set());
  };

  // Find smart folder for category with enhanced matching
  const findSmartFolderForCategory = (category) => {
    if (!category) {
      console.warn('[FOLDER-MATCH] No category provided');
      return null;
    }
    
    debugLog(`Finding smart folder for category: "${category}"`);
    debugLog('Available smart folders:', smartFolders.map((f) => ({ name: f.name, path: f.path })));
    
    // Try category variations (plurals, singulars, etc.)
    const categoryVariations = [
      category.toLowerCase(),
      category.toLowerCase().replace(/s$/, ''), // Remove plural
      `${category.toLowerCase()  }s`, // Add plural
      category.toLowerCase().replace(/ies$/, 'y'), // countries -> country
      category.toLowerCase().replace(/y$/, 'ies') // category -> categories
    ];
    
    debugLog(`Trying variations: [${categoryVariations.join(', ')}]`);
    
    for (const variant of categoryVariations) {
      const folder = smartFolders.find((f) => 
        f.name.toLowerCase() === variant ||
        f.name.toLowerCase().includes(variant) ||
        variant.includes(f.name.toLowerCase())
      );
      if (folder) {
        debugLog(`✅ Variation match found: "${folder.name}" for variant "${variant}"`);
        return folder;
      }
    }
    
    // Step 3: Fuzzy matching with scoring
    debugLog('Attempting fuzzy matching...');
    let bestMatch = null;
    let bestScore = 0;
    const minScore = 5; // Minimum score threshold
    
    for (const f of smartFolders) {
      let score = 0;
      const folderName = f.name.toLowerCase();
      
      // Direct substring matches (higher weight)
      if (folderName.includes(category)) {
        debugLog(`"${f.name}" contains "${category}": +10 points`);
        score += 10;
      }
      
      if (category.includes(folderName)) {
        debugLog(`"${category}" contains "${f.name}": +8 points`);
        score += 8;
      }
      
      // Word-level matches
      const categoryWords = category.split(/[\s\-_]+/);
      const folderWords = folderName.split(/[\s\-_]+/);
      
      for (const cWord of categoryWords) {
        for (const fWord of folderWords) {
          if (cWord === fWord) {
            debugLog(`Word match "${cWord}" = "${fWord}": +5 points`);
            score += 5;
          } else if (cWord.includes(fWord) || fWord.includes(cWord)) {
            debugLog(`Partial word match "${cWord}" ~ "${fWord}": +3 points`);
            score += 3;
          }
        }
      }
      
      // Description matching
      if (f.description) {
        const descLower = f.description.toLowerCase();
        if (descLower.includes(category)) {
          debugLog('Description contains category: +4 points');
          score += 4;
        }
        
        for (const word of categoryWords) {
          if (descLower.includes(word)) {
            debugLog(`Description contains word "${word}": +2 points`);
            score += 2;
          }
        }
      }
      
      // Keywords matching
      if (f.keywords && Array.isArray(f.keywords)) {
        for (const keyword of f.keywords) {
          if (keyword.toLowerCase() === category) {
            debugLog(`Keyword exact match "${keyword}": +4 points`);
            score += 4;
          } else if (keyword.toLowerCase().includes(category) || category.includes(keyword.toLowerCase())) {
            debugLog(`Keyword partial match "${keyword}": +2 points`);
            score += 2;
          }
        }
      }
      
      debugLog(`"${f.name}" total score: ${score}`);
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = f;
      }
    }
    
    if (bestMatch && bestScore >= minScore) {
      debugLog(`✅ Best match found: "${bestMatch.name}" with score ${bestScore}`);
      return bestMatch;
    } else {
      debugLog(`No fuzzy match found (best score: ${bestScore})`);
    }
    
    // Step 4: Try to use or create a default folder for this category
    if (smartFolders.length > 0) {
      const defaultFolder = smartFolders.find((f) => f.name.toLowerCase().includes('document') || f.name.toLowerCase().includes('misc'));
      if (defaultFolder) {
        debugLog(`✅ Using default folder: "${defaultFolder.name}" for category "${category}"`);
        return defaultFolder;
      }
    }
    
    // Step 5: Intelligent category mapping
    const categoryMappings = {
      'receipts': ['financial', 'finance', 'business'],
      'invoices': ['financial', 'finance', 'business'],
      'contracts': ['legal', 'business', 'documents'],
      'photos': ['images', 'pictures', 'media'],
      'music': ['audio', 'media', 'entertainment'],
      'videos': ['media', 'entertainment'],
      'spreadsheets': ['data', 'business', 'financial'],
      'presentations': ['business', 'work', 'documents'],
      'reports': ['business', 'work', 'documents'],
      'manuals': ['reference', 'documentation', 'guides'],
      'certificates': ['personal', 'documents', 'credentials'],
      'resumes': ['personal', 'career', 'documents']
    };
    
    const possibleMappings = categoryMappings[category.toLowerCase()] || [];
    debugLog(`Trying intelligent mappings for "${category}": [${possibleMappings.join(', ')}]`);
    
    for (const mapping of possibleMappings) {
      const mappedFolder = smartFolders.find((f) => 
        f.name.toLowerCase().includes(mapping) ||
        (f.keywords && f.keywords.some((k) => k.toLowerCase().includes(mapping)))
      );
      if (mappedFolder) {
        debugLog(`✅ Mapped category "${category}" to "${mappedFolder.name}" via intelligent mapping`);
        return mappedFolder;
      }
    }
    
    // Final fallback: use first available folder
    if (smartFolders.length > 0) {
      debugLog(`⚠️ Using first available folder "${smartFolders[0].name}" as final fallback`);
      return smartFolders[0];
    }
    
    console.error(`[FOLDER-MATCH] ❌ No match found for category: "${category}" (no smart folders available)`);
    return null;
  };

  // Handle editing file properties
  const handleEditFile = (fileIndex, field, value) => {
    setEditingFiles((prev) => ({
      ...prev,
      [fileIndex]: {
        ...prev[fileIndex],
        [field]: value
      }
    }));
  };

  // Apply edits to analysis results
  const getFileWithEdits = (result, index) => {
    const edits = editingFiles[index];
    if (!edits) return result;
    
    return {
      ...result,
      analysis: {
        ...result.analysis,
        suggestedName: edits.suggestedName || result.analysis?.suggestedName,
        category: edits.category || result.analysis?.category
      }
    };
  };

  /**
   * Mark files as processed after successful organization
   * @param {string[]} filePaths - Array of file paths to mark as processed
   */
  const markFilesAsProcessed = (filePaths) => {
    setProcessedFileIds((prev) => {
      const newSet = new Set(prev);
      filePaths.forEach((path) => newSet.add(path));
      return newSet;
    });
    debugLog('Files marked as processed', { count: filePaths.length, files: filePaths });
  };

  /**
   * Unmark files as processed (used during undo operations)
   * @param {string[]} filePaths - Array of file paths to unmark
   */
  const unmarkFilesAsProcessed = (filePaths) => {
    setProcessedFileIds((prev) => {
      const newSet = new Set(prev);
      filePaths.forEach((path) => newSet.delete(path));
      return newSet;
    });
    debugLog('Files unmarked as processed', { count: filePaths.length, files: filePaths });
  };

  const handleOrganizeFiles = async () => {
    if (unprocessedFiles.length === 0) {
      addNotification('No files to organize', 'warning');
      return;
    }
    
    debugLog('Starting organization process', {
      documentsPath,
      smartFoldersCount: smartFolders.length,
      unprocessedFilesCount: unprocessedFiles.length
    });
    
    if (!documentsPath) {
      addNotification('Documents path not loaded. Please refresh the page.', 'error');
      return;
    }
    
    setIsOrganizing(true);
    setBatchProgress({ current: 0, total: unprocessedFiles.length, currentFile: '' });
    
    try {
      addNotification(`Starting organization of ${unprocessedFiles.length} files...`, 'info');
      
      // Build operations with proper destination paths
      const operations = [];
      const skippedFiles = [];
      
      for (let i = 0; i < unprocessedFiles.length; i++) {
        const result = unprocessedFiles[i];
        const file = getFileWithEdits(result, i);
        
        // Skip files without analysis
        if (!file.analysis || !file.analysis.category) {
          skippedFiles.push({ name: file.file.name, reason: 'No analysis data' });
          continue;
        }
        
        // Find the appropriate smart folder
        let smartFolder = findSmartFolderForCategory(file.analysis.category);
        
        // If no exact match found, try fallback strategies
        if (!smartFolder) {
          debugLog(`No match for category "${file.analysis.category}", trying fallbacks...`);
          
          // Try to find a general/default folder
          smartFolder = smartFolders.find((f) => 
            f.name.toLowerCase().includes('general') ||
            f.name.toLowerCase().includes('other') ||
            f.name.toLowerCase().includes('misc') ||
            f.name.toLowerCase().includes('default') ||
            f.name.toLowerCase().includes('documents')
          );
          
          // If still no match, use the first available folder
          if (!smartFolder && smartFolders.length > 0) {
            smartFolder = smartFolders[0];
            debugLog(`Using first available folder: ${smartFolder.name}`);
          }
          
          if (!smartFolder) {
            addNotification(`No smart folder found for category: ${file.analysis.category}`, 'warning');
            skippedFiles.push({ name: file.file.name, reason: `No folder for category: ${file.analysis.category}` });
            continue;
          } else {
            addNotification(`Mapped "${file.analysis.category}" to fallback folder: ${smartFolder.name}`, 'info');
          }
        }
        
        // Build the full destination path with proper validation
        let destinationFolder;
        try {
          if (smartFolder.path && (smartFolder.path.startsWith('/') || smartFolder.path.includes(':'))) {
            // Absolute path - use as-is since it's already normalized by the backend
            destinationFolder = smartFolder.path;
            debugLog(`Using absolute path: ${destinationFolder}`);
          } else if (smartFolder.path) {
            // Relative path from Documents - let the backend handle path joining
            destinationFolder = smartFolder.path;
            debugLog(`Using smart folder path: ${smartFolder.path}`);
          } else {
            // Default to Documents/FolderName - let the backend handle path joining
            destinationFolder = smartFolder.name;
            debugLog(`Using smart folder name: ${smartFolder.name}`);
          }
          
          debugLog(`Final destination folder: ${destinationFolder}`);
          
        } catch (pathError) {
          debugLog('Path construction error', { error: pathError.message, file: file.file.name });
          skippedFiles.push({ name: file.file.name, reason: 'Invalid destination path' });
          continue;
        }
        
        // Ensure the suggested name has an extension
        let fileName = file.analysis.suggestedName || file.file.name;
        const originalExt = file.file.name.includes('.') ? `.${  file.file.name.split('.').pop()}` : '';
        if (!fileName.includes('.') && originalExt) {
          fileName += originalExt;
        }
        
        // Validate file name
        if (!fileName || fileName.trim() === '') {
          fileName = file.file.name; // Fallback to original name
        }
        
        // Send both folder path and filename to backend for proper path construction
        const destination = {
          folderPath: destinationFolder,
          fileName: fileName
        };
        
        debugLog('Preparing file operation', {
          source: file.file.path,
          destination,
          smartFolder: smartFolder.name,
          category: file.analysis.category
        });
        
        operations.push({
          type: 'move',
          source: file.file.path,
          destination,
          metadata: {
            ...file.analysis,
            smartFolder: smartFolder.name,
            originalName: file.file.name,
            originalPath: file.file.path
          }
        });
      }

      if (operations.length === 0) {
        addNotification('No files ready for organization', 'warning');
        return;
      }

      if (skippedFiles.length > 0) {
        addNotification(`Skipping ${skippedFiles.length} files without proper analysis`, 'info');
      }

      // Execute with undo capability and progress tracking
      debugLog('Starting file organization', { operationsCount: operations.length });
      
              const results = await executeAction({
          type: 'BATCH_ORGANIZE',
          description: `Organize ${operations.length} files`,
        execute: async () => {
          setBatchProgress({
            current: 0,
            total: operations.length,
            currentFile: 'Starting...'
          });

          debugLog('About to call performOperation', {
            type: 'batch_organize',
            operationsCount: operations.length
          });

          try {
            const result = await window.electronAPI.files.performOperation({
              type: 'batch_organize',
              operations
            });
            
            debugLog('File operation result', {
              successCount: result?.successCount,
              failCount: result?.failCount,
              totalResults: result?.results?.length
            });
            
            setBatchProgress({
              current: operations.length,
              total: operations.length,
              currentFile: 'Complete!'
            });
            return result;
          } catch (error) {
            debugLog('File operation failed', { error: error.message });
            setBatchProgress({
              current: 0,
              total: operations.length,
              currentFile: 'Error occurred'
            });
            throw error;
          }
        },
        undo: async () => {
          // Implement undo logic - move files back to original locations
          const undoOperations = operations.map((op) => ({
            type: 'move',
            source: op.destination,
            destination: op.source
          }));
          
          // Unmark files as processed when undoing
          const filePaths = operations.map((op) => op.source);
          unmarkFilesAsProcessed(filePaths);
          
          return await window.electronAPI.files.performOperation({
            type: 'batch_organize',
            operations: undoOperations
          });
        },
        metadata: {
          fileCount: operations.length,
          operations
        }
      });

      // NEW: Mark organized files as processed
      const organizedFilePaths = operations.map((op) => op.source);
      markFilesAsProcessed(organizedFilePaths);

      // NEW: Create organized file records with proper metadata
      const newOrganizedFiles = operations.map((op, index) => ({
        originalPath: op.source,
        newPath: op.destination,
        originalName: op.metadata.originalName,
        newName: op.destination.split(/[/\\]/).pop(),
        smartFolder: op.metadata.smartFolder,
        category: op.metadata.category,
        organizedAt: new Date().toISOString(),
        success: true
      }));

      setOrganizedFiles((prev) => [...prev, ...newOrganizedFiles]);
      
      // Persist organized files data
      actions.setPhaseData('organizedFiles', [...organizedFiles, ...newOrganizedFiles]);
      actions.setPhaseData('processedFileIds', Array.from(processedFileIds));
      
      addNotification(`Successfully organized ${operations.length} files!`, 'success');
      
      // Don't auto-advance if there are still unprocessed files
      const remainingUnprocessed = analysisResults.filter((file) => 
        !processedFileIds.has(file.path) && !organizedFilePaths.includes(file.path) && file.analysis
      );
      
      if (remainingUnprocessed.length === 0) {
        // Auto-advance to complete phase only if all files are processed
        setTimeout(() => {
          actions.advancePhase(PHASES.COMPLETE, { 
            organizedFiles: [...organizedFiles, ...newOrganizedFiles] 
          });
        }, 1500);
      } else {
        addNotification(`${remainingUnprocessed.length} files remaining for organization`, 'info');
      }
      
    } catch (error) {
      console.error('Organization failed:', error);
      addNotification(`File organization failed: ${error.message}`, 'error');
    } finally {
      setIsOrganizing(false);
      setBatchProgress({ current: 0, total: 0, currentFile: '' });
    }
  };

  return (
    <PhaseLayout>
      <div className="h-full flex flex-col p-2 sm:p-4">
        {/* Compact Header Section */}
        <div className="flex-shrink-0 py-2 px-4 text-center">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-lg sm:text-xl font-bold text-on-glass mb-1">
              📂 Review & Organize
            </h1>
            <p className="text-sm text-readable max-w-2xl mx-auto">
              Review AI suggestions and organize your files into smart folders
            </p>
          </div>
        </div>

        {/* Compact Toolbar Section */}
        <div className="flex-shrink-0 px-4 pb-3">
          <div className="max-w-6xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <UndoRedoToolbar
                onUndo={handleUndo}
                onRedo={handleRedo}
                canUndo={canUndo}
                canRedo={canRedo}
                onToggleHistory={() => setIsHistoryVisible(true)}
              />
              <div className="flex items-center gap-2">
                <button 
                  onClick={selectAllFiles}
                  className="btn-glass-subtle text-sm px-3 py-2"
                  disabled={isOrganizing || unprocessedFiles.length === 0}
                >
                  Select All
                </button>
                <button
                  onClick={() => setIsHistoryVisible(true)}
                  className="btn-glass-subtle text-sm px-3 py-2"
                >
                  📊 History
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Compact Status Overview */}
        <div className="flex-shrink-0 px-4 pb-3">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Smart Folders */}
              {smartFolders.length > 0 && (
                <div className="card-glass-medium p-4">
                  <h3 className="text-sm font-bold text-on-glass mb-2">Smart Folders</h3>
                  <div className="flex flex-wrap gap-2">
                    {smartFolders.slice(0, 3).map((folder) => (
                      <Badge key={folder.id} variant="primary-solid" size="sm">
                        {folder.name}
                      </Badge>
                    ))}
                    {smartFolders.length > 3 && (
                      <Badge variant="primary-solid" size="sm">
                        +{smartFolders.length - 3} more
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              {/* File Status */}
              {(unprocessedFiles.length > 0 || processedFiles.length > 0) && (
                <div className="card-glass-medium p-4">
                  <h3 className="text-sm font-bold text-on-glass mb-2">File Status</h3>
                  <div className="flex justify-around">
                    <div className="text-center">
                      <p className="text-lg font-bold text-blue-300">{unprocessedFiles.length}</p>
                      <p className="text-xs text-readable-light">Ready</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-green-300">{processedFiles.length}</p>
                      <p className="text-xs text-readable-light">Done</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main Content Area - Scrollable */}
        <div className="flex-1 px-4 overflow-y-auto min-h-0">
          <div className="max-w-6xl mx-auto">
            {unprocessedFiles.length > 0 && (
              <div className="space-y-4">
                {unprocessedFiles.map((result, index) => {
                  const fileWithEdits = getFileWithEdits(result, index);
                  const smartFolder = findSmartFolderForCategory(fileWithEdits.analysis?.category);
                  const isSelected = selectedFiles.has(index);
                  const stateDisplay = getFileStateDisplay(result.file.path, !!result.analysis);
                  
                  return (
                    <div key={index} className={`card-glass-medium p-6 interactive-lift ${isSelected ? 'ring-2 ring-blue-500/50' : ''}`}>
                      <div className="flex items-start gap-3">
                        <label className="flex-shrink-0 pt-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleFileSelection(index)}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                          />
                        </label>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-3 mb-2">
                            <div className="flex-shrink-0 w-10 h-10 bg-gradient-primary rounded-lg flex items-center justify-center">
                              <span className="text-lg">📄</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-bold text-on-glass truncate">{result.file.name}</h4>
                              <p className="text-xs text-readable-light">
                                {result.file.size ? `${Math.round(result.file.size / 1024)} KB` : 'Size unknown'}
                              </p>
                            </div>
                            <div className="flex-shrink-0">
                              <Badge size="sm" variant={stateDisplay.color} dot={stateDisplay.spinning}>
                                {stateDisplay.label}
                              </Badge>
                            </div>
                          </div>
                        
                          {fileWithEdits.analysis && (
                            <div className="space-y-2">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                <div>
                                  <label className="form-label text-xs mb-1">Suggested Name</label>
                                  <input
                                    type="text"
                                    value={editingFiles[index]?.suggestedName || fileWithEdits.analysis.suggestedName}
                                    onChange={(e) => handleEditFile(index, 'suggestedName', e.target.value)}
                                    className="form-input text-xs p-2"
                                  />
                                </div>
                                <div>
                                  <label className="form-label text-xs mb-1">Category</label>
                                  <select
                                    value={editingFiles[index]?.category || fileWithEdits.analysis.category}
                                    onChange={(e) => handleEditFile(index, 'category', e.target.value)}
                                    className="form-select text-xs p-2"
                                  >
                                    {smartFolders.map((folder) => (
                                      <option key={folder.id} value={folder.name}>{folder.name}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {unprocessedFiles.length > 0 && (
              <div className="card-glass-medium p-8 text-center mt-8">
                <div className="w-16 h-16 bg-gradient-accent rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <span className="text-3xl">✨</span>
                </div>
                <h3 className="text-heading font-bold text-on-glass mb-4">Ready to Organize</h3>
                <p className="text-body text-readable max-w-lg mx-auto mb-8">
                  StratoSort will move and rename <strong className="text-on-glass">{unprocessedFiles.filter((f) => f.analysis).length} files</strong> according to AI suggestions with intelligent categorization.
                </p>
                
                {isOrganizing ? (
                  <div className="py-6">
                    <div className="flex items-center justify-center gap-4 text-blue-600 mb-6">
                      <div className="animate-spin w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full"></div>
                      <span className="text-xl font-bold">Organizing Files...</span>
                    </div>
                    
                    {batchProgress.total > 0 && (
                      <div className="max-w-md mx-auto mb-6">
                        <div className="flex justify-between text-sm text-readable-light mb-3">
                          <span>Progress: {batchProgress.current} of {batchProgress.total}</span>
                          <span className="font-bold">{Math.round((batchProgress.current / batchProgress.total) * 100)}%</span>
                        </div>
                        <div className="w-full bg-white/20 rounded-full h-3 mb-4">
                          <div 
                            className="bg-gradient-primary h-3 rounded-full transition-all duration-300"
                            style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                          />
                        </div>
                        {batchProgress.currentFile && (
                          <p className="text-sm text-readable-light truncate">
                            <span className="font-medium">Processing:</span> {batchProgress.currentFile}
                          </p>
                        )}
                      </div>
                    )}
                    
                    <p className="text-body text-readable-light">
                      Please wait while your files are being organized with AI precision
                    </p>
                  </div>
                ) : (
                  <button 
                    onClick={handleOrganizeFiles}
                    className="btn-glass-hero px-8 py-4 text-lg font-bold interactive-scale"
                    disabled={unprocessedFiles.filter((f) => f.analysis).length === 0}
                  >
                    🚀 Organize Files Now
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Phase Navigation - Fixed at bottom */}
        <div className="flex-shrink-0 px-4 py-6">
          <div className="max-w-4xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
              <button 
                onClick={() => actions.advancePhase(PHASES.DISCOVER)}
                className="btn-glass-subtle px-6 py-3 interactive-glow w-full sm:w-auto"
                disabled={isOrganizing}
              >
                ← Back to Discovery
              </button>
              <button 
                onClick={() => actions.advancePhase(PHASES.COMPLETE)}
                disabled={processedFiles.length === 0 || isOrganizing}
                className="btn-glass-primary px-6 py-3 interactive-scale w-full sm:w-auto"
              >
                View Results →
              </button>
            </div>
          </div>
        </div>

        {isHistoryVisible && <HistoryModal onClose={() => setIsHistoryVisible(false)} />}
      </div>
    </PhaseLayout>
  );
}

export default OrganizePhase;
