const { ipcMain } = require('./mocks/electron');

describe('AnalysisHistory IPC', () => {
  beforeEach(() => {
    ipcMain._handlers.clear();
    ipcMain.handle.mockClear();
  });

  test('GET/SEARCH/GET_STATISTICS/EXPORT are wired', async () => {
    const registerAllIpc = require('../src/main/ipc').registerAllIpc;
    const { IPC_CHANNELS } = require('../src/shared/constants');
    const logger = { error: jest.fn(), info: jest.fn(), warn: jest.fn() };
    const service = {
      get: jest.fn(async () => []),
      searchAnalysis: jest.fn(async () => []),
      getStatistics: jest.fn(async () => ({ total: 0 })),
      getFileHistory: jest.fn(async () => []),
      clear: jest.fn(async () => ({})),
      export: jest.fn(async () => ({ success: true, path: 'out.json' })),
      getRecentAnalysis: jest.fn(async () => []),
    };

    registerAllIpc({
      ipcMain,
      IPC_CHANNELS,
      logger,
      systemAnalytics: { collectMetrics: jest.fn(async () => ({})) },
      getServiceIntegration: () => ({ analysisHistory: service }),
    });

    const hGet = ipcMain._handlers.get(IPC_CHANNELS.ANALYSIS_HISTORY.GET);
    expect(Array.isArray(await hGet())).toBe(true);
    const hSearch = ipcMain._handlers.get(IPC_CHANNELS.ANALYSIS_HISTORY.SEARCH);
    expect(Array.isArray(await hSearch('term', {}))).toBe(true);
    const hStats = ipcMain._handlers.get(
      IPC_CHANNELS.ANALYSIS_HISTORY.GET_STATISTICS,
    );
    expect((await hStats()).total).toBe(0);
    const hExport = ipcMain._handlers.get(IPC_CHANNELS.ANALYSIS_HISTORY.EXPORT);
    expect((await hExport('json')).success).toBe(true);
  });
});
