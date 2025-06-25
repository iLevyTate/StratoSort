import React, { useState, useEffect } from 'react';

import AnalysisHistoryModal from '../components/AnalysisHistoryModal';
import LoadingSkeleton, { SmartFolderSkeleton } from '../components/LoadingSkeleton';
import { useNotification } from '../contexts/NotificationContext';
import { usePhase } from '../contexts/PhaseContext';
import useConfirmDialog from '../hooks/useConfirmDialog';
import useDragAndDrop from '../hooks/useDragAndDrop';
import { useFileAnalysis } from '../hooks/useFileAnalysis';
import PhaseLayout from '../layout/PhaseLayout';
import { useErrorHandler } from '../utils/ErrorHandling';
import Button from '../components/Button';

const { PHASES } = require('../../shared/constants');

function DiscoverPhase() {
  const { actions, phaseData } = usePhase();
  const { addNotification, showSuccess, showError, showWarning, showInfo } = useNotification();
  const { handleError, handleWarning } = useErrorHandler();
  const { showConfirm, ConfirmDialog } = useConfirmDialog();
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [showAnalysisHistory, setShowAnalysisHistory] = useState(false);
  const [analysisStats, setAnalysisStats] = useState(null);
  const [discoveryMethod, setDiscoveryMethod] = useState('drag'); // 'drag', 'files', 'folder', 'scan'
  
  // Use extracted hooks
  const fileAnalysis = useFileAnalysis();
  
  // Destructure for cleaner code
  const {
    analysisResults,
    isAnalyzing,
    currentAnalysisFile,
    analysisProgress,
    analyzeFiles,
    getFileStateDisplay,
    loadPersistedAnalysis
  } = fileAnalysis;

  // Load persisted data from previous sessions
  useEffect(() => {
    const loadPersistedData = () => {
      const persistedResults = phaseData.analysisResults || [];
      const persistedFiles = phaseData.selectedFiles || [];
      
      if (persistedResults.length > 0) {
        setSelectedFiles(persistedFiles);
        loadPersistedAnalysis(phaseData);
      }
    };
    
    loadPersistedData();
  }, [phaseData, loadPersistedAnalysis]);

  // Drag and drop handling
  const { isDragActive, DropZone } = useDragAndDrop({
    onFilesDropped: handleFileDrop,
    acceptedTypes: ['.pdf', '.doc', '.docx', '.txt', '.md', '.jpg', '.png', '.gif']
  });

  // Handle file drop
  async function handleFileDrop(files) {
    try {
      const fileList = Array.from(files).map((file) => ({
        name: file.name,
        path: file.path || file.webkitRelativePath || file.name,
        size: file.size,
        type: getFileType(file.name.split('.').pop()?.toLowerCase())
      }));

      setSelectedFiles((prev) => {
        const existingPaths = new Set(prev.map((f) => f.path));
        const newFiles = fileList.filter((f) => !existingPaths.has(f.path));
        return [...prev, ...newFiles];
      });

      if (fileList.length > 0) {
        showSuccess('Files added successfully');
      }
    } catch (error) {
      handleError(error, 'File Drop');
    }
  }

  // Get file type helper
  const getFileType = (extension) => {
    const documentTypes = ['pdf', 'doc', 'docx', 'txt', 'md', 'rtf'];
    const imageTypes = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
    const audioTypes = ['mp3', 'wav', 'flac', 'ogg', 'aac', 'm4a'];
    
    if (documentTypes.includes(extension)) return 'document';
    if (imageTypes.includes(extension)) return 'image';
    if (audioTypes.includes(extension)) return 'audio';
    return 'unknown';
  };

  // Handle file selection
  const handleFileSelection = async () => {
    try {
      showInfo('Opening file browser...');
      const result = await window.electronAPI.files.select();
      
      if (result && result.success && result.files && result.files.length > 0) {
        const newFiles = result.files.map((filePath) => {
          const pathString = typeof filePath === 'string' ? filePath : filePath.path || '';
          return {
            name: pathString.split(/[/\\]/).pop(),
            path: pathString,
            size: 0,
            type: getFileType(pathString.split('.').pop()?.toLowerCase())
          };
        });

        setSelectedFiles((prev) => {
          const existingPaths = new Set(prev.map((f) => f.path));
          const uniqueFiles = newFiles.filter((f) => !existingPaths.has(f.path));
          return [...prev, ...uniqueFiles];
        });

        showSuccess(`Added ${newFiles.length} files`);
      } else if (result && !result.success) {
        if (result.error) {
          console.error('File selection error:', result.error);
          handleError(new Error(result.error), 'File Selection');
        } else {
          console.log('File selection cancelled by user');
        }
      } else {
        console.log('File selection cancelled or no files selected');
      }
    } catch (error) {
      console.error('File selection error:', error);
      handleError(error, 'File Selection');
      showError('Failed to open file browser - please try again');
    }
  };

  // Handle folder selection
  const handleFolderSelection = async () => {
    try {
      showInfo('Opening folder browser...');
      const result = await window.electronAPI.files.selectDirectory();
      
      if (result && result.folder) {
        setIsScanning(true);
        showInfo('Scanning folder for files...');
        const scanResult = await window.electronAPI.smartFolders.scanStructure(result.folder);
        
        if (scanResult && scanResult.files && scanResult.files.length > 0) {
          const newFiles = scanResult.files.map((filePath) => {
            const pathString = typeof filePath === 'string' ? filePath : filePath.path || '';
            return {
              name: pathString.split(/[/\\]/).pop(),
              path: pathString,
              size: 0,
              type: getFileType(pathString.split('.').pop()?.toLowerCase())
            };
          });

          setSelectedFiles((prev) => {
            const existingPaths = new Set(prev.map((f) => f.path));
            const uniqueFiles = newFiles.filter((f) => !existingPaths.has(f.path));
            return [...prev, ...uniqueFiles];
          });

          showSuccess(`Scanned folder: ${newFiles.length} files found`);
        } else if (scanResult && scanResult.files && scanResult.files.length === 0) {
          showWarning('No supported files found in selected folder');
        } else {
          console.error('Folder scan result:', scanResult);
          showError('Folder scan failed - no files returned');
        }
      } else {
        console.log('Folder selection cancelled by user');
      }
    } catch (error) {
      console.error('Folder selection error:', error);
      handleError(error, 'Folder Selection');
      showError('Failed to scan folder - please try again');
    } finally {
      setIsScanning(false);
    }
  };

  // Handle system scan
  const handleSystemScan = async () => {
    try {
      setIsScanning(true);
      showInfo('Starting system scan...');
      
      const result = await window.electronAPI.system.scanCommonDirectories();
      
      if (result && result.files && result.files.length > 0) {
        const newFiles = result.files.map((filePath) => {
          const pathString = typeof filePath === 'string' ? filePath : filePath.path || '';
          return {
            name: pathString.split(/[/\\]/).pop(),
            path: pathString,
            size: 0,
            type: getFileType(pathString.split('.').pop()?.toLowerCase())
          };
        });

        setSelectedFiles(newFiles);
        showSuccess(`System scan complete: ${newFiles.length} files found`);
      } else if (result && result.files && result.files.length === 0) {
        showWarning('No supported files found in common directories');
      } else {
        console.error('System scan result:', result);
        showError('System scan failed - no files returned');
      }
    } catch (error) {
      console.error('System scan error:', error);
      handleError(error, 'System Scan');
      showError('System scan failed - please try again');
    } finally {
      setIsScanning(false);
    }
  };

  // Start analysis
  const handleStartAnalysis = async () => {
    if (selectedFiles.length === 0) {
      handleWarning('Please add files first', 'Analysis', true);
      return;
    }

    try {
      await analyzeFiles(selectedFiles);
      showSuccess('Analysis completed successfully');
    } catch (error) {
      handleError(error, 'Analysis');
    }
  };

  // Handle proceed
  const handleProceed = () => {
    console.log('DiscoverPhase proceeding with data:', {
      selectedFiles: selectedFiles.length,
      analysisResults: analysisResults.length,
      analysisResultsStructure: analysisResults[0]
    });
    actions.setPhaseData('selectedFiles', selectedFiles);
    actions.setPhaseData('analysisResults', analysisResults);
    actions.advancePhase(PHASES.ORGANIZE);
  };

  const canProceed = () => {
    const readyFiles = selectedFiles.filter(file => 
      analysisResults.find(r => r.file.path === file.path)
    );
    return selectedFiles.length > 0 && readyFiles.length > 0;
  };

  const getStatusCounts = () => {
    const total = selectedFiles.length;
    const analyzed = selectedFiles.filter(file => 
      analysisResults.find(r => r.file.path === file.path)
    ).length;
    const analyzing = isAnalyzing ? 1 : 0;
    const pending = total - analyzed - analyzing;
    
    return { total, analyzed, analyzing, pending };
  };

  const renderDiscoveryMethod = () => {
    switch (discoveryMethod) {
      case 'drag':
        return (
          <DropZone 
            className={`card-glass-medium p-8 transition-all duration-300 interactive-lift ${
              isDragActive ? 'ring-2 ring-blue-500 scale-105 bg-blue-500/10' : ''
            }`}
            showInstructions={false}
          >
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-primary rounded-xl flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">📁</span>
              </div>
              <h3 className="text-heading font-bold text-on-glass mb-3">
                {isDragActive ? 'Drop Files Here!' : 'Drag & Drop Files'}
              </h3>
              <p className="text-body text-readable max-w-md mx-auto mb-4">
                Drag files or folders directly into this area for instant processing
              </p>
              <div className="flex justify-center gap-2">
                <span className="px-3 py-1 bg-blue-500/20 text-blue-300 text-sm rounded-full">PDF</span>
                <span className="px-3 py-1 bg-green-500/20 text-green-300 text-sm rounded-full">DOCX</span>
                <span className="px-3 py-1 bg-purple-500/20 text-purple-300 text-sm rounded-full">Images</span>
              </div>
            </div>
          </DropZone>
        );

      case 'files':
        return (
          <div className="card-glass-medium p-8 text-center interactive-lift">
            <div className="w-16 h-16 bg-gradient-accent rounded-xl flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">🗂️</span>
            </div>
            <h3 className="text-heading font-bold text-on-glass mb-3">Select Individual Files</h3>
            <p className="text-body text-readable max-w-md mx-auto mb-6">
              Browse and select specific files from your system for analysis
            </p>
            <button
              onClick={handleFileSelection}
              className="btn-glass-primary px-6 py-3 text-base font-bold interactive-scale"
            >
              📁 Browse Files
            </button>
          </div>
        );

      case 'folder':
        return (
          <div className="card-glass-medium p-8 text-center interactive-lift">
            <div className="w-16 h-16 bg-gradient-secondary rounded-xl flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">📂</span>
            </div>
            <h3 className="text-heading font-bold text-on-glass mb-3">Select Entire Folder</h3>
            <p className="text-body text-readable max-w-md mx-auto mb-6">
              Choose a folder to automatically discover all supported files within it
            </p>
            <button
              onClick={handleFolderSelection}
              disabled={isScanning}
              className="btn-glass-primary px-6 py-3 text-base font-bold interactive-scale"
            >
              {isScanning ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full inline-block mr-2"></div>
                  Scanning...
                </>
              ) : (
                '📁 Browse Folders'
              )}
            </button>
          </div>
        );

      case 'scan':
        return (
          <div className="card-glass-medium p-8 text-center interactive-lift">
            <div className="w-16 h-16 bg-gradient-primary rounded-xl flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">🔍</span>
            </div>
            <h3 className="text-heading font-bold text-on-glass mb-3">Intelligent System Scan</h3>
            <p className="text-body text-readable max-w-md mx-auto mb-4">
              Automatically discover files in common directories like Documents, Downloads, and Desktop
            </p>
            <div className="flex justify-center gap-2 mb-6">
              <span className="px-3 py-1 bg-white/20 text-on-glass text-sm rounded-full">📄 Documents</span>
              <span className="px-3 py-1 bg-white/20 text-on-glass text-sm rounded-full">📥 Downloads</span>
              <span className="px-3 py-1 bg-white/20 text-on-glass text-sm rounded-full">🖥️ Desktop</span>
            </div>
            <button
              onClick={handleSystemScan}
              disabled={isScanning}
              className="btn-glass-hero px-6 py-3 text-base font-bold interactive-scale"
            >
              {isScanning ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full inline-block mr-2"></div>
                  Scanning System...
                </>
              ) : (
                '🚀 Start System Scan'
              )}
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  const renderFileList = () => {
    if (selectedFiles.length === 0) return null;

    const { total, analyzed, analyzing, pending } = getStatusCounts();

    return (
      <div className="card-glass-medium p-6 interactive-lift">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-accent rounded-lg flex items-center justify-center">
              <span className="text-lg">📄</span>
            </div>
            <div>
              <h3 className="text-title font-bold text-on-glass">
                Selected Files
              </h3>
              <p className="text-caption text-readable-light">{total} files selected</p>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <span className="px-3 py-1 bg-green-500/20 text-green-300 text-sm rounded-full font-medium">
              {analyzed} Ready
            </span>
            {analyzing > 0 && (
              <span className="px-3 py-1 bg-blue-500/20 text-blue-300 text-sm rounded-full font-medium">
                {analyzing} Analyzing
              </span>
            )}
            {pending > 0 && (
              <span className="px-3 py-1 bg-yellow-500/20 text-yellow-300 text-sm rounded-full font-medium">
                {pending} Pending
              </span>
            )}
          </div>
        </div>
          
        <div className="space-y-3 max-h-64 overflow-y-auto modern-scrollbar pr-2">
          {selectedFiles.slice(0, 5).map((file, index) => {
            const isAnalyzed = analysisResults.find((r) => r.file.path === file.path);
            const isCurrentlyAnalyzing = isAnalyzing && (currentAnalysisFile === file.path || currentAnalysisFile === file.name);
            
            return (
              <div key={index} className="card-glass-subtle p-4 interactive-glow">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 bg-gradient-primary rounded-lg flex items-center justify-center flex-shrink-0">
                      <span className="text-lg">
                        {file.type === 'document' ? '📄' : 
                          file.type === 'image' ? '🖼️' : 
                            file.type === 'audio' ? '🎵' : '📁'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-body font-semibold text-on-glass truncate">{file.name}</p>
                      <p className="text-caption text-readable-light capitalize">{file.type || 'unknown'} file</p>
                    </div>
                  </div>
                        
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isAnalyzed && (
                      <span className="px-2 py-1 bg-green-500/20 text-green-300 text-xs rounded-full font-medium">
                        ✓ Ready
                      </span>
                    )}
                    {isCurrentlyAnalyzing && (
                      <span className="px-2 py-1 bg-blue-500/20 text-blue-300 text-xs rounded-full font-medium">
                        <div className="animate-spin w-3 h-3 border border-blue-300 border-t-transparent rounded-full inline-block mr-1"></div>
                        Analyzing
                      </span>
                    )}
                    {!isAnalyzed && !isCurrentlyAnalyzing && (
                      <span className="px-2 py-1 bg-yellow-500/20 text-yellow-300 text-xs rounded-full font-medium">
                        Pending
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          
          {selectedFiles.length > 5 && (
            <div className="text-center py-4">
              <p className="text-readable-light text-sm">
                ... and <span className="font-bold">{selectedFiles.length - 5}</span> more files
              </p>
            </div>
          )}
        </div>

        {selectedFiles.length > 0 && (
          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <button 
              onClick={handleStartAnalysis}
              disabled={isAnalyzing}
              className="btn-glass-primary flex-1 px-6 py-3 text-base font-bold interactive-scale"
            >
              {isAnalyzing ? (
                <>
                  <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full inline-block mr-2"></div>
                  Analyzing ({analysisProgress?.current || 0}/{analysisProgress?.total || 0})
                </>
              ) : (
                '🤖 Start AI Analysis'
              )}
            </button>
            <button 
              onClick={() => setSelectedFiles([])}
              className="btn-glass-subtle px-6 py-3 text-base interactive-glow"
            >
              🗑️ Clear All
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <PhaseLayout>
      <div className="h-full flex flex-col p-2 sm:p-4">
        {/* Enhanced Header Section */}
        <div className="flex-shrink-0 py-3 px-4 text-center">
          <div className="max-w-4xl mx-auto">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-gradient-primary rounded-xl mb-3 shadow-lg">
              <span className="text-xl">🔍</span>
            </div>
            <h1 className="text-title font-bold text-on-glass mb-2">
              Discover Files
            </h1>
            <p className="text-caption text-readable max-w-2xl mx-auto">
              Choose how you'd like to add files for AI-powered organization
            </p>
          </div>
        </div>

        {/* Discovery Method Selector */}
        <div className="flex-shrink-0 px-4 pb-4">
          <div className="max-w-4xl mx-auto">
            <div className="card-glass-medium p-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { id: 'drag', label: 'Drag & Drop', icon: '📁' },
                  { id: 'files', label: 'Select Files', icon: '🗂️' },
                  { id: 'folder', label: 'Select Folder', icon: '📂' },
                  { id: 'scan', label: 'System Scan', icon: '🔍' }
                ].map((method) => (
                  <button
                    key={method.id}
                    onClick={() => setDiscoveryMethod(method.id)}
                    className={`p-3 rounded-lg font-medium transition-all text-sm text-center interactive-scale ${
                      discoveryMethod === method.id
                        ? 'bg-gradient-primary text-white shadow-lg'
                        : 'card-glass-subtle text-readable hover:bg-white/10'
                    }`}
                  >
                    <div className="text-xl mb-2">{method.icon}</div>
                    <div className="font-bold">{method.label}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Area - Responsive with controlled scrolling */}
        <div className="flex-1 px-4 min-h-0 overflow-y-auto">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Discovery Interface */}
            <div className="space-y-4">
              <div className="text-center">
                <h2 className="text-title font-bold text-on-glass mb-2">Active Discovery Method</h2>
                <p className="text-caption text-readable-light">Use the selected method to add files</p>
              </div>
              {renderDiscoveryMethod()}
            </div>

            {/* File List */}
            {selectedFiles.length > 0 && (
              <div className="space-y-4">
                <div className="text-center">
                  <h2 className="text-title font-bold text-on-glass mb-2">Selected Files</h2>
                  <p className="text-caption text-readable-light">{selectedFiles.length} files ready for analysis</p>
                </div>
                {renderFileList()}
              </div>
            )}
          </div>
        </div>

        {/* Phase Navigation - Fixed at bottom */}
        <div className="flex-shrink-0 px-4 py-6">
          <div className="max-w-4xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
              <button
                onClick={() => actions.advancePhase(PHASES.SETUP)}
                className="btn-glass-subtle px-6 py-3 interactive-glow w-full sm:w-auto"
              >
                ← Back to Setup
              </button>
              <button
                onClick={handleProceed}
                disabled={!canProceed()}
                className="btn-glass-primary px-6 py-3 interactive-scale w-full sm:w-auto"
              >
                Continue to Organization →
              </button>
            </div>
          </div>
        </div>

        {/* Modals */}
        {showAnalysisHistory && (
          <AnalysisHistoryModal
            isOpen={showAnalysisHistory}
            onClose={() => setShowAnalysisHistory(false)}
            analysisResults={analysisResults}
          />
        )}
        <ConfirmDialog />
      </div>
    </PhaseLayout>
  );
}

export default DiscoverPhase;
