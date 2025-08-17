const { withErrorLogging, withValidation } = require('./withErrorLogging');
const { app } = require('electron');
let z;
try {
  z = require('zod');
} catch {
  z = null;
}

function registerSettingsIpc({
  ipcMain,
  IPC_CHANNELS,
  logger,
  settingsService,
  setOllamaHost,
  setOllamaModel,
  setOllamaVisionModel,
  setOllamaEmbeddingModel,
  onSettingsChange,
}) {
  ipcMain.handle(
    IPC_CHANNELS.SETTINGS.GET,
    withErrorLogging(logger, async () => {
      try {
        const loaded = await settingsService.load();
        return loaded;
      } catch (error) {
        logger.error('Failed to get settings:', error);
        return {};
      }
    }),
  );

  const settingsSchema = z
    ? z
        .object({
          ollamaHost: z.string().url().optional(),
          textModel: z.string().optional(),
          visionModel: z.string().optional(),
          embeddingModel: z.string().optional(),
          launchOnStartup: z.boolean().optional(),
          autoOrganize: z.boolean().optional(),
          backgroundMode: z.boolean().optional(),
        })
        .partial()
    : null;
  ipcMain.handle(
    IPC_CHANNELS.SETTINGS.SAVE,
    z && settingsSchema
      ? withValidation(logger, settingsSchema, async (event, settings) => {
          try {
            const merged = await settingsService.save(settings);
            if (merged.ollamaHost) await setOllamaHost(merged.ollamaHost);
            if (merged.textModel) await setOllamaModel(merged.textModel);
            if (merged.visionModel)
              await setOllamaVisionModel(merged.visionModel);
            if (
              merged.embeddingModel &&
              typeof setOllamaEmbeddingModel === 'function'
            )
              await setOllamaEmbeddingModel(merged.embeddingModel);
            if (typeof merged.launchOnStartup === 'boolean') {
              try {
                app.setLoginItemSettings({
                  openAtLogin: merged.launchOnStartup,
                });
              } catch (error) {
                logger.warn(
                  '[SETTINGS] Failed to set login item settings:',
                  error.message,
                );
              }
            }
            logger.info('[SETTINGS] Saved settings');
            if (typeof onSettingsChange === 'function')
              onSettingsChange(merged);
            return { success: true, settings: merged };
          } catch (error) {
            logger.error('Failed to save settings:', error);
            return { success: false, error: error.message };
          }
        })
      : withErrorLogging(logger, async (event, settings) => {
          try {
            const merged = await settingsService.save(settings);
            if (merged.ollamaHost) await setOllamaHost(merged.ollamaHost);
            if (merged.textModel) await setOllamaModel(merged.textModel);
            if (merged.visionModel)
              await setOllamaVisionModel(merged.visionModel);
            if (
              merged.embeddingModel &&
              typeof setOllamaEmbeddingModel === 'function'
            )
              await setOllamaEmbeddingModel(merged.embeddingModel);
            if (typeof merged.launchOnStartup === 'boolean') {
              try {
                app.setLoginItemSettings({
                  openAtLogin: merged.launchOnStartup,
                });
              } catch (error) {
                logger.warn(
                  '[SETTINGS] Failed to set login item settings:',
                  error.message,
                );
              }
            }
            logger.info('[SETTINGS] Saved settings');
            if (typeof onSettingsChange === 'function')
              onSettingsChange(merged);
            return { success: true, settings: merged };
          } catch (error) {
            logger.error('Failed to save settings:', error);
            return { success: false, error: error.message };
          }
        }),
  );
}

module.exports = registerSettingsIpc;
