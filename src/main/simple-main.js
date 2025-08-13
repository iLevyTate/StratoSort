const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { performance } = require('perf_hooks');
const { Ollama } = require('ollama');
const isDev = process.env.NODE_ENV === 'development';

// Logging utility
const { logger } = require('../shared/logger');

// Import error handling system
const { 
  AnalysisError, 
  ModelMissingError, 
  FileProcessingError,
  OllamaConnectionError 
} = require('./errors/AnalysisError');

const { scanDirectory } = require('./folderScanner');
const { getOrganizationSuggestions } = require('./llmService');
const {
  getOllama,
  getOllamaModel,
  getOllamaVisionModel,
  setOllamaModel,
  setOllamaVisionModel,
  getOllamaHost,
  setOllamaHost,
  loadOllamaConfig,
  getOllamaConfigPath
} = require('./ollamaUtils');
const ModelManager = require('./services/ModelManager');
const { buildOllamaOptions } = require('./services/PerformanceService');
const SettingsService = require('./services/SettingsService');

// Import service integration
const ServiceIntegration = require('./services/ServiceIntegration');

// Import shared constants
const { IPC_CHANNELS } = require('../shared/constants');

// Import services
const { analyzeDocumentFile } = require('./analysis/ollamaDocumentAnalysis');
const { analyzeImageFile } = require('./analysis/ollamaImageAnalysis');
// Audio analysis removed - const { analyzeAudioFile } = require('./analysis/ollamaAudioAnalysis');

// Import OCR library
const tesseract = require('node-tesseract-ocr');

let mainWindow;
let customFolders = []; // Initialize customFolders at module level

// Initialize service integration
let serviceIntegration;
let settingsService;

// Custom folders helpers
const { getCustomFoldersPath, loadCustomFolders, saveCustomFolders } = require('./core/customFolders');

// System monitoring and analytics
const systemAnalytics = require('./core/systemAnalytics');

// Window creation
const createMainWindow = require('./core/createWindow');
function createWindow() {
  logger.debug('[DEBUG] createWindow() called');
  if (mainWindow && !mainWindow.isDestroyed()) {
    logger.debug('[DEBUG] Window already exists, focusing...');
    mainWindow.focus();
    return;
  }
  mainWindow = createMainWindow();
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ===== IPC HANDLERS =====
// ALL IPC handlers must be registered BEFORE app.whenReady()
const { registerAllIpc } = require('./ipc');

// NOTE: Old handle-file-selection handler removed - using IPC_CHANNELS.FILES.SELECT instead

// NOTE: Old select-directory handler removed - using IPC_CHANNELS.FILES.SELECT_DIRECTORY instead

// NOTE: Old get-documents-path handler removed - using IPC_CHANNELS.FILES.GET_DOCUMENTS_PATH instead

// NOTE: Old get-file-stats handler removed - using IPC_CHANNELS.FILES.GET_FILE_STATS instead

ipcMain.handle(IPC_CHANNELS.FILES.CREATE_FOLDER, async (event, basePath, folderName) => {
  try {
    const folderPath = path.join(basePath, folderName);
    await fs.mkdir(folderPath, { recursive: true });
    logger.info('[FILE-OPS] Created folder:', folderPath);
    return { success: true, path: folderPath };
  } catch (error) {
    logger.error('[FILE-OPS] Error creating folder:', error);
    return { success: false, error: error.message };
  }
});

// Create folder using full path directly
ipcMain.handle(IPC_CHANNELS.FILES.CREATE_FOLDER_DIRECT, async (event, fullPath) => {
  try {
    // Normalize the path for cross-platform compatibility
    const normalizedPath = path.resolve(fullPath);
    
    // Check if folder already exists
    try {
      const stats = await fs.stat(normalizedPath);
      if (stats.isDirectory()) {
        logger.info('[FILE-OPS] Folder already exists:', normalizedPath);
        return { success: true, path: normalizedPath, existed: true };
      }
    } catch (statError) {
      // Folder doesn't exist, proceed with creation
    }
    
    await fs.mkdir(normalizedPath, { recursive: true });
    logger.info('[FILE-OPS] Created folder:', normalizedPath);
    return { success: true, path: normalizedPath, existed: false };
  } catch (error) {
    logger.error('[FILE-OPS] Error creating folder:', error);
    
    // Provide more specific error information
    let userMessage = 'Failed to create folder';
    if (error.code === 'EACCES' || error.code === 'EPERM') {
      userMessage = 'Permission denied - check folder permissions';
    } else if (error.code === 'ENOTDIR') {
      userMessage = 'Invalid path - parent is not a directory';
    } else if (error.code === 'EEXIST') {
      userMessage = 'Folder already exists';
    }
    
    return { 
      success: false, 
      error: userMessage,
      details: error.message,
      code: error.code 
    };
  }
});

// Smart Folders matching and helpers moved to ipc/smartFolders.js

// Resume any incomplete organize batches from previous sessions
async function resumeIncompleteBatches() {
  try {
    const incomplete = serviceIntegration?.processingState?.getIncompleteOrganizeBatches?.() || [];
    if (!incomplete.length) return;
    logger.warn(`[RESUME] Resuming ${incomplete.length} incomplete organize batch(es)`);

    for (const batch of incomplete) {
      const total = batch.operations.length;
      for (let i = 0; i < total; i++) {
        const op = batch.operations[i];
        if (op.status === 'done') {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('operation-progress', {
              type: 'batch_organize',
              current: i + 1,
              total,
              currentFile: path.basename(op.source)
            });
          }
          continue;
        }
        try {
          await serviceIntegration.processingState.markOrganizeOpStarted(batch.id, i);
          // Ensure destination directory exists
          const destDir = path.dirname(op.destination);
          await fs.mkdir(destDir, { recursive: true });
          // Check destination collision and adjust
          try {
            await fs.access(op.destination);
            let counter = 1;
            let uniqueDestination = op.destination;
            const ext = path.extname(op.destination);
            const baseName = op.destination.slice(0, -ext.length);
            while (true) {
              try {
                await fs.access(uniqueDestination);
                counter++;
                uniqueDestination = `${baseName}_${counter}${ext}`;
                if (counter > 1000) throw new Error('Too many name collisions');
              } catch {
                break;
              }
            }
            if (uniqueDestination !== op.destination) {
              op.destination = uniqueDestination;
            }
          } catch {}
          // Move with EXDEV handling
          try {
            await fs.rename(op.source, op.destination);
          } catch (renameError) {
            if (renameError.code === 'EXDEV') {
              await fs.copyFile(op.source, op.destination);
              const sourceStats = await fs.stat(op.source);
              const destStats = await fs.stat(op.destination);
              if (sourceStats.size !== destStats.size) {
                throw new Error('File copy verification failed - size mismatch');
              }
              await fs.unlink(op.source);
            } else {
              throw renameError;
            }
          }
          await serviceIntegration.processingState.markOrganizeOpDone(batch.id, i, { destination: op.destination });
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('operation-progress', {
              type: 'batch_organize',
              current: i + 1,
              total,
              currentFile: path.basename(op.source)
            });
          }
        } catch (err) {
          logger.warn('[RESUME] Failed to resume op', i + 1, 'in batch', batch.id, ':', err.message);
          try { await serviceIntegration.processingState.markOrganizeOpError(batch.id, i, err.message); } catch {}
        }
      }
      try { await serviceIntegration.processingState.completeOrganizeBatch(batch.id); } catch {}
      logger.info('[RESUME] Completed batch resume:', batch.id);
    }
  } catch (e) {
    logger.warn('[RESUME] Resume batches failed:', e.message);
  }
}

