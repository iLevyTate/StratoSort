const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Mock electron BEFORE requiring customFolders
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => '/mock/user/data'),
  },
}));

// Mock os module
jest.mock('os', () => ({
  homedir: jest.fn(() => 'C:\\Users\\testuser'),
  platform: jest.fn(() => 'win32'),
}));

// Mock logger at module level
jest.mock('../src/shared/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Helper function to normalize paths for consistent comparison
const normalizeForComparison = (obj) => {
  if (typeof obj === 'string') {
    return obj.replace(/\\/g, '/');
  }
  if (Array.isArray(obj)) {
    return obj.map(normalizeForComparison);
  }
  if (obj && typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = key === 'path' ? normalizeForComparison(value) : value;
    }
    return result;
  }
  return obj;
};

const {
  getCustomFoldersPath,
  loadCustomFolders,
  saveCustomFolders,
  normalizeFolderPaths,
} = require('../src/main/core/customFolders');

const { logger } = require('../src/shared/logger');

describe('customFolders', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Clear logger mock calls
    logger.info.mockClear();
    logger.error.mockClear();
    logger.warn.mockClear();

    // Mock fs operations
    jest.spyOn(fs, 'readFile').mockResolvedValue(
      JSON.stringify([
        { name: 'Test Folder', path: '/test/path' },
        { name: 'Another Folder', path: '/another/path' },
      ]),
    );
    jest.spyOn(fs, 'writeFile').mockResolvedValue();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getCustomFoldersPath', () => {
    test('returns correct path for custom folders file', () => {
      const result = getCustomFoldersPath();
      expect(result).toBe(path.join('/mock/user/data', 'custom-folders.json'));
    });

    test('uses electron app.getPath for userData', () => {
      const { app } = require('electron');
      getCustomFoldersPath();
      expect(app.getPath).toHaveBeenCalledWith('userData');
    });
  });

  describe('normalizeFolderPaths', () => {
    test('normalizes valid folder paths', () => {
      const folders = [
        { name: 'Test Folder', path: '/some/path' },
        { name: 'Another Folder', path: 'relative/path' },
      ];

      const result = normalizeFolderPaths(folders);

      // Test that paths are normalized correctly for the current platform
      const expectedPath1 = path.normalize('/some/path');
      const expectedPath2 = path.normalize('relative/path');

      expect(normalizeForComparison(result)).toEqual(
        normalizeForComparison([
          { name: 'Test Folder', path: expectedPath1 },
          { name: 'Another Folder', path: expectedPath2 },
        ]),
      );

      // Additional check to ensure paths are actually normalized
      expect(normalizeForComparison(result[0].path)).toBe(
        normalizeForComparison(expectedPath1),
      );
      expect(normalizeForComparison(result[1].path)).toBe(
        normalizeForComparison(expectedPath2),
      );
    });

    test('handles folders with empty or invalid paths', () => {
      const folders = [
        { name: 'No Path', path: '' },
        { name: 'Null Path', path: null },
        { name: 'Undefined Path' },
        { name: 'Valid Path', path: '/valid/path' },
      ];

      const result = normalizeFolderPaths(folders);

      const expectedValidPath = path.normalize('/valid/path');
      expect(normalizeForComparison(result)).toEqual(
        normalizeForComparison([
          { name: 'No Path', path: '' },
          { name: 'Null Path', path: null },
          { name: 'Undefined Path' },
          { name: 'Valid Path', path: expectedValidPath },
        ]),
      );
      expect(normalizeForComparison(result[3].path)).toBe(
        normalizeForComparison(expectedValidPath),
      );
    });

    test('handles non-array input', () => {
      expect(normalizeFolderPaths(null)).toEqual([]);
      expect(normalizeFolderPaths(undefined)).toEqual([]);
      expect(normalizeFolderPaths('not an array')).toEqual([]);
      expect(normalizeFolderPaths(123)).toEqual([]);
    });

    test('handles empty array', () => {
      const result = normalizeFolderPaths([]);
      expect(result).toEqual([]);
    });

    test('handles array with invalid folder objects', () => {
      const folders = [
        null,
        undefined,
        'string',
        { name: 'Valid', path: '/valid' },
      ];

      const result = normalizeFolderPaths(folders);

      const expectedValidPath = path.normalize('/valid');
      expect(normalizeForComparison(result)).toEqual(
        normalizeForComparison([
          null,
          undefined,
          'string',
          { name: 'Valid', path: expectedValidPath },
        ]),
      );
      expect(normalizeForComparison(result[3].path)).toBe(
        normalizeForComparison(expectedValidPath),
      );
    });

    test('preserves all folder properties', () => {
      const folders = [
        {
          name: 'Complex Folder',
          path: '/complex/path',
          description: 'A complex folder',
          id: 'complex-1',
          isDefault: false,
        },
      ];

      const result = normalizeFolderPaths(folders);

      const expectedComplexPath = path.normalize('/complex/path');
      expect(normalizeForComparison(result[0])).toEqual(
        normalizeForComparison({
          name: 'Complex Folder',
          path: expectedComplexPath,
          description: 'A complex folder',
          id: 'complex-1',
          isDefault: false,
        }),
      );
      expect(normalizeForComparison(result[0].path)).toBe(
        normalizeForComparison(expectedComplexPath),
      );
    });
  });

  describe('loadCustomFolders', () => {
    test('loads and parses custom folders from file', async () => {
      const mockFolders = [
        { name: 'Test Folder 1', path: '/path1' },
        { name: 'Test Folder 2', path: '/path2' },
      ];

      jest.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(mockFolders));

      const result = await loadCustomFolders();

      expect(fs.readFile).toHaveBeenCalledWith(
        path.join('/mock/user/data', 'custom-folders.json'),
        'utf-8',
      );
      const expectedPath1 = path.normalize('/path1');
      const expectedPath2 = path.normalize('/path2');
      expect(normalizeForComparison(result)).toEqual(
        normalizeForComparison([
          { name: 'Test Folder 1', path: expectedPath1 },
          { name: 'Test Folder 2', path: expectedPath2 },
        ]),
      );
      expect(normalizeForComparison(result[0].path)).toBe(
        normalizeForComparison(expectedPath1),
      );
      expect(normalizeForComparison(result[1].path)).toBe(
        normalizeForComparison(expectedPath2),
      );
    });

    test('returns default folders when file does not exist', async () => {
      jest.spyOn(fs, 'readFile').mockRejectedValue({ code: 'ENOENT' });

      const result = await loadCustomFolders();

      expect(logger.info).toHaveBeenCalledWith(
        '[STARTUP] No saved custom folders found, using defaults',
      );
      expect(result).toEqual([
        {
          id: 'financial',
          name: 'Financial Documents',
          description:
            'Invoices, receipts, tax documents, financial statements, bank records',
          path: null,
          isDefault: true,
        },
        {
          id: 'projects',
          name: 'Project Files',
          description:
            'Project documentation, proposals, specifications, project plans',
          path: null,
          isDefault: true,
        },
      ]);
    });

    test('returns default folders when JSON parsing fails', async () => {
      jest.spyOn(fs, 'readFile').mockResolvedValue('invalid json');

      const result = await loadCustomFolders();

      expect(result).toEqual([
        {
          id: 'financial',
          name: 'Financial Documents',
          description:
            'Invoices, receipts, tax documents, financial statements, bank records',
          path: null,
          isDefault: true,
        },
        {
          id: 'projects',
          name: 'Project Files',
          description:
            'Project documentation, proposals, specifications, project plans',
          path: null,
          isDefault: true,
        },
      ]);
    });

    test('handles file read errors gracefully', async () => {
      jest
        .spyOn(fs, 'readFile')
        .mockRejectedValue(new Error('Permission denied'));

      const result = await loadCustomFolders();

      expect(logger.info).toHaveBeenCalledWith(
        '[STARTUP] No saved custom folders found, using defaults',
      );
      expect(result).toEqual([
        {
          id: 'financial',
          name: 'Financial Documents',
          description:
            'Invoices, receipts, tax documents, financial statements, bank records',
          path: null,
          isDefault: true,
        },
        {
          id: 'projects',
          name: 'Project Files',
          description:
            'Project documentation, proposals, specifications, project plans',
          path: null,
          isDefault: true,
        },
      ]);
    });
  });

  describe('saveCustomFolders', () => {
    test('saves normalized folders to file', async () => {
      const folders = [
        { name: 'Test Folder', path: '/test/path' },
        { name: 'Another Folder', path: 'relative/path' },
      ];

      jest.spyOn(fs, 'writeFile').mockResolvedValue();

      await saveCustomFolders(folders);

      const expectedPath1 = path.normalize('/test/path');
      const expectedPath2 = path.normalize('relative/path');

      const expectedJson = JSON.stringify(
        normalizeForComparison([
          { name: 'Test Folder', path: expectedPath1 },
          { name: 'Another Folder', path: expectedPath2 },
        ]),
        null,
        2,
      );

      const actualCall = fs.writeFile.mock.calls[0];
      const actualJson = actualCall[1]; // Second argument is the JSON string

      expect(actualCall[0]).toBe(
        path.join('/mock/user/data', 'custom-folders.json'),
      );
      expect(JSON.parse(actualJson)).toEqual(JSON.parse(expectedJson));

      expect(logger.info).toHaveBeenCalledWith(
        '[STORAGE] Saved custom folders to:',
        path.join('/mock/user/data', 'custom-folders.json'),
      );
    });

    test('handles save errors gracefully', async () => {
      jest.spyOn(fs, 'writeFile').mockRejectedValue(new Error('Disk full'));

      const folders = [{ name: 'Test Folder', path: '/test/path' }];

      await expect(saveCustomFolders(folders)).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledWith(
        '[ERROR] Failed to save custom folders:',
        expect.any(Error),
      );
    });

    test('handles null or undefined folders', async () => {
      jest.spyOn(fs, 'writeFile').mockResolvedValue();

      await saveCustomFolders(null);
      await saveCustomFolders(undefined);

      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join('/mock/user/data', 'custom-folders.json'),
        JSON.stringify([], null, 2),
      );
    });
  });
});
