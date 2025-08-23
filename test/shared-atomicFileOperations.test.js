const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const {
  AtomicFileOperations,
  atomicFileOps,
  organizeFilesAtomically,
  backupAndReplace,
} = require('../src/shared/atomicFileOperations');

describe('AtomicFileOperations', () => {
  let atomicOps;
  let tempDir;
  let testFile;
  let testDir;

  beforeEach(async () => {
    atomicOps = new AtomicFileOperations();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'atomic-ops-test-'));
    testFile = path.join(tempDir, 'test.txt');
    testDir = path.join(tempDir, 'testdir');

    // Create test file
    await fs.writeFile(testFile, 'test content');
    await fs.mkdir(testDir);
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('initialization', () => {
    test('creates instance with default values', () => {
      const ops = new AtomicFileOperations();
      expect(ops.activeTransactions).toBeInstanceOf(Map);
      expect(ops.backupDirectory).toBeNull();
      expect(ops.operationTimeout).toBe(30000);
    });

    test('generates unique transaction IDs', () => {
      const id1 = atomicOps.generateTransactionId();
      const id2 = atomicOps.generateTransactionId();

      expect(id1).toMatch(/^[a-f0-9]{32}$/);
      expect(id2).toMatch(/^[a-f0-9]{32}$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('backup directory initialization', () => {
    test('initializes backup directory', async () => {
      const backupDir = await atomicOps.initializeBackupDirectory();

      expect(backupDir).toContain('stratosort-backups');
      expect(atomicOps.backupDirectory).toBe(backupDir);

      // Verify directory exists
      const stats = await fs.stat(backupDir);
      expect(stats.isDirectory()).toBe(true);
    });

    test('reuses existing backup directory', async () => {
      const backupDir1 = await atomicOps.initializeBackupDirectory();
      const backupDir2 = await atomicOps.initializeBackupDirectory();

      expect(backupDir1).toBe(backupDir2);
    });

    test('handles backup directory creation errors', async () => {
      const originalMkdir = fs.mkdir;
      fs.mkdir = jest.fn().mockRejectedValue(new Error('Permission denied'));

      await expect(atomicOps.initializeBackupDirectory()).rejects.toThrow(
        'Failed to initialize backup directory: Permission denied',
      );

      fs.mkdir = originalMkdir;
    });
  });

  describe('backup creation', () => {
    test('creates backup of existing file', async () => {
      const transactionId = 'test-transaction';
      const backupPath = await atomicOps.createBackup(testFile, transactionId);

      expect(backupPath).toContain(transactionId);
      expect(backupPath).toContain('test.txt');

      // Verify backup content
      const backupContent = await fs.readFile(backupPath, 'utf-8');
      expect(backupContent).toBe('test content');
    });

    test('handles missing source file', async () => {
      const nonExistentFile = path.join(tempDir, 'missing.txt');
      const transactionId = 'test-transaction';

      await expect(
        atomicOps.createBackup(nonExistentFile, transactionId),
      ).rejects.toThrow('Backup creation failed');
    });
  });

  describe('transaction management', () => {
    test('begins transaction successfully', async () => {
      const transactionId = await atomicOps.beginTransaction();

      expect(atomicOps.activeTransactions.has(transactionId)).toBe(true);
      const transaction = atomicOps.activeTransactions.get(transactionId);

      expect(transaction).toEqual({
        id: transactionId,
        operations: [],
        backups: [],
        startTime: expect.any(Number),
        status: 'active',
      });
    });

    test('begins transaction with initial operations', async () => {
      const operations = [
        { type: 'move', source: 'a.txt', destination: 'b.txt' },
      ];

      const transactionId = await atomicOps.beginTransaction(operations);
      const transaction = atomicOps.activeTransactions.get(transactionId);

      expect(transaction.operations).toHaveLength(1);
      expect(transaction.operations[0].type).toBe('move');
    });

    test('adds operation to transaction', () => {
      const transactionId = atomicOps.generateTransactionId();
      const transaction = {
        id: transactionId,
        operations: [],
        backups: [],
        startTime: Date.now(),
        status: 'active',
      };
      atomicOps.activeTransactions.set(transactionId, transaction);

      const operation = { type: 'move', source: 'a.txt', destination: 'b.txt' };
      atomicOps.addOperation(transactionId, operation);

      expect(transaction.operations).toHaveLength(1);
      const addedOp = transaction.operations[0];
      expect(addedOp.type).toBe('move');
      expect(addedOp.id).toMatch(/^[a-f0-9]{16}$/);
      expect(addedOp.timestamp).toBeDefined();
    });

    test('throws error for non-existent transaction', () => {
      const operation = { type: 'move', source: 'a.txt', destination: 'b.txt' };

      expect(() => atomicOps.addOperation('non-existent', operation)).toThrow(
        'Transaction non-existent not found',
      );
    });

    test('throws error for inactive transaction', () => {
      const transactionId = atomicOps.generateTransactionId();
      const transaction = {
        id: transactionId,
        operations: [],
        backups: [],
        startTime: Date.now(),
        status: 'committed',
      };
      atomicOps.activeTransactions.set(transactionId, transaction);

      const operation = { type: 'move', source: 'a.txt', destination: 'b.txt' };

      expect(() => atomicOps.addOperation(transactionId, operation)).toThrow(
        `Transaction ${transactionId} is not active`,
      );
    });
  });

  describe('file operations', () => {
    test('executes move operation with backup', async () => {
      const transactionId = atomicOps.generateTransactionId();
      const transaction = {
        id: transactionId,
        operations: [],
        backups: [],
        startTime: Date.now(),
        status: 'active',
      };
      atomicOps.activeTransactions.set(transactionId, transaction);

      const sourcePath = testFile;
      const destPath = path.join(tempDir, 'moved.txt');
      const operation = {
        type: 'move',
        source: sourcePath,
        destination: destPath,
      };

      const result = await atomicOps.executeOperation(transactionId, operation);

      expect(result.success).toBe(true);
      expect(result.backupPath).toBeDefined();

      // Verify file was moved
      const fileExists = await atomicOps.fileExists(sourcePath);
      const destExists = await atomicOps.fileExists(destPath);
      expect(fileExists).toBe(false);
      expect(destExists).toBe(true);

      // Verify backup was created
      expect(transaction.backups).toHaveLength(1);
      expect(transaction.backups[0].source).toBe(sourcePath);
    });

    test('executes copy operation', async () => {
      const transactionId = atomicOps.generateTransactionId();
      const transaction = {
        id: transactionId,
        operations: [],
        backups: [],
        startTime: Date.now(),
        status: 'active',
      };
      atomicOps.activeTransactions.set(transactionId, transaction);

      const sourcePath = testFile;
      const destPath = path.join(tempDir, 'copied.txt');
      const operation = {
        type: 'copy',
        source: sourcePath,
        destination: destPath,
      };

      const result = await atomicOps.executeOperation(transactionId, operation);

      expect(result.success).toBe(true);
      expect(result.backupPath).toBeDefined();

      // Verify original file still exists
      const sourceExists = await atomicOps.fileExists(sourcePath);
      const destExists = await atomicOps.fileExists(destPath);
      expect(sourceExists).toBe(true);
      expect(destExists).toBe(true);
    });

    test('executes create operation', async () => {
      const transactionId = atomicOps.generateTransactionId();
      const transaction = {
        id: transactionId,
        operations: [],
        backups: [],
        startTime: Date.now(),
        status: 'active',
      };
      atomicOps.activeTransactions.set(transactionId, transaction);

      const newFilePath = path.join(tempDir, 'newfile.txt');
      const operation = {
        type: 'create',
        destination: newFilePath,
        data: 'new file content',
      };

      const result = await atomicOps.executeOperation(transactionId, operation);

      expect(result.success).toBe(true);
      expect(result.backupPath).toBeNull(); // No backup for create operations

      // Verify file was created
      const fileExists = await atomicOps.fileExists(newFilePath);
      expect(fileExists).toBe(true);

      const content = await fs.readFile(newFilePath, 'utf-8');
      expect(content).toBe('new file content');
    });

    test('executes delete operation with backup', async () => {
      const transactionId = atomicOps.generateTransactionId();
      const transaction = {
        id: transactionId,
        operations: [],
        backups: [],
        startTime: Date.now(),
        status: 'active',
      };
      atomicOps.activeTransactions.set(transactionId, transaction);

      const operation = { type: 'delete', source: testFile };

      const result = await atomicOps.executeOperation(transactionId, operation);

      expect(result.success).toBe(true);
      expect(result.backupPath).toBeDefined();

      // Verify file was deleted
      const fileExists = await atomicOps.fileExists(testFile);
      expect(fileExists).toBe(false);

      // Verify backup was created
      expect(transaction.backups).toHaveLength(1);
      expect(transaction.backups[0].source).toBe(testFile);
    });

    test('throws error for unknown operation type', async () => {
      const transactionId = atomicOps.generateTransactionId();
      const transaction = {
        id: transactionId,
        operations: [],
        backups: [],
        startTime: Date.now(),
        status: 'active',
      };
      atomicOps.activeTransactions.set(transactionId, transaction);

      const operation = { type: 'unknown', source: testFile };

      await expect(
        atomicOps.executeOperation(transactionId, operation),
      ).rejects.toThrow('Unknown operation type: unknown');
    });
  });

  describe('atomic operations', () => {
    test('performs atomic move', async () => {
      const sourcePath = testFile;
      const destPath = path.join(tempDir, 'moved.txt');

      const result = await atomicOps.atomicMove(sourcePath, destPath);

      expect(result).toBe(destPath);

      const sourceExists = await atomicOps.fileExists(sourcePath);
      const destExists = await atomicOps.fileExists(destPath);
      expect(sourceExists).toBe(false);
      expect(destExists).toBe(true);
    });

    test('handles cross-device move with copy+delete', async () => {
      const sourcePath = testFile;
      const destPath = path.join(tempDir, 'moved.txt');

      // Mock fs.rename to fail with EXDEV
      const originalRename = fs.rename;
      fs.rename = jest.fn().mockRejectedValue({ code: 'EXDEV' });

      const result = await atomicOps.atomicMove(sourcePath, destPath);

      expect(result).toBe(destPath);
      expect(fs.rename).toHaveBeenCalledWith(sourcePath, destPath);

      // Restore original function
      fs.rename = originalRename;
    });

    test('generates unique filename for conflicts', async () => {
      const existingFile = path.join(tempDir, 'existing.txt');
      await fs.writeFile(existingFile, 'existing content');

      const conflictPath = path.join(tempDir, 'existing_1.txt');
      const result = await atomicOps.generateUniqueFilename(existingFile);

      expect(result).toBe(conflictPath);
    });

    test('handles many filename conflicts', async () => {
      // Create many conflicting files
      for (let i = 0; i < 5; i++) {
        const conflictFile = path.join(tempDir, `conflict_${i}.txt`);
        await fs.writeFile(conflictFile, `content ${i}`);
      }

      const originalPath = path.join(tempDir, 'conflict.txt');
      await fs.writeFile(originalPath, 'original content');

      const result = await atomicOps.generateUniqueFilename(originalPath);
      expect(result).toBe(path.join(tempDir, 'conflict_5.txt'));
    });

    test('throws error after too many conflict attempts', async () => {
      const originalPath = path.join(tempDir, 'test.txt');
      await fs.writeFile(originalPath, 'content');

      // Mock fileExists to always return true
      const originalFileExists = atomicOps.fileExists;
      atomicOps.fileExists = jest.fn().mockResolvedValue(true);

      await expect(
        atomicOps.generateUniqueFilename(originalPath),
      ).rejects.toThrow(
        'Unable to generate unique filename after 1000 attempts',
      );

      atomicOps.fileExists = originalFileExists;
    });
  });

  describe('transaction commit and rollback', () => {
    test('commits transaction successfully', async () => {
      const transactionId = await atomicOps.beginTransaction();

      const sourcePath = testFile;
      const destPath = path.join(tempDir, 'committed.txt');
      atomicOps.addOperation(transactionId, {
        type: 'move',
        source: sourcePath,
        destination: destPath,
      });

      const result = await atomicOps.commitTransaction(transactionId);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(true);

      // Verify file was moved
      const sourceExists = await atomicOps.fileExists(sourcePath);
      const destExists = await atomicOps.fileExists(destPath);
      expect(sourceExists).toBe(false);
      expect(destExists).toBe(true);
    });

    test('rolls back transaction on failure', async () => {
      const transactionId = await atomicOps.beginTransaction();

      const sourcePath = testFile;
      const destPath = path.join(tempDir, 'rollback-test.txt');
      atomicOps.addOperation(transactionId, {
        type: 'move',
        source: sourcePath,
        destination: destPath,
      });

      // Mock executeOperation to fail
      const originalExecute = atomicOps.executeOperation;
      atomicOps.executeOperation = jest
        .fn()
        .mockRejectedValue(new Error('Operation failed'));

      const result = await atomicOps.commitTransaction(transactionId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Operation failed');
      expect(result.rollbackSuccessful).toBe(true);

      // Verify file was restored
      const sourceExists = await atomicOps.fileExists(sourcePath);
      expect(sourceExists).toBe(true);

      atomicOps.executeOperation = originalExecute;
    });

    test('handles transaction timeout', async () => {
      const transactionId = await atomicOps.beginTransaction();

      // Set very short timeout
      atomicOps.operationTimeout = 1;

      atomicOps.addOperation(transactionId, {
        type: 'move',
        source: testFile,
        destination: path.join(tempDir, 'timeout.txt'),
      });

      // Mock executeOperation to take longer than timeout
      const originalExecute = atomicOps.executeOperation;
      atomicOps.executeOperation = jest
        .fn()
        .mockImplementation(
          () =>
            new Promise((resolve) =>
              setTimeout(() => resolve({ success: true }), 10),
            ),
        );

      const result = await atomicOps.commitTransaction(transactionId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');

      atomicOps.executeOperation = originalExecute;
    });

    test('rolls back transaction with errors', async () => {
      const transactionId = await atomicOps.beginTransaction();

      atomicOps.addOperation(transactionId, {
        type: 'move',
        source: testFile,
        destination: path.join(tempDir, 'error-test.txt'),
      });

      // Mock executeOperation to fail
      const originalExecute = atomicOps.executeOperation;
      atomicOps.executeOperation = jest
        .fn()
        .mockRejectedValue(new Error('Operation failed'));

      // Mock rollback to fail
      const originalRollback = atomicOps.rollbackTransaction;
      atomicOps.rollbackTransaction = jest
        .fn()
        .mockRejectedValue(new Error('Rollback failed'));

      const result = await atomicOps.commitTransaction(transactionId);

      expect(result.success).toBe(false);
      expect(result.rollbackSuccessful).toBe(false);
      expect(result.rollbackError).toBe('Rollback failed');

      atomicOps.executeOperation = originalExecute;
      atomicOps.rollbackTransaction = originalRollback;
    });
  });

  describe('convenience functions', () => {
    test('organizeFilesAtomically works correctly', async () => {
      const operations = [
        {
          originalPath: testFile,
          targetPath: path.join(tempDir, 'organized.txt'),
          analysisData: { category: 'document' },
        },
      ];

      const result = await organizeFilesAtomically(operations);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
    });

    test('backupAndReplace works correctly', async () => {
      const newContent = 'replaced content';
      const result = await backupAndReplace(testFile, newContent);

      expect(result.success).toBe(true);

      const fileContent = await fs.readFile(testFile, 'utf-8');
      expect(fileContent).toBe(newContent);
    });
  });

  describe('utility functions', () => {
    test('fileExists detects existing files', async () => {
      const exists = await atomicOps.fileExists(testFile);
      expect(exists).toBe(true);

      const nonExistentFile = path.join(tempDir, 'nonexistent.txt');
      const notExists = await atomicOps.fileExists(nonExistentFile);
      expect(notExists).toBe(false);
    });

    test('getTransactionStatus returns correct information', () => {
      const transactionId = atomicOps.generateTransactionId();
      const transaction = {
        id: transactionId,
        operations: [{ type: 'move' }],
        backups: [{ source: 'test.txt', backup: 'backup.txt' }],
        startTime: Date.now() - 1000,
        status: 'active',
      };
      atomicOps.activeTransactions.set(transactionId, transaction);

      const status = atomicOps.getTransactionStatus(transactionId);

      expect(status).toEqual({
        id: transactionId,
        status: 'active',
        operationCount: 1,
        backupCount: 1,
        duration: expect.any(Number),
      });
      expect(status.duration).toBeGreaterThanOrEqual(1000);
    });

    test('getTransactionStatus returns null for non-existent transaction', () => {
      const status = atomicOps.getTransactionStatus('non-existent');
      expect(status).toBeNull();
    });

    test('getActiveTransactions returns all active transactions', () => {
      const transactionId1 = atomicOps.generateTransactionId();
      const transactionId2 = atomicOps.generateTransactionId();

      atomicOps.activeTransactions.set(transactionId1, {
        id: transactionId1,
        operations: [],
        backups: [],
        startTime: Date.now(),
        status: 'active',
      });

      atomicOps.activeTransactions.set(transactionId2, {
        id: transactionId2,
        operations: [],
        backups: [],
        startTime: Date.now(),
        status: 'active',
      });

      const activeTransactions = atomicOps.getActiveTransactions();

      expect(activeTransactions).toHaveLength(2);
      const ids = activeTransactions.map((t) => t.id);
      expect(ids).toContain(transactionId1);
      expect(ids).toContain(transactionId2);
    });

    test('cleanupStaleTransactions removes old transactions', async () => {
      const oldTransactionId = atomicOps.generateTransactionId();
      const newTransactionId = atomicOps.generateTransactionId();

      atomicOps.activeTransactions.set(oldTransactionId, {
        id: oldTransactionId,
        operations: [],
        backups: [],
        startTime: Date.now() - 7200000, // 2 hours ago
        status: 'active',
      });

      atomicOps.activeTransactions.set(newTransactionId, {
        id: newTransactionId,
        operations: [],
        backups: [],
        startTime: Date.now(), // Now
        status: 'active',
      });

      const cleanupSpy = jest
        .spyOn(atomicOps, 'cleanupBackups')
        .mockResolvedValue();

      const removedCount = await atomicOps.cleanupStaleTransactions(3600000); // 1 hour max age

      expect(removedCount).toBe(1);
      expect(cleanupSpy).toHaveBeenCalledWith(oldTransactionId);
      // Note: cleanupBackups is called asynchronously, so we need to wait or check differently
      expect(atomicOps.activeTransactions.has(newTransactionId)).toBe(true);

      cleanupSpy.mockRestore();
    });
  });

  describe('singleton instance', () => {
    test('exports singleton instance', () => {
      expect(atomicFileOps).toBeInstanceOf(AtomicFileOperations);
    });

    test('singleton is reused across imports', () => {
      const {
        atomicFileOps: importedOps,
      } = require('../src/shared/atomicFileOperations');
      expect(importedOps).toBe(atomicFileOps);
    });
  });
});
