const { app } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const { backupAndReplace } = require('../../shared/atomicFileOperations');

class SettingsService {
  constructor() {
    this.settingsPath = path.join(app.getPath('userData'), 'settings.json');
    this.defaults = {
      // UI
      theme: 'system',
      notifications: true,
      // Behavior
      defaultSmartFolderLocation: 'Documents',
      maxConcurrentAnalysis: 3,
      autoOrganize: false,
      backgroundMode: false,
      // AI
      ollamaHost: 'http://127.0.0.1:11434',
      textModel: 'llama3.2:latest',
      visionModel: 'llava:latest',
      embeddingModel: 'mxbai-embed-large',
    };
  }

  async load() {
    try {
      const raw = await fs.readFile(this.settingsPath, 'utf-8');
      const parsed = JSON.parse(raw);
      return { ...this.defaults, ...parsed };
    } catch (err) {
      if (err && err.code !== 'ENOENT') {
        console.warn(
          '[SETTINGS] Failed to read settings, using defaults:',
          err.message,
        );
      }
      return { ...this.defaults };
    }
  }

  async save(settings) {
    const merged = { ...this.defaults, ...(settings || {}) };
    await fs.mkdir(path.dirname(this.settingsPath), { recursive: true });
    const result = await backupAndReplace(
      this.settingsPath,
      JSON.stringify(merged, null, 2),
    );
    if (!result.success) {
      throw new Error(result.error || 'Failed to save settings');
    }
    return merged;
  }
}

module.exports = SettingsService;
