const { ipcMain } = require('./mocks/electron');

describe('Embeddings/Semantic IPC', () => {
  beforeEach(() => {
    ipcMain._handlers.clear();
    ipcMain.handle.mockClear();
    jest.resetModules();
  });

  test('REBUILD_FOLDERS calls embedding upsert for custom folders', async () => {
    jest.resetModules();
    const logger = { error: jest.fn(), info: jest.fn(), warn: jest.fn() };
    // Spy on FolderMatchingService to intercept upsertFolderEmbedding
    const upserts = [];
    jest.doMock('../src/main/services/FolderMatchingService', () =>
      jest.fn().mockImplementation(() => ({
        upsertFolderEmbedding: jest.fn(async (f) => {
          upserts.push(f);
          return f;
        }),
        upsertFileEmbedding: jest.fn(async () => {}),
      })),
    );
    jest.doMock('../src/main/services/ChromaDBService', () => ({
      getInstance: () => ({
        initialize: jest.fn(async () => {}),
        resetFolders: jest.fn(async () => {}),
        resetFiles: jest.fn(async () => {}),
        migrateFromJsonl: jest.fn(async () => 0),
        cleanup: jest.fn(async () => {}),
        resetAll: jest.fn(async () => {}),
      }),
    }));
    const { registerAllIpc } = require('../src/main/ipc');
    const { IPC_CHANNELS } = require('../src/shared/constants');
    const electron = require('./mocks/electron');
    electron.app.getPath.mockReturnValue(require('os').tmpdir());

    registerAllIpc({
      ipcMain,
      IPC_CHANNELS,
      logger,
      systemAnalytics: { collectMetrics: jest.fn(async () => ({})) },
      getServiceIntegration: () => ({
        analysisHistory: { getRecentAnalysis: jest.fn(async () => []) },
      }),
      getCustomFolders: () => [
        { id: '1', name: 'Finance', description: 'Invoices' },
      ],
    });

    const handler = ipcMain._handlers.get(
      IPC_CHANNELS.EMBEDDINGS.REBUILD_FOLDERS,
    );
    const result = await handler();
    expect(result).toMatchObject({ success: true });
    expect(upserts.length).toBe(1);
    expect(upserts[0].name).toBe('Finance');
  });

  test('REBUILD_FILES rebuilds vectors from analysis history', async () => {
    jest.resetModules();
    const logger = { error: jest.fn(), info: jest.fn(), warn: jest.fn() };
    const inserted = [];
    jest.doMock('../src/main/services/FolderMatchingService', () =>
      jest.fn().mockImplementation(() => ({
        upsertFolderEmbedding: jest.fn(async () => {}),
        upsertFileEmbedding: jest.fn(async (id, summary) => {
          inserted.push({ id, summary });
        }),
      })),
    );
    jest.doMock('../src/main/services/ChromaDBService', () => ({
      getInstance: () => ({
        initialize: jest.fn(async () => {}),
        resetFolders: jest.fn(async () => {}),
        resetFiles: jest.fn(async () => {}),
        migrateFromJsonl: jest.fn(async () => 0),
        cleanup: jest.fn(async () => {}),
        resetAll: jest.fn(async () => {}),
      }),
    }));
    const { registerAllIpc } = require('../src/main/ipc');
    const { IPC_CHANNELS } = require('../src/shared/constants');
    const mockHistory = {
      getRecentAnalysis: jest.fn(async () => [
        {
          originalPath: 'C:/docs/report.pdf',
          analysis: {
            subject: 'Q1',
            summary: 'Quarterly report',
            tags: ['finance'],
            extractedText: 'numbers',
          },
        },
      ]),
    };

    registerAllIpc({
      ipcMain,
      IPC_CHANNELS,
      logger,
      systemAnalytics: { collectMetrics: jest.fn(async () => ({})) },
      getServiceIntegration: () => ({ analysisHistory: mockHistory }),
      getCustomFolders: () => [{ id: '1', name: 'Finance' }],
    });

    const handler = ipcMain._handlers.get(
      IPC_CHANNELS.EMBEDDINGS.REBUILD_FILES,
    );
    const result = await handler();
    expect(result.success).toBe(true);
    expect(result.files).toBe(1);
    expect(inserted.length).toBe(1);
    expect(inserted[0].id).toContain('file:');
  });

  test('CLEAR_STORE calls resetAll successfully', async () => {
    jest.resetModules();
    const logger = { error: jest.fn(), info: jest.fn(), warn: jest.fn() };
    // Mock ChromaDBService to ensure resetAll is called
    const resetAllCalls = [];
    jest.doMock('../src/main/services/ChromaDBService', () => ({
      getInstance: () => ({
        initialize: jest.fn(async () => {}),
        resetAll: jest.fn(async () => {
          resetAllCalls.push(1);
        }),
        migrateFromJsonl: jest.fn(async () => 0),
        cleanup: jest.fn(async () => {}),
      }),
    }));
    const { registerAllIpc } = require('../src/main/ipc');
    const { IPC_CHANNELS } = require('../src/shared/constants');
    registerAllIpc({
      ipcMain,
      IPC_CHANNELS,
      logger,
      systemAnalytics: { collectMetrics: jest.fn(async () => ({})) },
      getServiceIntegration: () => ({
        analysisHistory: { getRecentAnalysis: jest.fn(async () => []) },
      }),
      getCustomFolders: () => [],
    });

    const handler = ipcMain._handlers.get(IPC_CHANNELS.EMBEDDINGS.CLEAR_STORE);
    const result = await handler();
    expect(result.success).toBe(true);
    expect(resetAllCalls.length).toBe(1);
  });
});
