const path = require('path');
const os = require('os');
const fs = require('fs').promises;

// Mock ChromaDB client
jest.mock('chromadb', () => {
  const mockCollections = new Map();

  class MockCollection {
    constructor(name) {
      this.name = name;
      this.items = new Map();
    }

    async upsert({ ids, embeddings, metadatas, documents }) {
      for (let i = 0; i < ids.length; i++) {
        this.items.set(ids[i], {
          id: ids[i],
          embedding: embeddings[i],
          metadata: metadatas[i],
          document: documents[i],
        });
      }
    }

    async get(params) {
      const result = { ids: [], embeddings: [], metadatas: [], documents: [] };
      // If params has ids array, get specific items, otherwise get all
      if (params && params.ids && params.ids.length > 0) {
        for (const id of params.ids) {
          const item = this.items.get(id);
          if (item) {
            result.ids.push(item.id);
            result.embeddings.push(item.embedding);
            result.metadatas.push(item.metadata);
            result.documents.push(item.document);
          }
        }
      } else {
        // Get all when no ids specified or empty object
        for (const item of this.items.values()) {
          result.ids.push(item.id);
          result.embeddings.push(item.embedding);
          result.metadatas.push(item.metadata);
          result.documents.push(item.document);
        }
      }
      return result;
    }

    async query({ queryEmbeddings, nResults }) {
      const results = [];
      const queryVector = queryEmbeddings[0];

      for (const item of this.items.values()) {
        const distance = this.calculateDistance(queryVector, item.embedding);
        results.push({ item, distance });
      }

      results.sort((a, b) => a.distance - b.distance);
      const topResults = results.slice(0, nResults);

      return {
        ids: [topResults.map((r) => r.item.id)],
        distances: [topResults.map((r) => r.distance)],
        metadatas: [topResults.map((r) => r.item.metadata)],
        documents: [topResults.map((r) => r.item.document)],
      };
    }

    calculateDistance(a, b) {
      // Simple euclidean distance for testing
      if (!a || !b || a.length !== b.length) return 2;
      let sum = 0;
      for (let i = 0; i < a.length; i++) {
        sum += Math.pow(a[i] - b[i], 2);
      }
      return Math.sqrt(sum);
    }

    async count() {
      return this.items.size;
    }

    clear() {
      this.items.clear();
    }
  }

  class MockChromaClient {
    constructor() {
      mockCollections.clear();
    }

    async getOrCreateCollection({ name, metadata }) {
      if (!mockCollections.has(name)) {
        mockCollections.set(name, new MockCollection(name));
      }
      return mockCollections.get(name);
    }

    async createCollection({ name, metadata }) {
      const collection = new MockCollection(name);
      mockCollections.set(name, collection);
      return collection;
    }

    async deleteCollection({ name }) {
      mockCollections.delete(name);
    }
  }

  return {
    ChromaClient: MockChromaClient,
  };
});

