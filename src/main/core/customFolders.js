const { app } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { logger } = require('../../shared/logger');

function getCustomFoldersPath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'custom-folders.json');
}

function normalizeFolderPaths(folders) {
  try {
    return (Array.isArray(folders) ? folders : []).map((f) => {
      const normalized = { ...f };
      if (
        normalized &&
        typeof normalized.path === 'string' &&
        normalized.path.trim()
      ) {
        normalized.path = path.normalize(normalized.path);
      }
      return normalized;
    });
  } catch {
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
    await fs.writeFile(filePath, JSON.stringify(toSave, null, 2));
    logger.info('[STORAGE] Saved custom folders to:', filePath);
  } catch (error) {
    logger.error('[ERROR] Failed to save custom folders:', error);
  }
}

module.exports = {
  getCustomFoldersPath,
  loadCustomFolders,
  saveCustomFolders,
};
