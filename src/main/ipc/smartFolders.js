const path = require('path');
const fs = require('fs').promises;

function registerSmartFoldersIpc({ ipcMain, IPC_CHANNELS, logger, getCustomFolders, setCustomFolders, saveCustomFolders }) {
  ipcMain.handle(IPC_CHANNELS.SMART_FOLDERS.GET, async () => {
    const customFolders = getCustomFolders();
    logger.info('[SMART-FOLDERS] Getting Smart Folders for UI:', customFolders.length);
    const foldersWithStatus = await Promise.all(
      customFolders.map(async (folder) => {
        try { const stats = await fs.stat(folder.path); return { ...folder, physicallyExists: stats.isDirectory() }; }
        catch { return { ...folder, physicallyExists: false }; }
      })
    );
    return foldersWithStatus;
  });

  ipcMain.handle(IPC_CHANNELS.SMART_FOLDERS.GET_CUSTOM, async () => {
    const customFolders = getCustomFolders();
    logger.info('[SMART-FOLDERS] Getting Custom Folders for UI:', customFolders.length);
    return customFolders;
  });

  ipcMain.handle(IPC_CHANNELS.SMART_FOLDERS.SAVE, async (event, folders) => {
    try {
      if (!Array.isArray(folders)) return { success: false, error: 'Folders must be an array', errorCode: 'INVALID_INPUT' };
      const originalFolders = [...getCustomFolders()];
      try {
        setCustomFolders(folders);
        await saveCustomFolders(folders);
        logger.info('[SMART-FOLDERS] Saved Smart Folders:', folders.length);
        return { success: true, folders: getCustomFolders() };
      } catch (saveError) {
        setCustomFolders(originalFolders);
        throw saveError;
      }
    } catch (error) {
      logger.error('[ERROR] Failed to save smart folders:', error);
      return { success: false, error: error.message, errorCode: 'SAVE_FAILED' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SMART_FOLDERS.UPDATE_CUSTOM, async (event, folders) => {
    try {
      if (!Array.isArray(folders)) return { success: false, error: 'Folders must be an array', errorCode: 'INVALID_INPUT' };
      const originalFolders = [...getCustomFolders()];
      try {
        setCustomFolders(folders);
        await saveCustomFolders(folders);
        logger.info('[SMART-FOLDERS] Updated Custom Folders:', folders.length);
        return { success: true, folders: getCustomFolders() };
      } catch (saveError) {
        setCustomFolders(originalFolders);
        throw saveError;
      }
    } catch (error) {
      logger.error('[ERROR] Failed to update custom folders:', error);
      return { success: false, error: error.message, errorCode: 'UPDATE_FAILED' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SMART_FOLDERS.EDIT, async (event, folderId, updatedFolder) => {
    try {
      if (!folderId || typeof folderId !== 'string') return { success: false, error: 'Valid folder ID is required', errorCode: 'INVALID_FOLDER_ID' };
      if (!updatedFolder || typeof updatedFolder !== 'object') return { success: false, error: 'Valid folder data is required', errorCode: 'INVALID_FOLDER_DATA' };
      const customFolders = getCustomFolders();
      const folderIndex = customFolders.findIndex(f => f.id === folderId);
      if (folderIndex === -1) return { success: false, error: 'Folder not found', errorCode: 'FOLDER_NOT_FOUND' };
      if (updatedFolder.name) {
        const illegalChars = /[<>:"|?*\x00-\x1f]/g;
        if (illegalChars.test(updatedFolder.name)) {
          return { success: false, error: 'Folder name contains invalid characters. Please avoid: < > : " | ? *', errorCode: 'INVALID_FOLDER_NAME_CHARS' };
        }
        const existingFolder = customFolders.find(f => f.id !== folderId && f.name.toLowerCase() === updatedFolder.name.trim().toLowerCase());
        if (existingFolder) return { success: false, error: `A smart folder with name "${updatedFolder.name}" already exists`, errorCode: 'FOLDER_NAME_EXISTS' };
      }
      if (updatedFolder.path) {
        try {
          const normalizedPath = path.resolve(updatedFolder.path.trim());
          const parentDir = path.dirname(normalizedPath);
          const parentStats = await fs.stat(parentDir);
          if (!parentStats.isDirectory()) {
            return { success: false, error: `Parent directory "${parentDir}" is not a directory`, errorCode: 'PARENT_NOT_DIRECTORY' };
          }
          updatedFolder.path = normalizedPath;
        } catch (pathError) {
          return { success: false, error: `Invalid path: ${pathError.message}`, errorCode: 'INVALID_PATH' };
        }
      }
      const originalFolder = { ...customFolders[folderIndex] };
      if (updatedFolder.path && updatedFolder.path !== originalFolder.path) {
        try {
          const oldPath = originalFolder.path; const newPath = updatedFolder.path;
          const oldStats = await fs.stat(oldPath);
          if (!oldStats.isDirectory()) return { success: false, error: 'Original path is not a directory', errorCode: 'ORIGINAL_NOT_DIRECTORY' };
          await fs.rename(oldPath, newPath);
          logger.info(`[SMART-FOLDERS] Renamed directory "${oldPath}" -> "${newPath}"`);
        } catch (renameErr) {
          logger.error('[SMART-FOLDERS] Directory rename failed:', renameErr.message);
          return { success: false, error: 'Failed to rename directory', errorCode: 'RENAME_FAILED', details: renameErr.message };
        }
      }
      try {
        customFolders[folderIndex] = { ...customFolders[folderIndex], ...updatedFolder, updatedAt: new Date().toISOString() };
        setCustomFolders(customFolders);
        await saveCustomFolders(customFolders);
        logger.info('[SMART-FOLDERS] Edited Smart Folder:', folderId);
        return { success: true, folder: customFolders[folderIndex], message: 'Smart folder updated successfully' };
      } catch (saveError) {
        customFolders[folderIndex] = originalFolder;
        throw saveError;
      }
    } catch (error) {
      logger.error('[ERROR] Failed to edit smart folder:', error);
      return { success: false, error: error.message, errorCode: 'EDIT_FAILED' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SMART_FOLDERS.DELETE, async (event, folderId) => {
    try {
      if (!folderId || typeof folderId !== 'string') return { success: false, error: 'Valid folder ID is required', errorCode: 'INVALID_FOLDER_ID' };
      const customFolders = getCustomFolders();
      const folderIndex = customFolders.findIndex(f => f.id === folderId);
      if (folderIndex === -1) return { success: false, error: 'Folder not found', errorCode: 'FOLDER_NOT_FOUND' };
      const originalFolders = [...customFolders]; const deletedFolder = customFolders[folderIndex];
      try {
        const updated = customFolders.filter(f => f.id !== folderId);
        setCustomFolders(updated);
        await saveCustomFolders(updated);
        logger.info('[SMART-FOLDERS] Deleted Smart Folder:', folderId);
        let directoryRemoved = false; let removalError = null;
        try {
          if (deletedFolder.path) {
            const stats = await fs.stat(deletedFolder.path);
            if (stats.isDirectory()) {
              const contents = await fs.readdir(deletedFolder.path);
              if (contents.length === 0) { await fs.rmdir(deletedFolder.path); directoryRemoved = true; }
            }
          }
        } catch (dirErr) {
          if (dirErr.code !== 'ENOENT') { logger.warn('[SMART-FOLDERS] Directory removal failed:', dirErr.message); removalError = dirErr.message; }
        }
        return { success: true, folders: updated, deletedFolder, directoryRemoved, removalError, message: `Smart folder "${deletedFolder.name}" deleted successfully` + (directoryRemoved ? ' and its empty directory was removed.' : '') };
      } catch (saveError) {
        setCustomFolders(originalFolders);
        throw saveError;
      }
    } catch (error) {
      logger.error('[ERROR] Failed to delete smart folder:', error);
      return { success: false, error: error.message, errorCode: 'DELETE_FAILED' };
    }
  });
}

module.exports = registerSmartFoldersIpc;


