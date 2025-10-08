use crate::{ai::FileAnalysis, config::Config, core::undo_redo::BatchOperation, error::{AppError, Result}};
use crate::storage::{VectorExtension, VectorStats};
use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqlitePool, Row};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tracing::{debug, error, info, warn};

pub const CURRENT_SCHEMA_VERSION: i32 = 3;

pub struct Database {
    pool: SqlitePool,
    vector_ext: Arc<VectorExtension>,
}

/// Validates SQL identifiers to prevent injection attacks
/// Only allows alphanumeric characters, underscores, and limits length
pub fn is_valid_sql_identifier(identifier: &str) -> bool {
    if identifier.is_empty() || identifier.len() > 64 {
        return false;
    }

    // Must start with letter or underscore
    if !identifier
        .chars()
        .next()
        .unwrap_or(' ')
        .is_ascii_alphabetic()
        && !identifier.starts_with('_')
    {
        return false;
    }

    // Only allow alphanumeric characters and underscores
    identifier
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_')
}

/// Reserved for future LIKE query escaping when dynamic search is added
/// DO NOT REMOVE - needed for SQL injection prevention in search features
#[allow(dead_code)]
fn escape_like_pattern(input: &str) -> String {
    input
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
        .replace('[', "\\[")
        .replace(']', "\\]")
}

impl Database {
    pub async fn new(handle: &AppHandle, config: &Config) -> Result<Self> {
        let db_path = Self::database_path_with_fallbacks(handle).await?;

        // Robust directory creation with multiple fallbacks
        if let Some(parent) = db_path.parent() {
            // Create directory with comprehensive error handling
            if let Err(e) = Self::ensure_database_directory(parent).await {
                tracing::error!("Failed to create database directory {:?}: {}", parent, e);

                // Try fallback directory locations
                let fallback_paths = Self::get_fallback_database_paths();
                for fallback_path in fallback_paths {
                    if let Ok(fallback_db_path) = Self::try_fallback_database(&fallback_path).await
                    {
                        tracing::warn!("Using fallback database path: {:?}", fallback_db_path);
                        return Self::initialize_database_at_path(fallback_db_path, config).await;
                    }
                }

                return Err(AppError::DatabaseError {
                    message: format!("Failed to create database directory '{}': {}. All fallback locations failed.", parent.display(), e),
                });
            }
        }

        Self::initialize_database_at_path(db_path, config).await
    }

    async fn initialize_database_at_path(db_path: PathBuf, config: &Config) -> Result<Self> {
        // Log the database path for debugging
        tracing::info!("Initializing database at: {:?}", db_path);

        // Create connection with robust retry logic
        let pool = Self::create_database_connection_with_retry(&db_path).await?;

        // Verify connection with enhanced retry logic
        Self::verify_database_connection(&pool).await?;

        // Initialize vector extension with non-blocking approach
        let vector_ext = Arc::new(Self::initialize_vector_extension_safely(&pool, config).await);

        let db = Self { pool, vector_ext };

        // Check database integrity with recovery options
        if let Err(e) = db.check_integrity_with_recovery().await {
            tracing::warn!(
                "Database integrity check failed, attempting recovery: {}",
                e
            );
            db.attempt_database_recovery().await?;
        }

        // Run migrations with atomic transactions
        db.run_migrations_atomically().await?;

        info!("Database initialized successfully");
        Ok(db)
    }

    /// Test-specific constructor that takes a path directly
    pub async fn new_test(db_path: &std::path::Path) -> Result<Self> {
        use sqlx::sqlite::SqliteConnectOptions;

        // Ensure directory exists
        if let Some(parent) = db_path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }

        let _db_url = format!("sqlite://{}", db_path.display());

        let options = SqliteConnectOptions::new()
            .filename(db_path)
            .create_if_missing(true)
            .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
            .busy_timeout(Duration::from_secs(30))
            .pragma("foreign_keys", "ON");

        let pool = SqlitePool::connect_with(options).await?;

        // Initialize vector extension with default config for tests
        let default_config = Config::default();
        let vector_ext = Arc::new(VectorExtension::initialize(&pool, &default_config).await);

        let db = Self { pool, vector_ext };

        // Run migrations to ensure schema is up to date
        db.run_migrations().await?;

