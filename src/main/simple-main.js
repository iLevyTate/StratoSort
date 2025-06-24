const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');

const path = require('path');
const fs = require('fs').promises;
const { existsSync } = require('fs');
const { performance } = require('perf_hooks');

// Load environment variables
require('dotenv-flow').config();

// Environment detection
const isDev = process.env.NODE_ENV === 'development';

const { IPC_CHANNELS, ALL_SUPPORTED_EXTENSIONS } = require('../shared/constants');
const { logger } = require('../shared/logger');

const { analyzeDocumentFile } = require('./analysis/ollamaDocumentAnalysis');
const { analyzeImageFile } = require('./analysis/ollamaImageAnalysis');
const { 
  AnalysisError, 
  ModelMissingError, 
  FileProcessingError,
  OllamaConnectionError 
} = require('./errors/AnalysisError');
const ServiceIntegration = require('./services/ServiceIntegration');

let mainWindow;

// Initialize service integration
let serviceIntegration;

// Ollama model management
async function getOllamaModel() {
  return serviceIntegration.modelManager.getCurrentModel();
}

async function setOllamaModel(modelName) {
  return serviceIntegration.modelManager.setAndVerifyModel(modelName);
}

// Legacy folder management functions removed - now handled by SmartFolderService

// System monitoring and analytics
const systemAnalytics = {
  startTime: Date.now(),
  processedFiles: 0,
  successfulOperations: 0,
  failedOperations: 0,
  totalProcessingTime: 0,
  errors: [],
  ollamaHealth: { status: 'unknown', lastCheck: null },

  recordProcessingTime(duration) {
    this.totalProcessingTime += duration;
    this.processedFiles++;
  },

  recordSuccess() {
    this.successfulOperations++;
  },

  recordFailure(error) {
    this.failedOperations++;
    this.errors.push({
      timestamp: Date.now(),
      message: error.message || error.toString(),
      stack: error.stack
    });
    // Keep only last 100 errors
    if (this.errors.length > 100) {
      this.errors = this.errors.slice(-100);
    }
  },

  async collectMetrics() {
    const uptime = Date.now() - this.startTime;
    const avgProcessingTime = this.processedFiles > 0 ? this.totalProcessingTime / this.processedFiles : 0;
    
    // Basic system metrics
    const metrics = {
      uptime,
      processedFiles: this.processedFiles,
      successfulOperations: this.successfulOperations,
      failedOperations: this.failedOperations,
      avgProcessingTime: Math.round(avgProcessingTime),
      errorRate: this.processedFiles > 0 ? (this.failedOperations / this.processedFiles) * 100 : 0,
      recentErrors: this.errors.slice(-10),
      ollamaHealth: this.ollamaHealth
    };

    // Try to get basic Node.js process metrics
    try {
      const memUsage = process.memoryUsage();
      metrics.memory = {
        used: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
        total: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
        rss: Math.round(memUsage.rss / 1024 / 1024) // MB
      };
    } catch (error) {
      logger.warn('Could not collect memory metrics', { 
        component: 'analytics',
        error: error.message 
      });
    }

    return metrics;
  },

  getFailureRate() {
    return this.processedFiles > 0 ? (this.failedOperations / this.processedFiles) * 100 : 0;
  },

  destroy() {
    // Cleanup analytics data
    this.errors = [];
    logger.info('System analytics cleaned up', { component: 'analytics' });
  }
};

// Create the browser window
function createWindow() {
  logger.debug('createWindow() called', { component: 'window-manager' });
  
  // Prevent creating multiple windows
  if (mainWindow && !mainWindow.isDestroyed()) {
    logger.debug('Window already exists, focusing existing window', { 
      component: 'window-manager',
      windowExists: true 
    });
    mainWindow.focus();
    return;
  }
  
  logger.debug('Creating new browser window', { component: 'window-manager' });
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    x: 100,
    y: 100,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      enableRemoteModule: false,
      preload: path.join(__dirname, '../preload/preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      // Production optimizations
      backgroundThrottling: false,
      devTools: isDev, // Only enable dev tools in development
      // GPU acceleration settings
      hardwareAcceleration: true,
      enableWebGL: true
    },
    icon: path.join(__dirname, '../../assets/stratosort-logo.png'),
    show: false,
    titleBarStyle: 'default',
    autoHideMenuBar: !isDev // Hide menu bar in production
  });
  
  logger.debug('BrowserWindow created successfully', { 
    component: 'window-manager',
    isDev,
    devTools: isDev 
  });

  // Load the app
  if (isDev) {
    // Try to load from webpack dev server, fallback to built files
    mainWindow.loadURL('http://localhost:3000').catch((error) => {
      logger.warn('Development server not available, loading from built files', { 
        component: 'window-manager',
        error: error.message 
      });
      const distPath = path.join(__dirname, '../../dist/index.html');
      mainWindow.loadFile(distPath).catch((fileError) => {
        logger.error('Failed to load from built files, trying original', { 
          component: 'window-manager',
          error: fileError.message 
        });
        mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
      });
    });
    // Only open dev tools in development mode if explicitly requested
    if (process.env.FORCE_DEV_TOOLS === 'true') {
      mainWindow.webContents.openDevTools();
    }
  } else {
    // In production, load from built files
    const distPath = path.join(__dirname, '../../dist/index.html');
    mainWindow.loadFile(distPath).catch((error) => {
      logger.error('Failed to load from dist, falling back to renderer', { 
        component: 'window-manager',
        error: error.message 
      });
      mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    });
  }

  // Set additional security headers
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' http://localhost:11434 ws://localhost:*; object-src 'none'; base-uri 'self'; form-action 'self';"
        ]
      }
    });
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus(); // Ensure window is focused
    mainWindow.moveTop(); // Bring window to front
    logger.info('StratoSort window ready and focused', { 
      component: 'window-manager',
      isVisible: mainWindow.isVisible(),
      isFocused: mainWindow.isFocused(),
      isMinimized: mainWindow.isMinimized()
    });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const allowedDomains = [
      'https://github.com',
      'https://docs.github.com',
      'https://microsoft.com',
      'https://docs.microsoft.com',
      'https://ollama.ai'
    ];
    
    if (allowedDomains.some((domain) => url.startsWith(domain))) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

