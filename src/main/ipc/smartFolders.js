const path = require('path');
const fs = require('fs').promises;
const { Ollama } = require('ollama');

function registerSmartFoldersIpc({ ipcMain, IPC_CHANNELS, logger, getCustomFolders, setCustomFolders, saveCustomFolders, buildOllamaOptions, getOllamaModel, scanDirectory }) {
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

  // Smart folder matching using embeddings/LLM with fallbacks
  ipcMain.handle(IPC_CHANNELS.SMART_FOLDERS.MATCH, async (event, payload) => {
    try {
      const { text, smartFolders = [] } = payload || {};
      if (!text || !Array.isArray(smartFolders) || smartFolders.length === 0) {
        return { success: false, error: 'Invalid input for SMART_FOLDERS.MATCH' };
      }

      try {
        const ollama = new Ollama({ host: 'http://127.0.0.1:11434' });
        const perfOptions = await buildOllamaOptions('embeddings');
        const queryEmbedding = await ollama.embeddings({ model: 'mxbai-embed-large', prompt: text, options: { ...perfOptions } });
        const scored = [];
        for (const folder of smartFolders) {
          const folderText = [folder.name, folder.description].filter(Boolean).join(' - ');
          const folderEmbedding = await ollama.embeddings({ model: 'mxbai-embed-large', prompt: folderText, options: { ...perfOptions } });
          const score = cosineSimilarity(queryEmbedding.embedding, folderEmbedding.embedding);
          scored.push({ folder, score });
        }
        scored.sort((a, b) => b.score - a.score);
        const best = scored[0];
        return { success: true, folder: best.folder, score: best.score, method: 'embeddings' };
      } catch (e) {
        try {
          const ollama = new Ollama({ host: 'http://127.0.0.1:11434' });
          const genPerf = await buildOllamaOptions('text');
          const prompt = `You are ranking folders for organizing a file. Given this description:\n"""${text}"""\nFolders:\n${smartFolders.map((f, i) => `${i + 1}. ${f.name} - ${f.description || ''}`).join('\n')}\nReturn JSON: { "index": <1-based best folder index>, "reason": "..." }`;
          const resp = await ollama.generate({ model: getOllamaModel() || 'llama3.2:latest', prompt, format: 'json', options: { ...genPerf, temperature: 0.1, num_predict: 200 } });
          const parsed = JSON.parse(resp.response);
          const idx = Math.max(1, Math.min(smartFolders.length, parseInt(parsed.index, 10)));
          return { success: true, folder: smartFolders[idx - 1], reason: parsed.reason, method: 'llm' };
        } catch (llmErr) {
          const scored = smartFolders.map(f => {
            const textLower = text.toLowerCase();
            const hay = [f.name, f.description].filter(Boolean).join(' ').toLowerCase();
            let score = 0; textLower.split(/\W+/).forEach(w => { if (w && hay.includes(w)) score += 1; });
            return { folder: f, score };
          }).sort((a, b) => b.score - a.score);
          return { success: true, folder: scored[0]?.folder || smartFolders[0], method: 'fallback' };
        }
      }
    } catch (error) {
      logger.error('[SMART_FOLDERS.MATCH] Failed:', error);
      return { success: false, error: error.message };
    }
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

  // Scan folder structure
  ipcMain.handle(IPC_CHANNELS.SMART_FOLDERS.SCAN_STRUCTURE, async (event, rootPath) => {
    try {
      logger.info('[FOLDER-SCAN] Scanning folder structure:', rootPath);
      // Reuse existing scanner (shallow aggregation is done in renderer today)
      const items = await scanDirectory(rootPath);
      // Flatten file-like items with basic filtering similar to prior inline implementation
      const flatten = (nodes) => {
        const out = [];
        for (const n of nodes) {
          if (n.type === 'file') out.push({ name: n.name, path: n.path, type: 'file', size: n.size });
          if (Array.isArray(n.children)) out.push(...flatten(n.children));
        }
        return out;
      };
      const files = flatten(items);
      logger.info('[FOLDER-SCAN] Found', files.length, 'supported files');
      return { success: true, files };
    } catch (error) {
      logger.error('[FOLDER-SCAN] Error scanning folder structure:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = registerSmartFoldersIpc;

// Local utility
function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}


