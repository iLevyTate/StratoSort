import { useState, useEffect, useMemo, useCallback } from 'react';
import { usePhase } from '../contexts/PhaseContext';
import { useNotification } from '../contexts/NotificationContext';
import { useUndoRedo } from '../components/UndoRedoSystem';
import { PHASES } from '../../shared/constants';
import { createOrganizeBatchAction } from '../components/UndoRedoSystem';

export function useOrganizePhase() {
  const { actions, phaseData } = usePhase();
  const { addNotification } = useNotification();
  const { executeAction } = useUndoRedo();

  const [organizedFiles, setOrganizedFiles] = useState([]);
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [batchProgress, setBatchProgress] = useState({
    current: 0,
    total: 0,
    currentFile: '',
  });
  const [organizePreview, setOrganizePreview] = useState([]);
  const [documentsPath, setDocumentsPath] = useState('');
  const [editingFiles, setEditingFiles] = useState({});
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [bulkEditMode, setBulkEditMode] = useState(false);
  // Instrumentation: track selection size changes
  useEffect(() => {
    console.log('[PERF] organize selectedFiles size:', selectedFiles.size);
  }, [selectedFiles.size]);
  const [bulkCategory, setBulkCategory] = useState('');
  const [defaultLocation, setDefaultLocation] = useState('Documents');
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [fileStates, setFileStates] = useState({});
  const [processedFileIds, setProcessedFileIds] = useState(new Set());

  const analysisResults =
    phaseData.analysisResults && Array.isArray(phaseData.analysisResults)
      ? phaseData.analysisResults
      : [];
  const smartFolders = phaseData.smartFolders || [];

  // Variables for error logging context
  let currentOperations = [];
  let currentFilesToProcess = [];

  // Load smart folders if missing
  useEffect(() => {
    const loadSmartFoldersIfMissing = async () => {
      if (process.env.NODE_ENV === 'development') {
        console.log(
          '[SMART FOLDERS] Checking if smart folders need loading...',
        );
      }

      try {
        if (!Array.isArray(smartFolders) || smartFolders.length === 0) {
          if (process.env.NODE_ENV === 'development') {
            console.log(
              '[SMART FOLDERS] No smart folders found, attempting to load...',
            );
          }

          if (!window.electronAPI?.smartFolders?.get) {
            console.error(
              '[SMART FOLDERS] Electron API for smart folders not available',
            );
            addNotification(
              'Application error: Smart folders API unavailable',
              'error',
            );
            return;
          }

          const folders = await window.electronAPI.smartFolders.get();
          if (process.env.NODE_ENV === 'development') {
            console.log('[SMART FOLDERS] Loaded folders from API:', folders);
          }

          if (Array.isArray(folders) && folders.length > 0) {
            if (process.env.NODE_ENV === 'development') {
              console.log(
                `[SMART FOLDERS] Setting ${folders.length} smart folders to phase data`,
              );
            }
            actions.setPhaseData('smartFolders', folders);
            addNotification(
              `Loaded ${folders.length} smart folder${folders.length > 1 ? 's' : ''}`,
              'info',
            );
          } else {
            if (process.env.NODE_ENV === 'development') {
              console.warn(
                '[SMART FOLDERS] No smart folders returned from API',
              );
            }
            // Create default smart folders if none exist
            const defaultFolders = [
              {
                id: 'documents',
                name: 'Documents',
                path: null,
                category: 'document',
              },
              { id: 'images', name: 'Images', path: null, category: 'image' },
              { id: 'videos', name: 'Videos', path: null, category: 'video' },
              { id: 'other', name: 'Other', path: null, category: 'other' },
            ];
            if (process.env.NODE_ENV === 'development') {
              console.log(
                '[SMART FOLDERS] Creating default smart folders:',
                defaultFolders,
              );
            }
            actions.setPhaseData('smartFolders', defaultFolders);
            addNotification('Created default smart folders', 'info');
          }
        } else {
          if (process.env.NODE_ENV === 'development') {
            console.log(
              `[SMART FOLDERS] Smart folders already loaded: ${smartFolders.length} folders`,
            );
          }
        }
      } catch (error) {
        console.error('[SMART FOLDERS] Error loading smart folders:', error);
        addNotification(
          `Failed to load smart folders: ${error.message}`,
          'error',
        );

        // As fallback, create default smart folders
        const defaultFolders = [
          {
            id: 'documents',
            name: 'Documents',
            path: null,
            category: 'document',
          },
          { id: 'images', name: 'Images', path: null, category: 'image' },
          { id: 'videos', name: 'Videos', path: null, category: 'video' },
          { id: 'other', name: 'Other', path: null, category: 'other' },
        ];
        console.log('[SMART FOLDERS] Fallback: Creating default smart folders');
        actions.setPhaseData('smartFolders', defaultFolders);
      }
    };
    loadSmartFoldersIfMissing();
  }, [smartFolders, actions, addNotification]);

  // Resolve documents path
  useEffect(() => {
    (async () => {
      try {
        const docsPath = await window.electronAPI?.files?.getDocumentsPath?.();
        if (docsPath && typeof docsPath === 'string') {
          setDefaultLocation(docsPath);
        }
      } catch (error) {
        addNotification(
          `Failed to get documents path: ${error.message}`,
          'warning',
        );
      }
    })();
  }, [addNotification]);

  // Load persisted data and initialize states
  useEffect(() => {
    const loadPersistedData = () => {
      const persistedStates = phaseData.fileStates || {};
      setFileStates(persistedStates);

      if (
        (phaseData.analysisResults || []).length === 0 &&
        Object.keys(persistedStates).length > 0
      ) {
        const reconstructedResults = Object.entries(persistedStates).map(
          ([filePath, stateObj]) => ({
            name: filePath.split(/[\\/]/).pop(),
            path: filePath,
            size: 0,
            type: 'file',
            source: 'reconstructed',
            analysis: stateObj.analysis || null,
            error: stateObj.error,
            analyzedAt: stateObj.analyzedAt,
            status:
              stateObj.state === 'ready'
                ? 'analyzed'
                : stateObj.state === 'error'
                  ? 'failed'
                  : 'unknown',
          }),
        );
        actions.setPhaseData('analysisResults', reconstructedResults);
      }

      if (
        Object.keys(persistedStates).length === 0 &&
        analysisResults.length > 0
      ) {
        const reconstructedStates = {};
        analysisResults.forEach((file) => {
          if (file.analysis && !file.error) {
            reconstructedStates[file.path] = {
              state: 'ready',
              timestamp: file.analyzedAt || new Date().toISOString(),
              analysis: file.analysis,
              analyzedAt: file.analyzedAt,
            };
          } else if (file.error) {
            reconstructedStates[file.path] = {
              state: 'error',
              timestamp: file.analyzedAt || new Date().toISOString(),
              error: file.error,
              analyzedAt: file.analyzedAt,
            };
          } else {
            reconstructedStates[file.path] = {
              state: 'pending',
              timestamp: new Date().toISOString(),
            };
          }
        });
        setFileStates(reconstructedStates);
        actions.setPhaseData('fileStates', reconstructedStates);
      }

      const previouslyOrganized = phaseData.organizedFiles || [];
      const processedIds = new Set(
        previouslyOrganized.map((file) => file.originalPath || file.path),
      );
      setProcessedFileIds(processedIds);

      if (previouslyOrganized.length > 0) {
        setOrganizedFiles(previouslyOrganized);
      }
    };

    loadPersistedData();
  }, [phaseData, analysisResults, actions]);

  // Subscribe to progress events
  useEffect(() => {
    const unsubscribe = window.electronAPI?.events?.onOperationProgress?.(
      (payload) => {
        if (!payload || payload.type !== 'batch_organize') return;
        setBatchProgress({
          current: Number(payload.current) || 0,
          total: Number(payload.total) || 0,
          currentFile: payload.currentFile || '',
        });
      },
    );
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  // Computed values
  const unprocessedFiles = useMemo(
    () =>
      Array.isArray(analysisResults)
        ? analysisResults.filter(
            (file) => !processedFileIds.has(file.path) && file && file.analysis,
          )
        : [],
    [analysisResults, processedFileIds],
  );

  const processedFiles = useMemo(
    () =>
      Array.isArray(organizedFiles)
        ? organizedFiles.filter((file) =>
            processedFileIds.has(file?.originalPath || file?.path),
          )
        : [],
    [organizedFiles, processedFileIds],
  );

  const findSmartFolderForCategory = useMemo(() => {
    const folderCache = new Map();
    return (category) => {
      if (!category) return null;
      if (folderCache.has(category)) return folderCache.get(category);
      const normalizedCategory = category.toLowerCase().trim();
      let folder = smartFolders.find(
        (f) => f?.name?.toLowerCase()?.trim() === normalizedCategory,
      );
      if (folder) {
        folderCache.set(category, folder);
        return folder;
      }
      const variants = [
        normalizedCategory,
        normalizedCategory.replace(/s$/, ''),
        normalizedCategory + 's',
        normalizedCategory.replace(/\s+/g, ''),
        normalizedCategory.replace(/\s+/g, '-'),
        normalizedCategory.replace(/\s+/g, '_'),
      ];
      for (const v of variants) {
        folder = smartFolders.find(
          (f) =>
            f.name.toLowerCase().trim() === v ||
            f.name.toLowerCase().replace(/\s+/g, '') === v ||
            f.name.toLowerCase().replace(/\s+/g, '-') === v ||
            f.name.toLowerCase().replace(/\s+/g, '_') === v,
        );
        if (folder) {
          folderCache.set(category, folder);
          return folder;
        }
      }
      folderCache.set(category, null);
      return null;
    };
  }, [smartFolders]);

  // File operations
  const markFilesAsProcessed = useCallback((filePaths) => {
    setProcessedFileIds((prev) => {
      const next = new Set(prev);
      filePaths.forEach((path) => next.add(path));
      return next;
    });
  }, []);

  const unmarkFilesAsProcessed = useCallback((filePaths) => {
    setProcessedFileIds((prev) => {
      const next = new Set(prev);
      filePaths.forEach((path) => next.delete(path));
      return next;
    });
  }, []);

  const toggleFileSelection = useCallback((index) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  }, []);

  const selectAllFiles = useCallback(() => {
    setSelectedFiles((prev) => {
      return prev.size === unprocessedFiles.length
        ? new Set()
        : new Set(Array.from({ length: unprocessedFiles.length }, (_, i) => i));
    });
  }, [unprocessedFiles.length]);

  const applyBulkCategoryChange = useCallback(() => {
    if (!bulkCategory) return;
    const newEdits = {};
    selectedFiles.forEach(
      (i) => (newEdits[i] = { ...editingFiles[i], category: bulkCategory }),
    );
    setEditingFiles((prev) => ({ ...prev, ...newEdits }));
    setBulkEditMode(false);
    setBulkCategory('');
    setSelectedFiles(new Set());
    addNotification(
      `Applied category "${bulkCategory}" to ${selectedFiles.size} files`,
      'success',
    );
  }, [bulkCategory, selectedFiles, editingFiles, addNotification]);

  const approveSelectedFiles = useCallback(() => {
    if (selectedFiles.size === 0) return;
    addNotification(
      `Approved ${selectedFiles.size} files for organization`,
      'success',
    );
    setSelectedFiles(new Set());
  }, [selectedFiles.size, addNotification]);

  const handleEditFile = useCallback((fileIndex, field, value) => {
    setEditingFiles((prev) => ({
      ...prev,
      [fileIndex]: { ...prev[fileIndex], [field]: value },
    }));
  }, []);

  const getFileWithEdits = useCallback(
    (file, index) => {
      const edits = editingFiles[index];
      if (!edits) return file;
      const updatedCategory = edits.category || file.analysis?.category;
      return {
        ...file,
        analysis: {
          ...file.analysis,
          suggestedName: edits.suggestedName || file.analysis?.suggestedName,
          category: updatedCategory,
        },
      };
    },
    [editingFiles],
  );

  const handleOrganizeFiles = useCallback(async () => {
    setIsOrganizing(true);

    // Enhanced validation and logging
    currentFilesToProcess = unprocessedFiles.filter((f) => f.analysis);

    if (currentFilesToProcess.length === 0) {
      // Provide more specific feedback about why files can't be processed
      const filesWithoutAnalysis = unprocessedFiles.filter((f) => !f.analysis);
      const filesWithoutCategory = unprocessedFiles.filter(
        (f) => f.analysis && !f.analysis.category,
      );

      if (filesWithoutAnalysis.length > 0) {
        addNotification(
          `${filesWithoutAnalysis.length} files need analysis. Please go back to Discovery phase to analyze them.`,
          'warning',
        );
      } else if (filesWithoutCategory.length > 0) {
        addNotification(
          `${filesWithoutCategory.length} files don't have category information. Please check file analysis.`,
          'warning',
        );
      } else {
        addNotification(
          'No files ready for organization. Files need analysis data to be organized.',
          'warning',
        );
      }
      return;
    }

    if (!Array.isArray(smartFolders) || smartFolders.length === 0) {
      addNotification(
        'No smart folders available. Please ensure smart folders are loaded.',
        'warning',
      );
      return;
    }

    setBatchProgress({
      current: 0,
      total: currentFilesToProcess.length,
      currentFile: '',
    });

    // Build operations for main process
    currentOperations = currentFilesToProcess.map((file, i) => {
      const edits = editingFiles[i] || {};
      const fileWithEdits = getFileWithEdits(file, i);
      const currentCategory =
        edits.category || fileWithEdits.analysis?.category;
      const smartFolder = findSmartFolderForCategory(currentCategory);

      const destinationDir = smartFolder
        ? smartFolder.path || `${defaultLocation}/${smartFolder.name}`
        : `${defaultLocation}/${currentCategory || 'Uncategorized'}`;
      const newName =
        edits.suggestedName ||
        fileWithEdits.analysis?.suggestedName ||
        file.name;
      const dest = `${destinationDir}/${newName}`;
      const normalized =
        window.electronAPI?.files?.normalizePath?.(dest) || dest;

      const operation = {
        type: 'move',
        source: file.path,
        destination: normalized,
      };

      return operation;
    });

    // Prepare preview
    const preview = currentFilesToProcess.map((file, i) => {
      const edits = editingFiles[i] || {};
      const fileWithEdits = getFileWithEdits(file, i);
      const currentCategory =
        edits.category || fileWithEdits.analysis?.category;
      const smartFolder = findSmartFolderForCategory(currentCategory);
      const destinationDir = smartFolder
        ? smartFolder.path || `${defaultLocation}/${smartFolder.name}`
        : `${defaultLocation}/${currentCategory || 'Uncategorized'}`;
      const newName =
        edits.suggestedName ||
        fileWithEdits.analysis?.suggestedName ||
        file.name;
      const dest = `${destinationDir}/${newName}`;
      const normalized =
        window.electronAPI?.files?.normalizePath?.(dest) || dest;
      return { fileName: newName, destination: normalized };
    });
    setOrganizePreview(preview);

    const sourcePathsSet = new Set(currentOperations.map((op) => op.source));

    const stateCallbacks = {
      onExecute: (result) => {
        const resArray = Array.isArray(result?.results) ? result.results : [];

        const uiResults = resArray
          .filter((r) => r.success)
          .map((r) => {
            const original =
              analysisResults.find((a) => a.path === r.source) || {};
            return {
              originalPath: r.source,
              path: r.destination,
              originalName:
                original.name ||
                (original.path ? original.path.split(/[\\/]/).pop() : ''),
              newName: r.destination ? r.destination.split(/[\\/]/).pop() : '',
              smartFolder: 'Organized',
              organizedAt: new Date().toISOString(),
            };
          });

        if (uiResults.length > 0) {
          setOrganizedFiles((prev) => [...prev, ...uiResults]);
          markFilesAsProcessed(uiResults.map((r) => r.originalPath));
          actions.setPhaseData('organizedFiles', [
            ...(phaseData.organizedFiles || []),
            ...uiResults,
          ]);
          addNotification(`Organized ${uiResults.length} files`, 'success');
          setBatchProgress({
            current: currentFilesToProcess.length,
            total: currentFilesToProcess.length,
            currentFile: '',
          });
        } else {
          addNotification('No files were successfully organized', 'warning');
        }
      },
      onUndo: () => {
        setOrganizedFiles((prev) =>
          prev.filter((of) => !sourcePathsSet.has(of.originalPath)),
        );
        unmarkFilesAsProcessed(Array.from(sourcePathsSet));
        actions.setPhaseData(
          'organizedFiles',
          (phaseData.organizedFiles || []).filter(
            (of) => !sourcePathsSet.has(of.originalPath),
          ),
        );
        addNotification(
          'Undo complete. Restored files to original locations.',
          'info',
        );
      },
      onRedo: () => {
        const uiResults = currentOperations.map((op) => ({
          originalPath: op.source,
          path: op.destination,
          originalName: op.source.split(/[\\/]/).pop(),
          newName: op.destination.split(/[\\/]/).pop(),
          smartFolder: 'Organized',
          organizedAt: new Date().toISOString(),
        }));
        setOrganizedFiles((prev) => [...prev, ...uiResults]);
        markFilesAsProcessed(uiResults.map((r) => r.originalPath));
        actions.setPhaseData('organizedFiles', [
          ...(phaseData.organizedFiles || []),
          ...uiResults,
        ]);
        addNotification('Redo complete. Files re-organized.', 'info');
      },
    };

    try {
      // Execute as a single undoable action
      // Validate electron API availability
      if (!window.electronAPI?.files?.performOperation) {
        console.error('[ORGANIZE] Electron API not available');
        addNotification(
          'Application error: File system API unavailable. Please restart the application.',
          'error',
        );
        return;
      }

      const action = createOrganizeBatchAction(
        `Organize ${currentOperations.length} files`,
        currentOperations,
        stateCallbacks,
      );

      const result = await executeAction(action);

      // Advance if successful
      const successCount = Array.isArray(result?.results)
        ? result.results.filter((r) => r.success).length
        : 0;

      if (successCount > 0) actions.advancePhase(PHASES.COMPLETE);
    } catch (error) {
      console.error('[ORGANIZE] Error during organization:', error);
      console.error('[ORGANIZE] Error stack:', error.stack);
      console.error('[ORGANIZE] Error details:', {
        message: error.message,
        name: error.name,
        stack: error.stack,
        operations: currentOperations?.length || 0,
        filesToProcess: currentFilesToProcess?.length || 0,
        smartFolders: smartFolders?.length || 0,
      });

      // Check for specific error types
      if (error.message?.includes('batch_organize')) {
        console.error('[ORGANIZE] IPC communication error with batch_organize');
        addNotification(
          'Communication error with file system. Please restart the application.',
          'error',
        );
      } else if (error.message?.includes('permission')) {
        console.error('[ORGANIZE] File permission error');
        addNotification(
          'Permission denied. Please check file permissions.',
          'error',
        );
      } else if (error.message?.includes('not found')) {
        console.error('[ORGANIZE] File not found error');
        addNotification(
          'Some files were not found. They may have been moved or deleted.',
          'error',
        );
      } else {
        addNotification(`Organization failed: ${error.message}`, 'error');
      }
    } finally {
      setIsOrganizing(false);
      setBatchProgress({ current: 0, total: 0, currentFile: '' });
    }
  }, [
    unprocessedFiles,
    editingFiles,
    getFileWithEdits,
    findSmartFolderForCategory,
    defaultLocation,
    analysisResults,
    markFilesAsProcessed,
    actions,
    phaseData.organizedFiles,
    addNotification,
    unmarkFilesAsProcessed,
    executeAction,
  ]);

  const getFileState = useCallback(
    (filePath) => fileStates[filePath]?.state || 'pending',
    [fileStates],
  );

  const getFileStateDisplay = useCallback(
    (filePath, hasAnalysis, isProcessed = false) => {
      if (isProcessed) {
        return {
          icon: '✅',
          label: 'Organized',
          color: 'text-green-600',
          spinning: false,
        };
      }
      const state = getFileState(filePath);
      if (state === 'analyzing') {
        return {
          icon: '🔄',
          label: 'Analyzing...',
          color: 'text-blue-600',
          spinning: true,
        };
      }
      if (state === 'error') {
        return {
          icon: '❌',
          label: 'Error',
          color: 'text-red-600',
          spinning: false,
        };
      }
      if (hasAnalysis && state === 'ready') {
        return {
          icon: '📂',
          label: 'Ready',
          color: 'text-stratosort-blue',
          spinning: false,
        };
      }
      if (state === 'pending') {
        return {
          icon: '⏳',
          label: 'Pending',
          color: 'text-yellow-600',
          spinning: false,
        };
      }
      return {
        icon: '❌',
        label: 'Failed',
        color: 'text-red-600',
        spinning: false,
      };
    },
    [getFileState],
  );

  return {
    // State
    organizedFiles,
    isOrganizing,
    batchProgress,
    organizePreview,
    documentsPath,
    editingFiles,
    selectedFiles,
    bulkEditMode,
    bulkCategory,
    defaultLocation,
    canUndo,
    canRedo,
    fileStates,
    processedFileIds,
    analysisResults,
    smartFolders,
    unprocessedFiles,
    processedFiles,
    findSmartFolderForCategory,

    // Actions
    setBulkEditMode,
    setBulkCategory,
    selectAllFiles,
    applyBulkCategoryChange,
    approveSelectedFiles,
    handleEditFile,
    getFileWithEdits,
    handleOrganizeFiles,
    getFileStateDisplay,
    toggleFileSelection,
    markFilesAsProcessed,
    unmarkFilesAsProcessed,
    setEditingFiles,
    setSelectedFiles,
  };
}
