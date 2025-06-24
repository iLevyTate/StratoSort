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
          handleError(new Error(result.error), 'File Selection');
        }
        // If no error, user likely cancelled - don't show error
      }
    } catch (error) {
      handleError(error, 'File Selection');
    }
  };

  // Handle folder selection
  const handleFolderSelection = async () => {
    try {
      const result = await window.electronAPI.files.selectDirectory();
      
      if (result && result.folder) {
        setIsScanning(true);
        const scanResult = await window.electronAPI.smartFolders.scanStructure(result.folder);
        
        if (scanResult && scanResult.files) {
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
        }
      }
    } catch (error) {
      handleError(error, 'Folder Selection');
    } finally {
      setIsScanning(false);
    }
  };

  // Handle system scan
  const handleSystemScan = async () => {
    try {
      setIsScanning(true);
      const result = await window.electronAPI.system.scanCommonDirectories();
      
      if (result && result.files) {
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
      }
    } catch (error) {
      handleError(error, 'System Scan');
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
    actions.setPhaseData('selectedFiles', selectedFiles);
    actions.setPhaseData('analysisResults', analysisResults);
    actions.advancePhase(PHASES.ORGANIZE);
  };

  const canProceed = () => {
    return selectedFiles.length > 0 && analysisResults.length > 0;
  };

  const getStatusCounts = () => {
    const total = selectedFiles.length;
    const analyzed = analysisResults.length;
    const analyzing = isAnalyzing ? 1 : 0;
    const pending = total - analyzed - analyzing;
    
    return { total, analyzed, analyzing, pending };
  };

  const renderDiscoveryMethod = () => {
    switch (discoveryMethod) {
      case 'drag':
        return (
          <DropZone 
            className={`glass-card transition-all ${
              isDragActive ? 'glass-card-strong scale-105' : ''
            }`}
            showInstructions={false}
          >
            <div className="text-4xl mb-2">📁</div>
            <h3 className="text-on-glass text-lg font-bold mb-1">
              {isDragActive ? 'Drop files here' : 'Drag & Drop Files'}
            </h3>
            <p className="text-readable-light text-sm">
              Drag files or folders directly into this area
            </p>
          </DropZone>
        );

      case 'files':
        return (
          <div className="glass-card p-6 text-center">
            <div className="text-4xl mb-2">🗂️</div>
            <h3 className="text-on-glass text-lg font-bold mb-2">Select Files</h3>
            <button
              onClick={handleFileSelection}
              className="glass-button-primary"
            >
              Browse Files
            </button>
          </div>
        );

      case 'folder':
        return (
          <div className="glass-card p-6 text-center">
            <div className="text-4xl mb-2">📂</div>
            <h3 className="text-on-glass text-lg font-bold mb-2">Select Folder</h3>
            <button
              onClick={handleFolderSelection}
              disabled={isScanning}
              className="glass-button-primary"
            >
              {isScanning ? 'Scanning...' : 'Browse Folders'}
            </button>
          </div>
        );

      case 'scan':
        return (
          <div className="glass-card p-6 text-center">
            <div className="text-4xl mb-2">🔍</div>
            <h3 className="text-on-glass text-lg font-bold mb-2">System Scan</h3>
            <p className="text-readable-light text-sm mb-2">
              Automatically discover files in common directories
            </p>
            <button
              onClick={handleSystemScan}
              disabled={isScanning}
              className="glass-button-primary"
            >
              {isScanning ? 'Scanning...' : 'Start System Scan'}
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
      <div className="glass-card max-h-48 overflow-hidden">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-on-glass text-sm font-bold">
            Selected Files ({total})
          </h3>
          <div className="flex space-x-2">
            <span className="status-badge status-badge-success">
              {analyzed} Ready
            </span>
            {analyzing > 0 && (
              <span className="status-badge status-badge-info">
                {analyzing} Analyzing
              </span>
            )}
            {pending > 0 && (
              <span className="status-badge status-badge-warning">
                {pending} Pending
              </span>
            )}
          </div>
        </div>
          
        <div className="space-y-1 max-h-24 overflow-y-auto glass-scroll">
          {selectedFiles.slice(0, 3).map((file, index) => (
            <div key={index} className="flex items-center justify-between p-1 bg-white/10 rounded text-xs">
              <div className="flex items-center space-x-2">
                <span className="text-lg">
                  {file.type === 'document' ? '📄' : 
                    file.type === 'image' ? '🖼️' : 
                      file.type === 'audio' ? '🎵' : '📁'}
                </span>
                <div>
                  <p className="text-on-glass font-medium text-xs">{file.name}</p>
                  <p className="text-readable-light text-xs opacity-75">{file.type}</p>
                </div>
              </div>
                    
              <div className="flex items-center space-x-2">
                {analysisResults.find((r) => r.filePath === file.path) && (
                  <span className="status-badge status-badge-success text-xs">✓</span>
                )}
                {isAnalyzing && currentAnalysisFile === file.path && (
                  <span className="status-badge status-badge-info text-xs">...</span>
                )}
              </div>
            </div>
          ))}
          
          {selectedFiles.length > 3 && (
            <p className="text-readable-light text-center text-xs">
              ... and {selectedFiles.length - 3} more files
            </p>
          )}
        </div>

        {selectedFiles.length > 0 && (
          <div className="mt-4 flex space-x-3">
            <button 
              onClick={handleStartAnalysis}
              disabled={isAnalyzing}
              className="glass-button-primary flex-1"
            >
              {isAnalyzing ? `Analyzing... (${analysisProgress?.current || 0}/${analysisProgress?.total || 0})` : 'Start AI Analysis'}
            </button>
            <button 
              onClick={() => setSelectedFiles([])}
              className="glass-button"
            >
              Clear All
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <PhaseLayout>
      <div className="phase-content-compact animate-fade-in-up">
        {/* Header */}
        <div className="phase-header">
          <h1 className="welcome-title">Discover Files</h1>
          <p className="welcome-subtitle">Choose how you'd like to add files for organization</p>
        </div>
          
        {/* Discovery Method Selector */}
        <div className="phase-tabs">
          <div className="glass-card p-2 inline-flex rounded-2xl">
            {[
              { id: 'drag', label: 'Drag & Drop', icon: '📁' },
              { id: 'files', label: 'Select Files', icon: '🗂️' },
              { id: 'folder', label: 'Select Folder', icon: '📂' },
              { id: 'scan', label: 'System Scan', icon: '🔍' }
            ].map((method) => (
              <button
                key={method.id}
                onClick={() => setDiscoveryMethod(method.id)}
                className={`px-4 py-2 rounded-xl font-medium transition-all text-sm ${
                  discoveryMethod === method.id
                    ? 'glass-button-primary'
                    : 'text-readable-light hover:bg-white/10'
                }`}
              >
                <span className="mr-2">{method.icon}</span>
                {method.label}
              </button>
            ))}
          </div>
        </div>

        {/* Main Content Area - Scrollable */}
        <div className="content-compact">
          {/* Discovery Interface */}
          <div className="discovery-method-compact">
            {renderDiscoveryMethod()}
          </div>

          {/* File List */}
          <div className="file-list-compact">
            {renderFileList()}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="phase-actions">
          <div className="action-buttons">
            <button
              onClick={() => actions.advancePhase(PHASES.SETUP)}
              className="action-button"
            >
              ← Back to Setup
            </button>
            <button
              onClick={handleProceed}
              disabled={!canProceed()}
              className="action-button-primary"
            >
              Continue to Organization →
            </button>
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
