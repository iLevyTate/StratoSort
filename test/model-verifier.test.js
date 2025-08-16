jest.mock('../src/main/services/PerformanceService', () => ({
  buildOllamaOptions: jest.fn(async () => ({})),
}));

let mockOllamaInstance;
jest.mock('ollama', () => ({
  Ollama: jest.fn(),
}));
const { Ollama } = require('ollama');
const ModelVerifier = require('../src/main/services/ModelVerifier');
const { DEFAULT_AI_MODELS } = require('../src/shared/constants');

describe('ModelVerifier', () => {
  beforeEach(() => {
    mockOllamaInstance = {
      list: jest.fn(),
      generate: jest.fn(),
      embeddings: jest.fn(),
    };
    Ollama.mockImplementation(() => mockOllamaInstance);
  });

  test('verifyEssentialModels reports missing models', async () => {
    const mv = new ModelVerifier();
    jest
      .spyOn(mv, 'checkOllamaConnection')
      .mockResolvedValue({ connected: true });
    jest.spyOn(mv, 'getInstalledModels').mockResolvedValue({
      success: true,
      models: [{ name: DEFAULT_AI_MODELS.TEXT_ANALYSIS }],
    });
    const result = await mv.verifyEssentialModels();
    expect(result.success).toBe(false);
    expect(result.availableModels).toContain(DEFAULT_AI_MODELS.TEXT_ANALYSIS);
    expect(result.missingModels).toContain(DEFAULT_AI_MODELS.IMAGE_ANALYSIS);
  });

  test('generateInstallCommands builds pull commands', () => {
    const mv = new ModelVerifier();
    const cmds = mv.generateInstallCommands(['gemma3:4b']);
    expect(cmds.join('\n')).toContain('ollama pull gemma3:4b');
  });

  test('testModelFunctionality succeeds when models respond', async () => {
    const mv = new ModelVerifier();
    mockOllamaInstance.generate.mockResolvedValue({ response: 'OK' });
    mockOllamaInstance.list.mockResolvedValue({
      models: [{ name: 'whisper' }],
    });
    mockOllamaInstance.embeddings.mockResolvedValue({
      embedding: [0.1, 0.2, 0.3],
    });

    const result = await mv.testModelFunctionality();
    expect(result.success).toBe(true);
    const textTest = result.tests.find(
      (t) => t.model === DEFAULT_AI_MODELS.TEXT_ANALYSIS,
    );
    expect(textTest.success).toBe(true);
  });
});
