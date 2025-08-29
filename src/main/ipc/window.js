const { withErrorLogging } = require('./withErrorLogging');

function registerWindowIpc({
  ipcMain,
  IPC_CHANNELS,
  logger,
  systemAnalytics,
  getMainWindow,
}) {
  ipcMain.handle(
    IPC_CHANNELS.WINDOW.MINIMIZE,
    withErrorLogging(logger, async () => {
      try {
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
          win.minimize();
          return true;
        }
        return false;
      } catch (error) {
        logger.warn('[WINDOW] Minimize failed:', error.message);
        return false;
      }
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.WINDOW.MAXIMIZE,
    withErrorLogging(logger, async () => {
      try {
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
          win.maximize();
          return true;
        }
        return false;
      } catch (error) {
        logger.warn('[WINDOW] Maximize failed:', error.message);
        return false;
      }
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.WINDOW.UNMAXIMIZE,
    withErrorLogging(logger, async () => {
      try {
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
          win.unmaximize();
          return true;
        }
        return false;
      } catch (error) {
        logger.warn('[WINDOW] Unmaximize failed:', error.message);
        return false;
      }
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.WINDOW.TOGGLE_MAXIMIZE,
    withErrorLogging(logger, async () => {
      try {
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
          if (win.isMaximized()) win.unmaximize();
          else win.maximize();
          return win.isMaximized();
        }
        return false;
      } catch (error) {
        logger.warn('[WINDOW] Toggle maximize failed:', error.message);
        return false;
      }
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.WINDOW.IS_MAXIMIZED,
    withErrorLogging(logger, async () => {
      try {
        const win = getMainWindow();
        return win && !win.isDestroyed() ? win.isMaximized() : false;
      } catch (error) {
        logger.warn('[WINDOW] Is maximized check failed:', error.message);
        return false;
      }
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.WINDOW.CLOSE,
    withErrorLogging(logger, async () => {
      try {
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
          win.close();
          return true;
        }
        return false;
      } catch (error) {
        logger.warn('[WINDOW] Close failed:', error.message);
        return false;
      }
    }),
  );
}

module.exports = registerWindowIpc;
