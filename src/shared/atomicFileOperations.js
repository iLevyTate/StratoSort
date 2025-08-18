/**
 * Atomic File Operations System
 *
 * Provides transactional file operations with rollback capabilities
 * to prevent data loss during file organization. Addresses the safety
 * concerns identified in the architectural analysis.
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

/**
 * Transaction-based file operation manager
 */
class AtomicFileOperations {
  constructor() {
    this.activeTransactions = new Map();
    this.backupDirectory = null;
    this.operationTimeout = 30000; // 30 seconds
  }

  /**
   * Initialize backup directory for transaction safety
   */
  async initializeBackupDirectory() {
    if (this.backupDirectory) return this.backupDirectory;

    const tempDir = require('os').tmpdir();
    this.backupDirectory = path.join(
      tempDir,
      'stratosort-backups',
      Date.now().toString(),
    );

    try {
      await fs.mkdir(this.backupDirectory, { recursive: true });
      return this.backupDirectory;
    } catch (error) {
      throw new Error(
        `Failed to initialize backup directory: ${error.message}`,
      );
    }
  }

  /**
   * Generate unique transaction ID
   */
  generateTransactionId() {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Create a backup of a file before modification
   */
  async createBackup(filePath, transactionId) {
    await this.initializeBackupDirectory();

    const filename = path.basename(filePath);
    const backupPath = path.join(
      this.backupDirectory,
      `${transactionId}_${filename}`,
    );

    try {
      await fs.copyFile(filePath, backupPath);
      return backupPath;
    } catch (error) {
      throw new Error(`Backup creation failed: ${error.message}`);
    }
  }

  /**
   * Begin a new atomic transaction
   */
  async beginTransaction(operations = []) {
    const transactionId = this.generateTransactionId();
    const transaction = {
      id: transactionId,
      operations: [],
      backups: [],
      startTime: Date.now(),
      status: 'active',
    };

    if (Array.isArray(operations) && operations.length > 0) {
      transaction.operations.push(...operations);
    }

    this.activeTransactions.set(transactionId, transaction);

    return transactionId;
  }

  /**
   * Add an operation to the transaction
   */
  addOperation(transactionId, operation) {
    const transaction = this.activeTransactions.get(transactionId);
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    if (transaction.status !== 'active') {
      throw new Error(`Transaction ${transactionId} is not active`);
    }

    transaction.operations.push({
      ...operation,
      id: crypto.randomBytes(8).toString('hex'),
      timestamp: Date.now(),
    });
  }

  /**
   * Execute a single file operation with backup
   */
  async executeOperation(transactionId, operation) {
    const transaction = this.activeTransactions.get(transactionId);
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    const { type, source, destination, data } = operation;

    try {
      let backupPath = null;

      // Create backup for existing files
      if (type === 'move' || type === 'copy') {
        if (await this.fileExists(source)) {
          backupPath = await this.createBackup(source, transactionId);
          transaction.backups.push({ source, backup: backupPath });
        }
      }

      // Execute the operation
      switch (type) {
        case 'move':
          await this.atomicMove(source, destination);
          break;
        case 'copy':
          await this.atomicCopy(source, destination);
          break;
        case 'create':
          await this.atomicCreate(destination, data);
          break;
        case 'delete':
          if (await this.fileExists(source)) {
            backupPath = await this.createBackup(source, transactionId);
            transaction.backups.push({ source, backup: backupPath });
            await fs.unlink(source);
          }
          break;
        default:
          throw new Error(`Unknown operation type: ${type}`);
      }

      return { success: true, backupPath };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Atomic move operation with directory creation
   */
  async atomicMove(source, destination) {
    // Ensure destination directory exists
    await fs.mkdir(path.dirname(destination), { recursive: true });

    // Check if destination exists and handle conflicts
    if (await this.fileExists(destination)) {
      const uniqueDestination = await this.generateUniqueFilename(destination);
      destination = uniqueDestination;
    }

    try {
      await fs.rename(source, destination);
    } catch (error) {
      if (error.code === 'EXDEV') {
        await fs.copyFile(source, destination);
        await fs.unlink(source);
      } else {
        throw error;
      }
    }

    return destination;
  }

  /**
   * Atomic copy operation
   */
  async atomicCopy(source, destination) {
    await fs.mkdir(path.dirname(destination), { recursive: true });

    if (await this.fileExists(destination)) {
      const uniqueDestination = await this.generateUniqueFilename(destination);
      destination = uniqueDestination;
    }

    await fs.copyFile(source, destination);
    return destination;
  }

  /**
   * Atomic create operation
   */
  async atomicCreate(filePath, data) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    const tempFile = `${filePath}.tmp.${Date.now()}`;

    try {
      await fs.writeFile(tempFile, data);
      await fs.rename(tempFile, filePath);
      return filePath;
    } catch (error) {
      // Cleanup temp file on failure
      try {
        await fs.unlink(tempFile);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Generate unique filename to avoid conflicts
   */
  async generateUniqueFilename(originalPath) {
    const dir = path.dirname(originalPath);
    const ext = path.extname(originalPath);
    const name = path.basename(originalPath, ext);

    let counter = 1;
    let uniquePath = originalPath;

    while (await this.fileExists(uniquePath)) {
      uniquePath = path.join(dir, `${name}_${counter}${ext}`);
      counter++;

      if (counter > 1000) {
        throw new Error(
          'Unable to generate unique filename after 1000 attempts',
        );
      }
    }

    return uniquePath;
  }

  /**
   * Check if file exists
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Execute all operations in a transaction
   */
  async commitTransaction(transactionId) {
    const transaction = this.activeTransactions.get(transactionId);
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    if (transaction.status !== 'active') {
      throw new Error(`Transaction ${transactionId} is not active`);
    }

    const results = [];
    let failedOperation = null;

    try {
      // Set timeout for the entire transaction
      let timeoutId;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Transaction ${transactionId} timed out`));
        }, this.operationTimeout);
        timeoutId.unref();
      });

      const operationPromise = (async () => {
        for (const operation of transaction.operations) {
          try {
            const result = await this.executeOperation(
              transactionId,
              operation,
            );
            results.push({
              operation: operation.id,
              success: true,
              result,
            });
          } catch (error) {
            failedOperation = operation;
            throw error;
          }
        }
      })();

      await Promise.race([operationPromise, timeoutPromise]);
      clearTimeout(timeoutId);

      transaction.status = 'committed';
      // Transaction committed successfully

      // Clean up old backups after successful commit (optional)
      const cleanupTimer = setTimeout(
        () => this.cleanupBackups(transactionId),
        60000,
      ); // 1 minute delay
      cleanupTimer.unref();

      return { success: true, results };
    } catch (error) {
      // Transaction failed, will be rolled back

      // Attempt to rollback
      try {
        await this.rollbackTransaction(transactionId);
        return {
          success: false,
          error: error.message,
          failedOperation: failedOperation?.id,
          rollbackSuccessful: true,
        };
      } catch (rollbackError) {
        // Rollback failed - this is a critical error but we can't do much about it
        return {
          success: false,
          error: error.message,
          failedOperation: failedOperation?.id,
          rollbackSuccessful: false,
          rollbackError: rollbackError.message,
        };
      }
    }
  }

  /**
   * Rollback a transaction using backups
   */
  async rollbackTransaction(transactionId) {
    const transaction = this.activeTransactions.get(transactionId);
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    // Rolling back transaction
    transaction.status = 'rolling_back';

    const rollbackErrors = [];

    // Restore files from backups in reverse order
    for (let i = transaction.backups.length - 1; i >= 0; i--) {
      const { source, backup } = transaction.backups[i];

      try {
        // Check if backup exists
        if (await this.fileExists(backup)) {
          // Ensure source directory exists
          await fs.mkdir(path.dirname(source), { recursive: true });

          // Restore the file
          await fs.copyFile(backup, source);
          // File restored from backup
        }
      } catch (error) {
        rollbackErrors.push({ source, error: error.message });
      }
    }

    transaction.status = 'rolled_back';

    if (rollbackErrors.length > 0) {
      throw new Error(
        `Rollback completed with errors: ${JSON.stringify(rollbackErrors)}`,
      );
    }

    // Transaction rolled back successfully
  }

  /**
   * Clean up backup files for a transaction
   */
  async cleanupBackups(transactionId) {
    const transaction = this.activeTransactions.get(transactionId);
    if (!transaction) return;

    for (const { backup } of transaction.backups) {
      try {
        if (await this.fileExists(backup)) {
          await fs.unlink(backup);
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    }

    // Remove from active transactions
    this.activeTransactions.delete(transactionId);
  }

  /**
   * Get transaction status
   */
  getTransactionStatus(transactionId) {
    const transaction = this.activeTransactions.get(transactionId);
    if (!transaction) return null;

    return {
      id: transaction.id,
      status: transaction.status,
      operationCount: transaction.operations.length,
      backupCount: transaction.backups.length,
      duration: Date.now() - transaction.startTime,
    };
  }

  /**
   * List all active transactions
   */
  getActiveTransactions() {
    return Array.from(this.activeTransactions.keys()).map((id) =>
      this.getTransactionStatus(id),
    );
  }

  /**
   * Force cleanup of stale transactions
   */
  async cleanupStaleTransactions(maxAge = 3600000) {
    // 1 hour
    const now = Date.now();
    const staleTransactions = [];

    for (const [id, transaction] of this.activeTransactions) {
      if (now - transaction.startTime > maxAge) {
        staleTransactions.push(id);
      }
    }

    for (const id of staleTransactions) {
      try {
        await this.cleanupBackups(id);
      } catch (error) {
        // Ignore cleanup errors for stale transactions
      }
    }

    return staleTransactions.length;
  }
}

// Export singleton instance
const atomicFileOps = new AtomicFileOperations();

module.exports = {
  AtomicFileOperations,
  atomicFileOps,

  // Convenience functions
  async organizeFilesAtomically(operations) {
    const transactionId = await atomicFileOps.beginTransaction();

    try {
      // Convert operations to atomic operations
      for (const op of operations) {
        atomicFileOps.addOperation(transactionId, {
          type: 'move',
          source: op.originalPath,
          destination: op.targetPath,
          metadata: op.analysisData,
        });
      }

      const result = await atomicFileOps.commitTransaction(transactionId);
      return result;
    } catch (error) {
      throw error;
    }
  },

  async backupAndReplace(filePath, newContent) {
    const transactionId = await atomicFileOps.beginTransaction();

    try {
      atomicFileOps.addOperation(transactionId, {
        type: 'create',
        destination: filePath,
        data: newContent,
      });

      return await atomicFileOps.commitTransaction(transactionId);
    } catch (error) {
      throw error;
    }
  },
};
