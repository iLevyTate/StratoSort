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
      return { icon: '📂', label: 'Ready', color: 'text-stratosort-blue', spinning: false };
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
    <div className="w-full">
      <div className="mb-fib-21">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-system-gray-900 mb-fib-8">
              📂 Review & Organize
            </h2>
            <p className="text-system-gray-600">
              Review AI suggestions and organize your files into smart folders. Unprocessed files remain available for future organization.
            </p>
            
            {/* Analysis Status Banner if still running */}
            {isAnalysisRunning && (
              <div className="mt-fib-13 p-fib-13 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-fib-8">
                  <div className="animate-spin w-fib-13 h-fib-13 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                  <div className="text-sm font-medium text-blue-700">
                    Analysis continuing in background: {analysisProgressFromDiscover.current}/{analysisProgressFromDiscover.total} files
                  </div>
                </div>
              </div>
            )}
          </div>
          
          {/* Undo/Redo Toolbar */}
          <UndoRedoToolbar className="flex-shrink-0" />
        </div>
      </div>

      {/* Smart Folders Summary */}
      {smartFolders.length > 0 && (
        <div className="card-enhanced mb-fib-21">
          <h3 className="text-lg font-semibold mb-fib-8">📁 Target Smart Folders</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-fib-8">
            {smartFolders.map((folder) => (
              <div key={folder.id} className="p-fib-13 bg-surface-secondary rounded-lg border border-stratosort-blue/20">
                <div className="font-medium text-system-gray-900 mb-fib-2">{folder.name}</div>
                <div className="text-sm text-system-gray-600 mb-fib-3">
                  📂 {folder.path || `${defaultLocation}/${folder.name}`}
                </div>
                {folder.description && (
                  <div className="text-xs text-system-gray-500 bg-stratosort-blue/5 p-fib-5 rounded italic">
                    "{folder.description}"
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* NEW: File Status Overview */}
      {(unprocessedFiles.length > 0 || processedFiles.length > 0) && (
        <div className="card-enhanced mb-fib-21">
          <h3 className="text-lg font-semibold mb-fib-8">📊 File Status Overview</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-fib-13">
            <div className="text-center p-fib-13 bg-blue-50 rounded-lg border border-blue-200">
              <div className="text-2xl font-bold text-blue-600">{unprocessedFiles.length}</div>
              <div className="text-sm text-blue-700">Ready to Organize</div>
            </div>
            <div className="text-center p-fib-13 bg-green-50 rounded-lg border border-green-200">
              <div className="text-2xl font-bold text-green-600">{processedFiles.length}</div>
              <div className="text-sm text-green-700">Already Organized</div>
            </div>
            <div className="text-center p-fib-13 bg-gray-50 rounded-lg border border-gray-200">
              <div className="text-2xl font-bold text-gray-600">{analysisResults.filter((f) => !f.analysis).length}</div>
              <div className="text-sm text-gray-700">Failed Analysis</div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Operations Bar */}
      {unprocessedFiles.length > 0 && (
        <div className="card-enhanced mb-fib-21">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-fib-13">
              <input
                type="checkbox"
                checked={selectedFiles.size === unprocessedFiles.length}
                onChange={selectAllFiles}
                className="form-checkbox"
              />
              <span className="text-sm font-medium">
                {selectedFiles.size > 0 ? `${selectedFiles.size} selected` : 'Select all'}
              </span>
              
              {selectedFiles.size > 0 && (
                <div className="flex items-center gap-fib-8">
                  <button
                    onClick={approveSelectedFiles}
                    className="btn-primary text-sm"
                  >
                    ✓ Approve Selected
                  </button>
                  <button
                    onClick={() => setBulkEditMode(!bulkEditMode)}
                    className="btn-secondary text-sm"
                  >
                    ✏️ Bulk Edit
                  </button>
                </div>
              )}
            </div>
            
            {bulkEditMode && (
              <div className="flex items-center gap-fib-5">
                <select
                  value={bulkCategory}
                  onChange={(e) => setBulkCategory(e.target.value)}
                  className="form-input-enhanced text-sm"
                >
                  <option value="">Select category...</option>
                  {smartFolders.map((folder) => (
                    <option key={folder.id} value={folder.name}>{folder.name}</option>
                  ))}
                </select>
                <button
                  onClick={applyBulkCategoryChange}
                  className="btn-primary text-sm"
                  disabled={!bulkCategory}
                >
                  Apply
                </button>
                <button
                  onClick={() => {setBulkEditMode(false); setBulkCategory('');}}
                  className="btn-secondary text-sm"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* File Review */}
      <div className="card-enhanced mb-fib-21">
        <h3 className="text-lg font-semibold mb-fib-13">Files Ready for Organization</h3>
        
        {unprocessedFiles.length === 0 ? (
          <div className="text-center py-fib-21">
            <div className="text-4xl mb-fib-13">
              {processedFiles.length > 0 ? '✅' : '📭'}
            </div>
            <p className="text-system-gray-500 italic">
              {processedFiles.length > 0 
                ? 'All files have been organized! Check the results below.'
                : 'No files ready for organization yet.'
              }
            </p>
            {processedFiles.length === 0 && (
              <button
                onClick={() => actions.advancePhase(PHASES.DISCOVER)}
                className="btn-primary mt-fib-13"
              >
                ← Go Back to Select Files
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-fib-8">
            {unprocessedFiles.map((file, index) => {
              const fileWithEdits = getFileWithEdits(file, index);
              const smartFolder = findSmartFolderForCategory(fileWithEdits.analysis?.category);
              const isSelected = selectedFiles.has(index);
              const stateDisplay = getFileStateDisplay(file.path, !!file.analysis);
              
              return (
                <div key={index} className={`border rounded-lg p-fib-13 transition-all duration-200 ${
                  isSelected ? 'border-stratosort-blue bg-stratosort-blue/5' : 'border-system-gray-200'
                }`}>
                  <div className="flex items-start gap-fib-13">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleFileSelection(index)}
                      className="form-checkbox mt-fib-3"
                    />
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-fib-8 mb-fib-5">
                        <div className="text-2xl">📄</div>
                        <div>
                          <div className="font-medium text-system-gray-900">{file.name}</div>
                          <div className="text-sm text-system-gray-500">
                            {file.size ? `${Math.round(file.size / 1024)} KB` : 'Unknown size'} • {file.source?.replace('_', ' ')}
                          </div>
                        </div>
                      </div>
                      
                      {fileWithEdits.analysis ? (
                        <>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-fib-8 mb-fib-8">
                            <div>
                              <label className="block text-xs font-medium text-system-gray-700 mb-fib-2">
                                Suggested Name
                              </label>
                              <input
                                type="text"
                                value={editingFiles[index]?.suggestedName || fileWithEdits.analysis.suggestedName}
                                onChange={(e) => handleEditFile(index, 'suggestedName', e.target.value)}
                                className="form-input-enhanced text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-system-gray-700 mb-fib-2">
                                Category
                              </label>
                              <select
                                value={editingFiles[index]?.category || fileWithEdits.analysis.category}
                                onChange={(e) => handleEditFile(index, 'category', e.target.value)}
                                className="form-input-enhanced text-sm"
                              >
                                {smartFolders.map((folder) => (
                                  <option key={folder.id} value={folder.name}>{folder.name}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          
                          <div className="text-sm text-system-gray-600">
                            <strong>Destination:</strong>{' '}
                            <span className="text-stratosort-blue">
                              {smartFolder ? (smartFolder.path || `${defaultLocation}/${smartFolder.name}`) : 'No matching folder'}
                            </span>
                          </div>
                          
                          {file.analysis.keywords && file.analysis.keywords.length > 0 && (
                            <div className="text-sm text-system-gray-500 mb-fib-3">
                              <strong>Keywords:</strong> {file.analysis.keywords.join(', ')}
                            </div>
                          )}
                          {file.analysis.ocrText && (
                            <div className="text-xs text-system-gray-500 mb-fib-3 line-clamp-2">
                              <strong>OCR:</strong> {file.analysis.ocrText.slice(0,120)}{file.analysis.ocrText.length>120?'…':''}
                            </div>
                          )}
                          {file.analysis.transcript && (
                            <div className="text-xs text-system-gray-500 mb-fib-3 line-clamp-2">
                              <strong>Transcript:</strong> {file.analysis.transcript.slice(0,120)}{file.analysis.transcript.length>120?'…':''}
                            </div>
                          )}
                          {file.analysis.confidence && (
                            <div className="text-xs text-system-gray-400">
                              <strong>AI Confidence:</strong> {file.analysis.confidence}%
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-sm text-system-red-600 mt-fib-3">
                          Analysis failed - will be skipped
                        </div>
                      )}
                    </div>
                    
                    <div className={`text-sm font-medium flex items-center gap-fib-3 ${stateDisplay.color}`}>
                      <span className={stateDisplay.spinning ? 'animate-spin' : ''}>{stateDisplay.icon}</span>
                      <span>{stateDisplay.label}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* NEW: Previously Organized Files */}
      {processedFiles.length > 0 && (
        <div className="card-enhanced mb-fib-21">
          <h3 className="text-lg font-semibold mb-fib-13">✅ Previously Organized Files</h3>
          <div className="space-y-fib-5 max-h-64 overflow-y-auto">
            {processedFiles.map((file, index) => (
              <div key={index} className="flex items-center justify-between p-fib-8 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-center gap-fib-8">
                  <span className="text-green-600">✅</span>
                  <div>
                    <div className="text-sm font-medium text-system-gray-900">
                      {file.originalName} → {file.newName}
                    </div>
                    <div className="text-xs text-system-gray-500">
                      Moved to {file.smartFolder} • {new Date(file.organizedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-green-600 font-medium">Organized</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Organization Action */}
      {unprocessedFiles.length > 0 && (
        <div className="card-enhanced mb-fib-21 text-center">
          <h3 className="text-lg font-semibold mb-fib-13">Ready to Organize</h3>
          <p className="text-system-gray-600 mb-fib-13">
            StratoSort will move and rename <strong>{unprocessedFiles.filter((f) => f.analysis).length} files</strong> according to AI suggestions.
          </p>
          <p className="text-xs text-system-gray-500 mb-fib-13">
            💡 Don't worry - you can undo this operation if needed
          </p>
          
          {isOrganizing ? (
            <div className="py-fib-13">
              <div className="flex items-center justify-center gap-fib-8 text-stratosort-blue mb-fib-8">
                <div className="animate-spin w-fib-21 h-fib-21 border-3 border-stratosort-blue border-t-transparent rounded-full"></div>
                <span className="text-lg font-medium">Organizing Files...</span>
              </div>
              
              {/* Batch Progress */}
              {batchProgress.total > 0 && (
                <div className="mb-fib-8">
                  <div className="flex justify-between text-sm text-system-gray-600 mb-fib-3">
                    <span>Progress: {batchProgress.current} of {batchProgress.total}</span>
                    <span>{Math.round((batchProgress.current / batchProgress.total) * 100)}%</span>
                  </div>
                  <div className="w-full bg-system-gray-200 rounded-full h-fib-5">
                    <div 
                      className="bg-stratosort-blue h-fib-5 rounded-full transition-all duration-300"
                      style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                    ></div>
                  </div>
                  {batchProgress.currentFile && (
                    <div className="text-xs text-system-gray-500 mt-fib-3 truncate">
                      Currently processing: {batchProgress.currentFile}
                    </div>
                  )}
                </div>
              )}
              
              <p className="text-sm text-system-gray-600">
                Please wait while your files are being organized
              </p>
            </div>
          ) : (
            <button 
              onClick={handleOrganizeFiles}
              className="btn-success text-lg px-fib-21 py-fib-13"
              disabled={unprocessedFiles.filter((f) => f.analysis).length === 0}
            >
              ✨ Organize Files Now
            </button>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <button 
          onClick={() => actions.advancePhase(PHASES.DISCOVER)}
          className="btn-secondary"
          disabled={isOrganizing}
        >
          ← Back to Discovery
        </button>
        <button 
          onClick={() => actions.advancePhase(PHASES.COMPLETE)}
          disabled={processedFiles.length === 0 || isOrganizing}
          className={`btn-primary ${processedFiles.length === 0 || isOrganizing ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          View Results →
        </button>
      </div>
    </div>
  );
}

export default OrganizePhase;
