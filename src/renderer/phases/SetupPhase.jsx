import React, { useState, useEffect } from 'react';

import { SmartFolderSkeleton } from '../components/LoadingSkeleton';
import { useNotification } from '../contexts/NotificationContext';
import { usePhase } from '../contexts/PhaseContext';
import useConfirmDialog from '../hooks/useConfirmDialog';
import PhaseLayout from '../layout/PhaseLayout';
import { useToast } from '../components/Toast';

const { PHASES } = require('../../shared/constants');

// Form validation utilities
const validateConfig = (config) => {
  const errors = {};
  
  // AI Model validation
  if (!config.aiModel || config.aiModel.trim().length === 0) {
    errors.aiModel = 'AI model is required';
  } else if (config.aiModel.length > 50) {
    errors.aiModel = 'AI model name must be less than 50 characters';
  }
  
  // Host validation
  if (!config.host || config.host.trim().length === 0) {
    errors.host = 'Host URL is required';
  } else {
    try {
      new URL(config.host);
    } catch {
      errors.host = 'Please enter a valid URL (e.g., http://localhost:11434)';
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
  
  // State management
  const [smartFolders, setSmartFolders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ai'); // 'ai', 'folders', 'performance'
  
  // AI Configuration state
  const [settings, setSettings] = useState({
    selectedModel: 'gemma3:4b',
    concurrentFiles: 3,
    namingConvention: 'keep-original'
  });
  
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
  const [showAddModal, setShowAddModal] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    const initializeSetup = async () => {
      setIsLoading(true);
      try {
        const [loadedSettings, folders] = await Promise.all([
          window.electronAPI.settings.get(),
          window.electronAPI.smartFolders.get()
        ]);
        
        if (loadedSettings) {
          setSettings({
            selectedModel: loadedSettings.selectedModel || 'gemma3:4b',
            concurrentFiles: loadedSettings.concurrentFiles || 3,
            namingConvention: loadedSettings.namingConvention || 'keep-original'
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
        
        setSmartFolders(folders || []);
      } catch (error) {
        console.error('Failed to initialize setup:', error);
        showError('Failed to load setup data');
      } finally {
        setIsLoading(false);
      }
    };
    
    initializeSetup();
  }, []);

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
      showSuccess('Configuration saved successfully');
    } catch (error) {
      console.error('Failed to save configuration:', error);
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
      const folderToAdd = {
        id: Date.now().toString(),
        name: newFolder.name.trim(),
        emoji: newFolder.emoji,
        path: newFolder.path.trim() || `Documents/${newFolder.name.trim()}`,
        description: newFolder.description.trim(),
        type: 'smart'
      };
      
      const updatedFolders = [...smartFolders, folderToAdd];
      await window.electronAPI.smartFolders.save(updatedFolders);
      setSmartFolders(updatedFolders);
      setNewFolder({ name: '', emoji: '📁', path: '', description: '' });
      setShowAddModal(false);
      showSuccess('Smart folder added successfully');
    } catch (error) {
      console.error('Failed to add folder:', error);
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
        const updatedFolders = smartFolders.filter((f) => f.id !== folderId);
        await window.electronAPI.smartFolders.save(updatedFolders);
        setSmartFolders(updatedFolders);
        showSuccess('Smart folder deleted successfully');
      } catch (error) {
        console.error('Failed to delete folder:', error);
        showError('Failed to delete smart folder');
      }
    }
  };

  const canProceed = () => {
    return smartFolders.length > 0 && settings.selectedModel;
  };

  const handleProceed = () => {
    actions.advancePhase(PHASES.DISCOVER);
  };

  const renderAISettings = () => (
    <div className="glass-card p-6 space-y-6">
      <h3 className="text-on-glass text-xl font-bold mb-4">AI Configuration</h3>
      
      <div className="space-y-4">
        <div>
          <label className="block text-readable-light text-sm font-medium mb-2">
            AI Model
          </label>
          <select
            value={settings.selectedModel}
            onChange={(e) => setSettings({ ...settings, selectedModel: e.target.value })}
            className="glass-input w-full"
          >
            <option value="gemma3:4b">Gemma 3 4B (Recommended)</option>
            <option value="llama3.2:latest">Llama 3.2 Latest</option>
            <option value="llava:latest">LLaVA (Vision)</option>
          </select>
        </div>

        <div>
          <label className="block text-readable-light text-sm font-medium mb-2">
            Concurrent Files: {settings.concurrentFiles}
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
          <label className="block text-readable-light text-sm font-medium mb-2">
            Naming Convention
          </label>
          <select
            value={settings.namingConvention}
            onChange={(e) => setSettings({ ...settings, namingConvention: e.target.value })}
            className="glass-input w-full"
          >
            <option value="keep-original">Keep Original Names</option>
            <option value="descriptive">AI-Generated Names</option>
            <option value="date-prefix">Date + Original</option>
            <option value="category-prefix">Category + Original</option>
          </select>
        </div>
      </div>
    </div>
  );

  const renderSmartFolders = () => (
    <div className="glass-card space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="text-on-glass text-lg font-bold">Smart Folders</h3>
        <button
          onClick={() => setShowAddModal(true)}
          className="glass-button text-xs px-3 py-1"
        >
          + Add Folder
        </button>
      </div>
      
      <div className="space-y-2 max-h-40 overflow-y-auto glass-scroll">
        {smartFolders.map((folder) => (
          <div key={folder.id} className="glass-card p-2 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-lg">{folder.emoji}</span>
              <div>
                <h4 className="text-on-glass font-medium text-sm">{folder.name}</h4>
                <p className="text-readable-light text-xs opacity-75">{folder.path}</p>
              </div>
            </div>
            <button
              onClick={() => handleDeleteFolder(folder.id)}
              className="text-red-400 hover:text-red-300 text-xs"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
      
      {smartFolders.length === 0 && (
        <div className="text-center py-8">
          <p className="text-readable-light">No smart folders configured yet.</p>
          <p className="text-readable-light text-sm mt-2">Add your first folder to get started.</p>
        </div>
      )}
    </div>
  );

  const renderPerformanceSettings = () => (
    <div className="glass-card p-6 space-y-6">
      <h3 className="text-on-glass text-xl font-bold mb-4">Performance Settings</h3>
      
      <div className="space-y-4">
        <div>
          <label className="block text-readable-light text-sm font-medium mb-2">
            Max Concurrent Files: {performanceSettings.maxConcurrentFiles}
          </label>
          <input
            type="range"
            min="1"
            max="10"
            value={performanceSettings.maxConcurrentFiles}
            onChange={(e) => setPerformanceSettings({ ...performanceSettings, maxConcurrentFiles: parseInt(e.target.value) })}
            className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer"
          />
        </div>

        <div>
          <label className="block text-readable-light text-sm font-medium mb-2">
            Analysis Timeout (seconds): {performanceSettings.analysisTimeout / 1000}
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
        </div>

        <div>
          <label className="block text-readable-light text-sm font-medium mb-2">
            Cache Size (files): {performanceSettings.cacheSize}
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
        </div>

        <div className="space-y-3">
          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={performanceSettings.enableGpuAcceleration}
              onChange={(e) => setPerformanceSettings({ ...performanceSettings, enableGpuAcceleration: e.target.checked })}
              className="w-4 h-4 text-blue-600 bg-white/20 border-white/30 rounded focus:ring-blue-500"
            />
            <span className="text-readable-light text-sm">Enable GPU Acceleration</span>
          </label>

          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={performanceSettings.enablePreloading}
              onChange={(e) => setPerformanceSettings({ ...performanceSettings, enablePreloading: e.target.checked })}
              className="w-4 h-4 text-blue-600 bg-white/20 border-white/30 rounded focus:ring-blue-500"
            />
            <span className="text-readable-light text-sm">Enable File Preloading</span>
          </label>
        </div>
      </div>
    </div>
  );

  const renderAddFolderModal = () => {
    if (!showAddModal) return null;
    
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="glass-card-strong p-6 max-w-md w-full mx-4">
          <h3 className="text-on-glass text-lg font-bold mb-4">Add Smart Folder</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-readable-light text-sm font-medium mb-2">
                Folder Name
              </label>
              <input
                type="text"
                value={newFolder.name}
                onChange={(e) => setNewFolder({ ...newFolder, name: e.target.value })}
                className="glass-input w-full"
                placeholder="e.g., Documents, Photos, Projects"
              />
            </div>
            
            <div>
              <label className="block text-readable-light text-sm font-medium mb-2">
                Emoji
              </label>
              <input
                type="text"
                value={newFolder.emoji}
                onChange={(e) => setNewFolder({ ...newFolder, emoji: e.target.value })}
                className="glass-input w-full"
                placeholder="📁"
                maxLength="2"
              />
            </div>
            
            <div>
              <label className="block text-readable-light text-sm font-medium mb-2">
                Path (optional)
              </label>
              <input
                type="text"
                value={newFolder.path}
                onChange={(e) => setNewFolder({ ...newFolder, path: e.target.value })}
                className="glass-input w-full"
                placeholder="Leave empty to use default location"
              />
            </div>
            
            <div>
              <label className="block text-readable-light text-sm font-medium mb-2">
                Description (optional)
              </label>
              <textarea
                value={newFolder.description}
                onChange={(e) => setNewFolder({ ...newFolder, description: e.target.value })}
                className="glass-input w-full h-20 resize-none"
                placeholder="Describe what files belong in this folder"
              />
            </div>
          </div>
          
          <div className="flex space-x-3 mt-6">
            <button
              onClick={handleAddFolder}
              className="glass-button-primary flex-1"
            >
              Add Folder
            </button>
            <button
              onClick={() => setShowAddModal(false)}
              className="glass-button flex-1"
            >
              Cancel
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
      <div className="phase-content-compact animate-fade-in-up">
        {/* Header */}
        <div className="phase-header">
          <h1 className="welcome-title">Configuration</h1>
          <p className="welcome-subtitle">Customize StratoSort to match your workflow</p>
        </div>

        {/* Tab Navigation */}
        <div className="phase-tabs">
          <div className="glass-card p-2 inline-flex rounded-2xl">
            {[
              { id: 'ai', label: 'AI Settings', icon: '🤖' },
              { id: 'folders', label: 'Smart Folders', icon: '📁' },
              { id: 'performance', label: 'Performance', icon: '⚡' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-xl font-medium transition-all text-sm ${
                  activeTab === tab.id
                    ? 'glass-button-primary'
                    : 'text-readable-light hover:bg-white/10'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content - Scrollable */}
        <div className="content-compact">
          {activeTab === 'ai' && renderAISettings()}
          {activeTab === 'folders' && renderSmartFolders()}
          {activeTab === 'performance' && renderPerformanceSettings()}
        </div>

        {/* Action Buttons */}
        <div className="phase-actions">
          <div className="action-buttons">
            <button
              onClick={handleSaveConfig}
              className="action-button"
            >
              Save Configuration
            </button>
            <button
              onClick={handleProceed}
              disabled={!canProceed()}
              className="action-button-primary"
            >
              Continue to Discovery
            </button>
          </div>
        </div>

        {/* Modals */}
        {renderAddFolderModal()}
        <ConfirmDialog />
      </div>
    </PhaseLayout>
  );
}

export default SetupPhase;
