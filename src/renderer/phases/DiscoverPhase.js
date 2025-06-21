import React, { useState, useEffect } from "react";
import { usePhase } from "../contexts/PhaseContext";
import { useNotification } from "../contexts/NotificationContext";
import useConfirmDialog from "../hooks/useConfirmDialog";
import useDragAndDrop from "../hooks/useDragAndDrop";
import LoadingSkeleton, { SmartFolderSkeleton } from "../components/LoadingSkeleton";
import { useToast } from "../components/Toast";
const { PHASES } = require("../../shared/constants");

function DiscoverPhase() {
  const { actions, phaseData } = usePhase();
  const { addNotification } = useNotification();
  const { showConfirm, ConfirmDialog } = useConfirmDialog();
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [analysisResults, setAnalysisResults] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [currentAnalysisFile, setCurrentAnalysisFile] = useState('');
  const [analysisProgress, setAnalysisProgress] = useState({ current: 0, total: 0 });
  const [showAnalysisHistory, setShowAnalysisHistory] = useState(false);
  const [analysisStats, setAnalysisStats] = useState(null);
  
  // NEW: Naming convention state
  const [namingConvention, setNamingConvention] = useState('subject-date');
  const [dateFormat, setDateFormat] = useState('YYYY-MM-DD');
  const [caseConvention, setCaseConvention] = useState('kebab-case');
  const [separator, setSeparator] = useState('-');
  
  // NEW: File processing states tracking
  const [fileStates, setFileStates] = useState({}); // { filePath: { state: 'pending|analyzing|ready|error', timestamp: Date } }

  // Load persisted data from previous sessions
  useEffect(() => {
    const loadPersistedData = () => {
      console.log('[DISCOVER-PHASE] Loading persisted data:', {
        analysisResultsCount: (phaseData.analysisResults || []).length,
        selectedFilesCount: (phaseData.selectedFiles || []).length,
        fileStatesCount: Object.keys(phaseData.fileStates || {}).length,
        hasNamingConvention: !!phaseData.namingConvention
      });
      
      // Load previous analysis results if they exist
      const persistedResults = phaseData.analysisResults || [];
      const persistedFiles = phaseData.selectedFiles || [];
      const persistedStates = phaseData.fileStates || {};
      const persistedNaming = phaseData.namingConvention || {};
      
      if (persistedResults.length > 0) {
        console.log('[DISCOVER-PHASE] Restoring persisted data');
        setAnalysisResults(persistedResults);
        setSelectedFiles(persistedFiles);
        setFileStates(persistedStates);
        
        // Restore naming convention settings
        setNamingConvention(persistedNaming.convention || 'subject-date');
        setDateFormat(persistedNaming.dateFormat || 'YYYY-MM-DD');
        setCaseConvention(persistedNaming.caseConvention || 'kebab-case');
        setSeparator(persistedNaming.separator || '-');
        
        console.log('[DISCOVER-PHASE] State restored successfully', {
          analysisResults: persistedResults.length,
          selectedFiles: persistedFiles.length,
          fileStates: Object.keys(persistedStates).length
        });
      } else {
        console.log('[DISCOVER-PHASE] No persisted data to restore');
      }
    };
    
    loadPersistedData();
  }, [phaseData]);

  // NEW: Update file state helper with error recovery
  const updateFileState = (filePath, state, metadata = {}) => {
    try {
      setFileStates((prev) => {
        // Validate previous state
        if (!prev || typeof prev !== 'object') {
          console.warn('Invalid fileStates detected, resetting...');
          prev = {};
        }
        
        let newStates = { ...prev };
        
        // Cleanup old entries (keep only last 100 entries to prevent memory issues)
        const entries = Object.entries(newStates);
        if (entries.length > 100) {
          const sortedEntries = entries.sort((a, b) => 
            new Date(b[1].timestamp) - new Date(a[1].timestamp)
          );
          const keepEntries = sortedEntries.slice(0, 100);
          newStates = Object.fromEntries(keepEntries);
        }
        
        newStates[filePath] = {
          state,
          timestamp: new Date().toISOString(),
          ...metadata
        };
        
        return newStates;
      });
    } catch (error) {
      console.error('Error updating file state:', error);
      // Reset file states if corrupted
      setFileStates({
        [filePath]: {
          state,
          timestamp: new Date().toISOString(),
          ...metadata
        }
      });
    }
  };

  // NEW: Get current file state
  const getFileState = (filePath) => {
    return fileStates[filePath]?.state || 'pending';
  };

  // NEW: Get file state icon and label
  const getFileStateDisplay = (filePath, hasAnalysis) => {
    const state = getFileState(filePath);
    
    if (state === 'analyzing') {
      return { icon: '🔄', label: 'Analyzing...', color: 'text-blue-600', spinning: true };
    } else if (state === 'error') {
      return { icon: '❌', label: 'Error', color: 'text-red-600', spinning: false };
    } else if (hasAnalysis && state === 'ready') {
      return { icon: '✅', label: 'Ready', color: 'text-green-600', spinning: false };
    } else if (state === 'pending') {
      return { icon: '⏳', label: 'Pending', color: 'text-yellow-600', spinning: false };
    } else {
      return { icon: '❌', label: 'Failed', color: 'text-red-600', spinning: false };
    }
  };

  // NEW: Naming convention preview
  const generatePreviewName = (originalName) => {
    const baseName = originalName.replace(/\.[^/.]+$/, ''); // Remove extension
    const extension = originalName.includes('.') ? `.${  originalName.split('.').pop()}` : '';
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
    
    // Apply case convention
    previewName = applyCaseConvention(previewName, caseConvention);
    
    return previewName + extension;
  };

  // NEW: Helper functions for naming conventions
  const formatDate = (date, format) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    switch (format) {
      case 'YYYY-MM-DD': return `${year}-${month}-${day}`;
      case 'MM-DD-YYYY': return `${month}-${day}-${year}`;
      case 'DD-MM-YYYY': return `${day}-${month}-${year}`;
      case 'YYYYMMDD': return `${year}${month}${day}`;
      default: return `${year}-${month}-${day}`;
    }
  };

  const applyCaseConvention = (text, convention) => {
    switch (convention) {
      case 'kebab-case':
        return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      case 'snake_case':
        return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      case 'camelCase':
        return text.replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => 
          index === 0 ? word.toLowerCase() : word.toUpperCase()).replace(/\s+/g, '');
      case 'PascalCase':
        return text.replace(/(?:^\w|[A-Z]|\b\w)/g, (word) => word.toUpperCase()).replace(/\s+/g, '');
      case 'lowercase':
        return text.toLowerCase();
      case 'UPPERCASE':
        return text.toUpperCase();
      default:
        return text;
    }
  };

  // Define handleFileDrop BEFORE using it in useDragAndDrop
  const handleFileDrop = async (files) => {
    if (files && files.length > 0) {
      addNotification(`Processing ${files.length} dropped files...`, 'info');
      
      // Enhance dropped files with metadata
      const enhancedFiles = files.map((file) => ({
        ...file,
        source: 'drag_drop',
        droppedAt: new Date().toISOString()
      }));
      
      setSelectedFiles(enhancedFiles);
      
      // Initialize file states
      enhancedFiles.forEach((file) => {
        updateFileState(file.path, 'pending');
      });
      
      addNotification(`Dropped ${files.length} files for analysis`, 'success');
      await analyzeFiles(enhancedFiles);
    }
  };

  const { isDragging, dragProps } = useDragAndDrop(handleFileDrop);

  // Enhanced helper function to determine file type with more categories
  const getFileType = (extension) => {
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'tiff', 'ico'];
    // const audioExts = ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'wma', 'opus']; // REMOVED - audio analysis disabled
    const videoExts = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', '3gp'];
    const docExts = ['pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'odt', 'pages'];
    const codeExts = ['js', 'ts', 'py', 'java', 'cpp', 'c', 'html', 'css', 'json', 'xml'];
    const archiveExts = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'];
    
    if (imageExts.includes(extension)) return 'image';
    // if (audioExts.includes(extension)) return 'audio'; // REMOVED - audio analysis disabled
    if (videoExts.includes(extension)) return 'video';
    if (docExts.includes(extension)) return 'document';
    if (codeExts.includes(extension)) return 'code';
    if (archiveExts.includes(extension)) return 'archive';
    return 'file';
  };

  // Global error handler for uncaught errors
  React.useEffect(() => {
    const handleUnhandledError = (event) => {
      console.error('Unhandled error:', event.error);
      addNotification(`Unexpected error: ${event.error?.message || 'Unknown error'}`, 'error');
    };

    const handleUnhandledRejection = (event) => {
      console.error('Unhandled promise rejection:', event.reason);
      addNotification(`Promise error: ${event.reason?.message || 'Unknown promise error'}`, 'error');
      event.preventDefault(); // Prevent default browser behavior
    };

    window.addEventListener('error', handleUnhandledError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleUnhandledError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [addNotification]);

  // Batch file stats processing to avoid rate limiting
  const getBatchFileStats = async (filePaths, batchSize = 10) => {
    console.log('[BATCH-STATS-DEBUG] Starting batch file stats for', filePaths.length, 'files');
    const results = [];
    
    for (let i = 0; i < filePaths.length; i += batchSize) {
      const batch = filePaths.slice(i, i + batchSize);
      console.log('[BATCH-STATS-DEBUG] Processing batch', i / batchSize + 1, 'with', batch.length, 'files');
      
      const batchResults = await Promise.allSettled(
        batch.map(async (filePath) => {
          try {
            // Add small delay between requests to avoid rate limiting
            if (i > 0) await new Promise((resolve) => setTimeout(resolve, 50));
            
            console.log('[BATCH-STATS-DEBUG] Getting stats for:', filePath);
            const stats = await window.electronAPI.files.getStats(filePath);
            console.log('[BATCH-STATS-DEBUG] Stats received for:', filePath, stats);
            
            const fileName = filePath.split(/[/\\]/).pop();
            const extension = fileName.includes('.') ? `.${  fileName.split('.').pop().toLowerCase()}` : '';
            
            const result = {
              name: fileName,
              path: filePath,
              extension,
              size: stats?.size || 0,
              type: 'file',
              created: stats?.created,
              modified: stats?.modified,
              success: true
            };
            
            console.log('[BATCH-STATS-DEBUG] Processed file object:', result);
            return result;
          } catch (error) {
            console.warn('[BATCH-STATS-DEBUG] Could not get file stats for:', filePath, error);
            const fileName = filePath.split(/[/\\]/).pop();
            
            return {
              name: fileName,
              path: filePath,
              extension: fileName.includes('.') ? `.${  fileName.split('.').pop().toLowerCase()}` : '',
              size: 0,
              type: 'file',
              success: false,
              error: error.message
            };
          }
        })
      );
      
      // Process batch results
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          const filePath = batch[index];
          const fileName = filePath.split(/[/\\]/).pop();
          results.push({
            name: fileName,
            path: filePath,
            extension: fileName.includes('.') ? `.${  fileName.split('.').pop().toLowerCase()}` : '',
            size: 0,
            type: 'file',
            success: false,
            error: result.reason?.message || 'Unknown error'
          });
        }
      });
      
      // Add delay between batches
      if (i + batchSize < filePaths.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    
    console.log('[BATCH-STATS-DEBUG] Completed batch processing, returning', results.length, 'results');
    return results;
  };

  const handleFileSelection = async () => {
    try {
      console.log('[FILE-SELECTION-DEBUG] === STARTING FILE SELECTION ===');
      console.log('[FILE-SELECTION-DEBUG] isScanning:', isScanning);
      console.log('[FILE-SELECTION-DEBUG] isAnalyzing:', isAnalyzing);
      
      setIsScanning(true);
      addNotification('Opening file picker...', 'info');
      
      console.log('[FILE-SELECTION-DEBUG] Checking window.electronAPI availability...');
      if (!window.electronAPI) {
        throw new Error('electronAPI is not available on window object');
      }
      
      console.log('[FILE-SELECTION-DEBUG] electronAPI available, checking files property...');
      if (!window.electronAPI.files) {
        throw new Error('electronAPI.files is not available');
      }
      
      console.log('[FILE-SELECTION-DEBUG] files property available, checking select method...');
      if (!window.electronAPI.files.select) {
        throw new Error('electronAPI.files.select method is not available');
      }
      
      console.log('[FILE-SELECTION-DEBUG] All checks passed, calling select method...');
      const result = await window.electronAPI.files.select();
      console.log('[FILE-SELECTION-DEBUG] Selection result received:', result);
      
      if (result?.success && result?.files?.length > 0) {
        console.log('[FILE-SELECTION-DEBUG] Success! Processing', result.files.length, 'files');
        const { files, summary } = result;
        
        // Show summary notification
        let message = `Found ${files.length} supported files`;
        if (summary?.totalSelected > 1) {
          message += ` from ${summary.totalSelected} selected items`;
        }
        if (summary?.duplicatesRemoved > 0) {
          message += ` (${summary.duplicatesRemoved} duplicates removed)`;
        }
        addNotification(message, 'success');
        
        console.log('[FILE-SELECTION-DEBUG] Initializing file states...');
        // Initialize file states
        files.forEach((filePath) => {
          console.log('[FILE-SELECTION-DEBUG] Setting state for:', filePath);
          updateFileState(filePath, 'pending');
        });
        
        console.log('[FILE-SELECTION-DEBUG] Getting batch file stats...');
        // Get file stats for the selected files
        const fileObjects = await getBatchFileStats(files);
        console.log('[FILE-SELECTION-DEBUG] File stats received:', fileObjects.length, 'objects');
        
        // Add source metadata
        const enhancedFiles = fileObjects.map((file) => ({
          ...file,
          source: 'file_selection'
        }));
        
        console.log('[FILE-SELECTION-DEBUG] Setting selected files...');
        setSelectedFiles(enhancedFiles);
        
        // Report any files that failed to get stats
        const failedFiles = fileObjects.filter((f) => !f.success);
        if (failedFiles.length > 0) {
          console.log('[FILE-SELECTION-DEBUG] Warning:', failedFiles.length, 'files had issues');
          addNotification(`Warning: ${failedFiles.length} files had issues loading metadata`, 'warning');
        }
        
        console.log('[FILE-SELECTION-DEBUG] Starting analysis...');
        // Start analysis
        await analyzeFiles(enhancedFiles);
        console.log('[FILE-SELECTION-DEBUG] Analysis completed');
      } else {
        console.log('[FILE-SELECTION-DEBUG] No files selected or selection cancelled:', result);
        addNotification('No files selected', 'info');
      }
    } catch (error) {
      console.error('[FILE-SELECTION-DEBUG] ERROR OCCURRED:', error);
      console.error('[FILE-SELECTION-DEBUG] Error stack:', error.stack);
      console.error('[FILE-SELECTION-DEBUG] Error name:', error.name);
      console.error('[FILE-SELECTION-DEBUG] Error message:', error.message);
      addNotification(`Error selecting files: ${error.message}`, 'error');
    } finally {
      console.log('[FILE-SELECTION-DEBUG] === FINISHING FILE SELECTION ===');
      setIsScanning(false);
    }
  };

  const handleFolderSelection = async () => {
    try {
      console.log('[FOLDER-SELECTION-DEBUG] === STARTING FOLDER SELECTION ===');
      
      setIsScanning(true);
      addNotification('Opening folder picker...', 'info');
      
      // Use the selectDirectory method specifically for folders
      const result = await window.electronAPI.files.selectDirectory();
      console.log('[FOLDER-SELECTION-DEBUG] Folder selection result:', result);
      
      if (result?.success && result?.folder) {
        addNotification(`Scanning folder: ${result.folder}`, 'info');
        
        // Get files in the selected folder
        const scanResult = await window.electronAPI.smartFolders.scanStructure(result.folder);
        console.log('[FOLDER-SELECTION-DEBUG] Scan result:', scanResult);
        
        if (scanResult && scanResult.files && scanResult.files.length > 0) {
          // Filter for supported files
          const supportedExts = ['.pdf', '.doc', '.docx', '.txt', '.md', '.rtf', '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.mp3', '.wav', '.m4a', '.flac', '.ogg', '.zip', '.rar', '.7z', '.tar', '.gz'];
          const supportedFiles = scanResult.files.filter((file) => {
            const ext = file.name.includes('.') ? `.${  file.name.split('.').pop().toLowerCase()}` : '';
            return supportedExts.includes(ext);
          });
          
          if (supportedFiles.length === 0) {
            addNotification('No supported files found in the selected folder', 'warning');
            return;
          }
          
          addNotification(`Found ${supportedFiles.length} supported files in folder`, 'success');
          
          // Initialize file states
          supportedFiles.forEach((file) => {
            updateFileState(file.path, 'pending');
          });
          
          // Get file stats
          const fileObjects = await getBatchFileStats(supportedFiles.map((f) => f.path));
          
          // Add source metadata
          const enhancedFiles = fileObjects.map((file) => ({
            ...file,
            source: 'folder_scan'
          }));
          
          setSelectedFiles(enhancedFiles);
          
          // Start analysis
          await analyzeFiles(enhancedFiles);
        } else {
          addNotification('No files found in the selected folder', 'warning');
        }
      } else if (result?.success === false && result?.folder === null) {
        addNotification('Folder selection cancelled', 'info');
      } else {
        addNotification('No folder selected', 'info');
      }
    } catch (error) {
      console.error('[FOLDER-SELECTION-DEBUG] Error:', error);
      addNotification(`Error selecting folder: ${error.message}`, 'error');
    } finally {
      setIsScanning(false);
    }
  };

  const handleFileAction = async (action, filePath, fileObj = null) => {
    try {
      switch (action) {
        case 'open':
          await window.electronAPI.files.open(filePath);
          addNotification(`Opened: ${filePath.split(/[/\\]/).pop()}`, 'success');
          break;
          
        case 'reveal':
          await window.electronAPI.files.reveal(filePath);
          addNotification(`Revealed: ${filePath.split(/[/\\]/).pop()}`, 'success');
          break;
          
        case 'delete':
          const fileName = filePath.split(/[/\\]/).pop();
          const confirmDelete = await showConfirm({
            title: 'Delete File',
            message: 'This action cannot be undone. Are you sure you want to permanently delete this file?',
            confirmText: 'Delete',
            cancelText: 'Cancel',
            variant: 'danger',
            fileName
          });
          
          if (confirmDelete) {
            const result = await window.electronAPI.files.delete(filePath);
            if (result.success) {
              // Remove from analysis results
              setAnalysisResults((prev) => prev.filter((f) => f.path !== filePath));
              setSelectedFiles((prev) => prev.filter((f) => f.path !== filePath));
              addNotification(`Deleted: ${fileName}`, 'success');
            } else {
              addNotification(`Failed to delete: ${fileName}`, 'error');
            }
          }
          break;
          
        default:
          addNotification(`Unknown action: ${action}`, 'error');
      }
    } catch (error) {
      console.error('File action failed:', error);
      addNotification(`Action failed: ${error.message}`, 'error');
    }
  };

  const analyzeFiles = async (files) => {
    if (!files || files.length === 0) return;
    
    setIsAnalyzing(true);
    setAnalysisProgress({ current: 0, total: files.length });
    setCurrentAnalysisFile('');
    const results = [];
    
    try {
      addNotification(`Starting AI analysis of ${files.length} files...`, 'info');
      
      // Process files with better error handling and progress tracking
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileName = file.name || file.path.split(/[/\\]/).pop();
        
        // Update progress BEFORE starting analysis
        setCurrentAnalysisFile(fileName);
        setAnalysisProgress({ current: i, total: files.length });
        
        // Update file state to analyzing
        updateFileState(file.path, 'analyzing', { fileName });
        
        // Add a small delay to show progress updates
        await new Promise((resolve) => setTimeout(resolve, 100));
        
        addNotification(`Analyzing file ${i + 1}/${files.length}: ${fileName}`, 'info');
        
        try {
          // Use existing file stats if available, avoid additional API calls
          const fileInfo = {
            ...file,
            size: file.size || 0,
            created: file.created,
            modified: file.modified
          };
          
          console.log(`[ANALYSIS-DEBUG] Starting analysis for: ${fileName}`);
          console.log(`[ANALYSIS-DEBUG] File path: ${file.path}`);
          console.log(`[ANALYSIS-DEBUG] File size: ${fileInfo.size} bytes`);
          
          // Perform AI analysis with timeout
          const analysisPromise = window.electronAPI.files.analyze(file.path);
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Analysis timeout after 3 minutes')), 180000)
          );
          
          const analysis = await Promise.race([analysisPromise, timeoutPromise]);
          
          console.log(`[ANALYSIS-DEBUG] Raw analysis result for ${fileName}:`, analysis);
          
          if (analysis && !analysis.error) {
            // Apply naming convention to suggested name
            const enhancedAnalysis = {
              ...analysis,
              suggestedName: generatePreviewName(analysis.suggestedName || fileName),
              namingConvention: {
                convention: namingConvention,
                dateFormat,
                caseConvention,
                separator
              }
            };
            
            const result = {
              ...fileInfo,
              analysis: enhancedAnalysis,
              status: 'analyzed',
              analyzedAt: new Date().toISOString()
            };
            
            results.push(result);
            
            // Update file state to ready
            updateFileState(file.path, 'ready', { 
              analysis: enhancedAnalysis,
              analyzedAt: new Date().toISOString()
            });
            
            addNotification(`✓ Analysis complete for: ${fileName}`, 'success');
          } else {
            console.error('Analysis failed for file:', fileName, analysis?.error);
            
            const result = {
              ...fileInfo,
              analysis: null,
              error: analysis?.error || 'Analysis failed',
              status: 'failed',
              analyzedAt: new Date().toISOString()
            };
            
            results.push(result);
            
            // Update file state to error
            updateFileState(file.path, 'error', { 
              error: analysis?.error || 'Analysis failed',
              analyzedAt: new Date().toISOString()
            });
            
            addNotification(`⚠️ Analysis failed for: ${fileName}`, 'warning');
          }
        } catch (error) {
          console.error('Error analyzing file:', fileName, error);
          
          const result = {
            ...file,
            analysis: null,
            error: error.message,
            status: 'failed',
            analyzedAt: new Date().toISOString()
          };
          
          results.push(result);
          
          // Update file state to error
          updateFileState(file.path, 'error', { 
            error: error.message,
            analyzedAt: new Date().toISOString()
          });
          
          addNotification(`❌ Error analyzing: ${fileName}`, 'error');
        }
        
        // Update progress AFTER processing each file
        setAnalysisProgress({ current: i + 1, total: files.length });
        
        // Allow UI to update
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      
      setAnalysisResults(results);
      
      // Persist data for use in organize phase
      setAnalysisResults(results);
      
      // Use functional state update to ensure we get the latest fileStates
      setFileStates((currentFileStates) => {
        const updatedStates = { ...currentFileStates };
        
        // Ensure all files have their final states updated
        results.forEach((result) => {
          if (result.analysis && !result.error) {
            updatedStates[result.path] = {
              state: 'ready',
              timestamp: new Date().toISOString(),
              analysis: result.analysis,
              analyzedAt: result.analyzedAt
            };
          } else if (result.error) {
            updatedStates[result.path] = {
              state: 'error',
              timestamp: new Date().toISOString(),
              error: result.error,
              analyzedAt: result.analyzedAt
            };
          }
        });
        
        // Persist the updated states to phase data
        actions.setPhaseData('analysisResults', results);
        actions.setPhaseData('selectedFiles', files);
        actions.setPhaseData('fileStates', updatedStates);
        actions.setPhaseData('namingConvention', {
          convention: namingConvention,
          dateFormat,
          caseConvention,
          separator
        });
        
        return updatedStates;
      });
      
      const successCount = results.filter((r) => r.analysis).length;
      const failureCount = results.length - successCount;
      
      if (successCount > 0) {
        addNotification(`🎉 Analysis complete! ${successCount} files ready for organization`, 'success');
        
        // Auto-advance to organize phase after successful analysis
        setTimeout(() => {
          addNotification('📂 Proceeding to organize phase...', 'info');
          actions.advancePhase(PHASES.ORGANIZE, { 
            analysisResults: results,
            selectedFiles: files,
            fileStates,
            namingConvention: {
              convention: namingConvention,
              dateFormat,
              caseConvention,
              separator
            }
          });
        }, 2000);
      }
      if (failureCount > 0) {
        addNotification(`⚠️ ${failureCount} files failed analysis`, 'warning');
      }
      
    } catch (error) {
      console.error('Batch analysis failed:', error);
      addNotification(`Analysis process failed: ${error.message}`, 'error');
    } finally {
      setIsAnalyzing(false);
      setCurrentAnalysisFile('');
      setAnalysisProgress({ current: 0, total: 0 });
    }
  };

  return (
    <div className="w-full">
      <div className="mb-fib-21">
        <h2 className="text-2xl font-bold text-system-gray-900 mb-fib-8">
          🔍 Discover & Analyze Files
        </h2>
        <p className="text-system-gray-600">
          Select files for AI-powered analysis and organization. Configure naming conventions to match your preferences.
        </p>
      </div>

      {/* NEW: Naming Convention Configuration */}
      <div className="card-enhanced mb-fib-21">
        <h3 className="text-lg font-semibold mb-fib-13 flex items-center gap-fib-5">
          🏷️ Naming Convention Settings
          <span className="text-sm font-normal text-system-gray-500">(Applied during analysis)</span>
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-fib-13 mb-fib-13">
          <div>
            <label className="block text-sm font-medium text-system-gray-700 mb-fib-3">
              Convention Pattern
            </label>
            <select
              value={namingConvention}
              onChange={(e) => setNamingConvention(e.target.value)}
              className="form-input-enhanced w-full"
            >
              <option value="subject-date">Subject + Date</option>
              <option value="date-subject">Date + Subject</option>
              <option value="project-subject-date">Project + Subject + Date</option>
              <option value="category-subject">Category + Subject</option>
              <option value="keep-original">Keep Original</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-system-gray-700 mb-fib-3">
              Date Format
            </label>
            <select
              value={dateFormat}
              onChange={(e) => setDateFormat(e.target.value)}
              className="form-input-enhanced w-full"
              disabled={namingConvention === 'keep-original'}
            >
              <option value="YYYY-MM-DD">2024-12-17</option>
              <option value="MM-DD-YYYY">12-17-2024</option>
              <option value="DD-MM-YYYY">17-12-2024</option>
              <option value="YYYYMMDD">20241217</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-system-gray-700 mb-fib-3">
              Case Style
            </label>
            <select
              value={caseConvention}
              onChange={(e) => setCaseConvention(e.target.value)}
              className="form-input-enhanced w-full"
              disabled={namingConvention === 'keep-original'}
            >
              <option value="kebab-case">kebab-case</option>
              <option value="snake_case">snake_case</option>
              <option value="camelCase">camelCase</option>
              <option value="PascalCase">PascalCase</option>
              <option value="lowercase">lowercase</option>
              <option value="UPPERCASE">UPPERCASE</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-system-gray-700 mb-fib-3">
              Separator
            </label>
            <select
              value={separator}
              onChange={(e) => setSeparator(e.target.value)}
              className="form-input-enhanced w-full"
              disabled={namingConvention === 'keep-original'}
            >
              <option value="-">Hyphen (-)</option>
              <option value="_">Underscore (_)</option>
              <option value=".">Dot (.)</option>
              <option value=" ">Space ( )</option>
            </select>
          </div>
        </div>
        
        {/* Preview */}
        <div className="bg-stratosort-blue/5 p-fib-13 rounded-lg border border-stratosort-blue/20">
          <div className="text-sm font-medium text-system-gray-700 mb-fib-3">Preview:</div>
          <div className="text-system-gray-900 font-mono">
            {generatePreviewName('example-document.pdf')}
          </div>
        </div>
      </div>

      {/* File Selection Options */}
      <div className="max-w-4xl mx-auto mb-fib-21">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-fib-13">
          {/* Select Files */}
          <div 
            className={`card-enhanced text-center transition-all duration-200 cursor-pointer hover:border-stratosort-blue/50 ${
              isScanning || isAnalyzing ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            onClick={!isScanning && !isAnalyzing ? handleFileSelection : undefined}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && !isScanning && !isAnalyzing) {
                e.preventDefault();
                handleFileSelection();
              }
            }}
          >
            <div className="text-5xl mb-fib-8">📄</div>
            <h3 className="text-xl font-bold mb-fib-5 text-stratosort-blue">Select Files</h3>
            <p className="text-system-gray-600 mb-fib-8">Choose individual files to organize</p>
            <div className="text-sm text-system-gray-500">
              Supports: PDF, Word, Images, Archives (Audio temporarily disabled)
            </div>
          </div>

          {/* Select Folder */}
          <div 
            className={`card-enhanced text-center transition-all duration-200 cursor-pointer hover:border-stratosort-blue/50 ${
              isScanning || isAnalyzing ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            onClick={!isScanning && !isAnalyzing ? handleFolderSelection : undefined}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && !isScanning && !isAnalyzing) {
                e.preventDefault();
                handleFolderSelection();
              }
            }}
          >
            <div className="text-5xl mb-fib-8">📁</div>
            <h3 className="text-xl font-bold mb-fib-5 text-stratosort-blue">Scan Folder</h3>
            <p className="text-system-gray-600 mb-fib-8">Scan entire folder for files</p>
            <div className="text-sm text-system-gray-500">
              Auto-scans up to 3 levels deep
            </div>
          </div>
        </div>
      </div>

      {/* Drag and Drop Area */}
      <div className="max-w-2xl mx-auto mb-fib-21">
        <div 
          {...dragProps}
          className={`card-enhanced text-center transition-all duration-200 ${
            isDragging ? 'border-stratosort-blue bg-stratosort-blue/10 scale-105' : 'border-dashed border-2 border-system-gray-300'
          }`}
        >
          <div className="text-5xl mb-fib-8">
            {isDragging ? '✨' : '⬇️'}
          </div>
          <h3 className="text-lg font-semibold mb-fib-5 text-system-gray-700">
            {isDragging ? 'Drop Files Here' : 'Or Drag & Drop Files Here'}
          </h3>
          <p className="text-sm text-system-gray-500">
            {isDragging ? 'Release to analyze files' : 'Drop multiple files at once'}
          </p>
        </div>
      </div>

      {/* Analysis Progress */}
      {isAnalyzing && (
        <div className="card-enhanced mb-fib-21">
          <div className="flex items-center justify-center gap-fib-13 mb-fib-13">
            <div className="animate-spin w-fib-21 h-fib-21 border-3 border-stratosort-blue border-t-transparent rounded-full"></div>
            <div className="text-lg font-semibold text-stratosort-blue">AI Analysis in Progress</div>
          </div>
          
          {/* Enhanced Progress Bar */}
          <div className="mb-fib-8">
            <div className="flex justify-between text-sm text-system-gray-600 mb-fib-3">
              <span>Progress: {analysisProgress.current} of {analysisProgress.total}</span>
              <span>{analysisProgress.total > 0 ? Math.round((analysisProgress.current / analysisProgress.total) * 100) : 0}%</span>
            </div>
            <div className="w-full bg-system-gray-200 rounded-full h-fib-8">
              <div 
                className="bg-stratosort-blue h-fib-8 rounded-full transition-all duration-300"
                style={{ width: `${analysisProgress.total > 0 ? (analysisProgress.current / analysisProgress.total) * 100 : 0}%` }}
              ></div>
            </div>
          </div>
          
          <div className="text-center">
            <div className="text-sm font-medium text-system-gray-700 mb-fib-3">
              {currentAnalysisFile ? `Analyzing: ${currentAnalysisFile}` : 'Analyzing files with artificial intelligence...'}
            </div>
            <div className="text-xs text-system-gray-500">
              This may take a few moments depending on file size and complexity
            </div>
          </div>
        </div>
      )}

      {/* Analysis Results */}
      {analysisResults.length > 0 && !isAnalyzing && (
        <div className="card-enhanced mb-fib-21">
          <div className="flex items-center justify-between mb-fib-13">
            <h3 className="text-lg font-semibold">📊 Analysis Results</h3>
            <div className="flex items-center gap-fib-8">
              <button
                onClick={() => analyzeFiles(selectedFiles)}
                className="btn-primary text-sm"
                disabled={!selectedFiles.length}
                aria-label="Reanalyze all files with current smart folder settings"
              >
                🔄 Reanalyze Files
              </button>
              <button
                onClick={() => setShowAnalysisHistory(true)}
                className="btn-secondary text-sm"
                aria-label="View detailed analysis history"
              >
                📊 History
              </button>
            </div>
          </div>
          
          <div className="space-y-fib-8">
            {analysisResults.map((file, index) => {
              const stateDisplay = getFileStateDisplay(file.path, !!file.analysis);
              
              return (
                <div key={index} className="border border-system-gray-200 rounded-lg p-fib-13">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-fib-8 mb-fib-5">
                        <div className="text-2xl">
                          {getFileType(file.extension?.replace('.', '')) === 'document' ? '📄' :
                            getFileType(file.extension?.replace('.', '')) === 'image' ? '🖼️' :
                            // getFileType(file.extension?.replace('.', '')) === 'audio' ? '🎵' : // REMOVED - audio analysis disabled
                              getFileType(file.extension?.replace('.', '')) === 'video' ? '🎬' :
                                getFileType(file.extension?.replace('.', '')) === 'code' ? '💻' :
                                  getFileType(file.extension?.replace('.', '')) === 'archive' ? '📦' : '📄'}
                        </div>
                        <div>
                          <div className="font-medium text-system-gray-900">{file.name}</div>
                          <div className="text-sm text-system-gray-500">
                            {file.size ? `${Math.round(file.size / 1024)} KB` : 'Unknown size'} • {file.source?.replace('_', ' ')}
                          </div>
                        </div>
                      </div>
                      
                      {file.analysis && (
                        <>
                          <div className="text-sm text-system-gray-700 mb-fib-3">
                            <strong>Suggested Name:</strong> <span className="text-stratosort-blue font-mono">{file.analysis.suggestedName}</span>
                          </div>
                          <div className="text-sm text-system-gray-700 mb-fib-3">
                            <strong>Category:</strong> <span className="text-stratosort-blue">{file.analysis.category}</span>
                          </div>
                          {file.analysis.keywords && file.analysis.keywords.length > 0 && (
                            <div className="text-sm text-system-gray-500 mb-fib-3">
                              <strong>Keywords:</strong> {file.analysis.keywords.join(', ')}
                            </div>
                          )}
                          {file.analysis.confidence && (
                            <div className="text-xs text-system-gray-400">
                              <strong>AI Confidence:</strong> {file.analysis.confidence}%
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
                        </>
                      )}
                      
                      {file.error && (
                        <div className="text-sm text-system-red-600 mt-fib-3">
                          <strong>Error:</strong> {file.error}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-fib-8">
                      <div className="flex items-center gap-fib-3">
                        <button
                          onClick={() => analyzeFiles([file])}
                          className="btn-outline text-xs px-fib-8 py-fib-3"
                          disabled={isAnalyzing}
                          aria-label={`Reanalyze ${file.name}`}
                          title="Reanalyze this file"
                        >
                          🔄
                        </button>
                        <button
                          onClick={() => handleFileAction('open', file.path)}
                          className="btn-outline text-xs px-fib-8 py-fib-3"
                          aria-label={`Open ${file.name}`}
                          title="Open file"
                        >
                          📄
                        </button>
                        <button
                          onClick={() => handleFileAction('reveal', file.path)}
                          className="btn-outline text-xs px-fib-8 py-fib-3"
                          aria-label={`Show ${file.name} in folder`}
                          title="Show in folder"
                        >
                          📁
                        </button>
                        <button
                          onClick={() => handleFileAction('delete', file.path, file)}
                          className="btn-outline text-xs px-fib-8 py-fib-3 text-red-600 hover:bg-red-50"
                          aria-label={`Delete ${file.name}`}
                          title="Delete file"
                        >
                          🗑️
                        </button>
                      </div>
                      <div className={`text-sm font-medium flex items-center gap-fib-3 ${stateDisplay.color}`}>
                        <span className={stateDisplay.spinning ? 'animate-spin' : ''}>{stateDisplay.icon}</span>
                        <span>{stateDisplay.label}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between" role="navigation" aria-label="Phase navigation">
        <button 
          onClick={() => actions.advancePhase(PHASES.SETUP)}
          className="btn-secondary"
          disabled={false} // Allow navigation even during analysis
          aria-label="Go back to setup phase"
        >
          ← Back to Setup
        </button>
        <button 
          onClick={() => {
            console.log('[DISCOVER-PHASE] Advancing to ORGANIZE with data:');
            console.log('[DISCOVER-PHASE] analysisResults:', analysisResults.length);
            console.log('[DISCOVER-PHASE] fileStates:', Object.keys(fileStates).length);
            console.log('[DISCOVER-PHASE] smartFolders:', phaseData.smartFolders?.length || 0);
            
            // Use functional state update to ensure we capture the most current state
            setFileStates((currentFileStates) => {
              const finalData = {
                analysisResults,
                fileStates: currentFileStates,
                selectedFiles,
                isAnalyzing,
                analysisProgress,
                namingConvention: {
                  convention: namingConvention,
                  dateFormat,
                  caseConvention,
                  separator
                }
              };
              
              console.log('[DISCOVER-PHASE] Final data being passed:', finalData);
              
              // Save all phase data before advancing (including current analysis state)
              actions.setPhaseData('analysisResults', analysisResults);
              actions.setPhaseData('fileStates', currentFileStates);
              actions.setPhaseData('selectedFiles', selectedFiles);
              actions.setPhaseData('isAnalyzing', isAnalyzing);
              actions.setPhaseData('analysisProgress', analysisProgress);
              actions.setPhaseData('namingConvention', {
                convention: namingConvention,
                dateFormat,
                caseConvention,
                separator
              });
              
              // Advance to organize phase with the complete data
              actions.advancePhase(PHASES.ORGANIZE, finalData);
              
              return currentFileStates; // Return unchanged state
            });
          }}
          disabled={analysisResults.length === 0} // Only disable if no files analyzed yet
          className={`btn-primary ${analysisResults.length === 0 ? 'opacity-50 cursor-not-allowed' : ''} ${isAnalyzing ? 'animate-pulse' : ''}`}
          aria-label={`Proceed to organize ${analysisResults.length} analyzed files${isAnalyzing ? ' (analysis in progress)' : ''}`}
          aria-describedby={analysisResults.length === 0 ? 'no-files-message' : (isAnalyzing ? 'analysis-in-progress' : undefined)}
        >
          {isAnalyzing ? `Organize Files → (${analysisProgress.current}/${analysisProgress.total} analyzing)` : 'Organize Files →'}
        </button>
        {analysisResults.length === 0 && (
          <div id="no-files-message" className="sr-only">
            No files have been analyzed yet. Please select and analyze files before proceeding.
          </div>
        )}
        {isAnalyzing && (
          <div id="analysis-in-progress" className="sr-only">
            Analysis is currently in progress. You can navigate to other phases and the analysis will continue in the background.
          </div>
        )}
      </div>

      {/* Analysis History Modal */}
      {showAnalysisHistory && (
        <AnalysisHistoryModal 
          onClose={() => setShowAnalysisHistory(false)}
          analysisStats={analysisStats}
          setAnalysisStats={setAnalysisStats}
        />
      )}

      {/* Confirmation Dialog */}
      <ConfirmDialog />
    </div>
  );
}

// ===== ANALYSIS HISTORY MODAL =====
function AnalysisHistoryModal({ onClose, analysisStats, setAnalysisStats }) {
  const { addNotification } = useNotification();
  const [historyData, setHistoryData] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState('statistics');

  useEffect(() => {
    loadAnalysisData();
  }, []);

  const loadAnalysisData = async () => {
    setIsLoading(true);
    try {
      const [stats, history] = await Promise.all([
        window.electronAPI.analysisHistory.getStatistics(),
        window.electronAPI.analysisHistory.get({ limit: 50 })
      ]);
      
      setAnalysisStats(stats);
      setHistoryData(history);
    } catch (error) {
      console.error('Failed to load analysis data:', error);
      addNotification('Failed to load analysis history', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const searchHistory = async () => {
    if (!searchQuery.trim()) return;
    
    try {
      const results = await window.electronAPI.analysisHistory.search(searchQuery, { limit: 50 });
      setHistoryData(results);
    } catch (error) {
      console.error('Search failed:', error);
      addNotification('Search failed', 'error');
    }
  };

  const exportHistory = async (format) => {
    try {
      await window.electronAPI.analysisHistory.export(format);
      addNotification(`Analysis history exported as ${format.toUpperCase()}`, 'success');
    } catch (error) {
      console.error('Export failed:', error);
      addNotification('Export failed', 'error');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-fib-21 max-h-[90vh] overflow-hidden">
        <div className="p-fib-21 border-b border-system-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-system-gray-900">📊 Analysis History & Statistics</h2>
            <button
              onClick={onClose}
              className="text-system-gray-500 hover:text-system-gray-700"
            >
              ✕
            </button>
          </div>
          
          {/* Tab Navigation */}
          <div className="flex mt-fib-13 border-b border-system-gray-200">
            <button
              onClick={() => setSelectedTab('statistics')}
              className={`px-fib-13 py-fib-8 text-sm font-medium border-b-2 ${
                selectedTab === 'statistics' 
                  ? 'border-stratosort-blue text-stratosort-blue' 
                  : 'border-transparent text-system-gray-500 hover:text-system-gray-700'
              }`}
            >
              📈 Statistics
            </button>
            <button
              onClick={() => setSelectedTab('history')}
              className={`px-fib-13 py-fib-8 text-sm font-medium border-b-2 ${
                selectedTab === 'history' 
                  ? 'border-stratosort-blue text-stratosort-blue' 
                  : 'border-transparent text-system-gray-500 hover:text-system-gray-700'
              }`}
            >
              📋 History
            </button>
          </div>
        </div>

        <div className="p-fib-21 overflow-y-auto max-h-[70vh]">
          {isLoading ? (
            <div className="text-center py-fib-21">
              <div className="animate-spin w-fib-21 h-fib-21 border-3 border-stratosort-blue border-t-transparent rounded-full mx-auto mb-fib-8"></div>
              <p>Loading analysis data...</p>
            </div>
          ) : (
            <>
              {selectedTab === 'statistics' && analysisStats && (
                <div className="space-y-fib-21">
                  {/* Overview Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-fib-13">
                    <div className="card-enhanced text-center">
                      <div className="text-2xl font-bold text-stratosort-blue">{analysisStats.totalFiles || 0}</div>
                      <div className="text-sm text-system-gray-600">Total Files</div>
                    </div>
                    <div className="card-enhanced text-center">
                      <div className="text-2xl font-bold text-green-600">{Math.round(analysisStats.averageConfidence || 0)}%</div>
                      <div className="text-sm text-system-gray-600">Avg Confidence</div>
                    </div>
                    <div className="card-enhanced text-center">
                      <div className="text-2xl font-bold text-purple-600">{analysisStats.categoriesCount || 0}</div>
                      <div className="text-sm text-system-gray-600">Categories</div>
                    </div>
                    <div className="card-enhanced text-center">
                      <div className="text-2xl font-bold text-orange-600">{Math.round(analysisStats.averageProcessingTime || 0)}ms</div>
                      <div className="text-sm text-system-gray-600">Avg Time</div>
                    </div>
                  </div>

                  {/* Export Options */}
                  <div className="card-enhanced">
                    <h3 className="font-semibold mb-fib-8">📤 Export Options</h3>
                    <div className="flex gap-fib-8">
                      <button onClick={() => exportHistory('json')} className="btn-outline text-sm">
                        Export JSON
                      </button>
                      <button onClick={() => exportHistory('csv')} className="btn-outline text-sm">
                        Export CSV
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {selectedTab === 'history' && (
                <div className="space-y-fib-13">
                  {/* Search */}
                  <div className="flex gap-fib-8">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search analysis history..."
                      className="form-input-enhanced flex-1"
                      onKeyDown={(e) => e.key === 'Enter' && searchHistory()}
                    />
                    <button onClick={searchHistory} className="btn-primary">Search</button>
                    <button onClick={loadAnalysisData} className="btn-outline">Reset</button>
                  </div>

                  {/* History List */}
                  <div className="space-y-fib-8">
                    {historyData.map((entry, index) => (
                      <div key={index} className="card-enhanced">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="font-medium text-system-gray-900">{entry.fileName || 'Unknown File'}</div>
                            <div className="text-sm text-system-gray-600 mt-fib-3">
                              <span className="text-stratosort-blue">{entry.category || 'Uncategorized'}</span>
                              {entry.confidence && <span className="ml-fib-8">Confidence: {entry.confidence}%</span>}
                            </div>
                            {entry.keywords && entry.keywords.length > 0 && (
                              <div className="flex flex-wrap gap-fib-3 mt-fib-5">
                                {entry.keywords.slice(0, 5).map((keyword, i) => (
                                  <span key={i} className="text-xs bg-stratosort-blue/10 text-stratosort-blue px-fib-3 py-fib-1 rounded-full">
                                    {keyword}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="text-xs text-system-gray-500">
                            {entry.timestamp ? new Date(entry.timestamp).toLocaleDateString() : 'Unknown Date'}
                          </div>
                        </div>
                      </div>
                    ))}
                    
                    {historyData.length === 0 && (
                      <div className="text-center py-fib-21 text-system-gray-500">
                        No analysis history found
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}



export default DiscoverPhase;