// Delete folder and its contents
ipcMain.handle(IPC_CHANNELS.FILES.DELETE_FOLDER, async (event, fullPath) => {
  try {
    // Normalize the path for cross-platform compatibility
    const normalizedPath = path.resolve(fullPath);
    
    // Check if folder exists
    try {
      const stats = await fs.stat(normalizedPath);
      if (!stats.isDirectory()) {
        return { 
          success: false, 
          error: 'Path is not a directory',
          code: 'NOT_DIRECTORY'
        };
      }
    } catch (statError) {
      if (statError.code === 'ENOENT') {
        return { 
          success: true, 
          message: 'Folder already deleted or does not exist',
          existed: false 
        };
      }
      throw statError;
    }
    
    // Check if folder is empty
    const contents = await fs.readdir(normalizedPath);
    if (contents.length > 0) {
      return {
        success: false,
        error: `Directory not empty - contains ${contents.length} items`,
        code: 'NOT_EMPTY',
        itemCount: contents.length
      };
    }
    
    // Delete the empty folder
    await fs.rmdir(normalizedPath);
    logger.info('[FILE-OPS] Deleted folder:', normalizedPath);
    return { 
      success: true, 
      path: normalizedPath, 
      message: 'Folder deleted successfully' 
    };
  } catch (error) {
    logger.error('[FILE-OPS] Error deleting folder:', error);
    
    // Provide specific error information
    let userMessage = 'Failed to delete folder';
    if (error.code === 'EACCES' || error.code === 'EPERM') {
      userMessage = 'Permission denied - check folder permissions';
    } else if (error.code === 'ENOTEMPTY') {
      userMessage = 'Directory not empty - contains files or subfolders';
    } else if (error.code === 'EBUSY') {
      userMessage = 'Directory is in use by another process';
    }
    
    return { 
      success: false, 
      error: userMessage,
      details: error.message,
      code: error.code 
    };
  }
});

ipcMain.handle(IPC_CHANNELS.FILES.GET_FILES_IN_DIRECTORY, async (event, dirPath) => {
  try {
    const items = await fs.readdir(dirPath, { withFileTypes: true });
    const result = items.map(item => ({
      name: item.name,
      path: path.join(dirPath, item.name),
      isDirectory: item.isDirectory(),
      isFile: item.isFile()
    }));
    logger.info('[FILE-OPS] Listed directory contents:', dirPath, result.length, 'items');
    return result;
  } catch (error) {
    logger.error('[FILE-OPS] Error reading directory:', error);
    return { error: error.message };
  }
});

