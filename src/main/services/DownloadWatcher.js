const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const chokidar = require('chokidar');
const { logger } = require('../../shared/logger');

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
  }

  start() {
    if (this.watcher) return;
    const downloadsPath = path.join(os.homedir(), 'Downloads');
    logger.info('[DOWNLOAD-WATCHER] Watching', downloadsPath);
    this.watcher = chokidar.watch(downloadsPath, { ignoreInitial: true });
    this.watcher.on('add', (filePath) => {
      this.handleFile(filePath).catch((e) =>
        logger.error('[DOWNLOAD-WATCHER] Failed processing', filePath, e),
      );
    });
  }

  stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  async handleFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '' || ext.endsWith('crdownload') || ext.endsWith('tmp')) return;

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
      await fs.mkdir(normalizedDestPath, { recursive: true });
      const baseName = path.basename(filePath);
      const extname = path.extname(baseName);
      const newName = result.suggestedName
        ? `${result.suggestedName}${extname}`
        : baseName;
      const destPath = path
        .join(normalizedDestPath, newName)
        .replace(/\\/g, '/');
      await fs.rename(filePath, destPath);
      logger.info('[DOWNLOAD-WATCHER] Moved', filePath, '=>', destPath);
    } catch (e) {
      logger.error('[DOWNLOAD-WATCHER] Failed to move file', e);
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
