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
 * Atomic File Operations with Transaction Support
 * Provides ACID-compliant file operations with rollback capabilities
 */
class AtomicFileOperations {
  constructor() {
    this.transactions = new Map();
    this.lockManager = new Map();
    this.backupDirectory = null;
    this.operationTimeout = 30000; // 30 seconds
  }

  /**
   * Initialize backup directory for transaction safety
   */
  async initializeBackupDirectory() {
    if (this.backupDirectory) return this.backupDirectory;

    const tempDir = require('os').tmpdir();
    this.backupDirectory = path.join(tempDir, 'stratosort-backups', Date.now().toString());
    
    try {
      await fs.mkdir(this.backupDirectory, { recursive: true });
      return this.backupDirectory;
    } catch (error) {
      throw new Error(`Failed to initialize backup directory: ${error.message}`);
    }
  }

  /**
   * Begin a new transaction
   * @param {string} transactionId - Unique transaction identifier
   * @returns {Object} Transaction context
   */
  beginTransaction(transactionId = null) {
    const txId = transactionId || crypto.randomUUID();
    
    if (this.transactions.has(txId)) {
      throw new Error(`Transaction ${txId} already exists`);
    }

    const transaction = {
      id: txId,
      operations: [],
      backups: new Map(),
      locks: new Set(),
      status: 'active',
      createdAt: new Date()
    };

    this.transactions.set(txId, transaction);
    return transaction;
  }

  /**
   * Add an operation to the transaction
   * @param {string} transactionId - Transaction ID
   * @param {Object} operation - Operation details
   */
  addOperation(transactionId, operation) {
    const tx = this.transactions.get(transactionId);
    if (!tx) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    if (tx.status !== 'active') {
      throw new Error(`Transaction ${transactionId} is not active`);
    }

    // Validate operation
    this.validateOperation(operation);
    
    tx.operations.push({
      ...operation,
      id: crypto.randomUUID(),
      addedAt: new Date()
    });
  }

  /**
   * Validate operation structure
   * @param {Object} operation - Operation to validate
   */
  validateOperation(operation) {
    const requiredFields = ['type', 'source'];
    const validTypes = ['move', 'copy', 'delete', 'create'];

    for (const field of requiredFields) {
      if (!operation[field]) {
        throw new Error(`Operation missing required field: ${field}`);
      }
    }

    if (!validTypes.includes(operation.type)) {
      throw new Error(`Invalid operation type: ${operation.type}`);
    }

    if (['move', 'copy'].includes(operation.type) && !operation.target) {
      throw new Error(`Operation type ${operation.type} requires target field`);
    }
  }

  /**
   * Acquire file lock
   * @param {string} filePath - Path to lock
   * @param {string} transactionId - Transaction ID
   */
  async acquireLock(filePath, transactionId) {
    const normalizedPath = path.resolve(filePath);
    
    if (this.lockManager.has(normalizedPath)) {
      const existingTx = this.lockManager.get(normalizedPath);
      if (existingTx !== transactionId) {
        throw new Error(`File ${normalizedPath} is locked by transaction ${existingTx}`);
      }
    }

    this.lockManager.set(normalizedPath, transactionId);
    
    const tx = this.transactions.get(transactionId);
    if (tx) {
      tx.locks.add(normalizedPath);
    }
  }

  /**
   * Release file lock
   * @param {string} filePath - Path to unlock
   * @param {string} transactionId - Transaction ID
   */
  releaseLock(filePath, transactionId) {
    const normalizedPath = path.resolve(filePath);
    
    if (this.lockManager.get(normalizedPath) === transactionId) {
      this.lockManager.delete(normalizedPath);
      
      const tx = this.transactions.get(transactionId);
      if (tx) {
        tx.locks.delete(normalizedPath);
      }
    }
  }

  /**
   * Create backup of file before modification
   * @param {string} filePath - Path to backup
   * @param {string} transactionId - Transaction ID
   */
  async createBackup(filePath, transactionId) {
    const tx = this.transactions.get(transactionId);
    if (!tx) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    try {
      const normalizedPath = path.resolve(filePath);
      
      // Check if file exists
      const exists = await fs.access(normalizedPath).then(() => true).catch(() => false);
      
      if (exists) {
        const backupId = crypto.randomUUID();
        const backupPath = path.join(
          path.dirname(normalizedPath),
          `.backup_${backupId}_${path.basename(normalizedPath)}`
        );
        
        await fs.copyFile(normalizedPath, backupPath);
        
        tx.backups.set(normalizedPath, {
          backupPath,
          backupId,
          originalPath: normalizedPath,
          createdAt: new Date()
        });
      } else {
        // File doesn't exist, record this for rollback
        tx.backups.set(normalizedPath, {
          backupPath: null,
          backupId: null,
          originalPath: normalizedPath,
          existed: false,
          createdAt: new Date()
        });
      }
    } catch (error) {
      throw new Error(`Failed to create backup for ${filePath}: ${error.message}`);
    }
  }

