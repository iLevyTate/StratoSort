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
  constructor({
    analyzeDocumentFile,
    analyzeImageFile,
    getCustomFolders,
    autoOrganizeService,
    settingsService,
  }) {
    this.analyzeDocumentFile = analyzeDocumentFile;
    this.analyzeImageFile = analyzeImageFile;
    this.getCustomFolders = getCustomFolders;
    this.autoOrganizeService = autoOrganizeService;
    this.settingsService = settingsService;
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

    // Try to use the new auto-organize service if available
    if (this.autoOrganizeService && this.settingsService) {
      try {
        const settings = await this.settingsService.load();

        // Use the new auto-organize service with suggestions
        const result = await this.autoOrganizeService.processNewFile(
          filePath,
          folders,
          {
            autoOrganizeEnabled: settings.autoOrganize,
            confidenceThreshold: settings.downloadConfidenceThreshold || 0.9,
            defaultLocation: settings.defaultSmartFolderLocation || 'Documents',
          },
        );

        if (result && result.destination) {
          await fs.mkdir(path.dirname(result.destination), { recursive: true });
          await fs.rename(filePath, result.destination);
          logger.info(
            '[DOWNLOAD-WATCHER] Auto-organized with',
            Math.round(result.confidence * 100) + '% confidence:',
            filePath,
            '=>',
            result.destination,
          );
          return;
        } else {
          logger.info(
            '[DOWNLOAD-WATCHER] File not auto-organized (low confidence or disabled)',
          );
          return;
        }
      } catch (e) {
        logger.warn(
          '[DOWNLOAD-WATCHER] Auto-organize service failed, falling back:',
          e,
        );
        // Fall through to original logic
      }
    }

    // Fallback to original logic
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
      await fs.mkdir(destFolder.path, { recursive: true });
      const baseName = path.basename(filePath);
      const extname = path.extname(baseName);
      const newName = result.suggestedName
        ? `${result.suggestedName}${extname}`
        : baseName;
      const destPath = path.join(destFolder.path, newName);
      await fs.rename(filePath, destPath);
      logger.info(
        '[DOWNLOAD-WATCHER] Moved (fallback)',
        filePath,
        '=>',
        destPath,
      );
    } catch (e) {
      logger.error('[DOWNLOAD-WATCHER] Failed to move file', e);
    }
  }

  resolveDestinationFolder(result, folders) {
    if (!result) return null;
    // Prefer explicit smartFolder id
    if (result.smartFolder && result.smartFolder.id) {
      return folders.find((f) => f.id === result.smartFolder.id);
    }
    // Try folder match candidates
    if (Array.isArray(result.folderMatchCandidates)) {
      for (const cand of result.folderMatchCandidates) {
        const found = folders.find(
          (f) => f.id === cand.id || f.name === cand.name,
        );
        if (found) return found;
      }
    }
    // Fallback to category name match
    if (result.category) {
      return folders.find(
        (f) => f.name.toLowerCase() === result.category.toLowerCase(),
      );
    }
    return null;
  }
}

module.exports = DownloadWatcher;
