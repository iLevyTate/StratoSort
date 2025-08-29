const path = require('path');
const os = require('os');
const fs = require('fs').promises;

describe('AnalysisHistoryService', () => {
  let tmpDir;
  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `history-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
    jest.resetModules();
    const electron = require('electron');
    electron.app.getPath.mockReturnValue(tmpDir);
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  test('initializes on missing or corrupted file and records entries', async () => {
    const AnalysisHistoryService = require('../src/main/services/AnalysisHistoryService');
    const svc = new AnalysisHistoryService();
    await svc.initialize();
    const fileInfo = {
      path: 'C:/docs/invoice.pdf',
      size: 1000,
      lastModified: Date.now(),
    };
    const analysis = {
      subject: 'Invoice',
      summary: 'Invoice summary',
      tags: ['finance'],
      confidence: 0.9,
    };
    await svc.recordAnalysis(fileInfo, analysis);
    const recent = await svc.getRecentAnalysis(10);
    expect(recent.length).toBeGreaterThan(0);

    // Corrupt the file, then re-initialize should recover
    const file = path.join(tmpDir, 'analysis-history.json');
    await fs.writeFile(file, '{not json');
    const svc2 = new AnalysisHistoryService();
    await svc2.initialize();
    const stats = await svc2.getStatistics();
    expect(stats).toBeDefined();
  });

  test('search finds entries by text', async () => {
    const AnalysisHistoryService = require('../src/main/services/AnalysisHistoryService');
    const svc = new AnalysisHistoryService();
    await svc.initialize();
    await svc.recordAnalysis(
      { path: 'C:/docs/alpha.txt', size: 1, lastModified: Date.now() },
      { summary: 'Project Alpha notes' },
    );
    await svc.recordAnalysis(
      { path: 'C:/docs/beta.txt', size: 1, lastModified: Date.now() },
      { summary: 'Project Beta report' },
    );
    const results = await svc.searchAnalysis('alpha');
    expect(results.some((r) => r.originalPath.includes('alpha'))).toBe(true);
  });
});
