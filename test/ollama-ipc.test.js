const { ipcMain } = require('./mocks/electron');
const { IPC_CHANNELS } = require('../src/shared/constants');

jest.mock('ollama', () => ({
  Ollama: jest.fn(),
}));
const { Ollama } = require('ollama');
const registerOllamaIpc = require('../src/main/ipc/ollama');

describe('registerOllamaIpc', () => {
  beforeEach(() => {
    ipcMain._handlers.clear();
    ipcMain.handle.mockClear();
    Ollama.mockReset();
  });

  test('GET_MODELS returns categorized model data', async () => {
    const mockOllama = {
      list: jest.fn().mockResolvedValue({
        models: [
          { name: 'gemma3:4b' },
          { name: 'clip' },
          { name: 'mxbai-embed-large' },
        ],
      }),
    };
    const systemAnalytics = {};
    registerOllamaIpc({
      ipcMain,
      IPC_CHANNELS,
      logger: { error: jest.fn() },
      systemAnalytics,
      getOllama: () => mockOllama,
      getOllamaModel: () => 'text-model',
      getOllamaVisionModel: () => 'vision-model',
      getOllamaEmbeddingModel: () => 'embed-model',
      getOllamaHost: () => 'http://host',
    });

    const handler = ipcMain._handlers.get(IPC_CHANNELS.OLLAMA.GET_MODELS);
    const result = await handler();
    expect(mockOllama.list).toHaveBeenCalled();
    expect(result.models).toEqual(['gemma3:4b', 'clip', 'mxbai-embed-large']);
    expect(result.categories.vision).toContain('clip');
    expect(result.categories.embedding).toContain('mxbai-embed-large');
    expect(result.selected).toEqual({
      textModel: 'text-model',
      visionModel: 'vision-model',
      embeddingModel: 'embed-model',
    });
    expect(result.host).toBe('http://host');
  });

  test('TEST_CONNECTION reports healthy on success', async () => {
    let constructedHost;
    const list = jest.fn().mockResolvedValue({ models: [{ name: 'a' }] });
    Ollama.mockImplementation((opts) => {
      constructedHost = opts.host;
      return { list };
    });
    const systemAnalytics = {};
    registerOllamaIpc({
      ipcMain,
      IPC_CHANNELS,
      logger: { error: jest.fn() },
      systemAnalytics,
      getOllamaModel: () => 'text',
    });

    const handler = ipcMain._handlers.get(IPC_CHANNELS.OLLAMA.TEST_CONNECTION);
    const result = await handler(null, 'http://custom');
    expect(constructedHost).toBe('http://custom');
    expect(result).toMatchObject({
      success: true,
      host: 'http://custom',
      modelCount: 1,
    });
    expect(systemAnalytics.ollamaHealth.status).toBe('healthy');
  });

  test('GET_MODELS handles connection errors', async () => {
    const err = new Error('fail');
    err.cause = { code: 'ECONNREFUSED' };
    const mockOllama = { list: jest.fn().mockRejectedValue(err) };
    const systemAnalytics = {};
    registerOllamaIpc({
      ipcMain,
      IPC_CHANNELS,
      logger: { error: jest.fn() },
      systemAnalytics,
      getOllama: () => mockOllama,
      getOllamaModel: () => 'text-model',
      getOllamaVisionModel: () => 'vision-model',
      getOllamaEmbeddingModel: () => 'embed-model',
    });
    const handler = ipcMain._handlers.get(IPC_CHANNELS.OLLAMA.GET_MODELS);
    const result = await handler();
    expect(result.error).toBe('fail');
    expect(systemAnalytics.ollamaHealth.status).toBe('unhealthy');
  });
});