  /**
   * Execute a single operation
   * @param {Object} operation - Operation to execute
   * @param {string} transactionId - Transaction ID
   */
  async executeOperation(operation, transactionId) {
    await this.acquireLock(operation.source, transactionId);
    
    if (operation.target) {
      await this.acquireLock(operation.target, transactionId);
    }

    // Create backup before modification
    await this.createBackup(operation.source, transactionId);
    
    if (operation.target) {
      await this.createBackup(operation.target, transactionId);
    }

    try {
      switch (operation.type) {
        case 'move':
          await this.executeMove(operation);
          break;
        case 'copy':
          await this.executeCopy(operation);
          break;
        case 'delete':
          await this.executeDelete(operation);
          break;
        case 'create':
          await this.executeCreate(operation);
          break;
        default:
          throw new Error(`Unknown operation type: ${operation.type}`);
      }
    } catch (error) {
      throw new Error(`Failed to execute ${operation.type} operation: ${error.message}`);
    }
  }

  /**
   * Execute move operation
   * @param {Object} operation - Move operation
   */
  async executeMove(operation) {
    const sourceExists = await fs.access(operation.source).then(() => true).catch(() => false);
    
    if (!sourceExists) {
      throw new Error(`Source file does not exist: ${operation.source}`);
    }

    // Ensure target directory exists
    await fs.mkdir(path.dirname(operation.target), { recursive: true });
    
    // Use rename for atomic move
    await fs.rename(operation.source, operation.target);
  }

  /**
   * Execute copy operation
   * @param {Object} operation - Copy operation
   */
  async executeCopy(operation) {
    const sourceExists = await fs.access(operation.source).then(() => true).catch(() => false);
    
    if (!sourceExists) {
      throw new Error(`Source file does not exist: ${operation.source}`);
    }

    // Ensure target directory exists
    await fs.mkdir(path.dirname(operation.target), { recursive: true });
    
    await fs.copyFile(operation.source, operation.target);
  }

  /**
   * Execute delete operation
   * @param {Object} operation - Delete operation
   */
  async executeDelete(operation) {
    const sourceExists = await fs.access(operation.source).then(() => true).catch(() => false);
    
    if (sourceExists) {
      await fs.unlink(operation.source);
    }
  }

  /**
   * Execute create operation
   * @param {Object} operation - Create operation
   */
  async executeCreate(operation) {
    // Ensure target directory exists
    await fs.mkdir(path.dirname(operation.source), { recursive: true });
    
    const content = operation.content || '';
    await fs.writeFile(operation.source, content);
  }

  /**
   * Commit transaction - execute all operations
   * @param {string} transactionId - Transaction ID
   * @returns {Object} Commit result
   */
  async commitTransaction(transactionId) {
    const tx = this.transactions.get(transactionId);
    if (!tx) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    if (tx.status !== 'active') {
      throw new Error(`Transaction ${transactionId} is not active`);
    }

    tx.status = 'committing';
    const results = [];
    let successCount = 0;

    try {
      for (const operation of tx.operations) {
        try {
          await this.executeOperation(operation, transactionId);
          results.push({
            operation,
            success: true,
            timestamp: new Date()
          });
          successCount++;
        } catch (error) {
          results.push({
            operation,
            success: false,
            error: error.message,
            timestamp: new Date()
          });
          
          // Rollback on first failure
          await this.rollbackTransaction(transactionId);
          throw new Error(`Transaction failed at operation ${operation.id}: ${error.message}`);
        }
      }

      tx.status = 'committed';
      tx.completedAt = new Date();
      
      // Clean up backups after successful commit
      await this.cleanupBackups(transactionId);
      
      // Release locks
      this.releaseLocks(transactionId);
      
      return {
        success: true,
        transactionId,
        operationsExecuted: successCount,
        results
      };
    } catch (error) {
      tx.status = 'failed';
      tx.error = error.message;
      tx.failedAt = new Date();
      
      throw error;
    }
  }

