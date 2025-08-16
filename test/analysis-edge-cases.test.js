const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const {
  analyzeImageFile,
} = require('../src/main/analysis/ollamaImageAnalysis');
const {
  analyzeAudioFile,
} = require('../src/main/analysis/ollamaAudioAnalysis');
const {
  analyzeDocumentFile,
} = require('../src/main/analysis/ollamaDocumentAnalysis');

/**
 * These tests focus on negative/edge-case inputs to ensure the analysers fail
 * gracefully and return structured error objects instead of throwing.
 * NOTE:  Ollama calls are mocked implicitly by the existing jest mock in
 * ../mocks/ollama.js so tests run fast and offline.
 */

describe('Analysis edge cases', () => {
  test('Image analyser rejects unsupported extension', async () => {
    const tmpFile = path.join(os.tmpdir(), 'sample.unsupported');
    await fs.writeFile(tmpFile, 'dummy');

    const result = await analyzeImageFile(tmpFile);
    await fs.unlink(tmpFile);

    expect(result).toHaveProperty('error');
    expect(result.category).toBe('unsupported');
  });

  test('Image analyser rejects zero-byte PNG', async () => {
    const tmpFile = path.join(os.tmpdir(), 'empty.png');
    await fs.writeFile(tmpFile, Buffer.alloc(0));

    const result = await analyzeImageFile(tmpFile);
    await fs.unlink(tmpFile);

    expect(result).toHaveProperty('error');
    expect(result.confidence).toBe(0);
  });

  test('Audio analyser rejects unsupported extension', async () => {
    const tmpFile = path.join(os.tmpdir(), 'audio.xyz');
    await fs.writeFile(tmpFile, 'dummy');

    const result = await analyzeAudioFile(tmpFile);
    await fs.unlink(tmpFile);

    expect(result).toHaveProperty('error');
    expect(result.category).toBe('unsupported');
  });

  test('Document analyser handles non-PDF unknown extension via fallback', async () => {
    const tmpFile = path.join(os.tmpdir(), 'notes.xyz');
    await fs.writeFile(tmpFile, 'Project Alpha draft');

    const result = await analyzeDocumentFile(tmpFile, []);
    await fs.unlink(tmpFile);

    expect(result).toHaveProperty('category');
    // Should not throw even though extension unsupported
  });
});