// ===== IPC HANDLERS =====
// ALL IPC handlers must be registered BEFORE app.whenReady()

ipcMain.handle(IPC_CHANNELS.FILES.CREATE_FOLDER, async (event, folderPath) => {
  try {
    const normalizedPath = path.resolve(folderPath);
    await fs.mkdir(normalizedPath, { recursive: true });
    logger.info('Folder created successfully', { 
      component: 'file-ops',
      operation: 'create-folder',
      folderPath: normalizedPath 
    });
    return { success: true, path: normalizedPath };
  } catch (error) {
    logger.error('Failed to create folder', { 
      component: 'file-ops',
      operation: 'create-folder',
      error: error.message,
      folderPath 
    });
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
        logger.info('Folder already exists', {
          component: 'file-operations',
          path: normalizedPath
        });
        return { success: true, path: normalizedPath, existed: true };
      }
    } catch (statError) {
      // Folder doesn't exist, proceed with creation
    }
    
    await fs.mkdir(normalizedPath, { recursive: true });
    logger.info('Created folder successfully', {
      component: 'file-operations',
      path: normalizedPath
    });
    return { success: true, path: normalizedPath, existed: false };
  } catch (error) {
    logger.error('Error creating folder', {
      component: 'file-operations', 
      path: normalizedPath,
      error: error.message
    });
    
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
    logger.info('Folder deleted successfully', { 
      component: 'file-ops',
      path: normalizedPath 
    });
    return { 
      success: true, 
      path: normalizedPath, 
      message: 'Folder deleted successfully' 
    };
  } catch (error) {
    logger.error('Error deleting folder', { 
      component: 'file-ops',
      path: normalizedPath,
      error: error.message
    });
    
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
    const result = items.map((item) => ({
      name: item.name,
      path: path.join(dirPath, item.name),
      isDirectory: item.isDirectory(),
      isFile: item.isFile()
    }));
    logger.info('Listed directory contents', { 
      component: 'file-ops',
      dirPath,
      itemCount: result.length 
    });
    return result;
  } catch (error) {
    logger.error('Error reading directory', { 
      component: 'file-ops',
      dirPath,
      error: error.message
    });
    return { error: error.message };
  }
});

