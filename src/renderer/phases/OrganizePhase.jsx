import React, { useEffect, useMemo, useState, useRef } from 'react';
import { PHASES, RENDERER_LIMITS } from '../../shared/constants';
import { usePhase } from '../contexts/PhaseContext';
import { useNotification } from '../contexts/NotificationContext';
import { Collapsible, Button, Input, Select } from '../components/ui';
import {
  StatusOverview,
  ReadyFileItem,
  BulkOperations,
  OrganizeButton,
  AnimatedFileList,
} from '../components/organize';
import { UndoRedoToolbar, useUndoRedo } from '../components/UndoRedoSystem';
import { createOrganizeBatchAction } from '../components/UndoRedoSystem';

function OrganizePhase() {
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
  const [bulkCategory, setBulkCategory] = useState('');
  const [defaultLocation, setDefaultLocation] = useState('Documents');
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const [fileStates, setFileStates] = useState({});
  const [processedFileIds, setProcessedFileIds] = useState(new Set());

  // Analysis-related state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentAnalysisFile, setCurrentAnalysisFile] = useState('');
  const [analysisProgress, setAnalysisProgress] = useState({
    current: 0,
    total: 0,
  });
  const analysisLockRef = useRef(false);
  const [globalAnalysisActive, setGlobalAnalysisActive] = useState(false);

  const analysisResults =
    phaseData.analysisResults && Array.isArray(phaseData.analysisResults)
      ? phaseData.analysisResults
      : [];

  // Ensure any files marked as ready/error in fileStates are represented in analysisResults
  const effectiveAnalysisResults = useMemo(() => {
    const byPath = new Map();
    // Seed with existing analysis results
    (analysisResults || []).forEach((r) => {
      if (r?.path) byPath.set(r.path, r);
    });
    // Add any entries from fileStates that are missing
    Object.entries(fileStates || {}).forEach(([path, stateObj]) => {
      if (!byPath.has(path) && path) {
        const base = {
          name: path.split(/[\\\\/]/).pop(),
          path,
          size: 0,
          type: 'file',
          source: 'reconstructed',
          analyzedAt: stateObj.analyzedAt,
        };
        if (stateObj.state === 'ready') {
          // Include ready files even if they don't have analysis data yet
          byPath.set(path, {
            ...base,
            analysis: stateObj.analysis || {
              category: 'Uncategorized',
              suggestedName: base.name,
            },
            status: 'analyzed',
          });
        } else if (stateObj.state === 'error' && stateObj.error) {
          byPath.set(path, {
            ...base,
            analysis: null,
            error: stateObj.error,
            status: 'failed',
          });
        }
      }
    });
    return Array.from(byPath.values());
  }, [analysisResults, fileStates]);
  const smartFolders = phaseData.smartFolders || [];

  // Ensure smart folders are available even if user skipped Setup
  useEffect(() => {
    const loadSmartFoldersIfMissing = async () => {
      try {
        if (!Array.isArray(smartFolders) || smartFolders.length === 0) {
          const folders = await window.electronAPI.smartFolders.get();
          if (Array.isArray(folders) && folders.length > 0) {
            actions.setPhaseData('smartFolders', folders);
            addNotification(
              `Loaded ${folders.length} smart folder${folders.length > 1 ? 's' : ''}`,
              'info',
            );
          }
        }
      } catch (error) {
        console.error('Failed to load smart folders in Organize phase:', error);
      }
    };
    loadSmartFoldersIfMissing();
  }, []);

  useEffect(() => {
    // Resolve a real default destination base (Documents folder) from main process
    (async () => {
      try {
        const docsPath = await window.electronAPI?.files?.getDocumentsPath?.();
        if (docsPath && typeof docsPath === 'string') {
          setDefaultLocation(docsPath);
        }
      } catch {}
    })();

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
          if (file.analysis && !file.error)
            reconstructedStates[file.path] = {
              state: 'ready',
              timestamp: file.analyzedAt || new Date().toISOString(),
              analysis: file.analysis,
              analyzedAt: file.analyzedAt,
            };
          else if (file.error)
            reconstructedStates[file.path] = {
              state: 'error',
              timestamp: file.analyzedAt || new Date().toISOString(),
              error: file.error,
              analyzedAt: file.analyzedAt,
            };
          else
            reconstructedStates[file.path] = {
              state: 'pending',
              timestamp: new Date().toISOString(),
            };
        });
        setFileStates(reconstructedStates);
        actions.setPhaseData('fileStates', reconstructedStates);
      }
      const previouslyOrganized = phaseData.organizedFiles || [];
      const processedIds = new Set(
        previouslyOrganized.map((file) => file.originalPath || file.path),
      );
      setProcessedFileIds(processedIds);
      if (previouslyOrganized.length > 0)
        setOrganizedFiles(previouslyOrganized);
    };
    loadPersistedData();
  }, [phaseData, analysisResults, actions]);

  // Subscribe to progress events from main for batch organize
  useEffect(() => {
    const unsubscribe = window.electronAPI?.events?.onOperationProgress?.(
      (payload) => {
        try {
          if (!payload || payload.type !== 'batch_organize') return;
          setBatchProgress({
            current: Number(payload.current) || 0,
            total: Number(payload.total) || 0,
            currentFile: payload.currentFile || '',
          });
        } catch {}
      },
    );
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  // Analysis state is now handled locally in OrganizePhase

  const getFileState = (filePath) => fileStates[filePath]?.state || 'pending';
  const getFileStateDisplay = (filePath, hasAnalysis, isProcessed = false) => {
    if (isProcessed)
      return {
        icon: '✅',
        label: 'Organized',
        color: 'text-green-600',
        spinning: false,
      };
    const state = getFileState(filePath);
    if (state === 'analyzing')
      return {
        icon: '🔄',
        label: 'Analyzing...',
        color: 'text-blue-600',
        spinning: true,
      };
    if (state === 'error')
      return {
        icon: '❌',
        label: 'Error',
        color: 'text-red-600',
        spinning: false,
      };
    if (hasAnalysis && state === 'ready')
      return {
        icon: '📂',
        label: 'Ready',
        color: 'text-stratosort-blue',
        spinning: false,
      };
    if (state === 'pending')
      return {
        icon: '⏳',
        label: 'Pending',
        color: 'text-yellow-600',
        spinning: false,
      };
    return {
      icon: '❌',
      label: 'Failed',
      color: 'text-red-600',
      spinning: false,
    };
  };

  const unprocessedFiles = Array.isArray(effectiveAnalysisResults)
    ? effectiveAnalysisResults.filter(
        (file) =>
          !processedFileIds.has(file.path) &&
          file &&
          (file.analysis || fileStates[file.path]?.state === 'ready'),
      )
    : [];

  const processedFiles = Array.isArray(organizedFiles)
    ? organizedFiles.filter((file) =>
        processedFileIds.has(file?.originalPath || file?.path),
      )
    : [];

  // Debug: Log file visibility information
  useEffect(() => {
    console.log('[DEBUG] File visibility breakdown:', {
      totalEffectiveResults: effectiveAnalysisResults.length,
      unprocessedFiles: unprocessedFiles.length,
      processedFiles: processedFiles.length,
      processedFileIds: Array.from(processedFileIds),
      readyInFileStates: Object.entries(fileStates).filter(
        ([_, state]) => state.state === 'ready',
      ).length,
      errorInFileStates: Object.entries(fileStates).filter(
        ([_, state]) => state.state === 'error',
      ).length,
      analyzingInFileStates: Object.entries(fileStates).filter(
        ([_, state]) => state.state === 'analyzing',
      ).length,
    });
  }, [
    effectiveAnalysisResults,
    unprocessedFiles,
    processedFiles,
    processedFileIds,
    fileStates,
  ]);

  // Helper function to find smart folder for category
  const findSmartFolderForCategory = (category) => {
    if (!category) return null;
    const normalizedCategory = category.toLowerCase().trim();
    let folder = smartFolders.find(
      (f) => f?.name?.toLowerCase()?.trim() === normalizedCategory,
    );
    if (folder) return folder;

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
      if (folder) return folder;
    }
    return null;
  };

  // Analysis functions - moved from DiscoverPhase to happen here
  const updateFileState = (filePath, state, metadata = {}) => {
    setFileStates((prev) => ({
      ...prev,
      [filePath]: {
        ...prev[filePath],
        state,
        timestamp: new Date().toISOString(),
        ...metadata,
      },
    }));
  };

  const analyzeFiles = async (files) => {
    if (!files || files.length === 0) return;

    console.log('[ANALYSIS] Starting analysis in OrganizePhase with:', {
      filesCount: files.length,
      isAnalyzing,
    });

    // Reset processed tracking so new ready files are visible
    setProcessedFileIds(new Set());

    // Prevent multiple simultaneous analysis calls
    if (analysisLockRef.current || globalAnalysisActive) {
      console.log(
        '[ANALYSIS] Analysis already in progress, skipping duplicate call',
      );
      return;
    }

    if (isAnalyzing) {
      console.log(
        '[ANALYSIS] UI shows analysis already in progress, skipping call',
      );
      return;
    }

    // Set the lock immediately
    analysisLockRef.current = true;
    setGlobalAnalysisActive(true);
    console.log('[ANALYSIS] Analysis lock acquired');

    // Small delay to ensure lock is properly established
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Set a timeout to release the lock after 5 minutes (safety measure)
    const lockTimeout = setTimeout(
      () => {
        if (analysisLockRef.current) {
          console.warn(
            '[ANALYSIS] Analysis lock timeout reached, forcing release',
          );
          analysisLockRef.current = false;
        }
      },
      5 * 60 * 1000,
    );

    // Reset analysis state for clean start
    setIsAnalyzing(true);
    const initialProgress = {
      current: 0,
      total: files.length,
      lastActivity: Date.now(),
    };
    setAnalysisProgress(initialProgress);
    setCurrentAnalysisFile('');
    actions.setPhaseData('isAnalyzing', true);
    actions.setPhaseData('analysisProgress', initialProgress);
    actions.setPhaseData('currentAnalysisFile', '');

    console.log('[ANALYSIS] Started analysis with progress:', initialProgress);

    const results = [];
    let maxConcurrent = 3;
    try {
      const persistedSettings = await window.electronAPI.settings.get();
      if (persistedSettings?.maxConcurrentAnalysis) {
        maxConcurrent = Number(persistedSettings.maxConcurrentAnalysis);
      }
    } catch {}

    const concurrency = Math.max(1, Math.min(Number(maxConcurrent) || 3, 8));

    try {
      // Single notification for analysis start (no phase advance - we're already here)
      addNotification(
        `🔍 Starting AI analysis of ${files.length} files...`,
        'info',
        3000,
        'analysis-start',
      );

      // Create a Set to track processed files and prevent duplicates
      const processedFiles = new Set();
      const fileQueue = [...files];
      let completedCount = 0;

      // Get naming convention from phaseData
      const namingConvention = phaseData.namingConvention || {};
      const { convention, dateFormat, caseConvention, separator } =
        namingConvention;

      console.log('[DEBUG] Naming convention settings:', {
        convention,
        dateFormat,
        caseConvention,
        separator,
        fullNamingConvention: namingConvention,
      });

      // Helper functions for naming conventions
      const formatDate = (date, format) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        switch (format) {
          case 'YYYY-MM-DD':
            return `${year}-${month}-${day}`;
          case 'MM-DD-YYYY':
            return `${month}-${day}-${year}`;
          case 'DD-MM-YYYY':
            return `${day}-${month}-${year}`;
          case 'YYYYMMDD':
            return `${year}${month}${day}`;
          default:
            return `${year}-${month}-${day}`;
        }
      };

      const applyCaseConvention = (text, convention) => {
        switch (convention) {
          case 'kebab-case':
            return text
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '');
          case 'snake_case':
            return text
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '_')
              .replace(/^_|_$/g, '');
          case 'camelCase':
            return text
              .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) =>
                index === 0 ? word.toLowerCase() : word.toUpperCase(),
              )
              .replace(/\s+/g, '');
          case 'PascalCase':
            return text
              .replace(/(?:^\w|[A-Z]|\b\w)/g, (word) => word.toUpperCase())
              .replace(/\s+/g, '');
          default:
            return text;
        }
      };

      // File type support: pdf, txt, docx, xlsx, jpg, png and more
      // Analysis system supports document, spreadsheet, and image files
      const generatePreviewName = (originalName) => {
        if (!convention || convention === 'keep-original') return originalName;

        // Extract base name and extension
        const lastDotIndex = originalName.lastIndexOf('.');
        const baseName =
          lastDotIndex !== -1
            ? originalName.substring(0, lastDotIndex)
            : originalName;
        const extension =
          lastDotIndex !== -1 ? originalName.substring(lastDotIndex) : '';

        const today = new Date();
        let previewName = '';

        switch (convention) {
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

        const finalName =
          applyCaseConvention(previewName, caseConvention) + extension;

        console.log('[DEBUG] Name transformation:', {
          original: originalName,
          baseName,
          extension,
          previewName,
          finalName,
          convention,
          caseConvention,
          separator,
          dateFormat,
        });

        return finalName;
      };

      // Create a single worker function that processes files sequentially
      const processFile = async (file) => {
        // Skip if already processed
        if (processedFiles.has(file.path)) {
          return;
        }

        const fileName = file.name || file.path.split(/[\\/]/).pop();

        // Mark as processing
        processedFiles.add(file.path);
        updateFileState(file.path, 'analyzing', { fileName });

        try {
          // Show current file being analyzed
          setCurrentAnalysisFile(fileName);
          actions.setPhaseData('currentAnalysisFile', fileName);

          const fileInfo = {
            ...file,
            size: file.size || 0,
            created: file.created,
            modified: file.modified,
          };

          const analysis = await Promise.race([
            window.electronAPI.files.analyze(file.path),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error('Analysis timeout after 3 minutes')),
                RENDERER_LIMITS.ANALYSIS_TIMEOUT_MS,
              ),
            ),
          ]);

          if (analysis && !analysis.error) {
            const enhancedAnalysis = {
              ...analysis,
              // Keep the original suggested name from AI, don't apply naming convention here
              suggestedName: analysis.suggestedName || fileName,
              namingConvention: {
                convention,
                dateFormat,
                caseConvention,
                separator,
              },
            };
            const result = {
              ...fileInfo,
              analysis: enhancedAnalysis,
              status: 'analyzed',
              analyzedAt: new Date().toISOString(),
            };
            results.push(result);
            updateFileState(file.path, 'ready', {
              analysis: enhancedAnalysis,
              analyzedAt: new Date().toISOString(),
            });
            console.log('[DEBUG] File marked as ready:', {
              path: file.path,
              name: fileName,
              hasAnalysis: !!enhancedAnalysis,
              analysisKeys: Object.keys(enhancedAnalysis || {}),
            });

            // Increment progress after successful analysis
            completedCount++;
            const progress = {
              current: completedCount,
              total: files.length,
              lastActivity: Date.now(),
            };
            setAnalysisProgress(progress);
            actions.setPhaseData('analysisProgress', progress);
          } else {
            const result = {
              ...fileInfo,
              analysis: null,
              error: analysis?.error || 'Analysis failed',
              status: 'failed',
              analyzedAt: new Date().toISOString(),
            };
            results.push(result);
            updateFileState(file.path, 'error', {
              error: analysis?.error || 'Analysis failed',
              analyzedAt: new Date().toISOString(),
            });

            // Increment progress even for failed analysis
            completedCount++;
            const progress = {
              current: completedCount,
              total: files.length,
              lastActivity: Date.now(),
            };
            setAnalysisProgress(progress);
            actions.setPhaseData('analysisProgress', progress);
          }
        } catch (error) {
          const result = {
            ...file,
            analysis: null,
            error: error.message,
            status: 'failed',
            analyzedAt: new Date().toISOString(),
          };
          results.push(result);
          updateFileState(file.path, 'error', {
            error: error.message,
            analyzedAt: new Date().toISOString(),
          });

          // Increment progress even for exceptions
          completedCount++;
          const progress = {
            current: completedCount,
            total: files.length,
            lastActivity: Date.now(),
          };
          setAnalysisProgress(progress);
          actions.setPhaseData('analysisProgress', progress);
        }
      };

      // Process files with controlled concurrency
      const processBatch = async (batch) => {
        try {
          const promises = batch.map((file) => processFile(file));
          await Promise.all(promises);
        } catch (error) {
          console.error('[ANALYSIS] Batch processing error:', error);
        }
      };

      // Process files in batches to control concurrency
      for (let i = 0; i < fileQueue.length; i += concurrency) {
        const batch = fileQueue.slice(i, i + concurrency);
        await processBatch(batch);
      }

      // Update analysis results and file states
      const resultsByPath = new Map(
        (analysisResults || []).map((r) => [r.path, r]),
      );
      results.forEach((r) => resultsByPath.set(r.path, r));
      const mergedResults = Array.from(resultsByPath.values());

      // Build updated fileStates from results
      const updatedFileStates = { ...fileStates };
      results.forEach((result) => {
        if (result.analysis && !result.error) {
          updatedFileStates[result.path] = {
            state: 'ready',
            timestamp: new Date().toISOString(),
            analysis: result.analysis,
            analyzedAt: result.analyzedAt,
          };
        } else if (result.error) {
          updatedFileStates[result.path] = {
            state: 'error',
            timestamp: new Date().toISOString(),
            error: result.error,
            analyzedAt: new Date().toISOString(),
          };
        }
      });

      setFileStates(updatedFileStates);
      actions.setPhaseData('analysisResults', mergedResults);
      actions.setPhaseData('fileStates', updatedFileStates);

      console.log('[DEBUG] Analysis completed:', {
        totalResults: results.length,
        successfulAnalyses: results.filter((r) => r.analysis).length,
        failedAnalyses: results.filter((r) => r.error).length,
        readyInFileStates: Object.entries(updatedFileStates).filter(
          ([_, state]) => state.state === 'ready',
        ).length,
        errorInFileStates: Object.entries(updatedFileStates).filter(
          ([_, state]) => state.state === 'error',
        ).length,
      });

      const successCount = results.filter((r) => r.analysis).length;
      const failureCount = results.length - successCount;

      // Completion notifications
      if (successCount > 0 && failureCount === 0) {
        addNotification(
          `🎉 Analysis complete! ${successCount} files ready for organization`,
          'success',
          4000,
          'analysis-complete',
        );
      } else if (successCount > 0 && failureCount > 0) {
        addNotification(
          `Analysis complete: ${successCount} successful, ${failureCount} failed`,
          'warning',
          4000,
          'analysis-complete',
        );
      } else if (failureCount > 0) {
        addNotification(
          `Analysis failed for all ${failureCount} files`,
          'error',
          5000,
          'analysis-complete',
        );
      }
    } catch (error) {
      addNotification(
        `Analysis process failed: ${error.message}`,
        'error',
        5000,
        'analysis-error',
      );
    } finally {
      // Always reset analysis state
      setIsAnalyzing(false);
      setCurrentAnalysisFile('');
      setAnalysisProgress({ current: 0, total: 0 });
      actions.setPhaseData('isAnalyzing', false);
      actions.setPhaseData('currentAnalysisFile', '');
      actions.setPhaseData('analysisProgress', { current: 0, total: 0 });

      // Release the analysis lock
      analysisLockRef.current = false;
      setGlobalAnalysisActive(false);
      clearTimeout(lockTimeout);
    }
  };

  // Auto-start analysis when files are available
  useEffect(() => {
    const selectedFilesFromPhase = phaseData.selectedFiles || [];

    console.log('[ORGANIZE] Analysis check:', {
      selectedFiles: selectedFilesFromPhase.length,
      analysisResults: analysisResults.length,
      isAnalyzing,
      globalAnalysisActive,
      analysisLockRef: analysisLockRef.current,
      phaseDataKeys: Object.keys(phaseData),
    });

    // Check if we have NEW files to analyze (not just persisted results)
    // We should analyze if we have selected files and they haven't been analyzed yet
    const needsAnalysis =
      selectedFilesFromPhase.length > 0 &&
      selectedFilesFromPhase.some((file) => {
        // Check if this file has already been analyzed
        const alreadyAnalyzed = analysisResults.some(
          (result) => result.path === file.path,
        );
        return !alreadyAnalyzed;
      });

    if (
      needsAnalysis &&
      !isAnalyzing &&
      !globalAnalysisActive &&
      !analysisLockRef.current
    ) {
      // Small delay to ensure component is fully mounted
      const timeoutId = setTimeout(() => {
        console.log(
          '[ORGANIZE] Auto-starting analysis for selected files:',
          selectedFilesFromPhase.length,
        );
        analyzeFiles(selectedFilesFromPhase);
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [phaseData.selectedFiles]);

  const handleEditFile = (fileIndex, field, value) => {
    setEditingFiles((prev) => ({
      ...prev,
      [fileIndex]: { ...prev[fileIndex], [field]: value },
    }));
  };

  const getFileWithEdits = (file, index) => {
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
  };

  const markFilesAsProcessed = (filePaths) =>
    setProcessedFileIds((prev) => {
      const next = new Set(prev);
      filePaths.forEach((path) => next.add(path));
      return next;
    });
  const unmarkFilesAsProcessed = (filePaths) =>
    setProcessedFileIds((prev) => {
      const next = new Set(prev);
      filePaths.forEach((path) => next.delete(path));
      return next;
    });

  const toggleFileSelection = (index) => {
    const next = new Set(selectedFiles);
    next.has(index) ? next.delete(index) : next.add(index);
    setSelectedFiles(next);
  };
  const selectAllFiles = () => {
    selectedFiles.size === unprocessedFiles.length
      ? setSelectedFiles(new Set())
      : setSelectedFiles(
          new Set(Array.from({ length: unprocessedFiles.length }, (_, i) => i)),
        );
  };
  const applyBulkCategoryChange = () => {
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
  };
  const approveSelectedFiles = () => {
    if (selectedFiles.size === 0) return;
    addNotification(
      `Approved ${selectedFiles.size} files for organization`,
      'success',
    );
    setSelectedFiles(new Set());
  };

  const handleOrganizeFiles = async () => {
    console.log('[ORGANIZE] Starting organization process...');
    try {
      setIsOrganizing(true);
      const filesToProcess = unprocessedFiles.filter((f) => f.analysis);

      console.log('[ORGANIZE] Files to process:', {
        totalFiles: unprocessedFiles.length,
        filesWithAnalysis: filesToProcess.length,
        filesWithoutAnalysis: unprocessedFiles.length - filesToProcess.length,
      });

      if (filesToProcess.length === 0) {
        console.warn('[ORGANIZE] No files with analysis found to process');
        addNotification('No analyzed files found to organize', 'warning');
        return;
      }

      setBatchProgress({
        current: 0,
        total: filesToProcess.length,
        currentFile: '',
      });

      // Get naming convention from Discover phase
      const namingSettings = phaseData.namingConvention || {
        convention: 'subject-date',
        dateFormat: 'YYYY-MM-DD',
        caseConvention: 'kebab-case',
        separator: '-',
      };

      let operations = [];

      // Standardized organize workflow - always try AutoOrganizeService first
      if (window.electronAPI?.organize?.auto) {
        try {
          // Use the AutoOrganizeService (now fixed to handle all files)
          const result = await window.electronAPI.organize.auto({
            files: filesToProcess,
            smartFolders,
            options: {
              defaultLocation,
              confidenceThreshold: 0.3, // Accept all but very low confidence
              preserveNames: false,
              forceOrganize: true, // Signal that this is a manual action - ALL files should get operations
              namingConvention: namingSettings,
            },
          });

          operations = result.operations || [];

          // Log the auto-organize result for debugging
          console.log('[ORGANIZE] Auto-organize result:', {
            requestedFiles: filesToProcess.length,
            returnedOperations: operations.length,
            needsReview: result.needsReview?.length || 0,
            organized: result.organized?.length || 0,
            failed: result.failed?.length || 0,
          });

          // Handle files that need review (should be rare with forceOrganize=true)
          if (result.needsReview && result.needsReview.length > 0) {
            addNotification(
              `${result.needsReview.length} files need manual review due to low confidence`,
              'info',
            );
          }

          // Verify all files got operations - this should not happen anymore with the fix
          if (operations.length < filesToProcess.length) {
            console.error(
              '[ORGANIZE] AutoOrganizeService failed to generate operations for all files!',
            );
            addNotification(
              `Warning: AutoOrganizeService failed to generate operations for ${filesToProcess.length - operations.length} files`,
              'warning',
            );
          }
        } catch (error) {
          console.error('[ORGANIZE] AutoOrganizeService failed:', error);
          addNotification(
            'AutoOrganizeService failed, falling back to basic organization',
            'warning',
          );
          // Fall through to fallback logic
        }
      }

      // Fallback logic only if AutoOrganizeService is not available or failed completely
      if (operations.length === 0) {
        console.log('[ORGANIZE] Using fallback organization logic');
        operations = filesToProcess.map((file, i) => {
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
          return { type: 'move', source: file.path, destination: normalized };
        });
      }

      // Prepare a lightweight preview list for the progress UI
      try {
        const preview = filesToProcess.map((file, i) => {
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
      } catch {}

      const sourcePathsSet = new Set(operations.map((op) => op.source));

      let organizeSuccessCount = 0;
      let organizeFailCount = 0;

      const stateCallbacks = {
        onExecute: (result) => {
          console.log('[ORGANIZE] Operation execution callback triggered');
          try {
            console.log('[ORGANIZE] Processing execution result:', result);

            const resArray = Array.isArray(result?.results)
              ? result.results
              : [];

            console.log('[ORGANIZE] Results array length:', resArray.length);

            // Count successes and failures
            const successfulResults = resArray.filter((r) => r.success);
            const failedResults = resArray.filter((r) => !r.success);

            console.log('[ORGANIZE] Success/failure breakdown:', {
              successful: successfulResults.length,
              failed: failedResults.length,
              total: resArray.length,
            });

            const uiResults = successfulResults.map((r) => {
              const original =
                analysisResults.find((a) => a.path === r.source) || {};
              return {
                originalPath: r.source,
                path: r.destination,
                originalName:
                  original.name ||
                  (original.path ? original.path.split(/[\\/]/).pop() : ''),
                newName: r.destination
                  ? r.destination.split(/[\\/]/).pop()
                  : '',
                smartFolder: 'Organized',
                organizedAt: new Date().toISOString(),
              };
            });

            organizeSuccessCount = uiResults.length;
            organizeFailCount = failedResults.length;

            console.log('[ORGANIZE] Final counts:', {
              organizeSuccessCount,
              organizeFailCount,
            });

            if (uiResults.length > 0) {
              console.log('[ORGANIZE] Updating organized files state...');
              setOrganizedFiles((prev) => [...prev, ...uiResults]);
              markFilesAsProcessed(uiResults.map((r) => r.originalPath));
              actions.setPhaseData('organizedFiles', [
                ...(phaseData.organizedFiles || []),
                ...uiResults,
              ]);
            }

            // Store failed files info for reporting
            if (failedResults.length > 0) {
              console.warn(
                '[ORGANIZE] Storing failed file information:',
                failedResults,
              );
              actions.setPhaseData('failedOrganizations', failedResults);
            }

            // Show comprehensive notification
            if (organizeSuccessCount > 0 && organizeFailCount === 0) {
              addNotification(
                `✅ Successfully organized ${organizeSuccessCount} files`,
                'success',
              );
            } else if (organizeSuccessCount > 0 && organizeFailCount > 0) {
              addNotification(
                `⚠️ Organized ${organizeSuccessCount} files, ${organizeFailCount} failed`,
                'warning',
              );
              // Log failed files for debugging
              console.warn(
                '[ORGANIZE] Failed files:',
                failedResults.map((r) => ({
                  source: r.source,
                  error: r.error,
                })),
              );
            } else if (organizeFailCount > 0 && organizeSuccessCount === 0) {
              addNotification(
                `❌ Failed to organize ${organizeFailCount} files`,
                'error',
              );
              console.error('[ORGANIZE] All files failed:', failedResults);
            }

            // Mark visual progress complete
            setBatchProgress({
              current: filesToProcess.length,
              total: filesToProcess.length,
              currentFile: '',
            });
          } catch (error) {
            console.error('[ORGANIZE] Error in onExecute callback:', error);
            addNotification('Error processing organization results', 'error');
          }
        },
        onUndo: () => {
          try {
            // Remove any organized entries that belong to this batch
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
          } catch {}
        },
        onRedo: () => {
          try {
            // Best-effort: re-add based on operations
            const uiResults = operations.map((op) => ({
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
          } catch {}
        },
      };

      // Execute as a single undoable action
      const result = await executeAction(
        createOrganizeBatchAction(
          `Organize ${operations.length} files`,
          operations,
          stateCallbacks,
        ),
      );

      // Log the complete result for debugging
      console.log('[ORGANIZE] Batch operation result:', {
        totalOperations: operations.length,
        successCount: organizeSuccessCount,
        failCount: organizeFailCount,
        result: result,
      });

      // Enhanced success/failure handling with logging
      if (organizeSuccessCount > 0 || organizeFailCount > 0) {
        console.log(
          `[ORGANIZE] Organization complete: ${organizeSuccessCount} successful, ${organizeFailCount} failed`,
        );

        // Auto-advance to the next phase after successful organization
        setTimeout(() => {
          console.log('[ORGANIZE] Advancing to Complete phase...');
          actions.advancePhase(PHASES.COMPLETE);
        }, 1500);
      } else {
        console.error(
          '[ORGANIZE] No files were processed - this indicates an error in the workflow',
        );
        addNotification(
          'No files were organized - please check the logs for errors',
          'error',
        );
      }
    } catch (error) {
      console.error('[ORGANIZE] Organization process failed:', error);
      console.error('[ORGANIZE] Error stack:', error.stack);
      addNotification(`Organization failed: ${error.message}`, 'error');

      // Log additional context for debugging
      console.log('[ORGANIZE] Error context:', {
        smartFoldersCount: smartFolders?.length || 0,
        defaultLocation,
        unprocessedFilesCount: unprocessedFiles.length,
        processedFilesCount: processedFiles.length,
      });
    } finally {
      console.log('[ORGANIZE] Cleaning up organization state...');
      setIsOrganizing(false);
      setBatchProgress({ current: 0, total: 0, currentFile: '' });
    }
  };

  // The rest of Organize UI (lists, bulk ops, progress) should be moved here as needed.
  return (
    <div className="w-full">
      <div className="mb-21">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="heading-primary mb-8">📂 File Organization</h2>
            <p className="text-lg text-system-gray-600 leading-relaxed max-w-2xl">
              Review and organize your analyzed files with AI-powered
              suggestions.
            </p>
            {isAnalyzing && (
              <div className="mt-13 p-13 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-8">
                  <div className="animate-spin w-13 h-13 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                  <div className="text-sm font-medium text-blue-700">
                    Analysis continuing in background:{' '}
                    {analysisProgress.current}/{analysisProgress.total} files
                  </div>
                </div>
              </div>
            )}
          </div>
          <UndoRedoToolbar className="flex-shrink-0" />
        </div>
      </div>

      {/* Live Analysis Results section removed - files now show up in real-time in Files Ready for Organization */}

      {/* Target Smart Folders section removed per user request */}
      {(unprocessedFiles.length > 0 || processedFiles.length > 0) && (
        <Collapsible
          title="📊 File Status Overview"
          defaultOpen
          persistKey="organize-status"
        >
          <StatusOverview
            unprocessedCount={unprocessedFiles.length}
            processedCount={processedFiles.length}
            failedCount={
              effectiveAnalysisResults.filter((f) => !f.analysis).length
            }
          />
        </Collapsible>
      )}
      {unprocessedFiles.length > 0 && (
        <Collapsible
          title="Bulk Operations"
          defaultOpen
          persistKey="organize-bulk"
        >
          <BulkOperations
            total={unprocessedFiles.length}
            selectedCount={selectedFiles.size}
            onSelectAll={selectAllFiles}
            onApproveSelected={approveSelectedFiles}
            bulkEditMode={bulkEditMode}
            setBulkEditMode={setBulkEditMode}
            bulkCategory={bulkCategory}
            setBulkCategory={setBulkCategory}
            onApplyBulkCategory={applyBulkCategoryChange}
            smartFolders={smartFolders}
          />
        </Collapsible>
      )}
      <Collapsible
        title="Files Ready for Organization"
        defaultOpen
        persistKey="organize-ready-list"
        contentClassName="max-h-[540px] overflow-y-auto pr-8"
      >
        {/* Analysis progress handled by AnimatedFileList - no separate progress indicator needed */}

        {unprocessedFiles.length === 0 && !isAnalyzing ? (
          <div className="text-center py-21">
            <div className="text-4xl mb-13">
              {processedFiles.length > 0 ? '✅' : '📭'}
            </div>
            <p className="text-system-gray-500 italic">
              {processedFiles.length > 0
                ? 'All files have been organized! Check the results below.'
                : 'No files ready for organization yet.'}
            </p>
            {processedFiles.length === 0 && (
              <Button
                onClick={() => actions.advancePhase(PHASES.DISCOVER)}
                variant="primary"
                className="mt-13"
              >
                ← Go Back to Select Files
              </Button>
            )}
          </div>
        ) : isAnalyzing && unprocessedFiles.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">🔍</div>
            <p className="text-gray-600">
              Files will appear here as they are analyzed...
            </p>
          </div>
        ) : (
          <AnimatedFileList
            unprocessedFiles={unprocessedFiles}
            getFileWithEdits={getFileWithEdits}
            editingFiles={editingFiles}
            selectedFiles={selectedFiles}
            toggleFileSelection={toggleFileSelection}
            getFileStateDisplay={getFileStateDisplay}
            smartFolders={smartFolders}
            handleEditFile={handleEditFile}
            findSmartFolderForCategory={findSmartFolderForCategory}
            defaultLocation={defaultLocation}
          />
        )}
      </Collapsible>
      {processedFiles.length > 0 && (
        <Collapsible
          title="✅ Previously Organized Files"
          defaultOpen={false}
          persistKey="organize-history"
          contentClassName="max-h-[320px] overflow-y-auto pr-8"
        >
          <div className="space-y-5">
            {processedFiles.map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-8 bg-green-50 rounded-lg border border-green-200"
              >
                <div className="flex items-center gap-8">
                  <span className="text-green-600">✅</span>
                  <div>
                    <div className="text-sm font-medium text-system-gray-900">
                      {file.originalName} → {file.newName}
                    </div>
                    <div className="text-xs text-system-gray-500">
                      Moved to {file.smartFolder} •{' '}
                      {new Date(file.organizedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-green-600 font-medium">
                  Organized
                </div>
              </div>
            ))}
          </div>
        </Collapsible>
      )}
      {unprocessedFiles.length > 0 && (
        <Collapsible
          title="Ready to Organize"
          defaultOpen
          persistKey="organize-action"
        >
          <p className="text-system-gray-600 mb-13">
            StratoSort will move and rename{' '}
            <strong>
              {unprocessedFiles.filter((f) => f.analysis).length} files
            </strong>{' '}
            according to AI suggestions.
          </p>
          <p className="text-xs text-system-gray-500 mb-13">
            💡 Don't worry - you can undo this operation if needed
          </p>
          <OrganizeButton
            onClick={handleOrganizeFiles}
            disabled={
              unprocessedFiles.filter((f) => f.analysis).length === 0 ||
              isOrganizing
            }
            fileCount={unprocessedFiles.filter((f) => f.analysis).length}
            className="w-full max-w-md mx-auto"
            isLoading={isOrganizing}
          />
        </Collapsible>
      )}

      {/* Non-invasive Progress Notification */}
      {isOrganizing && (
        <div className="fixed top-4 right-4 z-50 transform translate-x-0 transition-all duration-300 ease-out">
          <div className="bg-white/95 backdrop-blur-sm border border-gray-200 rounded-lg shadow-lg p-4 max-w-sm">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900">
                  Organizing Files
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  {batchProgress.current || 0} of {batchProgress.total || 0}
                  {batchProgress.currentFile && (
                    <div className="truncate mt-1">
                      {batchProgress.currentFile.split('/').pop() ||
                        batchProgress.currentFile}
                    </div>
                  )}
                </div>
                {/* Progress bar */}
                <div className="mt-2 w-full bg-gray-200 rounded-full h-1">
                  <div
                    className="bg-blue-500 h-1 rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(100, ((batchProgress.current || 0) / Math.max(batchProgress.total || 1, 1)) * 100)}%`,
                    }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between gap-8">
        <Button
          onClick={() => actions.advancePhase(PHASES.DISCOVER)}
          variant="secondary"
          disabled={isOrganizing}
          className="w-full sm:w-auto"
        >
          ← Back to Discovery
        </Button>
        <Button
          onClick={() => actions.advancePhase(PHASES.COMPLETE)}
          disabled={processedFiles.length === 0 || isOrganizing}
          className={`w-full sm:w-auto ${processedFiles.length === 0 || isOrganizing ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          View Results →
        </Button>
      </div>
    </div>
  );
}

export default OrganizePhase;
