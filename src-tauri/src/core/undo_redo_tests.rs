#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::{database::Database, init::*};
    use sqlx::SqlitePool;
    use tempfile::tempdir;
    use tokio::fs;

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

        // Should account for the batch operation
        assert!(memory_usage > 1000); // Rough estimate
    }
}
