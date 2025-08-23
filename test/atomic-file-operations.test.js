const path = require('path');
const fs = require('fs').promises;
const os = require('os');

const { atomicFileOps } = require('../src/shared/atomicFileOperations');

describe('AtomicFileOperations', () => {
  const tempDir = path.join(os.tmpdir(), 'atomic-file-op-tests');

  beforeEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('cleans up transaction after rollback', async () => {
    const source = path.join(tempDir, 'a.txt');
    const dest = path.join(tempDir, 'dest', 'a.txt');
    await fs.writeFile(source, 'content');

    const transactionId = await atomicFileOps.beginTransaction();

    atomicFileOps.addOperation(transactionId, {
      type: 'move',
      source,
      destination: dest,
    });

    // Add a failing operation to trigger rollback
    atomicFileOps.addOperation(transactionId, {
      type: 'move',
      source: path.join(tempDir, 'missing.txt'),
      destination: path.join(tempDir, 'dest', 'missing.txt'),
    });

    const result = await atomicFileOps.commitTransaction(transactionId);
    expect(result.success).toBe(false);
    expect(result.rollbackSuccessful).toBe(true);

    // Transaction should be cleaned up
    expect(atomicFileOps.getTransactionStatus(transactionId)).toBeNull();

    // Original file should still exist
    await expect(fs.access(source)).resolves.toBeUndefined();
  });
});
