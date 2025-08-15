import React, { useEffect, useMemo, useState } from 'react';
import { PHASES } from '../../shared/constants';
import { usePhase } from '../contexts/PhaseContext';
import { useNotification } from '../contexts/NotificationContext';
import { Collapsible, Button, Input, Select } from '../components/ui';
import { StatusOverview, TargetFolderList, ReadyFileItem, BulkOperations, OrganizeProgress } from '../components/organize';
import { UndoRedoToolbar, useUndoRedo } from '../components/UndoRedoSystem';
import { createOrganizeBatchAction } from '../components/UndoRedoSystem';
import { logger } from '../../shared/logger';

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

  const [fileStates, setFileStates] = useState({});
  const [processedFileIds, setProcessedFileIds] = useState(new Set());

  const analysisResults = (phaseData.analysisResults && Array.isArray(phaseData.analysisResults)) ? phaseData.analysisResults : [];
  const smartFolders = phaseData.smartFolders || [];

  // Ensure smart folders are available even if user skipped Setup
  useEffect(() => {
    const loadSmartFoldersIfMissing = async () => {
      try {
        if (!Array.isArray(smartFolders) || smartFolders.length === 0) {
          const folders = await window.electronAPI.smartFolders.get();
          if (Array.isArray(folders) && folders.length > 0) {
            actions.setPhaseData('smartFolders', folders);
            addNotification(`Loaded ${folders.length} smart folder${folders.length > 1 ? 's' : ''}`, 'info');
          }
        }
      } catch (error) {
        logger.error('Failed to load smart folders in Organize phase:', error);
      }
    };
    loadSmartFoldersIfMissing();
  }, []);

  useEffect(() => {
    const loadPersistedData = () => {
      const persistedStates = phaseData.fileStates || {};
      setFileStates(persistedStates);
      if ((phaseData.analysisResults || []).length === 0 && Object.keys(persistedStates).length > 0) {
        const reconstructedResults = Object.entries(persistedStates).map(([filePath, stateObj]) => ({
          name: filePath.split(/[\\/]/).pop(), path: filePath, size: 0, type: 'file', source: 'reconstructed', analysis: stateObj.analysis || null, error: stateObj.error, analyzedAt: stateObj.analyzedAt, status: stateObj.state === 'ready' ? 'analyzed' : (stateObj.state === 'error' ? 'failed' : 'unknown')
        }));
        actions.setPhaseData('analysisResults', reconstructedResults);
      }
      if (Object.keys(persistedStates).length === 0 && analysisResults.length > 0) {
        const reconstructedStates = {};
        analysisResults.forEach(file => {
          if (file.analysis && !file.error) reconstructedStates[file.path] = { state: 'ready', timestamp: file.analyzedAt || new Date().toISOString(), analysis: file.analysis, analyzedAt: file.analyzedAt };
          else if (file.error) reconstructedStates[file.path] = { state: 'error', timestamp: file.analyzedAt || new Date().toISOString(), error: file.error, analyzedAt: file.analyzedAt };
          else reconstructedStates[file.path] = { state: 'pending', timestamp: new Date().toISOString() };
        });
        setFileStates(reconstructedStates);
        actions.setPhaseData('fileStates', reconstructedStates);
      }
      const previouslyOrganized = phaseData.organizedFiles || [];
      const processedIds = new Set(previouslyOrganized.map(file => file.originalPath || file.path));
      setProcessedFileIds(processedIds);
      if (previouslyOrganized.length > 0) setOrganizedFiles(previouslyOrganized);
    };
    loadPersistedData();
  }, [phaseData, analysisResults, actions]);

  const isAnalysisRunning = phaseData.isAnalyzing || false;
  const analysisProgressFromDiscover = phaseData.analysisProgress || { current: 0, total: 0 };

  const getFileState = (filePath) => fileStates[filePath]?.state || 'pending';
  const getFileStateDisplay = (filePath, hasAnalysis, isProcessed = false) => {
    if (isProcessed) return { icon: '✅', label: 'Organized', color: 'text-green-600', spinning: false };
    const state = getFileState(filePath);
    if (state === 'analyzing') return { icon: '🔄', label: 'Analyzing...', color: 'text-blue-600', spinning: true };
    if (state === 'error') return { icon: '❌', label: 'Error', color: 'text-red-600', spinning: false };
    if (hasAnalysis && state === 'ready') return { icon: '📂', label: 'Ready', color: 'text-stratosort-blue', spinning: false };
    if (state === 'pending') return { icon: '⏳', label: 'Pending', color: 'text-yellow-600', spinning: false };
    return { icon: '❌', label: 'Failed', color: 'text-red-600', spinning: false };
  };

  const unprocessedFiles = Array.isArray(analysisResults) ? analysisResults.filter(file => !processedFileIds.has(file.path) && file && file.analysis) : [];
  const processedFiles = Array.isArray(organizedFiles) ? organizedFiles.filter(file => processedFileIds.has(file?.originalPath || file?.path)) : [];

  const findSmartFolderForCategory = useMemo(() => {
    const folderCache = new Map();
    return (category) => {
      if (!category) return null;
      if (folderCache.has(category)) return folderCache.get(category);
      const normalizedCategory = category.toLowerCase().trim();
      let folder = smartFolders.find(f => f?.name?.toLowerCase()?.trim() === normalizedCategory);
      if (folder) { folderCache.set(category, folder); return folder; }
      const variants = [normalizedCategory, normalizedCategory.replace(/s$/, ''), normalizedCategory + 's', normalizedCategory.replace(/\s+/g, ''), normalizedCategory.replace(/\s+/g, '-'), normalizedCategory.replace(/\s+/g, '_')];
      for (const v of variants) {
        folder = smartFolders.find(f => f.name.toLowerCase().trim() === v || f.name.toLowerCase().replace(/\s+/g, '') === v || f.name.toLowerCase().replace(/\s+/g, '-') === v || f.name.toLowerCase().replace(/\s+/g, '_') === v);
        if (folder) { folderCache.set(category, folder); return folder; }
      }
      folderCache.set(category, null);
      return null;
    };
  }, [smartFolders]);

  const handleEditFile = (fileIndex, field, value) => {
    setEditingFiles(prev => ({ ...prev, [fileIndex]: { ...prev[fileIndex], [field]: value } }));
  };

  const getFileWithEdits = (file, index) => {
    const edits = editingFiles[index];
    if (!edits) return file;
    const updatedCategory = edits.category || file.analysis?.category;
    return { ...file, analysis: { ...file.analysis, suggestedName: edits.suggestedName || file.analysis?.suggestedName, category: updatedCategory } };
  };

  const markFilesAsProcessed = (filePaths) => setProcessedFileIds(prev => { const next = new Set(prev); filePaths.forEach(path => next.add(path)); return next; });
  const unmarkFilesAsProcessed = (filePaths) => setProcessedFileIds(prev => { const next = new Set(prev); filePaths.forEach(path => next.delete(path)); return next; });

  const toggleFileSelection = (index) => { const next = new Set(selectedFiles); next.has(index) ? next.delete(index) : next.add(index); setSelectedFiles(next); };
  const selectAllFiles = () => { selectedFiles.size === unprocessedFiles.length ? setSelectedFiles(new Set()) : setSelectedFiles(new Set(Array.from({ length: unprocessedFiles.length }, (_, i) => i))); };
  const applyBulkCategoryChange = () => { if (!bulkCategory) return; const newEdits = {}; selectedFiles.forEach(i => newEdits[i] = { ...editingFiles[i], category: bulkCategory }); setEditingFiles(prev => ({ ...prev, ...newEdits })); setBulkEditMode(false); setBulkCategory(''); setSelectedFiles(new Set()); addNotification(`Applied category "${bulkCategory}" to ${selectedFiles.size} files`, 'success'); };
  const approveSelectedFiles = () => { if (selectedFiles.size === 0) return; addNotification(`Approved ${selectedFiles.size} files for organization`, 'success'); setSelectedFiles(new Set()); };

  const handleOrganizeFiles = async () => {
    try {
      setIsOrganizing(true);
      const filesToProcess = unprocessedFiles.filter(f => f.analysis);
      if (filesToProcess.length === 0) return;
      setBatchProgress({ current: 0, total: filesToProcess.length, currentFile: '' });

      // Build operations for main process
      const operations = filesToProcess.map((file, i) => {
        const edits = editingFiles[i] || {};
        const fileWithEdits = getFileWithEdits(file, i);
        const currentCategory = edits.category || fileWithEdits.analysis?.category;
        const smartFolder = findSmartFolderForCategory(currentCategory);
        const destinationDir = smartFolder ? (smartFolder.path || `${defaultLocation}/${smartFolder.name}`) : `${defaultLocation}/${currentCategory || 'Uncategorized'}`;
        const newName = edits.suggestedName || fileWithEdits.analysis?.suggestedName || file.name;
        return { type: 'move', source: file.path, destination: `${destinationDir}/${newName}` };
      });

      const sourcePathsSet = new Set(operations.map(op => op.source));

      const stateCallbacks = {
        onExecute: (result) => {
          try {
            const resArray = Array.isArray(result?.results) ? result.results : [];
            const uiResults = resArray.filter(r => r.success).map(r => {
              const original = analysisResults.find(a => a.path === r.source) || {};
              return {
                originalPath: r.source,
                path: r.destination,
                originalName: original.name || (original.path ? original.path.split(/[\\/]/).pop() : ''),
                newName: r.destination ? r.destination.split(/[\\/]/).pop() : '',
                smartFolder: 'Organized',
                organizedAt: new Date().toISOString()
              };
            });
            if (uiResults.length > 0) {
              setOrganizedFiles(prev => [...prev, ...uiResults]);
              markFilesAsProcessed(uiResults.map(r => r.originalPath));
              actions.setPhaseData('organizedFiles', [...(phaseData.organizedFiles || []), ...uiResults]);
              addNotification(`Organized ${uiResults.length} files`, 'success');
            }
          } catch {}
        },
        onUndo: () => {
          try {
            // Remove any organized entries that belong to this batch
            setOrganizedFiles(prev => prev.filter(of => !sourcePathsSet.has(of.originalPath)));
            unmarkFilesAsProcessed(Array.from(sourcePathsSet));
            actions.setPhaseData('organizedFiles', (phaseData.organizedFiles || []).filter(of => !sourcePathsSet.has(of.originalPath)));
            addNotification('Undo complete. Restored files to original locations.', 'info');
          } catch {}
        },
        onRedo: () => {
          try {
            // Best-effort: re-add based on operations
            const uiResults = operations.map(op => ({
              originalPath: op.source,
              path: op.destination,
              originalName: op.source.split(/[\\/]/).pop(),
              newName: op.destination.split(/[\\/]/).pop(),
              smartFolder: 'Organized',
              organizedAt: new Date().toISOString()
            }));
            setOrganizedFiles(prev => [...prev, ...uiResults]);
            markFilesAsProcessed(uiResults.map(r => r.originalPath));
            actions.setPhaseData('organizedFiles', [...(phaseData.organizedFiles || []), ...uiResults]);
            addNotification('Redo complete. Files re-organized.', 'info');
          } catch {}
        }
      };

      // Execute as a single undoable action
      await executeAction(createOrganizeBatchAction(`Organize ${operations.length} files`, operations, stateCallbacks));
    } catch (error) {
      addNotification(`Organization failed: ${error.message}`, 'error');
    } finally {
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
            <h2 className="heading-primary mb-8">📂 Review & Organize</h2>
            <p className="text-lg text-system-gray-600 leading-relaxed">Review AI suggestions and organize your files into smart folders.</p>
              {isAnalysisRunning && (
                <div className="mt-13 p-13 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-8">
                    <div className="animate-spin w-13 h-13 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                  <div className="text-sm font-medium text-blue-700">Analysis continuing in background: {analysisProgressFromDiscover.current}/{analysisProgressFromDiscover.total} files</div>
                </div>
              </div>
            )}
          </div>
          <UndoRedoToolbar className="flex-shrink-0" />
        </div>
      </div>
      {smartFolders.length > 0 && (
        <Collapsible title="📁 Target Smart Folders" defaultOpen={false} persistKey="organize-target-folders">
          <TargetFolderList folders={smartFolders} defaultLocation={defaultLocation} />
        </Collapsible>
      )}
      {(unprocessedFiles.length > 0 || processedFiles.length > 0) && (
        <Collapsible title="📊 File Status Overview" defaultOpen persistKey="organize-status">
          <StatusOverview unprocessedCount={unprocessedFiles.length} processedCount={processedFiles.length} failedCount={analysisResults.filter(f => !f.analysis).length} />
        </Collapsible>
      )}
      {unprocessedFiles.length > 0 && (
        <Collapsible title="Bulk Operations" defaultOpen persistKey="organize-bulk">
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
      <Collapsible title="Files Ready for Organization" defaultOpen persistKey="organize-ready-list">
        {unprocessedFiles.length === 0 ? (
          <div className="text-center py-21">
            <div className="text-4xl mb-13">{processedFiles.length > 0 ? '✅' : '📭'}</div>
            <p className="text-system-gray-500 italic">{processedFiles.length > 0 ? 'All files have been organized! Check the results below.' : 'No files ready for organization yet.'}</p>
            {processedFiles.length === 0 && (<Button onClick={() => actions.advancePhase(PHASES.DISCOVER)} variant="primary" className="mt-13">← Go Back to Select Files</Button>)}
          </div>
        ) : (
          <div className="space-y-8">
            {unprocessedFiles.map((file, index) => {
              const fileWithEdits = getFileWithEdits(file, index);
              const currentCategory = editingFiles[index]?.category || fileWithEdits.analysis?.category;
              const smartFolder = findSmartFolderForCategory(currentCategory);
              const isSelected = selectedFiles.has(index);
              const stateDisplay = getFileStateDisplay(file.path, !!file.analysis);
              const destination = smartFolder ? (smartFolder.path || `${defaultLocation}/${smartFolder.name}`) : 'No matching folder';
              return (
                <ReadyFileItem
                  key={index}
                  file={fileWithEdits}
                  index={index}
                  isSelected={isSelected}
                  onToggleSelected={toggleFileSelection}
                  stateDisplay={stateDisplay}
                  smartFolders={smartFolders}
                  editing={editingFiles[index]}
                  onEdit={handleEditFile}
                  destination={destination}
                  category={currentCategory}
                />
              );
            })}
          </div>
        )}
      </Collapsible>
      {processedFiles.length > 0 && (
        <Collapsible title="✅ Previously Organized Files" defaultOpen={false} persistKey="organize-history">
          <div className="space-y-5 max-h-64 overflow-y-auto">
            {processedFiles.map((file, index) => (
              <div key={index} className="flex items-center justify-between p-8 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-center gap-8">
                  <span className="text-green-600">✅</span>
                  <div>
                    <div className="text-sm font-medium text-system-gray-900">{file.originalName} → {file.newName}</div>
                    <div className="text-xs text-system-gray-500">Moved to {file.smartFolder} • {new Date(file.organizedAt).toLocaleDateString()}</div>
                  </div>
                </div>
                <div className="text-xs text-green-600 font-medium">Organized</div>
              </div>
            ))}
          </div>
        </Collapsible>
      )}
      {unprocessedFiles.length > 0 && (
        <Collapsible title="Ready to Organize" defaultOpen persistKey="organize-action">
          <p className="text-system-gray-600 mb-13">StratoSort will move and rename <strong>{unprocessedFiles.filter(f => f.analysis).length} files</strong> according to AI suggestions.</p>
          <p className="text-xs text-system-gray-500 mb-13">💡 Don't worry - you can undo this operation if needed</p>
          {isOrganizing ? (
            <OrganizeProgress isOrganizing={isOrganizing} batchProgress={batchProgress} />
          ) : (
            <Button onClick={handleOrganizeFiles} variant="success" className="text-lg px-21 py-13" disabled={unprocessedFiles.filter(f => f.analysis).length === 0}>✨ Organize Files Now</Button>
          )}
        </Collapsible>
      )}
      <div className="flex justify-between">
        <Button onClick={() => actions.advancePhase(PHASES.DISCOVER)} variant="secondary" disabled={isOrganizing}>← Back to Discovery</Button>
        <Button onClick={() => actions.advancePhase(PHASES.COMPLETE)} disabled={processedFiles.length === 0 || isOrganizing} className={`${processedFiles.length === 0 || isOrganizing ? 'opacity-50 cursor-not-allowed' : ''}`}>View Results →</Button>
      </div>
    </div>
  );
}

export default OrganizePhase;


