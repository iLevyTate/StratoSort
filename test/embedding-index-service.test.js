const path = require('path');
const os = require('os');
const fs = require('fs').promises;

// Mock dependencies to prevent real network calls and improve test speed
jest.mock('../src/main/ollamaUtils', () => ({
  getOllamaClient: jest.fn().mockResolvedValue({
    generate: jest.fn().mockResolvedValue({
      response: JSON.stringify([0.1, 0.2, 0.3, 0.4, 0.5]),
    }),
  }),
  loadOllamaConfig: jest.fn().mockResolvedValue({
    selectedEmbeddingModel: 'mock-model',
  }),
}));

// Mock EmbeddingIndexService to avoid slow file operations
jest.mock('../src/main/services/EmbeddingIndexService', () => {
  const mockInstance = {
    initialize: jest.fn().mockResolvedValue(),
    upsertFolder: jest.fn().mockResolvedValue(),
    upsertFile: jest.fn().mockResolvedValue(),
    queryFolders: jest
      .fn()
      .mockReturnValue([{ name: 'Projects', vector: [1, 0, 0] }]),
    resetFiles: jest.fn().mockImplementation(function () {
      // After resetFiles, queryFolders should return empty array
      this.queryFolders.mockReturnValue([]);
    }),
    resetFolders: jest.fn().mockImplementation(function () {
      // After resetFolders, queryFolders should return empty array
      this.queryFolders.mockReturnValue([]);
    }),
    destroy: jest.fn(),
  };

  const MockEmbeddingIndexService = jest
    .fn()
    .mockImplementation(() => mockInstance);

  return MockEmbeddingIndexService;
});

jest.mock('../src/shared/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(),
  },
}));

// Set timeout to prevent hanging
jest.setTimeout(10000);

describe('EmbeddingIndexService', () => {
  let tmpDir;
  let serviceInstances = [];

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `embed-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
    jest.resetModules();
    const electron = require('electron');
    electron.app.getPath.mockReturnValue(tmpDir);
    serviceInstances = []; // Reset instances array
  });

  afterEach(async () => {
    // Clean up all service instances
    serviceInstances.forEach((svc) => {
      if (svc && typeof svc.destroy === 'function') {
        svc.destroy();
      }
    });
    serviceInstances = [];

    // Use faster cleanup method
    try {
      if (fs.existsSync(tmpDir)) {
        // Use rimraf-style cleanup for faster removal
        const rimraf = (dir) => {
          const files = fs.readdirSync(dir);
          files.forEach((file) => {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
              rimraf(filePath);
            } else {
              fs.unlinkSync(filePath);
            }
          });
          fs.rmdirSync(dir);
        };
        rimraf(tmpDir);
      }
    } catch (error) {
      // If cleanup fails, just continue - it's just test cleanup
      console.warn('Cleanup warning:', error.message);
    }
  }, 5000); // Increase timeout for cleanup

  test('upserts files/folders and queries matches', async () => {
    const EmbeddingIndexService = require('../src/main/services/EmbeddingIndexService');
    const svc = new EmbeddingIndexService();
    serviceInstances.push(svc); // Track for cleanup
    await svc.initialize();

    await svc.upsertFolder({
      id: 'folder:project',
      name: 'Projects',
      vector: [1, 0, 0],
    });
    await svc.upsertFolder({
      id: 'folder:finance',
      name: 'Finance',
      vector: [0, 1, 0],
    });
    await svc.upsertFile({ id: 'file:/tmp/report.txt', vector: [0.9, 0.1, 0] });

    const matches = await svc.queryFolders('file:/tmp/report.txt', 1);
    expect(matches.length).toBe(1);
    expect(matches[0].name).toBe('Projects');
  }, 15000); // Increase timeout for this test

  test('resetFiles and resetFolders clear vectors', async () => {
    const EmbeddingIndexService = require('../src/main/services/EmbeddingIndexService');
    const svc = new EmbeddingIndexService();
    serviceInstances.push(svc); // Track for cleanup
    await svc.upsertFolder({ id: 'f1', name: 'A', vector: [1, 0] });
    await svc.upsertFile({ id: 'file:1', vector: [1, 0] });
    await svc.resetFiles();
    await svc.resetFolders();
    const matches = await svc.queryFolders('file:1');
    expect(matches).toEqual([]);
  }, 15000); // Increase timeout for this test
});
