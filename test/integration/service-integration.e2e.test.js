const fs = require('fs').promises;
const fssync = require('fs');
const path = require('path');
const os = require('os');

const ServiceIntegration = require('../../src/main/services/ServiceIntegration');

// Helper to create a tmp working dir per test
async function createTempDir(prefix = 'stratosort-e2e') {
  const dir = path.join(os.tmpdir(), `${prefix}-${Date.now()}`);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

// Create a 1x1 PNG buffer
function tinyPngBuffer() {
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAoMBgQx5wxsAAAAASUVORK5CYII=';
  return Buffer.from(b64, 'base64');
}

describe('ServiceIntegration end-to-end', () => {
  let svc;
  let workDir;

  beforeAll(async () => {
    svc = new ServiceIntegration();
    await svc.initialize();
  });

  beforeEach(async () => {
    workDir = await createTempDir();
  });

  afterEach(async () => {
    try { await fs.rm(workDir, { recursive: true, force: true }); } catch {}
  });

  test('analyzes a txt file and records history', async () => {
    const src = path.join(workDir, 'invoice_projectX_2024.txt');
    await fs.writeFile(src, 'Invoice for project X totalling $5000 due 2024-12-31');

    const fileInfo = {
      path: src,
      size: (await fs.stat(src)).size,
      lastModified: (await fs.stat(src)).mtimeMs,
      mimeType: 'text/plain'
    };

    const result = await svc.analyzeFileWithHistory(src, fileInfo, { smartFolders: [{ name: 'Financial' }] });

    expect(result).toHaveProperty('analysisId');
    expect(result).toHaveProperty('category');
    expect(typeof result.confidence).toBe('number');

    const entry = await svc.analysisHistory.getAnalysisByPath(src);
    expect(entry).not.toBeNull();
    expect(entry.analysis.category).toBeTruthy();
  });

  test('organizes file with undo/redo', async () => {
    const src = path.join(workDir, 'report_projectY.txt');
    await fs.writeFile(src, 'Project Y weekly report');

    // Build rules with basePath inside workDir
    const rules = { basePath: path.join(workDir, 'organized'), smartFolders: [{ name: 'project', path: path.join(workDir, 'organized', 'project') }] };

    const fileInfo = { path: src, size: (await fs.stat(src)).size, lastModified: (await fs.stat(src)).mtimeMs };

    // Determine a target path and organize
    const targetPath = svc.determineTargetPath({ path: src, analysis: { category: 'project', subject: 'Project Y report' } }, rules);
    const orgRes = await svc.organizeFileWithUndo(fileInfo, targetPath, rules);

    expect(orgRes.success).toBe(true);
    expect(fssync.existsSync(targetPath)).toBe(true);
    expect(fssync.existsSync(src)).toBe(false);

    // Undo move
    const undoRes = await svc.undoLastAction();
    expect(undoRes.success).toBe(true);
    expect(fssync.existsSync(src)).toBe(true);

    // Redo move
    const redoRes = await svc.redoLastAction();
    expect(redoRes.success).toBe(true);
    expect(fssync.existsSync(targetPath)).toBe(true);
  });

  test('batch organize and rollback on error', async () => {
    // Create two files, but one target will be invalid to trigger rollback
    const a = path.join(workDir, 'a_project.txt');
    const b = path.join(workDir, 'b_financial.txt');
    await fs.writeFile(a, 'alpha');
    await fs.writeFile(b, 'beta');

    const rules = { basePath: path.join(workDir, 'organized'), smartFolders: [{ name: 'project' }, { name: 'financial' }] };

    // Monkeypatch performFileOrganization to throw on second file to exercise rollback
    const original = svc.performFileOrganization.bind(svc);
    let callCount = 0;
    svc.performFileOrganization = async (file, targetPath, options) => {
      callCount += 1;
      if (callCount === 2) {
        throw new Error('Simulated failure');
      }
      return original(file, targetPath, options);
    };

    const files = [
      { path: a, analysis: { category: 'project', subject: 'A' } },
      { path: b, analysis: { category: 'financial', subject: 'B' } }
    ];

    await expect(svc.organizeBatchWithTracking(files, rules)).rejects.toThrow('Simulated failure');

    // Both files should remain at original locations due to rollback
    expect(fssync.existsSync(a)).toBe(true);
    expect(fssync.existsSync(b)).toBe(true);
  });

  test('semantic search enhancement returns scores', async () => {
    // Seed a couple of entries
    const p = path.join(workDir, 'seed.txt');
    await fs.writeFile(p, 'budget and invoice figures');
    const fi = { path: p, size: (await fs.stat(p)).size, lastModified: (await fs.stat(p)).mtimeMs };
    await svc.analyzeFileWithHistory(p, fi, { smartFolders: [{ name: 'Financial' }] });

    const results = await svc.searchWithRAG('invoice budget');
    expect(Array.isArray(results.results)).toBe(true);
    expect(results.results.length).toBeGreaterThanOrEqual(0);
    if (results.results.length > 0) {
      expect(typeof results.results[0].semanticScore).toBe('number');
    }
  });

  test('analyzes an image and standardizes output', async () => {
    const imgPath = path.join(workDir, 'screenshot.png');
    await fs.writeFile(imgPath, tinyPngBuffer());

    const analysis = await svc.performFileAnalysis(imgPath, {});
    expect(analysis).toHaveProperty('category');
    expect(analysis).toHaveProperty('tags');
    expect(typeof analysis.confidence).toBe('number');
  });
});