function registerSettingsIpc({ ipcMain, IPC_CHANNELS, logger, settingsService, setOllamaHost, setOllamaModel, setOllamaVisionModel }) {
  ipcMain.handle(IPC_CHANNELS.SETTINGS.GET, async () => {
    try {
      const loaded = await settingsService.load();
      return loaded;
    } catch (error) {
      logger.error('Failed to get settings:', error);
      return {};
    }
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS.SAVE, async (event, settings) => {
    try {
      const merged = await settingsService.save(settings);
      if (merged.ollamaHost) await setOllamaHost(merged.ollamaHost);
      if (merged.textModel) await setOllamaModel(merged.textModel);
      if (merged.visionModel) await setOllamaVisionModel(merged.visionModel);
      logger.info('[SETTINGS] Saved settings');
      return { success: true, settings: merged };
    } catch (error) {
      logger.error('Failed to save settings:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = registerSettingsIpc;


