const { app } = require('electron');
const fs = require('fs').promises;
const path = require('path');

class SettingsService {
  constructor() {
<<<<<<< Updated upstream
    const userDataPath = app.getPath('userData');
    this.settingsFilePath = path.join(userDataPath, 'settings.json');
    this.settingsCache = null;
    this.defaultSettings = {
      // AI / Ollama
=======
    this.settingsPath = path.join(app.getPath('userData'), 'settings.json');
    this.defaults = {
      theme: 'system',
      autoAnalyze: true,
      concurrentAnalysis: 3,
      smartFolderDefaults: true,
      notifications: true,
      // AI
>>>>>>> Stashed changes
      ollamaHost: 'http://127.0.0.1:11434',
      textModel: 'llama3.2:latest',
      visionModel: 'llava:latest',
      embeddingModel: 'mxbai-embed-large',
<<<<<<< Updated upstream

      // App behavior
      maxConcurrentAnalysis: 3,
      autoOrganize: false,

      // Folders
      defaultSmartFolderLocation: 'Documents'
    };
  }

  async loadSettings() {
    if (this.settingsCache) return this.settingsCache;
    try {
      const raw = await fs.readFile(this.settingsFilePath, 'utf-8');
      const parsed = JSON.parse(raw);
      this.settingsCache = { ...this.defaultSettings, ...parsed };
      return this.settingsCache;
    } catch (error) {
      // If file doesn't exist, initialize with defaults
      if (error.code === 'ENOENT') {
        this.settingsCache = { ...this.defaultSettings };
        await this.saveSettings(this.settingsCache);
        return this.settingsCache;
      }
      // On parse or other errors, fall back to defaults (do not overwrite file)
      this.settingsCache = { ...this.defaultSettings };
      return this.settingsCache;
    }
  }

  async getSettings() {
    return await this.loadSettings();
  }

  async saveSettings(partial) {
    const current = await this.loadSettings();
    const merged = { ...current, ...partial };
    this.settingsCache = merged;
    await fs.mkdir(path.dirname(this.settingsFilePath), { recursive: true });
    await fs.writeFile(this.settingsFilePath, JSON.stringify(merged, null, 2));
    return merged;
  }

  // Convenience getters
  async getOllamaHost() {
    const s = await this.loadSettings();
    return s.ollamaHost || this.defaultSettings.ollamaHost;
  }

  async getTextModel() {
    const s = await this.loadSettings();
    return s.textModel || this.defaultSettings.textModel;
  }

  async getVisionModel() {
    const s = await this.loadSettings();
    return s.visionModel || this.defaultSettings.visionModel;
  }

  async getEmbeddingModel() {
    const s = await this.loadSettings();
    return s.embeddingModel || this.defaultSettings.embeddingModel;
  }
=======
      defaultSmartFolderLocation: 'Documents',
      maxConcurrentAnalysis: 3,
      autoOrganize: false
    };
  }

  async load() {
    try {
      const raw = await fs.readFile(this.settingsPath, 'utf-8');
      const parsed = JSON.parse(raw);
      return { ...this.defaults, ...parsed };
    } catch (err) {
      if (err && err.code !== 'ENOENT') {
        console.warn('[SETTINGS] Failed to read settings, using defaults:', err.message);
      }
      return { ...this.defaults };
    }
  }

  async save(settings) {
    const merged = { ...this.defaults, ...(settings || {}) };
    await fs.mkdir(path.dirname(this.settingsPath), { recursive: true });
    await fs.writeFile(this.settingsPath, JSON.stringify(merged, null, 2));
    return merged;
  }
>>>>>>> Stashed changes
}

module.exports = SettingsService;


