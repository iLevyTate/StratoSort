const { ipcMain, dialog, shell } = require('./mocks/electron');

describe('Files IPC - batch organize', () => {
  beforeEach(() => {
    ipcMain._handlers.clear();
    ipcMain.handle.mockClear();
  });

  function register() {
    const { IPC_CHANNELS, ACTION_TYPES } = require('../src/shared/constants');
    const registerAllIpc = require('../src/main/ipc').registerAllIpc;
    const logger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() };
    const getMainWindow = () => ({ isDestroyed: () => false, webContents: { send: jest.fn() } });
    const serviceIntegration = {
      undoRedo: { recordAction: jest.fn(async () => {}) },
      processingState: {
        createOrLoadOrganizeBatch: jest.fn(async (_id, ops) => ({ id: 'batch_test', operations: ops })),
        markOrganizeOpStarted: jest.fn(async () => {}),
        markOrganizeOpDone: jest.fn(async () => {}),
        markOrganizeOpError: jest.fn(async () => {}),
        completeOrganizeBatch: jest.fn(async () => {})
      }
    };

    registerAllIpc({
      ipcMain,
      IPC_CHANNELS,
      logger,
      dialog,
      shell,
      systemAnalytics: { collectMetrics: jest.fn(async () => ({})) },
      getMainWindow,
      getServiceIntegration: () => serviceIntegration,
      getCustomFolders: () => [],
      setCustomFolders: () => {},
      saveCustomFolders: async () => {},
      analyzeDocumentFile: async () => ({ success: true }),
      analyzeImageFile: async () => ({ success: true }),
      tesseract: { recognize: async () => 'text' },
      getOllama: () => ({ list: async () => ({ models: [] }) }),
      getOllamaModel: () => 'llama3.2:latest',
      getOllamaVisionModel: () => null,
      buildOllamaOptions: async () => ({})
    });
    return { IPC_CHANNELS, ACTION_TYPES, serviceIntegration };
  }

  test('performs batch organize and records undo batch', async () => {
    const { IPC_CHANNELS, serviceIntegration } = register();
    const handler = ipcMain._handlers.get(IPC_CHANNELS.FILES.PERFORM_OPERATION);

    const tmp = require('os').tmpdir();
    const path = require('path');
    const fs = require('fs').promises;
    const sourceA = path.join(tmp, `src_A_${Date.now()}.txt`);
    const destA = path.join(tmp, `dest_A_${Date.now()}.txt`);
    const sourceB = path.join(tmp, `src_B_${Date.now()}.txt`);
    const destB = path.join(tmp, `dest_B_${Date.now()}.txt`);
    await fs.writeFile(sourceA, 'A');
    await fs.writeFile(sourceB, 'B');

    const { success, results, successCount, failCount } = await handler(null, {
      type: 'batch_organize',
      operations: [
        { source: sourceA, destination: destA },
        { source: sourceB, destination: destB }
      ]
    });

    expect(success).toBe(true);
    expect(successCount).toBe(2);
    expect(failCount).toBe(0);
    expect(Array.isArray(results)).toBe(true);
    expect(serviceIntegration.processingState.completeOrganizeBatch).toHaveBeenCalled();
  });
});


