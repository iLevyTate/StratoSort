import React, { useEffect, useRef, useState } from 'react';
import { PHASES, RENDERER_LIMITS } from '../../shared/constants';
import { usePhase } from '../contexts/PhaseContext';
import { useNotification } from '../contexts/NotificationContext';
import { useConfirmDialog, useDragAndDrop } from '../hooks';
import { Collapsible, Button, Input, Select } from '../components/ui';
import AnalysisDetails from '../components/AnalysisDetails';
import { NamingSettings, SelectionControls, DragAndDropZone, AnalysisResultsList, AnalysisProgress } from '../components/discover';

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

  const [namingConvention, setNamingConvention] = useState('subject-date');
  const [dateFormat, setDateFormat] = useState('YYYY-MM-DD');
  const [caseConvention, setCaseConvention] = useState('kebab-case');
  const [separator, setSeparator] = useState('-');

  const [fileStates, setFileStates] = useState({});
  const hasResumedRef = useRef(false);

  useEffect(() => {
    const persistedResults = phaseData.analysisResults || [];
    const persistedFiles = phaseData.selectedFiles || [];
    const persistedStates = phaseData.fileStates || {};
    const persistedNaming = phaseData.namingConvention || {};
    const persistedIsAnalyzing = !!phaseData.isAnalyzing;
    const persistedProgress = phaseData.analysisProgress || { current: 0, total: 0 };
    const persistedCurrent = phaseData.currentAnalysisFile || '';

    // Restore persisted state regardless of whether results exist yet
    setSelectedFiles(persistedFiles);
    setFileStates(persistedStates);
    setNamingConvention(persistedNaming.convention || 'subject-date');
    setDateFormat(persistedNaming.dateFormat || 'YYYY-MM-DD');
    setCaseConvention(persistedNaming.caseConvention || 'kebab-case');
    setSeparator(persistedNaming.separator || '-');
    if (persistedResults.length > 0) setAnalysisResults(persistedResults);
    if (persistedIsAnalyzing) {
      setIsAnalyzing(true);
      setAnalysisProgress(persistedProgress);
      setCurrentAnalysisFile(persistedCurrent);
    }
  }, [phaseData]);

  useEffect(() => {
    // Resume analysis if it was in progress before app closed
    if (!hasResumedRef.current && phaseData.isAnalyzing && Array.isArray(selectedFiles) && selectedFiles.length > 0) {
      const remaining = selectedFiles.filter(f => {
        const state = fileStates[f.path]?.state;
        return state !== 'ready' && state !== 'error';
      });
      if (remaining.length > 0) {
        hasResumedRef.current = true;
        addNotification(`Resuming analysis of ${remaining.length} files...`, 'info');
        // Kick off analysis for remaining files only
        analyzeFiles(remaining);
      } else {
        hasResumedRef.current = true;
        // Nothing left to do; clear analyzing flag
        actions.setPhaseData('isAnalyzing', false);
        setIsAnalyzing(false);
      }
    }
  }, [phaseData.isAnalyzing, selectedFiles, fileStates]);

  const updateFileState = (filePath, state, metadata = {}) => {
    try {
      setFileStates(prev => {
        if (!prev || typeof prev !== 'object') prev = {};
        let newStates = { ...prev };
        const entries = Object.entries(newStates);
        if (entries.length > 100) {
          const sortedEntries = entries.sort((a, b) => new Date(b[1].timestamp) - new Date(a[1].timestamp));
          newStates = Object.fromEntries(sortedEntries.slice(0, 100));
        }
        newStates[filePath] = { state, timestamp: new Date().toISOString(), ...metadata };
        return newStates;
      });
    } catch {
      setFileStates({ [filePath]: { state, timestamp: new Date().toISOString(), ...metadata } });
    }
  };

  const getFileState = (filePath) => fileStates[filePath]?.state || 'pending';

  const getFileStateDisplay = (filePath, hasAnalysis) => {
    const state = getFileState(filePath);
    if (state === 'analyzing') return { icon: '🔄', label: 'Analyzing...', color: 'text-blue-600', spinning: true };
    if (state === 'error') return { icon: '❌', label: 'Error', color: 'text-red-600', spinning: false };
    if (hasAnalysis && state === 'ready') return { icon: '✅', label: 'Ready', color: 'text-green-600', spinning: false };
    if (state === 'pending') return { icon: '⏳', label: 'Pending', color: 'text-yellow-600', spinning: false };
    return { icon: '❌', label: 'Failed', color: 'text-red-600', spinning: false };
  };

  const generatePreviewName = (originalName) => {
    const baseName = originalName.replace(/\.[^/.]+$/, '');
    const extension = originalName.includes('.') ? '.' + originalName.split('.').pop() : '';
    const today = new Date();
    let previewName = '';
    switch (namingConvention) {
      case 'subject-date': previewName = `${baseName}${separator}${formatDate(today, dateFormat)}`; break;
      case 'date-subject': previewName = `${formatDate(today, dateFormat)}${separator}${baseName}`; break;
      case 'project-subject-date': previewName = `Project${separator}${baseName}${separator}${formatDate(today, dateFormat)}`; break;
      case 'category-subject': previewName = `Category${separator}${baseName}`; break;
      case 'keep-original': previewName = baseName; break;
      default: previewName = baseName;
    }
    return applyCaseConvention(previewName, caseConvention) + extension;
  };

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
      case 'kebab-case': return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      case 'snake_case': return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      case 'camelCase': return text.replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => index === 0 ? word.toLowerCase() : word.toUpperCase()).replace(/\s+/g, '');
      case 'PascalCase': return text.replace(/(?:^\w|[A-Z]|\b\w)/g, word => word.toUpperCase()).replace(/\s+/g, '');
      case 'lowercase': return text.toLowerCase();
      case 'UPPERCASE': return text.toUpperCase();
      default: return text;
    }
  };

  const handleFileDrop = async (files) => {
    if (files && files.length > 0) {
      addNotification(`Processing ${files.length} dropped files...`, 'info');
      const enhancedFiles = files.map(file => ({ ...file, source: 'drag_drop', droppedAt: new Date().toISOString() }));
      setSelectedFiles(enhancedFiles);
      actions.setPhaseData('selectedFiles', enhancedFiles);
      enhancedFiles.forEach(file => updateFileState(file.path, 'pending'));
      addNotification(`Dropped ${files.length} files for analysis`, 'success');
      await analyzeFiles(enhancedFiles);
    }
  };

  const { isDragging, dragProps } = useDragAndDrop(handleFileDrop);

  const getFileType = (extension) => {
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'tiff', 'ico'];
    const videoExts = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', '3gp'];
    const docExts = ['pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'odt', 'pages'];
    const codeExts = ['js', 'ts', 'py', 'java', 'cpp', 'c', 'html', 'css', 'json', 'xml'];
    const archiveExts = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'];
    if (imageExts.includes(extension)) return 'image';
    if (videoExts.includes(extension)) return 'video';
    if (docExts.includes(extension)) return 'document';
    if (codeExts.includes(extension)) return 'code';
    if (archiveExts.includes(extension)) return 'archive';
    return 'file';
  };

  const getBatchFileStats = async (filePaths, batchSize = RENDERER_LIMITS.FILE_STATS_BATCH_SIZE) => {
    const results = [];
    for (let i = 0; i < filePaths.length; i += batchSize) {
      const batch = filePaths.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(batch.map(async (filePath) => {
        try {
          if (i > 0) await new Promise(resolve => setTimeout(resolve, 5));
          const stats = await window.electronAPI.files.getStats(filePath);
          const fileName = filePath.split(/[\\/]/).pop();
          const extension = fileName.includes('.') ? '.' + fileName.split('.').pop().toLowerCase() : '';
          return { name: fileName, path: filePath, extension, size: stats?.size || 0, type: 'file', created: stats?.created, modified: stats?.modified, success: true };
        } catch (error) {
          const fileName = filePath.split(/[\\/]/).pop();
          return { name: fileName, path: filePath, extension: fileName.includes('.') ? '.' + fileName.split('.').pop().toLowerCase() : '', size: 0, type: 'file', success: false, error: error.message };
        }
      }));
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') results.push(result.value);
        else {
          const filePath = batch[index];
          const fileName = filePath.split(/[\\/]/).pop();
          results.push({ name: fileName, path: filePath, extension: fileName.includes('.') ? '.' + fileName.split('.').pop().toLowerCase() : '', size: 0, type: 'file', success: false, error: result.reason?.message || 'Unknown error' });
        }
      });
      if (i + batchSize < filePaths.length) await new Promise(resolve => setTimeout(resolve, 10));
    }
    return results;
  };

  const handleFileSelection = async () => {
    try {
      setIsScanning(true);
      addNotification('Opening file picker...', 'info');
      const result = await window.electronAPI.files.select();
      if (result?.success && result?.files?.length > 0) {
        const { files, summary } = result;
        let message = `Found ${files.length} supported files`;
        if (summary?.totalSelected > 1) message += ` from ${summary.totalSelected} selected items`;
        if (summary?.duplicatesRemoved > 0) message += ` (${summary.duplicatesRemoved} duplicates removed)`;
        addNotification(message, 'success');
        files.forEach(filePath => updateFileState(filePath, 'pending'));
        const fileObjects = await getBatchFileStats(files);
        const enhancedFiles = fileObjects.map(file => ({ ...file, source: 'file_selection' }));
        setSelectedFiles(enhancedFiles);
        actions.setPhaseData('selectedFiles', enhancedFiles);
        const failedFiles = fileObjects.filter(f => !f.success);
        if (failedFiles.length > 0) addNotification(`Warning: ${failedFiles.length} files had issues loading metadata`, 'warning');
        await analyzeFiles(enhancedFiles);
      } else {
        addNotification('No files selected', 'info');
      }
    } catch (error) {
      addNotification(`Error selecting files: ${error.message}`, 'error');
    } finally {
      setIsScanning(false);
    }
  };

  const handleFolderSelection = async () => {
    try {
      setIsScanning(true);
      addNotification('Opening folder picker...', 'info');
      const result = await window.electronAPI.files.selectDirectory();
      if (result?.success && result?.folder) {
        addNotification(`Scanning folder: ${result.folder}`, 'info');
        const scanResult = await window.electronAPI.smartFolders.scanStructure(result.folder);
        if (scanResult && scanResult.files && scanResult.files.length > 0) {
          const supportedExts = ['.pdf', '.doc', '.docx', '.txt', '.md', '.rtf', '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.zip', '.rar', '.7z', '.tar', '.gz'];
          const supportedFiles = scanResult.files.filter(file => {
            const ext = file.name.includes('.') ? '.' + file.name.split('.').pop().toLowerCase() : '';
            return supportedExts.includes(ext);
          });
          if (supportedFiles.length === 0) { addNotification('No supported files found in the selected folder', 'warning'); return; }
          addNotification(`Found ${supportedFiles.length} supported files in folder`, 'success');
          supportedFiles.forEach(file => updateFileState(file.path, 'pending'));
          const fileObjects = await getBatchFileStats(supportedFiles.map(f => f.path));
          const enhancedFiles = fileObjects.map(file => ({ ...file, source: 'folder_scan' }));
          setSelectedFiles(enhancedFiles); actions.setPhaseData('selectedFiles', enhancedFiles);
          await analyzeFiles(enhancedFiles);
        } else { addNotification('No files found in the selected folder', 'warning'); }
      } else if (result?.success === false && result?.folder === null) {
        addNotification('Folder selection cancelled', 'info');
      } else { addNotification('No folder selected', 'info'); }
    } catch (error) {
      addNotification(`Error selecting folder: ${error.message}`, 'error');
    } finally { setIsScanning(false); }
  };

  const handleFileAction = async (action, filePath) => {
    try {
      switch (action) {
        case 'open': await window.electronAPI.files.open(filePath); addNotification(`Opened: ${filePath.split(/[\\/]/).pop()}`, 'success'); break;
        case 'reveal': await window.electronAPI.files.reveal(filePath); addNotification(`Revealed: ${filePath.split(/[\\/]/).pop()}`, 'success'); break;
        case 'delete': {
          const fileName = filePath.split(/[\\/]/).pop();
          const confirmDelete = await showConfirm({ title: 'Delete File', message: 'This action cannot be undone. Are you sure you want to permanently delete this file?', confirmText: 'Delete', cancelText: 'Cancel', variant: 'danger', fileName });
          if (confirmDelete) {
            const result = await window.electronAPI.files.delete(filePath);
            if (result.success) {
              setAnalysisResults(prev => prev.filter(f => f.path !== filePath));
              setSelectedFiles(prev => prev.filter(f => f.path !== filePath));
              setFileStates(prev => { if (!prev) return prev; const next = { ...prev }; delete next[filePath]; return next; });
              addNotification(`Deleted: ${fileName}`, 'success');
            } else { addNotification(`Failed to delete: ${fileName}`, 'error'); }
          }
          break;
        }
        default: addNotification(`Unknown action: ${action}`, 'error');
      }
    } catch (error) {
      addNotification(`Action failed: ${error.message}`, 'error');
    }
  };

  const analyzeFiles = async (files) => {
    if (!files || files.length === 0) return;
    setIsAnalyzing(true);
    setAnalysisProgress({ current: 0, total: files.length });
    setCurrentAnalysisFile('');
    actions.setPhaseData('isAnalyzing', true);
    actions.setPhaseData('analysisProgress', { current: 0, total: files.length });
    actions.setPhaseData('currentAnalysisFile', '');
    const results = [];
    let maxConcurrent = 3;
    try { const persistedSettings = await window.electronAPI.settings.get(); if (persistedSettings && typeof persistedSettings.maxConcurrentAnalysis !== 'undefined') { maxConcurrent = Number(persistedSettings.maxConcurrentAnalysis); } } catch {}
    const concurrency = Math.max(1, Math.min(Number(maxConcurrent) || 3, 8));
    try {
      addNotification(`Starting AI analysis of ${files.length} files...`, 'info');
      let index = 0;
      const worker = async () => {
        while (true) {
          const i = index++;
          if (i >= files.length) break;
          const file = files[i];
          const fileName = file.name || file.path.split(/[\\/]/).pop();
          setCurrentAnalysisFile(fileName);
          setAnalysisProgress({ current: i, total: files.length });
          actions.setPhaseData('currentAnalysisFile', fileName);
          actions.setPhaseData('analysisProgress', { current: i, total: files.length });
          updateFileState(file.path, 'analyzing', { fileName });
          await new Promise((resolve) => setTimeout(resolve, 0));
          try {
            const fileInfo = { ...file, size: file.size || 0, created: file.created, modified: file.modified };
            const analysis = await Promise.race([
              window.electronAPI.files.analyze(file.path),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Analysis timeout after 3 minutes')), RENDERER_LIMITS.ANALYSIS_TIMEOUT_MS))
            ]);
            if (analysis && !analysis.error) {
              const enhancedAnalysis = { ...analysis, suggestedName: generatePreviewName(analysis.suggestedName || fileName), namingConvention: { convention: namingConvention, dateFormat, caseConvention, separator } };
              const result = { ...fileInfo, analysis: enhancedAnalysis, status: 'analyzed', analyzedAt: new Date().toISOString() };
              results.push(result);
              updateFileState(file.path, 'ready', { analysis: enhancedAnalysis, analyzedAt: new Date().toISOString() });
            } else {
              const result = { ...fileInfo, analysis: null, error: analysis?.error || 'Analysis failed', status: 'failed', analyzedAt: new Date().toISOString() };
              results.push(result);
              updateFileState(file.path, 'error', { error: analysis?.error || 'Analysis failed', analyzedAt: new Date().toISOString() });
            }
          } catch (error) {
            const result = { ...file, analysis: null, error: error.message, status: 'failed', analyzedAt: new Date().toISOString() };
            results.push(result);
            updateFileState(file.path, 'error', { error: error.message, analyzedAt: new Date().toISOString() });
          }
          setAnalysisProgress((prev) => ({ current: Math.min(files.length, prev.current + 1), total: files.length }));
          // Persist a rough progress signal to localStorage for resume UI
          try {
            const workflowState = { currentPhase: phaseData.currentPhase || PHASES.DISCOVER, phaseData: { ...phaseData, isAnalyzing: true, analysisProgress: { current: i + 1, total: files.length }, currentAnalysisFile: fileName }, timestamp: Date.now() };
            localStorage.setItem('stratosort_workflow_state', JSON.stringify(workflowState));
          } catch {}
          actions.setPhaseData('analysisProgress', { current: Math.min(files.length, i + 1), total: files.length });
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      };
      const workers = Array.from({ length: concurrency }, () => worker());
      await Promise.all(workers);
       // Merge with any existing results (important for resume)
       const resultsByPath = new Map((analysisResults || []).map(r => [r.path, r]));
       results.forEach(r => resultsByPath.set(r.path, r));
       const mergedResults = Array.from(resultsByPath.values());
       setAnalysisResults(mergedResults);

       // Merge file states (preserve previous states, update changed)
       const mergedStates = { ...(fileStates || {}) };
       results.forEach(result => {
         if (result.analysis && !result.error) mergedStates[result.path] = { state: 'ready', timestamp: new Date().toISOString(), analysis: result.analysis, analyzedAt: result.analyzedAt };
         else if (result.error) mergedStates[result.path] = { state: 'error', timestamp: new Date().toISOString(), error: result.error, analyzedAt: result.analyzedAt };
       });
       setFileStates(mergedStates);

       actions.setPhaseData('analysisResults', mergedResults);
       actions.setPhaseData('fileStates', mergedStates);
       actions.setPhaseData('namingConvention', { convention: namingConvention, dateFormat, caseConvention, separator });
      const successCount = results.filter(r => r.analysis).length;
      const failureCount = results.length - successCount;
       if (successCount > 0) {
        addNotification(`🎉 Analysis complete! ${successCount} files ready for organization`, 'success');
        setTimeout(() => { addNotification('📂 Proceeding to organize phase...', 'info'); actions.advancePhase(PHASES.ORGANIZE); }, 2000);
      }
      if (failureCount > 0) addNotification(`⚠️ ${failureCount} files failed analysis`, 'warning');
    } catch (error) {
      addNotification(`Analysis process failed: ${error.message}`, 'error');
    } finally {
      setIsAnalyzing(false);
      setCurrentAnalysisFile('');
      setAnalysisProgress({ current: 0, total: 0 });
      actions.setPhaseData('isAnalyzing', false);
      actions.setPhaseData('currentAnalysisFile', '');
      actions.setPhaseData('analysisProgress', { current: 0, total: 0 });
    }
  };

  return (
    <div className="w-full">
      <div className="mb-fib-21 text-center">
        <h2 className="heading-primary">🔍 Discover & Analyze</h2>
        <p className="text-lg text-system-gray-600 leading-relaxed">Select files or scan a folder, then let StratoSort analyze and prepare them for organization.</p>
      </div>
      <div className="flex items-center justify-center gap-fib-8 -mt-fib-8 mb-fib-13">
        <button className="text-xs text-system-gray-500 hover:text-system-gray-700 underline" onClick={() => { try { const keys = ['discover-naming','discover-selection','discover-dnd','discover-results']; keys.forEach(k => window.localStorage.setItem(`collapsible:${k}`, 'true')); window.dispatchEvent(new Event('storage')); } catch {} }}>Expand all</button>
        <span className="text-system-gray-300">•</span>
        <button className="text-xs text-system-gray-500 hover:text-system-gray-700 underline" onClick={() => { try { const keys = ['discover-naming','discover-selection','discover-dnd','discover-results']; keys.forEach(k => window.localStorage.setItem(`collapsible:${k}`, 'false')); window.dispatchEvent(new Event('storage')); } catch {} }}>Collapse all</button>
      </div>
      <Collapsible title="Naming Settings" defaultOpen persistKey="discover-naming">
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

      <Collapsible title="Select Files or Folder" defaultOpen persistKey="discover-selection">
        <SelectionControls onSelectFiles={handleFileSelection} onSelectFolder={handleFolderSelection} isScanning={isScanning} />
      </Collapsible>

      <Collapsible title="Drag & Drop" defaultOpen persistKey="discover-dnd">
        <DragAndDropZone isDragging={isDragging} dragProps={dragProps} />
      </Collapsible>

      {isAnalyzing && (
        <Collapsible title="Analysis Progress" defaultOpen persistKey="discover-progress">
          <AnalysisProgress progress={analysisProgress} currentFile={currentAnalysisFile} />
        </Collapsible>
      )}

      {analysisResults.length > 0 && (
        <Collapsible title="Analysis Results" defaultOpen persistKey="discover-results">
          <AnalysisResultsList results={analysisResults} onFileAction={handleFileAction} getFileStateDisplay={getFileStateDisplay} />
        </Collapsible>
      )}
      <ConfirmDialog />
    </div>
  );
}

export default DiscoverPhase;


