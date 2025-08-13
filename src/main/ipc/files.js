const path = require('path');
const fs = require('fs').promises;

function registerFilesIpc({ ipcMain, IPC_CHANNELS, logger, dialog, shell, getMainWindow, getServiceIntegration }) {
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

  ipcMain.handle(IPC_CHANNELS.FILES.CREATE_FOLDER_DIRECT, async (event, fullPath) => {
    try {
      const normalizedPath = path.resolve(fullPath);
      try {
        const stats = await fs.stat(normalizedPath);
        if (stats.isDirectory()) {
          logger.info('[FILE-OPS] Folder already exists:', normalizedPath);
          return { success: true, path: normalizedPath, existed: true };
        }
      } catch {}
      await fs.mkdir(normalizedPath, { recursive: true });
      logger.info('[FILE-OPS] Created folder:', normalizedPath);
      return { success: true, path: normalizedPath, existed: false };
    } catch (error) {
      logger.error('[FILE-OPS] Error creating folder:', error);
      let userMessage = 'Failed to create folder';
      if (error.code === 'EACCES' || error.code === 'EPERM') userMessage = 'Permission denied - check folder permissions';
      else if (error.code === 'ENOTDIR') userMessage = 'Invalid path - parent is not a directory';
      else if (error.code === 'EEXIST') userMessage = 'Folder already exists';
      return { success: false, error: userMessage, details: error.message, code: error.code };
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
          await fs.rename(operation.source, operation.destination);
          return { success: true, message: `Moved ${operation.source} to ${operation.destination}` };
        case 'copy':
          await fs.copyFile(operation.source, operation.destination);
          return { success: true, message: `Copied ${operation.source} to ${operation.destination}` };
        case 'delete':
          await fs.unlink(operation.source);
          return { success: true, message: `Deleted ${operation.source}` };
        case 'batch_organize': {
          const results = [];
          let successCount = 0;
          let failCount = 0;
          const batchId = `batch_${Date.now()}`;
          try {
            const svc = getServiceIntegration();
            const batch = await svc?.processingState?.createOrLoadOrganizeBatch(batchId, operation.operations);
            for (let i = 0; i < batch.operations.length; i++) {
              const op = batch.operations[i];
              if (op.status === 'done') { results.push({ success: true, source: op.source, destination: op.destination, operation: op.type || 'move', resumed: true }); successCount++; continue; }
              try {
                await getServiceIntegration()?.processingState?.markOrganizeOpStarted(batchId, i);
                if (!op.source || !op.destination) throw new Error(`Invalid operation data: source="${op.source}", destination="${op.destination}"`);
                const destDir = path.dirname(op.destination);
                await fs.mkdir(destDir, { recursive: true });
                try { await fs.access(op.source); } catch { throw new Error(`Source file does not exist: ${op.source}`); }
                try {
                  await fs.access(op.destination);
                  let counter = 1; let uniqueDestination = op.destination; const ext = path.extname(op.destination); const baseName = op.destination.slice(0, -ext.length);
                  while (true) { try { await fs.access(uniqueDestination); counter++; uniqueDestination = `${baseName}_${counter}${ext}`; if (counter > 1000) throw new Error('Too many name collisions while generating unique destination'); } catch { break; } }
                  if (uniqueDestination !== op.destination) op.destination = uniqueDestination;
                } catch {}
                try { await fs.rename(op.source, op.destination); } catch (renameError) { if (renameError.code === 'EXDEV') { await fs.copyFile(op.source, op.destination); const sourceStats = await fs.stat(op.source); const destStats = await fs.stat(op.destination); if (sourceStats.size !== destStats.size) throw new Error('File copy verification failed - size mismatch'); await fs.unlink(op.source); } else { throw renameError; } }
                await getServiceIntegration()?.processingState?.markOrganizeOpDone(batchId, i, { destination: op.destination });
                results.push({ success: true, source: op.source, destination: op.destination, operation: op.type || 'move' }); successCount++;
                const win = getMainWindow();
                if (win && !win.isDestroyed()) {
                  win.webContents.send('operation-progress', { type: 'batch_organize', current: i + 1, total: batch.operations.length, currentFile: path.basename(op.source) });
                }
              } catch (error) {
                await getServiceIntegration()?.processingState?.markOrganizeOpError(batchId, i, error.message);
                results.push({ success: false, source: op.source, destination: op.destination, error: error.message, operation: op.type || 'move' }); failCount++;
              }
            }
            await getServiceIntegration()?.processingState?.completeOrganizeBatch(batchId);
          } catch {}
          return { success: successCount > 0, results, successCount, failCount, summary: `Processed ${operation.operations.length} files: ${successCount} successful, ${failCount} failed`, batchId };
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
      if (!filePath || typeof filePath !== 'string') {
        return { success: false, error: 'Invalid file path provided', errorCode: 'INVALID_PATH' };
      }
      try { await fs.access(filePath); } catch (accessError) {
        return { success: false, error: 'File not found or inaccessible', errorCode: 'FILE_NOT_FOUND', details: accessError.message };
      }
      const stats = await fs.stat(filePath);
      await fs.unlink(filePath);
      logger.info('[FILE-OPS] Deleted file:', filePath, `(${stats.size} bytes)`);
      return { success: true, message: 'File deleted successfully', deletedFile: { path: filePath, size: stats.size, deletedAt: new Date().toISOString() } };
    } catch (error) {
      logger.error('[FILE-OPS] Error deleting file:', error);
      let errorCode = 'DELETE_FAILED'; let userMessage = 'Failed to delete file';
      if (error.code === 'ENOENT') { errorCode = 'FILE_NOT_FOUND'; userMessage = 'File not found'; }
      else if (error.code === 'EACCES' || error.code === 'EPERM') { errorCode = 'PERMISSION_DENIED'; userMessage = 'Permission denied - file may be in use'; }
      else if (error.code === 'EBUSY') { errorCode = 'FILE_IN_USE'; userMessage = 'File is currently in use'; }
      return { success: false, error: userMessage, errorCode, details: error.message, systemError: error.code };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FILES.OPEN_FILE, async (event, filePath) => {
    try { await shell.openPath(filePath); logger.info('[FILE-OPS] Opened file:', filePath); return { success: true }; }
    catch (error) { logger.error('[FILE-OPS] Error opening file:', error); return { success: false, error: error.message }; }
  });

  ipcMain.handle(IPC_CHANNELS.FILES.REVEAL_FILE, async (event, filePath) => {
    try { await shell.showItemInFolder(filePath); logger.info('[FILE-OPS] Revealed file in folder:', filePath); return { success: true }; }
    catch (error) { logger.error('[FILE-OPS] Error revealing file:', error); return { success: false, error: error.message }; }
  });

  ipcMain.handle(IPC_CHANNELS.FILES.COPY_FILE, async (event, sourcePath, destinationPath) => {
    try {
      if (!sourcePath || !destinationPath) { return { success: false, error: 'Source and destination paths are required', errorCode: 'INVALID_PATHS' }; }
      const normalizedSource = path.resolve(sourcePath);
      const normalizedDestination = path.resolve(destinationPath);
      try { await fs.access(normalizedSource); } catch (accessError) { return { success: false, error: 'Source file not found', errorCode: 'SOURCE_NOT_FOUND', details: accessError.message }; }
      const destDir = path.dirname(normalizedDestination);
      await fs.mkdir(destDir, { recursive: true });
      const sourceStats = await fs.stat(normalizedSource);
      await fs.copyFile(normalizedSource, normalizedDestination);
      logger.info('[FILE-OPS] Copied file:', normalizedSource, 'to', normalizedDestination);
      return { success: true, message: 'File copied successfully', operation: { source: normalizedSource, destination: normalizedDestination, size: sourceStats.size, copiedAt: new Date().toISOString() } };
    } catch (error) {
      logger.error('[FILE-OPS] Error copying file:', error);
      let errorCode = 'COPY_FAILED'; let userMessage = 'Failed to copy file';
      if (error.code === 'ENOSPC') { errorCode = 'INSUFFICIENT_SPACE'; userMessage = 'Insufficient disk space'; }
      else if (error.code === 'EACCES' || error.code === 'EPERM') { errorCode = 'PERMISSION_DENIED'; userMessage = 'Permission denied'; }
      else if (error.code === 'EEXIST') { errorCode = 'FILE_EXISTS'; userMessage = 'Destination file already exists'; }
      return { success: false, error: userMessage, errorCode, details: error.message };
    }
  });
}

module.exports = registerFilesIpc;


