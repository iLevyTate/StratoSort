const { app } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { logger } = require('../../shared/logger');

function getCustomFoldersPath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'custom-folders.json');
}

async function loadCustomFolders() {
  try {
    const filePath = getCustomFoldersPath();
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    logger.info('[STARTUP] No saved custom folders found, using defaults');
    return [
      {
        id: 'financial',
        name: 'Financial Documents',
        description: 'Invoices, receipts, tax documents, financial statements, bank records',
        path: null,
        isDefault: true
      },
      {
        id: 'projects',
        name: 'Project Files',
        description: 'Project documentation, proposals, specifications, project plans',
        path: null,
        isDefault: true
      }
    ];
  }
}

async function saveCustomFolders(folders) {
  try {
    const filePath = getCustomFoldersPath();
    await fs.writeFile(filePath, JSON.stringify(folders, null, 2));
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


