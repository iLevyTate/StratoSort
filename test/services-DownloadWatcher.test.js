// Mock chokidar at module level
jest.mock('chokidar');

// Mock logger at module level
jest.mock('../src/shared/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock electron app
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(),
  },
}));

// Mock atomic file operations
jest.mock('../src/shared/atomicFileOperations', () => ({
  atomicFileOps: {
    atomicMove: jest.fn(),
  },
}));

const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const chokidar = require('chokidar');
const { app } = require('electron');
const DownloadWatcher = require('../src/main/services/DownloadWatcher');

// Helper function to normalize paths for cross-platform testing
const normalizePath = (filePath) => filePath.replace(/\\/g, '/');

describe('DownloadWatcher', () => {
  let mockAnalyzeDocumentFile;
  let mockAnalyzeImageFile;
  let mockGetCustomFolders;
  let mockWatcher;
  let watcher;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock the analysis functions
    mockAnalyzeDocumentFile = jest.fn();
    mockAnalyzeImageFile = jest.fn();
    mockGetCustomFolders = jest.fn().mockReturnValue([]); // Return empty array by default

    // Mock chokidar
    mockWatcher = {
      on: jest.fn(),
      close: jest.fn(),
    };
    chokidar.watch.mockReturnValue(mockWatcher);

    // Mock electron app.getPath
    app.getPath.mockReturnValue(path.join(os.homedir(), 'Downloads'));

    // Mock fs operations
    jest.spyOn(fs, 'access').mockImplementation(() => Promise.resolve());
    jest
      .spyOn(fs, 'stat')
      .mockImplementation(() => Promise.resolve({ size: 1000 })); // Mock file stats for stability check
    jest.spyOn(fs, 'mkdir'); // Spy on fs.mkdir to track calls

    // Mock atomic file operations to track calls but still trigger fs.mkdir
    const { atomicFileOps } = require('../src/shared/atomicFileOperations');
    jest
      .spyOn(atomicFileOps, 'atomicMove')
      .mockImplementation(async (source, dest) => {
        // Simulate the real behavior by calling fs.mkdir
        await fs.mkdir(path.dirname(dest), { recursive: true });
        return dest; // Return the destination path as the real method does
      });

    // Mock setTimeout to be immediate for testing
    jest.spyOn(global, 'setTimeout').mockImplementation((cb) => cb());

    // Create watcher instance
    watcher = new DownloadWatcher({
      analyzeDocumentFile: mockAnalyzeDocumentFile,
      analyzeImageFile: mockAnalyzeImageFile,
      getCustomFolders: mockGetCustomFolders,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    if (watcher.watcher) {
      watcher.stop();
    }
  });

  describe('constructor', () => {
    test('initializes with required dependencies', () => {
      expect(watcher.analyzeDocumentFile).toBe(mockAnalyzeDocumentFile);
      expect(watcher.analyzeImageFile).toBe(mockAnalyzeImageFile);
      expect(watcher.getCustomFolders).toBe(mockGetCustomFolders);
      expect(watcher.watcher).toBeNull();
    });
  });

  describe('start', () => {
    test('starts watching downloads directory', async () => {
      const downloadsPath = path.join(os.homedir(), 'Downloads');

      await watcher.start();

      expect(chokidar.watch).toHaveBeenCalledWith(downloadsPath, {
        ignoreInitial: true,
      });
      expect(mockWatcher.on).toHaveBeenCalledWith('add', expect.any(Function));
      expect(watcher.watcher).toBe(mockWatcher);
    });

    test('restarts watcher if already watching', async () => {
      watcher.watcher = mockWatcher;
      await watcher.start();

      // Should close existing watcher and create a new one
      expect(mockWatcher.close).toHaveBeenCalled();
      expect(chokidar.watch).toHaveBeenCalled();
      expect(watcher.watcher).toBe(mockWatcher); // Should be replaced with new watcher
    });
  });

  describe('stop', () => {
    test('stops watching and cleans up', () => {
      watcher.watcher = mockWatcher;
      watcher.stop();

      expect(mockWatcher.close).toHaveBeenCalled();
      expect(watcher.watcher).toBeNull();
    });

    test('handles null watcher gracefully', () => {
      watcher.watcher = null;
      expect(() => watcher.stop()).not.toThrow();
    });
  });

  describe('handleFile', () => {
    beforeEach(() => {
      watcher.start();
    });

    test('ignores temporary files', async () => {
      const tempFile = '/path/to/file.crdownload';
      await watcher.handleFile(tempFile);

      expect(mockAnalyzeDocumentFile).not.toHaveBeenCalled();
      expect(mockAnalyzeImageFile).not.toHaveBeenCalled();
    });

    test('ignores files without extensions', async () => {
      const noExtFile = '/path/to/file';
      await watcher.handleFile(noExtFile);

      expect(mockAnalyzeDocumentFile).not.toHaveBeenCalled();
      expect(mockAnalyzeImageFile).not.toHaveBeenCalled();
    });

    test('processes image files with analyzeImageFile', async () => {
      const imageFile = '/path/to/image.png';
      const mockResult = {
        category: 'Images',
        suggestedName: 'analyzed_image',
      };

      mockGetCustomFolders.mockReturnValue([
        { id: 'images', name: 'Images', path: '/dest/images' },
      ]);
      mockAnalyzeImageFile.mockResolvedValue(mockResult);

      await watcher.handleFile(imageFile);

      expect(mockAnalyzeImageFile).toHaveBeenCalledWith(imageFile, [
        { name: 'Images', description: '', id: 'images' },
      ]);
      expect(fs.mkdir).toHaveBeenCalledWith(normalizePath('/dest/images'), {
        recursive: true,
      });
      const { atomicFileOps } = require('../src/shared/atomicFileOperations');
      expect(atomicFileOps.atomicMove).toHaveBeenCalledWith(
        imageFile,
        normalizePath('/dest/images/analyzed_image.png'),
      );
    });

    test('processes document files with analyzeDocumentFile', async () => {
      const docFile = '/path/to/document.pdf';
      const mockResult = {
        category: 'Documents',
        suggestedName: 'analyzed_doc',
      };

      mockGetCustomFolders.mockReturnValue([
        { id: 'docs', name: 'Documents', path: '/dest/docs' },
      ]);
      mockAnalyzeDocumentFile.mockResolvedValue(mockResult);

      await watcher.handleFile(docFile);

      expect(mockAnalyzeDocumentFile).toHaveBeenCalledWith(docFile, [
        { name: 'Documents', description: '', id: 'docs' },
      ]);
      expect(fs.mkdir).toHaveBeenCalledWith(normalizePath('/dest/docs'), {
        recursive: true,
      });
      const { atomicFileOps } = require('../src/shared/atomicFileOperations');
      expect(atomicFileOps.atomicMove).toHaveBeenCalledWith(
        docFile,
        normalizePath('/dest/docs/analyzed_doc.pdf'),
      );
    });

    test('handles analysis errors gracefully', async () => {
      const file = '/path/to/document.pdf';
      const error = new Error('Analysis failed');

      mockAnalyzeDocumentFile.mockRejectedValue(error);

      await watcher.handleFile(file);

      expect(fs.mkdir).not.toHaveBeenCalled();
      const { atomicFileOps } = require('../src/shared/atomicFileOperations');
      expect(atomicFileOps.atomicMove).not.toHaveBeenCalled();
    });

    test('uses original filename when no suggestedName provided', async () => {
      const file = '/path/to/document.pdf';
      const mockResult = {
        category: 'Documents',
      };

      mockGetCustomFolders.mockReturnValue([
        { id: 'docs', name: 'Documents', path: '/dest/docs' },
      ]);
      mockAnalyzeDocumentFile.mockResolvedValue(mockResult);

      await watcher.handleFile(file);

      const { atomicFileOps } = require('../src/shared/atomicFileOperations');
      expect(atomicFileOps.atomicMove).toHaveBeenCalledWith(
        file,
        normalizePath('/dest/docs/document.pdf'),
      );
    });

    test('handles file move errors gracefully', async () => {
      const file = '/path/to/document.pdf';
      const mockResult = {
        category: 'Documents',
        suggestedName: 'analyzed_doc',
      };

      mockGetCustomFolders.mockReturnValue([
        { id: 'docs', name: 'Documents', path: '/dest/docs' },
      ]);
      mockAnalyzeDocumentFile.mockResolvedValue(mockResult);

      // Mock atomic move to call fs.mkdir but then reject
      const { atomicFileOps } = require('../src/shared/atomicFileOperations');
      atomicFileOps.atomicMove.mockImplementation(async (source, dest) => {
        // Still call fs.mkdir as the real method would
        await fs.mkdir(path.dirname(dest), { recursive: true });
        // Then reject to simulate the move failure
        throw new Error('Move failed');
      });

      await watcher.handleFile(file);

      expect(fs.mkdir).toHaveBeenCalledWith(normalizePath('/dest/docs'), {
        recursive: true,
      });
      expect(atomicFileOps.atomicMove).toHaveBeenCalledWith(
        file,
        normalizePath('/dest/docs/analyzed_doc.pdf'),
      );
    });
  });

  describe('resolveDestinationFolder', () => {
    test('returns null when result is null/undefined', () => {
      const folders = [{ id: 'test', name: 'Test', path: '/test' }];

      expect(watcher.resolveDestinationFolder(null, folders)).toBeNull();
      expect(watcher.resolveDestinationFolder(undefined, folders)).toBeNull();
    });

    test('finds folder by smartFolder.id', () => {
      const folders = [
        { id: 'folder1', name: 'Folder 1', path: '/path1' },
        { id: 'folder2', name: 'Folder 2', path: '/path2' },
      ];
      const result = {
        smartFolder: { id: 'folder2' },
      };

      const destination = watcher.resolveDestinationFolder(result, folders);
      expect(destination).toEqual(folders[1]);
    });

    test('finds folder by folderMatchCandidates id', () => {
      const folders = [
        { id: 'folder1', name: 'Folder 1', path: '/path1' },
        { id: 'folder2', name: 'Folder 2', path: '/path2' },
      ];
      const result = {
        folderMatchCandidates: [{ id: 'folder1', name: 'Folder 1' }],
      };

      const destination = watcher.resolveDestinationFolder(result, folders);
      expect(destination).toEqual(folders[0]);
    });

    test('finds folder by folderMatchCandidates name', () => {
      const folders = [
        { id: 'folder1', name: 'Folder 1', path: '/path1' },
        { id: 'folder2', name: 'Folder 2', path: '/path2' },
      ];
      const result = {
        folderMatchCandidates: [{ id: 'unknown', name: 'Folder 2' }],
      };

      const destination = watcher.resolveDestinationFolder(result, folders);
      expect(destination).toEqual(folders[1]);
    });

    test('finds folder by category name match', () => {
      const folders = [
        { id: 'folder1', name: 'Financial', path: '/path1' },
        { id: 'folder2', name: 'Projects', path: '/path2' },
      ];
      const result = {
        category: 'financial',
      };

      const destination = watcher.resolveDestinationFolder(result, folders);
      expect(destination).toEqual(folders[0]);
    });

    test('returns null when no match found', () => {
      const folders = [{ id: 'folder1', name: 'Folder 1', path: '/path1' }];
      const result = {
        category: 'unknown',
      };

      const destination = watcher.resolveDestinationFolder(result, folders);
      expect(destination).toBeNull();
    });

    test('handles empty folders array', () => {
      const result = {
        category: 'financial',
      };

      const destination = watcher.resolveDestinationFolder(result, []);
      expect(destination).toBeNull();
    });

    test('handles invalid folders', () => {
      const folders = [null, undefined, 'string'];
      const result = {
        category: 'financial',
      };

      const destination = watcher.resolveDestinationFolder(result, folders);
      expect(destination).toBeNull();
    });
  });

  describe('file type detection', () => {
    test('recognizes image extensions', async () => {
      const imageExtensions = [
        '.png',
        '.jpg',
        '.jpeg',
        '.gif',
        '.bmp',
        '.webp',
        '.tiff',
        '.svg',
        '.heic',
      ];

      for (const ext of imageExtensions) {
        const file = `/path/to/file${ext}`;
        const folders = [{ id: 'images', name: 'Images', path: '/dest' }];
        const result = { category: 'Images' };

        mockGetCustomFolders.mockReturnValue(folders);
        mockAnalyzeImageFile.mockResolvedValue(result);

        await watcher.handleFile(file);

        expect(mockAnalyzeImageFile).toHaveBeenCalledWith(file, [
          { name: 'Images', description: '', id: 'images' },
        ]);
        expect(mockAnalyzeDocumentFile).not.toHaveBeenCalled();
      }
    });

    test('treats non-image files as documents', async () => {
      const documentExtensions = ['.pdf', '.doc', '.txt', '.xlsx'];

      for (const ext of documentExtensions) {
        const file = `/path/to/file${ext}`;
        const folders = [{ id: 'docs', name: 'Documents', path: '/dest' }];
        const result = { category: 'Documents' };

        mockGetCustomFolders.mockReturnValue(folders);
        mockAnalyzeDocumentFile.mockResolvedValue(result);

        await watcher.handleFile(file);

        expect(mockAnalyzeDocumentFile).toHaveBeenCalledWith(file, [
          { name: 'Documents', description: '', id: 'docs' },
        ]);
        expect(mockAnalyzeImageFile).not.toHaveBeenCalled();
      }
    });
  });
});