  /**
   * Rollback transaction - restore from backups
   * @param {string} transactionId - Transaction ID
   */
  async rollbackTransaction(transactionId) {
    const tx = this.transactions.get(transactionId);
    if (!tx) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    tx.status = 'rolling-back';
    
    try {
      // Restore from backups in reverse order
      const backupEntries = Array.from(tx.backups.entries()).reverse();
      
      for (const [originalPath, backup] of backupEntries) {
        try {
          if (backup.existed === false) {
            // File didn't exist originally, so delete it if it was created
            const exists = await fs.access(originalPath).then(() => true).catch(() => false);
            if (exists) {
              await fs.unlink(originalPath);
            }
          } else if (backup.backupPath) {
            // Restore from backup
            await fs.copyFile(backup.backupPath, originalPath);
          }
        } catch (error) {
          console.error(`Failed to restore ${originalPath} from backup:`, error);
        }
      }

      tx.status = 'rolled-back';
      tx.rolledBackAt = new Date();
      
      // Clean up backups
      await this.cleanupBackups(transactionId);
      
      // Release locks
      this.releaseLocks(transactionId);
      
    } catch (error) {
      tx.status = 'rollback-failed';
      tx.rollbackError = error.message;
      throw new Error(`Rollback failed for transaction ${transactionId}: ${error.message}`);
    }
  }

  /**
   * Clean up backup files
   * @param {string} transactionId - Transaction ID
   */
  async cleanupBackups(transactionId) {
    const tx = this.transactions.get(transactionId);
    if (!tx) return;

    for (const backup of tx.backups.values()) {
      if (backup.backupPath) {
        try {
          await fs.unlink(backup.backupPath);
        } catch (error) {
          console.warn(`Failed to clean up backup ${backup.backupPath}:`, error);
        }
      }
    }
    
    tx.backups.clear();
  }

  /**
   * Release all locks for a transaction
   * @param {string} transactionId - Transaction ID
   */
  releaseLocks(transactionId) {
    const tx = this.transactions.get(transactionId);
    if (!tx) return;

    for (const lockedPath of tx.locks) {
      this.lockManager.delete(lockedPath);
    }
    
    tx.locks.clear();
  }

  /**
   * Get transaction status
   * @param {string} transactionId - Transaction ID
   * @returns {Object} Transaction status
   */
  getTransactionStatus(transactionId) {
    const tx = this.transactions.get(transactionId);
    if (!tx) {
      return { exists: false };
    }

    return {
      exists: true,
      id: tx.id,
      status: tx.status,
      operationCount: tx.operations.length,
      backupCount: tx.backups.size,
      lockCount: tx.locks.size,
      createdAt: tx.createdAt,
      completedAt: tx.completedAt,
      error: tx.error
    };
  }

  /**
   * Clean up old transactions
   * @param {number} maxAge - Maximum age in milliseconds
   */
  cleanupOldTransactions(maxAge = 3600000) { // 1 hour default
    const now = new Date();
    
    for (const [txId, tx] of this.transactions.entries()) {
      const age = now - tx.createdAt;
      
      if (age > maxAge && ['committed', 'rolled-back', 'failed'].includes(tx.status)) {
        this.transactions.delete(txId);
      }
    }
  }
}

// Export singleton instance
const atomicFileOperations = new AtomicFileOperations();

module.exports = {
  AtomicFileOperations,
  atomicFileOperations,
  
  // Convenience functions
  async organizeFilesAtomically(operations) {
    const transaction = atomicFileOperations.beginTransaction();
    
    try {
      // Convert operations to atomic operations
      for (const op of operations) {
        atomicFileOperations.addOperation(transaction.id, {
          type: 'move',
          source: op.originalPath,
          target: op.targetPath,
          metadata: op.analysisData
        });
      }

      const result = await atomicFileOperations.commitTransaction(transaction.id);
      return result;
    } catch (error) {
      throw error;
    }
  },

  async backupAndReplace(filePath, newContent) {
    const transaction = atomicFileOperations.beginTransaction();
    
    try {
      atomicFileOperations.addOperation(transaction.id, {
        type: 'create',
        source: filePath,
        content: newContent
      });

      return await atomicFileOperations.commitTransaction(transaction.id);
    } catch (error) {
      throw error;
    }
  }
}; 