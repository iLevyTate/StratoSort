// Mock ollamaUtils at the module level
jest.mock('../src/main/ollamaUtils', () => ({
  getOllamaClient: jest.fn(),
  getOllamaEmbeddingModel: jest.fn().mockReturnValue('test-embedding-model'),
}));

const FolderMatchingService = require('../src/main/services/FolderMatchingService');
const {
  getOllamaClient,
  getOllamaEmbeddingModel,
} = require('../src/main/ollamaUtils');

describe('FolderMatchingService', () => {
  let mockEmbeddingStore;
  let mockOllamaClient;
  let service;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock embedding store
    mockEmbeddingStore = {
      upsertFolder: jest.fn().mockResolvedValue(),
      upsertFile: jest.fn().mockResolvedValue(),
      queryFolders: jest.fn().mockResolvedValue([]),
      folderVectors: {
        get: jest.fn().mockReturnValue(null),
      },
    };

    // Mock Ollama client
    mockOllamaClient = {
      embeddings: jest.fn().mockResolvedValue({ embedding: [0.1, 0.2, 0.3] }),
    };

    // Set up ollamaUtils mocks using spyOn
    jest
      .spyOn(require('../src/main/ollamaUtils'), 'getOllamaClient')
      .mockResolvedValue(mockOllamaClient);
    jest
      .spyOn(require('../src/main/ollamaUtils'), 'getOllamaEmbeddingModel')
      .mockReturnValue('test-embedding-model');

    service = new FolderMatchingService(mockEmbeddingStore);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('initializes with embedding store', () => {
      expect(service.embeddingStore).toBe(mockEmbeddingStore);
    });
  });

  describe('embedText', () => {
    test('generates embeddings for text', async () => {
      const testText = 'This is a test document';
      const mockEmbedding = [0.1, 0.2, 0.3];
      const expectedModel = 'test-embedding-model';

      // Mock the embeddings response
      mockOllamaClient.embeddings.mockResolvedValue({
        embedding: mockEmbedding,
      });

      const result = await service.embedText(testText);

      expect(getOllamaClient).toHaveBeenCalled();
      expect(mockOllamaClient.embeddings).toHaveBeenCalledWith({
        model: expectedModel,
        prompt: testText.slice(0, 8000),
      });
      expect(result).toEqual({
        vector: mockEmbedding,
        model: expectedModel,
      });
    });

    test('uses default model when none specified', async () => {
      // Temporarily override the mock for this specific test
      const originalSpy = jest.spyOn(
        require('../src/main/ollamaUtils'),
        'getOllamaEmbeddingModel',
      );
      originalSpy.mockReturnValueOnce(null);

      const mockEmbedding = [0.1, 0.2, 0.3];
      mockOllamaClient.embeddings.mockResolvedValue({
        embedding: mockEmbedding,
      });

      const result = await service.embedText('test text');

      expect(result.model).toBe('mxbai-embed-large');
    });

    test('handles embedding errors', async () => {
      const error = new Error('Embedding failed');
      mockOllamaClient.embeddings.mockRejectedValue(error);

      await expect(service.embedText('test text')).rejects.toThrow(
        'Embedding failed',
      );
    });

    test('truncates long text to 8000 characters', async () => {
      const longText = 'a'.repeat(9000);
      const mockEmbedding = [0.1, 0.2, 0.3];

      mockOllamaClient.embeddings.mockResolvedValue({
        embedding: mockEmbedding,
      });

      const result = await service.embedText(longText);

      expect(getOllamaClient).toHaveBeenCalled();
      expect(getOllamaClient).toHaveBeenCalled();
      expect(mockOllamaClient.embeddings).toHaveBeenCalledWith({
        model: 'test-embedding-model',
        prompt: 'a'.repeat(8000),
      });
      expect(result.model).toBe('test-embedding-model');
    });
  });

  describe('upsertFolderEmbedding', () => {
    test('creates new folder embedding', async () => {
      const folder = {
        id: 'folder1',
        name: 'Test Folder',
        description: 'A test folder',
      };
      const mockVector = [0.1, 0.2, 0.3];
      const expectedPayload = {
        id: 'folder1',
        name: 'Test Folder',
        description: 'A test folder',
        vector: mockVector,
        model: 'test-embedding-model', // Service falls back to default model
        updatedAt: expect.any(String),
      };

      mockEmbeddingStore.folderVectors.get.mockReturnValue(null);
      mockOllamaClient.embeddings.mockResolvedValue({
        embedding: mockVector,
      });

      const result = await service.upsertFolderEmbedding(folder);

      expect(getOllamaClient).toHaveBeenCalled();
      expect(mockOllamaClient.embeddings).toHaveBeenCalledWith({
        model: 'test-embedding-model',
        prompt: 'Test Folder\nA test folder',
      });
      expect(mockEmbeddingStore.upsertFolder).toHaveBeenCalledWith(
        expectedPayload,
      );
      expect(result).toEqual(expectedPayload);
    });

    test('skips embedding if folder unchanged', async () => {
      const folder = {
        id: 'folder1',
        name: 'Test Folder',
        description: 'A test folder',
      };
      const existingEmbedding = {
        id: 'folder1',
        name: 'Test Folder',
        description: 'A test folder',
        vector: [0.1, 0.2, 0.3],
        model: 'test-embedding-model',
      };

      mockEmbeddingStore.folderVectors.get.mockReturnValue(existingEmbedding);

      const result = await service.upsertFolderEmbedding(folder);

      expect(mockOllamaClient.embeddings).not.toHaveBeenCalled();
      expect(mockEmbeddingStore.upsertFolder).not.toHaveBeenCalled();
      expect(result).toEqual(existingEmbedding);
    });

    test('handles missing description', async () => {
      const folder = {
        id: 'folder1',
        name: 'Test Folder',
      };
      const mockVector = [0.1, 0.2, 0.3];

      mockEmbeddingStore.folderVectors.get.mockReturnValue(null);
      mockOllamaClient.embeddings.mockResolvedValue({
        embedding: mockVector,
      });

      await service.upsertFolderEmbedding(folder);

      expect(getOllamaClient).toHaveBeenCalled();
      expect(mockOllamaClient.embeddings).toHaveBeenCalledWith({
        model: 'test-embedding-model',
        prompt: 'Test Folder',
      });
    });

    test('handles empty description', async () => {
      const folder = {
        id: 'folder1',
        name: 'Test Folder',
        description: '',
      };
      const mockVector = [0.1, 0.2, 0.3];

      mockEmbeddingStore.folderVectors.get.mockReturnValue(null);
      mockOllamaClient.embeddings.mockResolvedValue({
        embedding: mockVector,
      });

      await service.upsertFolderEmbedding(folder);

      expect(getOllamaClient).toHaveBeenCalled();
      expect(mockOllamaClient.embeddings).toHaveBeenCalledWith({
        model: 'test-embedding-model',
        prompt: 'Test Folder',
      });
    });

    test('handles embedding errors', async () => {
      const folder = {
        id: 'folder1',
        name: 'Test Folder',
      };
      const error = new Error('Embedding failed');

      mockEmbeddingStore.folderVectors.get.mockReturnValue(null);
      mockOllamaClient.embeddings.mockRejectedValue(error);

      await expect(service.upsertFolderEmbedding(folder)).rejects.toThrow(
        'Embedding failed',
      );
      expect(mockEmbeddingStore.upsertFolder).not.toHaveBeenCalled();
    });
  });

  describe('upsertFileEmbedding', () => {
    test('creates file embedding with content summary', async () => {
      const fileId = 'file1';
      const contentSummary = 'This is a test document summary';
      const fileMeta = { name: 'test.txt', size: 1024 };
      const mockVector = [0.1, 0.2, 0.3];
      const expectedPayload = {
        id: 'file1',
        vector: mockVector,
        model: 'test-embedding-model',
        meta: fileMeta,
        updatedAt: expect.any(String),
      };

      mockOllamaClient.embeddings.mockResolvedValue({
        embedding: mockVector,
      });

      await service.upsertFileEmbedding(fileId, contentSummary, fileMeta);

      expect(mockEmbeddingStore.upsertFile).toHaveBeenCalledWith(
        expectedPayload,
      );
    });

    test('handles empty content summary', async () => {
      const fileId = 'file1';
      const contentSummary = '';
      const mockVector = [0.1, 0.2, 0.3];

      mockOllamaClient.embeddings.mockResolvedValue({
        embedding: mockVector,
      });

      await service.upsertFileEmbedding(fileId, contentSummary);

      expect(getOllamaClient).toHaveBeenCalled();
      expect(mockOllamaClient.embeddings).toHaveBeenCalledWith({
        model: 'test-embedding-model',
        prompt: '',
      });
    });

    test('handles null content summary', async () => {
      const fileId = 'file1';
      const contentSummary = null;
      const mockVector = [0.1, 0.2, 0.3];

      mockOllamaClient.embeddings.mockResolvedValue({
        embedding: mockVector,
      });

      await service.upsertFileEmbedding(fileId, contentSummary);

      expect(getOllamaClient).toHaveBeenCalled();
      expect(mockOllamaClient.embeddings).toHaveBeenCalledWith({
        model: 'test-embedding-model',
        prompt: '',
      });
    });

    test('handles embedding errors', async () => {
      const error = new Error('Embedding failed');
      mockOllamaClient.embeddings.mockRejectedValue(error);

      await expect(
        service.upsertFileEmbedding('file1', 'content'),
      ).rejects.toThrow('Embedding failed');
      expect(mockEmbeddingStore.upsertFile).not.toHaveBeenCalled();
    });
  });

  describe('matchFileToFolders', () => {
    test('queries folders for file match', async () => {
      const fileId = 'file1';
      const topK = 5;
      const mockResults = [
        { id: 'folder1', score: 0.9 },
        { id: 'folder2', score: 0.8 },
      ];

      mockEmbeddingStore.queryFolders.mockResolvedValue(mockResults);

      const result = await service.matchFileToFolders(fileId, topK);

      expect(mockEmbeddingStore.queryFolders).toHaveBeenCalledWith(
        fileId,
        topK,
      );
      expect(result).toEqual(mockResults);
    });

    test('uses default topK value', async () => {
      const fileId = 'file1';
      const mockResults = [{ id: 'folder1', score: 0.9 }];

      mockEmbeddingStore.queryFolders.mockResolvedValue(mockResults);

      const result = await service.matchFileToFolders(fileId);

      expect(mockEmbeddingStore.queryFolders).toHaveBeenCalledWith(fileId, 5);
      expect(result).toEqual(mockResults);
    });

    test('handles query errors', async () => {
      const error = new Error('Query failed');
      mockEmbeddingStore.queryFolders.mockRejectedValue(error);

      await expect(service.matchFileToFolders('file1')).rejects.toThrow(
        'Query failed',
      );
    });
  });

  describe('integration scenarios', () => {
    test('complete workflow for folder matching', async () => {
      const folder = {
        id: 'test-folder',
        name: 'Test Folder',
        description: 'A folder for testing',
      };
      const fileId = 'test-file';
      const contentSummary = 'Test file content';
      const mockVector = [0.1, 0.2, 0.3];
      const mockMatchResults = [{ id: 'test-folder', score: 0.95 }];

      // Setup mocks
      mockEmbeddingStore.folderVectors.get.mockReturnValue(null);
      mockOllamaClient.embeddings
        .mockResolvedValueOnce({ embedding: mockVector }) // For folder
        .mockResolvedValueOnce({ embedding: mockVector }); // For file
      mockEmbeddingStore.queryFolders.mockResolvedValue(mockMatchResults);

      // Execute workflow
      const folderEmbedding = await service.upsertFolderEmbedding(folder);
      await service.upsertFileEmbedding(fileId, contentSummary);
      const matches = await service.matchFileToFolders(fileId);

      // Verify results
      expect(folderEmbedding.id).toBe('test-folder');
      expect(folderEmbedding.name).toBe('Test Folder');
      expect(folderEmbedding.vector).toEqual(mockVector);
      expect(matches).toEqual(mockMatchResults);
    });

    test('handles missing embedding store methods', async () => {
      const incompleteStore = {}; // Missing required methods
      const serviceWithIncompleteStore = new FolderMatchingService(
        incompleteStore,
      );

      await expect(
        serviceWithIncompleteStore.upsertFolderEmbedding({
          id: 'test',
          name: 'Test',
        }),
      ).rejects.toThrow();
    });
  });
});