// Handle file operations (move, copy, delete, batch organize)
ipcMain.handle(IPC_CHANNELS.FILES.PERFORM_OPERATION, async (event, operation) => {
  try {
    logger.info('File operation initiated', { 
      component: 'file-ops',
      operation: operation.type,
      details: operation.type === 'batch_organize' ? 
        { fileCount: operation.operations?.length } : 
        { source: operation.source, destination: operation.destination }
    });
    
    if (operation.type === 'move') {
      logger.debug('Moving file', { 
        component: 'file-ops',
        source: operation.source,
        destination: operation.destination 
      });
      await fs.rename(operation.source, operation.destination);
      logger.info('File moved successfully', { 
        component: 'file-ops',
        source: operation.source,
        destination: operation.destination 
      });
      return { success: true, type: 'move' };
    } else if (operation.type === 'copy') {
      logger.debug('Copying file', { 
        component: 'file-ops',
        source: operation.source,
        destination: operation.destination 
      });
      await fs.copyFile(operation.source, operation.destination);
      logger.info('File copied successfully', { 
        component: 'file-ops',
        source: operation.source,
        destination: operation.destination 
      });
      return { success: true, type: 'copy' };
    } else if (operation.type === 'delete') {
      logger.debug('Deleting file', { 
        component: 'file-ops',
        source: operation.source 
      });
      await fs.unlink(operation.source);
      logger.info('File deleted successfully', { 
        component: 'file-ops',
        source: operation.source 
      });
      return { success: true, type: 'delete' };
    } else if (operation.type === 'batch_organize') {
      logger.info('Starting batch file organization', { 
        component: 'file-ops',
        fileCount: operation.operations.length 
      });
      
      const results = [];
      let successCount = 0;
      let failCount = 0;
        
      for (let i = 0; i < operation.operations.length; i++) {
        const op = operation.operations[i];
        
        logger.debug('Processing batch operation', { 
          component: 'file-ops',
          progress: `${i+1}/${operation.operations.length}`,
          source: op.source,
          destination: op.destination 
        });
            
        try {
          // Validate operation data
          if (!op.source || !op.destination) {
            throw new Error(`Invalid operation data: source="${op.source}", destination="${op.destination}"`);
          }
            
          // Ensure destination directory exists
          const destDir = path.dirname(op.destination);
          logger.debug('Ensuring destination directory exists', { 
            component: 'file-ops',
            destDir 
          });
          await fs.mkdir(destDir, { recursive: true });
            
          // Check if source file exists
          const sourceStats = await fs.stat(op.source);
          if (!sourceStats.isFile()) {
            throw new Error(`Source file does not exist: ${op.source}`);
          }

          logger.debug('Source file verified', { 
            component: 'file-ops',
            source: op.source,
            size: sourceStats.size 
          });
            
          // Check if destination already exists
          try {
            await fs.access(op.destination);
            logger.warn('Destination already exists, generating unique name', { 
              component: 'file-ops',
              destination: op.destination 
            });
            // Generate unique filename if destination exists
            let counter = 1;
            let uniqueDestination = op.destination;
            const ext = path.extname(op.destination);
            const baseName = op.destination.replace(ext, '');
              
            while (existsSync(uniqueDestination)) {
              uniqueDestination = `${baseName}_${counter}${ext}`;
              counter++;
            }
              
            if (uniqueDestination !== op.destination) {
              logger.info('Using unique filename', { 
                component: 'file-ops',
                original: op.destination,
                unique: uniqueDestination 
              });
              op.destination = uniqueDestination;
            }
          } catch (accessError) {
            logger.debug('Destination path is available', { 
              component: 'file-ops',
              destination: op.destination 
            });
          }
            
          // Move the file (handle cross-drive moves on Windows)
          logger.debug('Moving file to destination', { 
            component: 'file-ops',
            source: op.source,
            destination: op.destination 
          });
            
          try {
            await fs.rename(op.source, op.destination);
            logger.info('File moved successfully', { 
              component: 'file-ops',
              fileName: path.basename(op.source),
              destination: path.dirname(op.destination) 
            });
          } catch (renameError) {
            if (renameError.code === 'EXDEV') {
              // Cross-device move detected, use copy+delete
              logger.debug('Cross-device move detected, using copy+delete', { 
                component: 'file-ops' 
              });
              
              await fs.copyFile(op.source, op.destination);
                
              // Verify the copy was successful before deleting original
              const copyStats = await fs.stat(op.destination);
              if (copyStats.size !== sourceStats.size) {
                throw new Error('File copy verification failed - size mismatch');
              }
                
              await fs.unlink(op.source);
              logger.info('File copied and removed successfully', { 
                component: 'file-ops',
                fileName: path.basename(op.source) 
              });
            } else {
              throw renameError;
            }
          }
            
          results.push({
            source: op.source,
            destination: op.destination,
            success: true
          });
          successCount++;
            
        } catch (error) {
          logger.error('Batch operation failed for file', { 
            component: 'file-ops',
            operation: i+1,
            error: error.message,
            source: op.source 
          });
            
          results.push({
            source: op.source,
            destination: op.destination,
            success: false,
            error: error.message
          });
          failCount++;
        }
      }
        
      logger.info('Batch operation completed', { 
        component: 'file-ops',
        successCount,
        failCount,
        totalFiles: operation.operations.length 
      });
        
      return {
        success: true,
        type: 'batch_organize',
        results,
        summary: {
          total: operation.operations.length,
          successful: successCount,
          failed: failCount
        }
      };
    } else {
      logger.error('Unknown operation type', { 
        component: 'file-ops',
        operationType: operation.type 
      });
      return { success: false, error: `Unknown operation type: ${operation.type}` };
    }
  } catch (error) {
    logger.error('File operation failed', { 
      component: 'file-ops',
      operation: operation.type,
      error: error.message 
    });
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
    logger.info('File deleted successfully', { 
      component: 'file-ops',
      filePath,
      size: stats.size
    });
    
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
    logger.error('Failed to delete file', { 
      component: 'file-ops',
      error: error.message,
      filePath
    });
    
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
    const normalizedPath = path.resolve(filePath);
    await shell.openPath(normalizedPath);
    logger.info('File opened successfully', { 
      component: 'file-ops',
      operation: 'open-file',
      filePath: normalizedPath 
    });
    return { success: true };
  } catch (error) {
    logger.error('Failed to open file', { 
      component: 'file-ops',
      operation: 'open-file',
      error: error.message,
      filePath 
    });
    return { success: false, error: error.message };
  }
});

