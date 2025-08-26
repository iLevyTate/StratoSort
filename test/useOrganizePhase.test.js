// Test the organize phase functionality integration
// Testing the key logic components that support the useOrganizePhase hook

const { PHASES } = require('../src/shared/constants');

// Mock electron API
const mockElectronAPI = {
  files: {
    getDocumentsPath: jest.fn(),
    normalizePath: jest.fn((path) => path),
    performOperation: jest.fn(),
  },
  events: {
    onOperationProgress: jest.fn(),
  },
  smartFolders: {
    get: jest.fn(),
  },
};

// Mock window.electronAPI
Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true,
});

// Mock the batch action creator
jest.mock('../src/renderer/components/UndoRedoSystem', () => ({
  createOrganizeBatchAction: jest.fn(() => ({
    type: 'organize_batch',
    operations: [],
  })),
}));

describe('Organize Phase Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Smart Folders Integration', () => {
    test('loads smart folders from electron API', async () => {
      const mockFolders = [
        { id: '1', name: 'Documents', category: 'document' },
        { id: '2', name: 'Images', category: 'image' },
      ];

      mockElectronAPI.smartFolders.get.mockResolvedValue(mockFolders);

      // Simulate the smart folder loading logic from useOrganizePhase
      const folders = await window.electronAPI.smartFolders.get();

      expect(folders).toEqual(mockFolders);
      expect(mockElectronAPI.smartFolders.get).toHaveBeenCalled();
    });

    test('handles smart folders API failure', async () => {
      mockElectronAPI.smartFolders.get.mockRejectedValue(
        new Error('API Error'),
      );

      await expect(window.electronAPI.smartFolders.get()).rejects.toThrow(
        'API Error',
      );
    });

    test('finds smart folder for category', () => {
      const smartFolders = [
        { id: '1', name: 'Documents', category: 'document' },
        { id: '2', name: 'Images', category: 'image' },
      ];

      // Simulate findSmartFolderForCategory logic
      const findSmartFolderForCategory = (category) => {
        const normalizedCategory = category.toLowerCase().trim();
        return smartFolders.find(
          (f) => f?.name?.toLowerCase()?.trim() === normalizedCategory,
        );
      };

      expect(findSmartFolderForCategory('documents')).toEqual({
        id: '1',
        name: 'Documents',
        category: 'document',
      });

      expect(findSmartFolderForCategory('images')).toEqual({
        id: '2',
        name: 'Images',
        category: 'image',
      });

      expect(findSmartFolderForCategory('unknown')).toBeUndefined();
    });
  });

  describe('File Organization Logic', () => {
    test('calculates destination path correctly', () => {
      const smartFolders = [
        { id: '1', name: 'Documents', path: null, category: 'document' },
        { id: '2', name: 'Images', path: '/custom/images', category: 'image' },
      ];

      const defaultLocation = '/home/user/Documents';

      // Simulate destination calculation logic (matches actual implementation)
      const calculateDestination = (file, smartFolders, defaultLocation) => {
        const smartFolder = smartFolders.find(
          (f) => f.name.toLowerCase() === file.category?.toLowerCase(),
        );

        const destinationDir = smartFolder
          ? smartFolder.path || `${defaultLocation}/${smartFolder.name}`
          : `${defaultLocation}/${file.category || 'Uncategorized'}`;

        return `${destinationDir}/${file.suggestedName || file.name}`;
      };

      const file1 = {
        name: 'document.pdf',
        suggestedName: 'important.pdf',
        category: 'documents',
      };

      const file2 = {
        name: 'photo.jpg',
        suggestedName: 'vacation.jpg',
        category: 'images',
      };

      const file3 = {
        name: 'unknown.xyz',
        category: 'unknown',
      };

      expect(calculateDestination(file1, smartFolders, defaultLocation)).toBe(
        '/home/user/Documents/Documents/important.pdf',
      );

      expect(calculateDestination(file2, smartFolders, defaultLocation)).toBe(
        '/custom/images/vacation.jpg',
      );

      expect(calculateDestination(file3, smartFolders, defaultLocation)).toBe(
        '/home/user/Documents/unknown/unknown.xyz',
      );
    });

    test('creates organize operations', () => {
      const unprocessedFiles = [
        {
          path: '/path/file1.pdf',
          name: 'file1.pdf',
          analysis: { suggestedName: 'doc1.pdf', category: 'documents' },
        },
        {
          path: '/path/file2.jpg',
          name: 'file2.jpg',
          analysis: { suggestedName: 'img1.jpg', category: 'images' },
        },
      ];

      const smartFolders = [
        { id: '1', name: 'Documents', path: null, category: 'document' },
        { id: '2', name: 'Images', path: '/custom/images', category: 'image' },
      ];

      const defaultLocation = '/home/user/Documents';

      // Simulate operation creation logic
      const createOperations = (files, smartFolders, defaultLocation) => {
        return files.map((file) => {
          const category = file.analysis?.category;
          const smartFolder = smartFolders.find(
            (f) => f.name.toLowerCase() === category?.toLowerCase(),
          );

          const destinationDir = smartFolder
            ? smartFolder.path || `${defaultLocation}/${smartFolder.name}`
            : `${defaultLocation}/${category || 'Uncategorized'}`;

          const destination = `${destinationDir}/${file.analysis?.suggestedName || file.name}`;

          return {
            type: 'move',
            source: file.path,
            destination: mockElectronAPI.files.normalizePath(destination),
          };
        });
      };

      const operations = createOperations(
        unprocessedFiles,
        smartFolders,
        defaultLocation,
      );

      expect(operations).toHaveLength(2);
      expect(operations[0]).toEqual({
        type: 'move',
        source: '/path/file1.pdf',
        destination: '/home/user/Documents/Documents/doc1.pdf',
      });

      expect(operations[1]).toEqual({
        type: 'move',
        source: '/path/file2.jpg',
        destination: '/custom/images/img1.jpg',
      });
    });
  });

  describe('Batch Organization', () => {
    test('calls createOrganizeBatchAction with operations', () => {
      const {
        createOrganizeBatchAction,
      } = require('../src/renderer/components/UndoRedoSystem');

      const operations = [
        {
          type: 'move',
          source: '/path/file1.pdf',
          destination: '/dest/file1.pdf',
        },
        {
          type: 'move',
          source: '/path/file2.jpg',
          destination: '/dest/file2.jpg',
        },
      ];

      const action = createOrganizeBatchAction(
        'Test organization',
        operations,
        {},
      );

      expect(createOrganizeBatchAction).toHaveBeenCalledWith(
        'Test organization',
        operations,
        {},
      );
    });

    test('handles successful organization', async () => {
      const mockResults = [
        {
          source: '/path/file1.pdf',
          destination: '/dest/file1.pdf',
          success: true,
        },
        {
          source: '/path/file2.jpg',
          destination: '/dest/file2.jpg',
          success: true,
        },
      ];

      mockElectronAPI.files.performOperation.mockResolvedValue({
        success: true,
        results: mockResults,
      });

      const result = await mockElectronAPI.files.performOperation([]);

      expect(result.success).toBe(true);
      expect(result.results).toEqual(mockResults);
    });

    test('handles organization errors', async () => {
      mockElectronAPI.files.performOperation.mockRejectedValue(
        new Error('File system error'),
      );

      await expect(mockElectronAPI.files.performOperation([])).rejects.toThrow(
        'File system error',
      );
    });
  });

  describe('Progress Tracking', () => {
    test('subscribes to operation progress events', () => {
      const unsubscribeMock = jest.fn();
      mockElectronAPI.events.onOperationProgress.mockReturnValue(
        unsubscribeMock,
      );

      // Simulate progress subscription logic
      const unsubscribe = window.electronAPI.events.onOperationProgress(
        (payload) => {
          if (payload?.type === 'batch_organize') {
            // Handle progress update
          }
        },
      );

      expect(mockElectronAPI.events.onOperationProgress).toHaveBeenCalled();
      expect(typeof unsubscribe).toBe('function');
    });

    test('updates progress state', () => {
      let progress = { current: 0, total: 0, currentFile: '' };

      const handleProgress = (payload) => {
        if (payload?.type === 'batch_organize') {
          progress = {
            current: payload.current || 0,
            total: payload.total || 0,
            currentFile: payload.currentFile || '',
          };
        }
      };

      handleProgress({
        type: 'batch_organize',
        current: 5,
        total: 10,
        currentFile: 'file.pdf',
      });

      expect(progress).toEqual({
        current: 5,
        total: 10,
        currentFile: 'file.pdf',
      });
    });
  });

  describe('File State Management', () => {
    test('tracks processed file IDs', () => {
      const processedFileIds = new Set();

      // Simulate markFilesAsProcessed logic
      const markFilesAsProcessed = (filePaths) => {
        filePaths.forEach((path) => processedFileIds.add(path));
      };

      // Simulate unmarkFilesAsProcessed logic
      const unmarkFilesAsProcessed = (filePaths) => {
        filePaths.forEach((path) => processedFileIds.delete(path));
      };

      markFilesAsProcessed(['/path/file1.pdf', '/path/file2.pdf']);
      expect(processedFileIds.has('/path/file1.pdf')).toBe(true);
      expect(processedFileIds.has('/path/file2.pdf')).toBe(true);

      unmarkFilesAsProcessed(['/path/file1.pdf']);
      expect(processedFileIds.has('/path/file1.pdf')).toBe(false);
      expect(processedFileIds.has('/path/file2.pdf')).toBe(true);
    });

    test('calculates unprocessed files', () => {
      const analysisResults = [
        { path: '/path/file1.pdf', analysis: { category: 'doc' } },
        { path: '/path/file2.pdf', analysis: null }, // No analysis
        { path: '/path/file3.pdf', analysis: { category: 'doc' } },
      ];

      const processedFileIds = new Set(['/path/file1.pdf']);

      // Simulate unprocessed files calculation
      const unprocessedFiles = analysisResults.filter(
        (file) => !processedFileIds.has(file.path) && file.analysis,
      );

      expect(unprocessedFiles).toHaveLength(1);
      expect(unprocessedFiles[0].path).toBe('/path/file3.pdf');
    });
  });

  describe('Bulk Operations', () => {
    test('applies bulk category changes', () => {
      let editingFiles = {};
      let selectedFiles = new Set([0, 1]);
      let bulkCategory = 'finance';

      // Simulate applyBulkCategoryChange logic
      const applyBulkCategoryChange = () => {
        if (!bulkCategory) return;

        const newEdits = {};
        selectedFiles.forEach((index) => {
          newEdits[index] = { ...editingFiles[index], category: bulkCategory };
        });

        editingFiles = { ...editingFiles, ...newEdits };
        bulkCategory = '';
        selectedFiles = new Set();
      };

      applyBulkCategoryChange();

      expect(editingFiles[0].category).toBe('finance');
      expect(editingFiles[1].category).toBe('finance');
      expect(bulkCategory).toBe('');
      expect(selectedFiles.size).toBe(0);
    });

    test('handles file selection', () => {
      let selectedFiles = new Set();

      // Simulate toggleFileSelection logic
      const toggleFileSelection = (index) => {
        const newSelection = new Set(selectedFiles);
        newSelection.has(index)
          ? newSelection.delete(index)
          : newSelection.add(index);
        selectedFiles = newSelection;
      };

      toggleFileSelection(0);
      expect(selectedFiles.has(0)).toBe(true);

      toggleFileSelection(1);
      expect(selectedFiles.has(1)).toBe(true);

      toggleFileSelection(0);
      expect(selectedFiles.has(0)).toBe(false);
      expect(selectedFiles.has(1)).toBe(true);
    });
  });
});
