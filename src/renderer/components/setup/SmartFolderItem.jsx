import React from 'react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';

function SmartFolderItem({
  folder,
  index,
  editingFolder,
  setEditingFolder,
  isSavingEdit,
  isDeleting,
  onSaveEdit,
  onCancelEdit,
  onEditStart,
  onDeleteFolder,
  onCreateDirectory,
  onOpenFolder,
  addNotification
}) {
  const isEditing = editingFolder?.id === folder.id;

  return (
    <div className="p-fib-13 bg-surface-secondary rounded-lg hover:bg-surface-tertiary transition-colors duration-200 animate-slide-in-right" style={{ animationDelay: `${index * 0.1}s` }}>
      {isEditing ? (
        <div className="space-y-fib-8" role="form" aria-label="Edit smart folder">
          <div className="flex flex-col md:flex-row gap-fib-8">
            <Input type="text" value={editingFolder.name} onChange={(e) => setEditingFolder({ ...editingFolder, name: e.target.value })} className="flex-1" placeholder="Folder name" aria-label="Folder name" onKeyDown={(e) => { if (e.key === 'Enter') onSaveEdit(); if (e.key === 'Escape') onCancelEdit(); }} />
            <Input type="text" value={editingFolder.path} onChange={(e) => setEditingFolder({ ...editingFolder, path: e.target.value })} className="flex-1" placeholder="Folder path" aria-label="Folder path" onKeyDown={(e) => { if (e.key === 'Enter') onSaveEdit(); if (e.key === 'Escape') onCancelEdit(); }} />
          </div>
          <Textarea value={editingFolder.description || ''} onChange={(e) => setEditingFolder({ ...editingFolder, description: e.target.value })} className="w-full" placeholder="Describe what types of files should go in this folder (helps AI make better decisions)" rows={2} aria-label="Folder description" />
          <div className="flex gap-fib-5">
            <Button onClick={onSaveEdit} disabled={isSavingEdit} variant="primary" className="text-sm">{isSavingEdit ? (<><div className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full inline-block mr-2"></div>Saving...</>) : (<>💾 Save</>)}</Button>
            <Button onClick={onCancelEdit} disabled={isSavingEdit} variant="secondary" className="text-sm">Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-fib-13">
          <div className="flex-1 min-w-0">
            <div className="font-medium text-system-gray-700 mb-fib-2 break-words">{folder.name}</div>
            <div className="text-small text-muted mb-fib-3 break-all">{folder.path}</div>
            {folder.description && (
              <div className="text-sm text-system-gray-600 bg-stratosort-blue/5 p-fib-8 rounded-lg border-l-4 border-stratosort-blue/30">
                <div className="font-medium text-stratosort-blue mb-fib-2">📝 AI Context:</div>
                <div className="italic">{folder.description}</div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-fib-8 shrink-0">
            <div className="flex items-center gap-fib-5">
              <div className="status-dot success"></div>
              <span className="text-sm font-medium text-stratosort-success">Active</span>
            </div>
            <div className="flex gap-fib-5">
              {!folder.physicallyExists && (
                <Button onClick={async () => { const result = await onCreateDirectory(folder.path); if (result.success) { addNotification && addNotification(`✅ Created directory: ${folder.name}`, 'success'); } else { addNotification && addNotification(`❌ Failed to create directory: ${result.error}`, 'error'); } }} className="p-fib-5 text-blue-600 hover:bg-blue-100 rounded transition-colors" title="Create this folder directory" aria-label={`Create directory for ${folder.name}`}>
                  <span role="img" aria-label="create folder">📁</span>
                </Button>
              )}
              <Button onClick={() => onOpenFolder(folder.path)} className={`p-fib-5 rounded transition-colors ${folder.physicallyExists ? 'text-green-600 hover:bg-green-100' : 'text-gray-400 cursor-not-allowed'}`} title={folder.physicallyExists ? 'Open folder in file explorer' : "Folder doesn't exist yet"} aria-label={`Open folder ${folder.name}`} disabled={!folder.physicallyExists}>
                <span role="img" aria-label="open folder">📂</span>
              </Button>
              <Button onClick={() => onEditStart(folder)} className="p-fib-5 text-stratosort-blue hover:bg-stratosort-blue/10 rounded transition-colors" title="Edit folder" aria-label={`Edit folder ${folder.name}`}>
                <span role="img" aria-label="edit">✏️</span>
              </Button>
              <Button onClick={() => onDeleteFolder(folder.id)} disabled={isDeleting} className="p-fib-5 text-system-red-600 hover:bg-system-red-100 rounded transition-colors disabled:opacity-50" title="Remove from config" aria-label={`Delete folder ${folder.name}`}>
                {isDeleting ? (
                  <div className="animate-spin w-3 h-3 border-2 border-system-red-600 border-t-transparent rounded-full"></div>
                ) : (
                  <span role="img" aria-label="delete">🗑️</span>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SmartFolderItem;


