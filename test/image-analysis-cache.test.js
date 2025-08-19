const fs = require('fs').promises;
const os = require('os');
const path = require('path');

describe('per-file analysis cache (image)', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('second analyzeImageFile call hits cache and avoids generate', async () => {
    // 1x1 px transparent PNG
    const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAn8B9tmvxOgAAAAASUVORK5CYII=';
    const buffer = Buffer.from(pngBase64, 'base64');
    const tmp = path.join(os.tmpdir(), `img-cache-${Date.now()}.png`);
    await fs.writeFile(tmp, buffer);

    const generateMock = jest.fn(async () => ({
      response: JSON.stringify({
        project: 'Img',
        purpose: 'Img purpose',
        category: 'image',
        keywords: ['a', 'b', 'c'],
        confidence: 90,
        suggestedName: 'img_file',
      }),
    }));

    jest.doMock(
      '../src/main/ollamaUtils',
      () => ({
        getOllamaClient: async () => ({ generate: generateMock }),
        getOllamaVisionModel: () => 'mock-vision',
        loadOllamaConfig: async () => ({ selectedVisionModel: 'mock-vision' }),
      }),
      { virtual: false },
    );

    const {
      analyzeImageFile,
    } = require('../src/main/analysis/ollamaImageAnalysis');

    const r1 = await analyzeImageFile(tmp, []);
    const r2 = await analyzeImageFile(tmp, []);

    expect(r1).toBeDefined();
    expect(r2).toBeDefined();
    expect(generateMock).toHaveBeenCalledTimes(1);

    await fs.unlink(tmp);
  });
});