// Reveal file in file explorer
ipcMain.handle(IPC_CHANNELS.FILES.REVEAL_IN_FOLDER, async (event, filePath) => {
  try {
    const normalizedPath = path.resolve(filePath);
    shell.showItemInFolder(normalizedPath);
    logger.info('File revealed in folder successfully', { 
      component: 'file-ops',
      operation: 'reveal-file',
      filePath: normalizedPath 
    });
    return { success: true };
  } catch (error) {
    logger.error('Failed to reveal file in folder', { 
      component: 'file-ops',
      operation: 'reveal-file',
      error: error.message,
      filePath 
    });
    return { success: false, error: error.message };
  }
});

// Enhanced copy operation with progress and validation
ipcMain.handle(IPC_CHANNELS.FILES.COPY_FILE, async (event, sourcePath, destinationPath) => {
  try {
    const normalizedSource = path.resolve(sourcePath);
    const normalizedDestination = path.resolve(destinationPath);

    // Ensure destination directory exists
    const destDir = path.dirname(normalizedDestination);
    await fs.mkdir(destDir, { recursive: true });
    
    // Copy the file
    await fs.copyFile(normalizedSource, normalizedDestination);
    
    // Get file stats for logging
    const stats = await fs.stat(normalizedDestination);
    
    logger.info('File copied successfully', { 
      component: 'file-ops',
      operation: 'copy-file',
      source: normalizedSource,
      destination: normalizedDestination,
      size: stats.size 
    });
    
    return { 
      success: true,
      source: normalizedSource,
      destination: normalizedDestination,
      size: stats.size 
    };
  } catch (error) {
    logger.error('Failed to copy file', { 
      component: 'file-ops',
      operation: 'copy-file',
      error: error.message,
      sourcePath,
      destinationPath 
    });
    
    // Provide specific error codes for different failure types
    let errorCode = 'COPY_FAILED';
    let userMessage = 'Failed to copy file';
    
    if (error.code === 'ENOENT') {
      errorCode = 'SOURCE_NOT_FOUND';
      userMessage = 'Source file not found';
    } else if (error.code === 'EACCES' || error.code === 'EPERM') {
      errorCode = 'PERMISSION_DENIED';
      userMessage = 'Permission denied';
    } else if (error.code === 'ENOSPC') {
      errorCode = 'INSUFFICIENT_SPACE';
      userMessage = 'Insufficient disk space';
    }
    
    return { 
      success: false, 
      error: userMessage,
      errorCode,
      details: error.message 
    };
  }
});

// Enhanced folder opening with better path handling
ipcMain.handle(IPC_CHANNELS.FILES.OPEN_FOLDER, async (event, folderPath) => {
  try {
    const normalizedPath = path.resolve(folderPath);
    
    // Verify it's a directory
    const stats = await fs.stat(normalizedPath);
    if (!stats.isDirectory()) {
      throw new Error('Path is not a directory');
    }

    await shell.openPath(normalizedPath);
    logger.info('Folder opened successfully', { 
      component: 'file-ops',
      operation: 'open-folder',
      folderPath: normalizedPath 
    });
    return { success: true };
  } catch (error) {
    logger.error('Failed to open folder', { 
      component: 'file-ops',
      operation: 'open-folder',
      error: error.message,
      folderPath 
    });
    
    let errorCode = 'OPEN_FAILED';
    let userMessage = 'Failed to open folder';
    
    if (error.code === 'ENOENT') {
      errorCode = 'FOLDER_NOT_FOUND';
      userMessage = 'Folder not found';
    } else if (error.message.includes('not a directory')) {
      errorCode = 'NOT_A_DIRECTORY';
      userMessage = 'Path is not a directory';
    }
    
    return { 
      success: false, 
      error: userMessage,
      errorCode,
      details: error.message
    };
  }
});

// Add missing smart folder handlers
ipcMain.handle(IPC_CHANNELS.SMART_FOLDERS.GET, async () => {
  try {
    const folders = await serviceIntegration.smartFolder.getAll();
    logger.info(`Retrieved ${folders.length} smart folders`, { component: 'smart-folders' });
    return { success: true, folders };
  } catch (error) {
    logger.error('Failed to get smart folders', { component: 'smart-folders', error: error.message });
    return { success: false, error: error.message, folders: [] };
  }
});

ipcMain.handle(IPC_CHANNELS.SMART_FOLDERS.ADD, async (event, folderData) => {
  try {
    const result = await serviceIntegration.smartFolder.add(folderData);
    logger.info(`Added smart folder: ${folderData.name}`, { component: 'smart-folders' });
    return { success: true, folder: result };
  } catch (error) {
    logger.error('Failed to add smart folder', { 
      component: 'smart-folders', 
      folderName: folderData?.name,
      error: error.message 
    });
    return { success: false, error: error.message };
  }
});

ipcMain.handle(IPC_CHANNELS.SMART_FOLDERS.EDIT, async (event, folderId, updatedData) => {
  try {
    const result = await serviceIntegration.smartFolder.edit(folderId, updatedData);
    logger.info(`Edited smart folder: ${folderId}`, { component: 'smart-folders' });
    return { success: true, folder: result };
  } catch (error) {
    logger.error('Failed to edit smart folder', { 
      component: 'smart-folders', 
      folderId,
      error: error.message 
    });
    return { success: false, error: error.message };
  }
});

