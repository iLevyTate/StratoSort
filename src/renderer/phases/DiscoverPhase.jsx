import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from 'react';
import { PHASES, RENDERER_LIMITS } from '../../shared/constants';
import { usePhase } from '../contexts/PhaseContext';
import { useNotification } from '../contexts/NotificationContext';
import { useConfirmDialog, useDragAndDrop } from '../hooks';
import { Collapsible, Button, Input, Select } from '../components/ui';
import AnalysisDetails from '../components/AnalysisDetails';
import AnalysisHistoryModal from '../components/AnalysisHistoryModal';
import {
  NamingSettings,
  SelectionControls,
  DragAndDropZone,
  AnalysisResultsList,
  AnalysisProgress,
} from '../components/discover';

function DiscoverPhase() {
  const { actions, phaseData } = usePhase();
  const { addNotification } = useNotification();
  const { showConfirm, ConfirmDialog } = useConfirmDialog();
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [analysisResults, setAnalysisResults] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [currentAnalysisFile, setCurrentAnalysisFile] = useState('');
  const [analysisProgress, setAnalysisProgress] = useState({
    current: 0,
    total: 0,
  });
  const [showAnalysisHistory, setShowAnalysisHistory] = useState(false);
  const [analysisStats, setAnalysisStats] = useState(null);

  const [namingConvention, setNamingConvention] = useState('subject-date');
  const [dateFormat, setDateFormat] = useState('YYYY-MM-DD');
  const [caseConvention, setCaseConvention] = useState('kebab-case');
  const [separator, setSeparator] = useState('-');

  const [fileStates, setFileStates] = useState({});
  // Lightweight render instrumentation for performance troubleshooting
  const renderCountRef = useRef(0);
  useEffect(() => {
    renderCountRef.current += 1;
    // Log render count occasionally to avoid spamming
    if (renderCountRef.current % 20 === 0) {
      console.log('[PERF] DiscoverPhase render count:', renderCountRef.current);
    }
  });

  useEffect(() => {
    // Log sizes of large collections when they change to spot regressions
    console.log(
      '[PERF] selectedFiles:',
      selectedFiles.length,
      'analysisResults:',
      analysisResults.length,
      'fileStates:',
      Object.keys(fileStates).length,
    );
  }, [
    selectedFiles.length,
    analysisResults.length,
    Object.keys(fileStates).length,
  ]);
  const hasResumedRef = useRef(false);
  const analysisLockRef = useRef(false); // Add analysis lock to prevent multiple simultaneous calls
  const [globalAnalysisActive, setGlobalAnalysisActive] = useState(false); // Global analysis state
  // Refs to avoid stale closures inside intervals/callbacks
  const isAnalyzingRef = useRef(isAnalyzing);
  const analysisProgressRef = useRef(analysisProgress);

  useEffect(() => {
    isAnalyzingRef.current = isAnalyzing;
  }, [isAnalyzing]);

  useEffect(() => {
    analysisProgressRef.current = analysisProgress;
  }, [analysisProgress]);

  useEffect(() => {
    const persistedResults = phaseData.analysisResults || [];
    const persistedFiles = phaseData.selectedFiles || [];
    const persistedStates = phaseData.fileStates || {};
    const persistedNaming = phaseData.namingConvention || {};
    const persistedIsAnalyzing = !!phaseData.isAnalyzing;
    const persistedProgress = phaseData.analysisProgress || {
      current: 0,
      total: 0,
    };
    const persistedCurrent = phaseData.currentAnalysisFile || '';

    // Restore persisted state regardless of whether results exist yet
    setSelectedFiles(persistedFiles);
    setFileStates(persistedStates);
    setNamingConvention(persistedNaming.convention || 'subject-date');
    setDateFormat(persistedNaming.dateFormat || 'YYYY-MM-DD');
    setCaseConvention(persistedNaming.caseConvention || 'kebab-case');
    setSeparator(persistedNaming.separator || '-');

    // Reconstruct analysis results from file states if no persisted results exist
    let finalResults = persistedResults;
    if (
      persistedResults.length === 0 &&
      Object.keys(persistedStates).length > 0
    ) {
      // Reconstruct analysis results from file states that have analysis data
      const reconstructedResults = persistedFiles
        .map((file) => {
          const state = persistedStates[file.path];
          if (state && state.state === 'ready' && state.analysis) {
            return {
              ...file,
              analysis: state.analysis,
              status: 'analyzed',
              analyzedAt: state.analyzedAt || new Date().toISOString(),
            };
          }
          return null;
        })
        .filter(Boolean);

      if (reconstructedResults.length > 0) {
        console.log(
          `[DISCOVER] Reconstructed ${reconstructedResults.length} analysis results from file states`,
        );
        finalResults = reconstructedResults;
      }
    }

    if (finalResults.length > 0) setAnalysisResults(finalResults);
    if (persistedIsAnalyzing) {
      // Check if analysis state is actually valid (not stuck)
      const lastActivity = persistedProgress.lastActivity || Date.now();
      const timeSinceActivity = Date.now() - lastActivity;
      const isStuck = timeSinceActivity > 2 * 60 * 1000; // 2 minutes

      if (isStuck) {
        console.log(
          '[ANALYSIS] Detected stuck analysis state on mount, resetting...',
        );
        // Don't restore stuck analysis state
        actions.setPhaseData('isAnalyzing', false);
        actions.setPhaseData('analysisProgress', { current: 0, total: 0 });
        actions.setPhaseData('currentAnalysisFile', '');

        // Clear any stuck localStorage state
        try {
          localStorage.removeItem('stratosort_workflow_state');
        } catch (error) {
          console.warn('[ANALYSIS] Failed to clear localStorage:', error);
        }
      } else {
        // Analysis state is valid, restore it
        setIsAnalyzing(true);
        setAnalysisProgress(persistedProgress);
        setCurrentAnalysisFile(persistedCurrent);
      }
    }
  }, [phaseData]);

  useEffect(() => {
    // Resume analysis if it was in progress before app closed
    // Use a more robust check to prevent race conditions
    const shouldResume =
      !hasResumedRef.current &&
      phaseData.isAnalyzing &&
      Array.isArray(selectedFiles) &&
      selectedFiles.length > 0;

    if (shouldResume) {
      // Immediately mark as resumed to prevent duplicate calls
      hasResumedRef.current = true;

      const remaining = selectedFiles.filter((f) => {
        const state = fileStates[f.path]?.state;
        return state !== 'ready' && state !== 'error';
      });

      if (remaining.length > 0) {
        addNotification(
          `Resuming analysis of ${remaining.length} files...`,
          'info',
          3000,
          'analysis-resume',
        );
        // Kick off analysis for remaining files only
        analyzeFiles(remaining);
      } else {
        // Nothing left to do; clear analyzing flag
        actions.setPhaseData('isAnalyzing', false);
        setIsAnalyzing(false);
      }
    }

    // Auto-reset stuck analysis state after 5 minutes of inactivity
    if (phaseData.isAnalyzing && !hasResumedRef.current) {
      const lastActivity =
        phaseData.analysisProgress?.lastActivity || Date.now();
      const timeSinceActivity = Date.now() - lastActivity;
      const fiveMinutes = 5 * 60 * 1000;

      if (timeSinceActivity > fiveMinutes) {
        console.log(
          '[ANALYSIS] Auto-resetting stuck analysis state after 5 minutes of inactivity',
        );
        addNotification(
          'Detected stuck analysis state - auto-resetting',
          'warning',
          5000,
          'analysis-auto-reset',
        );
        actions.setPhaseData('isAnalyzing', false);
        actions.setPhaseData('analysisProgress', { current: 0, total: 0 });
        actions.setPhaseData('currentAnalysisFile', '');
        setIsAnalyzing(false);
        setAnalysisProgress({ current: 0, total: 0 });
        setCurrentAnalysisFile('');

        // Clear any stuck localStorage state
        try {
          localStorage.removeItem('stratosort_workflow_state');
        } catch (error) {
          console.warn('[ANALYSIS] Failed to clear localStorage:', error);
        }
      }
    }

    // Additional check: if we're analyzing but have no progress for 2+ minutes, reset
    if (
      phaseData.isAnalyzing &&
      phaseData.analysisProgress?.current === 0 &&
      phaseData.analysisProgress?.total > 0
    ) {
      const lastActivity =
        phaseData.analysisProgress?.lastActivity || Date.now();
      const timeSinceActivity = Date.now() - lastActivity;
      const twoMinutes = 2 * 60 * 1000;

      if (timeSinceActivity > twoMinutes) {
        console.log(
          '[ANALYSIS] Auto-resetting analysis with no progress after 2 minutes',
        );
        addNotification(
          'Analysis stalled with no progress - auto-resetting',
          'warning',
          5000,
          'analysis-stalled',
        );
        actions.setPhaseData('isAnalyzing', false);
        actions.setPhaseData('analysisProgress', { current: 0, total: 0 });
        actions.setPhaseData('currentAnalysisFile', '');
        setIsAnalyzing(false);
        setAnalysisProgress({ current: 0, total: 0 });
        setCurrentAnalysisFile('');

        // Clear any stuck localStorage state
        try {
          localStorage.removeItem('stratosort_workflow_state');
        } catch (error) {
          console.warn('[ANALYSIS] Failed to clear localStorage:', error);
        }
      }
    }
  }, [
    phaseData.isAnalyzing,
    selectedFiles,
    fileStates,
    phaseData.analysisProgress,
  ]);

  const updateFileState = (filePath, state, metadata = {}) => {
    try {
      setFileStates((prev) => {
        if (!prev || typeof prev !== 'object') prev = {};
        let newStates = { ...prev };
        const entries = Object.entries(newStates);
        if (entries.length > 100) {
          const sortedEntries = entries.sort(
            (a, b) => new Date(b[1].timestamp) - new Date(a[1].timestamp),
          );
          newStates = Object.fromEntries(sortedEntries.slice(0, 100));
        }
        newStates[filePath] = {
          state,
          timestamp: new Date().toISOString(),
          ...metadata,
        };
        return newStates;
      });
    } catch {
      setFileStates({
        [filePath]: { state, timestamp: new Date().toISOString(), ...metadata },
      });
    }
  };

  const getFileState = (filePath) => fileStates[filePath]?.state || 'pending';

  const getFileStateDisplay = useCallback((filePath, hasAnalysis) => {
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
        icon: '✅',
        label: 'Ready',
        color: 'text-green-600',
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
      icon: '⚪',
      label: 'Unknown',
      color: 'text-gray-500',
      spinning: false,
    };
  }, []);

  const generatePreviewName = useCallback(
    (originalName, originalFileName) => {
      // Always use the extension from the original file, not from the suggested name
      const originalExtension =
        originalFileName && originalFileName.includes('.')
          ? '.' + originalFileName.split('.').pop()
          : '';

      const baseName = originalName.replace(/\.[^/.]+$/, '');
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
      return (
        applyCaseConvention(previewName, caseConvention) + originalExtension
      );
    },
    [namingConvention, dateFormat, caseConvention, separator],
  );

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
      case 'lowercase':
        return text.toLowerCase();
      case 'UPPERCASE':
        return text.toUpperCase();
      default:
        return text;
    }
  };

  const handleFileDrop = async (files) => {
    if (files && files.length > 0) {
      // Get existing file paths to prevent duplicates
      const existingPaths = new Set(selectedFiles.map((f) => f.path));

      // Filter out files that are already selected
      const newFiles = files.filter((file) => !existingPaths.has(file.path));

      if (newFiles.length === 0) {
        addNotification(
          'All dropped files are already in the queue',
          'info',
          2000,
          'files-dropped-duplicate',
        );
        return;
      }

      if (newFiles.length < files.length) {
        const duplicateCount = files.length - newFiles.length;
        addNotification(
          `Skipped ${duplicateCount} duplicate files already in queue`,
          'info',
          2000,
          'files-dropped-skipped',
        );
      }

      const enhancedFiles = newFiles.map((file) => ({
        ...file,
        source: 'drag_drop',
        droppedAt: new Date().toISOString(),
      }));

      // Update file states for new files only
      enhancedFiles.forEach((file) => updateFileState(file.path, 'pending'));

      // Merge with existing files, avoiding duplicates
      const allFiles = [...selectedFiles, ...enhancedFiles];
      const uniqueFiles = allFiles.filter(
        (file, index, self) =>
          index === self.findIndex((f) => f.path === file.path),
      );

      setSelectedFiles(uniqueFiles);
      actions.setPhaseData('selectedFiles', uniqueFiles);

      // Use batch notification for multiple files
      if (enhancedFiles.length > 1) {
        addNotification(
          `Added ${enhancedFiles.length} new files for analysis`,
          'success',
          2500,
          'files-added',
        );
      } else {
        addNotification(
          `Added ${enhancedFiles.length} new file for analysis`,
          'success',
          2500,
          'files-added',
        );
      }

      await analyzeFiles(enhancedFiles);
    }
  };

  const { isDragging, dragProps } = useDragAndDrop(handleFileDrop);

  const getFileType = useCallback((extension) => {
    // Strip leading dot from extension for comparison
    const ext = extension.startsWith('.')
      ? extension.slice(1).toLowerCase()
      : extension.toLowerCase();
    const imageExts = [
      'jpg',
      'jpeg',
      'png',
      'gif',
      'bmp',
      'webp',
      'svg',
      'tiff',
      'ico',
    ];
    const videoExts = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', '3gp'];
    const docExts = ['pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'odt', 'pages'];
    const codeExts = [
      'js',
      'ts',
      'py',
      'java',
      'cpp',
      'c',
      'html',
      'css',
      'json',
      'xml',
    ];
    const archiveExts = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'];
    if (imageExts.includes(ext)) return 'image';
    if (videoExts.includes(ext)) return 'video';
    if (docExts.includes(ext)) return 'document';
    if (codeExts.includes(ext)) return 'code';
    if (archiveExts.includes(ext)) return 'archive';
    return 'file';
  }, []);

  const getBatchFileStats = async (
    filePaths,
    batchSize = RENDERER_LIMITS.FILE_STATS_BATCH_SIZE,
  ) => {
    const results = [];
    for (let i = 0; i < filePaths.length; i += batchSize) {
      const batch = filePaths.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map(async (filePath) => {
          try {
            if (i > 0) await new Promise((resolve) => setTimeout(resolve, 5));
            const stats = await window.electronAPI.files.getStats(filePath);
            const fileName = filePath.split(/[\\/]/).pop();
            const extension = fileName.includes('.')
              ? '.' + fileName.split('.').pop().toLowerCase()
              : '';
            return {
              name: fileName,
              path: filePath,
              extension,
              size: stats?.size || 0,
              type: 'file',
              created: stats?.created,
              modified: stats?.modified,
              success: true,
            };
          } catch (error) {
            const fileName = filePath.split(/[\\/]/).pop();
            return {
              name: fileName,
              path: filePath,
              extension: fileName.includes('.')
                ? '.' + fileName.split('.').pop().toLowerCase()
                : '',
              size: 0,
              type: 'file',
              success: false,
              error: error.message,
            };
          }
        }),
      );
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') results.push(result.value);
        else {
          const filePath = batch[index];
          const fileName = filePath.split(/[\\/]/).pop();
          results.push({
            name: fileName,
            path: filePath,
            extension: fileName.includes('.')
              ? '.' + fileName.split('.').pop().toLowerCase()
              : '',
            size: 0,
            type: 'file',
            success: false,
            error: result.reason?.message || 'Unknown error',
          });
        }
      });
      if (i + batchSize < filePaths.length)
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return results;
  };

  const handleFileSelection = async () => {
    try {
      setIsScanning(true);
      const result = await window.electronAPI.files.select();
      if (result?.success && result?.files?.length > 0) {
        const { files, summary } = result;

        // Get existing file paths to prevent duplicates
        const existingPaths = new Set(selectedFiles.map((f) => f.path));

        // Filter out files that are already selected
        const newFiles = files.filter(
          (filePath) => !existingPaths.has(filePath),
        );

        if (newFiles.length === 0) {
          addNotification(
            'All selected files are already in the queue',
            'info',
            2000,
            'files-selected-duplicate',
          );
          return;
        }

        if (newFiles.length < files.length) {
          const duplicateCount = files.length - newFiles.length;
          addNotification(
            `Skipped ${duplicateCount} duplicate files already in queue`,
            'info',
            2000,
            'files-selected-skipped',
          );
        }

        // Update file states for new files only
        newFiles.forEach((filePath) => updateFileState(filePath, 'pending'));

        const fileObjects = await getBatchFileStats(newFiles);
        const enhancedFiles = fileObjects.map((file) => ({
          ...file,
          source: 'file_selection',
        }));

        // Merge with existing files, avoiding duplicates
        const allFiles = [...selectedFiles, ...enhancedFiles];
        const uniqueFiles = allFiles.filter(
          (file, index, self) =>
            index === self.findIndex((f) => f.path === file.path),
        );

        setSelectedFiles(uniqueFiles);
        actions.setPhaseData('selectedFiles', uniqueFiles);

        const failedFiles = fileObjects.filter((f) => !f.success);
        if (failedFiles.length > 0) {
          addNotification(
            `Warning: ${failedFiles.length} files had issues loading metadata`,
            'warning',
            3000,
            'file-issues',
          );
        }

        // Use batch notification for multiple files
        if (enhancedFiles.length > 1) {
          addNotification(
            `Added ${enhancedFiles.length} new files for analysis`,
            'success',
            2500,
            'files-added',
          );
        } else {
          addNotification(
            `Added ${enhancedFiles.length} new file for analysis`,
            'success',
            2500,
            'files-added',
          );
        }

        // Only analyze the new files
        await analyzeFiles(enhancedFiles);
      } else {
        addNotification('No files selected', 'info', 2000, 'file-selection');
      }
    } catch (error) {
      addNotification(
        `Error selecting files: ${error.message}`,
        'error',
        4000,
        'file-selection-error',
      );
    } finally {
      setIsScanning(false);
    }
  };

  const handleFolderSelection = async () => {
    try {
      setIsScanning(true);
      const result = await window.electronAPI.files.selectDirectory();
      if (result?.success && result?.folder) {
        const scanResult = await window.electronAPI.smartFolders.scanStructure(
          result.folder,
        );
        if (scanResult && scanResult.files && scanResult.files.length > 0) {
          const supportedExts = [
            '.pdf',
            '.doc',
            '.docx',
            '.xls',
            '.xlsx',
            '.ppt',
            '.pptx',
            '.txt',
            '.md',
            '.rtf',
            '.odt',
            '.ods',
            '.odp',
            '.epub',
            '.eml',
            '.msg',
            '.jpg',
            '.jpeg',
            '.png',
            '.gif',
            '.bmp',
            '.webp',
            '.tiff',
            '.svg',
            '.zip',
            '.rar',
            '.7z',
            '.tar',
            '.gz',
            '.kml',
            '.kmz',
          ];
          const supportedFiles = scanResult.files.filter((file) => {
            const ext = file.name.includes('.')
              ? '.' + file.name.split('.').pop().toLowerCase()
              : '';
            return supportedExts.includes(ext);
          });

          if (supportedFiles.length === 0) {
            addNotification(
              'No supported files found in the selected folder',
              'warning',
              3000,
              'folder-scan',
            );
            return;
          }

          // Get existing file paths to prevent duplicates
          const existingPaths = new Set(selectedFiles.map((f) => f.path));

          // Filter out files that are already selected
          const newFiles = supportedFiles.filter(
            (file) => !existingPaths.has(file.path),
          );

          if (newFiles.length === 0) {
            addNotification(
              'All files from this folder are already in the queue',
              'info',
              2000,
              'folder-files-duplicate',
            );
            return;
          }

          if (newFiles.length < supportedFiles.length) {
            const duplicateCount = supportedFiles.length - newFiles.length;
            addNotification(
              `Skipped ${duplicateCount} duplicate files already in queue`,
              'info',
              2000,
              'folder-files-skipped',
            );
          }

          // Update file states for new files only
          newFiles.forEach((file) => updateFileState(file.path, 'pending'));

          const fileObjects = await getBatchFileStats(
            newFiles.map((f) => f.path),
          );
          const enhancedFiles = fileObjects.map((file) => ({
            ...file,
            source: 'folder_scan',
          }));

          // Merge with existing files, avoiding duplicates
          const allFiles = [...selectedFiles, ...enhancedFiles];
          const uniqueFiles = allFiles.filter(
            (file, index, self) =>
              index === self.findIndex((f) => f.path === file.path),
          );

          setSelectedFiles(uniqueFiles);
          actions.setPhaseData('selectedFiles', uniqueFiles);

          // Use batch notification for multiple files
          if (enhancedFiles.length > 1) {
            addNotification(
              `Added ${enhancedFiles.length} new files from folder for analysis`,
              'success',
              2500,
              'files-added',
            );
          } else {
            addNotification(
              `Added ${enhancedFiles.length} new file from folder for analysis`,
              'success',
              2500,
              'files-added',
            );
          }

          await analyzeFiles(enhancedFiles);
        } else {
          addNotification(
            'No files found in the selected folder',
            'warning',
            3000,
            'folder-scan',
          );
        }
      } else if (result?.success === false && result?.folder === null) {
        addNotification(
          'Folder selection cancelled',
          'info',
          2000,
          'folder-selection',
        );
      } else {
        addNotification('No folder selected', 'info', 2000, 'folder-selection');
      }
    } catch (error) {
      addNotification(
        `Error selecting folder: ${error.message}`,
        'error',
        4000,
        'folder-selection-error',
      );
    } finally {
      setIsScanning(false);
    }
  };

  const handleFileAction = async (action, filePath) => {
    try {
      switch (action) {
        case 'open':
          await window.electronAPI.files.open(filePath);
          addNotification(
            `Opened: ${filePath.split(/[\\/]/).pop()}`,
            'success',
            2000,
            'file-actions',
          );
          break;
        case 'reveal':
          await window.electronAPI.files.reveal(filePath);
          addNotification(
            `Revealed: ${filePath.split(/[\\/]/).pop()}`,
            'success',
            2000,
            'file-actions',
          );
          break;
        case 'delete': {
          const fileName = filePath.split(/[\\/]/).pop();
          const confirmDelete = await showConfirm({
            title: 'Delete File',
            message:
              'This action cannot be undone. Are you sure you want to permanently delete this file?',
            confirmText: 'Delete',
            cancelText: 'Cancel',
            variant: 'danger',
            fileName,
          });
          if (confirmDelete) {
            const result = await window.electronAPI.files.delete(filePath);
            if (result.success) {
              setAnalysisResults((prev) =>
                prev.filter((f) => f.path !== filePath),
              );
              setSelectedFiles((prev) =>
                prev.filter((f) => f.path !== filePath),
              );
              setFileStates((prev) => {
                if (!prev) return prev;
                const next = { ...prev };
                delete next[filePath];
                return next;
              });
              addNotification(
                `Deleted: ${fileName}`,
                'success',
                3000,
                'file-actions',
              );
            } else {
              addNotification(
                `Failed to delete: ${fileName}`,
                'error',
                4000,
                'file-actions',
              );
            }
          }
          break;
        }
        default:
          addNotification(
            `Unknown action: ${action}`,
            'error',
            4000,
            'file-actions',
          );
      }
    } catch (error) {
      addNotification(
        `Action failed: ${error.message}`,
        'error',
        4000,
        'file-actions',
      );
    }
  };

  const analyzeFiles = async (files) => {
    if (!files || files.length === 0) return;

    console.log('[ANALYSIS] analyzeFiles called with:', {
      filesCount: files.length,
      isAnalyzing,
      analysisProgress,
      hasLastActivity: !!analysisProgress.lastActivity,
      timeSinceActivity: analysisProgress.lastActivity
        ? Date.now() - analysisProgress.lastActivity
        : 'N/A',
      lockStatus: analysisLockRef.current,
    });

    // Prevent multiple simultaneous analysis calls with atomic check
    if (analysisLockRef.current || globalAnalysisActive || isAnalyzing) {
      console.log(
        '[ANALYSIS] Analysis already in progress, skipping duplicate call',
        {
          lockRef: analysisLockRef.current,
          globalState: globalAnalysisActive,
          uiState: isAnalyzing,
        },
      );
      return;
    }

    // Atomically acquire both locks to prevent race conditions
    analysisLockRef.current = true;
    setGlobalAnalysisActive(true);
    console.log('[ANALYSIS] Analysis lock acquired and global state set');

    // Initialize cleanup variables to prevent ReferenceError
    let heartbeatInterval = null;

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
    ); // 5 minutes

    // Force reset any existing analysis state to ensure clean start
    if (isAnalyzing || analysisProgress.total > 0) {
      console.log(
        '[ANALYSIS] Force resetting existing analysis state for clean start',
      );
      setIsAnalyzing(false);
      setCurrentAnalysisFile('');
      setAnalysisProgress({ current: 0, total: 0 });
      actions.setPhaseData('isAnalyzing', false);
      actions.setPhaseData('currentAnalysisFile', '');
      actions.setPhaseData('analysisProgress', { current: 0, total: 0 });
    }

    // Remove the old blocking logic since we now have the lock system
    // The lock check at the beginning is sufficient

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

    // Set up progress heartbeat to prevent stuck states
    heartbeatInterval = setInterval(() => {
      // Use refs to avoid stale closure values
      if (isAnalyzingRef.current) {
        const latestProgress = analysisProgressRef.current || {
          current: 0,
          total: files.length,
        };
        const currentProgress = {
          current: latestProgress.current,
          total: latestProgress.total,
          lastActivity: Date.now(),
        };

        // Validate progress before updating
        if (validateProgressState(currentProgress)) {
          setAnalysisProgress(currentProgress);
          actions.setPhaseData('analysisProgress', currentProgress);
        } else {
          console.warn(
            '[ANALYSIS] Invalid heartbeat progress state detected, resetting analysis',
          );
          clearInterval(heartbeatInterval);
          resetAnalysisState();
        }
      }
    }, 30000); // Update every 30 seconds
    if (heartbeatInterval && typeof heartbeatInterval.unref === 'function') {
      try {
        heartbeatInterval.unref();
      } catch (e) {
        /* ignore */
      }
    }

    const results = [];
    let maxConcurrent = 3;
    try {
      const persistedSettings = await window.electronAPI.settings.get();
      if (
        persistedSettings &&
        typeof persistedSettings.maxConcurrentAnalysis !== 'undefined'
      ) {
        maxConcurrent = Number(persistedSettings.maxConcurrentAnalysis);
      }
    } catch (error) {
      console.warn(
        '[ANALYSIS] Failed to load settings, using defaults:',
        error,
      );
    }

    const concurrency = Math.max(1, Math.min(Number(maxConcurrent) || 3, 8));

    try {
      // Single notification for analysis start
      addNotification(
        `Starting AI analysis of ${files.length} files...`,
        'info',
        3000,
        'analysis-start',
      );

      // Create a Set to track processed files and prevent duplicates
      const processedFiles = new Set();
      const fileQueue = [...files];
      let completedCount = 0;

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
          // Update progress atomically with proper lastActivity tracking
          completedCount++;
          const progress = {
            current: completedCount,
            total: files.length,
            lastActivity: Date.now(),
          };

          // Validate progress before updating
          if (validateProgressState(progress)) {
            // Update all progress states atomically
            setAnalysisProgress(progress);
            setCurrentAnalysisFile(fileName);
            actions.setPhaseData('analysisProgress', progress);
            actions.setPhaseData('currentAnalysisFile', fileName);
          } else {
            console.warn(
              '[ANALYSIS] Invalid progress state detected, skipping update',
            );
          }

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
              suggestedName: generatePreviewName(
                analysis.suggestedName || fileName,
                fileName,
              ),
              namingConvention: {
                convention: namingConvention,
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
        }

        // Persist progress to localStorage
        try {
          const workflowState = {
            currentPhase: phaseData.currentPhase || PHASES.DISCOVER,
            phaseData: {
              ...phaseData,
              isAnalyzing: true,
              analysisProgress: {
                current: completedCount,
                total: files.length,
              },
              currentAnalysisFile: fileName,
            },
            timestamp: Date.now(),
          };
          localStorage.setItem(
            'stratosort_workflow_state',
            JSON.stringify(workflowState),
          );
        } catch (error) {
          console.warn(
            '[ANALYSIS] Failed to load settings, using defaults:',
            error,
          );
        }
      };

      // Process files with controlled concurrency
      const processBatch = async (batch) => {
        try {
          const promises = batch.map((file) => processFile(file));
          await Promise.all(promises);

          // Update lastActivity after each batch to prevent stuck state
          const currentProgress = {
            current: completedCount,
            total: files.length,
            lastActivity: Date.now(),
          };

          // Validate progress before updating
          if (validateProgressState(currentProgress)) {
            setAnalysisProgress(currentProgress);
            actions.setPhaseData('analysisProgress', currentProgress);
          } else {
            console.warn(
              '[ANALYSIS] Invalid batch progress state detected, skipping update',
            );
          }
        } catch (error) {
          console.error('[ANALYSIS] Batch processing error:', error);
          // Don't fail the entire analysis for batch errors
        }
      };

      // Process files in batches to control concurrency
      for (let i = 0; i < fileQueue.length; i += concurrency) {
        const batch = fileQueue.slice(i, i + concurrency);
        await processBatch(batch);
      }

      // Merge with any existing results (important for resume)
      const resultsByPath = new Map(
        (analysisResults || []).map((r) => [r.path, r]),
      );
      results.forEach((r) => resultsByPath.set(r.path, r));
      const mergedResults = Array.from(resultsByPath.values());
      setAnalysisResults(mergedResults);

      // Merge file states (preserve previous states, update changed)
      const mergedStates = { ...(fileStates || {}) };
      results.forEach((result) => {
        if (result.analysis && !result.error) {
          mergedStates[result.path] = {
            state: 'ready',
            timestamp: new Date().toISOString(),
            analysis: result.analysis,
            analyzedAt: result.analyzedAt,
          };
        } else if (result.error) {
          mergedStates[result.path] = {
            state: 'error',
            timestamp: new Date().toISOString(),
            error: result.error,
            analyzedAt: new Date().toISOString(),
          };
        }
      });
      setFileStates(mergedStates);

      actions.setPhaseData('analysisResults', mergedResults);
      actions.setPhaseData('fileStates', mergedStates);
      actions.setPhaseData('namingConvention', {
        convention: namingConvention,
        dateFormat,
        caseConvention,
        separator,
      });

      const successCount = results.filter((r) => r.analysis).length;
      const failureCount = results.length - successCount;

      // Consolidated completion notification
      if (successCount > 0 && failureCount === 0) {
        addNotification(
          `🎉 Analysis complete! ${successCount} files ready for organization`,
          'success',
          4000,
          'analysis-complete',
        );
        setTimeout(() => {
          addNotification(
            '📂 Proceeding to organize phase...',
            'info',
            3000,
            'phase-transition',
          );
          actions.advancePhase(PHASES.ORGANIZE);
        }, 2000);
      } else if (successCount > 0 && failureCount > 0) {
        addNotification(
          `Analysis complete: ${successCount} successful, ${failureCount} failed`,
          'warning',
          4000,
          'analysis-complete',
        );
        setTimeout(() => {
          addNotification(
            '📂 Proceeding to organize phase...',
            'info',
            3000,
            'phase-transition',
          );
          actions.advancePhase(PHASES.ORGANIZE);
        }, 2000);
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
      // Always reset analysis state, regardless of success/failure
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval); // Clean up heartbeat
      }
      if (lockTimeout) {
        clearTimeout(lockTimeout); // Clear the timeout
      }

      setIsAnalyzing(false);
      setCurrentAnalysisFile('');
      setAnalysisProgress({ current: 0, total: 0 });
      actions.setPhaseData('isAnalyzing', false);
      actions.setPhaseData('currentAnalysisFile', '');
      actions.setPhaseData('analysisProgress', { current: 0, total: 0 });

      // Release the analysis lock
      analysisLockRef.current = false;
      setGlobalAnalysisActive(false);

      // Clear any stuck localStorage state
      try {
        localStorage.removeItem('stratosort_workflow_state');
      } catch (error) {
        console.warn(
          '[ANALYSIS] Failed to load settings, using defaults:',
          error,
        );
      }
    }
  };

  const resetAnalysisState = () => {
    setIsAnalyzing(false);
    setCurrentAnalysisFile('');
    setAnalysisProgress({ current: 0, total: 0 });
    actions.setPhaseData('isAnalyzing', false);
    actions.setPhaseData('currentAnalysisFile', '');
    actions.setPhaseData('analysisProgress', { current: 0, total: 0 });

    // Release the analysis lock
    analysisLockRef.current = false;
    setGlobalAnalysisActive(false);

    // Clear any stuck localStorage state
    try {
      localStorage.removeItem('stratosort_workflow_state');
    } catch (error) {
      console.warn(
        '[ANALYSIS] Failed to load settings, using defaults:',
        error,
      );
    }

    addNotification(
      'Analysis state reset successfully',
      'info',
      2000,
      'analysis-reset',
    );
  };

  const forceReleaseAnalysisLock = () => {
    console.log('[ANALYSIS] Manually releasing analysis lock');
    analysisLockRef.current = false;
    setGlobalAnalysisActive(false);
    addNotification(
      'Analysis lock manually released',
      'info',
      2000,
      'analysis-reset',
    );
  };

  const validateProgressState = (progress) => {
    // Ensure progress state is valid
    if (!progress || typeof progress !== 'object') return false;
    if (
      typeof progress.current !== 'number' ||
      typeof progress.total !== 'number'
    )
      return false;
    if (progress.current < 0 || progress.total < 0) return false;
    if (progress.current > progress.total) return false;
    if (!progress.lastActivity || typeof progress.lastActivity !== 'number')
      return false;

    // Check if progress is too old (more than 10 minutes)
    const timeSinceActivity = Date.now() - progress.lastActivity;
    if (timeSinceActivity > 10 * 60 * 1000) return false;

    return true;
  };

  const clearAnalysisQueue = () => {
    setSelectedFiles([]);
    setAnalysisResults([]);
    setFileStates({});
    setAnalysisProgress({ current: 0, total: 0 });
    setCurrentAnalysisFile('');
    actions.setPhaseData('selectedFiles', []);
    actions.setPhaseData('analysisResults', []);
    actions.setPhaseData('fileStates', {});
    actions.setPhaseData('isAnalyzing', false);
    actions.setPhaseData('analysisProgress', { current: 0, total: 0 });
    actions.setPhaseData('currentAnalysisFile', '');
    addNotification('Analysis queue cleared', 'info', 2000, 'queue-management');
  };

  const removeFileFromQueue = (filePath) => {
    setSelectedFiles((prev) => prev.filter((f) => f.path !== filePath));
    setAnalysisResults((prev) => prev.filter((f) => f.path !== filePath));
    setFileStates((prev) => {
      const newStates = { ...prev };
      delete newStates[filePath];
      return newStates;
    });

    // Update phase data
    const newSelectedFiles = selectedFiles.filter((f) => f.path !== filePath);
    const newAnalysisResults = analysisResults.filter(
      (f) => f.path !== filePath,
    );
    const newFileStates = { ...fileStates };
    delete newFileStates[filePath];

    actions.setPhaseData('selectedFiles', newSelectedFiles);
    actions.setPhaseData('analysisResults', newAnalysisResults);
    actions.setPhaseData('fileStates', newFileStates);

    addNotification(
      'File removed from queue',
      'info',
      2000,
      'queue-management',
    );
  };

  return (
    <div className="w-full">
      <div className="mb-21 text-center">
        <h2 className="heading-primary">🔍 Discover & Analyze</h2>
        <p className="text-lg text-system-gray-600 leading-relaxed max-w-2xl mx-auto">
          Select files or scan a folder, then let StratoSort analyze and prepare
          them for organization.
        </p>
      </div>
      <div className="flex items-center justify-center gap-8 -mt-8 mb-13">
        <button
          className="text-xs text-system-gray-500 hover:text-system-gray-700 underline"
          onClick={() => {
            try {
              const keys = [
                'discover-naming',
                'discover-selection',
                'discover-dnd',
                'discover-results',
              ];
              keys.forEach((k) => {
                window.localStorage.setItem(`collapsible:${k}`, 'true');
              });
              window.dispatchEvent(new Event('storage'));
            } catch (error) {
              console.warn(
                '[ANALYSIS] Failed to load settings, using defaults:',
                error,
              );
            }
          }}
        >
          Expand all
        </button>
        <span className="text-system-gray-300">•</span>
        <button
          className="text-xs text-system-gray-500 hover:text-system-gray-700 underline"
          onClick={() => {
            try {
              const keys = [
                'discover-naming',
                'discover-selection',
                'discover-dnd',
                'discover-results',
              ];
              keys.forEach((k) => {
                window.localStorage.setItem(`collapsible:${k}`, 'false');
              });
              window.dispatchEvent(new Event('storage'));
            } catch (error) {
              console.warn(
                '[ANALYSIS] Failed to load settings, using defaults:',
                error,
              );
            }
          }}
        >
          Collapse all
        </button>
        <span className="text-system-gray-300">•</span>
        <button
          className="text-xs text-system-gray-600 hover:text-stratosort-blue underline"
          onClick={() => setShowAnalysisHistory(true)}
        >
          Open Analysis History
        </button>
      </div>
      <Collapsible
        title="Naming Settings"
        defaultOpen
        persistKey="discover-naming"
      >
        <NamingSettings
          namingConvention={namingConvention}
          setNamingConvention={setNamingConvention}
          dateFormat={dateFormat}
          setDateFormat={setDateFormat}
          caseConvention={caseConvention}
          setCaseConvention={setCaseConvention}
          separator={separator}
          setSeparator={setSeparator}
        />
      </Collapsible>

      <Collapsible
        title="Select Files or Folder"
        defaultOpen
        persistKey="discover-selection"
      >
        <SelectionControls
          onSelectFiles={handleFileSelection}
          onSelectFolder={handleFolderSelection}
          isScanning={isScanning}
        />
        {selectedFiles.length > 0 && (
          <div className="mt-4 flex items-center justify-between p-8 bg-system-gray-50 rounded-lg border border-system-gray-200">
            <div className="text-sm text-system-gray-600">
              <span className="font-medium">{selectedFiles.length}</span> file
              {selectedFiles.length !== 1 ? 's' : ''} in queue
              {analysisResults.length > 0 && (
                <span className="ml-2">
                  •{' '}
                  <span className="font-medium">
                    {analysisResults.filter((r) => r.analysis).length}
                  </span>{' '}
                  analyzed
                  {analysisResults.filter((r) => r.error).length > 0 && (
                    <span className="ml-2 text-red-600">
                      •{' '}
                      <span className="font-medium">
                        {analysisResults.filter((r) => r.error).length}
                      </span>{' '}
                      failed
                    </span>
                  )}
                </span>
              )}
              {analysisLockRef.current && (
                <span className="ml-2 text-orange-600">
                  • 🔒 Analysis locked
                </span>
              )}
            </div>
            <div className="flex gap-5">
              <button
                onClick={clearAnalysisQueue}
                className="px-8 py-5 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                title="Clear all files from the analysis queue"
              >
                Clear Queue
              </button>
              {isAnalyzing && (
                <button
                  onClick={() => {
                    setIsAnalyzing(false);
                    setCurrentAnalysisFile('');
                    setAnalysisProgress({ current: 0, total: 0 });
                    actions.setPhaseData('isAnalyzing', false);
                    actions.setPhaseData('currentAnalysisFile', '');
                    actions.setPhaseData('analysisProgress', {
                      current: 0,
                      total: 0,
                    });
                    addNotification(
                      'Analysis state reset',
                      'info',
                      2000,
                      'analysis-reset',
                    );
                  }}
                  className="px-8 py-5 text-sm bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition-colors"
                  title="Reset stuck analysis state"
                >
                  Reset Analysis
                </button>
              )}
              {analysisLockRef.current && !isAnalyzing && (
                <button
                  onClick={forceReleaseAnalysisLock}
                  className="px-8 py-5 text-sm bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors"
                  title="Release stuck analysis lock"
                >
                  Release Lock
                </button>
              )}
            </div>
          </div>
        )}
      </Collapsible>

      <Collapsible title="Drag & Drop" defaultOpen persistKey="discover-dnd">
        <DragAndDropZone isDragging={isDragging} dragProps={dragProps} />
      </Collapsible>

      {isAnalyzing && (
        <Collapsible
          title="Analysis Progress"
          defaultOpen
          persistKey="discover-progress"
        >
          <AnalysisProgress
            progress={analysisProgress}
            currentFile={currentAnalysisFile}
          />
          {/* Add reset button if analysis appears stuck */}
          {analysisProgress.lastActivity &&
            Date.now() - analysisProgress.lastActivity > 2 * 60 * 1000 && (
              <div className="mt-8 p-8 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-5">
                    <span className="text-amber-600">⚠️</span>
                    <span className="text-sm text-amber-800">
                      Analysis appears to be stuck. Last activity:{' '}
                      {new Date(
                        analysisProgress.lastActivity,
                      ).toLocaleTimeString()}
                    </span>
                  </div>
                  <button
                    onClick={resetAnalysisState}
                    className="px-8 py-5 text-sm bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors"
                    title="Reset stuck analysis state"
                  >
                    Reset Analysis
                  </button>
                </div>
              </div>
            )}
        </Collapsible>
      )}

      {analysisResults.length > 0 && (
        <Collapsible
          title="Analysis Results"
          defaultOpen
          persistKey="discover-results"
          contentClassName="max-h-[480px] overflow-y-auto pr-8"
        >
          <AnalysisResultsList
            results={analysisResults}
            onFileAction={handleFileAction}
            getFileStateDisplay={getFileStateDisplay}
          />
        </Collapsible>
      )}
      <ConfirmDialog />
      {showAnalysisHistory && (
        <AnalysisHistoryModal
          onClose={() => setShowAnalysisHistory(false)}
          analysisStats={analysisStats}
          setAnalysisStats={setAnalysisStats}
        />
      )}
    </div>
  );
}

export default DiscoverPhase;
