const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');

const path = require('path');
const fs = require('fs').promises;
const { existsSync } = require('fs');

// Load environment variables
require('dotenv-flow').config();

// Environment detection
const isDev = process.env.NODE_ENV === 'development';

const { IPC_CHANNELS } = require('../shared/constants');
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
let customFolders = []; // Initialize customFolders at module level

// Initialize service integration
let serviceIntegration;

// Persistent storage path for custom folders
const getCustomFoldersPath = () => {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'custom-folders.json');
};

// Load custom folders from persistent storage
async function loadCustomFolders() {
  try {
    const filePath = getCustomFoldersPath();
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    logger.info('No saved custom folders found, using defaults', { 
      component: 'startup',
      configPath: getCustomFoldersPath() 
    });
    
    // Get the Documents path for default folders
    const documentsPath = app.getPath('documents');
    
    // Return default smart folders with proper paths
    return [
      {
        id: 'financial',
        name: 'Financial Documents',
        description: 'Invoices, receipts, tax documents, financial statements, bank records',
        path: path.join(documentsPath, 'Financial Documents'),
        isDefault: true
      },
      {
        id: 'projects',
        name: 'Project Files',
        description: 'Project documentation, proposals, specifications, project plans',
        path: path.join(documentsPath, 'Project Files'),
        isDefault: true
      }
    ];
  }
}

// Save custom folders to persistent storage
async function saveCustomFolders(folders) {
  try {
    const filePath = getCustomFoldersPath();
    await fs.writeFile(filePath, JSON.stringify(folders, null, 2));
    logger.info('Custom folders saved successfully', { 
      component: 'storage',
      filePath,
      folderCount: folders.length 
    });
  } catch (error) {
    logger.error('Failed to save custom folders', { 
      component: 'storage',
      error: error.message,
      filePath 
    });
  }
}

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
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' http://localhost:11434 ws://localhost:*; object-src 'none'; base-uri 'self'; form-action 'self';"
        ]
      }
    });
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus(); // Ensure window is focused
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

// Enhanced Smart Folders with comprehensive validation and atomic operations
ipcMain.handle(IPC_CHANNELS.SMART_FOLDERS.GET, async () => {
  logger.info('Getting Smart Folders for UI', { customFoldersCount: customFolders.length });
  
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
  logger.info('Getting Custom Folders for UI', { customFoldersCount: customFolders.length });
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
      logger.info('Saved Smart Folders', { foldersCount: folders.length });
      return { success: true, folders: customFolders };
    } catch (saveError) {
      // Rollback on failure
      customFolders = originalFolders;
      throw saveError;
    }
  } catch (error) {
    logger.error('Failed to save smart folders', { 
      component: 'smart-folders',
      error: error.message 
    });
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
      logger.info('Updated Custom Folders', { foldersCount: folders.length });
      return { success: true, folders: customFolders };
    } catch (saveError) {
      // Rollback on failure
      customFolders = originalFolders;
      throw saveError;
    }
  } catch (error) {
    logger.error('Failed to update custom folders', { 
      component: 'smart-folders',
      error: error.message 
    });
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

    const folderIndex = customFolders.findIndex((f) => f.id === folderId);
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
      const existingFolder = customFolders.find((f) => 
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
        logger.info('Renamed directory', {
          component: 'smart-folders',
          oldPath,
          newPath
        });
      } catch (renameErr) {
        logger.error('Directory rename failed', {
          component: 'smart-folders',
          error: renameErr.message
        });
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
      logger.info('Edited Smart Folder', { folderId });
      
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
    logger.error('Failed to edit smart folder', { 
      component: 'smart-folders',
      error: error.message 
    });
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

    const folderIndex = customFolders.findIndex((f) => f.id === folderId);
    if (folderIndex === -1) {
      return { success: false, error: 'Folder not found', errorCode: 'FOLDER_NOT_FOUND' };
    }

    // Backup current state for rollback
    const originalFolders = [...customFolders];
    const deletedFolder = customFolders[folderIndex];
    
    try {
      customFolders = customFolders.filter((f) => f.id !== folderId);
      await saveCustomFolders(customFolders);
      logger.info('Deleted Smart Folder', { folderId });
      
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
          logger.warn('Directory removal failed', { 
            component: 'smart-folders',
            error: dirErr.message 
          });
          removalError = dirErr.message;
        }
      }

      return { 
        success: true, 
        folders: customFolders,
        deletedFolder,
        directoryRemoved,
        removalError,
        message: `Smart folder "${deletedFolder.name}" deleted successfully${  directoryRemoved ? ' and its empty directory was removed.' : ''}`
      };
    } catch (saveError) {
      // Rollback on failure
      customFolders = originalFolders;
      logger.error('Failed to save smart folder changes', { 
        component: 'smart-folders',
        error: saveError.message 
      });
      throw saveError;
    }
  } catch (error) {
    logger.error('Failed to delete smart folder', { 
      component: 'smart-folders',
      error: error.message 
    });
    return { 
      success: false, 
      error: error.message,
      errorCode: 'DELETE_FAILED'
    };
  }
});



