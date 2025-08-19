const registerOllamaIpc = require('../src/main/ipc/ollama');
const { IPC_CHANNELS } = require('../src/shared/constants');

describe('OLLAMA pull progress IPC', () => {
  test('sends operation-progress during model pull', async () => {
    const sent = [];
    const fakeWindow = {
      isDestroyed: () => false,
      webContents: {
        send: (channel, payload) => sent.push({ channel, payload }),
      },
    };

    const handlers = new Map();
    const ipcMain = {
      handle: (channel, handler) => handlers.set(channel, handler),
    };

    const logger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() };
    const withErrorLogging = (_logger, fn) => fn; // pass-through for test
    jest.doMock('../src/main/ipc/withErrorLogging', () => ({
      withErrorLogging,
    }));

    const getOllama = () => ({
      pull: async ({ model, stream }) => {
        // emit a few progress updates
        stream && stream({ total: 100, completed: 25 });
        stream && stream({ total: 100, completed: 100 });
        return;
      },
    });

    registerOllamaIpc({
      ipcMain,
      IPC_CHANNELS,
      logger,
      systemAnalytics: {},
      getMainWindow: () => fakeWindow,
      getOllama,
      getOllamaModel: () => 'mock',
      getOllamaVisionModel: () => 'mock-v',
      getOllamaEmbeddingModel: () => 'mock-e',
      getOllamaHost: () => 'http://localhost:11434',
    });

    const handler = handlers.get(IPC_CHANNELS.OLLAMA.PULL_MODELS);
    const result = await handler(null, ['m1']);

    expect(result.success).toBe(true);
    const progressEvents = sent.filter(
      (e) => e.channel === 'operation-progress',
    );
    expect(progressEvents.length).toBeGreaterThanOrEqual(2);
    expect(progressEvents[0].payload.type).toBe('ollama-pull');
    expect(progressEvents[0].payload.model).toBe('m1');
  });
});
