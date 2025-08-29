const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Mock electron BEFORE requiring customFolders
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => '/mock/user/data'),
  },
}));

// Mock logger at module level
jest.mock('../src/shared/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock atomic file operations
jest.mock('../src/shared/atomicFileOperations', () => ({
  backupAndReplace: jest.fn(),
}));

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
        { name: 'Another Folder', path: 'relative\\path' },
      ];

      const result = normalizeFolderPaths(folders);

      expect(result).toEqual([
        { name: 'Test Folder', path: path.normalize('/some/path') },
        { name: 'Another Folder', path: path.normalize('relative\\path') },
      ]);
    });

    test('handles folders with empty or invalid paths', () => {
      const folders = [
        { name: 'No Path', path: '' },
        { name: 'Null Path', path: null },
        { name: 'Undefined Path' },
        { name: 'Valid Path', path: '/valid/path' },
      ];

      const result = normalizeFolderPaths(folders);

      expect(result).toEqual([
        { name: 'No Path', path: '' },
        { name: 'Null Path', path: null },
        { name: 'Undefined Path' },
        { name: 'Valid Path', path: path.normalize('/valid/path') },
      ]);
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

      expect(result).toEqual([
        null,
        undefined,
        'string',
        { name: 'Valid', path: path.normalize('/valid') },
      ]);
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

      expect(result[0]).toEqual({
        name: 'Complex Folder',
        path: path.normalize('/complex/path'),
        description: 'A complex folder',
        id: 'complex-1',
        isDefault: false,
      });
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
      expect(result).toEqual([
        { name: 'Test Folder 1', path: path.normalize('/path1') },
        { name: 'Test Folder 2', path: path.normalize('/path2') },
      ]);
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
        { name: 'Another Folder', path: 'relative\\path' },
      ];

      const {
        backupAndReplace,
      } = require('../src/shared/atomicFileOperations');
      backupAndReplace.mockResolvedValue({ success: true });

      await saveCustomFolders(folders);

      // Should use atomic backup and replace
      expect(backupAndReplace).toHaveBeenCalledWith(
        path.join('/mock/user/data', 'custom-folders.json'),
        JSON.stringify(
          [
            { name: 'Test Folder', path: path.normalize('/test/path') },
            { name: 'Another Folder', path: path.normalize('relative\\path') },
          ],
          null,
          2,
        ),
      );

      expect(logger.info).toHaveBeenCalledWith(
        '[STORAGE] Saved custom folders to:',
        path.join('/mock/user/data', 'custom-folders.json'),
      );
    });

    test('handles save errors gracefully', async () => {
      const {
        backupAndReplace,
      } = require('../src/shared/atomicFileOperations');
      backupAndReplace.mockRejectedValue(new Error('Disk full'));

      const folders = [{ name: 'Test Folder', path: '/test/path' }];

      await expect(saveCustomFolders(folders)).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledWith(
        '[ERROR] Failed to save custom folders:',
        expect.any(Error),
      );
    });

    test('handles null or undefined folders', async () => {
      const {
        backupAndReplace,
      } = require('../src/shared/atomicFileOperations');
      backupAndReplace.mockResolvedValue('/mock/user/data/custom-folders.json');

      await saveCustomFolders(null);
      await saveCustomFolders(undefined);

      expect(backupAndReplace).toHaveBeenCalledWith(
        path.join('/mock/user/data', 'custom-folders.json'),
        JSON.stringify([], null, 2),
      );
    });
  });
});