// Folder scanning
ipcMain.handle(IPC_CHANNELS.SMART_FOLDERS.SCAN_STRUCTURE, async (event, rootPath) => {
  try {
    logger.info('Scanning folder structure', { 
      component: 'folder-scan',
      rootPath 
    });
    
    const scanFolder = async (folderPath, depth = 0, maxDepth = 3) => {
      if (depth > maxDepth) return [];
      
      try {
        const items = await fs.readdir(folderPath, { withFileTypes: true });
        const files = [];
        
        for (const item of items) {
          const itemPath = path.join(folderPath, item.name);
          
          if (item.isFile()) {
            const ext = path.extname(item.name).toLowerCase();
            const supportedExts = ['.pdf', '.doc', '.docx', '.txt', '.md', '.jpg', '.jpeg', '.png', '.gif', '.mp3', '.wav', '.m4a'];
            
            if (supportedExts.includes(ext)) {
              files.push({
                name: item.name,
                path: itemPath,
                type: 'file',
                extension: ext,
                size: (await fs.stat(itemPath)).size
              });
            }
          } else if (item.isDirectory() && !item.name.startsWith('.')) {
            const subFiles = await scanFolder(itemPath, depth + 1, maxDepth);
            files.push(...subFiles);
          }
        }
        
        return files;
      } catch (error) {
        logger.warn('Error scanning folder', { 
          component: 'folder-scan',
          folderPath,
          error: error.message 
        });
        return [];
      }
    };
    
    const files = await scanFolder(rootPath);
    logger.info('Folder scan completed', { 
      component: 'folder-scan',
      rootPath,
      fileCount: files.length 
    });
    return files;
    
  } catch (error) {
    logger.error('Error scanning folder structure', { 
      component: 'folder-scan',
      error: error.message,
      rootPath 
    });
    return { error: error.message };
  }
});



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
            prompt,
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
        logger.warn('Failed to analyze folder similarity', { 
          component: 'semantic-analysis',
          folderName: folder.name,
          error: folderError.message 
        });
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
    logger.error('Folder similarity calculation failed', { 
      component: 'semantic-analysis',
      error: error.message 
    });
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
  const overlap = words1.filter((w) => words2.includes(w)).length;
  const total = Math.max(words1.length, words2.length);
  
  return overlap / total;
}



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
    
      // Try to load settings from storage
  const { default: Store } = await import('electron-store');
  const store = new Store();
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
    
    // Save settings to storage
    const { default: Store } = await import('electron-store');
    const store = new Store();
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
    return await serviceIntegration?.analysisHistory?.getStatistics() || {};
  } catch (error) {
    logger.error('Failed to get analysis statistics', { 
      component: 'analysis-history',
      error: error.message 
    });
    return {};
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

// System scan handler for common directories
ipcMain.handle(IPC_CHANNELS.SYSTEM.SCAN_COMMON_DIRECTORIES, async () => {
  try {
    logger.info('Starting system scan of common directories', { component: 'system-scan' });
    
    const commonDirs = [
      app.getPath('documents'),
      app.getPath('downloads'),
      app.getPath('desktop'),
      app.getPath('pictures'),
      app.getPath('music'),
      app.getPath('videos')
    ];

    const files = [];

    for (const dir of commonDirs) {
      try {
        const dirFiles = await scanDirectory(dir, { maxDepth: 2, includeSystemFiles: false });
        if (dirFiles && Array.isArray(dirFiles)) {
          files.push(...dirFiles);
        }
      } catch (error) {
        logger.warn(`Failed to scan directory ${dir}`, { 
          component: 'system-scan',
          directory: dir,
          error: error.message 
        });
      }
    }

    logger.info(`System scan completed: ${files.length} files found`, { 
      component: 'system-scan',
      fileCount: files.length 
    });

    return { success: true, files, totalDirectories: commonDirs.length };
  } catch (error) {
    logger.error('System scan failed', { 
      component: 'system-scan',
      error: error.message 
    });
    return { success: false, error: error.message, files: [] };
  }
});

// Initialize the application
app.whenReady().then(() => {
  logger.info('Electron app ready, creating window', { component: 'startup' });
  createWindow();
      
  // Initialize service integration
  serviceIntegration = new ServiceIntegration();
  
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
