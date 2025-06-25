import React, { useState, useEffect } from 'react';

import { SmartFolderSkeleton } from '../components/LoadingSkeleton';
import { useNotification } from '../contexts/NotificationContext';
import { usePhase } from '../contexts/PhaseContext';
import useConfirmDialog from '../hooks/useConfirmDialog';
import PhaseLayout from '../layout/PhaseLayout';
import { useToast } from '../components/Toast';
import { useErrorHandler } from '../utils/ErrorHandling';
import Button from '../components/Button';

const { PHASES } = require('../../shared/constants');

// Form validation utilities
const validateConfig = (config) => {
  const errors = {};
  
  // AI Model validation - use correct field name
  if (!config.selectedModel || config.selectedModel.trim().length === 0) {
    errors.selectedModel = 'AI model is required';
  } else if (config.selectedModel.length > 50) {
    errors.selectedModel = 'AI model name must be less than 50 characters';
  }
  
  // Host validation - use correct field name
  if (!config.ollamaHost || config.ollamaHost.trim().length === 0) {
    errors.ollamaHost = 'Host URL is required';
  } else {
    try {
      new URL(config.ollamaHost);
    } catch {
      errors.ollamaHost = 'Please enter a valid URL (e.g., http://localhost:11434)';
    }
  }
  
  // Smart folders validation
  if (config.smartFolders && config.smartFolders.length > 0) {
    config.smartFolders.forEach((folder, index) => {
      if (!folder.name || folder.name.trim().length === 0) {
        errors[`smartFolder_${index}_name`] = 'Folder name is required';
      } else if (folder.name.length > 100) {
        errors[`smartFolder_${index}_name`] = 'Folder name must be less than 100 characters';
      }
      
      if (folder.path && folder.path.length > 500) {
        errors[`smartFolder_${index}_path`] = 'Folder path is too long';
      }
    });
  }
  
  return errors;
};

