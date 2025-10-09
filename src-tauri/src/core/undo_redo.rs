use crate::{
    error::Result,
    storage::{Database, Operation},
};
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use parking_lot::RwLock;
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use uuid::Uuid;

/// Represents a batch of operations that should be undone/redone as a single unit
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct BatchOperation {
    pub id: String,
    pub operations: Vec<Operation>,
    pub description: String,
    pub started_at: i64,
    pub completed_at: Option<i64>,
}

pub struct UndoRedoManager {
    database: Arc<Database>,
    undo_stack: Arc<RwLock<VecDeque<Operation>>>,
    redo_stack: Arc<RwLock<VecDeque<Operation>>>,
    batch_stack: Arc<RwLock<VecDeque<BatchOperation>>>,
    batch_redo_stack: Arc<RwLock<VecDeque<BatchOperation>>>,
    active_batches: Arc<RwLock<HashMap<String, Vec<Operation>>>>,
    max_size: usize,
    max_memory_mb: usize,
}

impl UndoRedoManager {
    pub fn new(database: Arc<Database>) -> Self {
        Self {
            database,
            undo_stack: Arc::new(RwLock::new(VecDeque::new())),
            redo_stack: Arc::new(RwLock::new(VecDeque::new())),
            batch_stack: Arc::new(RwLock::new(VecDeque::new())),
            batch_redo_stack: Arc::new(RwLock::new(VecDeque::new())),
            active_batches: Arc::new(RwLock::new(HashMap::new())),
            max_size: 50,
            max_memory_mb: 100, // 100MB limit for metadata/backup content
        }
    }

    pub fn with_limits(
        database: Arc<Database>,
        max_operations: usize,
        max_memory_mb: usize,
    ) -> Self {
        Self {
            database,
            undo_stack: Arc::new(RwLock::new(VecDeque::new())),
            redo_stack: Arc::new(RwLock::new(VecDeque::new())),
            batch_stack: Arc::new(RwLock::new(VecDeque::new())),
            batch_redo_stack: Arc::new(RwLock::new(VecDeque::new())),
            active_batches: Arc::new(RwLock::new(HashMap::new())),
            max_size: max_operations,
            max_memory_mb,
        }
    }

    pub async fn record_move(&self, source: &str, destination: &str) -> Result<()> {
        let operation = Operation {
            id: Uuid::new_v4().to_string(),
            operation_type: "move".to_string(),
            source: source.to_string(),
            destination: Some(destination.to_string()),
            timestamp: chrono::Utc::now().timestamp(),
            metadata: None,
        };

        self.record_operation(operation).await
    }

    pub async fn record_create(&self, path: &str) -> Result<()> {
        let operation = Operation {
            id: Uuid::new_v4().to_string(),
            operation_type: "create".to_string(),
            source: path.to_string(),
            destination: None,
            timestamp: chrono::Utc::now().timestamp(),
            metadata: None,
        };

        self.record_operation(operation).await
    }

    pub async fn record_delete(&self, path: &str, backup_content: Option<Vec<u8>>) -> Result<()> {
        let metadata = backup_content.map(|content| {
            serde_json::json!({
                "backup_content": BASE64_STANDARD.encode(content)
            })
        });

        let operation = Operation {
            id: Uuid::new_v4().to_string(),
            operation_type: "delete".to_string(),
            source: path.to_string(),
            destination: None,
            timestamp: chrono::Utc::now().timestamp(),
            metadata,
        };

        self.record_operation(operation).await
    }

    /// Start a new batch operation
    pub async fn start_batch(&self, _description: String) -> String {
        let batch_id = Uuid::new_v4().to_string();
        let mut batches = self.active_batches.write();
        batches.insert(batch_id.clone(), Vec::new());
        batch_id
    }

    /// Record an operation within a batch
    pub async fn record_in_batch(&self, batch_id: &str, operation: Operation) -> Result<()> {
        // We need to check if the batch exists without holding the lock
        // For now, we'll just push and handle errors if the batch doesn't exist
        let mut batches = self.active_batches.write();
        if let Some(operations) = batches.get_mut(batch_id) {
            operations.push(operation);
            Ok(())
        } else {
            Err(crate::error::AppError::InvalidOperation {
                message: format!("Batch {} not found or already completed", batch_id),
            })
        }
    }

