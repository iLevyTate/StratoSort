const fs = require('fs').promises;
const path = require('path');
const os = require('os');
let chokidar;
try {
  // Optional - wrap require to avoid crash in packaged builds if module missing
  chokidar = require('chokidar');
} catch (e) {
  // eslint-disable-next-line no-console
  console.warn('[DOWNLOAD-WATCHER] chokidar not available:', e && e.message);
  chokidar = null;
}
const { app } = require('electron');
const { logger } = require('../../shared/logger');
const { atomicFileOps } = require('../../shared/atomicFileOperations');

// Simple utility to determine if a path is an image based on extension
const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.webp',
  '.tiff',
  '.svg',
  '.heic',
]);

class DownloadWatcher {
  constructor({ analyzeDocumentFile, analyzeImageFile, getCustomFolders }) {
    this.analyzeDocumentFile = analyzeDocumentFile;
    this.analyzeImageFile = analyzeImageFile;
    this.getCustomFolders = getCustomFolders;
    this.watcher = null;
    this.isEnabled = process.env.DISABLE_DOWNLOAD_WATCHER !== 'true';
  }

  async start() {
    if (this.watcher || !this.isEnabled) {
      if (!this.isEnabled) {
        logger.info(
          '[DOWNLOAD-WATCHER] Watcher disabled via DISABLE_DOWNLOAD_WATCHER=true',
        );
      }
      return;
    }

    try {
      // Use Electron's built-in downloads path instead of hardcoded path
      const downloadsPath = app.getPath('downloads');

      // Verify the downloads directory exists and is accessible
      await fs.access(downloadsPath);
      logger.info('[DOWNLOAD-WATCHER] Watching', downloadsPath);

      // Enhanced chokidar configuration to prevent issues
      if (!chokidar) {
        logger.warn(
          '[DOWNLOAD-WATCHER] chokidar module not found; download watcher disabled',
        );
        return;
      }

      this.watcher = chokidar.watch(downloadsPath, {
        ignoreInitial: true,
        // Ignore common temporary and system files
        ignored: [
          /(^|[/\\])\../, // dotfiles
          /.*\.crdownload$/, // Chrome downloads
          /.*\.tmp$/, // temp files
          /.*\.download$/, // download files
          /.*\.part$/, // partial files
          /.*\.sw[a-z]$/, // vim swap files
          /Thumbs\.db$/, // Windows thumbnails
          /desktop\.ini$/, // Windows desktop.ini
        ],
        // Performance optimizations
        awaitWriteFinish: {
          stabilityThreshold: 1000, // Wait 1 second after last write
          pollInterval: 100, // Check every 100ms
        },
        // Limit depth to prevent watching too many subdirectories
        depth: 3,
        // Don't follow symlinks
        followSymlinks: false,
        // Use polling on Windows to avoid file system issues
        usePolling: process.platform === 'win32',
        // Polling interval for Windows
        interval: process.platform === 'win32' ? 1000 : undefined,
      });

      this.watcher.on('add', (filePath) => {
        logger.debug('[DOWNLOAD-WATCHER] File added:', filePath);
        this.handleFile(filePath).catch((e) =>
          logger.error('[DOWNLOAD-WATCHER] Failed processing', filePath, e),
        );
      });

      this.watcher.on('error', (error) => {
        logger.error('[DOWNLOAD-WATCHER] Chokidar error:', error);
      });

      // Log when watcher is ready
      this.watcher.on('ready', () => {
        logger.info('[DOWNLOAD-WATCHER] File watcher ready');
      });
    } catch (error) {
      logger.error(
        '[DOWNLOAD-WATCHER] Failed to start watcher:',
        error.message,
      );
      // Don't throw here, just log and continue without watcher
    }
  }

  stop() {
    if (this.watcher) {
      try {
        logger.info('[DOWNLOAD-WATCHER] Stopping file watcher');
        this.watcher.close();
        this.watcher = null;
        logger.info('[DOWNLOAD-WATCHER] File watcher stopped');
      } catch (error) {
        logger.error('[DOWNLOAD-WATCHER] Error stopping watcher:', error);
        // Force cleanup even if close fails
        this.watcher = null;
      }
    }
  }

