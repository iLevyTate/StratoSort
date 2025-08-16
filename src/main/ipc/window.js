const { withErrorLogging } = require('./withErrorLogging');

function registerWindowIpc({ ipcMain, IPC_CHANNELS, logger, getMainWindow }) {
  ipcMain.handle(
    IPC_CHANNELS.WINDOW.MINIMIZE,
    withErrorLogging(logger, async () => {
      const win = getMainWindow();
      if (win && !win.isDestroyed()) win.minimize();
      return true;
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.WINDOW.MAXIMIZE,
    withErrorLogging(logger, async () => {
      const win = getMainWindow();
      if (win && !win.isDestroyed()) win.maximize();
      return true;
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.WINDOW.UNMAXIMIZE,
    withErrorLogging(logger, async () => {
      const win = getMainWindow();
      if (win && !win.isDestroyed()) win.unmaximize();
      return true;
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.WINDOW.TOGGLE_MAXIMIZE,
    withErrorLogging(logger, async () => {
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        if (win.isMaximized()) win.unmaximize();
        else win.maximize();
        return win.isMaximized();
      }
      return false;
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.WINDOW.IS_MAXIMIZED,
    withErrorLogging(logger, async () => {
      const win = getMainWindow();
      return win && !win.isDestroyed() ? win.isMaximized() : false;
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.WINDOW.CLOSE,
    withErrorLogging(logger, async () => {
      const win = getMainWindow();
      if (win && !win.isDestroyed()) win.close();
      return true;
    }),
  );
}

module.exports = registerWindowIpc;
