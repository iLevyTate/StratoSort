const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const {
  analyzeDocumentFile,
} = require('../src/main/analysis/ollamaDocumentAnalysis');
const {
  analyzeImageFile,
} = require('../src/main/analysis/ollamaImageAnalysis');

describe('Analysis success paths', () => {
  test('Document analyser returns structured data for txt file', async () => {
    const tmpFile = path.join(os.tmpdir(), 'sample.txt');
    await fs.writeFile(
      tmpFile,
      'Invoice for project X totalling $5000 due 2024-12-31',
    );

    const result = await analyzeDocumentFile(tmpFile, []);
    await fs.unlink(tmpFile);

    expect(result).toHaveProperty('category');
    expect(result).toHaveProperty('keywords');
    expect(result.error).toBeUndefined();
  });

  test('Image analyser returns structured data for simple PNG', async () => {
    // 1x1 px transparent PNG
    const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/ w8AAn8B9tmvxOgAAAAASUVORK5CYII=';
    const buffer = Buffer.from(pngBase64.replace(/\s+/g, ''), 'base64');
    const tmpFile = path.join(os.tmpdir(), 'pixel.png');
    await fs.writeFile(tmpFile, buffer);

    const result = await analyzeImageFile(tmpFile);
    await fs.unlink(tmpFile);

    expect(result).toHaveProperty('category');
    expect(result.error).toBeUndefined();
  });
});