    /// Commit a batch operation
    pub async fn commit_batch(&self, batch_id: &str) -> Result<()> {
        // Extract operations first, then drop the lock
        let batch = {
            let mut batches = self.active_batches.write();
            if let Some(operations) = batches.remove(batch_id) {
                if operations.is_empty() {
                    return Ok(()); // Empty batch, nothing to commit
                }

                Some(BatchOperation {
                    id: batch_id.to_string(),
                    operations,
                    description: format!("Batch operation {}", batch_id),
                    started_at: chrono::Utc::now().timestamp(),
                    completed_at: Some(chrono::Utc::now().timestamp()),
                })
            } else {
                None
            }
        };

        let batch = match batch {
            Some(b) => b,
            None => {
                return Err(crate::error::AppError::InvalidOperation {
                    message: format!("Batch {} not found", batch_id),
                });
            }
        };

        // Save batch to database (no locks held here)
        self.database.record_batch_operation(&batch).await?;

        // Add to batch undo stack
        {
            let mut batch_stack = self.batch_stack.write();
            batch_stack.push_back(batch);

            // Limit batch stack size (keep fewer batches than individual operations)
            if batch_stack.len() > self.max_size / 5 {
                batch_stack.pop_front();
            }
        }

        // Clear redo stacks when new batch is committed
        {
            let mut batch_redo = self.batch_redo_stack.write();
            batch_redo.clear();
        }

        Ok(())
    }

    /// Undo the most recent batch operation
    pub async fn undo_batch(&self) -> Result<Option<BatchOperation>> {
        let batch = {
            let mut batch_stack = self.batch_stack.write();
            batch_stack.pop_back()
        };

        if let Some(batch_op) = batch.clone() {
            let mut batch_redo = self.batch_redo_stack.write();
            batch_redo.push_back(batch_op);
        }

        Ok(batch)
    }

    /// Redo the most recent undone batch operation
    pub async fn redo_batch(&self) -> Result<Option<BatchOperation>> {
        let batch = {
            let mut batch_redo_stack = self.batch_redo_stack.write();
            batch_redo_stack.pop_back()
        };

        if let Some(batch_op) = batch.clone() {
            let mut batch_stack = self.batch_stack.write();
            batch_stack.push_back(batch_op);
        }

        Ok(batch)
    }

    /// Check if batch undo is available
    pub async fn can_undo_batch(&self) -> bool {
        !self.batch_stack.read().is_empty()
    }

    /// Check if batch redo is available
    pub async fn can_redo_batch(&self) -> bool {
        !self.batch_redo_stack.read().is_empty()
    }

    pub async fn record_operation(&self, operation: Operation) -> Result<()> {
        // Save to database
        self.database.record_operation(&operation).await?;

        // Add to undo stack
        {
            let mut stack = self.undo_stack.write();
            stack.push_back(operation);

            // Limit stack size
            if stack.len() > self.max_size {
                stack.pop_front();
            }
        }

        // Clear redo stack when new operation is recorded
        {
            let mut redo = self.redo_stack.write();
            redo.clear();
        }

        // Check memory usage and cleanup if necessary
        self.cleanup_if_memory_exceeded().await?;

        Ok(())
    }

    pub async fn undo(&self) -> Result<Option<Operation>> {
        let operation = {
            let mut stack = self.undo_stack.write();
            stack.pop_back()
        };

        if let Some(op) = operation.clone() {
            let mut redo = self.redo_stack.write();
            redo.push_back(op);
        }

        Ok(operation)
    }

    pub async fn redo(&self) -> Result<Option<Operation>> {
        let operation = {
            let mut stack = self.redo_stack.write();
            stack.pop_back()
        };

        if let Some(op) = operation.clone() {
            let mut undo = self.undo_stack.write();
            undo.push_back(op);
        }

        Ok(operation)
    }

    pub async fn can_undo(&self) -> bool {
        !self.undo_stack.read().is_empty()
    }