function SetupPhase() {
  const { actions, phaseData } = usePhase();
  const { showConfirm, ConfirmDialog } = useConfirmDialog();
  const { addNotification, showSuccess, showError, showWarning, showInfo } = useNotification();
  const { addToast } = useToast();
  const { handleError, handleWarning } = useErrorHandler();
  
  // State management
  const [smartFolders, setSmartFolders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ai'); // 'ai', 'folders', 'performance'
  
  // AI Configuration state
  const [settings, setSettings] = useState({
    selectedModel: 'gemma3:4b',
    concurrentFiles: 3,
    namingConvention: 'keep-original',
    ollamaHost: 'http://127.0.0.1:11434'
  });
  
  // Dynamically loaded model list
  const [availableModels, setAvailableModels] = useState([
    'gemma3:4b',
    'llama3.2:latest',
    'llava:latest'
  ]);
  
  // Performance settings
  const [performanceSettings, setPerformanceSettings] = useState({
    maxConcurrentFiles: 3,
    analysisTimeout: 30000,
    enableGpuAcceleration: true,
    cacheSize: 100,
    enablePreloading: true
  });
  
  // Folder management
  const [newFolder, setNewFolder] = useState({ name: '', emoji: '📁', path: '', description: '' });
  const [editingFolder, setEditingFolder] = useState(null);
  const [editFolderData, setEditFolderData] = useState({ name: '', emoji: '📁', path: '', description: '' });
  const [showAddModal, setShowAddModal] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    const initializeSetup = async () => {
      setIsLoading(true);
      try {
        const [loadedSettings, folders, modelsResponse] = await Promise.all([
          window.electronAPI.settings.get(),
          window.electronAPI.smartFolders.get(),
          window.electronAPI.ollama.getModels().catch(() => null)
        ]);
        
        if (loadedSettings) {
          setSettings({
            selectedModel: loadedSettings.selectedModel || 'gemma3:4b',
            concurrentFiles: loadedSettings.concurrentFiles || 3,
            namingConvention: loadedSettings.namingConvention || 'keep-original',
            ollamaHost: loadedSettings.ollamaHost || 'http://127.0.0.1:11434'
          });
          
          // Load performance settings
          setPerformanceSettings({
            maxConcurrentFiles: loadedSettings.maxConcurrentFiles || 3,
            analysisTimeout: loadedSettings.analysisTimeout || 30000,
            enableGpuAcceleration: loadedSettings.enableGpuAcceleration !== false,
            cacheSize: loadedSettings.cacheSize || 100,
            enablePreloading: loadedSettings.enablePreloading !== false
          });
        }
        
        if (folders && folders.success) {
          setSmartFolders(folders.folders || []);
        } else {
          setSmartFolders([]);
        }

        if (modelsResponse && modelsResponse.success && Array.isArray(modelsResponse.models)) {
          setAvailableModels(modelsResponse.models);
        }
      } catch (error) {
        handleError(error, 'Setup Initialization', false);
      } finally {
        setIsLoading(false);
      }
    };
    
    initializeSetup();
  }, [handleError]);

  // Enhanced validation
  const validateForm = async (configToValidate = settings) => {
    setIsValidating(true);
    const errors = validateConfig(configToValidate);
    setValidationErrors(errors);
    setIsValidating(false);
    return Object.keys(errors).length === 0;
  };

  // Real-time validation on field change
  const handleFieldChange = async (field, value) => {
    const updatedConfig = { ...settings, [field]: value };
    setSettings(updatedConfig);
    
    // Clear specific field error
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
    
    // Debounced validation for better UX
    clearTimeout(window.validationTimeout);
    window.validationTimeout = setTimeout(() => {
      validateForm(updatedConfig);
    }, 500);
  };

  const handleSaveConfig = async () => {
    try {
      setIsLoading(true);
      
      // Validate before saving
      const isValid = await validateForm();
      if (!isValid) {
        addToast('Please fix the validation errors before saving', 'error');
        return;
      }

      const configToSave = {
        ...settings,
        ...performanceSettings
      };
      
      await window.electronAPI.settings.save(configToSave);

      // Attempt to set selected Ollama model
      try {
        const setResult = await window.electronAPI.ollama.setModel(settings.selectedModel);
        if (setResult?.success) {
          showSuccess(`AI model switched to ${settings.selectedModel}`);
        } else {
          showWarning(setResult?.error || 'Model change failed');
        }
      } catch (modelError) {
        handleError(modelError, 'Model Configuration');
        showWarning('Failed to set AI model – please verify the model exists in Ollama');
      }
      showSuccess('Configuration saved successfully');
    } catch (error) {
      handleError(error, 'Configuration Save');
      showError('Failed to save configuration');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddFolder = async () => {
    if (!newFolder.name.trim()) {
      showWarning('Please enter a folder name');
      return;
    }
    
    try {
      const documentsPath = await window.electronAPI.files.getDocumentsPath();
      const folderToAdd = {
        name: newFolder.name.trim(),
        emoji: newFolder.emoji,
        path: newFolder.path.trim() || `${documentsPath}/${newFolder.name.trim()}`,
        description: newFolder.description.trim()
      };

      const { success, folder, error } = await window.electronAPI.smartFolders.add(folderToAdd);
      if (!success) {
        throw new Error(error || 'Add failed');
      }

      setSmartFolders((prev) => [...prev, folder]);
      setNewFolder({ name: '', emoji: '📁', path: '', description: '' });
      setShowAddModal(false);
      showSuccess('Smart folder added successfully');
    } catch (error) {
      handleError(error, 'Add Folder');
      showError('Failed to add smart folder');
    }
  };

  const handleDeleteFolder = async (folderId) => {
    const confirmed = await showConfirm(
      'Delete Smart Folder',
      'Are you sure you want to delete this smart folder? This action cannot be undone.'
    );
    
    if (confirmed) {
      try {
        const { success, deletedFolder, error } = await window.electronAPI.smartFolders.delete(folderId);
        if (!success) {
          throw new Error(error || 'Delete failed');
        }

        setSmartFolders((prev) => prev.filter((f) => f.id !== folderId));
        showSuccess('Smart folder deleted successfully');
      } catch (error) {
        handleError(error, 'Delete Folder');
        showError('Failed to delete smart folder');
      }
    }
  };

  const openEditModal = (folder) => {
    setEditFolderData({ name: folder.name, emoji: folder.emoji, path: folder.path, description: folder.description, id: folder.id });
    setEditingFolder(folder.id);
  };

  const handleSaveEditFolder = async () => {
    try {
      const { id, ...updatedData } = editFolderData;
      const { success, folder, error } = await window.electronAPI.smartFolders.edit(id, updatedData);
      if (!success) throw new Error(error || 'Edit failed');

      setSmartFolders((prev) => prev.map((f) => (f.id === id ? folder : f)));
      setEditingFolder(null);
      showSuccess('Smart folder updated');
    } catch (err) {
      handleError(err, 'Edit Folder');
      showError('Failed to edit smart folder');
    }
  };

  const canProceed = () => {
    return smartFolders.length > 0 && settings.selectedModel;
  };

  const handleProceed = () => {
    actions.advancePhase(PHASES.DISCOVER);
  };

  // Helper to test Ollama connection
  const testOllamaConnection = async () => {
    try {
      const res = await window.electronAPI.ollama.testConnection(settings.ollamaHost);
      if (res?.connected) {
        showSuccess('Connected to Ollama successfully');
      } else {
        showWarning(res?.error || 'Connection failed');
      }
    } catch (err) {
      handleError(err, 'Ollama Connection Test');
      showError('Connection test failed');
    }
  };

  const refreshModels = async () => {
    try {
      const modelsRes = await window.electronAPI.ollama.getModels();
      if (modelsRes?.success) {
        setAvailableModels(modelsRes.models);
        showSuccess('Model list refreshed');
      } else {
        showWarning(modelsRes?.error || 'Failed to refresh models');
      }
    } catch (err) {
      handleError(err, 'Model Refresh');
      showError('Failed to refresh models');
    }
  };

  const namingPreview = () => {
    const sample = 'Project Brief.pdf';
    const date = new Date().toISOString().split('T')[0];
    switch (settings.namingConvention) {
      case 'descriptive':
        return `market_analysis_report.pdf`;
      case 'date-prefix':
        return `${date}_${sample}`;
      case 'category-prefix':
        return `Research_${sample}`;
      default:
        return sample;
    }
  };

  // Model categorization helpers
  const getModelsByType = (type) => {
    const modelCategories = {
      text: ['llama', 'mistral', 'phi', 'gemma', 'qwen', 'neural-chat', 'orca', 'vicuna', 'alpaca'],
      vision: ['llava', 'bakllava', 'moondream', 'gemma3'],
      audio: ['whisper', 'speech', 'audio'],
      code: ['codellama', 'codegemma', 'starcoder', 'deepseek-coder']
    };

    const patterns = modelCategories[type] || [];
    return availableModels.filter(model => {
      const modelName = model.toLowerCase();
      if (type === 'text') {
        // Text models are anything that's not vision or audio
        const isVision = modelCategories.vision.some(pattern => modelName.includes(pattern.toLowerCase()));
        const isAudio = modelCategories.audio.some(pattern => modelName.includes(pattern.toLowerCase()));
        return !isVision && !isAudio;
      }
      return patterns.some(pattern => modelName.includes(pattern.toLowerCase()));
    });
  };

  const getModelTypeIndicator = (model) => {
    const modelName = model.toLowerCase();
    if (modelName.includes('llava') || modelName.includes('vision') || modelName.includes('gemma3')) {
      return '👁️';
    }
    if (modelName.includes('whisper') || modelName.includes('audio')) {
      return '🎵';
    }
    if (modelName.includes('code')) {
      return '💻';
    }
    return '📝';
  };

  const renderAISettings = () => (
    <div className="glass-card p-4 sm:p-6 space-y-4 sm:space-y-6">
      <h3 className="text-on-glass text-lg sm:text-xl font-bold mb-3 sm:mb-4">AI Configuration</h3>
      
      {/* Validation Summary */}
      {Object.keys(validationErrors).length > 0 && (
        <div className="bg-red-500/20 border border-red-400/30 rounded-lg p-3 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-red-400">⚠️</span>
            <span className="text-red-400 font-medium text-sm">Configuration Issues</span>
          </div>
          <ul className="text-red-400 text-xs space-y-1 ml-6">
            {Object.entries(validationErrors).map(([field, error]) => (
              <li key={field}>• {error}</li>
            ))}
          </ul>
        </div>
      )}
      
      <div className="space-y-3 sm:space-y-4">
        <div>
          <label className="block text-readable-light text-xs sm:text-sm font-medium mb-2">
            AI Model Selection
          </label>
          
          {/* Model Categories */}
          <div className="space-y-3">
            {/* Primary Text Model */}
            <div>
              <label className="block text-readable-light text-xs font-medium mb-1">
                📝 Text Analysis Model
              </label>
              <select
                value={settings.selectedModel}
                onChange={async (e) => {
                  const newModel = e.target.value;
                  handleFieldChange('selectedModel', newModel);
                  
                  // Immediately apply the model change
                  try {
                    const setResult = await window.electronAPI.ollama.setModel(newModel);
                    if (setResult?.success) {
                      showSuccess(`AI model switched to ${newModel}`);
                    } else {
                      showWarning(setResult?.error || 'Model change failed');
                    }
                  } catch (error) {
                    console.error('Failed to set model:', error);
                    showWarning('Failed to set AI model – please verify the model exists in Ollama');
                  }
                }}
                className={`glass-input w-full text-xs ${validationErrors.selectedModel ? 'border-red-400 bg-red-400/10' : ''}`}
              >
                {getModelsByType('text').map((model) => (
                  <option key={model} value={model}>
                    {model} {getModelTypeIndicator(model)}
                  </option>
                ))}
              </select>
              {validationErrors.selectedModel && (
                <p className="text-red-400 text-xs mt-1 px-2">
                  {validationErrors.selectedModel}
                </p>
              )}
            </div>

            {/* Vision Models (if available) */}
            {getModelsByType('vision').length > 0 && (
              <div>
                <label className="block text-readable-light text-xs font-medium mb-1">
                  👁️ Vision Analysis Model (Images)
                </label>
                <select
                  value={settings.visionModel || getModelsByType('vision')[0] || ''}
                  onChange={(e) => setSettings({ ...settings, visionModel: e.target.value })}
                  className="glass-input w-full text-xs"
                >
                  <option value="">Use text model for images</option>
                  {getModelsByType('vision').map((model) => (
                    <option key={model} value={model}>
                      {model} {getModelTypeIndicator(model)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Audio Models (if available) */}
            {getModelsByType('audio').length > 0 && (
              <div>
                <label className="block text-readable-light text-xs font-medium mb-1">
                  🎵 Audio Analysis Model
                </label>
                <select
                  value={settings.audioModel || getModelsByType('audio')[0] || ''}
                  onChange={(e) => setSettings({ ...settings, audioModel: e.target.value })}
                  className="glass-input w-full text-xs"
                >
                  <option value="">Use text model for audio</option>
                  {getModelsByType('audio').map((model) => (
                    <option key={model} value={model}>
                      {model} {getModelTypeIndicator(model)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          
          <div className="flex space-x-2 mt-2">
            <button onClick={refreshModels} className="glass-button text-xs px-2 sm:px-3 py-1">
              🔄 Refresh Models
            </button>
            <span className="text-xs text-readable-light px-2 py-1">
              {availableModels.length} models available
            </span>
          </div>
        </div>

        <div>
          <label className="block text-readable-light text-xs sm:text-sm font-medium mb-2">
            Ollama Host URL
          </label>
          <input
            type="text"
            value={settings.ollamaHost}
            onChange={(e) => handleFieldChange('ollamaHost', e.target.value)}
            className={`glass-input w-full text-sm ${validationErrors.ollamaHost ? 'border-red-400 bg-red-400/10' : ''}`}
            placeholder="http://127.0.0.1:11434"
          />
          {validationErrors.ollamaHost && (
            <p className="text-red-400 text-xs mt-1 px-2">
              {validationErrors.ollamaHost}
            </p>
          )}
          <button onClick={testOllamaConnection} className="glass-button text-xs px-2 sm:px-3 py-1 mt-2">
            🔗 Test Connection
          </button>
        </div>

        <div>
          <label className="block text-readable-light text-xs sm:text-sm font-medium mb-2">
            Concurrent Files: <span className="font-bold text-white">{settings.concurrentFiles}</span>
          </label>
          <input
            type="range"
            min="1"
            max="8"
            value={settings.concurrentFiles}
            onChange={(e) => setSettings({ ...settings, concurrentFiles: parseInt(e.target.value) })}
            className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-readable-light mt-1">
            <span>Slower</span>
            <span>Faster</span>
          </div>
        </div>

        <div>
          <label className="block text-readable-light text-xs sm:text-sm font-medium mb-2">
            Naming Convention
          </label>
          <select
            value={settings.namingConvention}
            onChange={(e) => setSettings({ ...settings, namingConvention: e.target.value })}
            className="glass-input w-full text-sm"
          >
            <option value="keep-original">Keep Original Names</option>
            <option value="descriptive">AI-Generated Names</option>
            <option value="date-prefix">Date + Original</option>
            <option value="category-prefix">Category + Original</option>
          </select>
          <p className="text-xs text-readable-light mt-1 opacity-75 p-2 bg-white/5 rounded-lg">
            Preview: <span className="font-mono text-white">{namingPreview()}</span>
          </p>
        </div>
      </div>
    </div>
  );

  const renderSmartFolders = () => (
    <div className="glass-card space-y-3 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 sm:gap-0">
        <h3 className="text-on-glass text-lg sm:text-xl font-bold">Smart Folders</h3>
        <button
          onClick={() => setShowAddModal(true)}
          className="glass-button text-xs sm:text-sm px-3 py-2 self-start sm:self-auto"
        >
          📁 Add Folder
        </button>
      </div>
      
      <div className="space-y-2 max-h-64 sm:max-h-80 overflow-y-auto glass-scroll">
        {smartFolders.map((folder) => (
          <div key={folder.id} className="glass-card p-3 sm:p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start space-x-3 flex-1 min-w-0">
                <span className="text-lg sm:text-xl flex-shrink-0">{folder.emoji}</span>
                <div className="flex-1 min-w-0">
                  <h4 className="text-on-glass font-medium text-sm sm:text-base truncate">{folder.name}</h4>
                  {folder.path && (
                    <p className="text-readable-light text-xs opacity-75 truncate">{folder.path}</p>
                  )}
                  {folder.description && (
                    <p className="text-readable-light text-xs mt-1 line-clamp-2">{folder.description}</p>
                  )}
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-1 sm:gap-2 flex-shrink-0">
                <button 
                  onClick={()=>openEditModal(folder)} 
                  className="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 rounded bg-blue-400/10 hover:bg-blue-400/20 transition-colors"
                >
                  ✏️ Edit
                </button>
                <button 
                  onClick={() => handleDeleteFolder(folder.id)} 
                  className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded bg-red-400/10 hover:bg-red-400/20 transition-colors"
                >
                  🗑️ Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {smartFolders.length === 0 && (
        <div className="text-center py-8 sm:py-12">
          <div className="text-4xl sm:text-5xl mb-3 opacity-20">📁</div>
          <p className="text-readable-light text-sm sm:text-base">No smart folders configured yet.</p>
          <p className="text-readable-light text-xs sm:text-sm mt-2 opacity-75">Add your first folder to get started.</p>
        </div>
      )}
    </div>
  );

  const renderPerformanceSettings = () => (
    <div className="glass-card p-4 sm:p-6 space-y-4 sm:space-y-6">
      <h3 className="text-on-glass text-lg sm:text-xl font-bold mb-3 sm:mb-4">Performance Settings</h3>
      
      <div className="space-y-4 sm:space-y-6">
        <div>
          <label className="block text-readable-light text-xs sm:text-sm font-medium mb-2">
            Max Concurrent Files: <span className="font-bold text-white">{performanceSettings.maxConcurrentFiles}</span>
          </label>
          <input
            type="range"
            min="1"
            max="10"
            value={performanceSettings.maxConcurrentFiles}
            onChange={(e) => setPerformanceSettings({ ...performanceSettings, maxConcurrentFiles: parseInt(e.target.value) })}
            className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-readable-light mt-1">
            <span>Conservative</span>
            <span>Aggressive</span>
          </div>
        </div>

        <div>
          <label className="block text-readable-light text-xs sm:text-sm font-medium mb-2">
            Analysis Timeout: <span className="font-bold text-white">{performanceSettings.analysisTimeout / 1000}s</span>
          </label>
          <input
            type="range"
            min="10000"
            max="120000"
            step="5000"
            value={performanceSettings.analysisTimeout}
            onChange={(e) => setPerformanceSettings({ ...performanceSettings, analysisTimeout: parseInt(e.target.value) })}
            className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-readable-light mt-1">
            <span>10s</span>
            <span>120s</span>
          </div>
        </div>

        <div>
          <label className="block text-readable-light text-xs sm:text-sm font-medium mb-2">
            Cache Size: <span className="font-bold text-white">{performanceSettings.cacheSize} files</span>
          </label>
          <input
            type="range"
            min="50"
            max="500"
            step="25"
            value={performanceSettings.cacheSize}
            onChange={(e) => setPerformanceSettings({ ...performanceSettings, cacheSize: parseInt(e.target.value) })}
            className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-readable-light mt-1">
            <span>50 files</span>
            <span>500 files</span>
          </div>
        </div>

        <div className="space-y-3 pt-2">
          <h4 className="text-readable-light text-sm font-medium">Advanced Options</h4>
          
          <label className="flex items-center space-x-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer">
            <input
              type="checkbox"
              checked={performanceSettings.enableGpuAcceleration}
              onChange={(e) => setPerformanceSettings({ ...performanceSettings, enableGpuAcceleration: e.target.checked })}
              className="w-4 h-4 text-blue-600 bg-white/20 border-white/30 rounded focus:ring-blue-500"
            />
            <div className="flex-1">
              <span className="text-readable-light text-xs sm:text-sm">⚡ Enable GPU Acceleration</span>
              <p className="text-readable-light text-xs opacity-75 mt-1">Use GPU for faster processing when available</p>
            </div>
          </label>

          <label className="flex items-center space-x-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer">
            <input
              type="checkbox"
              checked={performanceSettings.enablePreloading}
              onChange={(e) => setPerformanceSettings({ ...performanceSettings, enablePreloading: e.target.checked })}
              className="w-4 h-4 text-blue-600 bg-white/20 border-white/30 rounded focus:ring-blue-500"
            />
            <div className="flex-1">
              <span className="text-readable-light text-xs sm:text-sm">🚀 Enable File Preloading</span>
              <p className="text-readable-light text-xs opacity-75 mt-1">Preload files for faster analysis</p>
            </div>
          </label>
        </div>
      </div>
    </div>
  );

  const renderAddFolderModal = () => {
    if (!showAddModal) return null;
    
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="glass-card-strong p-4 sm:p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
          <h3 className="text-on-glass text-lg sm:text-xl font-bold mb-4">📁 Add Smart Folder</h3>
          
          <div className="space-y-3 sm:space-y-4">
            <div>
              <label className="block text-readable-light text-xs sm:text-sm font-medium mb-2">
                Folder Name *
              </label>
              <input
                type="text"
                value={newFolder.name}
                onChange={(e) => setNewFolder({ ...newFolder, name: e.target.value })}
                className={`glass-input w-full text-sm ${!newFolder.name.trim() ? 'border-yellow-400 bg-yellow-400/10' : ''}`}
                placeholder="e.g., Documents, Photos, Projects"
              />
            </div>
            
            <div>
              <label className="block text-readable-light text-xs sm:text-sm font-medium mb-2">
                Emoji
              </label>
              <input
                type="text"
                value={newFolder.emoji}
                onChange={(e) => setNewFolder({ ...newFolder, emoji: e.target.value })}
                className="glass-input w-full text-sm"
                placeholder="📁"
                maxLength="2"
              />
            </div>
            
            <div>
              <label className="block text-readable-light text-xs sm:text-sm font-medium mb-2">
                Path (optional)
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={newFolder.path}
                  onChange={(e) => setNewFolder({ ...newFolder, path: e.target.value })}
                  className="glass-input flex-1 text-sm"
                  placeholder="Leave empty to use default location"
                />
                <button
                  onClick={async ()=>{
                    const dir = await window.electronAPI.files.selectDirectory();
                    if (dir) setNewFolder({...newFolder, path: dir});
                  }}
                  className="glass-button text-xs px-3 py-2 flex-shrink-0">
                  📂 Browse
                </button>
              </div>
            </div>
            
            <div>
              <label className="block text-readable-light text-xs sm:text-sm font-medium mb-2">
                Description (optional)
              </label>
              <textarea
                value={newFolder.description}
                onChange={(e) => setNewFolder({ ...newFolder, description: e.target.value })}
                className="glass-input w-full h-16 sm:h-20 resize-none text-sm"
                placeholder="Describe what files belong in this folder"
              />
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 mt-4 sm:mt-6">
            <button
              onClick={handleAddFolder}
              className="glass-button-primary flex-1 order-2 sm:order-1"
            >
              ✅ Add Folder
            </button>
            <button
              onClick={() => setShowAddModal(false)}
              className="glass-button flex-1 order-1 sm:order-2"
            >
              ❌ Cancel
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderEditFolderModal = () => {
    if (!editingFolder) return null;
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="glass-card-strong p-4 sm:p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
          <h3 className="text-on-glass text-lg sm:text-xl font-bold mb-4">✏️ Edit Smart Folder</h3>
          <div className="space-y-3 sm:space-y-4">
            <div>
              <label className="block text-readable-light text-xs sm:text-sm font-medium mb-2">Folder Name *</label>
              <input 
                className="glass-input w-full text-sm" 
                value={editFolderData.name} 
                onChange={(e)=>setEditFolderData({...editFolderData,name:e.target.value})}
                placeholder="e.g., Documents, Photos, Projects"
              />
            </div>
            <div>
              <label className="block text-readable-light text-xs sm:text-sm font-medium mb-2">Emoji</label>
              <input 
                className="glass-input w-full text-sm" 
                maxLength="2" 
                value={editFolderData.emoji} 
                onChange={(e)=>setEditFolderData({...editFolderData,emoji:e.target.value})}
                placeholder="📁"
              />
            </div>
            <div>
              <label className="block text-readable-light text-xs sm:text-sm font-medium mb-2">Path (optional)</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input 
                  className="glass-input flex-1 text-sm" 
                  value={editFolderData.path} 
                  onChange={(e)=>setEditFolderData({...editFolderData,path:e.target.value})}
                  placeholder="Leave empty to use default location"
                />
                <button 
                  className="glass-button text-xs px-3 py-2 flex-shrink-0" 
                  onClick={async ()=>{
                  const dir = await window.electronAPI.files.selectDirectory();
                  if (dir) setEditFolderData({...editFolderData, path: dir});
                  }}
                >
                  📂 Browse
                </button>
              </div>
            </div>
            <div>
              <label className="block text-readable-light text-xs sm:text-sm font-medium mb-2">Description (optional)</label>
              <textarea 
                className="glass-input w-full h-16 sm:h-20 resize-none text-sm" 
                value={editFolderData.description} 
                onChange={(e)=>setEditFolderData({...editFolderData,description:e.target.value})}
                placeholder="Describe what files belong in this folder"
              />
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 mt-4 sm:mt-6">
            <button 
              className="glass-button-primary flex-1 order-2 sm:order-1" 
              onClick={handleSaveEditFolder}
            >
              💾 Save Changes
            </button>
            <button 
              className="glass-button flex-1 order-1 sm:order-2" 
              onClick={()=>setEditingFolder(null)}
            >
              ❌ Cancel
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <PhaseLayout>
        <div className="glass-card p-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-white/20 rounded"></div>
            <div className="h-4 bg-white/20 rounded w-3/4"></div>
            <div className="h-4 bg-white/20 rounded w-1/2"></div>
          </div>
        </div>
      </PhaseLayout>
    );
  }

  return (
    <PhaseLayout>
      <div className="h-full flex flex-col animate-fade-in-up">
        {/* Header Section - Fixed Height */}
        <div className="flex-shrink-0 text-center py-2 sm:py-3">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-black mb-2 leading-tight text-white">
            Configuration
          </h1>
          <p className="text-sm sm:text-base mb-2 max-w-xl mx-auto leading-relaxed font-medium text-white/95 px-4">
            Customize StratoSort to match your workflow
          </p>
        </div>

        {/* Tab Navigation - Fixed Height */}
        <div className="flex-shrink-0 text-center py-2">
          <div className="glass-card p-1 sm:p-2 inline-flex rounded-xl sm:rounded-2xl mx-auto">
            {[
              { id: 'ai', label: 'AI Settings', icon: '🤖' },
              { id: 'folders', label: 'Smart Folders', icon: '📁' },
              { id: 'performance', label: 'Performance', icon: '⚡' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-2 sm:px-4 py-1 sm:py-2 rounded-lg sm:rounded-xl font-medium transition-all text-xs sm:text-sm ${
                  activeTab === tab.id
                    ? 'glass-button-primary text-white'
                    : 'text-readable-light hover:bg-white/10'
                }`}
              >
                <span className="mr-1 sm:mr-2">{tab.icon}</span>
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content - Scrollable Area */}
        <div className="flex-1 overflow-y-auto px-2 sm:px-4 min-h-0">
          <div className="max-w-4xl mx-auto pb-4">
            {activeTab === 'ai' && renderAISettings()}
            {activeTab === 'folders' && renderSmartFolders()}
            {activeTab === 'performance' && renderPerformanceSettings()}
          </div>
        </div>

        {/* Configuration Status */}
        {Object.keys(validationErrors).length === 0 && smartFolders.length > 0 && settings.selectedModel && (
          <div className="flex-shrink-0 px-4">
            <div className="bg-green-500/20 border border-green-400/30 rounded-lg p-3 mx-auto max-w-md text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <span className="text-green-400">✅</span>
                <span className="text-green-400 font-medium text-sm">Configuration Complete</span>
              </div>
              <p className="text-green-400 text-xs">
                Ready to proceed with {smartFolders.length} smart folder{smartFolders.length !== 1 ? 's' : ''} and {settings.selectedModel} model
              </p>
            </div>
          </div>
        )}

        {/* Action Buttons - Fixed at bottom */}
        <div className="flex-shrink-0 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-center px-4">
            <button
              onClick={handleSaveConfig}
              disabled={isLoading || isValidating}
              className="glass-button w-full sm:w-auto min-w-[160px] sm:min-w-[180px] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? '💾 Saving...' : '💾 Save Configuration'}
            </button>
            <button
              onClick={handleProceed}
              disabled={!canProceed() || Object.keys(validationErrors).length > 0}
              className="glass-button-primary w-full sm:w-auto min-w-[160px] sm:min-w-[180px] bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              🚀 Continue to Discovery
            </button>
          </div>
        </div>

        {/* Modals */}
        {renderAddFolderModal()}
        <ConfirmDialog />
        {renderEditFolderModal()}
      </div>
    </PhaseLayout>
  );
}

export default SetupPhase;
