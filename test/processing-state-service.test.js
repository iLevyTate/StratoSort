const fs = require('fs').promises;
const path = require('path');
const os = require('os');

describe('ProcessingStateService', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `stratosort-processing-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
    jest.resetModules();
    const electron = require('./mocks/electron');
    electron.app.getPath.mockReturnValue(tmpDir);
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  test('tracks analysis jobs lifecycle', async () => {
    const ProcessingStateService = require('../src/main/services/ProcessingStateService');
    const svc = new ProcessingStateService();
    const file = path.join(tmpDir, 'doc.pdf');

    await svc.markAnalysisStart(file);
    expect(svc.getIncompleteAnalysisJobs().length).toBe(1);

    await svc.markAnalysisComplete(file);
    expect(svc.getIncompleteAnalysisJobs().length).toBe(0);
  });

  test('creates and completes organize batch with progress updates', async () => {
    const ProcessingStateService = require('../src/main/services/ProcessingStateService');
    const svc = new ProcessingStateService();
    const batchId = 'batch-test';
    const ops = [
      { source: '/from/a.txt', destination: '/to/a.txt' },
      { source: '/from/b.txt', destination: '/to/b.txt' },
    ];

    const batch = await svc.createOrLoadOrganizeBatch(batchId, ops);
    expect(batch.operations.length).toBe(2);
    expect(batch.operations[0].status).toBe('pending');

    await svc.markOrganizeOpStarted(batchId, 0);
    await svc.markOrganizeOpDone(batchId, 0);
    await svc.markOrganizeOpError(batchId, 1, 'Disk full');
    await svc.completeOrganizeBatch(batchId);

    const incomplete = svc.getIncompleteOrganizeBatches();
    expect(Array.isArray(incomplete)).toBe(true);
    expect(
      incomplete.length === 0 || incomplete.every((b) => !!b.completedAt),
    ).toBe(true);
  });
});
