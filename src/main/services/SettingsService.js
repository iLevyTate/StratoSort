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
      // Organization Confidence Thresholds
      autoApproveThreshold: 0.8,
      downloadConfidenceThreshold: 0.9,
      reviewThreshold: 0.5,
      // AI
      ollamaHost: 'http://127.0.0.1:11434',
      textModel: 'llama3.2:latest',
      visionModel: 'llava:latest',
      embeddingModel: 'mxbai-embed-large',
    };
    this._cache = null;
    this._cacheTimestamp = 0;
    this._cacheTtlMs = 2_000; // short TTL to avoid repeated disk reads
  }

  async load() {
    try {
      const now = Date.now();
      if (this._cache && now - this._cacheTimestamp < this._cacheTtlMs) {
        return this._cache;
      }
      const raw = await fs.readFile(this.settingsPath, 'utf-8');
      const parsed = JSON.parse(raw);
      const merged = { ...this.defaults, ...parsed };
      this._cache = merged;
      this._cacheTimestamp = now;
      return merged;
    } catch (err) {
      const merged = { ...this.defaults };
      this._cache = merged;
      this._cacheTimestamp = Date.now();
      if (err && err.code !== 'ENOENT') {
        console.warn(
          '[SETTINGS] Failed to read settings, using defaults:',
          err.message,
        );
      }
      return merged;
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
    // update cache immediately
    this._cache = merged;
    this._cacheTimestamp = Date.now();
    return merged;
  }
}

module.exports = SettingsService;