    pub async fn can_redo(&self) -> bool {
        !self.redo_stack.read().is_empty()
    }

    pub async fn undo_count(&self) -> usize {
        self.undo_stack.read().len()
    }

    pub async fn redo_count(&self) -> usize {
        self.redo_stack.read().len()
    }

    pub async fn clear(&self) -> Result<()> {
        self.undo_stack.write().clear();
        self.redo_stack.write().clear();
        self.batch_stack.write().clear();
        self.batch_redo_stack.write().clear();
        self.active_batches.write().clear();
        Ok(())
    }

    /// Calculate approximate memory usage of operations in stacks
    async fn calculate_memory_usage(&self) -> usize {
        let undo_stack = self.undo_stack.read();
        let redo_stack = self.redo_stack.read();
        let batch_stack = self.batch_stack.read();
        let batch_redo_stack = self.batch_redo_stack.read();

        let mut total_bytes = 0;

        // Calculate memory usage for undo stack
        for op in undo_stack.iter() {
            total_bytes += self.estimate_operation_size(op);
        }

        // Calculate memory usage for redo stack
        for op in redo_stack.iter() {
            total_bytes += self.estimate_operation_size(op);
        }

        // Calculate memory usage for batch stack
        for batch in batch_stack.iter() {
            total_bytes += self.estimate_batch_size(batch);
        }

        // Calculate memory usage for batch redo stack
        for batch in batch_redo_stack.iter() {
            total_bytes += self.estimate_batch_size(batch);
        }

        total_bytes
    }

    /// Estimate the memory footprint of an operation (primarily metadata)
    fn estimate_operation_size(&self, operation: &Operation) -> usize {
        let mut size = operation.id.len() + operation.operation_type.len() + operation.source.len();

        if let Some(dest) = &operation.destination {
            size += dest.len();
        }

        if let Some(metadata) = &operation.metadata {
            // Estimate JSON size - this is an approximation
            match serde_json::to_string(metadata) {
                Ok(serialized) => {
                    size += serialized.len();
                }
                Err(error) => {
                    tracing::warn!("Failed to serialize metadata for size estimation: {}", error);
                }
            }
        }

        size
    }

    /// Estimate the memory footprint of a batch operation
    fn estimate_batch_size(&self, batch: &BatchOperation) -> usize {
        let mut size = batch.id.len() + batch.description.len();

        // Estimate size of all operations in the batch
        for op in &batch.operations {
            size += self.estimate_operation_size(op);
        }

        size
    }

    /// Clean up old operations if memory usage exceeds limit
    async fn cleanup_if_memory_exceeded(&self) -> Result<()> {
        let memory_usage_bytes = self.calculate_memory_usage().await;
        let memory_usage_mb = memory_usage_bytes / (1024 * 1024);

        if memory_usage_mb > self.max_memory_mb {
            tracing::info!(
                "Memory usage ({} MB) exceeds limit ({} MB), cleaning up old operations",
                memory_usage_mb,
                self.max_memory_mb
            );

            // Remove the oldest 25% of operations from both stacks
            {
                let mut undo_stack = self.undo_stack.write();
                let remove_count = undo_stack.len() / 4;
                for _ in 0..remove_count {
                    undo_stack.pop_front();
                }
            }

            {
                let mut redo_stack = self.redo_stack.write();
                let remove_count = redo_stack.len() / 4;
                for _ in 0..remove_count {
                    redo_stack.pop_front();
                }
            }

            tracing::info!("Cleaned up old operations to reduce memory usage");
        }

        Ok(())
    }

