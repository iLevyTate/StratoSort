const { withErrorLogging } = require('./withErrorLogging');

function registerUndoRedoIpc({
  ipcMain,
  IPC_CHANNELS,
  logger,
  getServiceIntegration,
}) {
  // Undo
  ipcMain.handle(
    IPC_CHANNELS.UNDO_REDO.UNDO,
    withErrorLogging(logger, async () => {
      try {
        return (
          (await getServiceIntegration()?.undoRedo?.undo()) || {
            success: false,
            message: 'Undo service unavailable',
          }
        );
      } catch (error) {
        logger.error('Failed to execute undo:', error);
        return { success: false, message: error.message };
      }
    }),
  );

  // Redo
  ipcMain.handle(
    IPC_CHANNELS.UNDO_REDO.REDO,
    withErrorLogging(logger, async () => {
      try {
        return (
          (await getServiceIntegration()?.undoRedo?.redo()) || {
            success: false,
            message: 'Redo service unavailable',
          }
        );
      } catch (error) {
        logger.error('Failed to execute redo:', error);
        return { success: false, message: error.message };
      }
    }),
  );

  // History
  ipcMain.handle(
    IPC_CHANNELS.UNDO_REDO.GET_HISTORY,
    withErrorLogging(logger, async (event, limit = 50) => {
      try {
        return (
          (await getServiceIntegration()?.undoRedo?.getHistory(limit)) || []
        );
      } catch (error) {
        logger.error('Failed to get action history:', error);
        return [];
      }
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.UNDO_REDO.CLEAR_HISTORY,
    withErrorLogging(logger, async () => {
      try {
        return (
          (await getServiceIntegration()?.undoRedo?.clearHistory()) || {
            success: true,
          }
        );
      } catch (error) {
        logger.error('Failed to clear action history:', error);
        return { success: false, message: error.message };
      }
    }),
  );

  // Status
  ipcMain.handle(
    IPC_CHANNELS.UNDO_REDO.CAN_UNDO,
    withErrorLogging(logger, async () => {
      try {
        return (await getServiceIntegration()?.undoRedo?.canUndo()) || false;
      } catch (error) {
        logger.error('Failed to check undo status:', error);
        return false;
      }
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.UNDO_REDO.CAN_REDO,
    withErrorLogging(logger, async () => {
      try {
        return (await getServiceIntegration()?.undoRedo?.canRedo()) || false;
      } catch (error) {
        logger.error('Failed to check redo status:', error);
        return false;
      }
    }),
  );
}

module.exports = registerUndoRedoIpc;