describe('ChromaDBService', () => {
  let tmpDir;
  let chromaDbService;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `chromadb-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
    jest.resetModules();

    // Mock electron app
    const electron = require('./mocks/electron');
    electron.app.getPath.mockReturnValue(tmpDir);

    // Create service instance
    const { ChromaDBService } = require('../src/main/services/ChromaDBService');
    chromaDbService = new ChromaDBService();
  });

  afterEach(async () => {
    try {
      if (chromaDbService) {
        await chromaDbService.cleanup();
      }
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  test('initializes ChromaDB with collections', async () => {
    await chromaDbService.initialize();

    expect(chromaDbService.initialized).toBe(true);
    expect(chromaDbService.fileCollection).toBeDefined();
    expect(chromaDbService.folderCollection).toBeDefined();
  });

  test('upserts and queries folder embeddings', async () => {
    await chromaDbService.initialize();

    // Upsert folders
    await chromaDbService.upsertFolder({
      id: 'folder:project',
      name: 'Projects',
      description: 'Project files',
      vector: [1, 0, 0],
      model: 'test-model',
    });

    await chromaDbService.upsertFolder({
      id: 'folder:finance',
      name: 'Finance',
      description: 'Financial documents',
      vector: [0, 1, 0],
      model: 'test-model',
    });

    // Upsert a file
    await chromaDbService.upsertFile({
      id: 'file:/tmp/report.txt',
      vector: [0.9, 0.1, 0],
      meta: { path: '/tmp/report.txt' },
    });

    // Query for matching folders
    const matches = await chromaDbService.queryFolders(
      'file:/tmp/report.txt',
      2,
    );

    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].name).toBe('Projects');
    expect(matches[0].score).toBeGreaterThan(0);
  });

  test('resets file and folder collections', async () => {
    await chromaDbService.initialize();

    // Add some data
    await chromaDbService.upsertFolder({
      id: 'folder:test',
      name: 'Test',
      vector: [1, 0],
    });

    await chromaDbService.upsertFile({
      id: 'file:test',
      vector: [1, 0],
      meta: {},
    });

    // Get initial stats
    const statsBefore = await chromaDbService.getStats();
    expect(statsBefore.files).toBe(1);
    expect(statsBefore.folders).toBe(1);

    // Reset collections
    await chromaDbService.resetFiles();
    await chromaDbService.resetFolders();

    // Verify reset
    const statsAfter = await chromaDbService.getStats();
    expect(statsAfter.files).toBe(0);
    expect(statsAfter.folders).toBe(0);
  });

  test('finds similar files', async () => {
    await chromaDbService.initialize();

    // Add multiple files with different embeddings
    await chromaDbService.upsertFile({
      id: 'file:1',
      vector: [1, 0, 0],
      meta: { path: '/file1.txt' },
    });

    await chromaDbService.upsertFile({
      id: 'file:2',
      vector: [0.9, 0.1, 0],
      meta: { path: '/file2.txt' },
    });

    await chromaDbService.upsertFile({
      id: 'file:3',
      vector: [0, 1, 0],
      meta: { path: '/file3.txt' },
    });

    // Query for similar files
    const similar = await chromaDbService.querySimilarFiles([0.95, 0.05, 0], 2);

    expect(similar.length).toBe(2);
    expect(similar[0].metadata.path).toBe('/file2.txt');
    expect(similar[0].score).toBeGreaterThan(similar[1].score);
  });

  test('gets all folders', async () => {
    await chromaDbService.initialize();

    // Add folders
    await chromaDbService.upsertFolder({
      id: 'folder:1',
      name: 'Folder1',
      vector: [1, 0],
    });

    await chromaDbService.upsertFolder({
      id: 'folder:2',
      name: 'Folder2',
      vector: [0, 1],
    });

    const folders = await chromaDbService.getAllFolders();

    expect(folders.length).toBe(2);
    expect(folders.find((f) => f.name === 'Folder1')).toBeDefined();
    expect(folders.find((f) => f.name === 'Folder2')).toBeDefined();
  });

  test('handles invalid data gracefully', async () => {
    await chromaDbService.initialize();

    // Try to upsert invalid folder (missing vector)
    await expect(
      chromaDbService.upsertFolder({
        id: 'folder:invalid',
        name: 'Invalid',
      }),
    ).rejects.toThrow();

    // Try to upsert invalid file (missing id)
    await expect(
      chromaDbService.upsertFile({
        vector: [1, 0],
      }),
    ).rejects.toThrow();

    // Query for non-existent file
    const matches = await chromaDbService.queryFolders('file:nonexistent', 5);
    expect(matches).toEqual([]);
  });

  test('migrates from JSONL format', async () => {
    await chromaDbService.initialize();

    // Create JSONL test data
    const jsonlPath = path.join(tmpDir, 'test-embeddings.jsonl');
    const jsonlData = [
      JSON.stringify({
        id: 'file:1',
        vector: [1, 0],
        meta: { path: '/file1.txt' },
      }),
      JSON.stringify({
        id: 'file:2',
        vector: [0, 1],
        meta: { path: '/file2.txt' },
      }),
    ].join('\n');

    await fs.writeFile(jsonlPath, jsonlData);

    // Migrate
    const migrated = await chromaDbService.migrateFromJsonl(jsonlPath, 'file');

    expect(migrated).toBe(2);

    // Verify migration
    const stats = await chromaDbService.getStats();
    expect(stats.files).toBe(2);
  });

  test('handles missing JSONL file gracefully', async () => {
    await chromaDbService.initialize();

    const nonExistentPath = path.join(tmpDir, 'nonexistent.jsonl');
    const migrated = await chromaDbService.migrateFromJsonl(
      nonExistentPath,
      'file',
    );

    expect(migrated).toBe(0);
  });
});