ipcMain.handle(IPC_CHANNELS.SMART_FOLDERS.DELETE, async (event, folderId) => {
  try {
    await serviceIntegration.smartFolder.delete(folderId);
    logger.info(`Deleted smart folder: ${folderId}`, { component: 'smart-folders' });
    return { success: true };
  } catch (error) {
    logger.error('Failed to delete smart folder', { 
      component: 'smart-folders', 
      folderId,
      error: error.message 
    });
    return { success: false, error: error.message };
  }
});

ipcMain.handle(IPC_CHANNELS.SMART_FOLDERS.SCAN_STRUCTURE, async (event, rootPath) => {
  try {
    // Use the existing scanDirectory function for folder scanning
    const files = await scanDirectory(rootPath, { maxDepth: 3, includeSystemFiles: false });
    logger.info(`Scanned folder structure: ${rootPath} (${files.length} files)`, { 
      component: 'smart-folders',
      rootPath,
      fileCount: files.length 
    });
    return { success: true, files: files.map(f => f.path) };
  } catch (error) {
    logger.error('Failed to scan folder structure', { 
      component: 'smart-folders', 
      rootPath,
      error: error.message 
    });
    return { success: false, error: error.message, files: [] };
  }
});

// Analyze a single file (legacy handler - using correct service call)
ipcMain.handle(IPC_CHANNELS.FILE_ANALYZE, async (event, payload) => {
  const { filePath, options = {} } = payload || {};
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.ANALYSIS_PROGRESS, { filePath, status: 'started' });
  }
  try {
    // Get file stats for proper analysis
    const fs = require('fs').promises;
    const stats = await fs.stat(filePath);
    const fileInfo = {
      path: filePath,
      size: stats.size,
      lastModified: stats.mtime.getTime()
    };
    
    const analysis = await serviceIntegration.analyzeFileWithHistory(filePath, fileInfo, options);

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.ANALYSIS_PROGRESS, { filePath, status: 'completed' });
      mainWindow.webContents.send(IPC_CHANNELS.ANALYSIS_COMPLETE, { filePath, analysis });
    }

    return { success: true, analysis };
  } catch (error) {
    logger.error('File analysis IPC handler error', { filePath, error: error.message, stack: error.stack });
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.ANALYSIS_PROGRESS, { filePath, status: 'error' });
      mainWindow.webContents.send(IPC_CHANNELS.ANALYSIS_ERROR, { 
        filePath, 
        error: {
          message: error.message,
          name: error.name,
          stack: error.stack
        } 
      });
    }
    return { success: false, error: error.message };
  }
});

// Get analysis history
ipcMain.handle(IPC_CHANNELS.ANALYSIS_HISTORY.GET, async () => {
  try {
    const history = await serviceIntegration.analysisHistory.getHistory();
    return { success: true, history };
  } catch (error) {
    logger.error('Failed to get analysis history', { component: 'analysis-history', error: error.message });
    return { success: false, error: error.message };
  }
});

// Ollama management
ipcMain.handle(IPC_CHANNELS.OLLAMA.GET_MODELS, async () => {
  try {
    const response = await fetch('http://127.0.0.1:11434/api/tags');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    const models = data.models || [];
    const modelNames = models.map((model) => model.name);
    
    logger.info('Ollama models retrieved successfully', { 
      component: 'ollama',
      operation: 'get-models',
      modelCount: models.length,
      models: modelNames
    });
    
    return { success: true, models: modelNames };
  } catch (error) {
    logger.error('Failed to fetch Ollama models', { 
      component: 'ollama',
      error: error.message
    });
    return { success: false, error: error.message, models: [] };
  }
});

