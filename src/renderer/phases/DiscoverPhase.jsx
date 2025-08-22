import React, { useEffect, useRef, useState, useMemo } from 'react';
import { PHASES, RENDERER_LIMITS } from '../../shared/constants';
import { usePhase } from '../contexts/PhaseContext';
import { useNotification } from '../contexts/NotificationContext';
import { useConfirmDialog, useDragAndDrop } from '../hooks';
import { Collapsible, Button, Input, Select } from '../components/ui';
// AnalysisDetails removed in current UI simplification
import AnalysisHistoryModal from '../components/AnalysisHistoryModal';
import {
  NamingSettings,
  SelectionControls,
  DragAndDropZone,
} from '../components/discover';
// Analysis progress display moved to OrganizePhase
// Organize-related imports removed - handled in OrganizePhase

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
  const hasResumedRef = useRef(false);
  const analysisLockRef = useRef(false); // Add analysis lock to prevent multiple simultaneous calls
  const [globalAnalysisActive, setGlobalAnalysisActive] = useState(false); // Global analysis state
  const isFirstMountRef = useRef(true);

  // Remove organize-related state - this belongs in OrganizePhase

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

    // On first mount, always clear any stuck analysis state
    if (isFirstMountRef.current && persistedIsAnalyzing) {
      console.log('[ANALYSIS] Clearing analysis state on first mount');
      actions.setPhaseData('isAnalyzing', false);
      actions.setPhaseData('analysisProgress', { current: 0, total: 0 });
      actions.setPhaseData('currentAnalysisFile', '');
      setIsAnalyzing(false);
      setAnalysisProgress({ current: 0, total: 0 });
      setCurrentAnalysisFile('');
      analysisLockRef.current = false;
      setGlobalAnalysisActive(false);
      isFirstMountRef.current = false;

      // Clear any stuck localStorage state
      try {
        localStorage.removeItem('stratosort_workflow_state');
      } catch {}
    }

    // Restore persisted state regardless of whether results exist yet
    setSelectedFiles(persistedFiles);
    setFileStates(persistedStates);
    setNamingConvention(persistedNaming.convention || 'subject-date');
    setDateFormat(persistedNaming.dateFormat || 'YYYY-MM-DD');
    setCaseConvention(persistedNaming.caseConvention || 'kebab-case');
    setSeparator(persistedNaming.separator || '-');
    if (persistedResults.length > 0) setAnalysisResults(persistedResults);

    // Don't restore analysis state if we just cleared it on first mount
    if (!isFirstMountRef.current && persistedIsAnalyzing) {
      // Check if analysis state is actually valid (not stuck)
      const lastActivity = persistedProgress.lastActivity || Date.now();
      const timeSinceActivity = Date.now() - lastActivity;
      const isStuck = timeSinceActivity > 30 * 1000; // 30 seconds for fresh mount

      if (isStuck || persistedProgress.total === 0) {
        console.log(
          '[ANALYSIS] Detected stuck/invalid analysis state on mount, resetting...',
        );
        // Don't restore stuck analysis state
        actions.setPhaseData('isAnalyzing', false);
        actions.setPhaseData('analysisProgress', { current: 0, total: 0 });
        actions.setPhaseData('currentAnalysisFile', '');

        // Clear local state
        setIsAnalyzing(false);
        setAnalysisProgress({ current: 0, total: 0 });
        setCurrentAnalysisFile('');

        // Clear the analysis lock
        analysisLockRef.current = false;
        setGlobalAnalysisActive(false);

        // Clear any stuck localStorage state
        try {
          localStorage.removeItem('stratosort_workflow_state');
        } catch {}
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
    if (
      !hasResumedRef.current &&
      phaseData.isAnalyzing &&
      Array.isArray(selectedFiles) &&
      selectedFiles.length > 0
    ) {
      const remaining = selectedFiles.filter((f) => {
        const state = fileStates[f.path]?.state;
        return state !== 'ready' && state !== 'error';
      });
      if (remaining.length > 0) {
        hasResumedRef.current = true;
        addNotification(
          `Resuming analysis of ${remaining.length} files...`,
          'info',
          3000,
          'analysis-resume',
        );
        // Save remaining files and advance to Organize where analysis runs
        actions.setPhaseData('selectedFiles', remaining);
        actions.setPhaseData('namingConvention', {
          convention: namingConvention,
          dateFormat,
          caseConvention,
          separator,
        });
        actions.advancePhase(PHASES.ORGANIZE);
      } else {
        hasResumedRef.current = true;
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
        } catch {}
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
        } catch {}
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

  const generatePreviewName = (originalName) => {
    const baseName = originalName.replace(/\.[^/.]+$/, '');
    const extension = originalName.includes('.')
      ? '.' + originalName.split('.').pop()
      : '';
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
    return applyCaseConvention(previewName, caseConvention) + extension;
  };

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
          'duplicate-files',
        );
        return;
      }

      if (newFiles.length < files.length) {
        const duplicateCount = files.length - newFiles.length;
        addNotification(
          `Skipped ${duplicateCount} duplicate files already in queue`,
          'info',
          2000,
          'duplicate-files',
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

      // Clear previous analysis and move to Organize phase; analysis runs there now
      actions.setPhaseData('analysisResults', []);
      actions.setPhaseData('fileStates', {});
      actions.setPhaseData('selectedFiles', enhancedFiles);
      actions.setPhaseData('namingConvention', {
        convention: namingConvention,
        dateFormat,
        caseConvention,
        separator,
      });
      actions.advancePhase(PHASES.ORGANIZE);
    }
  };

  const { isDragging, dragProps } = useDragAndDrop(handleFileDrop);

  const getFileType = (extension) => {
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
    if (imageExts.includes(extension)) return 'image';
    if (videoExts.includes(extension)) return 'video';
    if (docExts.includes(extension)) return 'document';
    if (codeExts.includes(extension)) return 'code';
    if (archiveExts.includes(extension)) return 'archive';
    return 'file';
  };

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
            'duplicate-files',
          );
          return;
        }

        if (newFiles.length < files.length) {
          const duplicateCount = files.length - newFiles.length;
          addNotification(
            `Skipped ${duplicateCount} duplicate files already in queue`,
            'info',
            2000,
            'duplicate-files',
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

        // Clear previous analysis and pass the new files to Organize for analysis
        actions.setPhaseData('analysisResults', []);
        actions.setPhaseData('fileStates', {});
        actions.setPhaseData('selectedFiles', enhancedFiles);
        actions.setPhaseData('namingConvention', {
          convention: namingConvention,
          dateFormat,
          caseConvention,
          separator,
        });
        actions.advancePhase(PHASES.ORGANIZE);
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
              'duplicate-files',
            );
            return;
          }

          if (newFiles.length < supportedFiles.length) {
            const duplicateCount = supportedFiles.length - newFiles.length;
            addNotification(
              `Skipped ${duplicateCount} duplicate files already in queue`,
              'info',
              2000,
              'duplicate-files',
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
          // Clear previous analysis and pass files to Organize for analysis
          actions.setPhaseData('analysisResults', []);
          actions.setPhaseData('fileStates', {});
          actions.setPhaseData('selectedFiles', enhancedFiles);
          actions.setPhaseData('namingConvention', {
            convention: namingConvention,
            dateFormat,
            caseConvention,
            separator,
          });
          actions.advancePhase(PHASES.ORGANIZE);
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

  // Analysis logic moved to OrganizePhase - DiscoverPhase now focuses on file selection only

  // Analysis-related functions moved to OrganizePhase

  return (
    <div className="w-full">
      <div className="mb-21 text-center">
        <h2 className="heading-primary">🔍 Discover & Organize</h2>
        <p className="text-lg text-system-gray-600 leading-relaxed max-w-2xl mx-auto">
          Select files or scan a folder, analyze them with AI, and organize them
          into smart folders.
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
              keys.forEach((k) =>
                window.localStorage.setItem(`collapsible:${k}`, 'true'),
              );
              window.dispatchEvent(new Event('storage'));
            } catch {}
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
              keys.forEach((k) =>
                window.localStorage.setItem(`collapsible:${k}`, 'false'),
              );
              window.dispatchEvent(new Event('storage'));
            } catch {}
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
              {selectedFiles.length !== 1 ? 's' : ''} selected for organization
            </div>
            <div className="flex gap-5">
              <button
                onClick={() => {
                  setSelectedFiles([]);
                  actions.setPhaseData('selectedFiles', []);
                  addNotification('File selection cleared', 'info', 2000);
                }}
                className="px-8 py-5 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                title="Clear all selected files"
              >
                Clear Files
              </button>
              <Button
                onClick={() => {
                  // Clear any previous analysis results for fresh start
                  actions.setPhaseData('analysisResults', []);
                  actions.setPhaseData('fileStates', {});

                  // Save files to phase data and advance to organize phase
                  actions.setPhaseData('selectedFiles', selectedFiles);
                  actions.setPhaseData('namingConvention', {
                    convention: namingConvention,
                    dateFormat,
                    caseConvention,
                    separator,
                  });
                  actions.advancePhase(PHASES.ORGANIZE);
                  addNotification(
                    `📂 Moving to Organize phase with ${selectedFiles.length} files`,
                    'info',
                    3000,
                  );
                }}
                variant="primary"
                className="px-8 py-5"
              >
                Proceed to Organize →
              </Button>
            </div>
          </div>
        )}
      </Collapsible>

      <Collapsible title="Drag & Drop" defaultOpen persistKey="discover-dnd">
        <DragAndDropZone isDragging={isDragging} dragProps={dragProps} />
      </Collapsible>

      {/* Analysis progress and controls moved to OrganizePhase */}

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