        Ok(db)
    }

    #[allow(dead_code)]
    async fn initialize_schema(&self) -> Result<()> {
        // Create tables
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS file_analysis (
                path TEXT PRIMARY KEY,
                category TEXT NOT NULL,
                tags TEXT NOT NULL,
                summary TEXT NOT NULL,
                confidence REAL NOT NULL,
                extracted_text TEXT,
                detected_language TEXT,
                metadata TEXT,
                analyzed_at INTEGER NOT NULL,
                embedding BLOB
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS smart_folders (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                path TEXT NOT NULL,
                rules TEXT NOT NULL,
                icon TEXT,
                color TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS operations_history (
                id TEXT PRIMARY KEY,
                operation_type TEXT NOT NULL,
                source TEXT NOT NULL,
                destination TEXT,
                timestamp INTEGER NOT NULL,
                metadata TEXT
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Create indexes with proper error handling
        self.create_index_safely("idx_analysis_category", "file_analysis", "category")
            .await?;
        self.create_index_safely("idx_analysis_analyzed_at", "file_analysis", "analyzed_at")
            .await?;
        self.create_index_safely(
            "idx_operations_timestamp",
            "operations_history",
            "timestamp",
        )
        .await?;

        // Create vector table using the vector extension if available
        if self.vector_ext.is_available {
            info!("Creating vector table with sqlite-vec extension");
            if let Err(e) = self
                .vector_ext
                .create_vector_table(
                    &self.pool,
                    "vec_embeddings",
                    self.vector_ext.get_dimensions(),
                )
                .await
            {
                warn!(
                    "Failed to create vector table: {}. Will use fallback storage.",
                    e
                );
            }
        } else {
            info!("sqlite-vec not available, using fallback embedding storage in main table");
        }

        Ok(())
    }

    #[allow(dead_code)]
    async fn create_index_safely(
        &self,
        index_name: &str,
        table_name: &str,
        column_name: &str,
    ) -> Result<()> {
        // Whitelist of allowed index configurations for maximum security
        const ALLOWED_INDEXES: &[(&str, &str, &str)] = &[
            ("idx_analysis_category", "file_analysis", "category"),
            ("idx_analysis_analyzed_at", "file_analysis", "analyzed_at"),
            ("idx_analysis_path", "file_analysis", "path"),
            ("idx_analysis_confidence", "file_analysis", "confidence"),
            (
                "idx_smart_folders_created_at",
                "smart_folders",
                "created_at",
            ),
            (
                "idx_smart_folders_updated_at",
                "smart_folders",
                "updated_at",
            ),
        ];

        // Only allow predefined index combinations
        if !ALLOWED_INDEXES
            .iter()
            .any(|(idx, tbl, col)| idx == &index_name && tbl == &table_name && col == &column_name)
        {
            return Err(AppError::SecurityError {
                message: format!(
                    "Unauthorized index configuration: {} on {}.{}",
                    index_name, table_name, column_name
                ),
            });
        }

        // Additional validation as defense in depth
        if !is_valid_sql_identifier(index_name)
            || !is_valid_sql_identifier(table_name)
            || !is_valid_sql_identifier(column_name)
        {
            return Err(AppError::SecurityError {
                message: "Invalid SQL identifier format".to_string(),
            });
        }

        // Safe to use format! after whitelist + validation
        let query = format!(
            "CREATE INDEX IF NOT EXISTS {} ON {}({})",
            index_name, table_name, column_name
        );

        match sqlx::query(&query).execute(&self.pool).await {
            Ok(_) => {
                tracing::debug!("Successfully created or verified index: {}", index_name);
                Ok(())
            }
            Err(sqlx::Error::Database(db_err)) => {
                // Check if this is a "table already exists" or similar benign error
                if let Some(code) = db_err.code() {
                    if code == "1" || code == "SQLITE_ERROR" {
                        // Check if error message indicates index already exists
                        let message = db_err.message().to_lowercase();
                        if message.contains("already exists") || message.contains("duplicate") {
                            tracing::debug!("Index {} already exists, continuing", index_name);
                            return Ok(());
                        }
                    }
                }

                // This is a real error that could affect performance
                tracing::error!(
                    "Critical: Failed to create index {}: {}",
                    index_name,
                    db_err
                );
                Err(AppError::DatabaseError {
                    message: format!("Failed to create critical index {}: {}", index_name, db_err),
                })
            }
            Err(e) => {
                tracing::error!("Critical: Failed to create index {}: {}", index_name, e);
                Err(AppError::DatabaseError {
                    message: format!("Failed to create critical index {}: {}", index_name, e),
                })
            }
        }
    }

    async fn check_integrity(&self) -> Result<()> {
        tracing::info!("Checking database integrity...");

        // Run SQLite's built-in integrity check
        let result = sqlx::query("PRAGMA integrity_check")
            .fetch_one(&self.pool)
            .await
            .map_err(|e| {
                tracing::error!("Database integrity check failed: {}", e);
                AppError::DatabaseError {
                    message: format!("Database integrity check failed: {}", e),
                }
            })?;

        let integrity_result: String = result.get(0);

        if integrity_result != "ok" {
            tracing::error!("Database corruption detected: {}", integrity_result);

            // Try to run a quick check to see if we can recover
            match sqlx::query("PRAGMA quick_check")
                .fetch_one(&self.pool)
                .await
            {
                Ok(quick_result) => {
                    let quick_check: String = quick_result.get(0);
                    if quick_check == "ok" {
                        tracing::warn!("Quick check passed, but full integrity check failed. Database may have minor issues.");
                    } else {
                        return Err(AppError::DatabaseError {
                            message: format!(
                                "Database corruption detected and cannot be recovered: {}",
                                integrity_result
                            ),
                        });
                    }
                }
                Err(_) => {
                    return Err(AppError::DatabaseError {
                        message: format!(
                            "Database corruption detected and cannot be recovered: {}",
                            integrity_result
                        ),
                    });
                }
            }
        } else {
            tracing::debug!("Database integrity check passed");
        }

        Ok(())
    }

    pub async fn save_analysis(&self, analysis: &FileAnalysis) -> Result<()> {
        let tags_json = serde_json::to_string(&analysis.tags)?;
        let analyzed_at = chrono::Utc::now().timestamp();

        sqlx::query(
            r#"
            INSERT OR REPLACE INTO file_analysis
            (path, category, tags, summary, confidence, extracted_text, detected_language, analyzed_at, embedding)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&analysis.path)
        .bind(&analysis.category)
        .bind(&tags_json)
        .bind(&analysis.summary)
        .bind(analysis.confidence)
        .bind(&analysis.extracted_text)
        .bind(&analysis.detected_language)
        .bind(analyzed_at)
        .bind(None::<&[u8]>) // NULL for embedding initially
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn get_analysis(&self, path: &str) -> Result<Option<FileAnalysis>> {
        let row = sqlx::query(
            r#"
            SELECT category, tags, summary, confidence, extracted_text, detected_language
            FROM file_analysis
            WHERE path = ?
            "#,
        )
        .bind(path)
        .fetch_optional(&self.pool)
        .await?;

        if let Some(row) = row {
            let tags: Vec<String> = serde_json::from_str(row.get("tags"))?;

            Ok(Some(FileAnalysis {
                path: path.to_string(),
                category: row.get("category"),
                tags,
                summary: row.get("summary"),
                confidence: row.get("confidence"),
                extracted_text: row.get("extracted_text"),
                detected_language: row.get("detected_language"),
                metadata: serde_json::Value::Null,
            }))
        } else {
            Ok(None)
        }
    }

    /// Get analyses for multiple paths in a single query (prevents N+1 queries)
    pub async fn get_analyses_for_paths(&self, paths: Vec<String>) -> Result<Vec<FileAnalysis>> {
        if paths.is_empty() {
            return Ok(vec![]);
        }

        // Build query with IN clause for multiple paths
        let placeholders = (0..paths.len())
            .map(|i| format!("?{}", i + 1))
            .collect::<Vec<_>>()
            .join(", ");

        let query_str = format!(
            r#"
            SELECT path, category, tags, summary, confidence, extracted_text, detected_language
            FROM file_analysis
            WHERE path IN ({})
            "#,
            placeholders
        );

        let mut query = sqlx::query(&query_str);
        for path in &paths {
            query = query.bind(path);
        }

        let rows = query.fetch_all(self.pool()).await?;

        // Parse rows into FileAnalysis structs
        let mut results = Vec::new();
        for row in rows {
            let tags: Vec<String> = serde_json::from_str(row.get("tags"))?;
            let path: String = row.get("path");

            results.push(FileAnalysis {
                path,
                category: row.get("category"),
                tags,
                summary: row.get("summary"),
                confidence: row.get("confidence"),
                extracted_text: row.get("extracted_text"),
                detected_language: row.get("detected_language"),
                metadata: serde_json::Value::Null,
            });
        }

        Ok(results)
    }

    pub async fn search_by_category(&self, category: &str) -> Result<Vec<String>> {
        let rows = sqlx::query(
            r#"
            SELECT path FROM file_analysis
            WHERE category = ?
            ORDER BY analyzed_at DESC
            "#,
        )
        .bind(category)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.iter().map(|row| row.get("path")).collect())
    }

    pub async fn search_by_tags(&self, tags: &[String]) -> Result<Vec<String>> {
        let mut paths = Vec::new();

        for tag in tags {
            // Use exact match with JSON extraction for security
            let rows = sqlx::query(
                r#"
                SELECT path FROM file_analysis
                WHERE EXISTS (
                    SELECT 1 FROM json_each(tags) 
                    WHERE value = ? COLLATE NOCASE
                )
                ORDER BY confidence DESC
                "#,
            )
            .bind(tag.trim()) // Trim whitespace but use exact match
            .fetch_all(&self.pool)
            .await?;

            for row in rows {
                paths.push(row.get("path"));
            }
        }

        // Remove duplicates
        paths.sort();
        paths.dedup();

        Ok(paths)
    }

    pub async fn get_recent_analyses(&self, limit: u32) -> Result<Vec<String>> {
        let rows = sqlx::query(
            r#"
            SELECT path
            FROM file_analysis
            ORDER BY analyzed_at DESC
            LIMIT ?
            "#,
        )
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        let paths: Vec<String> = rows.into_iter().map(|row| row.get("path")).collect();

        Ok(paths)
    }

    pub async fn save_embedding(
        &self,
        path: &str,
        embedding: &[f32],
        model_name: Option<&str>,
    ) -> Result<()> {
        // CRITICAL: Validate embedding dimensions before storage
        let expected_dims = self.vector_ext.embedding_dimensions;
        if embedding.len() != expected_dims {
            return Err(AppError::InvalidInput {
                message: format!(
                    "Embedding dimension mismatch: got {} but expected {} dimensions. Check that you're using the correct model (nomic-embed-text outputs 768 dimensions).",
                    embedding.len(),
                    expected_dims
                ),
            });
        }

        // Serialize embedding as JSON string then to bytes for consistent storage
        let embedding_json = serde_json::to_string(embedding)?;
        let embedding_bytes = embedding_json.as_bytes().to_vec();

        // Use transaction for atomic embedding storage across multiple tables
        let mut tx = self.pool.begin().await?;

        // Save to main table as fallback/backup within transaction
        sqlx::query(
            r#"
            UPDATE file_analysis
            SET embedding = ?
            WHERE path = ?
            "#,
        )
        .bind(&embedding_bytes)
        .bind(path)
        .execute(&mut *tx)
        .await?;

        // Save to embeddings_v3 table for improved organization within transaction
        let model = model_name.unwrap_or("unknown");
        sqlx::query(
            r#"
            INSERT OR REPLACE INTO embeddings_v3 (path, embedding, model_name, created_at, updated_at)
            VALUES (?, ?, ?, datetime('now'), datetime('now'))
            "#,
        )
        .bind(path)
        .bind(&embedding_bytes)
        .bind(model)
        .execute(&mut *tx)
        .await?;

        // Commit transaction first, then handle vector table separately if available
        tx.commit().await?;

        // Save to vector table using proper extension if available (separate from transaction)
        if self.vector_ext.is_available {
            if let Err(e) = self
                .vector_ext
                .store_embedding(&self.pool, "vec_embeddings", path, embedding)
                .await
            {
                warn!(
                    "Failed to store embedding in vector table: {}. Using fallback storage only.",
                    e
                );
            }
        }

        Ok(())
    }

    /// Enhanced semantic search with better accuracy and performance
    pub async fn semantic_search(
        &self,
        query_embedding: &[f32],
        limit: usize,
    ) -> Result<Vec<(String, f32)>> {
        // Validate embedding dimensions
        if query_embedding.len() != self.vector_ext.embedding_dimensions {
            return Err(crate::error::AppError::InvalidInput {
                message: format!(
                    "Embedding dimension mismatch: expected {}, got {}",
                    self.vector_ext.embedding_dimensions,
                    query_embedding.len()
                ),
            });
        }

        // Try vector search using sqlite-vec extension if available
        if self.vector_ext.is_available {
            debug!("Using sqlite-vec for high-performance semantic search");
            match self
                .vector_ext
                .vector_search(&self.pool, "vec_embeddings", query_embedding, limit, None)
                .await
            {
                Ok(results) => {
                    debug!("sqlite-vec search returned {} results", results.len());
                    return Ok(results);
                }
                Err(e) => {
                    warn!(
                        "sqlite-vec search failed, falling back to manual search: {}",
                        e
                    );
                }
            }
        }

        // Enhanced fallback with better similarity threshold
        debug!("Using enhanced manual cosine similarity for semantic search");
        self.enhanced_cosine_similarity_search(query_embedding, limit)
            .await
    }

    /// Enhanced cosine similarity search with better accuracy
    async fn enhanced_cosine_similarity_search(
        &self,
        query_embedding: &[f32],
        limit: usize,
    ) -> Result<Vec<(String, f32)>> {
        // Try embeddings_v3 table first (preferred)
        let rows = match sqlx::query(
            "SELECT path as file_path, embedding FROM embeddings_v3 WHERE embedding IS NOT NULL ORDER BY created_at"
        )
        .fetch_all(&self.pool)
        .await {
            Ok(rows) => rows,
            Err(_) => {
                // Fallback to file_analysis table if embeddings_v3 doesn't exist
                warn!("embeddings_v3 table not available, falling back to file_analysis table");
                sqlx::query(
                    "SELECT path as file_path, embedding FROM file_analysis WHERE embedding IS NOT NULL ORDER BY analyzed_at"
                )
                .fetch_all(&self.pool)
                .await?
            }
        };

        let mut results = Vec::new();
        let minimum_similarity = 0.1; // Filter out very low similarity matches

        for row in rows {
            let file_path: String = row.get("file_path");
            let embedding_blob: Vec<u8> = row.get("embedding");

            // Deserialize stored embedding (convert from bytes to string to JSON)
            if let Ok(embedding_json) = String::from_utf8(embedding_blob) {
                if let Ok(stored_embedding) = serde_json::from_str::<Vec<f32>>(&embedding_json) {
                    // Ensure dimensions match
                    if stored_embedding.len() == query_embedding.len() {
                        let similarity = cosine_similarity(query_embedding, &stored_embedding);

                        // Only include results above minimum similarity threshold
                        if similarity > minimum_similarity {
                            results.push((file_path, similarity));
                        }
                    }
                }
            }
        }

        // Sort by similarity (highest first) and limit results
        results.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        results.truncate(limit);

        debug!("Enhanced search found {} relevant results", results.len());
        Ok(results)
    }

    pub async fn record_operation(&self, operation: &Operation) -> Result<()> {
        let metadata_json = serde_json::to_string(&operation.metadata)?;

        sqlx::query(
            r#"
            INSERT INTO operations_history 
            (id, operation_type, source, destination, timestamp, metadata)
            VALUES (?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&operation.id)
        .bind(&operation.operation_type)
        .bind(&operation.source)
        .bind(&operation.destination)
        .bind(operation.timestamp)
        .bind(&metadata_json)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn record_batch_operation(&self, batch: &BatchOperation) -> Result<()> {
        let operations_json = serde_json::to_string(&batch.operations)?;
        let completed_at = batch.completed_at.unwrap_or_else(|| chrono::Utc::now().timestamp());

        sqlx::query(
            r#"
            INSERT INTO operations_history
            (id, operation_type, source, destination, timestamp, metadata)
            VALUES (?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&batch.id)
        .bind("batch")
        .bind(&batch.description)
        .bind(operations_json)
        .bind(batch.started_at)
        .bind(completed_at)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn get_recent_operations(&self, limit: usize) -> Result<Vec<Operation>> {
        let rows = sqlx::query(
            r#"
            SELECT id, operation_type, source, destination, timestamp, metadata
            FROM operations_history
            ORDER BY timestamp DESC
            LIMIT ?
            "#,
        )
        .bind(limit as i32)
        .fetch_all(&self.pool)
        .await?;

        let mut operations = Vec::new();

        for row in rows {
            let metadata: serde_json::Value = serde_json::from_str(row.get("metadata"))?;

            operations.push(Operation {
                id: row.get("id"),
                operation_type: row.get("operation_type"),
                source: row.get("source"),
                destination: row.get("destination"),
                timestamp: row.get("timestamp"),
                metadata: Some(metadata),
            });
        }

        Ok(operations)
    }

    pub async fn get_operation_by_id(&self, operation_id: &str) -> Result<Option<Operation>> {
        let row = sqlx::query(
            r#"
            SELECT id, operation_type, source, destination, timestamp, metadata
            FROM operations_history
            WHERE id = ?
            "#,
        )
        .bind(operation_id)
        .fetch_optional(&self.pool)
        .await?;

        if let Some(row) = row {
            let metadata: serde_json::Value = serde_json::from_str(row.get("metadata"))?;

            Ok(Some(Operation {
                id: row.get("id"),
                operation_type: row.get("operation_type"),
                source: row.get("source"),
                destination: row.get("destination"),
                timestamp: row.get("timestamp"),
                metadata: Some(metadata),
            }))
        } else {
            Ok(None)
        }
    }

    // IDOR Protection: Check if user has permission to access specific file
    pub async fn check_file_permission(&self, path: &str, _user_id: &str) -> Result<bool> {
        // For a desktop application, this is simplified - in a real multi-user system,
        // you would have a proper user_permissions table

        // Check if the file has been analyzed by this user (implying permission)
        let result = sqlx::query(
            r#"
            SELECT COUNT(*) as count
            FROM file_analysis
            WHERE path = ?
            "#,
        )
        .bind(path)
        .fetch_one(&self.pool)
        .await?;

        let count: i64 = result.get("count");

        // If file exists in our analysis database, user has access
        // In a real system, you'd check a user_permissions table:
        // SELECT COUNT(*) FROM user_permissions WHERE user_id = ? AND file_path = ? AND permission = 'read'
        Ok(count > 0)
    }

    pub async fn vacuum(&self) -> Result<()> {
        sqlx::query("VACUUM").execute(&self.pool).await?;
        Ok(())
    }

    pub async fn flush(&self) -> Result<()> {
        // SQLite automatically flushes, but we can force a checkpoint
        sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// Get reference to the database pool
    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }

    pub fn database_path(handle: &AppHandle) -> Result<PathBuf> {
        // Legacy sync method - use database_path_with_fallbacks for new code
        tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current().block_on(Self::database_path_with_fallbacks(handle))
        })
    }

    async fn database_path_with_fallbacks(handle: &AppHandle) -> Result<PathBuf> {
        // Try multiple directory options with comprehensive fallbacks
        let directory_options = vec![
            handle.path().app_data_dir(),
            handle.path().app_local_data_dir(),
            handle.path().app_cache_dir(),
            Ok(std::env::current_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."))
                .join("data")),
            Ok(std::path::PathBuf::from("./stratosort_data")),
            Ok(std::env::temp_dir().join("stratosort")),
        ];

        for app_dir in directory_options.into_iter().flatten() {
            tracing::info!("Trying database directory: {:?}", app_dir);

            // Test if we can create and write to this directory
            if (Self::ensure_database_directory(&app_dir).await).is_ok() {
                let db_path = app_dir.join("stratosort.db");
                tracing::info!("Database path resolved to: {:?}", db_path);
                return Ok(db_path);
            }
        }

        // If all else fails, use in-memory database (warning: data will be lost on restart)
        tracing::error!(
            "All database directory options failed, falling back to in-memory database"
        );
        Err(AppError::DatabaseError {
            message: "Failed to find suitable database directory. All locations are inaccessible."
                .to_string(),
        })
    }

    async fn ensure_database_directory(dir: &std::path::Path) -> Result<()> {
        // Create directory if it doesn't exist
        if !dir.exists() {
            tokio::fs::create_dir_all(dir)
                .await
                .map_err(|e| AppError::DatabaseError {
                    message: format!("Failed to create directory '{}': {}", dir.display(), e),
                })?;

            // Set secure permissions on Unix systems (owner only access)
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if let Ok(metadata) = tokio::fs::metadata(dir).await {
                    let mut perms = metadata.permissions();
                    perms.set_mode(0o700); // Owner: read+write+execute, Group/Other: no access
                    if let Err(e) = tokio::fs::set_permissions(dir, perms).await {
                        tracing::warn!(
                            "Failed to set secure permissions on database directory '{}': {}",
                            dir.display(),
                            e
                        );
                    } else {
                        tracing::debug!(
                            "Set secure permissions (700) on database directory: {}",
                            dir.display()
                        );
                    }
                }
            }
        }

        // Test write permissions
        let test_file = dir.join(".write_test");
        tokio::fs::write(&test_file, "test")
            .await
            .map_err(|e| AppError::DatabaseError {
                message: format!("Directory '{}' is not writable: {}", dir.display(), e),
            })?;

        // Clean up test file
        let _ = tokio::fs::remove_file(&test_file).await;

        Ok(())
    }

    fn get_fallback_database_paths() -> Vec<PathBuf> {
        vec![
            std::env::current_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."))
                .join("data"),
            std::path::PathBuf::from("./stratosort_data"),
            std::env::temp_dir().join("stratosort"),
        ]
    }

    async fn try_fallback_database(path: &Path) -> Result<PathBuf> {
        Self::ensure_database_directory(path).await?;
        Ok(path.join("stratosort.db"))
    }

    async fn create_database_connection_with_retry(db_path: &PathBuf) -> Result<SqlitePool> {
        let database_url = format!("sqlite:{}?mode=rwc", db_path.to_string_lossy());

        let mut retry_count = 0;
        let max_retries = 5;

        loop {
            // Create connection options with progressive timeout increases
            let timeout_seconds = 5 + (retry_count * 2);
            let connection_options = database_url
                .parse::<sqlx::sqlite::SqliteConnectOptions>()
                .map_err(|e| AppError::DatabaseError {
                    message: format!("Invalid database URL: {}", e),
                })?
                .create_if_missing(true)
                .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
                .synchronous(sqlx::sqlite::SqliteSynchronous::Normal)
                .busy_timeout(Duration::from_secs(timeout_seconds))
                // Enhanced performance PRAGMAs for optimal throughput
                .pragma("cache_size", "-64000") // 64MB cache for better performance
                .pragma("temp_store", "memory") // Store temp tables in memory
                .pragma("mmap_size", "268435456") // 256MB memory mapping for large files
                .pragma("journal_size_limit", "67108864") // 64MB journal limit
                .pragma("wal_autocheckpoint", "1000") // Checkpoint every 1000 WAL pages
                .pragma("synchronous", "NORMAL") // Balance durability vs performance
                .pragma("foreign_keys", "ON") // Enable foreign key constraints
                .pragma("case_sensitive_like", "OFF") // Case-insensitive LIKE for better UX
                .pragma("automatic_index", "ON") // Allow SQLite to create automatic indexes
                .pragma("optimize", ""); // Run SQLite optimization after connection

            // CRITICAL: Set connection pool limits for optimal performance
            let pool_options = sqlx::sqlite::SqlitePoolOptions::new()
                .max_connections(5) // Reduced from 10 for better resource management
                .min_connections(1) // Keep at least one connection warm
                .acquire_timeout(Duration::from_secs(10)) // Faster timeout for responsiveness
                .idle_timeout(Duration::from_secs(300)) // 5 minutes instead of 10
                .max_lifetime(Duration::from_secs(3600)); // Recycle connections after 1 hour

            match pool_options.connect_with(connection_options).await {
                Ok(pool) => {
                    tracing::info!(
                        "Database connection established successfully on attempt {}",
                        retry_count + 1
                    );
                    return Ok(pool);
                }
                Err(e) => {
                    retry_count += 1;
                    if retry_count >= max_retries {
                        tracing::error!(
                            "Database connection failed after {} attempts: {}",
                            max_retries,
                            e
                        );
                        return Err(AppError::DatabaseError {
                            message: format!(
                                "Failed to connect to database at {:?} after {} attempts: {}",
                                db_path, max_retries, e
                            ),
                        });
                    }

                    tracing::warn!(
                        "Database connection attempt {} failed, retrying in {}ms: {}",
                        retry_count,
                        500 * retry_count,
                        e
                    );
                    tokio::time::sleep(Duration::from_millis(500 * retry_count)).await;
                }
            }
        }
    }

    async fn verify_database_connection(pool: &SqlitePool) -> Result<()> {
        let mut attempts = 0;
        let max_attempts = 3;

        loop {
            match sqlx::query("SELECT 1").fetch_one(pool).await {
                Ok(_) => {
                    tracing::info!("Database connection verified successfully");
                    return Ok(());
                }
                Err(e) => {
                    attempts += 1;
                    if attempts >= max_attempts {
                        tracing::error!(
                            "Database connection verification failed after {} attempts: {}",
                            max_attempts,
                            e
                        );
                        return Err(AppError::DatabaseError {
                            message: format!("Database connection verification failed after {} attempts: {}. Database may be corrupted.", max_attempts, e),
                        });
                    }
                    tracing::warn!(
                        "Database verification attempt {} failed, retrying: {}",
                        attempts,
                        e
                    );
                    tokio::time::sleep(Duration::from_millis(100 * attempts as u64)).await;
                }
            }
        }
    }

    async fn initialize_vector_extension_safely(pool: &SqlitePool, config: &Config) -> VectorExtension {
        // Non-blocking vector extension initialization
        match tokio::time::timeout(Duration::from_secs(10), VectorExtension::initialize(pool, config)).await
        {
            Ok(vector_ext) => {
                tracing::info!("Vector extension initialized successfully");
                vector_ext
            }
            Err(_) => {
                tracing::warn!("Vector extension initialization timed out, using fallback");
                VectorExtension::fallback(config)
            }
        }
    }

    async fn check_integrity_with_recovery(&self) -> Result<()> {
        match self.check_integrity().await {
            Ok(_) => Ok(()),
            Err(e) => {
                tracing::warn!("Integrity check failed: {}, attempting recovery", e);
                self.attempt_database_recovery().await
            }
        }
    }

    async fn attempt_database_recovery(&self) -> Result<()> {
        tracing::info!("Attempting database recovery");

        // Try basic recovery steps
        let recovery_steps = [
            "PRAGMA integrity_check",
            "PRAGMA quick_check",
            "PRAGMA wal_checkpoint(RESTART)",
            "VACUUM",
        ];

        for step in &recovery_steps {
            match sqlx::query(step).execute(&self.pool).await {
                Ok(_) => tracing::info!("Recovery step '{}' succeeded", step),
                Err(e) => tracing::warn!("Recovery step '{}' failed: {}", step, e),
            }
        }

        // Final verification
        match sqlx::query("SELECT 1").fetch_one(&self.pool).await {
            Ok(_) => {
                tracing::info!("Database recovery successful");
                Ok(())
            }
            Err(e) => {
                tracing::error!("Database recovery failed: {}", e);
                Err(AppError::DatabaseError {
                    message: format!("Database recovery failed: {}", e),
                })
            }
        }
    }

    async fn run_migrations_atomically(&self) -> Result<()> {
        // Enhanced migration with better error handling and atomicity
        self.run_migrations().await
    }

    /// Run database migrations to keep schema up to date
    pub async fn run_migrations(&self) -> Result<()> {
        // Create schema_version and migration_state tables if they don't exist
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER PRIMARY KEY,
                applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS migration_state (
                version INTEGER,
                status TEXT, -- 'in_progress', 'completed', 'failed'
                started_at DATETIME,
                completed_at DATETIME,
                error_message TEXT
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Get current schema version
        let current_version = self.get_schema_version().await?;
        info!("Current database schema version: {}", current_version);

        if current_version == 0 {
            // Initial schema creation with transaction
            info!("Creating initial database schema");
            let mut tx = self.pool.begin().await?;

            match self.initialize_schema_in_transaction(&mut tx).await {
                Ok(_) => {
                    sqlx::query("INSERT INTO schema_version (version) VALUES (?)")
                        .bind(1)
                        .execute(&mut *tx)
                        .await?;
                    tx.commit().await?;
                    info!("Initial schema created successfully");

                    // Create vector table after transaction commits (requires pool)
                    if self.vector_ext.is_available {
                        if let Err(e) = self
                            .vector_ext
                            .create_vector_table(
                                &self.pool,
                                "vec_embeddings",
                                self.vector_ext.get_dimensions(),
                            )
                            .await
                        {
                            warn!(
                                "Failed to create vector table: {}. Will use fallback storage.",
                                e
                            );
                        }
                    }
                }
                Err(e) => {
                    tx.rollback().await?;
                    return Err(AppError::DatabaseError {
                        message: format!("Failed to create initial schema: {}", e),
                    });
                }
            }
        }

        // Run incremental migrations with atomic transactions and state tracking
        if current_version < 2 {
            info!("Running migration to version 2");
            if self.is_migration_in_progress(2).await? {
                warn!("Migration to version 2 is already in progress, skipping");
                return Ok(());
            }

            self.start_migration(2).await?;

            let mut tx = self.pool.begin().await?;

            match self.migrate_to_v2_in_transaction(&mut tx).await {
                Ok(_) => {
                    sqlx::query("INSERT INTO schema_version (version) VALUES (?)")
                        .bind(2)
                        .execute(&mut *tx)
                        .await?;
                    tx.commit().await?;
                    self.complete_migration(2).await?;
                    info!("Migration to v2 completed successfully");
                }
                Err(e) => {
                    if tx.rollback().await.is_ok() {
                        self.fail_migration(2, &e.to_string()).await?;
                    }
                    return Err(e);
                }
            }
        }

        // Future migrations go here
        if current_version < 3 {
            info!("Running migration to version 3 - Enhanced operations support");
            if self.is_migration_in_progress(3).await? {
                warn!("Migration to version 3 is already in progress, skipping");
                return Ok(());
            }

            self.start_migration(3).await?;

            let mut tx = self.pool.begin().await?;

            match self.migrate_to_v3_in_transaction(&mut tx).await {
                Ok(_) => {
                    sqlx::query("INSERT INTO schema_version (version) VALUES (?)")
                        .bind(3)
                        .execute(&mut *tx)
                        .await?;
                    tx.commit().await?;
                    self.complete_migration(3).await?;
                    info!("Migration to v3 completed successfully");
                }
                Err(e) => {
                    if tx.rollback().await.is_ok() {
                        self.fail_migration(3, &e.to_string()).await?;
                    }
                    return Err(e);
                }
            }
        }

        info!("Database migrations completed successfully");

        // Validate that all migrations completed successfully
        self.validate_migration_state().await?;

        Ok(())
    }

    /// Validate migration state and attempt recovery from failed migrations
    async fn validate_migration_state(&self) -> Result<()> {
        // Check for any failed migrations
        let failed_migrations: Vec<i32> = sqlx::query_scalar(
            "SELECT version FROM migration_state WHERE status = 'failed' ORDER BY version"
        )
        .fetch_all(&self.pool)
        .await?;

        if !failed_migrations.is_empty() {
            warn!("Found failed migrations: {:?}", failed_migrations);

            // Attempt to recover from failed migrations
            for version in failed_migrations {
                if let Err(e) = self.recover_from_failed_migration(version).await {
                    error!("Failed to recover from migration {}: {}", version, e);
                    return Err(AppError::DatabaseError {
                        message: format!("Failed migration recovery for version {}: {}", version, e),
                    });
                }
            }
        }

        // Validate that schema version matches migration state
        let schema_version = self.get_schema_version().await?;
        let completed_migrations: Vec<i32> = sqlx::query_scalar(
            "SELECT version FROM migration_state WHERE status = 'completed' ORDER BY version"
        )
        .fetch_all(&self.pool)
        .await?;

        // Check that schema version matches the highest completed migration (not the count)
        if let Some(&max_completed_version) = completed_migrations.last() {
            if schema_version != max_completed_version {
                return Err(AppError::DatabaseError {
                    message: format!(
                        "Schema version mismatch: schema={}, max_completed_migration={}",
                        schema_version,
                        max_completed_version
                    ),
                });
            }
        } else if schema_version != 0 {
            // No completed migrations but schema version is set
            warn!("Schema version {} but no completed migrations recorded", schema_version);
        }

        Ok(())
    }

    /// Attempt to recover from a failed migration
    async fn recover_from_failed_migration(&self, version: i32) -> Result<()> {
        info!("Attempting recovery from failed migration version {}", version);

        // Check if we can retry the migration
        if self.get_migration_status(version).await? == Some("failed".to_string()) {
            // Try to rollback and retry
            self.rollback_migration(version).await?;

            // Re-run the specific migration instead of all migrations to avoid recursion
            match version {
                2 => {
                    let mut tx = self.pool.begin().await?;
                    self.migrate_to_v2_in_transaction(&mut tx).await?;
                    tx.commit().await?;
                    self.complete_migration(2).await?;
                }
                3 => {
                    let mut tx = self.pool.begin().await?;
                    self.migrate_to_v3_in_transaction(&mut tx).await?;
                    tx.commit().await?;
                    self.complete_migration(3).await?;
                }
                _ => return Err(AppError::InvalidOperation {
                    message: format!("Cannot recover migration version {}", version),
                }),
            }

            info!("Successfully recovered from failed migration version {}", version);
        }

        Ok(())
    }

    async fn get_schema_version(&self) -> Result<i32> {
        let result = sqlx::query("SELECT MAX(version) as version FROM schema_version")
            .fetch_optional(&self.pool)
            .await?;

        match result {
            Some(row) => {
                let version: Option<i32> = row.get("version");
                Ok(version.unwrap_or(0))
            }
            None => Ok(0),
        }
    }

    /// Initialize schema within a transaction for atomicity
    async fn initialize_schema_in_transaction(
        &self,
        tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    ) -> Result<()> {
        // Create tables within transaction
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS file_analysis (
                path TEXT PRIMARY KEY,
                category TEXT NOT NULL,
                tags TEXT NOT NULL,
                summary TEXT NOT NULL,
                confidence REAL NOT NULL,
                extracted_text TEXT,
                detected_language TEXT,
                metadata TEXT,
                analyzed_at INTEGER NOT NULL,
                embedding BLOB
            )
            "#,
        )
        .execute(&mut **tx)
        .await?;

        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS smart_folders (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                path TEXT NOT NULL,
                rules TEXT NOT NULL,
                icon TEXT,
                color TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
            "#,
        )
        .execute(&mut **tx)
        .await?;

        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS operations_history (
                id TEXT PRIMARY KEY,
                operation_type TEXT NOT NULL,
                source TEXT NOT NULL,
                destination TEXT,
                timestamp INTEGER NOT NULL,
                metadata TEXT
            )
            "#,
        )
        .execute(&mut **tx)
        .await?;

        // Create indexes within transaction
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_analysis_category ON file_analysis(category)")
            .execute(&mut **tx)
            .await?;
        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_analysis_analyzed_at ON file_analysis(analyzed_at)",
        )
        .execute(&mut **tx)
        .await?;
        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_operations_timestamp ON operations_history(timestamp)",
        )
        .execute(&mut **tx)
        .await?;

        // Note: Vector table creation will be done after transaction commits
        // as it requires the pool, not a transaction

        Ok(())
    }

    /// Migrate to version 2 within a transaction
    async fn migrate_to_v2_in_transaction(
        &self,
        _tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    ) -> Result<()> {
        // V2 migration logic here
        // This is a placeholder for future v2 changes
        Ok(())
    }

    /// Migrate to version 3 within a transaction
    async fn migrate_to_v3_in_transaction(
        &self,
        tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    ) -> Result<()> {
        info!("Starting migration to v3 - Enhanced operations support");

        // Enhanced smart folders table with new fields
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS smart_folders_v3 (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                rules TEXT NOT NULL,
                target_path TEXT NOT NULL,
                enabled BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        )
        .execute(&mut **tx)
        .await?;

        // Enhanced embeddings table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS embeddings_v3 (
                path TEXT PRIMARY KEY,
                embedding BLOB NOT NULL,
                model_name TEXT DEFAULT 'unknown',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        )
        .execute(&mut **tx)
        .await?;

        // Operation history with enhanced metadata
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS operations_history_v3 (
                id TEXT PRIMARY KEY,
                operation_type TEXT NOT NULL,
                source_paths TEXT NOT NULL,
                target_paths TEXT,
                backup_data BLOB,
                metadata TEXT,
                can_undo BOOLEAN DEFAULT 1,
                can_redo BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        )
        .execute(&mut **tx)
        .await?;

        // Notifications table for user feedback
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS notifications (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                metadata TEXT,
                read BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        )
        .execute(&mut **tx)
        .await?;

        // Search history table for tracking search queries
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS search_history (
                id TEXT PRIMARY KEY,
                query TEXT NOT NULL,
                search_type TEXT NOT NULL,
                result_count INTEGER DEFAULT 0,
                timestamp INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        )
        .execute(&mut **tx)
        .await?;

        // Create indexes for v3 tables
        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_smart_folders_enabled ON smart_folders_v3(enabled)",
        )
        .execute(&mut **tx)
        .await?;
        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_embeddings_created ON embeddings_v3(created_at)",
        )
        .execute(&mut **tx)
        .await?;
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_operations_created ON operations_history_v3(created_at)")
            .execute(&mut **tx)
            .await?;
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read)")
            .execute(&mut **tx)
            .await?;
        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_search_history_timestamp ON search_history(timestamp)",
        )
        .execute(&mut **tx)
        .await?;
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_search_history_query ON search_history(query)")
            .execute(&mut **tx)
            .await?;

        info!("Migration to v3 completed");
        Ok(())
    }


    /// Rollback database to a specific version
    pub async fn rollback_to_version(&self, target_version: i32) -> Result<()> {
        let current = self.get_schema_version().await?;

        if target_version >= current {
            return Err(AppError::InvalidOperation {
                message: format!(
                    "Cannot rollback to version {} (current: {})",
                    target_version, current
                ),
            });
        }

        info!(
            "Rolling back database from version {} to {}",
            current, target_version
        );

        // Rollback each version in reverse order
        for version in (target_version + 1..=current).rev() {
            self.rollback_migration(version).await?;
        }

        // Update schema version
        self.set_schema_version(target_version).await?;

        info!("Database rollback completed successfully");
        Ok(())
    }

    /// Start a migration and mark it as in progress
    async fn start_migration(&self, version: i32) -> Result<()> {
        sqlx::query(
            r#"
            INSERT OR REPLACE INTO migration_state (version, status, started_at)
            VALUES (?, 'in_progress', CURRENT_TIMESTAMP)
            "#,
        )
        .bind(version)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Complete a migration successfully
    async fn complete_migration(&self, version: i32) -> Result<()> {
        sqlx::query(
            r#"
            UPDATE migration_state
            SET status = 'completed', completed_at = CURRENT_TIMESTAMP
            WHERE version = ?
            "#,
        )
        .bind(version)
        .execute(&self.pool)
        .await?;

        // Update schema version
        sqlx::query(
            r#"
            INSERT OR REPLACE INTO schema_version (version, applied_at)
            VALUES (?, CURRENT_TIMESTAMP)
            "#,
        )
        .bind(version)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Mark a migration as failed
    async fn fail_migration(&self, version: i32, error: &str) -> Result<()> {
        sqlx::query(
            r#"
            UPDATE migration_state
            SET status = 'failed', completed_at = CURRENT_TIMESTAMP, error_message = ?
            WHERE version = ?
            "#,
        )
        .bind(error)
        .bind(version)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Check if a migration is currently in progress
    async fn is_migration_in_progress(&self, version: i32) -> Result<bool> {
        let status: Option<String> = sqlx::query_scalar(
            "SELECT status FROM migration_state WHERE version = ?",
        )
        .bind(version)
        .fetch_optional(&self.pool)
        .await?;

        Ok(status.as_deref() == Some("in_progress"))
    }

    /// Get the status of a specific migration
    async fn get_migration_status(&self, version: i32) -> Result<Option<String>> {
        let status: Option<String> = sqlx::query_scalar(
            "SELECT status FROM migration_state WHERE version = ?",
        )
        .bind(version)
        .fetch_optional(&self.pool)
        .await?;

        Ok(status)
    }

    /// Rollback a specific migration version
    async fn rollback_migration(&self, version: i32) -> Result<()> {
        info!("Rolling back migration version {}", version);

        match version {
            2 => self.rollback_migration_002().await?,
            3 => self.rollback_migration_003().await?,
            _ => {
                return Err(AppError::InvalidOperation {
                    message: format!("No rollback method for version {}", version),
                });
            }
        }

        Ok(())
    }

    /// Rollback migration to version 2
    async fn rollback_migration_002(&self) -> Result<()> {
        info!("Rolling back migration to v2");

        // Drop any v2-specific tables or columns
        // This is a placeholder - actual rollback depends on what v2 added

        info!("Migration v2 rollback completed");
        Ok(())
    }

    /// Rollback migration to version 3
    async fn rollback_migration_003(&self) -> Result<()> {
        info!("Rolling back migration to v3");

        // Drop v3-specific tables and recreate v2 versions
        sqlx::query("DROP TABLE IF EXISTS smart_folders_v3")
            .execute(&self.pool)
            .await?;

        sqlx::query("DROP TABLE IF EXISTS embeddings_v3")
            .execute(&self.pool)
            .await?;

        sqlx::query("DROP TABLE IF EXISTS operations_history_v3")
            .execute(&self.pool)
            .await?;

        // Recreate the v2 version of the tables if needed
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS smart_folders (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                rules TEXT NOT NULL,
                target_path TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        info!("Migration v3 rollback completed");
        Ok(())
    }

    /// Set schema version
    async fn set_schema_version(&self, version: i32) -> Result<()> {
        sqlx::query("DELETE FROM schema_version")
            .execute(&self.pool)
            .await?;

        sqlx::query("INSERT INTO schema_version (version) VALUES (?)")
            .bind(version)
            .execute(&self.pool)
            .await?;

        Ok(())
    }

    // Smart folder operations
    pub async fn save_smart_folder(
        &self,
        folder: &crate::commands::organization::SmartFolder,
    ) -> Result<()> {
        let query = r#"
            INSERT OR REPLACE INTO smart_folders_v3 
            (id, name, description, rules, target_path, enabled, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        "#;

        let rules_json =
            serde_json::to_string(&folder.rules).map_err(|e| AppError::ParseError {
                message: format!("Failed to serialize rules: {}", e),
            })?;

        sqlx::query(query)
            .bind(&folder.id)
            .bind(&folder.name)
            .bind(&folder.description)
            .bind(&rules_json)
            .bind(&folder.target_path)
            .bind(folder.enabled)
            .bind(folder.created_at)
            .bind(folder.updated_at)
            .execute(&self.pool)
            .await
            .map_err(|e| AppError::DatabaseError {
                message: format!("Failed to save smart folder: {}", e),
            })?;

        Ok(())
    }

    pub async fn get_smart_folder(
        &self,
        id: &str,
    ) -> Result<Option<crate::commands::organization::SmartFolder>> {
        let query = "SELECT * FROM smart_folders_v3 WHERE id = ?";

        let row = sqlx::query(query)
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| AppError::DatabaseError {
                message: format!("Failed to get smart folder: {}", e),
            })?;

        if let Some(row) = row {
            let rules_json: String = row.get("rules");
            let rules = serde_json::from_str(&rules_json).map_err(|e| AppError::ParseError {
                message: format!("Failed to deserialize rules: {}", e),
            })?;

            Ok(Some(crate::commands::organization::SmartFolder {
                id: row.get("id"),
                name: row.get("name"),
                description: row.get("description"),
                rules,
                target_path: row.get("target_path"),
                naming_convention: None,
                ai_guidance: None,
                created_at: row.get("created_at"),
                updated_at: row.get("updated_at"),
                enabled: row.get("enabled"),
            }))
        } else {
            Ok(None)
        }
    }

    pub async fn list_smart_folders(
        &self,
    ) -> Result<Vec<crate::commands::organization::SmartFolder>> {
        let query = "SELECT * FROM smart_folders_v3 ORDER BY name";

        let rows = sqlx::query(query)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| AppError::DatabaseError {
                message: format!("Failed to list smart folders: {}", e),
            })?;

        let mut folders = Vec::new();
        for row in rows {
            let rules_json: String = row.get("rules");
            let rules = serde_json::from_str(&rules_json).map_err(|e| AppError::ParseError {
                message: format!("Failed to deserialize rules: {}", e),
            })?;

            folders.push(crate::commands::organization::SmartFolder {
                id: row.get("id"),
                name: row.get("name"),
                description: row.get("description"),
                rules,
                target_path: row.get("target_path"),
                naming_convention: None,
                ai_guidance: None,
                created_at: row.get("created_at"),
                updated_at: row.get("updated_at"),
                enabled: row.get("enabled"),
            });
        }

        Ok(folders)
    }

    pub async fn delete_smart_folder(&self, id: &str) -> Result<()> {
        let query = "DELETE FROM smart_folders_v3 WHERE id = ?";

        sqlx::query(query)
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| AppError::DatabaseError {
                message: format!("Failed to delete smart folder: {}", e),
            })?;

        Ok(())
    }

    pub async fn health_check(&self) -> Result<()> {
        sqlx::query("SELECT 1")
            .fetch_one(&self.pool)
            .await
            .map_err(|e| AppError::DatabaseError {
                message: format!("Database health check failed: {}", e),
            })?;
        Ok(())
    }

    pub async fn clear_cache(&self) -> Result<()> {
        let queries = [
            "DELETE FROM file_analysis WHERE created_at < datetime('now', '-7 days')",
            "DELETE FROM embeddings_v3 WHERE created_at < datetime('now', '-7 days')",
            "VACUUM", // Reclaim space
        ];

        for query in &queries {
            sqlx::query(query)
                .execute(&self.pool)
                .await
                .map_err(|e| AppError::DatabaseError {
                    message: format!("Failed to clear cache: {}", e),
                })?;
        }

        Ok(())
    }

    /// Create database from URL (useful for testing and custom setups)
    pub async fn new_from_url(url: &str) -> Result<Self> {
        use sqlx::sqlite::SqliteConnectOptions;
        use std::str::FromStr;

        let options = SqliteConnectOptions::from_str(url)
            .map_err(|e| AppError::DatabaseError {
                message: format!("Invalid database URL: {}", e),
            })?
            .create_if_missing(true)
            .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
            .synchronous(sqlx::sqlite::SqliteSynchronous::Normal)
            .busy_timeout(Duration::from_secs(5));

        let pool =
            SqlitePool::connect_with(options)
                .await
                .map_err(|e| AppError::DatabaseError {
                    message: format!("Failed to connect to database: {}", e),
                })?;

        // Initialize vector extension with default config
        let default_config = Config::default();
        let vector_ext = Arc::new(VectorExtension::initialize(&pool, &default_config).await);

        let db = Self { pool, vector_ext };

        // Check integrity and run migrations
        db.check_integrity().await?;
        db.run_migrations().await?;

        info!("Database initialized from URL successfully");
        Ok(db)
    }

    /// Get vector extension statistics
    pub async fn get_vector_stats(&self) -> Result<VectorStats> {
        self.vector_ext
            .get_vector_stats(&self.pool, "vec_embeddings")
            .await
    }

    /// Check if vector extension is available
    pub fn is_vector_extension_available(&self) -> bool {
        self.vector_ext.is_available
    }

    /// Get vector extension version
    pub fn get_vector_extension_version(&self) -> Option<String> {
        self.vector_ext.version.clone()
    }

    /// Perform vector table maintenance
    pub async fn maintain_vector_table(&self) -> Result<()> {
        if self.vector_ext.is_available {
            self.vector_ext
                .vacuum_vector_table(&self.pool, "vec_embeddings")
                .await?;
        }
        Ok(())
    }

    // Notification-related methods
    pub async fn save_notification(
        &self,
        notification: &crate::commands::notifications::Notification,
    ) -> Result<()> {
        let query = r#"
            INSERT OR REPLACE INTO notifications 
            (id, notification_type, title, message, timestamp, read, actions, metadata) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        "#;

        let notification_type = match notification.notification_type {
            crate::commands::notifications::NotificationType::Success => "success",
            crate::commands::notifications::NotificationType::Info => "info",
            crate::commands::notifications::NotificationType::Warning => "warning",
            crate::commands::notifications::NotificationType::Error => "error",
            crate::commands::notifications::NotificationType::Progress => "progress",
        };

        let actions_json =
            serde_json::to_string(&notification.actions).map_err(|e| AppError::ParseError {
                message: format!("Failed to serialize notification actions: {}", e),
            })?;

        let metadata_json = notification
            .metadata
            .as_ref()
            .map(serde_json::to_string)
            .transpose()
            .map_err(|e| AppError::ParseError {
                message: format!("Failed to serialize notification metadata: {}", e),
            })?;

        sqlx::query(query)
            .bind(&notification.id)
            .bind(notification_type)
            .bind(&notification.title)
            .bind(&notification.message)
            .bind(notification.timestamp)
            .bind(notification.read)
            .bind(&actions_json)
            .bind(&metadata_json)
            .execute(&self.pool)
            .await
            .map_err(|e| AppError::DatabaseError {
                message: format!("Failed to save notification: {}", e),
            })?;

        Ok(())
    }

    pub async fn get_notifications(
        &self,
        limit: usize,
        unread_only: bool,
    ) -> Result<Vec<crate::commands::notifications::Notification>> {
        let query = if unread_only {
            "SELECT * FROM notifications WHERE read = 0 ORDER BY timestamp DESC LIMIT ?"
        } else {
            "SELECT * FROM notifications ORDER BY timestamp DESC LIMIT ?"
        };

        let rows = sqlx::query(query)
            .bind(limit as i64)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| AppError::DatabaseError {
                message: format!("Failed to get notifications: {}", e),
            })?;

        let mut notifications = Vec::new();
        for row in rows {
            let notification_type_str: String = row.get("notification_type");
            let notification_type = match notification_type_str.as_str() {
                "success" => crate::commands::notifications::NotificationType::Success,
                "info" => crate::commands::notifications::NotificationType::Info,
                "warning" => crate::commands::notifications::NotificationType::Warning,
                "error" => crate::commands::notifications::NotificationType::Error,
                "progress" => crate::commands::notifications::NotificationType::Progress,
                _ => crate::commands::notifications::NotificationType::Info,
            };

            let actions_json: String = row.get("actions");
            let actions =
                serde_json::from_str(&actions_json).map_err(|e| AppError::ParseError {
                    message: format!("Failed to deserialize notification actions: {}", e),
                })?;

            let metadata_json: Option<String> = row.get("metadata");
            let metadata = metadata_json
                .map(|json| serde_json::from_str(&json))
                .transpose()
                .map_err(|e| AppError::ParseError {
                    message: format!("Failed to deserialize notification metadata: {}", e),
                })?;

            notifications.push(crate::commands::notifications::Notification {
                id: row.get("id"),
                notification_type,
                title: row.get("title"),
                message: row.get("message"),
                timestamp: row.get("timestamp"),
                read: row.get("read"),
                actions,
                metadata,
            });
        }

        Ok(notifications)
    }

    pub async fn mark_notification_read(&self, notification_id: &str) -> Result<()> {
        let query = "UPDATE notifications SET read = 1 WHERE id = ?";

        sqlx::query(query)
            .bind(notification_id)
            .execute(&self.pool)
            .await
            .map_err(|e| AppError::DatabaseError {
                message: format!("Failed to mark notification as read: {}", e),
            })?;

        Ok(())
    }

    pub async fn clear_old_notifications(&self, cutoff_timestamp: i64) -> Result<usize> {
        let query = "DELETE FROM notifications WHERE timestamp < ?";

        let result = sqlx::query(query)
            .bind(cutoff_timestamp)
            .execute(&self.pool)
            .await
            .map_err(|e| AppError::DatabaseError {
                message: format!("Failed to clear old notifications: {}", e),
            })?;

        Ok(result.rows_affected() as usize)
    }

    /// Clear all data from the database (for testing or reset)
    pub async fn clear_all_data(&self) -> Result<()> {
        tracing::warn!("Clearing all data from database");

        // Delete from all tables in correct order (respecting foreign key constraints)
        // First delete from tables with foreign key references
        sqlx::query("DELETE FROM embeddings_v3")
            .execute(&self.pool)
            .await
            .ok(); // Ignore if table doesn't exist

        sqlx::query("DELETE FROM operations_history_v3")
            .execute(&self.pool)
            .await
            .ok();

        sqlx::query("DELETE FROM operations_history")
            .execute(&self.pool)
            .await
            .ok();

        sqlx::query("DELETE FROM notifications")
            .execute(&self.pool)
            .await
            .ok();

        sqlx::query("DELETE FROM smart_folders_v3")
            .execute(&self.pool)
            .await
            .ok();

        sqlx::query("DELETE FROM smart_folders")
            .execute(&self.pool)
            .await
            .ok();

        sqlx::query("DELETE FROM file_analysis")
            .execute(&self.pool)
            .await
            .ok();

        tracing::info!("All data cleared from database");
        Ok(())
    }

    /// Close database connections gracefully
    pub async fn close_connections(&self) -> Result<()> {
        tracing::info!("Closing database connections");
        self.pool.close().await;
        tracing::info!("Database connections closed");
        Ok(())
    }

    /// Search files by filename (quick search)
    pub async fn search_by_filename(&self, query: &str, limit: usize) -> Result<Vec<String>> {
        let search_pattern = format!("%{}%", query.to_lowercase());

        let rows = sqlx::query(
            r#"
            SELECT path FROM file_analysis
            WHERE LOWER(path) LIKE ? COLLATE NOCASE
            ORDER BY 
                CASE 
                    WHEN LOWER(path) = LOWER(?) THEN 0
                    WHEN LOWER(path) LIKE LOWER(?) THEN 1
                    ELSE 2
                END,
                analyzed_at DESC
            LIMIT ?
            "#,
        )
        .bind(&search_pattern)
        .bind(query)
        .bind(format!("{}%", query.to_lowercase())) // Start with query
        .bind(limit as i32)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.iter().map(|row| row.get("path")).collect())
    }

    /// Save search history entry
    pub async fn save_search_history(
        &self,
        entry: &crate::commands::ai::SearchHistoryEntry,
    ) -> Result<()> {
        sqlx::query(
            r#"
            INSERT OR REPLACE INTO search_history 
            (id, query, search_type, result_count, timestamp) 
            VALUES (?, ?, ?, ?, ?)
            "#,
        )
        .bind(&entry.id)
        .bind(&entry.query)
        .bind(&entry.search_type)
        .bind(entry.result_count as i64)
        .bind(entry.timestamp)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Get search history
    pub async fn get_search_history(
        &self,
        limit: usize,
    ) -> Result<Vec<crate::commands::ai::SearchHistoryEntry>> {
        let rows = sqlx::query(
            r#"
            SELECT id, query, search_type, result_count, timestamp 
            FROM search_history 
            ORDER BY timestamp DESC 
            LIMIT ?
            "#,
        )
        .bind(limit as i64)
        .fetch_all(&self.pool)
        .await?;

        let mut entries = Vec::new();
        for row in rows {
            entries.push(crate::commands::ai::SearchHistoryEntry {
                id: row.get("id"),
                query: row.get("query"),
                search_type: row.get("search_type"),
                result_count: row.get::<i64, _>("result_count") as usize,
                timestamp: row.get("timestamp"),
            });
        }

        Ok(entries)
    }

    /// Clear search history older than timestamp
    pub async fn clear_search_history(&self, cutoff_timestamp: i64) -> Result<usize> {
        let result = sqlx::query("DELETE FROM search_history WHERE timestamp < ?")
            .bind(cutoff_timestamp)
            .execute(&self.pool)
            .await?;

        Ok(result.rows_affected() as usize)
    }

    /// Execute multiple operations in a single transaction for better performance
    /// This method is currently not used but kept for future batch operation support
    #[allow(dead_code)]
    pub async fn with_transaction<F, T>(&self, operation: F) -> Result<T>
    where
        F: FnOnce(sqlx::Transaction<'_, sqlx::Sqlite>) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(T, sqlx::Transaction<'_, sqlx::Sqlite>)>> + Send + '_>>,
    {
        let tx = self.pool.begin().await?;
        let (result, tx) = operation(tx).await?;
        tx.commit().await?;
        Ok(result)
    }

    /// Execute batch file analysis storage for improved performance
    pub async fn batch_save_analyses(&self, analyses: Vec<FileAnalysis>) -> Result<()> {
        if analyses.is_empty() {
            return Ok(());
        }

        let mut tx = self.pool.begin().await?;

        for analysis in analyses {
            let tags_json = serde_json::to_string(&analysis.tags)?;
            let analyzed_at = chrono::Utc::now().timestamp();

            sqlx::query(
                r#"
                INSERT OR REPLACE INTO file_analysis
                (path, category, tags, summary, confidence, extracted_text, detected_language, analyzed_at, embedding)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                "#,
            )
            .bind(&analysis.path)
            .bind(&analysis.category)
            .bind(&tags_json)
            .bind(&analysis.summary)
            .bind(analysis.confidence)
            .bind(&analysis.extracted_text)
            .bind(&analysis.detected_language)
            .bind(analyzed_at)
            .bind(None::<&[u8]>) // NULL for embedding initially
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(())
    }
}

impl Clone for Database {
    fn clone(&self) -> Self {
        Self {
            pool: self.pool.clone(),
            vector_ext: Arc::clone(&self.vector_ext),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Operation {
    pub id: String,
    pub operation_type: String,
    pub source: String,
    pub destination: Option<String>,
    pub timestamp: i64,
    pub metadata: Option<serde_json::Value>,
}

/// Calculate cosine similarity between two vectors
fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() {
        return 0.0;
    }

    let dot_product: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let magnitude_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let magnitude_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();

    if magnitude_a == 0.0 || magnitude_b == 0.0 {
        return 0.0;
    }

    dot_product / (magnitude_a * magnitude_b)
}