// Test Ollama connection and verify models
ipcMain.handle(IPC_CHANNELS.OLLAMA.TEST_CONNECTION, async () => {
  const testUrl = 'http://127.0.0.1:11434/api/tags';
  
  try {
    logger.debug('Testing Ollama connection', { 
      component: 'ollama',
      testUrl 
    });
    
    const response = await fetch(testUrl, { 
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    const models = data.models || [];
    const modelNames = models.map((model) => model.name);
    
    // Check for required models
    const requiredModels = ['llama3.2:latest', 'mxbai-embed-large:latest'];
    const missingModels = requiredModels.filter((required) => 
      !modelNames.some((available) => available.includes(required.split(':')[0]))
    );
    
    logger.info('Ollama connection test completed', { 
      component: 'ollama',
      modelCount: models.length,
      missingModels: missingModels.length > 0 ? missingModels : undefined 
    });
    
    const result = {
      success: true,
      connected: true,
      models: modelNames,
      modelCount: models.length
    };
    
    if (missingModels.length > 0) {
      logger.warn('Required Ollama models missing', { 
        component: 'ollama',
        missingModels 
      });
      result.missingModels = missingModels;
      result.warning = `Missing required models: ${missingModels.join(', ')}`;
    }
    
    return result;
  } catch (error) {
    logger.error('Ollama connection test failed', { 
      component: 'ollama',
      error: error.message,
      testUrl 
    });
    
    return {
      success: false,
      connected: false,
      error: error.message,
      models: []
    };
  }
});

// Set current Ollama model
ipcMain.handle(IPC_CHANNELS.OLLAMA.SET_MODEL, async (event, modelName) => {
  try {
    if (!modelName || typeof modelName !== 'string') {
      throw new Error('Invalid model name provided');
    }
    
    logger.info('Setting Ollama model', { 
      component: 'ollama',
      operation: 'set-model',
      modelName 
    });
    
    // Get available models to verify the model exists
    const modelsResponse = await fetch('http://127.0.0.1:11434/api/tags');
    if (modelsResponse.ok) {
      const data = await modelsResponse.json();
      const models = data.models || [];
      const modelNames = models.map((model) => model.name);
      
      if (!modelNames.includes(modelName)) {
        logger.warn('Requested model not found in available models', { 
          component: 'ollama',
          requestedModel: modelName,
          availableModels: modelNames 
        });
        return { 
          success: false, 
          error: `Model ${modelName} not found in available models`,
          availableModels: modelNames 
        };
      }
    }
    
    // Set the model using Ollama utilities
    await setOllamaModel(modelName);
    
    logger.info('Ollama model set successfully', { 
      component: 'ollama',
      modelName 
    });
    
    return { success: true, model: modelName };
  } catch (error) {
    logger.error('Failed to set Ollama model', { 
      component: 'ollama',
      error: error.message,
      modelName 
    });
    return { success: false, error: error.message };
  }
});

// Handle undo/redo operations
ipcMain.handle(IPC_CHANNELS.UNDO_REDO.UNDO, async () => {
  try {
    return await serviceIntegration?.undoRedo?.undo() || { success: false, message: 'Undo service unavailable' };
  } catch (error) {
    logger.error('Failed to execute undo', { 
      component: 'undo-redo',
      error: error.message 
    });
    return { success: false, message: error.message };
  }
});

// Settings management
ipcMain.handle(IPC_CHANNELS.SETTINGS.GET, async () => {
  try {
    logger.debug('Getting application settings', { component: 'settings' });
    
    // Default settings
    const defaultSettings = {
      aiModel: 'llama3.2:latest',
      embeddingModel: 'mxbai-embed-large:latest',
      smartFolders: [],
      theme: 'system',
      autoSave: true,
      performanceMode: 'balanced'
    };
    
    const store = await getSettingsStore();
    const settings = store.get('settings', defaultSettings);
    
    logger.info('Settings loaded successfully', { 
      component: 'settings',
      hasSettings: !!settings 
    });
    
    return { success: true, settings };
  } catch (error) {
    logger.error('Failed to get settings', { 
      component: 'settings',
      error: error.message 
    });
    return { success: false, error: error.message, settings: {} };
  }
});

ipcMain.handle(IPC_CHANNELS.SETTINGS.SAVE, async (event, settings) => {
  try {
    logger.debug('Saving application settings', { 
      component: 'settings',
      settingsKeys: Object.keys(settings || {}) 
    });
    
    if (!settings || typeof settings !== 'object') {
      throw new Error('Invalid settings data provided');
    }
    
    const store = await getSettingsStore();
    store.set('settings', settings);
    
    logger.info('Settings saved successfully', { 
      component: 'settings',
      settingsCount: Object.keys(settings).length 
    });
    
    return { success: true };
  } catch (error) {
    logger.error('Failed to save settings', { 
      component: 'settings',
      error: error.message 
    });
    return { success: false, error: error.message };
  }
});

ipcMain.handle(IPC_CHANNELS.UNDO_REDO.REDO, async () => {
  try {
    return await serviceIntegration?.undoRedo?.redo() || { success: false, message: 'Redo service unavailable' };
  } catch (error) {
    logger.error('Failed to execute redo', { 
      component: 'undo-redo',
      error: error.message 
    });
    return { success: false, message: error.message };
  }
});

ipcMain.handle(IPC_CHANNELS.UNDO_REDO.GET_HISTORY, async () => {
  try {
    return await serviceIntegration?.undoRedo?.getHistory() || [];
  } catch (error) {
    logger.error('Failed to get action history', { 
      component: 'undo-redo',
      error: error.message 
    });
    return [];
  }
});

ipcMain.handle(IPC_CHANNELS.UNDO_REDO.CLEAR_HISTORY, async () => {
  try {
    return await serviceIntegration?.undoRedo?.clearHistory() || { success: false, message: 'Undo service unavailable' };
  } catch (error) {
    logger.error('Failed to clear action history', { 
      component: 'undo-redo',
      error: error.message 
    });
    return { success: false, message: error.message };
  }
});

ipcMain.handle(IPC_CHANNELS.UNDO_REDO.CAN_UNDO, async () => {
  try {
    return await serviceIntegration?.undoRedo?.canUndo() || false;
  } catch (error) {
    logger.error('Failed to check undo status', { 
      component: 'undo-redo',
      error: error.message 
    });
    return false;
  }
});

ipcMain.handle(IPC_CHANNELS.UNDO_REDO.CAN_REDO, async () => {
  try {
    return await serviceIntegration?.undoRedo?.canRedo() || false;
  } catch (error) {
    logger.error('Failed to check redo status', { 
      component: 'undo-redo',
      error: error.message 
    });
    return false;
  }
});

// Analysis History handlers
ipcMain.handle(IPC_CHANNELS.ANALYSIS_HISTORY.GET_STATISTICS, async () => {
  try {
    return await serviceIntegration.analysisHistory.getStatistics();
  } catch (error) {
    logger.error('Failed to get analysis statistics', { component: 'analysis-history', error: error.message });
    return { success: false, error: error.message };
  }
});

// Add missing ANALYSIS_HISTORY.SEARCH handler
ipcMain.handle(IPC_CHANNELS.ANALYSIS_HISTORY.SEARCH, async (event, query, options = {}) => {
  try {
    const results = await serviceIntegration.analysisHistory.searchAnalysis(query);
    logger.info(`Analysis history search completed: ${results.length} results`, { 
      component: 'analysis-history',
      query,
      resultCount: results.length 
    });
    return { success: true, results };
  } catch (error) {
    logger.error('Failed to search analysis history', { 
      component: 'analysis-history', 
      query,
      error: error.message 
    });
    return { success: false, error: error.message, results: [] };
  }
});

// New IPC handler for GET_APPLICATION_STATISTICS
ipcMain.handle(IPC_CHANNELS.SYSTEM.GET_APPLICATION_STATISTICS, async () => {
  try {
    return await serviceIntegration.getApplicationStatistics();
  } catch (error) {
    logger.error('Failed to get application statistics', { component: 'system-monitoring', error: error.message });
    return { success: false, error: error.message };
  }
});

// Handle file selection dialog (FILES.SELECT)
ipcMain.handle(IPC_CHANNELS.FILES.SELECT, async () => {
  try {
    console.log('FILES.SELECT handler called'); // Debug log
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'All Supported Files', extensions: ALL_SUPPORTED_EXTENSIONS.map(ext => ext.replace('.', '')) },
        { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'txt', 'md'] },
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'] },
        { name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'aac'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    
    if (canceled) {
      return { success: true, files: [] };
    }
    
    logger.info('Files selected via dialog', { 
      component: 'file-selection',
      fileCount: filePaths.length 
    });
    
    return { success: true, files: filePaths };
  } catch (error) {
    logger.error('Failed to select files', { 
      component: 'file-selection',
      error: error.message 
    });
    return { success: false, error: error.message, files: [] };
  }
});

// Enhanced export handler with proper CSV and JSON generation
ipcMain.handle(IPC_CHANNELS.ANALYSIS_HISTORY.EXPORT, async (event, format) => {
  try {
    const exportFormat = format || 'csv';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `analysis-history-${timestamp}.${exportFormat}`;
    const exportPath = path.join(app.getPath('downloads'), fileName);
    
    // Get full analysis history
    const history = await serviceIntegration.analysisHistory.getHistory();
    
    let exportData = '';
    
    if (exportFormat === 'json') {
      exportData = JSON.stringify({
        exportDate: new Date().toISOString(),
        totalRecords: history.length,
        records: history
      }, null, 2);
    } else {
      // CSV format
      const csvHeaders = 'File Path,Timestamp,Category,Confidence,Keywords,Suggested Name';
      const csvRows = [csvHeaders];
      
      for (const entry of history) {
        const row = [
          `"${entry.filePath || ''}"`,
          `"${entry.timestamp || ''}"`,
          `"${entry.analysis?.suggestedCategory || entry.analysis?.category || ''}"`,
          `"${entry.analysis?.confidence || ''}"`,
          `"${(entry.analysis?.keywords || []).join(';')}"`,
          `"${entry.analysis?.suggestedName || ''}"`
        ];
        csvRows.push(row.join(','));
      }
      exportData = csvRows.join('\n');
    }
    
    // Write export file
    await fs.writeFile(exportPath, exportData, 'utf8');
    
    // Open the export location in file explorer
    shell.showItemInFolder(exportPath);
    
    logger.info('Analysis history exported successfully', { 
      component: 'analysis-history',
      format: exportFormat,
      recordCount: history.length,
      exportPath 
    });
    
    return {
      success: true,
      exportPath,
      recordCount: history.length,
      format: exportFormat
    };
  } catch (error) {
    logger.error('Failed to export analysis history', { 
      component: 'analysis-history',
      format,
      error: error.message 
    });
    return { 
      success: false, 
      error: error.message 
    };
  }
});

// System monitoring handlers
ipcMain.handle(IPC_CHANNELS.SYSTEM.GET_METRICS, async () => {
  try {
    return await systemAnalytics.collectMetrics();
  } catch (error) {
    logger.error('Failed to get system statistics', { 
      component: 'system-monitoring',
      error: error.message
    });
    return {};
  }
});

// Add missing system scan handler
ipcMain.handle(IPC_CHANNELS.SYSTEM.SCAN_COMMON_DIRECTORIES, async () => {
  try {
    const { app } = require('electron');
    const commonPaths = [
      app.getPath('documents'),
      app.getPath('downloads'),
      app.getPath('desktop'),
      app.getPath('pictures')
    ];

    const results = [];
    for (const dirPath of commonPaths) {
      try {
        const scanResult = await scanDirectory(dirPath, { 
          maxDepth: 2, 
          includeFileTypes: true,
          maxFiles: 100 
        });
        
        results.push({
          path: dirPath,
          name: path.basename(dirPath),
          success: true,
          fileCount: scanResult.files?.length || 0,
          folderCount: scanResult.folders?.length || 0,
          files: scanResult.files || [],
          folders: scanResult.folders || []
        });
      } catch (error) {
        results.push({
          path: dirPath,
          name: path.basename(dirPath),
          success: false,
          error: error.message
        });
      }
    }

    return { success: true, directories: results };
  } catch (error) {
    logger.error('Failed to scan common directories', { 
      component: 'system-scan',
      error: error.message
    });
    return { success: false, error: error.message, directories: [] };
  }
});

// Helper function for directory scanning
async function scanDirectory(dirPath, options = {}) {
  const { maxDepth = 3, includeSystemFiles = false } = options;
  
  const scanFolder = async (folderPath, depth = 0) => {
    if (depth > maxDepth) return [];
    
    try {
      const items = await fs.readdir(folderPath, { withFileTypes: true });
      const files = [];
      
      for (const item of items) {
        // Skip system files if not included
        if (!includeSystemFiles && item.name.startsWith('.')) {
          continue;
        }
        
        const itemPath = path.join(folderPath, item.name);
        
        if (item.isFile()) {
          const ext = path.extname(item.name).toLowerCase();
          const supportedExts = [
            '.pdf', '.doc', '.docx', '.txt', '.md', '.rtf',
            '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff',
            '.mp3', '.wav', '.m4a', '.flac', '.ogg',
            '.mp4', '.mov', '.avi', '.mkv',
            '.zip', '.rar', '.7z', '.tar', '.gz'
          ];
          
          if (supportedExts.includes(ext)) {
            try {
              const stats = await fs.stat(itemPath);
              files.push({
                name: item.name,
                path: itemPath,
                type: 'file',
                extension: ext,
                size: stats.size,
                modified: stats.mtime,
                directory: folderPath
              });
            } catch (statError) {
              logger.warn('Failed to get file stats', {
                component: 'directory-scan',
                file: itemPath,
                error: statError.message
              });
            }
          }
        } else if (item.isDirectory() && !item.name.startsWith('.')) {
          const subFiles = await scanFolder(itemPath, depth + 1);
          files.push(...subFiles);
        }
      }
      
      return files;
    } catch (error) {
      logger.warn('Error scanning folder', {
        component: 'directory-scan',
        folderPath,
        error: error.message
      });
      return [];
    }
  };
  
  return await scanFolder(dirPath);
}

// Initialize the application
app.whenReady().then(async () => {
  logger.info('Electron app ready, initializing services', { component: 'startup' });
  
  // Initialize service integration first
  serviceIntegration = new ServiceIntegration();
  await serviceIntegration.initialize();
  
  createWindow();
  
  logger.info('Application initialization complete', { component: 'startup' });
});
      
// Handle window management
app.on('window-all-closed', () => {
  logger.info('All windows closed, quitting app', { component: 'window-manager' });
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  logger.debug('App activated, checking for windows', { component: 'window-manager' });
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Cleanup on app quit
app.on('before-quit', () => {
  logger.info('App quitting, cleaning up resources', { component: 'shutdown' });
  if (systemAnalytics) {
    systemAnalytics.destroy();
  }
});

ipcMain.handle(IPC_CHANNELS.FILES.GET_DOCUMENTS_PATH, async () => {
  try {
    return app.getPath('documents');
  } catch (error) {
    logger.error('Failed to get documents path', { component: 'ipc', error: error.message });
    return null;
  }
});

// Singleton settings store
let settingsStore;
async function getSettingsStore() {
  if (!settingsStore) {
    const { default: Store } = await import('electron-store');
    settingsStore = new Store();
  }
  return settingsStore;
}

// Note: GET_APPLICATION_STATISTICS handler registered above at line 1319
// Note: FILES.SELECT handler registered above at line 1329
// Note: Other file operation handlers registered earlier in the file

// Add missing system error logging handler
ipcMain.handle('log-error', async (event, errorInfo) => {
  try {
    logger.error('Renderer error', { 
      component: 'renderer',
      context: errorInfo.context,
      level: errorInfo.level,
      message: errorInfo.message,
      stack: errorInfo.stack,
      timestamp: errorInfo.timestamp,
      metadata: errorInfo.metadata
    });
    return { success: true };
  } catch (error) {
    console.error('Failed to log renderer error:', error);
    return { success: false, error: error.message };
  }
});

// Add notification handler for renderer notifications
ipcMain.handle('show-notification', async (event, { type, message }) => {
  try {
    // Send notification to main window if it exists
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('notification', { type, message });
    }
    
    // Log the notification
    logger.info('Notification sent', { 
      component: 'notifications',
      type,
      message 
    });
    
    return { success: true };
  } catch (error) {
    logger.error('Failed to show notification', { 
      component: 'notifications',
      error: error.message 
    });
    return { success: false, error: error.message };
  }
});


