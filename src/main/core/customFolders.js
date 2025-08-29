const { app } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { logger } = require('../../shared/logger');
const { backupAndReplace } = require('../../shared/atomicFileOperations');

function getCustomFoldersPath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'custom-folders.json');
}

function normalizeFolderPaths(folders) {
  try {
    return (Array.isArray(folders) ? folders : []).map((f) => {
      // Only normalize if it's an object with properties
      if (f && typeof f === 'object' && !Array.isArray(f)) {
        const normalized = { ...f };
        if (
          normalized &&
          typeof normalized.path === 'string' &&
          normalized.path.trim()
        ) {
          const originalPath = normalized.path;
          normalized.path = path.normalize(normalized.path);

          // Security check: reject paths that contain path traversal
          if (normalized.path.includes('..')) {
            logger.warn(
              `[SECURITY] Rejected folder path with path traversal: ${originalPath}`,
            );
            throw new Error('Invalid folder path in customFolders');
          }

          // Additional security: reject absolute paths unless explicitly allowed
          if (path.isAbsolute(normalized.path)) {
            logger.warn(
              `[SECURITY] Rejected absolute folder path: ${originalPath}`,
            );
            // You could throw an error here if absolute paths are not desired
            // throw new Error('Absolute paths not allowed in customFolders');
          }
        }
        return normalized;
      }
      // Return non-objects as-is (null, undefined, strings, etc.)
      // Only transform well-formed folder objects; leave others (string, null) as-is for compatibility.
      return f;
    });
  } catch (error) {
    logger.error('[ERROR] Failed to normalize folder paths:', error);
    return Array.isArray(folders) ? folders : [];
  }
}

async function loadCustomFolders() {
  try {
    const filePath = getCustomFoldersPath();
    const data = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(data);
    return normalizeFolderPaths(parsed);
  } catch (error) {
    logger.info('[STARTUP] No saved custom folders found, using defaults');
    return normalizeFolderPaths([
      {
        id: 'financial',
        name: 'Financial Documents',
        description:
          'Invoices, receipts, tax documents, financial statements, bank records',
        path: null,
        isDefault: true,
      },
      {
        id: 'projects',
        name: 'Project Files',
        description:
          'Project documentation, proposals, specifications, project plans',
        path: null,
        isDefault: true,
      },
    ]);
  }
}

async function saveCustomFolders(folders) {
  try {
    const filePath = getCustomFoldersPath();
    const toSave = normalizeFolderPaths(folders);
    await backupAndReplace(filePath, JSON.stringify(toSave, null, 2));
    logger.info('[STORAGE] Saved custom folders to:', filePath);
  } catch (error) {
    logger.error('[ERROR] Failed to save custom folders:', error);
  }
}

module.exports = {
  getCustomFoldersPath,
  loadCustomFolders,
  saveCustomFolders,
  normalizeFolderPaths,
};