ipcMain.handle(IPC_CHANNELS.FILES.PERFORM_OPERATION, async (event, operation) => {
  try {
    logger.info('[FILE-OPS] Performing operation:', operation.type);
    logger.info('[FILE-OPS] Operation details:', JSON.stringify(operation, null, 2));
    
    switch (operation.type) {
      case 'move':
        logger.info(`[FILE-OPS] Moving file: ${operation.source} → ${operation.destination}`);
        await fs.rename(operation.source, operation.destination);
        logger.info(`[FILE-OPS] ✅ Successfully moved: ${operation.source} → ${operation.destination}`);
        return { success: true, message: `Moved ${operation.source} to ${operation.destination}` };
        
      case 'copy':
        logger.info(`[FILE-OPS] Copying file: ${operation.source} → ${operation.destination}`);
        await fs.copyFile(operation.source, operation.destination);
        logger.info(`[FILE-OPS] ✅ Successfully copied: ${operation.source} → ${operation.destination}`);
        return { success: true, message: `Copied ${operation.source} to ${operation.destination}` };
        
      case 'delete':
        logger.info(`[FILE-OPS] Deleting file: ${operation.source}`);
        await fs.unlink(operation.source);
        logger.info(`[FILE-OPS] ✅ Successfully deleted: ${operation.source}`);
        return { success: true, message: `Deleted ${operation.source}` };
        
      case 'batch_organize': {
        logger.info(`[FILE-OPS] Starting batch organization of ${operation.operations.length} files`);
        const results = [];
        let successCount = 0;
        let failCount = 0;
        const batchId = `batch_${Date.now()}`;
        try {
          // Persist batch start or load existing if resuming
          const batch = await serviceIntegration?.processingState?.createOrLoadOrganizeBatch(batchId, operation.operations);

          for (let i = 0; i < batch.operations.length; i++) {
            const op = batch.operations[i];
            if (op.status === 'done') {
              // Already completed in a previous run
              results.push({ success: true, source: op.source, destination: op.destination, operation: op.type || 'move', resumed: true });
              successCount++;
              continue;
            }
            try {
              await serviceIntegration?.processingState?.markOrganizeOpStarted(batchId, i);

              // Validate operation data
              if (!op.source || !op.destination) {
                throw new Error(`Invalid operation data: source="${op.source}", destination="${op.destination}"`);
              }

              // Ensure destination directory exists
              const destDir = path.dirname(op.destination);
              await fs.mkdir(destDir, { recursive: true });

              // Check if source file exists
              try {
                await fs.access(op.source);
              } catch (accessError) {
                throw new Error(`Source file does not exist: ${op.source}`);
              }

              // Check if destination already exists and pick a unique path
              try {
                await fs.access(op.destination);
                let counter = 1;
                let uniqueDestination = op.destination;
                const ext = path.extname(op.destination);
                const baseName = op.destination.slice(0, -ext.length);
                while (true) {
                  try {
                    await fs.access(uniqueDestination);
                    counter++;
                    uniqueDestination = `${baseName}_${counter}${ext}`;
                    if (counter > 1000) {
                      throw new Error('Too many name collisions while generating unique destination');
                    }
                  } catch {
                    break;
                  }
                }
                if (uniqueDestination !== op.destination) {
                  op.destination = uniqueDestination;
                }
              } catch {
                // destination free
              }

              // Perform move with EXDEV handling
              try {
                await fs.rename(op.source, op.destination);
              } catch (renameError) {
                if (renameError.code === 'EXDEV') {
                  await fs.copyFile(op.source, op.destination);
                  const sourceStats = await fs.stat(op.source);
                  const destStats = await fs.stat(op.destination);
                  if (sourceStats.size !== destStats.size) {
                    throw new Error('File copy verification failed - size mismatch');
                  }
                  await fs.unlink(op.source);
                } else {
                  throw renameError;
                }
              }

              await serviceIntegration?.processingState?.markOrganizeOpDone(batchId, i, { destination: op.destination });

              results.push({ success: true, source: op.source, destination: op.destination, operation: op.type || 'move' });
              successCount++;

              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('operation-progress', {
                  type: 'batch_organize',
                  current: i + 1,
                  total: batch.operations.length,
                  currentFile: path.basename(op.source)
                });
              }
            } catch (error) {
              logger.error(`[FILE-OPS] ❌ Operation ${i+1} failed:`, error.message);
              await serviceIntegration?.processingState?.markOrganizeOpError(batchId, i, error.message);
              results.push({ success: false, source: op.source, destination: op.destination, error: error.message, operation: op.type || 'move' });
              failCount++;
            }
          }
          await serviceIntegration?.processingState?.completeOrganizeBatch(batchId);
        } catch (fatal) {
          logger.error('[FILE-OPS] Batch organize fatal error:', fatal);
        }

        logger.info(`[FILE-OPS] Batch operation complete: ${successCount} success, ${failCount} failed`);
        return {
          success: successCount > 0,
          results,
          successCount,
          failCount,
          summary: `Processed ${operation.operations.length} files: ${successCount} successful, ${failCount} failed`,
          batchId
        };
      }
        
      default:
        logger.error(`[FILE-OPS] Unknown operation type: ${operation.type}`);
        return { success: false, error: `Unknown operation type: ${operation.type}` };
    }
  } catch (error) {
    logger.error('[FILE-OPS] Error performing operation:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle(IPC_CHANNELS.FILES.DELETE_FILE, async (event, filePath) => {
  try {
    // Validate file path
    if (!filePath || typeof filePath !== 'string') {
      return { 
        success: false, 
        error: 'Invalid file path provided',
        errorCode: 'INVALID_PATH'
      };
    }

    // Check if file exists before attempting deletion
    try {
      await fs.access(filePath);
    } catch (accessError) {
      return { 
        success: false, 
        error: 'File not found or inaccessible',
        errorCode: 'FILE_NOT_FOUND',
        details: accessError.message
      };
    }

    // Get file stats for logging
    const stats = await fs.stat(filePath);
    
    await fs.unlink(filePath);
    logger.info('[FILE-OPS] Deleted file:', filePath, `(${stats.size} bytes)`);
    
    return { 
      success: true, 
      message: 'File deleted successfully',
      deletedFile: {
        path: filePath,
        size: stats.size,
        deletedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    logger.error('[FILE-OPS] Error deleting file:', error);
    
    // Provide specific error codes for different failure types
    let errorCode = 'DELETE_FAILED';
    let userMessage = 'Failed to delete file';
    
    if (error.code === 'ENOENT') {
      errorCode = 'FILE_NOT_FOUND';
      userMessage = 'File not found';
    } else if (error.code === 'EACCES' || error.code === 'EPERM') {
      errorCode = 'PERMISSION_DENIED';
      userMessage = 'Permission denied - file may be in use';
    } else if (error.code === 'EBUSY') {
      errorCode = 'FILE_IN_USE';
      userMessage = 'File is currently in use';
    }
    
    return { 
      success: false, 
      error: userMessage,
      errorCode,
      details: error.message,
      systemError: error.code
    };
  }
});

// Open file with default application
ipcMain.handle(IPC_CHANNELS.FILES.OPEN_FILE, async (event, filePath) => {
  try {
    await shell.openPath(filePath);
    logger.info('[FILE-OPS] Opened file:', filePath);
    return { success: true };
  } catch (error) {
    logger.error('[FILE-OPS] Error opening file:', error);
    return { success: false, error: error.message };
  }
});

// Reveal file in file explorer
ipcMain.handle(IPC_CHANNELS.FILES.REVEAL_FILE, async (event, filePath) => {
  try {
    await shell.showItemInFolder(filePath);
    logger.info('[FILE-OPS] Revealed file in folder:', filePath);
    return { success: true };
  } catch (error) {
    logger.error('[FILE-OPS] Error revealing file:', error);
    return { success: false, error: error.message };
  }
});

// Enhanced copy operation with progress and validation
ipcMain.handle(IPC_CHANNELS.FILES.COPY_FILE, async (event, sourcePath, destinationPath) => {
  try {
    // Validate paths
    if (!sourcePath || !destinationPath) {
      return { 
        success: false, 
        error: 'Source and destination paths are required',
        errorCode: 'INVALID_PATHS'
      };
    }

    // Normalize paths for cross-platform compatibility
    const normalizedSource = path.resolve(sourcePath);
    const normalizedDestination = path.resolve(destinationPath);
    
    // Check if source exists
    try {
      await fs.access(normalizedSource);
    } catch (accessError) {
      return { 
        success: false, 
        error: 'Source file not found',
        errorCode: 'SOURCE_NOT_FOUND',
        details: accessError.message
      };
    }

    // Ensure destination directory exists
    const destDir = path.dirname(normalizedDestination);
    await fs.mkdir(destDir, { recursive: true });
    
    // Get source file stats
    const sourceStats = await fs.stat(normalizedSource);
    
    await fs.copyFile(normalizedSource, normalizedDestination);
    logger.info('[FILE-OPS] Copied file:', normalizedSource, 'to', normalizedDestination);
    
    return { 
      success: true,
      message: 'File copied successfully',
      operation: {
        source: normalizedSource,
        destination: normalizedDestination,
        size: sourceStats.size,
        copiedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    logger.error('[FILE-OPS] Error copying file:', error);
    
    let errorCode = 'COPY_FAILED';
    let userMessage = 'Failed to copy file';
    
    if (error.code === 'ENOSPC') {
      errorCode = 'INSUFFICIENT_SPACE';
      userMessage = 'Insufficient disk space';
    } else if (error.code === 'EACCES' || error.code === 'EPERM') {
      errorCode = 'PERMISSION_DENIED';
      userMessage = 'Permission denied';
    } else if (error.code === 'EEXIST') {
      errorCode = 'DESTINATION_EXISTS';
      userMessage = 'Destination file already exists';
    }
    
    return { 
      success: false, 
      error: userMessage,
      errorCode,
      details: error.message,
      systemError: error.code
    };
  }
});

// Enhanced folder opening with better path handling
ipcMain.handle(IPC_CHANNELS.FILES.OPEN_FOLDER, async (event, folderPath) => {
  try {
    if (!folderPath || typeof folderPath !== 'string') {
      return { 
        success: false, 
        error: 'Invalid folder path provided',
        errorCode: 'INVALID_PATH'
      };
    }

    // Normalize path for cross-platform compatibility
    const normalizedPath = path.resolve(folderPath);
    
    // Check if folder exists
    try {
      const stats = await fs.stat(normalizedPath);
      if (!stats.isDirectory()) {
        return { 
          success: false, 
          error: 'Path is not a directory',
          errorCode: 'NOT_A_DIRECTORY'
        };
      }
    } catch (accessError) {
      return { 
        success: false, 
        error: 'Folder not found or inaccessible',
        errorCode: 'FOLDER_NOT_FOUND',
        details: accessError.message
      };
    }

    await shell.openPath(normalizedPath);
    logger.info('[FILE-OPS] Opened folder:', normalizedPath);
    
    return { 
      success: true,
      message: 'Folder opened successfully',
      openedPath: normalizedPath
    };
  } catch (error) {
    logger.error('[FILE-OPS] Error opening folder:', error);
    return { 
      success: false, 
      error: 'Failed to open folder',
      errorCode: 'OPEN_FAILED',
      details: error.message
    };
  }
});

// Enhanced Smart Folders with comprehensive validation and atomic operations
ipcMain.handle(IPC_CHANNELS.SMART_FOLDERS.GET, async () => {
  logger.info('[SMART-FOLDERS] Getting Smart Folders for UI:', customFolders.length);
  
  // Check physical existence of each folder
  const foldersWithStatus = await Promise.all(
    customFolders.map(async (folder) => {
      try {
        const stats = await fs.stat(folder.path);
        return {
          ...folder,
          physicallyExists: stats.isDirectory()
        };
      } catch (error) {
        return {
          ...folder,
          physicallyExists: false
        };
      }
    })
  );
  
  return foldersWithStatus;
});

ipcMain.handle(IPC_CHANNELS.SMART_FOLDERS.GET_CUSTOM, async () => {
  logger.info('[SMART-FOLDERS] Getting Custom Folders for UI:', customFolders.length);
  return customFolders;
});

ipcMain.handle(IPC_CHANNELS.SMART_FOLDERS.SAVE, async (event, folders) => {
  try {
    // Validate input
    if (!Array.isArray(folders)) {
      return { success: false, error: 'Folders must be an array', errorCode: 'INVALID_INPUT' };
    }

    // Backup current state for rollback
    const originalFolders = [...customFolders];
    
    try {
      customFolders = folders;
      await saveCustomFolders(folders);
      logger.info('[SMART-FOLDERS] Saved Smart Folders:', folders.length);
      return { success: true, folders: customFolders };
    } catch (saveError) {
      // Rollback on failure
      customFolders = originalFolders;
      throw saveError;
    }
  } catch (error) {
    logger.error('[ERROR] Failed to save smart folders:', error);
    return { success: false, error: error.message, errorCode: 'SAVE_FAILED' };
  }
});

ipcMain.handle(IPC_CHANNELS.SMART_FOLDERS.UPDATE_CUSTOM, async (event, folders) => {
  try {
    // Validate input
    if (!Array.isArray(folders)) {
      return { success: false, error: 'Folders must be an array', errorCode: 'INVALID_INPUT' };
    }

    // Backup current state for rollback
    const originalFolders = [...customFolders];
    
    try {
      customFolders = folders;
      await saveCustomFolders(folders);
      logger.info('[SMART-FOLDERS] Updated Custom Folders:', folders.length);
      return { success: true, folders: customFolders };
    } catch (saveError) {
      // Rollback on failure
      customFolders = originalFolders;
      throw saveError;
    }
  } catch (error) {
    logger.error('[ERROR] Failed to update custom folders:', error);
    return { success: false, error: error.message, errorCode: 'UPDATE_FAILED' };
  }
});

ipcMain.handle(IPC_CHANNELS.SMART_FOLDERS.EDIT, async (event, folderId, updatedFolder) => {
  try {
    // Enhanced validation
    if (!folderId || typeof folderId !== 'string') {
      return { success: false, error: 'Valid folder ID is required', errorCode: 'INVALID_FOLDER_ID' };
    }

    if (!updatedFolder || typeof updatedFolder !== 'object') {
      return { success: false, error: 'Valid folder data is required', errorCode: 'INVALID_FOLDER_DATA' };
    }

    const folderIndex = customFolders.findIndex(f => f.id === folderId);
    if (folderIndex === -1) {
      return { success: false, error: 'Folder not found', errorCode: 'FOLDER_NOT_FOUND' };
    }

    // Validate folder name if provided
    if (updatedFolder.name) {
      const illegalChars = /[<>:"|?*\x00-\x1f]/g;
      if (illegalChars.test(updatedFolder.name)) {
        return { 
          success: false, 
          error: 'Folder name contains invalid characters. Please avoid: < > : " | ? *',
          errorCode: 'INVALID_FOLDER_NAME_CHARS'
        };
      }

      // Check for duplicate names (excluding current folder)
      const existingFolder = customFolders.find(f => 
        f.id !== folderId && f.name.toLowerCase() === updatedFolder.name.trim().toLowerCase()
      );

      if (existingFolder) {
        return { 
          success: false, 
          error: `A smart folder with name "${updatedFolder.name}" already exists`,
          errorCode: 'FOLDER_NAME_EXISTS'
        };
      }
    }

    // Validate path if provided
    if (updatedFolder.path) {
      try {
        const normalizedPath = path.resolve(updatedFolder.path.trim());
        const parentDir = path.dirname(normalizedPath);
        
        // Check parent directory exists
        const parentStats = await fs.stat(parentDir);
        if (!parentStats.isDirectory()) {
          return { 
            success: false, 
            error: `Parent directory "${parentDir}" is not a directory`,
            errorCode: 'PARENT_NOT_DIRECTORY'
          };
        }
        
        updatedFolder.path = normalizedPath;
      } catch (pathError) {
        return { 
          success: false, 
          error: `Invalid path: ${pathError.message}`,
          errorCode: 'INVALID_PATH'
        };
      }
    }
    
    // Backup current state for rollback
    const originalFolder = { ...customFolders[folderIndex] };
    
    // If the path has changed, attempt to rename the directory on disk
    if (updatedFolder.path && updatedFolder.path !== originalFolder.path) {
      try {
        const oldPath = originalFolder.path;
        const newPath = updatedFolder.path;

        // Ensure old directory exists
        const oldStats = await fs.stat(oldPath);
        if (!oldStats.isDirectory()) {
          return { success: false, error: 'Original path is not a directory', errorCode: 'ORIGINAL_NOT_DIRECTORY' };
        }

        // Attempt rename
        await fs.rename(oldPath, newPath);
        logger.info(`[SMART-FOLDERS] Renamed directory \"${oldPath}\" -> \"${newPath}\"`);
      } catch (renameErr) {
        logger.error('[SMART-FOLDERS] Directory rename failed:', renameErr.message);
        return { success: false, error: 'Failed to rename directory', errorCode: 'RENAME_FAILED', details: renameErr.message };
      }
    }
    
    try {
      // Update folder with validation
      customFolders[folderIndex] = { 
        ...customFolders[folderIndex], 
        ...updatedFolder,
        updatedAt: new Date().toISOString()
      };
      
      await saveCustomFolders(customFolders);
      logger.info('[SMART-FOLDERS] Edited Smart Folder:', folderId);
      
      return { 
        success: true, 
        folder: customFolders[folderIndex],
        message: 'Smart folder updated successfully'
      };
    } catch (saveError) {
      // Rollback on failure
      customFolders[folderIndex] = originalFolder;
      throw saveError;
    }
  } catch (error) {
    logger.error('[ERROR] Failed to edit smart folder:', error);
    return { 
      success: false, 
      error: error.message,
      errorCode: 'EDIT_FAILED'
    };
  }
});

ipcMain.handle(IPC_CHANNELS.SMART_FOLDERS.DELETE, async (event, folderId) => {
  try {
    // Enhanced validation
    if (!folderId || typeof folderId !== 'string') {
      return { success: false, error: 'Valid folder ID is required', errorCode: 'INVALID_FOLDER_ID' };
    }

    const folderIndex = customFolders.findIndex(f => f.id === folderId);
    if (folderIndex === -1) {
      return { success: false, error: 'Folder not found', errorCode: 'FOLDER_NOT_FOUND' };
    }

    // Backup current state for rollback
    const originalFolders = [...customFolders];
    const deletedFolder = customFolders[folderIndex];
    
    try {
      customFolders = customFolders.filter(f => f.id !== folderId);
      await saveCustomFolders(customFolders);
      logger.info('[SMART-FOLDERS] Deleted Smart Folder:', folderId);
      
      let directoryRemoved = false;
      let removalError = null;
      try {
        const stats = await fs.stat(deletedFolder.path);
        if (stats.isDirectory()) {
          // Attempt to remove only if empty to avoid accidental data loss
          const contents = await fs.readdir(deletedFolder.path);
          if (contents.length === 0) {
            await fs.rmdir(deletedFolder.path);
            directoryRemoved = true;
          }
        }
      } catch (dirErr) {
        // If directory missing, that's fine; otherwise record error
        if (dirErr.code !== 'ENOENT') {
          logger.warn('[SMART-FOLDERS] Directory removal failed:', dirErr.message);
          removalError = dirErr.message;
        }
      }

      return { 
        success: true, 
        folders: customFolders,
        deletedFolder,
        directoryRemoved,
        removalError,
        message: `Smart folder \"${deletedFolder.name}\" deleted successfully` + (directoryRemoved ? ' and its empty directory was removed.' : '')
      };
    } catch (saveError) {
      // Rollback on failure
      customFolders = originalFolders;
      throw saveError;
    }
  } catch (error) {
    logger.error('[ERROR] Failed to delete smart folder:', error);
    return { 
      success: false, 
      error: error.message,
      errorCode: 'DELETE_FAILED'
    };
  }
});

// NOTE: Old get-analysis-statistics handler removed - using IPC_CHANNELS.ANALYSIS_HISTORY.GET_STATISTICS instead

// NOTE: Old duplicate handlers removed - using IPC_CHANNELS constants instead

// Smart Folders scan moved to ipc/smartFolders.js

// NOTE: Old analyze-document handler removed - using IPC_CHANNELS.ANALYSIS.ANALYZE_DOCUMENT instead

// Helper function for semantic folder matching using Ollama
async function calculateFolderSimilarities(suggestedCategory, folderCategories) {
  try {
    const similarities = [];
    
    for (const folder of folderCategories) {
      // Create semantic comparison prompt
      const prompt = `Compare these two categories for semantic similarity:
Category 1: "${suggestedCategory}"
Category 2: "${folder.name}" (Description: "${folder.description}")

Rate similarity from 0.0 to 1.0 where:
- 1.0 = identical meaning
- 0.8+ = very similar concepts
- 0.6+ = related concepts
- 0.4+ = somewhat related
- 0.2+ = loosely related
- 0.0 = unrelated

Respond with only a number between 0.0 and 1.0:`;

      try {
        const response = await fetch('http://localhost:11434/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: getOllamaModel(),
            prompt: prompt,
            stream: false,
            options: { temperature: 0.1, num_predict: 10 }
          })
        });

        if (response.ok) {
          const data = await response.json();
          const similarity = parseFloat(data.response.trim());
          
          if (!isNaN(similarity) && similarity >= 0 && similarity <= 1) {
            similarities.push({
              name: folder.name,
              id: folder.id,
              confidence: similarity,
              description: folder.description
            });
          }
        }
      } catch (folderError) {
        logger.warn(`[SEMANTIC] Failed to analyze folder ${folder.name}:`, folderError.message);
        // Fallback to basic string similarity
        const basicSimilarity = calculateBasicSimilarity(suggestedCategory, folder.name);
        similarities.push({
          name: folder.name,
          id: folder.id,
          confidence: basicSimilarity,
          description: folder.description,
          fallback: true
        });
      }
    }
    
    // Sort by confidence descending
    return similarities.sort((a, b) => b.confidence - a.confidence);
  } catch (error) {
    logger.error('[SEMANTIC] Folder similarity calculation failed:', error);
    return [];
  }
}

// Fallback basic string similarity
function calculateBasicSimilarity(str1, str2) {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  
  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;
  
  // Simple word overlap scoring
  const words1 = s1.split(/\s+/);
  const words2 = s2.split(/\s+/);
  const overlap = words1.filter(w => words2.includes(w)).length;
  const total = Math.max(words1.length, words2.length);
  
  return overlap / total;
}

// NOTE: Old analyze-image and analyze-audio handlers removed - using IPC_CHANNELS constants instead

// Ollama handlers moved to ipc/ollama.js

// IPC groups moved to ./ipc/* modules

// File operation handlers
ipcMain.handle(IPC_CHANNELS.FILES.SELECT, async () => {
  logger.info('[MAIN-FILE-SELECT] ===== FILE SELECTION HANDLER CALLED =====');
  logger.info('[MAIN-FILE-SELECT] mainWindow exists?', !!mainWindow);
  logger.info('[MAIN-FILE-SELECT] mainWindow visible?', mainWindow?.isVisible());
  logger.info('[MAIN-FILE-SELECT] mainWindow focused?', mainWindow?.isFocused());
  
  try {
    // Make sure window is focused before opening dialog
    if (mainWindow && !mainWindow.isFocused()) {
      logger.info('[MAIN-FILE-SELECT] Focusing window before dialog...');
      mainWindow.focus();
    }
    
    logger.info('[MAIN-FILE-SELECT] Opening file dialog...');
    
    // Try to ensure window is visible and focused before showing dialog
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        logger.info('[MAIN-FILE-SELECT] Restoring minimized window');
        mainWindow.restore();
      }
      if (!mainWindow.isVisible()) {
        logger.info('[MAIN-FILE-SELECT] Showing hidden window');
        mainWindow.show();
      }
      if (!mainWindow.isFocused()) {
        logger.info('[MAIN-FILE-SELECT] Focusing window');
        mainWindow.focus();
      }
      
      // Small delay to ensure window is ready
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // On Windows, we can't use openFile and openDirectory together reliably
    // So we'll use just openFile with multiSelections, and handle folders separately
    const result = await dialog.showOpenDialog(mainWindow || null, {
      properties: ['openFile', 'multiSelections', 'dontAddToRecent'],
      title: 'Select Files to Organize',
      buttonLabel: 'Select Files',
      filters: [
        { name: 'All Supported Files', extensions: ['pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'zip', 'rar', '7z', 'tar', 'gz'] },
        { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'txt', 'md', 'rtf'] },
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg'] },
        { name: 'Archives', extensions: ['zip', 'rar', '7z', 'tar', 'gz'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    
    logger.info('[MAIN-FILE-SELECT] Dialog closed, result:', result);
    
    if (result.canceled || !result.filePaths.length) {
      return { success: false, files: [] };
    }
    
    logger.info(`[FILE-SELECTION] Selected ${result.filePaths.length} items`);
    
    const allFiles = [];
    // Audio extensions intentionally omitted to filter out audio files at selection
    const supportedExts = ['.pdf', '.doc', '.docx', '.txt', '.md', '.rtf', '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.zip', '.rar', '.7z', '.tar', '.gz'];
    
    // Helper function to scan folders recursively
    const scanFolder = async (folderPath, depth = 0, maxDepth = 3) => {
      if (depth > maxDepth) return [];
      
      try {
        const items = await fs.readdir(folderPath, { withFileTypes: true });
        const foundFiles = [];
        
        for (const item of items) {
          const itemPath = path.join(folderPath, item.name);
          
          if (item.isFile()) {
            const ext = path.extname(item.name).toLowerCase();
            if (supportedExts.includes(ext)) {
              foundFiles.push(itemPath);
            }
          } else if (item.isDirectory() && !item.name.startsWith('.') && !item.name.startsWith('node_modules')) {
            const subFiles = await scanFolder(itemPath, depth + 1, maxDepth);
            foundFiles.push(...subFiles);
          }
        }
        
        return foundFiles;
      } catch (error) {
        logger.warn(`[FILE-SELECTION] Error scanning folder ${folderPath}:`, error.message);
        return [];
      }
    };
    
    // Process each selected item
    for (const selectedPath of result.filePaths) {
      try {
        const stats = await fs.stat(selectedPath);
        
        if (stats.isFile()) {
          // It's a file - add directly if supported
          const ext = path.extname(selectedPath).toLowerCase();
          if (supportedExts.includes(ext)) {
            allFiles.push(selectedPath);
            logger.info(`[FILE-SELECTION] Added file: ${path.basename(selectedPath)}`);
          }
        } else if (stats.isDirectory()) {
          // It's a folder - scan for supported files
          logger.info(`[FILE-SELECTION] Scanning folder: ${selectedPath}`);
          const folderFiles = await scanFolder(selectedPath);
          allFiles.push(...folderFiles);
          logger.info(`[FILE-SELECTION] Found ${folderFiles.length} files in folder: ${path.basename(selectedPath)}`);
        }
      } catch (error) {
        logger.warn(`[FILE-SELECTION] Error processing ${selectedPath}:`, error.message);
      }
    }
    
    // Remove duplicates
    const uniqueFiles = [...new Set(allFiles)];
    logger.info(`[FILE-SELECTION] Total files collected: ${uniqueFiles.length} (${allFiles.length - uniqueFiles.length} duplicates removed)`);
    
    return { 
      success: true, 
      files: uniqueFiles,
      summary: {
        totalSelected: result.filePaths.length,
        filesFound: uniqueFiles.length,
        duplicatesRemoved: allFiles.length - uniqueFiles.length
      }
    };
  } catch (error) {
    logger.error('[MAIN-FILE-SELECT] Failed to select files:', error);
    logger.error('[MAIN-FILE-SELECT] Error stack:', error.stack);
    
    // Provide more helpful error messages
    let userMessage = error.message;
    if (error.message.includes('Cannot read properties of undefined')) {
      userMessage = 'File dialog failed to open. Please try again.';
    } else if (error.message.includes('User did not grant permission')) {
      userMessage = 'Permission denied to access files. Please grant file access permissions.';
    }
    
    return { 
      success: false, 
      error: userMessage, 
      files: [],
      debugInfo: {
        originalError: error.message,
        windowExists: !!mainWindow,
        windowVisible: mainWindow?.isVisible(),
        windowFocused: mainWindow?.isFocused()
      }
    };
  }
});

ipcMain.handle(IPC_CHANNELS.FILES.SELECT_DIRECTORY, async () => {
  try {
    logger.info('[IPC] Opening directory selection dialog');
    
    const result = await dialog.showOpenDialog(mainWindow || null, {
      properties: ['openDirectory', 'dontAddToRecent'],
      title: 'Select Directory to Scan',
      buttonLabel: 'Select Directory'
    });
    
    logger.info('[IPC] Directory selection result:', result);
    
    if (result.canceled || !result.filePaths.length) {
      return { success: false, folder: null };
    }
    
    const selectedFolder = result.filePaths[0];
    logger.info('[IPC] Selected directory:', selectedFolder);
    
    return { 
      success: true, 
      folder: selectedFolder
    };
  } catch (error) {
    logger.error('[IPC] Directory selection failed:', error);
    return { 
      success: false, 
      folder: null,
      error: error.message
    };
  }
});

ipcMain.handle(IPC_CHANNELS.FILES.GET_DOCUMENTS_PATH, async () => {
  try {
    return app.getPath('documents');
  } catch (error) {
    logger.error('Failed to get documents path:', error);
    return null;
  }
});

ipcMain.handle(IPC_CHANNELS.FILES.GET_FILE_STATS, async (event, filePath) => {
  try {
    const stats = await fs.stat(filePath);
    return {
      size: stats.size,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      modified: stats.mtime,
      created: stats.birthtime
    };
  } catch (error) {
    logger.error('Failed to get file stats:', error);
    return null;
  }
});

// Analysis handlers moved to ipc/analysis.js

// Audio analysis handlers
// Audio analysis is disabled in the current UI and preload. IPC handlers removed to avoid drift and runtime errors.

// Settings handlers moved to ipc/settings.js

// NOTE: Removed all old-style handlers that have IPC_CHANNELS constant-based duplicates
// This prevents "Attempted to register a second handler" errors
// All functionality is handled by the constant-based handlers above

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, focus our window instead
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // Production optimizations - ensure GPU acceleration
  if (!isDev) {
    // Production GPU optimizations
    app.commandLine.appendSwitch('enable-gpu-rasterization');
    app.commandLine.appendSwitch('enable-gpu-memory-buffer-compositor-resources');
    app.commandLine.appendSwitch('enable-native-gpu-memory-buffers');
    app.commandLine.appendSwitch('ignore-gpu-blacklist');
    app.commandLine.appendSwitch('disable-software-rasterizer');
    
    // Performance optimizations
    app.commandLine.appendSwitch('enable-zero-copy');
    app.commandLine.appendSwitch('enable-hardware-overlays');
    app.commandLine.appendSwitch('enable-features', 'Vulkan,CanvasOopRasterization,UseSkiaRenderer,VaapiVideoDecoder,VaapiVideoEncoder');
    
    logger.info('[PRODUCTION] GPU acceleration optimizations enabled');
  } else {
    // Even in dev, prefer GPU acceleration where possible
    app.commandLine.appendSwitch('enable-gpu-rasterization');
    app.commandLine.appendSwitch('enable-zero-copy');
    app.commandLine.appendSwitch('enable-features', 'Vulkan,CanvasOopRasterization,UseSkiaRenderer');
    logger.info('[DEVELOPMENT] GPU acceleration flags enabled for development');
  }

  // Initialize services after app is ready
  app.whenReady().then(async () => {
    try {
      // Load custom folders
      customFolders = await loadCustomFolders();
      logger.info('[STARTUP] Loaded custom folders:', customFolders.length, 'folders');
      
      // Initialize service integration
      serviceIntegration = new ServiceIntegration();
      await serviceIntegration.initialize();
      logger.info('[MAIN] Service integration initialized successfully');
      // Initialize settings service
      settingsService = new SettingsService();
      
      // Resume any incomplete organize batches (best-effort)
      try {
        const incompleteBatches = serviceIntegration?.processingState?.getIncompleteOrganizeBatches?.() || [];
        if (incompleteBatches.length > 0) {
          logger.warn(`[RESUME] Found ${incompleteBatches.length} incomplete organize batch(es). They will resume when a new organize request starts.`);
        }
      } catch (resumeErr) {
        logger.warn('[RESUME] Failed to check incomplete batches:', resumeErr.message);
      }
      
      // Verify AI models on startup
      const ModelVerifier = require('./services/ModelVerifier');
      const modelVerifier = new ModelVerifier();
      const modelStatus = await modelVerifier.verifyEssentialModels();
      
      if (!modelStatus.success) {
        logger.warn('[STARTUP] Missing AI models detected:', modelStatus.missingModels);
        logger.info('[STARTUP] Install missing models:');
        modelStatus.installationCommands.forEach(cmd => logger.info('  ', cmd));
      } else {
        logger.info('[STARTUP] ✅ All essential AI models verified and ready');
        if (modelStatus.hasWhisper) {
          logger.info('[STARTUP] ✅ Whisper model available for audio analysis');
        }
      }
      
      // Register IPC groups now that services and state are ready
      const getMainWindow = () => mainWindow;
      const getServiceIntegration = () => serviceIntegration;
      const getCustomFolders = () => customFolders;
      const setCustomFolders = (folders) => { customFolders = folders; };

      // Grouped IPC registration (single entry)
      registerAllIpc({
        ipcMain,
        IPC_CHANNELS,
        logger,
        dialog,
        shell,
        systemAnalytics,
        getMainWindow,
        getServiceIntegration,
        getCustomFolders,
        setCustomFolders,
        saveCustomFolders,
        analyzeDocumentFile,
        analyzeImageFile,
        tesseract,
        getOllama,
        getOllamaModel,
        getOllamaVisionModel,
        buildOllamaOptions,
        scanDirectory,
      });

      createWindow();
      // Fire-and-forget resume of incomplete batches shortly after window is ready
      setTimeout(() => { resumeIncompleteBatches(); }, 500);
      
      // Load Ollama config and apply any saved selections
      const cfg = await loadOllamaConfig();
      if (cfg.selectedTextModel) await setOllamaModel(cfg.selectedTextModel);
      if (cfg.selectedVisionModel) await setOllamaVisionModel(cfg.selectedVisionModel);
      logger.info('[STARTUP] Ollama configuration loaded');
      
    } catch (error) {
      logger.error('[STARTUP] Failed to initialize:', error);
      createWindow();
    }
  });
}

// ===== APP LIFECYCLE =====
logger.info('[STARTUP] Organizer AI App - Main Process Started with Full AI Features');
logger.info('[UI] Modern UI loaded with GPU acceleration');

// App lifecycle
app.on('window-all-closed', () => {
  systemAnalytics.destroy();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  systemAnalytics.destroy();
});

ipcMain.handle(IPC_CHANNELS.SMART_FOLDERS.ADD, async (event, folder) => {
  try {
    // Enhanced validation
    if (!folder || typeof folder !== 'object') {
      return { 
        success: false, 
        error: 'Invalid folder data provided',
        errorCode: 'INVALID_FOLDER_DATA'
      };
    }

    if (!folder.name || typeof folder.name !== 'string' || !folder.name.trim()) {
      return { 
        success: false, 
        error: 'Folder name is required and must be a non-empty string',
        errorCode: 'INVALID_FOLDER_NAME'
      };
    }

    if (!folder.path || typeof folder.path !== 'string' || !folder.path.trim()) {
      return { 
        success: false, 
        error: 'Folder path is required and must be a non-empty string',
        errorCode: 'INVALID_FOLDER_PATH'
      };
    }

    // Validate folder name for illegal characters
    const illegalChars = /[<>:"|?*\x00-\x1f]/g;
    if (illegalChars.test(folder.name)) {
      return { 
        success: false, 
        error: 'Folder name contains invalid characters. Please avoid: < > : " | ? *',
        errorCode: 'INVALID_FOLDER_NAME_CHARS'
      };
    }

    // Check for duplicate names or paths
    const existingFolder = customFolders.find(f => 
      f.name.toLowerCase() === folder.name.trim().toLowerCase() ||
      path.resolve(f.path) === path.resolve(folder.path.trim())
    );

    if (existingFolder) {
      return { 
        success: false, 
        error: `A smart folder with name "${existingFolder.name}" or path "${existingFolder.path}" already exists`,
        errorCode: 'FOLDER_ALREADY_EXISTS'
      };
    }

    // Normalize path for cross-platform compatibility
    const normalizedPath = path.resolve(folder.path.trim());
    
    // Validate parent directory exists and is writable
    const parentDir = path.dirname(normalizedPath);
    try {
      const parentStats = await fs.stat(parentDir);
      if (!parentStats.isDirectory()) {
        return { 
          success: false, 
          error: `Parent directory "${parentDir}" is not a directory`,
          errorCode: 'PARENT_NOT_DIRECTORY'
        };
      }
      
      // Test write permissions by attempting to create a temp file
      const tempFile = path.join(parentDir, `.stratotest_${Date.now()}`);
      try {
        await fs.writeFile(tempFile, 'test');
        await fs.unlink(tempFile);
      } catch (writeError) {
        return { 
          success: false, 
          error: `No write permission in parent directory "${parentDir}"`,
          errorCode: 'PARENT_NOT_WRITABLE'
        };
      }
    } catch (parentError) {
      return { 
        success: false, 
        error: `Parent directory "${parentDir}" does not exist or is not accessible`,
        errorCode: 'PARENT_NOT_ACCESSIBLE'
      };
    }

    // Enhanced LLM analysis for smart folder optimization
    let llmEnhancedData = {};
    try {
      // Use LLM to enhance folder metadata and suggest improvements
      const llmAnalysis = await enhanceSmartFolderWithLLM(folder, customFolders);
      if (llmAnalysis && !llmAnalysis.error) {
        llmEnhancedData = llmAnalysis;
      }
    } catch (llmError) {
      logger.warn('[SMART-FOLDERS] LLM enhancement failed, continuing with basic data:', llmError.message);
    }
    
    const newFolder = {
      id: Date.now().toString(),
      name: folder.name.trim(),
      path: normalizedPath,
      description: llmEnhancedData.enhancedDescription || folder.description?.trim() || `Smart folder for ${folder.name.trim()}`,
      keywords: llmEnhancedData.suggestedKeywords || [],
      category: llmEnhancedData.suggestedCategory || 'general',
      isDefault: folder.isDefault || false,
      createdAt: new Date().toISOString(),
      // LLM-enhanced metadata
      semanticTags: llmEnhancedData.semanticTags || [],
      relatedFolders: llmEnhancedData.relatedFolders || [],
      confidenceScore: llmEnhancedData.confidence || 0.8,
      usageCount: 0,
      lastUsed: null
    };
    
    // Create the actual directory with enhanced error handling
    let directoryCreated = false;
    let directoryExisted = false;
    
    // First, check if directory already exists
    try {
      const existingStats = await fs.stat(normalizedPath);
      if (existingStats.isDirectory()) {
        logger.info('[SMART-FOLDERS] Directory already exists:', normalizedPath);
        directoryExisted = true;
      } else {
        return { 
          success: false, 
          error: 'Path exists but is not a directory',
          errorCode: 'PATH_NOT_DIRECTORY'
        };
      }
    } catch (statError) {
      // Directory doesn't exist, proceed with creation
      if (statError.code === 'ENOENT') {
        try {
          await fs.mkdir(normalizedPath, { recursive: true });
          logger.info('[SMART-FOLDERS] Created directory:', normalizedPath);
          directoryCreated = true;
          
          // Verify directory was created and is accessible
          const stats = await fs.stat(normalizedPath);
          if (!stats.isDirectory()) {
            throw new Error('Created path is not a directory');
          }
        } catch (dirError) {
          logger.error('[SMART-FOLDERS] Directory creation failed:', dirError.message);
          return { 
            success: false, 
            error: 'Failed to create directory',
            errorCode: 'DIRECTORY_CREATION_FAILED',
            details: dirError.message
          };
        }
      } else {
        return { 
          success: false, 
          error: 'Failed to access directory path',
          errorCode: 'PATH_ACCESS_FAILED',
          details: statError.message
        };
      }
    }

    // Add to configuration with rollback capability
    const originalFolders = [...customFolders];
    try {
      customFolders.push(newFolder);
      await saveCustomFolders(customFolders);
      logger.info('[SMART-FOLDERS] Added Smart Folder:', newFolder.id);
      
      return { 
        success: true, 
        folder: newFolder, 
        folders: customFolders,
        message: directoryCreated ? 'Smart folder created successfully' : 'Smart folder added (directory already existed)',
        directoryCreated,
        directoryExisted,
        llmEnhanced: !!llmEnhancedData.enhancedDescription
      };
    } catch (saveError) {
      // Rollback configuration
      customFolders.length = 0;
      customFolders.push(...originalFolders);
      
      // Rollback directory creation if we created it
      if (directoryCreated && !directoryExisted) {
        try {
          await fs.rmdir(normalizedPath);
          logger.info('[SMART-FOLDERS] Rolled back directory creation:', normalizedPath);
        } catch (rollbackError) {
          logger.error('[SMART-FOLDERS] Failed to rollback directory:', rollbackError.message);
        }
      }
      
      return { 
        success: false, 
        error: 'Failed to save configuration, changes rolled back',
        errorCode: 'CONFIG_SAVE_FAILED',
        details: saveError.message
      };
    }
  } catch (error) {
    logger.error('[ERROR] Failed to add smart folder:', error);
    return { 
      success: false, 
      error: 'Failed to add smart folder',
      errorCode: 'ADD_FOLDER_FAILED',
      details: error.message
    };
  }
});

// SmartFolders LLM enhancement moved to services/SmartFoldersLLMService.js

// Error handling
logger.info('✅ StratoSort main process initialized');

// Add comprehensive error handling (single registration)
process.on('uncaughtException', (error) => {
  logger.error('UNCAUGHT EXCEPTION:', { message: error.message, stack: error.stack });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('UNHANDLED REJECTION', { reason, promise: String(promise) });
});

// Keep the process alive for debugging
logger.debug('[DEBUG] Process should stay alive. If you see this and the app closes, check for errors above.');

// Analysis History handlers
ipcMain.handle(IPC_CHANNELS.ANALYSIS_HISTORY.GET, async (event, options = {}) => {
  try {
    const { all = false, limit, offset = 0 } = options || {};
    if (all || limit === 'all') {
      const full = await serviceIntegration?.analysisHistory?.getRecentAnalysis(Number.MAX_SAFE_INTEGER) || [];
      if (offset > 0) {
        return full.slice(offset);
      }
      return full;
    }
    const effLimit = typeof limit === 'number' && limit > 0 ? limit : 50;
    if (offset > 0) {
      const interim = await serviceIntegration?.analysisHistory?.getRecentAnalysis(effLimit + offset) || [];
      return interim.slice(offset, offset + effLimit);
    }
    return await serviceIntegration?.analysisHistory?.getRecentAnalysis(effLimit) || [];
  } catch (error) {
    logger.error('Failed to get analysis history:', error);
    return [];
  }
});

ipcMain.handle(IPC_CHANNELS.ANALYSIS_HISTORY.SEARCH, async (event, query = '', options = {}) => {
  try {
    return await serviceIntegration?.analysisHistory?.searchAnalysis(query, options) || [];
  } catch (error) {
    logger.error('Failed to search analysis history:', error);
    return [];
  }
});

ipcMain.handle(IPC_CHANNELS.ANALYSIS_HISTORY.GET_FILE_HISTORY, async (event, filePath) => {
  try {
    return await serviceIntegration?.analysisHistory?.getAnalysisByPath(filePath) || null;
  } catch (error) {
    logger.error('Failed to get file analysis history:', error);
    return null;
  }
});

ipcMain.handle(IPC_CHANNELS.ANALYSIS_HISTORY.CLEAR, async () => {
  try {
    await serviceIntegration?.analysisHistory?.createDefaultStructures();
    return { success: true };
  } catch (error) {
    logger.error('Failed to clear analysis history:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle(IPC_CHANNELS.ANALYSIS_HISTORY.EXPORT, async (event, format = 'json') => {
  try {
    const history = await serviceIntegration?.analysisHistory?.getRecentAnalysis(10000) || [];
    if (format === 'json') {
      return { success: true, data: JSON.stringify(history, null, 2) };
    }
    // Future: handle csv or other formats
    return { success: true, data: history };
  } catch (error) {
    logger.error('Failed to export analysis history:', error);
    return { success: false, error: error.message };
  }
});

// System metrics handler
ipcMain.handle(IPC_CHANNELS.SYSTEM.GET_METRICS, async () => {
  try {
    return await systemAnalytics.collectMetrics();
  } catch (error) {
    logger.error('Failed to collect system metrics:', error);
    return {};
  }
});

// Audio analysis handler REMOVED - audio analysis disabled
// ipcMain.handle(IPC_CHANNELS.ANALYSIS.ANALYZE_AUDIO, async (event, filePath) => {
//   try {
//     logger.info(`[IPC-AUDIO-ANALYSIS] Starting audio analysis for: ${filePath}`);
//     
//     // Get current smart folders to pass to analysis
//     const smartFolders = customFolders.filter(f => !f.isDefault || f.path);
//     const folderCategories = smartFolders.map(f => ({
//       name: f.name,
//       description: f.description || '',
//       id: f.id
//     }));
//     
//     logger.info(`[IPC-AUDIO-ANALYSIS] Using ${folderCategories.length} smart folders for context:`, folderCategories.map(f => f.name).join(', '));
//     
//     const result = await analyzeAudioFile(filePath, folderCategories);
//     
//     logger.info(`[IPC-AUDIO-ANALYSIS] Result:`, {
//       success: !result.error,
//       category: result.category,
//       keywords: result.keywords?.length || 0,
//       confidence: result.confidence,
//       has_transcription: result.has_transcription
//     });
//     
//     return result;
//   } catch (error) {
//     logger.error(`[IPC] Audio analysis failed for ${filePath}:`, error);
//     return {
//       error: error.message,
//       suggestedName: path.basename(filePath, path.extname(filePath)),
//       category: 'audio',
//       keywords: [],
//       confidence: 0,
//       has_transcription: false
//     };
//   }
// });


// NOTE: Duplicate TRANSCRIBE_AUDIO handler removed to prevent registration error