    /// Get memory usage statistics
    pub async fn get_memory_stats(&self) -> MemoryStats {
        let memory_usage_bytes = self.calculate_memory_usage().await;
        let memory_usage_mb = memory_usage_bytes / (1024 * 1024);

        MemoryStats {
            memory_usage_mb,
            memory_limit_mb: self.max_memory_mb,
            undo_operations: self.undo_stack.read().len(),
            redo_operations: self.redo_stack.read().len(),
            operation_limit: self.max_size,
        }
    }
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct MemoryStats {
    pub memory_usage_mb: usize,
    pub memory_limit_mb: usize,
    pub undo_operations: usize,
    pub redo_operations: usize,
    pub operation_limit: usize,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::database::Database;
    use sqlx::SqlitePool;
    use tempfile::tempdir;

    /// Test batch operation creation and commitment
    #[tokio::test]
    async fn test_batch_operations() {
        let temp_dir = tempdir().expect("Failed to create temp directory");
        let db_path = temp_dir.path().join("test_batch.db");

        // Create a database
        let pool = SqlitePool::connect(&format!("sqlite://{}?mode=rwc", db_path.display()))
            .await
            .expect("Failed to create test database");

        // Initialize basic schema
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS operations_history (
                id TEXT PRIMARY KEY,
                operation_type TEXT NOT NULL,
                source TEXT NOT NULL,
                destination TEXT,
                timestamp INTEGER,
                metadata TEXT
            )
            "#,
        )
        .execute(&pool)
        .await
        .expect("Failed to create test table");

        // Create undo/redo manager
        let database = Arc::new(Database::new_from_url(&format!("sqlite://{}", db_path.display())).await.unwrap());
        let undo_redo = UndoRedoManager::new(database);

        // Initialize the schema properly for tests
        // Force re-run migrations to ensure proper state
        undo_redo.database.run_migrations().await.unwrap();

        // Start a batch operation
        let batch_id = undo_redo.start_batch("Test batch".to_string()).await;

        // Record some operations in the batch
        let op1 = Operation {
            id: "op1".to_string(),
            operation_type: "move".to_string(),
            source: "/test/file1.txt".to_string(),
            destination: Some("/test/destination/file1.txt".to_string()),
            timestamp: chrono::Utc::now().timestamp(),
            metadata: None,
        };

        let op2 = Operation {
            id: "op2".to_string(),
            operation_type: "move".to_string(),
            source: "/test/file2.txt".to_string(),
            destination: Some("/test/destination/file2.txt".to_string()),
            timestamp: chrono::Utc::now().timestamp(),
            metadata: None,
        };

        undo_redo.record_in_batch(&batch_id, op1).await.unwrap();
        undo_redo.record_in_batch(&batch_id, op2).await.unwrap();

        // Commit the batch
        undo_redo.commit_batch(&batch_id).await.unwrap();

        // Check that batch undo is available
        assert!(undo_redo.can_undo_batch().await);

        // Undo the batch
        let undone_batch = undo_redo.undo_batch().await.unwrap().unwrap();
        assert_eq!(undone_batch.operations.len(), 2);
        assert_eq!(undone_batch.operations[0].source, "/test/file1.txt");
        assert_eq!(undone_batch.operations[1].source, "/test/file2.txt");

        // Check that batch undo is no longer available
        assert!(!undo_redo.can_undo_batch().await);

        // Check that batch redo is available
        assert!(undo_redo.can_redo_batch().await);

        // Redo the batch
        let redone_batch = undo_redo.redo_batch().await.unwrap().unwrap();
        assert_eq!(redone_batch.operations.len(), 2);

        // Check that batch undo is available again
        assert!(undo_redo.can_undo_batch().await);
    }

    /// Test batch operation with empty operations
    #[tokio::test]
    async fn test_empty_batch_operations() {
        let temp_dir = tempdir().expect("Failed to create temp directory");
        let db_path = temp_dir.path().join("test_empty_batch.db");

        let pool = SqlitePool::connect(&format!("sqlite://{}?mode=rwc", db_path.display()))
            .await
            .expect("Failed to create test database");

        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS operations_history (
                id TEXT PRIMARY KEY,
                operation_type TEXT NOT NULL,
                source TEXT NOT NULL,
                destination TEXT,
                timestamp INTEGER,
                metadata TEXT
            )
            "#,
        )
        .execute(&pool)
        .await
        .expect("Failed to create test table");

        let database = Arc::new(Database::new_from_url(&format!("sqlite://{}", db_path.display())).await.unwrap());
        let undo_redo = UndoRedoManager::new(database);

        // Initialize the schema properly for tests
        // Force re-run migrations to ensure proper state
        undo_redo.database.run_migrations().await.unwrap();

