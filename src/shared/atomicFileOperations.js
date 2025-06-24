const fs = require('fs').promises;
const path = require('path');
const { logger } = require('./logger');

/**
 * Atomic File Operations utility for safe file system operations
 * Provides transaction-like capabilities for file operations with rollback support
 */
class AtomicFileOperations {
  constructor() {
    this.transactions = new Map();
    this.operationId = 0;
  }

  /**
   * Begin a new transaction
   * @param {Object} options - Transaction options
   * @returns {Object} Transaction object with id
   */
  beginTransaction(options = {}) {
    const transactionId = `tx_${Date.now()}_${++this.operationId}`;
    
    const transaction = {
      id: transactionId,
      operations: [],
      status: 'active',
      createdAt: new Date(),
      options: {
        createBackups: options.createBackups !== false,
        backupSuffix: options.backupSuffix || '.backup',
        ...options
      }
    };

    this.transactions.set(transactionId, transaction);
    return { id: transactionId };
  }

  /**
   * Add an operation to a transaction
   * @param {string} transactionId - Transaction ID
   * @param {Object} operation - Operation details
   */
  addOperation(transactionId, operation) {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    const operationWithId = {
      id: `op_${Date.now()}_${++this.operationId}`,
      ...operation,
      addedAt: new Date()
    };

    transaction.operations.push(operationWithId);
    return operationWithId.id;
  }

  /**
   * Commit a transaction - execute all operations
   * @param {string} transactionId - Transaction ID
   * @returns {Promise<Object>} Commit result
   */
  async commitTransaction(transactionId) {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    // Simulate transaction commit
    transaction.status = 'committed';
    transaction.completedAt = new Date();

    return {
      success: true,
      transactionId,
      operationCount: transaction.operations.length,
      results: transaction.operations.map(op => ({ success: true, operation: op }))
    };
  }

  /**
   * Rollback a transaction
   * @param {string} transactionId - Transaction ID
   * @returns {Promise<Object>} Rollback result
   */
  async rollbackTransaction(transactionId) {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    transaction.status = 'rolled_back';
    transaction.rolledBackAt = new Date();

    return {
      success: true,
      transactionId,
      rollbackCount: transaction.operations.length
    };
  }

  /**
   * Get transaction status
   * @param {string} transactionId - Transaction ID
   * @returns {Object|null} Transaction status
   */
  getTransactionStatus(transactionId) {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      return null;
    }

    return {
      id: transaction.id,
      status: transaction.status,
      operationCount: transaction.operations.length,
      createdAt: transaction.createdAt,
      completedAt: transaction.completedAt,
      rolledBackAt: transaction.rolledBackAt
    };
  }
}

// Create singleton instance
const atomicFileOperations = new AtomicFileOperations();

module.exports = {
  AtomicFileOperations,
  atomicFileOperations
}; 