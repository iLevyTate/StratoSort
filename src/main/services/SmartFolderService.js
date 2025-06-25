const path = require('path');
const fs = require('fs').promises;
const { randomUUID } = require('crypto');
const { app } = require('electron');
const { logger } = require('../../shared/logger');

const FOLDERS_KEY = 'smartFolders';

class SmartFolderService {
  constructor() {
    this.Store = null; // will be loaded lazily (electron-store is ESM)
    this.store = null;
    this.initialized = false;
  }

  async _ensureStore() {
    if (!this.Store) {
      try {
        const { default: Store } = await import('electron-store');
        this.Store = Store;
      } catch (error) {
        logger.error('Failed to dynamically import electron-store', { component: 'SmartFolderService', error: error.message });
        throw error;
      }
    }
    if (!this.store) {
      this.store = new this.Store({
        name: 'stratosort-config',
        defaults: {
          [FOLDERS_KEY]: this._getDefaultFolders(),
        },
      });
    }
  }

  _getDefaultFolders() {
    const documentsPath = app.getPath('documents');
    return [
      {
        id: 'financial-docs-default',
        name: 'Financial Documents',
        description: 'Invoices, receipts, tax documents, financial statements.',
        path: path.join(documentsPath, 'StratoSort', 'Financial'),
        emoji: '💰',
        isDefault: true,
      },
      {
        id: 'project-files-default',
        name: 'Project Files',
        description: 'Proposals, specifications, plans, and reports.',
        path: path.join(documentsPath, 'StratoSort', 'Projects'),
        emoji: '📂',
        isDefault: true,
      },
    ];
  }

  async initialize() {
    if (this.initialized) return;

    // Ensure electron-store loaded and store instance ready
    await this._ensureStore();

    logger.info('SmartFolderService initializing...', { component: 'SmartFolderService' });
    // Ensure default paths are created if they don't exist
    const folders = this.getAll();
    for (const folder of folders) {
      try {
        await fs.mkdir(folder.path, { recursive: true });
      } catch (error) {
        logger.error(`Failed to create directory for smart folder: ${folder.path}`, {
          component: 'SmartFolderService',
          error: error.message,
        });
      }
    }
    this.initialized = true;
    logger.info('SmartFolderService initialized successfully.', { component: 'SmartFolderService' });
  }

  getAll() {
    if (!this.store) {
      throw new Error('SmartFolderService not initialized');
    }
    return this.store.get(FOLDERS_KEY);
  }

  getById(folderId) {
    const folders = this.getAll();
    return folders.find((f) => f.id === folderId);
  }

  async add(folderData) {
    await this._ensureStore();
    const { name, description, path: folderPath, emoji } = folderData;
    if (!name || !folderPath) {
      throw new Error('Folder name and path are required.');
    }

    // Normalize the path to use correct separators for the current platform
    const normalizedPath = path.resolve(folderPath);

    const folders = this.getAll();
    if (folders.some((f) => f.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`A smart folder with the name "${name}" already exists.`);
    }
    if (folders.some((f) => path.resolve(f.path) === normalizedPath)) {
      throw new Error(`A smart folder with the path "${normalizedPath}" already exists.`);
    }

    const newFolder = {
      id: randomUUID(),
      name,
      description: description || '',
      path: normalizedPath,
      emoji: emoji || '📁',
      createdAt: new Date().toISOString(),
    };

    try {
      await fs.mkdir(newFolder.path, { recursive: true });
    } catch (error) {
        logger.error(`Failed to create directory for new smart folder: ${newFolder.path}`, {
          component: 'SmartFolderService',
          error: error.message,
        });
       throw new Error(`Failed to create folder directory: ${error.message}`);
    }
    
    const updatedFolders = [...folders, newFolder];
    this.store.set(FOLDERS_KEY, updatedFolders);
    logger.info(`Smart folder "${name}" added successfully.`, { component: 'SmartFolderService' });

    return newFolder;
  }

  async edit(folderId, updatedData) {
    await this._ensureStore();
    const folders = this.getAll();
    const folderIndex = folders.findIndex((f) => f.id === folderId);

    if (folderIndex === -1) {
      throw new Error('Folder not found.');
    }

    const originalFolder = { ...folders[folderIndex] };
    const updatedFolder = { ...originalFolder, ...updatedData, updatedAt: new Date().toISOString() };
    
    // If path changed, rename physical directory
    if (updatedData.path && updatedData.path !== originalFolder.path) {
      try {
        // Normalize the new path to use correct separators
        const normalizedNewPath = path.resolve(updatedData.path);
        updatedFolder.path = normalizedNewPath;
        
        // Ensure new parent directory exists
        await fs.mkdir(path.dirname(normalizedNewPath), { recursive: true });
        // Check if original path exists before trying to rename
        const stats = await fs.stat(originalFolder.path).catch(() => null);
        if (stats) {
          await fs.rename(originalFolder.path, normalizedNewPath);
        } else {
           // If original path doesn't exist, just create the new one
           await fs.mkdir(normalizedNewPath, { recursive: true });
        }
      } catch (error) {
        logger.error(`Failed to rename smart folder directory from ${originalFolder.path} to ${updatedData.path}`, { component: 'SmartFolderService', error: error.message });
        throw new Error(`Failed to rename folder directory: ${error.message}`);
      }
    }
    
    folders[folderIndex] = updatedFolder;
    this.store.set(FOLDERS_KEY, folders);
    logger.info(`Smart folder "${updatedFolder.name}" updated successfully.`, { component: 'SmartFolderService' });
    
    return updatedFolder;
  }

  async delete(folderId, options = { cleanupDirectory: false }) {
    await this._ensureStore();
    const folders = this.getAll();
    const folderIndex = folders.findIndex((f) => f.id === folderId);

    if (folderIndex === -1) {
      throw new Error('Folder not found.');
    }

    const deletedFolder = folders[folderIndex];
    const updatedFolders = folders.filter((f) => f.id !== folderId);
    this.store.set(FOLDERS_KEY, updatedFolders);
    logger.info(`Smart folder "${deletedFolder.name}" deleted.`, { component: 'SmartFolderService' });


    let cleanupMessage = '';
    if (options.cleanupDirectory) {
      try {
        const stats = await fs.stat(deletedFolder.path).catch(() => null);
        if(stats) {
          const contents = await fs.readdir(deletedFolder.path);
          if (contents.length === 0) {
            await fs.rmdir(deletedFolder.path);
            cleanupMessage = 'Empty directory was removed.';
            logger.info(`Empty directory removed for ${deletedFolder.name}`, { component: 'SmartFolderService' });
          } else {
            cleanupMessage = 'Directory was not empty and was not removed.';
            logger.warn(`Directory for ${deletedFolder.name} was not empty and was not removed.`, { component: 'SmartFolderService' });
          }
        }
      } catch (error) {
        cleanupMessage = `Could not perform directory cleanup: ${error.message}`;
        logger.error(`Failed to perform directory cleanup for ${deletedFolder.name}`, { component: 'SmartFolderService', error: error.message });
      }
    }

    return { deletedFolder, cleanupMessage };
  }
}

module.exports = SmartFolderService; 