        // Start and commit an empty batch
        let batch_id = undo_redo.start_batch("Empty batch".to_string()).await;
        undo_redo.commit_batch(&batch_id).await.unwrap();

        // Should not be able to undo empty batch
        assert!(!undo_redo.can_undo_batch().await);
    }

    /// Test batch operation error handling
    #[tokio::test]
    async fn test_batch_operation_errors() {
        let temp_dir = tempdir().expect("Failed to create temp directory");
        let db_path = temp_dir.path().join("test_batch_errors.db");

        let pool = SqlitePool::connect(&format!("sqlite://{}?mode=rwc", db_path.display()))
            .await
            .expect("Failed to create test database");

        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS operations_history (
                id TEXT PRIMARY KEY,
                operation_type TEXT NOT NULL,
                source TEXT NOT NULL,
                destination TEXT,
                timestamp INTEGER,
                metadata TEXT
            )
            "#,
        )
        .execute(&pool)
        .await
        .expect("Failed to create test table");

        let database = Arc::new(Database::new_from_url(&format!("sqlite://{}", db_path.display())).await.unwrap());
        let undo_redo = UndoRedoManager::new(database);

        // Initialize the schema properly for tests
        // Force re-run migrations to ensure proper state
        undo_redo.database.run_migrations().await.unwrap();

        // Try to record operation in non-existent batch
        let fake_batch_id = "fake-batch-id".to_string();
        let operation = Operation {
            id: "op1".to_string(),
            operation_type: "move".to_string(),
            source: "/test/file.txt".to_string(),
            destination: Some("/test/destination/file.txt".to_string()),
            timestamp: chrono::Utc::now().timestamp(),
            metadata: None,
        };

        let result = undo_redo.record_in_batch(&fake_batch_id, operation).await;
        assert!(result.is_err());

        // Try to commit non-existent batch
        let result = undo_redo.commit_batch(&fake_batch_id).await;
        assert!(result.is_err());
    }

    /// Test memory usage calculation with batches
    #[tokio::test]
    async fn test_batch_memory_calculation() {
        let temp_dir = tempdir().expect("Failed to create temp directory");
        let db_path = temp_dir.path().join("test_memory.db");

        let pool = SqlitePool::connect(&format!("sqlite://{}?mode=rwc", db_path.display()))
            .await
            .expect("Failed to create test database");

        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS operations_history (
                id TEXT PRIMARY KEY,
                operation_type TEXT NOT NULL,
                source TEXT NOT NULL,
                destination TEXT,
                timestamp INTEGER,
                metadata TEXT
            )
            "#,
        )
        .execute(&pool)
        .await
        .expect("Failed to create test table");

        let database = Arc::new(Database::new_from_url(&format!("sqlite://{}", db_path.display())).await.unwrap());
        let undo_redo = UndoRedoManager::new(database);

        // Initialize the schema properly for tests
        // Force re-run migrations to ensure proper state
        undo_redo.database.run_migrations().await.unwrap();

        // Create a batch with multiple operations
        let batch_id = undo_redo.start_batch("Memory test batch".to_string()).await;

        for i in 0..5 {
            let operation = Operation {
                id: format!("op{}", i),
                operation_type: "move".to_string(),
                source: format!("/test/file{}.txt", i),
                destination: Some(format!("/test/destination/file{}.txt", i)),
                timestamp: chrono::Utc::now().timestamp(),
                metadata: Some(serde_json::json!({"test": "data"})),
            };
            undo_redo.record_in_batch(&batch_id, operation).await.unwrap();
        }

        undo_redo.commit_batch(&batch_id).await.unwrap();

        // Calculate memory usage
        let memory_usage = undo_redo.calculate_memory_usage().await;

        // Should be greater than zero
        assert!(memory_usage > 0);

        // Should account for the batch operation (5 operations with ~64 bytes each + batch overhead)
        // Total expected: ~320-400 bytes, so check for > 200 to allow margin
        assert!(memory_usage > 200, "Expected memory usage > 200 bytes, got {} bytes", memory_usage);
    }
}
