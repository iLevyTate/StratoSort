import React, { useMemo } from 'react';
import { PHASES } from '../../shared/constants';
import { usePhase } from '../contexts/PhaseContext';
import { Collapsible, Button } from '../components/ui';
import {
  StatusOverview,
  TargetFolderList,
  ReadyFileItem,
  BulkOperations,
  OrganizeProgress,
} from '../components/organize';
import { UndoRedoToolbar } from '../components/UndoRedoSystem';
import { useOrganizePhase } from '../hooks/useOrganizePhase';

function OrganizePhase() {
  const { actions, phaseData } = usePhase();
  const {
    // State
    isOrganizing,
    batchProgress,
    organizePreview,
    editingFiles,
    selectedFiles,
    bulkEditMode,
    bulkCategory,
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
  } = useOrganizePhase();

  const isAnalysisRunning = phaseData.isAnalyzing || false;
  const analysisProgressFromDiscover = phaseData.analysisProgress || {
    current: 0,
    total: 0,
  };

  const failedCount = useMemo(
    () => (phaseData.analysisResults || []).filter((f) => !f.analysis).length,
    [phaseData.analysisResults],
  );

  // The rest of Organize UI (lists, bulk ops, progress) should be moved here as needed.
  return (
    <div className="w-full">
      <div className="mb-21">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="heading-primary mb-8">📂 Review & Organize</h2>
            <p className="text-lg text-system-gray-600 leading-relaxed max-w-2xl">
              Review AI suggestions and organize your files into smart folders.
            </p>
            {isAnalysisRunning && (
              <div className="mt-13 p-13 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-8">
                  <div className="animate-spin w-13 h-13 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                  <div className="text-sm font-medium text-blue-700">
                    Analysis continuing in background:{' '}
                    {analysisProgressFromDiscover.current}/
                    {analysisProgressFromDiscover.total} files
                  </div>
                </div>
              </div>
            )}
          </div>
          <UndoRedoToolbar className="flex-shrink-0" />
        </div>
      </div>
      {smartFolders.length > 0 && (
        <Collapsible
          title="📁 Target Smart Folders"
          defaultOpen={false}
          persistKey="organize-target-folders"
          contentClassName="max-h-[360px] overflow-y-auto pr-8"
        >
          <TargetFolderList
            folders={smartFolders}
            defaultLocation="Documents"
          />
        </Collapsible>
      )}
      {(unprocessedFiles.length > 0 || processedFiles.length > 0) && (
        <Collapsible
          title="📊 File Status Overview"
          defaultOpen
          persistKey="organize-status"
        >
          <StatusOverview
            unprocessedCount={unprocessedFiles.length}
            processedCount={processedFiles.length}
            failedCount={failedCount}
          />
          {unprocessedFiles.length > 0 && (
            <div className="mt-5 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="font-medium text-blue-900 mb-2">
                Organization Readiness
              </h4>
              <div className="text-sm text-blue-700 space-y-1">
                <div>
                  ✅{' '}
                  <strong>
                    {unprocessedFiles.filter((f) => f.analysis).length}
                  </strong>{' '}
                  files ready to organize
                </div>
                {unprocessedFiles.filter((f) => !f.analysis).length > 0 && (
                  <div>
                    ⚠️{' '}
                    <strong>
                      {unprocessedFiles.filter((f) => !f.analysis).length}
                    </strong>{' '}
                    files need analysis
                  </div>
                )}
                {unprocessedFiles.filter(
                  (f) => f.analysis && !f.analysis.category,
                ).length > 0 && (
                  <div>
                    ⚠️{' '}
                    <strong>
                      {
                        unprocessedFiles.filter(
                          (f) => f.analysis && !f.analysis.category,
                        ).length
                      }
                    </strong>{' '}
                    files missing category
                  </div>
                )}
              </div>
            </div>
          )}
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
        {unprocessedFiles.length === 0 ? (
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
        ) : (
          <div className="space-y-8">
            {unprocessedFiles.map((file, index) => {
              const fileWithEdits = getFileWithEdits(file, index);
              const currentCategory =
                editingFiles[index]?.category ||
                fileWithEdits.analysis?.category;
              const smartFolder = findSmartFolderForCategory(currentCategory);
              const isSelected = selectedFiles.has(index);
              const stateDisplay = getFileStateDisplay(
                file.path,
                !!file.analysis,
              );
              const destination = smartFolder
                ? smartFolder.path || `Documents/${smartFolder.name}`
                : 'No matching folder';
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
          {isOrganizing ? (
            <OrganizeProgress
              isOrganizing={isOrganizing}
              batchProgress={batchProgress}
              preview={organizePreview}
            />
          ) : (
            <Button
              onClick={handleOrganizeFiles}
              variant="success"
              className="text-lg px-21 py-13"
              disabled={unprocessedFiles.filter((f) => f.analysis).length === 0}
            >
              ✨ Organize Files Now
            </Button>
          )}
        </Collapsible>
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
