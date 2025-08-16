const path = require('path');
const os = require('os');
const fs = require('fs').promises;

describe('EmbeddingIndexService', () => {
  let tmpDir;
  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `embed-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
    jest.resetModules();
    const electron = require('./mocks/electron');
    electron.app.getPath.mockReturnValue(tmpDir);
  });

  afterEach(async () => {
    try { await fs.rm(tmpDir, { recursive: true, force: true }); } catch {}
  });

  test('upserts files/folders and queries matches', async () => {
    const EmbeddingIndexService = require('../src/main/services/EmbeddingIndexService');
    const svc = new EmbeddingIndexService();
    await svc.initialize();

    await svc.upsertFolder({ id: 'folder:project', name: 'Projects', vector: [1, 0, 0] });
    await svc.upsertFolder({ id: 'folder:finance', name: 'Finance', vector: [0, 1, 0] });
    await svc.upsertFile({ id: 'file:/tmp/report.txt', vector: [0.9, 0.1, 0] });

    const matches = await svc.queryFolders('file:/tmp/report.txt', 1);
    expect(matches.length).toBe(1);
    expect(matches[0].name).toBe('Projects');
  });

  test('resetFiles and resetFolders clear vectors', async () => {
    const EmbeddingIndexService = require('../src/main/services/EmbeddingIndexService');
    const svc = new EmbeddingIndexService();
    await svc.upsertFolder({ id: 'f1', name: 'A', vector: [1, 0] });
    await svc.upsertFile({ id: 'file:1', vector: [1, 0] });
    await svc.resetFiles();
    await svc.resetFolders();
    const matches = await svc.queryFolders('file:1');
    expect(matches).toEqual([]);
  });
});


