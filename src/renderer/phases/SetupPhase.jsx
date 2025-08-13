import React, { useEffect, useState } from 'react';
import { PHASES } from '../../shared/constants';
import { usePhase } from '../contexts/PhaseContext';
import { useNotification } from '../contexts/NotificationContext';
import { useConfirmDialog } from '../hooks';
import { Collapsible, Button, Input, Textarea } from '../components/ui';
import LoadingSkeleton, { SmartFolderSkeleton } from '../components/LoadingSkeleton';
import { SmartFolderItem } from '../components/setup';

function SetupPhase() {
  const { actions, phaseData } = usePhase();
  const { showConfirm, ConfirmDialog } = useConfirmDialog();
  const { showSuccess, showError, showWarning, showInfo, addNotification } = useNotification();

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
        await Promise.all([loadSmartFolders(), loadDefaultLocation()]);
      } catch (error) {
        console.error('Failed to initialize setup:', error);
        showError('Failed to load setup data');
      } finally {
        setIsLoading(false);
      }
    };
    initializeSetup();
  }, []);

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
      if (folders && folders.length > 0 && smartFolders.length > 0) {
        showInfo('Smart folders updated. Files may need re-analysis to match new folder structure.', 7000);
      }
    } catch (error) {
      console.error('Failed to load smart folders:', error);
      showError('Failed to load smart folders');
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
        targetPath = newFolderPath.trim();
      } else {
        let resolvedDefaultLocation = defaultLocation;
        if (!/^[A-Za-z]:[\\/]/.test(resolvedDefaultLocation) && !resolvedDefaultLocation.startsWith('/')) {
          try {
            const documentsPath = await window.electronAPI.files.getDocumentsPath();
            if (documentsPath) {
              resolvedDefaultLocation = documentsPath;
            }
          } catch {}
        }
        targetPath = `${resolvedDefaultLocation}/${newFolderName.trim()}`;
      }
      if (!/^[A-Za-z]:[\\/]/.test(targetPath) && !targetPath.startsWith('/')) {
        try {
          const documentsPath = await window.electronAPI.files.getDocumentsPath();
          if (documentsPath) {
            targetPath = `${documentsPath}/${targetPath}`;
          }
        } catch {}
      }

      const illegalChars = /[<>:"|?*\x00-\x1f]/g;
      if (illegalChars.test(newFolderName)) {
        showError('Folder name contains invalid characters. Please avoid: < > : " | ? *');
        return;
      }

      const existingFolder = smartFolders.find(f => 
        f.name.toLowerCase() === newFolderName.trim().toLowerCase() ||
        (f.path && f.path.toLowerCase() === targetPath.toLowerCase())
      );
      if (existingFolder) {
        showWarning(`A smart folder with name "${existingFolder.name}" or path "${existingFolder.path}" already exists`);
        return;
      }

      const parentPath = targetPath.substring(0, targetPath.lastIndexOf('/') || targetPath.lastIndexOf('\\'));
      try {
        if (parentPath) {
          const parentStats = await window.electronAPI.files.getStats(parentPath);
          if (!parentStats || !parentStats.isDirectory) {
            showError(`Parent directory "${parentPath}" does not exist or is not accessible`);
            return;
          }
        }
      } catch {
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
    const folder = smartFolders.find(f => f.id === folderId);
    if (!folder) return;
    const confirmDelete = await showConfirm({
      title: 'Delete Smart Folder',
      message: 'Are you sure you want to remove this smart folder from StratoSort? This will not delete the physical directory or its files.',
      confirmText: 'Remove Folder',
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
          const stats = await window.electronAPI.files.getStats(folder.path);
          if (stats && stats.isDirectory) {
            existedCount++;
          } else {
            await window.electronAPI.files.createFolder(folder.path);
            createdCount++;
          }
        } catch {
          errorCount++;
        }
      }
      if (createdCount > 0) showSuccess(`✅ Created ${createdCount} smart folder directories`);
      if (existedCount > 0) showInfo(`📁 ${existedCount} directories already existed`);
      if (errorCount > 0) showWarning(`⚠️ Failed to create ${errorCount} directories`);
      if (createdCount === 0 && errorCount === 0) showInfo('📁 All smart folder directories already exist');
    } catch (error) {
      console.error('Failed to create folders:', error);
      showError('Failed to create folder directories');
    } finally {
      setIsCreatingAllFolders(false);
    }
  };

  const handleBrowseFolder = async () => {
    try {
      const res = await window.electronAPI.files.selectDirectory();
      if (res?.success && res.folder) {
        setNewFolderPath(res.folder);
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
        showSuccess(`📁 Opened folder: ${folderPath.split(/[\\/]/).pop()}`);
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
      await window.electronAPI.files.createFolder(folderPath);
      return { success: true };
    } catch (error) {
      console.error('Failed to create folder:', error);
      return { success: false, error: error.message };
    }
  };

  return (
    <div className="w-full animate-slide-up">
      <div className="mb-fib-21 text-center">
        <h2 className="heading-primary">
          ⚙️ Configure <span className="text-gradient inline-block">Smart Folders</span>
        </h2>
        <p className="text-lg text-system-gray-600 leading-relaxed">
          Set up smart folders where StratoSort will organize your files based on AI analysis.
        </p>
        <div className="flex items-center justify-center gap-fib-8 mt-fib-8">
          <button
            className="text-xs text-system-gray-500 hover:text-system-gray-700 underline"
            onClick={() => {
              try {
                const keys = ['setup-current-folders','setup-add-folder'];
                keys.forEach(k => window.localStorage.setItem(`collapsible:${k}`, 'true'));
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
                const keys = ['setup-current-folders','setup-add-folder'];
                keys.forEach(k => window.localStorage.setItem(`collapsible:${k}`, 'false'));
                window.dispatchEvent(new Event('storage'));
              } catch {}
            }}
          >
            Collapse all
          </button>
        </div>
      </div>

      <Collapsible
        title={<span>📁 Current Smart Folders</span>}
        actions={smartFolders.length > 0 ? (
          <Button onClick={handleCreateAllFolders} variant="primary" className="text-sm" title="Create all smart folder directories">📁 Create All Folders</Button>
        ) : null}
        defaultOpen
        persistKey="setup-current-folders"
      >
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
              <SmartFolderItem
                key={folder.id}
                folder={folder}
                index={index}
                editingFolder={editingFolder}
                setEditingFolder={setEditingFolder}
                isSavingEdit={isSavingEdit}
                isDeleting={isDeletingFolder === folder.id}
                onSaveEdit={handleSaveEdit}
                onCancelEdit={handleCancelEdit}
                onEditStart={handleEditFolder}
                onDeleteFolder={handleDeleteFolder}
                onCreateDirectory={createSingleFolder}
                onOpenFolder={handleOpenFolder}
                addNotification={addNotification}
              />
            ))}
          </div>
        )}
      </Collapsible>

      <Collapsible title="Add New Smart Folder" defaultOpen={false} persistKey="setup-add-folder">
        <div className="space-y-fib-13">
          <div>
            <label className="block text-sm font-medium text-system-gray-700 mb-fib-5">Folder Name</label>
            <Input type="text" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && newFolderName.trim() && !isAddingFolder) { handleAddFolder(); } }} placeholder="e.g., Documents, Photos, Projects" className="w-full" aria-describedby="folder-name-help" />
            <div id="folder-name-help" className="text-xs text-system-gray-500 mt-fib-3">Enter a descriptive name for your smart folder. Press Enter to add the folder.</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-system-gray-700 mb-fib-5">Target Path (optional)</label>
            <div className="flex gap-fib-8">
              <Input type="text" value={newFolderPath} onChange={(e) => setNewFolderPath(e.target.value)} placeholder="e.g., Documents/Work, Pictures/Family" className="flex-1" />
              <Button onClick={handleBrowseFolder} variant="secondary" title="Browse for folder">📁 Browse</Button>
            </div>
            <p className="text-xs text-system-gray-500 mt-fib-3">Leave empty to use default {defaultLocation}/{newFolderName || 'FolderName'}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-system-gray-700 mb-fib-5">Description <span className="text-stratosort-blue font-semibold">(Important for AI)</span></label>
            <Textarea value={newFolderDescription} onChange={(e) => setNewFolderDescription(e.target.value)} placeholder="Describe what types of files should go in this folder. E.g., 'Work documents, contracts, and business correspondence' or 'Family photos from vacations and special events'" className="w-full" rows={3} aria-describedby="description-help" />
            <div id="description-help" className="text-xs text-system-gray-500 mt-fib-3">💡 <strong>Tip:</strong> The more specific your description, the better the AI will organize your files. Include file types, content themes, and use cases.</div>
          </div>
          <Button onClick={handleAddFolder} disabled={!newFolderName.trim() || isAddingFolder} variant="primary" aria-label={isAddingFolder ? 'Adding folder...' : 'Add smart folder'}>
            {isAddingFolder ? (<><div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full inline-block mr-2"></div>Adding...</>) : (<>➕ Add Smart Folder</>)}
          </Button>
        </div>
      </Collapsible>

      <div className="flex justify-between">
        <Button onClick={() => actions.advancePhase(PHASES.WELCOME)} variant="secondary">← Back to Welcome</Button>
        <Button onClick={() => { if (smartFolders.length === 0) { showWarning('Please add at least one smart folder before continuing'); } else { actions.advancePhase(PHASES.DISCOVER); } }} variant="primary">Continue to File Discovery →</Button>
      </div>

      <ConfirmDialog />
      {isCreatingAllFolders && <LoadingSkeleton message="Creating folders..." />}
    </div>
  );
}

export default SetupPhase;


