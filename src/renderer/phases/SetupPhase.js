import React, { useState, useEffect } from "react";
import { usePhase } from "../contexts/PhaseContext";
import useConfirmDialog from "../hooks/useConfirmDialog";
import { useToast } from "../components/Toast";
import { SmartFolderSkeleton } from "../components/LoadingSkeleton";
const { PHASES } = require("../../shared/constants");

function SetupPhase() {
  const { actions, phaseData } = usePhase();
  const { showConfirm, ConfirmDialog } = useConfirmDialog();
  const { toasts, addToast, removeToast, showSuccess, showError, showWarning, showInfo } = useToast();
  const [smartFolders, setSmartFolders] = useState([]);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderPath, setNewFolderPath] = useState('');
  const [newFolderDescription, setNewFolderDescription] = useState('');
  const [editingFolder, setEditingFolder] = useState(null);
  const [defaultLocation, setDefaultLocation] = useState('Documents');
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [isEditingFolder, setIsEditingFolder] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDeletingFolder, setIsDeletingFolder] = useState(null);
  const [isCreatingAllFolders, setIsCreatingAllFolders] = useState(false);


  useEffect(() => {
    const initializeSetup = async () => {
      setIsLoading(true);
      try {
        await Promise.all([
          loadSmartFolders(),
          loadDefaultLocation()
        ]);
      } catch (error) {
        console.error('Failed to initialize setup:', error);
        showError('Failed to load setup data');
      } finally {
        setIsLoading(false);
      }
    };
    
    initializeSetup();
  }, []);

  // Handle ESC key for canceling edit mode
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && editingFolder) {
        setEditingFolder(null);
        setIsEditingFolder(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [editingFolder]);

  const loadDefaultLocation = async () => {
    try {
      const settings = await window.electronAPI.settings.get();
      if (settings?.defaultSmartFolderLocation) {
        setDefaultLocation(settings.defaultSmartFolderLocation);
      } else {
        // If no explicit default is configured, fall back to the OS Documents directory
        const documentsPath = await window.electronAPI.files.getDocumentsPath();
        if (documentsPath) {
          setDefaultLocation(documentsPath);
        }
      }
    } catch (error) {
      console.error('Failed to load default location:', error);
    }
  };

  const loadSmartFolders = async () => {
    try {
      const folders = await window.electronAPI.smartFolders.get();
      setSmartFolders(folders || []);
      actions.setPhaseData('smartFolders', folders || []);
      
      // Update all phase data that depends on smart folders
      await propagateSmartFolderChanges(folders || []);
      
      // Only show notification if this isn't the initial load
      if (folders && folders.length > 0 && smartFolders.length > 0) {
        showInfo('Smart folders updated. Files may need re-analysis to match new folder structure.', 7000);
      }
    } catch (error) {
      console.error('Failed to load smart folders:', error);
      showError('Failed to load smart folders');
    }
  };

  // Propagate smart folder changes to other phases
  const propagateSmartFolderChanges = async (folders) => {
    try {
      // Update phase data for all phases that use smart folders
      actions.setPhaseData('smartFolders', folders);
      
      // Notify other components about smart folder changes
      window.dispatchEvent(new CustomEvent('smartFoldersUpdated', { 
        detail: { folders } 
      }));
    } catch (error) {
      console.error('Failed to propagate smart folder changes:', error);
    }
  };

  const handleAddFolder = async () => {
    if (!newFolderName.trim()) {
      showWarning('Please enter a folder name');
      return;
    }
    
    setIsAddingFolder(true);
    try {
      let targetPath;
      
      if (newFolderPath.trim()) {
        // User provided a specific path
        targetPath = newFolderPath.trim();
      } else {
        // Use default location - resolve it to full path if needed
        let resolvedDefaultLocation = defaultLocation;
        
        // If defaultLocation is just "Documents" or relative, resolve to full path
        if (!/^[A-Za-z]:[\\/]/.test(defaultLocation) && !defaultLocation.startsWith('/')) {
          try {
            const documentsPath = await window.electronAPI.files.getDocumentsPath();
            if (documentsPath) {
              resolvedDefaultLocation = documentsPath;
            }
          } catch (error) {
            console.warn('Failed to resolve documents path, using defaultLocation as-is');
          }
        }
        
        targetPath = `${resolvedDefaultLocation}/${newFolderName.trim()}`;
      }
      
      // If the target path is still relative, resolve using Documents path
      if (!/^[A-Za-z]:[\\/]/.test(targetPath) && !targetPath.startsWith('/')) {
        try {
          const documentsPath = await window.electronAPI.files.getDocumentsPath();
          if (documentsPath) {
            targetPath = `${documentsPath}/${targetPath}`;
          }
        } catch (error) {
          console.warn('Failed to resolve documents path, continuing with provided path');
        }
      }
      
      // Normalize path separators (convert backslashes to forward slashes)
      targetPath = targetPath.replace(/\\\\/g, '/').replace(/\\/g, '/');
      
      // Enhanced client-side validation
      const illegalChars = /[<>:"|?*\x00-\x1f]/g;
      if (illegalChars.test(newFolderName)) {
        showError('Folder name contains invalid characters. Please avoid: < > : " | ? *');
        return;
      }
      
      // Check if folder already exists in configuration
      const existingFolder = smartFolders.find((f) => 
        f.name.toLowerCase() === newFolderName.trim().toLowerCase() ||
        (f.path && f.path.toLowerCase() === targetPath.toLowerCase())
      );
      
      if (existingFolder) {
        showWarning(`A smart folder with name "${existingFolder.name}" or path "${existingFolder.path}" already exists`);
        return;
      }
      
      // Validate write permissions for parent directory (optional client-side check)
      const parentPath = targetPath.substring(0, targetPath.lastIndexOf('/') || targetPath.lastIndexOf('\\'));
      try {
        if (parentPath) {
          const parentStats = await window.electronAPI.files.getStats(parentPath);
          if (!parentStats || !parentStats.isDirectory) {
            showError(`Parent directory "${parentPath}" does not exist or is not accessible`);
            return;
          }
        }
      } catch (error) {
        showWarning('Cannot verify parent directory permissions. Folder creation may fail.');
      }
      
      const newFolder = {
        name: newFolderName.trim(),
        path: targetPath,
        description: newFolderDescription.trim() || `Smart folder for ${newFolderName.trim()}`,
        isDefault: false
      };
      
      const result = await window.electronAPI.smartFolders.add(newFolder);
      
      if (result.success) {
        if (result.directoryCreated) {
          showSuccess(`✅ Added smart folder and created directory: ${newFolder.name}`);
        } else if (result.directoryExisted) {
          showSuccess(`✅ Added smart folder: ${newFolder.name} (directory already exists)`);
        } else {
          showSuccess(`✅ Added smart folder: ${newFolder.name}`);
        }
        
        if (result.llmEnhanced) {
          showInfo('🤖 Smart folder enhanced with AI suggestions', 5000);
        }
        
        showInfo('💡 Tip: You can reanalyze files to see how they fit with your new smart folder', 5000);
        
        await loadSmartFolders();
        setNewFolderName('');
        setNewFolderPath('');
        setNewFolderDescription('');
      } else {
        showError(`❌ Failed to add folder: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to add smart folder:', error);
      showError('Failed to add smart folder');
    } finally {
      setIsAddingFolder(false);
    }
  };

  const handleEditFolder = (folder) => {
    setEditingFolder({ ...folder });
    setIsEditingFolder(true);
  };

  const handleSaveEdit = async () => {
    if (!editingFolder.name.trim()) {
      showWarning('Folder name cannot be empty');
      return;
    }

    setIsSavingEdit(true);
    try {
      const result = await window.electronAPI.smartFolders.edit(editingFolder.id, editingFolder);
      
      if (result.success) {
        showSuccess(`✅ Updated folder: ${editingFolder.name}`);
        showInfo('💡 Tip: You can reanalyze files to see how they fit with updated smart folders', 5000);
        await loadSmartFolders();
        setEditingFolder(null);
      } else {
        showError(`❌ Failed to update folder: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to update folder:', error);
      showError('Failed to update folder');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingFolder(null);
    setIsEditingFolder(false);
  };

  const handleDeleteFolder = async (folderId) => {
    const folder = smartFolders.find((f) => f.id === folderId);
    if (!folder) return;

    const confirmDelete = await showConfirm({
      title: 'Delete Smart Folder',
      message: 'Are you sure you want to remove this smart folder? This will also delete the physical directory and any files inside it.',
      confirmText: 'Delete Folder & Directory',
      cancelText: 'Cancel',
      variant: 'danger',
      fileName: folder.name
    });
    
    if (!confirmDelete) return;

    setIsDeletingFolder(folderId);
    try {
      const result = await window.electronAPI.smartFolders.delete(folderId);
      
      if (result.success) {
        if (result.deletedFolder) {
          showSuccess(`✅ Removed smart folder: ${result.deletedFolder.name}`);
        } else {
          showSuccess('✅ Removed smart folder');
        }
        await loadSmartFolders();
      } else {
        showError(`❌ Failed to delete folder: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to delete folder:', error);
      showError('❌ Failed to delete folder');
    } finally {
      setIsDeletingFolder(null);
    }
  };

  const deleteFolderFromFileSystem = async (folderPath) => {
    try {
      // This would need to be implemented as an IPC call
      // For now, return a placeholder response
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const handleCreateAllFolders = async () => {
    if (smartFolders.length === 0) {
      showWarning('No smart folders to create');
      return;
    }

    setIsCreatingAllFolders(true);
    try {
      let createdCount = 0;
      let existedCount = 0;
      let errorCount = 0;

      for (const folder of smartFolders) {
        try {
          // Check if directory already exists
          const stats = await window.electronAPI.files.getStats(folder.path);
          if (stats && stats.isDirectory) {
            existedCount++;
          } else {
            // Create directory
            await window.electronAPI.files.createFolder(folder.path);
            createdCount++;
          }
        } catch (error) {
          console.error(`Failed to create folder ${folder.path}:`, error);
          errorCount++;
        }
      }

      if (createdCount > 0) {
        showSuccess(`✅ Created ${createdCount} smart folder directories`);
      }
      if (existedCount > 0) {
        showInfo(`📁 ${existedCount} directories already existed`);
      }
      if (errorCount > 0) {
        showWarning(`⚠️ Failed to create ${errorCount} directories`);
      }
      if (createdCount === 0 && errorCount === 0) {
        showInfo('📁 All smart folder directories already exist');
      }
    } catch (error) {
      console.error('Failed to create folders:', error);
      showError('Failed to create folder directories');
    } finally {
      setIsCreatingAllFolders(false);
    }
  };

  const handleBrowseFolder = async () => {
    try {
      const folderPath = await window.electronAPI.files.selectDirectory();
      if (folderPath) {
        setNewFolderPath(folderPath);
      }
    } catch (error) {
      console.error('Failed to browse folder:', error);
      showError('Failed to browse folder');
    }
  };

  const handleOpenFolder = async (folderPath) => {
    try {
      const result = await window.electronAPI.files.openFolder(folderPath);
      if (result?.success) {
        showSuccess(`📁 Opened folder: ${folderPath.split(/[/\\]/).pop()}`);
      } else {
        showError(`Failed to open folder: ${result?.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to open folder:', error);
      showError('Failed to open folder');
    }
  };

  const createSingleFolder = async (folderPath) => {
    try {
      // Use the files.createFolder API to create the directory
      await window.electronAPI.files.createFolder(folderPath);
      return { success: true };
    } catch (error) {
      console.error('Failed to create folder:', error);
      return { success: false, error: error.message };
    }
  };

  const canProceed = () => {
    if (smartFolders.length === 0) {
      showWarning('Please add at least one smart folder before continuing');
      return false;
    }
    return true;
  };

  return (
    <div className="w-full animate-slide-up">
      <div className="mb-fib-21 text-center">
        <h2 className="heading-primary">
          ⚙️ Configure{' '}
          <span className="text-gradient inline-block">
            Smart Folders
          </span>
        </h2>
        <p className="text-lg text-system-gray-600 leading-relaxed">
          Set up smart folders where StratoSort will organize your files based on AI analysis.
        </p>
      </div>

      {/* Current Smart Folders */}
      <div className="card-enhanced mb-fib-21" role="region" aria-labelledby="current-folders-heading">
        <div className="flex justify-between items-center mb-fib-13">
          <h3 id="current-folders-heading" className="heading-tertiary">📁 Current Smart Folders</h3>
          {smartFolders.length > 0 && (
            <button
              onClick={handleCreateAllFolders}
              className="btn-primary text-sm"
              title="Create all smart folder directories"
            >
              📁 Create All Folders
            </button>
          )}
        </div>
        {isLoading ? (
          <SmartFolderSkeleton count={3} />
        ) : smartFolders.length === 0 ? (
          <div className="text-center py-fib-21">
            <div className="text-4xl mb-fib-8 opacity-50" role="img" aria-label="empty folder">📂</div>
            <p className="text-muted italic">No smart folders configured yet.</p>
          </div>
        ) : (
          <div className="space-y-fib-8">
            {smartFolders.map((folder, index) => (
              <div key={folder.id} className="p-fib-13 bg-surface-secondary rounded-lg hover:bg-surface-tertiary transition-colors duration-200 animate-slide-in-right" style={{ animationDelay: `${index * 0.1}s` }}>
                {editingFolder?.id === folder.id ? (
                  // Edit mode
                  <div className="space-y-fib-8" role="form" aria-label="Edit smart folder">
                    <div className="flex gap-fib-8">
                      <input
                        type="text"
                        value={editingFolder.name}
                        onChange={(e) => setEditingFolder({ ...editingFolder, name: e.target.value })}
                        className="form-input-enhanced flex-1"
                        placeholder="Folder name"
                        aria-label="Folder name"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit();
                          if (e.key === 'Escape') handleCancelEdit();
                        }}
                      />
                      <input
                        type="text"
                        value={editingFolder.path}
                        onChange={(e) => setEditingFolder({ ...editingFolder, path: e.target.value })}
                        className="form-input-enhanced flex-1"
                        placeholder="Folder path"
                        aria-label="Folder path"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit();
                          if (e.key === 'Escape') handleCancelEdit();
                        }}
                      />
                    </div>
                    <div>
                      <textarea
                        value={editingFolder.description || ''}
                        onChange={(e) => setEditingFolder({ ...editingFolder, description: e.target.value })}
                        className="form-input-enhanced w-full"
                        placeholder="Describe what types of files should go in this folder (helps AI make better decisions)"
                        rows="2"
                        aria-label="Folder description"
                      />
                    </div>
                    <div className="flex gap-fib-5">
                      <button
                        onClick={handleSaveEdit}
                        disabled={isSavingEdit}
                        className="btn-primary text-sm"
                      >
                        {isSavingEdit ? (
                          <>
                            <div className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full inline-block mr-2"></div>
                            Saving...
                          </>
                        ) : (
                          <>💾 Save</>
                        )}
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        disabled={isSavingEdit}
                        className="btn-secondary text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  // View mode
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-system-gray-700 mb-fib-2">{folder.name}</div>
                      <div className="text-small text-muted mb-fib-3">{folder.path}</div>
                      {folder.description && (
                        <div className="text-sm text-system-gray-600 bg-stratosort-blue/5 p-fib-8 rounded-lg border-l-4 border-stratosort-blue/30">
                          <div className="font-medium text-stratosort-blue mb-fib-2">📝 AI Context:</div>
                          <div className="italic">{folder.description}</div>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-fib-8">
                      <div className="flex items-center gap-fib-5">
                        <div className="status-dot success"></div>
                        <span className="text-sm font-medium text-stratosort-success">Active</span>
                      </div>
                      {folder.physicallyExists ? (
                        <div className="flex items-center gap-fib-3 px-fib-8 py-fib-3 bg-green-50 rounded-lg border border-green-200">
                          <span className="text-xs text-green-600">📁</span>
                          <span className="text-xs font-medium text-green-700">Directory Ready</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-fib-3 px-fib-8 py-fib-3 bg-amber-50 rounded-lg border border-amber-200">
                          <span className="text-xs text-amber-600">📂</span>
                          <span className="text-xs font-medium text-amber-700">Needs Creation</span>
                        </div>
                      )}
                      <div className="flex gap-fib-5">
                        {!folder.physicallyExists && (
                          <button
                            onClick={async () => {
                              const result = await createSingleFolder(folder.path);
                              if (result.success) {
                                addNotification(`✅ Created directory: ${folder.name}`, 'success');
                                await loadSmartFolders();
                              } else {
                                addNotification(`❌ Failed to create directory: ${result.error}`, 'error');
                              }
                            }}
                            className="p-fib-5 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                            title="Create this folder directory"
                            aria-label={`Create directory for ${folder.name}`}
                          >
                            <span role="img" aria-label="create folder">📁</span>
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenFolder(folder.path)}
                          className={`p-fib-5 rounded transition-colors ${
                            folder.physicallyExists 
                              ? 'text-green-600 hover:bg-green-100' 
                              : 'text-gray-400 cursor-not-allowed'
                          }`}
                          title={folder.physicallyExists ? 'Open folder in file explorer' : "Folder doesn't exist yet"}
                          aria-label={`Open folder ${folder.name}`}
                          disabled={!folder.physicallyExists}
                        >
                          <span role="img" aria-label="open folder">📂</span>
                        </button>
                        <button
                          onClick={() => handleEditFolder(folder)}
                          className="p-fib-5 text-stratosort-blue hover:bg-stratosort-blue/10 rounded transition-colors"
                          title="Edit folder"
                          aria-label={`Edit folder ${folder.name}`}
                        >
                          <span role="img" aria-label="edit">✏️</span>
                        </button>
                        <button
                          onClick={() => handleDeleteFolder(folder.id)}
                          disabled={isDeletingFolder === folder.id}
                          className="p-fib-5 text-system-red-600 hover:bg-system-red-100 rounded transition-colors disabled:opacity-50"
                          title={folder.physicallyExists ? 'Remove from config and delete directory' : 'Remove from config only'}
                          aria-label={`Delete folder ${folder.name}`}
                        >
                          {isDeletingFolder === folder.id ? (
                            <div className="animate-spin w-3 h-3 border-2 border-system-red-600 border-t-transparent rounded-full"></div>
                          ) : (
                            <span role="img" aria-label="delete">🗑️</span>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add New Folder */}
      <div className="card-enhanced mb-fib-21" role="region" aria-labelledby="add-folder-heading">
        <h3 id="add-folder-heading" className="text-lg font-semibold mb-fib-13">Add New Smart Folder</h3>
        <div className="space-y-fib-13">
          <div>
            <label className="block text-sm font-medium text-system-gray-700 mb-fib-5">
              Folder Name
            </label>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newFolderName.trim() && !isAddingFolder) {
                  handleAddFolder();
                }
              }}
              placeholder="e.g., Documents, Photos, Projects"
              className="form-input-enhanced w-full"
              aria-describedby="folder-name-help"
            />
            <div id="folder-name-help" className="text-xs text-system-gray-500 mt-fib-3">
              Enter a descriptive name for your smart folder. Press Enter to add the folder.
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-system-gray-700 mb-fib-5">
              Target Path (optional)
            </label>
            <div className="flex gap-fib-8">
              <input
                type="text"
                value={newFolderPath}
                onChange={(e) => setNewFolderPath(e.target.value)}
                placeholder="e.g., Documents/Work, Pictures/Family"
                className="form-input-enhanced flex-1"
              />
              <button
                onClick={handleBrowseFolder}
                className="btn-secondary"
                title="Browse for folder"
              >
                📁 Browse
              </button>
            </div>
            <p className="text-xs text-system-gray-500 mt-fib-3">
              Leave empty to use default {defaultLocation}/{newFolderName || 'FolderName'}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-system-gray-700 mb-fib-5">
              Description <span className="text-stratosort-blue font-semibold">(Important for AI)</span>
            </label>
            <textarea
              value={newFolderDescription}
              onChange={(e) => setNewFolderDescription(e.target.value)}
              placeholder="Describe what types of files should go in this folder. E.g., 'Work documents, contracts, and business correspondence' or 'Family photos from vacations and special events'"
              className="form-input-enhanced w-full"
              rows="3"
              aria-describedby="description-help"
            />
            <div id="description-help" className="text-xs text-system-gray-500 mt-fib-3">
              💡 <strong>Tip:</strong> The more specific your description, the better the AI will organize your files. Include file types, content themes, and use cases.
            </div>
          </div>
          <button 
            onClick={handleAddFolder}
            disabled={!newFolderName.trim() || isAddingFolder}
            className="btn-primary"
            aria-label={isAddingFolder ? 'Adding folder...' : 'Add smart folder'}
          >
            {isAddingFolder ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full inline-block mr-2"></div>
                Adding...
              </>
            ) : (
              <>➕ Add Smart Folder</>
            )}
          </button>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button 
          onClick={() => actions.advancePhase(PHASES.WELCOME)}
          className="btn-secondary"
        >
          ← Back to Welcome
        </button>
        <button 
          onClick={() => {
            if (smartFolders.length === 0) {
              showWarning('Please add at least one smart folder before continuing');
            } else {
              actions.advancePhase(PHASES.DISCOVER);
            }
          }}
          className="btn-primary"
        >
          Continue to File Discovery →
        </button>
      </div>

      {/* Confirmation Dialog */}
      <ConfirmDialog />
      
      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onRemoveToast={removeToast} />

      {isCreatingAllFolders && <LoadingSkeleton message="Creating folders..." />}


    </div>
  );
}

export default SetupPhase;
