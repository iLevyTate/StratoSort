const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const {
  analyzeImageFile,
} = require('../src/main/analysis/ollamaImageAnalysis');

describe('Shared Services Integration in Image Analysis', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Integration with shared services', () => {
    test('analyzeImageFile works with smart folders parameter', async () => {
      // Create a simple test image
      const pngBase64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAn8B9tmvxOgAAAAASUVORK5CYII=';
      const buffer = Buffer.from(pngBase64.replace(/\s+/g, ''), 'base64');
      const tmpFile = path.join(os.tmpdir(), 'test-pixel.png');
      await fs.writeFile(tmpFile, buffer);

      const smartFolders = [
        { id: '1', name: 'Photos', description: 'Personal photos' },
        { id: '2', name: 'Documents', description: 'Important documents' },
      ];

      // Test that the function accepts smart folders parameter without error
      const result = await analyzeImageFile(tmpFile, smartFolders);

      await fs.unlink(tmpFile);

      // Verify it returns a valid result structure
      expect(result).toHaveProperty('category');
      expect(result).toHaveProperty('keywords');
      expect(result).toHaveProperty('confidence');
    });

    test('analyzeImageFile works without smart folders parameter', async () => {
      const pngBase64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAn8B9tmvxOgAAAAASUVORK5CYII=';
      const buffer = Buffer.from(pngBase64.replace(/\s+/g, ''), 'base64');
      const tmpFile = path.join(os.tmpdir(), 'test-pixel.png');
      await fs.writeFile(tmpFile, buffer);

      // Test that the function works without smart folders
      const result = await analyzeImageFile(tmpFile);

      await fs.unlink(tmpFile);

      // Verify it returns a valid result structure
      expect(result).toHaveProperty('category');
      expect(result).toHaveProperty('keywords');
      expect(result).toHaveProperty('confidence');
    });

    test('analyzeImageFile handles multiple sequential calls', async () => {
      const pngBase64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAn8B9tmvxOgAAAAASUVORK5CYII=';
      const buffer = Buffer.from(pngBase64.replace(/\s+/g, ''), 'base64');

      const tmpFile1 = path.join(os.tmpdir(), 'test-pixel-1.png');
      const tmpFile2 = path.join(os.tmpdir(), 'test-pixel-2.png');

      await fs.writeFile(tmpFile1, buffer);
      await fs.writeFile(tmpFile2, buffer);

      // Test multiple calls work without issues
      const result1 = await analyzeImageFile(tmpFile1, []);
      const result2 = await analyzeImageFile(tmpFile2, []);

      await fs.unlink(tmpFile1);
      await fs.unlink(tmpFile2);

      // Both should return valid results
      expect(result1).toHaveProperty('category');
      expect(result2).toHaveProperty('category');
    });
  });

  describe('Error handling', () => {
    test('analyzeImageFile handles invalid file paths', async () => {
      const result = await analyzeImageFile('/invalid/path.png', []);

      // Should return error result
      expect(result).toHaveProperty('error');
      expect(result).toHaveProperty('confidence');
    });

    test('analyzeImageFile handles empty smart folders array', async () => {
      const pngBase64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAn8B9tmvxOgAAAAASUVORK5CYII=';
      const buffer = Buffer.from(pngBase64.replace(/\s+/g, ''), 'base64');
      const tmpFile = path.join(os.tmpdir(), 'test-pixel.png');
      await fs.writeFile(tmpFile, buffer);

      const result = await analyzeImageFile(tmpFile, []);

      await fs.unlink(tmpFile);

      // Should work fine with empty smart folders
      expect(result).toHaveProperty('category');
      expect(result).toHaveProperty('keywords');
    });

    test('analyzeImageFile handles corrupted image files', async () => {
      const tmpFile = path.join(os.tmpdir(), 'corrupted.png');
      await fs.writeFile(tmpFile, Buffer.from('not an image'));

      const result = await analyzeImageFile(tmpFile, []);

      await fs.unlink(tmpFile);

      // The function should return a valid result structure
      // Even with corrupted data, it should attempt to process
      expect(result).toHaveProperty('category');
      expect(result).toHaveProperty('keywords');
      expect(result).toHaveProperty('confidence');
    });
  });
});
