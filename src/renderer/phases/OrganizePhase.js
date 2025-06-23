import React, { useState, useEffect } from "react";
import { usePhase } from "../contexts/PhaseContext";
import { useNotification } from "../contexts/NotificationContext";
import { useUndoRedo, UndoRedoToolbar } from "../components/UndoRedoSystem";
const { PHASES } = require("../../shared/constants");

function OrganizePhase() {
  const { actions, phaseData } = usePhase();
  const { addNotification } = useNotification();
  const { executeAction } = useUndoRedo();
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

  // NEW: File processing states from discover phase
  const [fileStates, setFileStates] = useState({});
  const [processedFileIds, setProcessedFileIds] = useState(new Set()); // Track which files have been processed

  const analysisResults = phaseData.analysisResults || [];
  const smartFolders = phaseData.smartFolders || [];

  // NEW: Load persisted file states and processed files
  useEffect(() => {
    const loadPersistedData = () => {
      console.log('[ORGANIZE-PHASE] Loading persisted data:', {
        analysisResultsCount: (phaseData.analysisResults || []).length,
        fileStatesCount: Object.keys(phaseData.fileStates || {}).length,
        selectedFilesCount: (phaseData.selectedFiles || []).length,
        organizedFilesCount: (phaseData.organizedFiles || []).length
      });
      
      // Load file states from discover phase
      const persistedStates = phaseData.fileStates || {};
      setFileStates(persistedStates);
      
      // If we don't have file states but we have analysis results, reconstruct them
      if (Object.keys(persistedStates).length === 0 && analysisResults.length > 0) {
        console.log('[ORGANIZE-PHASE] Reconstructing file states from analysis results');
        const reconstructedStates = {};
        
        analysisResults.forEach((file) => {
          if (file.analysis && !file.error) {
            reconstructedStates[file.path] = {
              state: 'ready',
              timestamp: file.analyzedAt || new Date().toISOString(),
              analysis: file.analysis,
              analyzedAt: file.analyzedAt
            };
          } else if (file.error) {
            reconstructedStates[file.path] = {
              state: 'error',
              timestamp: file.analyzedAt || new Date().toISOString(),
              error: file.error,
              analyzedAt: file.analyzedAt
            };
          } else {
            reconstructedStates[file.path] = {
              state: 'pending',
              timestamp: new Date().toISOString()
            };
          }
        });
        
        setFileStates(reconstructedStates);
        // Update phase data with reconstructed states
        actions.setPhaseData('fileStates', reconstructedStates);
      }
      
      // Load previously organized files to avoid re-processing
      const previouslyOrganized = phaseData.organizedFiles || [];
      const processedIds = new Set(previouslyOrganized.map((file) => file.originalPath || file.path));
      setProcessedFileIds(processedIds);
      
      if (previouslyOrganized.length > 0) {
        setOrganizedFiles(previouslyOrganized);
      }
    };
    
    loadPersistedData();
  }, [phaseData, analysisResults, actions]);

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
  const unprocessedFiles = analysisResults.filter((file) => 
    !processedFileIds.has(file.path) && file.analysis
  );
  
  const processedFiles = organizedFiles.filter((file) => 
    processedFileIds.has(file.originalPath || file.path)
  );

  useEffect(() => {
    // Get the documents path when component mounts
    const loadDocumentsPath = async () => {
      try {
        const path = await window.electronAPI.files.getDocumentsPath();
        setDocumentsPath(path);
        
        // Also load default location from settings
        const settings = await window.electronAPI.settings.get();
        if (settings?.defaultSmartFolderLocation) {
          setDefaultLocation(settings.defaultSmartFolderLocation);
        }
      } catch (error) {
        console.error('Failed to get documents path:', error);
      }
    };
    loadDocumentsPath();
    checkUndoRedoStatus();

    // Listen for operation progress events
    const progressCleanup = window.electronAPI.events.onOperationProgress((progressData) => {
      console.log('[ORGANIZE-PHASE] Operation progress:', progressData);
      if (progressData.type === 'batch_organize' && progressData.current !== undefined) {
        setBatchProgress({
          current: progressData.current,
          total: progressData.total,
          currentFile: progressData.currentFile || ''
        });
        
        // Update notification for long operations
        if (progressData.total > 5 && progressData.current > 0) {
          addNotification(
            `Processing file ${progressData.current}/${progressData.total}: ${progressData.currentFile || 'Unknown file'}`,
            'info',
            1000 // Short duration since these update frequently
          );
        }
      }
    });

    return () => {
      // Cleanup event listeners
      if (progressCleanup) progressCleanup();
    };
  }, [addNotification]);

  // Check undo/redo status
  const checkUndoRedoStatus = async () => {
    try {
      const canUndoResult = await window.electronAPI.undoRedo.canUndo();
      const canRedoResult = await window.electronAPI.undoRedo.canRedo();
      setCanUndo(canUndoResult);
      setCanRedo(canRedoResult);
    } catch (error) {
      console.error('Failed to check undo/redo status:', error);
    }
  };

  // Handle undo operation
  const handleUndo = async () => {
    try {
      await window.electronAPI.undoRedo.undo();
      addNotification('Operation undone successfully', 'success');
      checkUndoRedoStatus();
    } catch (error) {
      console.error('Undo failed:', error);
      addNotification(`Undo failed: ${error.message}`, 'error');
    }
  };

  // Handle redo operation
  const handleRedo = async () => {
    try {
      await window.electronAPI.undoRedo.redo();
      addNotification('Operation redone successfully', 'success');
      checkUndoRedoStatus();
    } catch (error) {
      console.error('Redo failed:', error);
      addNotification(`Redo failed: ${error.message}`, 'error');
    }
  };

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
    
    console.log(`[FOLDER-MATCH] Finding smart folder for category: "${category}"`);
    console.log('[FOLDER-MATCH] Available smart folders:', smartFolders.map((f) => ({ name: f.name, path: f.path })));
    
    // Normalize category for matching
    const normalizedCategory = category.toLowerCase().trim();
    
    // 1. Exact match first (case-insensitive)
    let folder = smartFolders.find((f) => 
      f.name.toLowerCase().trim() === normalizedCategory
    );
    if (folder) {
      console.log(`[FOLDER-MATCH] ✅ Exact match found: "${folder.name}"`);
      return folder;
    }
    
    // 2. Handle common variations (plural/singular, spacing)
    const categoryVariations = [
      normalizedCategory,
      normalizedCategory.replace(/s$/, ''), // Remove trailing 's'
      `${normalizedCategory  }s`, // Add trailing 's'
      normalizedCategory.replace(/\s+/g, ''), // Remove spaces
      normalizedCategory.replace(/\s+/g, '-'), // Replace spaces with dashes
      normalizedCategory.replace(/\s+/g, '_') // Replace spaces with underscores
    ];
    
    console.log(`[FOLDER-MATCH] Trying variations: [${categoryVariations.join(', ')}]`);
    
    for (const variant of categoryVariations) {
      folder = smartFolders.find((f) => 
        f.name.toLowerCase().trim() === variant ||
        f.name.toLowerCase().replace(/\s+/g, '') === variant ||
        f.name.toLowerCase().replace(/\s+/g, '-') === variant ||
        f.name.toLowerCase().replace(/\s+/g, '_') === variant
      );
      if (folder) {
        console.log(`[FOLDER-MATCH] ✅ Variation match found: "${folder.name}" for variant "${variant}"`);
        return folder;
      }
    }
    
    // 3. Partial word matching with scoring
    let bestMatch = null;
    let bestScore = 0;
    
    console.log('[FOLDER-MATCH] Attempting fuzzy matching...');
    
    smartFolders.forEach((f) => {
      let score = 0;
      const folderName = f.name.toLowerCase();
      
      // Check if category is contained in folder name
      if (folderName.includes(normalizedCategory)) {
        score += 10;
        console.log(`[FOLDER-MATCH] "${f.name}" contains "${category}": +10 points`);
      }
      
      // Check if folder name is contained in category
      if (normalizedCategory.includes(folderName)) {
        score += 8;
        console.log(`[FOLDER-MATCH] "${category}" contains "${f.name}": +8 points`);
      }
      
      // Word-by-word matching
      const categoryWords = normalizedCategory.split(/[\s_-]+/);
      const folderWords = folderName.split(/[\s_-]+/);
      
      categoryWords.forEach((cWord) => {
        folderWords.forEach((fWord) => {
          if (cWord === fWord) {
            score += 5;
            console.log(`[FOLDER-MATCH] Word match "${cWord}" = "${fWord}": +5 points`);
          } else if (cWord.includes(fWord) || fWord.includes(cWord)) {
            score += 3;
            console.log(`[FOLDER-MATCH] Partial word match "${cWord}" ~ "${fWord}": +3 points`);
          }
        });
      });
      
      // Check description match
      if (f.description) {
        const descLower = f.description.toLowerCase();
        if (descLower.includes(normalizedCategory)) {
          score += 4;
          console.log('[FOLDER-MATCH] Description contains category: +4 points');
        }
        categoryWords.forEach((word) => {
          if (descLower.includes(word)) {
            score += 2;
            console.log(`[FOLDER-MATCH] Description contains word "${word}": +2 points`);
          }
        });
      }
      
      // Check keywords match
      if (f.keywords && Array.isArray(f.keywords)) {
        f.keywords.forEach((keyword) => {
          if (keyword.toLowerCase() === normalizedCategory) {
            score += 4;
            console.log(`[FOLDER-MATCH] Keyword exact match "${keyword}": +4 points`);
          } else if (keyword.toLowerCase().includes(normalizedCategory) || 
                     normalizedCategory.includes(keyword.toLowerCase())) {
            score += 2;
            console.log(`[FOLDER-MATCH] Keyword partial match "${keyword}": +2 points`);
          }
        });
      }
      
      if (score > 0) {
        console.log(`[FOLDER-MATCH] "${f.name}" total score: ${score}`);
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = f;
      }
    });
    
    // Return best match if score is meaningful
    if (bestScore >= 3) {
      console.log(`[FOLDER-MATCH] ✅ Best match found: "${bestMatch.name}" with score ${bestScore}`);
      return bestMatch;
    }
    
    console.log(`[FOLDER-MATCH] No fuzzy match found (best score: ${bestScore})`);
    
    // 4. Default folder fallback
    const defaultFolder = smartFolders.find((f) => 
      f.name.toLowerCase() === 'general' || 
      f.name.toLowerCase() === 'other' ||
      f.name.toLowerCase() === 'miscellaneous' ||
      f.name.toLowerCase() === 'documents'
    );
    
    if (defaultFolder) {
      console.log(`[FOLDER-MATCH] ✅ Using default folder: "${defaultFolder.name}" for category "${category}"`);
      return defaultFolder;
    }
    
    // 5. Intelligent category mapping for common mismatches
    const categoryMappings = {
      'archive': ['Research', 'Documents', 'Files'],
      'archives': ['Research', 'Documents', 'Files'],
      'interface': ['Logos', 'Design', 'Screenshots'],
      'interfaces': ['Logos', 'Design', 'Screenshots'],
      'ui': ['Logos', 'Design', 'Screenshots'],
      'screenshot': ['Logos', 'Design', 'Screenshots'],
      'screenshots': ['Logos', 'Design', 'Screenshots'],
      'diagram': ['Logos', 'Design', 'Research'],
      'diagrams': ['Logos', 'Design', 'Research'],
      'chart': ['Research', 'Documents'],
      'charts': ['Research', 'Documents'],
      'logo': ['Logos', 'Design'],
      'logos': ['Logos', 'Design'],
      'image': ['Logos', 'Design', 'Recovery'],
      'images': ['Logos', 'Design', 'Recovery'],
      'photo': ['Recovery', 'Personal'],
      'photos': ['Recovery', 'Personal'],
      'document': ['Documents', 'Research'],
      'documents': ['Documents', 'Research'],
      'file': ['Documents', 'Research'],
      'files': ['Documents', 'Research']
    };
    
    const possibleMappings = categoryMappings[normalizedCategory] || [];
    console.log(`[FOLDER-MATCH] Trying intelligent mappings for "${category}": [${possibleMappings.join(', ')}]`);
    
    for (const mapping of possibleMappings) {
      const mappedFolder = smartFolders.find((f) => 
        f.name.toLowerCase() === mapping.toLowerCase() ||
        f.name.toLowerCase().includes(mapping.toLowerCase())
      );
      if (mappedFolder) {
        console.log(`[FOLDER-MATCH] ✅ Mapped category "${category}" to "${mappedFolder.name}" via intelligent mapping`);
        return mappedFolder;
      }
    }
    
    // 6. Final fallback: use first available folder
    if (smartFolders.length > 0) {
      console.log(`[FOLDER-MATCH] ⚠️ Using first available folder "${smartFolders[0].name}" as final fallback`);
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
  const getFileWithEdits = (file, index) => {
    const edits = editingFiles[index];
    if (!edits) return file;
    
    return {
      ...file,
      analysis: {
        ...file.analysis,
        suggestedName: edits.suggestedName || file.analysis?.suggestedName,
        category: edits.category || file.analysis?.category
      }
    };
  };

  // NEW: Mark files as processed after organization
  const markFilesAsProcessed = (filePaths) => {
    setProcessedFileIds((prev) => {
      const newSet = new Set(prev);
      filePaths.forEach((path) => newSet.add(path));
      return newSet;
    });
  };

  // NEW: Remove files from processed list (for undo operations)
  const unmarkFilesAsProcessed = (filePaths) => {
    setProcessedFileIds((prev) => {
      const newSet = new Set(prev);
      filePaths.forEach((path) => newSet.delete(path));
      return newSet;
    });
  };

  const handleOrganizeFiles = async () => {
    if (unprocessedFiles.length === 0) {
      addNotification('No files to organize', 'warning');
      return;
    }
    
    console.log('[ORGANIZE-START] Starting organization process');
    console.log('[ORGANIZE-START] documentsPath:', documentsPath);
    console.log('[ORGANIZE-START] smartFolders:', smartFolders);
    console.log('[ORGANIZE-START] unprocessedFiles:', unprocessedFiles.length);
    
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
        const file = getFileWithEdits(unprocessedFiles[i], i);
        
        // Skip files without analysis
        if (!file.analysis || !file.analysis.category) {
          skippedFiles.push({ name: file.name, reason: 'No analysis data' });
          continue;
        }
        
        // Find the appropriate smart folder
        let smartFolder = findSmartFolderForCategory(file.analysis.category);
        
        // If no exact match found, try fallback strategies
        if (!smartFolder) {
          console.log(`[FOLDER-FALLBACK] No match for category "${file.analysis.category}", trying fallbacks...`);
          
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
            console.log(`[FOLDER-FALLBACK] Using first available folder: ${smartFolder.name}`);
          }
          
          if (!smartFolder) {
            addNotification(`No smart folder found for category: ${file.analysis.category}`, 'warning');
            skippedFiles.push({ name: file.name, reason: `No folder for category: ${file.analysis.category}` });
            continue;
          } else {
            addNotification(`Mapped "${file.analysis.category}" to fallback folder: ${smartFolder.name}`, 'info');
          }
        }
        
        // Build the full destination path with proper validation
        let destinationFolder;
        try {
          if (smartFolder.path && (smartFolder.path.startsWith('/') || smartFolder.path.includes(':'))) {
            // Absolute path
            destinationFolder = smartFolder.path;
            console.log(`[PATH-CONSTRUCTION] Using absolute path: ${destinationFolder}`);
          } else if (smartFolder.path) {
            // Relative path from Documents
            destinationFolder = `${documentsPath}/${smartFolder.path}`.replace(/\\/g, '/').replace(/\/+/g, '/');
            console.log(`[PATH-CONSTRUCTION] Using relative path: ${smartFolder.path} → ${destinationFolder}`);
          } else {
            // Default to Documents/FolderName
            destinationFolder = `${documentsPath}/${smartFolder.name}`.replace(/\\/g, '/').replace(/\/+/g, '/');
            console.log(`[PATH-CONSTRUCTION] Using default path: ${smartFolder.name} → ${destinationFolder}`);
          }
          
          console.log(`[PATH-CONSTRUCTION] Final destination folder: ${destinationFolder}`);
          
        } catch (pathError) {
          console.error('[PATH-CONSTRUCTION] Path construction error:', pathError);
          skippedFiles.push({ name: file.name, reason: 'Invalid destination path' });
          continue;
        }
        
        // Ensure the suggested name has an extension
        let fileName = file.analysis.suggestedName || file.name;
        const originalExt = file.name.includes('.') ? `.${  file.name.split('.').pop()}` : '';
        if (!fileName.includes('.') && originalExt) {
          fileName += originalExt;
        }
        
        // Validate file name
        if (!fileName || fileName.trim() === '') {
          fileName = file.name; // Fallback to original name
        }
        
        const destination = `${destinationFolder}/${fileName}`.replace(/\\/g, '/');
        
        console.log(`[FILE-OPERATION] Preparing to move:
          Source: ${file.path}
          Destination: ${destination}
          Smart Folder: ${smartFolder.name}
          Category: ${file.analysis.category}`);
        
        operations.push({
          type: 'move',
          source: file.path,
          destination,
          metadata: {
            ...file.analysis,
            smartFolder: smartFolder.name,
            originalName: file.name,
            originalPath: file.path
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
      console.log('[ORGANIZE-FILES] Starting file organization with operations:', operations);
      
      const results = await executeAction({
        type: 'BATCH_OPERATION',
        description: `Organize ${operations.length} files`,
        execute: async () => {
          setBatchProgress({
            current: 0,
            total: operations.length,
            currentFile: 'Starting...'
          });

          console.log('[ORGANIZE-FILES] About to call performOperation with:', {
            type: 'batch_organize',
            operationsCount: operations.length,
            operations: operations.map((op) => ({
              type: op.type,
              source: op.source,
              destination: op.destination,
              smartFolder: op.metadata?.smartFolder
            }))
          });

          try {
            const result = await window.electronAPI.files.performOperation({
              type: 'batch_organize',
              operations
            });
            
            console.log('[ORGANIZE-FILES] File operation result:', result);
            console.log('[ORGANIZE-FILES] Success count:', result?.successCount);
            console.log('[ORGANIZE-FILES] Fail count:', result?.failCount);
            
            if (result?.results) {
              result.results.forEach((res, index) => {
                if (res.success) {
                  console.log(`[ORGANIZE-FILES] ✅ Operation ${index + 1}: ${res.source} → ${res.destination}`);
                } else {
                  console.log(`[ORGANIZE-FILES] ❌ Operation ${index + 1} failed: ${res.error}`);
                }
              });
            }
            
            setBatchProgress({
              current: operations.length,
              total: operations.length,
              currentFile: 'Complete!'
            });
            return result;
          } catch (error) {
            console.error('[ORGANIZE-FILES] File operation failed:', error);
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
    <div className="phase-container">
      <div className="phase-content-compact animate-fade-in-up">
        <div className="phase-header">
          <h1 className="welcome-title">Review & Organize</h1>
          <p className="welcome-subtitle">Review AI suggestions and organize your files into smart folders</p>
        </div>
        
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
          <UndoRedoSystem 
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={canUndo}
            canRedo={canRedo}
            className="text-sm"
          />
          
          <div className="flex space-x-2">
            <button
              onClick={() => setIsHistoryVisible(true)}
              className="glass-button text-sm"
            >
              📊 View History
            </button>
          </div>
        </div>

        {smartFolders.length > 0 && (
          <div className="status-overview-compact">
            <div className="glass-card p-4">
              <h3 className="text-lg font-semibold mb-2">📂 Smart Folders ({smartFolders.length})</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                {smartFolders.map((folder) => (
                  <div key={folder.id} className="glass-card p-4">
                    <h4 className="font-medium text-on-glass">{folder.emoji} {folder.name}</h4>
                    <p className="text-sm text-readable-light mt-1">{folder.path}</p>
                    {folder.description && (
                      <p className="text-xs text-readable-light mt-2">{folder.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {(unprocessedFiles.length > 0 || processedFiles.length > 0) && (
          <div className="status-overview-compact">
            <div className="glass-card p-4">
              <h3 className="text-lg font-semibold mb-2">📊 File Status Overview</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="glass-card p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">{unprocessedFiles.length}</div>
                  <div className="text-sm text-readable-light">Ready to Organize</div>
                </div>
                <div className="glass-card p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">{processedFiles.length}</div>
                  <div className="text-sm text-readable-light">Already Organized</div>
                </div>
                <div className="glass-card p-4 text-center">
                  <div className="text-2xl font-bold text-gray-600">{analysisResults.filter((f) => !f.analysis).length}</div>
                  <div className="text-sm text-readable-light">Failed Analysis</div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="content-compact">
          {unprocessedFiles.length > 0 && (
            <div className="glass-card p-4 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <input
                    type="checkbox"
                    checked={selectedFiles.size === unprocessedFiles.length}
                    onChange={selectAllFiles}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-on-glass">
                    {selectedFiles.size > 0 ? `${selectedFiles.size} selected` : 'Select all'}
                  </span>
                  
                  {selectedFiles.size > 0 && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={approveSelectedFiles}
                        className="glass-button-primary text-sm px-3 py-1"
                      >
                        ✓ Approve Selected
                      </button>
                      <button
                        onClick={() => setBulkEditMode(!bulkEditMode)}
                        className="glass-button text-sm px-3 py-1"
                      >
                        ✏️ Bulk Edit
                      </button>
                    </div>
                  )}
                </div>
                
                {bulkEditMode && (
                  <div className="flex items-center gap-2">
                    <select
                      value={bulkCategory}
                      onChange={(e) => setBulkCategory(e.target.value)}
                      className="glass-input text-sm"
                    >
                      <option value="">Select category...</option>
                      {smartFolders.map((folder) => (
                        <option key={folder.id} value={folder.name}>{folder.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={applyBulkCategoryChange}
                      className="glass-button-primary text-sm px-3 py-1"
                      disabled={!bulkCategory}
                    >
                      Apply
                    </button>
                    <button
                      onClick={() => {setBulkEditMode(false); setBulkCategory('');}}
                      className="glass-button text-sm px-3 py-1"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="content-scroll">
            <h2 className="section-title">Files Ready for Organization</h2>
            
            {unprocessedFiles.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">
                  {processedFiles.length > 0 ? '✅' : '📁'}
                </div>
                <p className="empty-state-text">
                  {processedFiles.length > 0 
                    ? 'All files have been organized! Check the results below.'
                    : 'No files ready for organization yet.'
                  }
                </p>
                {processedFiles.length === 0 && (
                  <button
                    onClick={() => actions.advancePhase(PHASES.DISCOVER)}
                    className="action-button-primary mt-6"
                  >
                    ← Go Back to Select Files
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {unprocessedFiles.map((file, index) => {
                  const fileWithEdits = getFileWithEdits(file, index);
                  const smartFolder = findSmartFolderForCategory(fileWithEdits.analysis?.category);
                  const isSelected = selectedFiles.has(index);
                  const stateDisplay = getFileStateDisplay(file.path, !!file.analysis);
                  
                  return (
                    <div key={index} className={isSelected ? 'file-card-selected' : 'file-card'}>
                      <div className="flex items-start gap-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleFileSelection(index)}
                          className="form-checkbox mt-1"
                        />
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-3 mb-4">
                            <div className="flex-shrink-0 w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                              <span className="text-xl">📄</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-gray-900 truncate">{file.name}</h4>
                              <p className="text-sm text-gray-500">
                                {file.size ? `${Math.round(file.size / 1024)} KB` : 'Unknown size'} • {file.source?.replace('_', ' ')}
                              </p>
                            </div>
                          </div>
                          
                          {fileWithEdits.analysis ? (
                            <>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                                <div>
                                  <label className="form-label text-xs">
                                    Suggested Name
                                  </label>
                                  <input
                                    type="text"
                                    value={editingFiles[index]?.suggestedName || fileWithEdits.analysis.suggestedName}
                                    onChange={(e) => handleEditFile(index, 'suggestedName', e.target.value)}
                                    className="form-input text-sm"
                                  />
                                </div>
                                <div>
                                  <label className="form-label text-xs">
                                    Category
                                  </label>
                                  <select
                                    value={editingFiles[index]?.category || fileWithEdits.analysis.category}
                                    onChange={(e) => handleEditFile(index, 'category', e.target.value)}
                                    className="form-select text-sm"
                                  >
                                    {smartFolders.map((folder) => (
                                      <option key={folder.id} value={folder.name}>{folder.name}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                              
                              <div className="glass-card p-3 mb-3">
                                <p className="text-sm text-readable">
                                  <span className="font-medium">Destination:</span>{' '}
                                  <span className="text-blue-600">
                                    {smartFolder ? (smartFolder.path || `${defaultLocation}/${smartFolder.name}`) : 'No matching folder'}
                                  </span>
                                </p>
                              </div>
                              
                              {file.analysis.keywords && file.analysis.keywords.length > 0 && (
                                <div className="flex flex-wrap gap-1 mb-3">
                                  {file.analysis.keywords.slice(0, 5).map((keyword, i) => (
                                    <span key={i} className="status-info text-xs">
                                      {keyword}
                                    </span>
                                  ))}
                                  {file.analysis.keywords.length > 5 && (
                                    <span className="text-xs text-gray-500">
                                      +{file.analysis.keywords.length - 5} more
                                    </span>
                                  )}
                                </div>
                              )}
                              
                              {(file.analysis.ocrText || file.analysis.transcript) && (
                                <div className="text-xs text-readable-light glass-card p-2">
                                  {file.analysis.ocrText && (
                                    <p className="line-clamp-2 mb-1">
                                      <span className="font-medium">OCR:</span> {file.analysis.ocrText}
                                    </p>
                                  )}
                                  {file.analysis.transcript && (
                                    <p className="line-clamp-2">
                                      <span className="font-medium">Transcript:</span> {file.analysis.transcript}
                                    </p>
                                  )}
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="status-error">
                              Analysis failed - will be skipped
                            </div>
                          )}
                        </div>
                        
                        <div className="flex-shrink-0">
                          <span className={`status-badge ${
                            stateDisplay.color === 'text-blue-600' ? 'status-info' :
                            stateDisplay.color === 'text-green-600' ? 'status-success' :
                            stateDisplay.color === 'text-red-600' ? 'status-error' :
                            'status-warning'
                          }`}>
                            <span className={stateDisplay.spinning ? 'animate-spin inline-block mr-1' : 'mr-1'}>
                              {stateDisplay.icon}
                            </span>
                            {stateDisplay.label}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {unprocessedFiles.length > 0 && (
            <div className="glass-card p-6 text-center flex-shrink-0">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-2xl mb-4">
                <span className="text-3xl">✨</span>
              </div>
              <h3 className="text-xl font-semibold text-on-glass mb-2">Ready to Organize</h3>
              <p className="text-readable-light mb-6 max-w-md mx-auto">
                StratoSort will move and rename <strong className="text-on-glass">{unprocessedFiles.filter((f) => f.analysis).length} files</strong> according to AI suggestions.
              </p>
              
              {isOrganizing ? (
                <div className="py-4">
                  <div className="flex items-center justify-center gap-3 text-blue-600 mb-4">
                    <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                    <span className="text-lg font-medium">Organizing Files...</span>
                  </div>
                  
                  {batchProgress.total > 0 && (
                    <div className="max-w-md mx-auto mb-4">
                      <div className="flex justify-between text-sm text-readable-light mb-2">
                        <span>Progress: {batchProgress.current} of {batchProgress.total}</span>
                        <span>{Math.round((batchProgress.current / batchProgress.total) * 100)}%</span>
                      </div>
                      <div className="progress-bar">
                        <div 
                          className="progress-fill"
                          style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                        />
                      </div>
                      {batchProgress.currentFile && (
                        <p className="text-xs text-readable-light mt-2 truncate">
                          Processing: {batchProgress.currentFile}
                        </p>
                      )}
                    </div>
                  )}
                  
                  <p className="text-sm text-readable-light">
                    Please wait while your files are being organized
                  </p>
                </div>
              ) : (
                <button 
                  onClick={handleOrganizeFiles}
                  className="action-button-primary text-base px-8 py-3"
                  disabled={unprocessedFiles.filter((f) => f.analysis).length === 0}
                >
                  Organize Files Now
                </button>
              )}
            </div>
          )}
        </div>

        <div className="phase-actions">
          <div className="action-buttons">
            <button 
              onClick={() => actions.advancePhase(PHASES.DISCOVER)}
              className="action-button"
              disabled={isOrganizing}
            >
              ← Back to Discovery
            </button>
            <button 
              onClick={() => actions.advancePhase(PHASES.COMPLETE)}
              disabled={processedFiles.length === 0 || isOrganizing}
              className="action-button-primary"
            >
              View Results →
            </button>
          </div>
        </div>

        {isHistoryVisible && <HistoryModal onClose={() => setIsHistoryVisible(false)} />}
      </div>
    </div>
  );
}

export default OrganizePhase;
