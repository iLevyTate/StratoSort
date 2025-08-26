const fs = require('fs').promises;
const fssync = require('fs');
const path = require('path');
const os = require('os');

describe('UndoRedoService', () => {
  let tmpDir;
  let electron;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `stratosort-undo-redo-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
    jest.resetModules();
    electron = require('./mocks/electron');
    electron.app.getPath.mockReturnValue(tmpDir);
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  test('records actions and persists across instances', async () => {
    const UndoRedoService = require('../src/main/services/UndoRedoService');
    const service = new UndoRedoService();

    // Create file paths in temp directory
    const src = path.join(tmpDir, 'original.txt');
    const dest = path.join(tmpDir, 'moved', 'original.txt');
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, 'moved-content');

    // Record a move action (assumes file is currently at dest)
    await service.recordAction('FILE_MOVE', {
      originalPath: src,
      newPath: dest,
    });

    // Undo should move file back to original
    const undoResult = await service.undo();
    expect(undoResult.success).toBe(true);
    expect(fssync.existsSync(src)).toBe(true);
    expect(fssync.existsSync(dest)).toBe(false);

    // Redo should move file again to destination
    const redoResult = await service.redo();
    expect(redoResult.success).toBe(true);
    expect(fssync.existsSync(dest)).toBe(true);

    // History API
    const history = service.getActionHistory(5);
    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBeGreaterThan(0);
    expect(history[history.length - 1].type).toBe('FILE_MOVE');

    // Force save before creating new instance
    await service.forceSave();

    // New instance should load persisted actions
    jest.resetModules();
    const electronReloaded = require('./mocks/electron');
    electronReloaded.app.getPath.mockReturnValue(tmpDir);
    const UndoRedoServiceReloaded = require('../src/main/services/UndoRedoService');
    const serviceReloaded = new UndoRedoServiceReloaded();
    await serviceReloaded.initialize();
    expect(serviceReloaded.canUndo()).toBe(true);
  });

  test('batch operation undo reverses moves', async () => {
    const UndoRedoService = require('../src/main/services/UndoRedoService');
    const service = new UndoRedoService();

    // Set up two files moved to new paths
    const aSrc = path.join(tmpDir, 'A.txt');
    const aDest = path.join(tmpDir, 'out', 'A.txt');
    const bSrc = path.join(tmpDir, 'B.txt');
    const bDest = path.join(tmpDir, 'out', 'B.txt');
    await fs.mkdir(path.join(tmpDir, 'out'), { recursive: true });
    await fs.writeFile(aDest, 'A');
    await fs.writeFile(bDest, 'B');

    await service.recordAction('BATCH_OPERATION', {
      operations: [
        { type: 'move', originalPath: aSrc, newPath: aDest },
        { type: 'move', originalPath: bSrc, newPath: bDest },
      ],
    });

    await service.undo();
    expect(fssync.existsSync(aSrc)).toBe(true);
    expect(fssync.existsSync(bSrc)).toBe(true);
    expect(fssync.existsSync(aDest)).toBe(false);
    expect(fssync.existsSync(bDest)).toBe(false);
  });
});
