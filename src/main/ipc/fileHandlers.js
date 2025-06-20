const { dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { existsSync } = require('fs');
const { IPC_CHANNELS } = require('../../shared/constants');

function setupFileHandlers(ipcMain, getMainWindow) {
ipcMain.handle(IPC_CHANNELS.FILES.CREATE_FOLDER, async (event, basePath, folderName) => {
  const mainWindow = getMainWindow && getMainWindow();
  try {
    const folderPath = path.join(basePath, folderName);
    await fs.mkdir(folderPath, { recursive: true });
    console.log('[FILE-OPS] Created folder:', folderPath);
    return { success: true, path: folderPath };
  } catch (error) {
    console.error('[FILE-OPS] Error creating folder:', error);
    return { success: false, error: error.message };
  }
});

// Create folder using full path directly
ipcMain.handle(IPC_CHANNELS.FILES.CREATE_FOLDER_DIRECT, async (event, fullPath) => {
  const mainWindow = getMainWindow && getMainWindow();
  try {
    // Normalize the path for cross-platform compatibility
    const normalizedPath = path.resolve(fullPath);
    
    // Check if folder already exists
    try {
      const stats = await fs.stat(normalizedPath);
      if (stats.isDirectory()) {
        console.log('[FILE-OPS] Folder already exists:', normalizedPath);
        return { success: true, path: normalizedPath, existed: true };
      }
    } catch (statError) {
      // Folder doesn't exist, proceed with creation
    }
    
    await fs.mkdir(normalizedPath, { recursive: true });
    console.log('[FILE-OPS] Created folder:', normalizedPath);
    return { success: true, path: normalizedPath, existed: false };
  } catch (error) {
    console.error('[FILE-OPS] Error creating folder:', error);
    
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
  const mainWindow = getMainWindow && getMainWindow();
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
    console.log('[FILE-OPS] Deleted folder:', normalizedPath);
    return { 
      success: true, 
      path: normalizedPath, 
      message: 'Folder deleted successfully' 
    };
  } catch (error) {
    console.error('[FILE-OPS] Error deleting folder:', error);
    
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
  const mainWindow = getMainWindow && getMainWindow();
  try {
    const items = await fs.readdir(dirPath, { withFileTypes: true });
    const result = items.map(item => ({
      name: item.name,
      path: path.join(dirPath, item.name),
      isDirectory: item.isDirectory(),
      isFile: item.isFile()
    }));
    console.log('[FILE-OPS] Listed directory contents:', dirPath, result.length, 'items');
    return result;
  } catch (error) {
    console.error('[FILE-OPS] Error reading directory:', error);
    return { error: error.message };
  }
});

ipcMain.handle(IPC_CHANNELS.FILES.PERFORM_OPERATION, async (event, operation) => {
  const mainWindow = getMainWindow && getMainWindow();
  try {
    console.log('[FILE-OPS] Performing operation:', operation.type);
    console.log('[FILE-OPS] Operation details:', JSON.stringify(operation, null, 2));
    
    switch (operation.type) {
      case 'move':
        console.log(`[FILE-OPS] Moving file: ${operation.source} → ${operation.destination}`);
        await fs.rename(operation.source, operation.destination);
        console.log(`[FILE-OPS] ✅ Successfully moved: ${operation.source} → ${operation.destination}`);
        return { success: true, message: `Moved ${operation.source} to ${operation.destination}` };
        
      case 'copy':
        console.log(`[FILE-OPS] Copying file: ${operation.source} → ${operation.destination}`);
        await fs.copyFile(operation.source, operation.destination);
        console.log(`[FILE-OPS] ✅ Successfully copied: ${operation.source} → ${operation.destination}`);
        return { success: true, message: `Copied ${operation.source} to ${operation.destination}` };
        
      case 'delete':
        console.log(`[FILE-OPS] Deleting file: ${operation.source}`);
        await fs.unlink(operation.source);
        console.log(`[FILE-OPS] ✅ Successfully deleted: ${operation.source}`);
        return { success: true, message: `Deleted ${operation.source}` };
        
      case 'batch_organize':
        console.log(`[FILE-OPS] Starting batch organization of ${operation.operations.length} files`);
        const results = [];
        let successCount = 0;
        let failCount = 0;
        
        for (let i = 0; i < operation.operations.length; i++) {
          const op = operation.operations[i];
          try {
            console.log(`[FILE-OPS] [${i+1}/${operation.operations.length}] Processing: ${op.source}`);
            console.log(`[FILE-OPS] Target: ${op.destination}`);
            
            // Validate operation data
            if (!op.source || !op.destination) {
              throw new Error(`Invalid operation data: source="${op.source}", destination="${op.destination}"`);
            }
            
            // Ensure destination directory exists
            const destDir = path.dirname(op.destination);
            console.log(`[FILE-OPS] Creating directory if needed: ${destDir}`);
            await fs.mkdir(destDir, { recursive: true });
            
            // Check if source file exists
            try {
              await fs.access(op.source);
              const sourceStats = await fs.stat(op.source);
              console.log(`[FILE-OPS] ✅ Source file exists: ${op.source} (${sourceStats.size} bytes)`);
            } catch (accessError) {
              throw new Error(`Source file does not exist: ${op.source}`);
            }
            
            // Check if destination already exists
            try {
              await fs.access(op.destination);
              console.log(`[FILE-OPS] ⚠️  Destination already exists: ${op.destination}`);
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
                console.log(`[FILE-OPS] Using unique name: ${uniqueDestination}`);
                op.destination = uniqueDestination;
              }
            } catch (accessError) {
              console.log(`[FILE-OPS] ✅ Destination path is clear: ${op.destination}`);
            }
            
            // Move the file (handle cross-drive moves on Windows)
            console.log(`[FILE-OPS] Moving: ${op.source} → ${op.destination}`);
            
            try {
              await fs.rename(op.source, op.destination);
              console.log(`[FILE-OPS] ✅ Successfully moved: ${path.basename(op.source)}`);
            } catch (renameError) {
              if (renameError.code === 'EXDEV') {
                // Cross-device link error - copy then delete
                console.log(`[FILE-OPS] Cross-device move detected, using copy+delete`);
                await fs.copyFile(op.source, op.destination);
                
                // Verify copy was successful
                const sourceStats = await fs.stat(op.source);
                const destStats = await fs.stat(op.destination);
                if (sourceStats.size !== destStats.size) {
                  throw new Error('File copy verification failed - size mismatch');
                }
                
                await fs.unlink(op.source);
                console.log(`[FILE-OPS] ✅ Successfully copied and removed: ${path.basename(op.source)}`);
              } else {
                throw renameError;
              }
            }
            
            results.push({
              success: true,
              source: op.source,
              destination: op.destination,
              operation: op.type || 'move'
            });
            
            successCount++;
            
            // Send progress update to renderer
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('operation-progress', {
                current: i + 1,
                total: operation.operations.length,
                file: path.basename(op.source)
              });
            }
            
          } catch (error) {
            console.error(`[FILE-OPS] ❌ Operation ${i+1} failed:`, error.message);
            
            results.push({
              success: false,
              source: op.source,
              destination: op.destination,
              error: error.message,
              operation: op.type || 'move'
            });
            
            failCount++;
          }
        }
        
        console.log(`[FILE-OPS] Batch operation complete: ${successCount} success, ${failCount} failed`);
        
        return {
          success: successCount > 0,
          results: results,
          successCount: successCount,
          failCount: failCount,
          summary: `Processed ${operation.operations.length} files: ${successCount} successful, ${failCount} failed`
        };
        
      default:
        console.error(`[FILE-OPS] Unknown operation type: ${operation.type}`);
        return { success: false, error: `Unknown operation type: ${operation.type}` };
    }
  } catch (error) {
    console.error('[FILE-OPS] Error performing operation:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle(IPC_CHANNELS.FILES.DELETE_FILE, async (event, filePath) => {
  const mainWindow = getMainWindow && getMainWindow();
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
    console.log('[FILE-OPS] Deleted file:', filePath, `(${stats.size} bytes)`);
    
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
    console.error('[FILE-OPS] Error deleting file:', error);
    
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
  const mainWindow = getMainWindow && getMainWindow();
  try {
    await shell.openPath(filePath);
    console.log('[FILE-OPS] Opened file:', filePath);
    return { success: true };
  } catch (error) {
    console.error('[FILE-OPS] Error opening file:', error);
    return { success: false, error: error.message };
  }
});

// Reveal file in file explorer
ipcMain.handle(IPC_CHANNELS.FILES.REVEAL_FILE, async (event, filePath) => {
  const mainWindow = getMainWindow && getMainWindow();
  try {
    await shell.showItemInFolder(filePath);
    console.log('[FILE-OPS] Revealed file in folder:', filePath);
    return { success: true };
  } catch (error) {
    console.error('[FILE-OPS] Error revealing file:', error);
    return { success: false, error: error.message };
  }
});

// Enhanced copy operation with progress and validation
ipcMain.handle(IPC_CHANNELS.FILES.COPY_FILE, async (event, sourcePath, destinationPath) => {
  const mainWindow = getMainWindow && getMainWindow();
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
    console.log('[FILE-OPS] Copied file:', normalizedSource, 'to', normalizedDestination);
    
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
    console.error('[FILE-OPS] Error copying file:', error);
    
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
  const mainWindow = getMainWindow && getMainWindow();
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
    console.log('[FILE-OPS] Opened folder:', normalizedPath);
    
    return { 
      success: true,
      message: 'Folder opened successfully',
      openedPath: normalizedPath
    };
  } catch (error) {
    console.error('[FILE-OPS] Error opening folder:', error);
    return { 
      success: false, 
      error: 'Failed to open folder',
      errorCode: 'OPEN_FAILED',
      details: error.message
    };
  }
});
ipcMain.handle(IPC_CHANNELS.FILES.SELECT, async () => {
  const mainWindow = getMainWindow && getMainWindow();
  console.log('[MAIN-FILE-SELECT] ===== FILE SELECTION HANDLER CALLED =====');
  console.log('[MAIN-FILE-SELECT] mainWindow exists?', !!mainWindow);
  console.log('[MAIN-FILE-SELECT] mainWindow visible?', mainWindow?.isVisible());
  console.log('[MAIN-FILE-SELECT] mainWindow focused?', mainWindow?.isFocused());
  
  try {
    // Make sure window is focused before opening dialog
    if (mainWindow && !mainWindow.isFocused()) {
      console.log('[MAIN-FILE-SELECT] Focusing window before dialog...');
      mainWindow.focus();
    }
    
    console.log('[MAIN-FILE-SELECT] Opening file dialog...');
    
    // Try to ensure window is visible and focused before showing dialog
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        console.log('[MAIN-FILE-SELECT] Restoring minimized window');
        mainWindow.restore();
      }
      if (!mainWindow.isVisible()) {
        console.log('[MAIN-FILE-SELECT] Showing hidden window');
        mainWindow.show();
      }
      if (!mainWindow.isFocused()) {
        console.log('[MAIN-FILE-SELECT] Focusing window');
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
        { name: 'All Supported Files', extensions: ['pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'mp3', 'wav', 'm4a', 'flac', 'ogg', 'zip', 'rar', '7z', 'tar', 'gz'] },
        { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'txt', 'md', 'rtf'] },
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg'] },
        // Audio removed - { name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'flac', 'ogg'] },
        { name: 'Archives', extensions: ['zip', 'rar', '7z', 'tar', 'gz'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    
    console.log('[MAIN-FILE-SELECT] Dialog closed, result:', result);
    
    if (result.canceled || !result.filePaths.length) {
      return { success: false, files: [] };
    }
    
    console.log(`[FILE-SELECTION] Selected ${result.filePaths.length} items`);
    
    const allFiles = [];
    const supportedExts = ['.pdf', '.doc', '.docx', '.txt', '.md', '.rtf', '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.mp3', '.wav', '.m4a', '.flac', '.ogg', '.zip', '.rar', '.7z', '.tar', '.gz'];
    
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
        console.warn(`[FILE-SELECTION] Error scanning folder ${folderPath}:`, error.message);
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
            console.log(`[FILE-SELECTION] Added file: ${path.basename(selectedPath)}`);
          }
        } else if (stats.isDirectory()) {
          // It's a folder - scan for supported files
          console.log(`[FILE-SELECTION] Scanning folder: ${selectedPath}`);
          const folderFiles = await scanFolder(selectedPath);
          allFiles.push(...folderFiles);
          console.log(`[FILE-SELECTION] Found ${folderFiles.length} files in folder: ${path.basename(selectedPath)}`);
        }
      } catch (error) {
        console.warn(`[FILE-SELECTION] Error processing ${selectedPath}:`, error.message);
      }
    }
    
    // Remove duplicates
    const uniqueFiles = [...new Set(allFiles)];
    console.log(`[FILE-SELECTION] Total files collected: ${uniqueFiles.length} (${allFiles.length - uniqueFiles.length} duplicates removed)`);
    
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
    console.error('[MAIN-FILE-SELECT] Failed to select files:', error);
    console.error('[MAIN-FILE-SELECT] Error stack:', error.stack);
    
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
  const mainWindow = getMainWindow && getMainWindow();
  try {
    console.log('[IPC] Opening directory selection dialog');
    
    const result = await dialog.showOpenDialog(mainWindow || null, {
      properties: ['openDirectory', 'dontAddToRecent'],
      title: 'Select Directory to Scan',
      buttonLabel: 'Select Directory'
    });
    
    console.log('[IPC] Directory selection result:', result);
    
    if (result.canceled || !result.filePaths.length) {
      return { success: false, folder: null };
    }
    
    const selectedFolder = result.filePaths[0];
    console.log('[IPC] Selected directory:', selectedFolder);
    
    return { 
      success: true, 
      folder: selectedFolder
    };
  } catch (error) {
    console.error('[IPC] Directory selection failed:', error);
    return { 
      success: false, 
      folder: null,
      error: error.message
    };
  }
});

ipcMain.handle(IPC_CHANNELS.FILES.GET_DOCUMENTS_PATH, async () => {
  const mainWindow = getMainWindow && getMainWindow();
  try {
    return app.getPath('documents');
  } catch (error) {
    console.error('Failed to get documents path:', error);
    return null;
  }
});

ipcMain.handle(IPC_CHANNELS.FILES.GET_FILE_STATS, async (event, filePath) => {
  const mainWindow = getMainWindow && getMainWindow();
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
    console.error('Failed to get file stats:', error);
    return null;
  }
});
}
module.exports = { setupFileHandlers };