  async handleFile(filePath) {
    try {
      // Validate file path
      if (!filePath || typeof filePath !== 'string') {
        logger.warn('[DOWNLOAD-WATCHER] Invalid file path received');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();

      // Skip files without extensions or temporary files
      if (
        ext === '' ||
        ext.endsWith('.crdownload') ||
        ext.endsWith('.tmp') ||
        ext.endsWith('.download') ||
        ext.endsWith('.part') ||
        ext.endsWith('.swp') ||
        filePath.includes('~$') // Office temp files
      ) {
        logger.debug('[DOWNLOAD-WATCHER] Skipping temporary file:', filePath);
        return;
      }

      // Add stability check for partial downloads - verify file size is stable
      let fileHandle = null;
      try {
        // Use file handle for better resource management and stability checking
        fileHandle = await fs.open(filePath, 'r');
        const initialStats = await fileHandle.stat();

        // Wait for file stability check interval
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            require('../../shared/constants').TIMEOUTS.FILE_STABILITY_CHECK,
          ),
        );

        // Check if file still exists and get final stats
        const finalStats = await fs.stat(filePath);

        // If file size changed, it's likely still being written
        if (initialStats.size !== finalStats.size) {
          logger.debug(
            '[DOWNLOAD-WATCHER] File size changed, skipping likely partial download:',
            filePath,
          );
          return;
        }
      } catch (e) {
        logger.debug(
          '[DOWNLOAD-WATCHER] Could not verify file stability, skipping:',
          filePath,
          e.message,
        );
        return;
      } finally {
        // Ensure file handle is always closed
        if (fileHandle) {
          try {
            await fileHandle.close();
          } catch (closeError) {
            logger.warn(
              '[DOWNLOAD-WATCHER] Failed to close file handle for',
              filePath,
              closeError.message,
            );
          }
        }
      }

      const folders = this.getCustomFolders().filter((f) => f && f.path);
      const folderCategories = folders.map((f) => ({
        name: f.name,
        description: f.description || '',
        id: f.id,
      }));

      let result;
      try {
        if (IMAGE_EXTENSIONS.has(ext)) {
          result = await this.analyzeImageFile(filePath, folderCategories);
        } else {
          result = await this.analyzeDocumentFile(filePath, folderCategories);
        }
      } catch (e) {
        logger.error('[DOWNLOAD-WATCHER] Analysis failed', e);
        return;
      }

      const destFolder = this.resolveDestinationFolder(result, folders);
      if (!destFolder) return;

      try {
        // Normalize paths for cross-platform compatibility
        const normalizedDestPath = destFolder.path.replace(/\\/g, '/');
        const baseName = path.basename(filePath);
        const extname = path.extname(baseName);
        const newName = result.suggestedName
          ? `${result.suggestedName}${extname}`
          : baseName;
        const destPath = path
          .join(normalizedDestPath, newName)
          .replace(/\\/g, '/');

        // Use atomic file operations for safe move with collision resolution
        try {
          const actualDestPath = await atomicFileOps.atomicMove(
            filePath,
            destPath,
          );
          logger.info(
            '[DOWNLOAD-WATCHER] Moved',
            filePath,
            '=>',
            actualDestPath,
          );
        } catch (moveError) {
          logger.error(
            '[DOWNLOAD-WATCHER] Failed to move file:',
            moveError.message,
          );
        }
      } catch (error) {
        logger.error(
          '[DOWNLOAD-WATCHER] Unexpected error during file processing:',
          error.message,
        );
      }
    } catch (error) {
      logger.error(
        '[DOWNLOAD-WATCHER] Critical error in handleFile:',
        error.message,
      );
    }
  }

  resolveDestinationFolder(result, folders) {
    if (!result) return null;
    // Prefer explicit smartFolder id
    if (result.smartFolder && result.smartFolder.id) {
      return folders.find((f) => f && f.id === result.smartFolder.id) || null;
    }
    // Try folder match candidates
    if (Array.isArray(result.folderMatchCandidates)) {
      for (const cand of result.folderMatchCandidates) {
        const found = folders.find(
          (f) => f && (f.id === cand.id || f.name === cand.name),
        );
        if (found) return found;
      }
    }
    // Fallback to category name match
    if (result.category) {
      return (
        folders.find(
          (f) =>
            f &&
            f.name &&
            f.name.toLowerCase() === result.category.toLowerCase(),
        ) || null
      );
    }
    return null;
  }
}

module.exports = DownloadWatcher;
