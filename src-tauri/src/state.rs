use crate::{
    ai::AiService,
    automation::StratoSortOrchestrator,
    config::Config,
    core::{
        DuplicateDetectorManager, FileAnalyzer, OcrProcessorManager, Organizer,
        ProtectedFolderManager, QuarantineManager, SmartFolderManager, UndoRedoManager,
    },
    error::Result,
    services::FileWatcher,
    storage::Database,
};
use dashmap::DashMap;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

/// Memory pressure threshold (80% of cache capacity)
const CACHE_PRESSURE_THRESHOLD_PERCENT: usize = 80;

/// Estimated metadata overhead per cache entry (DashMap entry + key string overhead)
const METADATA_OVERHEAD_PER_ENTRY: usize = 128;

/// AI Service status information
#[derive(Debug, Clone, Serialize)]
pub struct AiServiceStatus {
    pub provider: String,
    pub connected: bool,
    pub available_models: Vec<String>,
    pub current_model: String,
    pub capabilities: AiServiceCapabilities,
}

/// AI Service capabilities
#[derive(Debug, Clone, Serialize)]
pub struct AiServiceCapabilities {
    pub text_analysis: bool,
    pub vision_analysis: bool,
    pub embeddings: bool,
    pub semantic_search: bool,
}

/// Main application state
pub struct AppState {
    pub handle: AppHandle,
    pub config: Arc<RwLock<Config>>,
    pub database: Arc<Database>,
    pub ai_service: Arc<AiService>,
    pub file_analyzer: Arc<FileAnalyzer>,
    pub organizer: Arc<Organizer>,
    pub smart_folders: Arc<SmartFolderManager>,
    pub protected_folders: Arc<ProtectedFolderManager>,
    pub duplicate_detector: Arc<DuplicateDetectorManager>,
    pub quarantine_manager: Arc<QuarantineManager>,
    pub ocr_processor: Arc<OcrProcessorManager>,
    pub stratosort_orchestrator: Arc<StratoSortOrchestrator>,
    pub undo_redo: Arc<UndoRedoManager>,
    pub file_cache: Arc<FileCache>,
    pub active_operations: Arc<DashMap<Uuid, OperationStatus>>,
    pub file_watcher: Arc<RwLock<Option<Arc<FileWatcher>>>>,
    pub monitoring_service: Arc<crate::services::MonitoringService>,
    pub analytics: Arc<AnalyticsTracker>,
    pub rate_limiter: Arc<RateLimiter>,
}

impl AppState {
    pub async fn new(handle: AppHandle, config: Config) -> Result<Self> {
        let database = Arc::new(Database::new(&handle, &config).await?);
        let ai_service = Arc::new(AiService::new(&config).await?);
        let config_arc = Arc::new(RwLock::new(config));
        let ocr_processor = Arc::new(OcrProcessorManager::new());
        let file_analyzer = Arc::new(FileAnalyzer::new(
            ai_service.clone(),
            config_arc.clone(),
            ocr_processor.clone(),
        ));
        let smart_folders = Arc::new(SmartFolderManager::new(database.clone()));
        let protected_folders = Arc::new(ProtectedFolderManager::new(database.clone()));
        let duplicate_detector = Arc::new(DuplicateDetectorManager::new(database.clone()));
        let quarantine_manager =
            Arc::new(QuarantineManager::new(database.clone(), config_arc.clone()));
        let stratosort_orchestrator = Arc::new(StratoSortOrchestrator::new());
        let organizer = Arc::new(Organizer::new(smart_folders.clone()));
        let undo_redo = Arc::new(UndoRedoManager::new(database.clone()));
        let file_cache = Arc::new(FileCache::new());
        let monitoring_service = Arc::new(crate::services::MonitoringService::new());
        let analytics = Arc::new(AnalyticsTracker::new());
        let rate_limiter = Arc::new(RateLimiter::new());

        Ok(Self {
            handle,
            config: config_arc,
            database,
            ai_service,
            file_analyzer,
            organizer,
            smart_folders,
            protected_folders,
            duplicate_detector,
            quarantine_manager,
            ocr_processor,
            stratosort_orchestrator,
            undo_redo,
            file_cache,
            active_operations: Arc::new(DashMap::new()),
            file_watcher: Arc::new(RwLock::new(None)),
            monitoring_service,
            analytics,
            rate_limiter,
        })
    }

    /// Updates configuration
    pub async fn update_config(&self, config: Config) -> Result<()> {
        *self.config.write() = config.clone();

        // Reinitialize services that depend on config
        self.ai_service.update_config(&config).await?;

        // Save to disk
        config.save(&self.handle)?;

        Ok(())
    }

    /// Starts a new operation (internal)
    fn start_operation_internal(&self, operation_type: OperationType) -> Uuid {
        let id = Uuid::new_v4();
        let status = OperationStatus {
            id,
            operation_type,
            progress: 0.0,
            message: String::new(),
            cancellation_token: tokio_util::sync::CancellationToken::new(),
            started_at: chrono::Utc::now(),
        };

        self.active_operations.insert(id, status);
        id
    }

    /// Updates operation progress (deprecated - use update_progress instead)
    pub fn update_operation(&self, id: Uuid, progress: f32, message: String) {
        self.update_progress(id, progress, message);
    }

    /// Graceful shutdown of all services
    pub async fn shutdown(&self) -> Result<()> {
        tracing::info!("Starting graceful shutdown of application services");

        // 1. Stop file watcher first to prevent new operations
        let watcher_result = {
            let watcher_guard = self.file_watcher.read();
            watcher_guard.clone()
        };

        if let Some(watcher) = watcher_result {
            if let Err(e) = watcher.stop().await {
                tracing::warn!("Error stopping file watcher: {}", e);
            } else {
                tracing::info!("File watcher stopped successfully");
            }
        }

        // 2. Cancel all active operations
        let active_operations: Vec<Uuid> = self
            .active_operations
            .iter()
            .map(|entry| *entry.key())
            .collect();

        tracing::info!("Cancelling {} active operations", active_operations.len());
        for operation_id in active_operations {
            self.cancel_operation(operation_id);
        }

        // 3. Wait a moment for operations to cancel gracefully
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

        // 4. Force cancel any remaining operations
        let remaining = self.active_operations.len();
        if remaining > 0 {
            tracing::warn!("Force stopping {} remaining operations", remaining);
            self.active_operations.clear();
        }

        // 5. Clear file cache
        {
            let cache_size = self.file_cache.entries.len();
            self.file_cache.entries.clear();
            tracing::info!("Cleared file cache ({} items)", cache_size);
        }

        // 6. Perform final database operations
        if let Err(e) = self.database.close_connections().await {
            tracing::warn!("Error closing database connections: {}", e);
        } else {
            tracing::info!("Database connections closed successfully");
        }

        // 7. Stop monitoring service
        self.monitoring_service.shutdown().await;

        tracing::info!("Graceful shutdown completed");
        Ok(())
    }

    /// Get current resource usage statistics
    pub async fn get_resource_usage(&self) -> ResourceUsage {
        // Use atomic operations to safely get cache statistics
        let (cache_size, cache_memory) = self.file_cache.get_stats().await;

        // Check AI service availability safely
        let ai_service_available = {
            // Simple availability check - AI service is considered available based on its status
            let status = self.ai_service.get_status().await;
            status.ollama_connected || status.provider == crate::ai::AiProvider::Fallback
        };

        ResourceUsage {
            active_operations: self.active_operations.len(),
            cache_items: cache_size,
            cache_memory_bytes: cache_memory,
            database_connected: true, // Database connection is assumed to be stable
            ai_service_available,
        }
    }

    /// Cancels an operation
    pub fn cancel_operation(&self, id: Uuid) -> bool {
        if let Some((_, status)) = self.active_operations.remove(&id) {
            status.cancellation_token.cancel();
            true
        } else {
            false
        }
    }

    /// Completes an operation
    pub fn complete_operation(&self, id: Uuid) {
        // Atomically remove operation and get its data for event emission
        if let Some((_, status)) = self.active_operations.remove(&id) {
            // Create events outside of any locks
            let progress_event = ProgressEvent {
                id: id.to_string(),
                operation_type: status.operation_type.clone(),
                progress: 1.0,
                message: "Operation completed".to_string(),
                completed: true,
            };

            let complete_event = serde_json::json!({
                "operation_id": id.to_string(),
                "operation_type": status.operation_type,
                "message": "Operation completed successfully",
                "timestamp": chrono::Utc::now().timestamp()
            });

            // Emit events using standardized macro
            crate::emit_event!(
                self.handle,
                crate::events::operation::PROGRESS,
                serde_json::json!(progress_event)
            );
            crate::emit_event!(
                self.handle,
                crate::events::operation::COMPLETE,
                complete_event
            );
        }
    }

    /// Cleans up old operations that have exceeded the maximum age
    pub fn cleanup_old_operations(&self, max_age_seconds: i64) {
        let now = chrono::Utc::now().timestamp();
        let initial_count = self.active_operations.len();

        self.active_operations.retain(|_, status| {
            // Keep operations that are still in progress or younger than max age
            // For now, we'll assume operations are in progress if they haven't been explicitly completed/cancelled
            // In a more sophisticated implementation, we'd track operation state more explicitly
            (now - status.started_at.timestamp()) < max_age_seconds
        });

        let removed_count = initial_count - self.active_operations.len();
        if removed_count > 0 {
            tracing::info!(
                "Cleaned up {} stale operations, {} operations remaining",
                removed_count,
                self.active_operations.len()
            );
        }
    }

    /// Fails an operation with an error
    pub fn error_operation(&self, id: Uuid, error_message: String) {
        // Atomically remove operation and get its data for event emission
        if let Some((_, status)) = self.active_operations.remove(&id) {
            // Create events outside of any locks
            let progress_event = ProgressEvent {
                id: id.to_string(),
                operation_type: status.operation_type.clone(),
                progress: 0.0,
                message: format!("Operation failed: {}", error_message),
                completed: true,
            };

            let error_event = serde_json::json!({
                "operation_id": id.to_string(),
                "operation_type": status.operation_type,
                "error": error_message,
                "message": format!("Operation failed: {}", error_message),
                "timestamp": chrono::Utc::now().timestamp()
            });

            // Emit events using standardized macro
            crate::emit_event!(
                self.handle,
                crate::events::operation::PROGRESS,
                serde_json::json!(progress_event)
            );
            crate::emit_event!(self.handle, crate::events::operation::ERROR, error_event);
        }
    }

    /// Updates operation progress and emits event to frontend
    pub fn update_progress(&self, id: Uuid, progress: f32, message: String) {
        // Create the progress event data first to avoid holding locks during emission
        let progress_event = if let Some(mut status) = self.active_operations.get_mut(&id) {
            // Check if operation was cancelled while we were waiting for the lock
            if status.cancellation_token.is_cancelled() {
                // Don't update progress for cancelled operations
                return;
            }

            let clamped_progress = progress.clamp(0.0, 1.0);
            status.progress = clamped_progress;
            status.message = message.clone();

            // Create event data while still holding the lock
            let event = ProgressEvent {
                id: id.to_string(),
                operation_type: status.operation_type.clone(),
                progress: clamped_progress,
                message,
                completed: false,
            };

            // Explicitly drop the lock before event emission
            drop(status);
            Some(event)
        } else {
            None
        };

        // Emit event outside of any locks to prevent deadlocks
        if let Some(event) = progress_event {
            crate::emit_event!(
                self.handle,
                crate::events::operation::PROGRESS,
                serde_json::json!(event)
            );
        }
    }

    /// Starts a new operation and emits initial event
    pub fn start_operation(&self, operation_type: OperationType, message: String) -> Uuid {
        let id = self.start_operation_internal(operation_type.clone());

        let progress_event = ProgressEvent {
            id: id.to_string(),
            operation_type,
            progress: 0.0,
            message,
            completed: false,
        };

        // Emit using standardized macro
        crate::emit_event!(
            self.handle,
            crate::events::operation::PROGRESS,
            serde_json::json!(progress_event)
        );

        id
    }

    /// Cleans up old cache entries
    pub async fn cleanup_cache(&self) -> Result<()> {
        self.file_cache.cleanup_old_entries().await;

        // Perform aggressive cache cleanup if under memory pressure
        if self.is_under_memory_pressure() {
            self.file_cache.aggressive_cleanup().await;
        }

        self.database.vacuum().await?;
        Ok(())
    }

    /// Check if system is under memory pressure
    pub fn is_under_memory_pressure(&self) -> bool {
        let cache_size = self.file_cache.current_size();
        let max_cache_size = self.file_cache.max_size;

        // Consider under pressure if cache exceeds threshold
        cache_size > max_cache_size * CACHE_PRESSURE_THRESHOLD_PERCENT / 100
    }

    /// Force cleanup of memory when under pressure
    pub async fn emergency_memory_cleanup(&self) -> Result<()> {
        tracing::warn!("Performing emergency memory cleanup");

        // Clear file cache
        self.file_cache.clear();

        // Cancel non-critical operations
        let active_ops: Vec<_> = self
            .active_operations
            .iter()
            .map(|entry| *entry.key())
            .collect();
        let mut cancelled_count = 0;

        for op_id in &active_ops {
            if let Some(op) = self.active_operations.get(op_id) {
                // Only cancel file analysis operations, keep critical ones
                if matches!(op.operation_type, crate::state::OperationType::FileAnalysis) {
                    self.cancel_operation(*op_id);
                    cancelled_count += 1;
                }
            }
        }

        // Force garbage collection hint
        tracing::info!(
            "Emergency cleanup completed, {} operations cancelled",
            cancelled_count
        );
        Ok(())
    }

    /// Saves application state
    pub async fn save_state(&self) -> Result<()> {
        // Save configuration
        self.config.read().save(&self.handle)?;

        // Save smart folders
        self.smart_folders.save_all().await?;

        // Flush database
        self.database.flush().await?;

        Ok(())
    }
}

/// File cache for quick access
pub struct FileCache {
    entries: DashMap<String, CachedFile>,
    max_size: usize,
}

impl Default for FileCache {
    fn default() -> Self {
        Self::new()
    }
}

impl FileCache {
    pub fn new() -> Self {
        Self {
            entries: DashMap::new(),
            max_size: 100 * 1024 * 1024, // 100MB
        }
    }

    /// Get cache statistics atomically
    pub async fn get_stats(&self) -> (usize, usize) {
        let cache_size = self.entries.len();
        let cache_memory = self.current_size();
        (cache_size, cache_memory)
    }

    pub fn get(&self, path: &str) -> Option<CachedFile> {
        self.entries.get(path).map(|e| e.clone())
    }

    pub fn insert(&self, path: String, file: CachedFile) {
        // Don't insert if file itself is larger than max cache size
        if file.size > self.max_size {
            tracing::warn!(
                "File {} ({} bytes) is larger than max cache size ({} bytes), skipping cache",
                path,
                file.size,
                self.max_size
            );
            return;
        }

        // Calculate total entry size including metadata overhead
        let entry_overhead = METADATA_OVERHEAD_PER_ENTRY;
        let total_entry_size = file.size + entry_overhead;

        // Don't insert files that are more than 25% of cache size
        if total_entry_size > self.max_size / 4 {
            tracing::debug!(
                "File {} ({} bytes) is too large for efficient caching (> 25% of cache), skipping",
                path,
                total_entry_size
            );
            return;
        }

        // Enforce cache size limits with improved eviction strategy
        self.ensure_cache_space(total_entry_size);

        self.entries.insert(path, file);
    }

    fn ensure_cache_space(&self, required_space: usize) {
        let mut iterations = 0;
        const MAX_EVICTION_ITERATIONS: usize = 100; // Prevent infinite loops

        while self.current_size() + required_space > self.max_size
            && !self.entries.is_empty()
            && iterations < MAX_EVICTION_ITERATIONS
        {
            // Try to evict multiple items at once for efficiency
            let current_size = self.current_size();
            let target_size = self.max_size - required_space;
            let bytes_to_free = current_size.saturating_sub(target_size);

            self.evict_multiple_entries(bytes_to_free);
            iterations += 1;
        }

        if iterations >= MAX_EVICTION_ITERATIONS {
            tracing::warn!("Cache eviction reached maximum iterations, clearing cache");
            self.entries.clear();
        }
    }

    fn evict_multiple_entries(&self, target_bytes: usize) {
        // Collect entries sorted by access time (oldest first)
        let mut entries: Vec<_> = self
            .entries
            .iter()
            .map(|entry| (entry.key().clone(), entry.accessed, entry.size))
            .collect();

        entries.sort_by_key(|(_, accessed, _)| *accessed);

        let mut freed_bytes = 0;
        let mut keys_to_remove = Vec::new();

        for (key, _, size) in entries {
            keys_to_remove.push(key);
            freed_bytes += size;

            if freed_bytes >= target_bytes {
                break;
            }
        }

        // Remove collected keys
        for key in keys_to_remove {
            self.entries.remove(&key);
        }

        tracing::debug!("Evicted {} bytes from cache", freed_bytes);
    }

    pub async fn cleanup_old_entries(&self) {
        let now = chrono::Utc::now();
        let mut to_remove = Vec::new();

        for entry in self.entries.iter() {
            if now.signed_duration_since(entry.accessed) > chrono::Duration::hours(24) {
                to_remove.push(entry.key().clone());
            }
        }

        for key in to_remove {
            self.entries.remove(&key);
        }
    }

    pub async fn aggressive_cleanup(&self) {
        let now = chrono::Utc::now();
        let mut to_remove = Vec::new();

        // More aggressive cleanup - remove entries older than 1 hour
        for entry in self.entries.iter() {
            if now.signed_duration_since(entry.accessed) > chrono::Duration::hours(1) {
                to_remove.push(entry.key().clone());
            }
        }

        // If still not enough space, remove largest entries first
        if to_remove.len() < self.entries.len() / 2 {
            let mut entries: Vec<_> = self
                .entries
                .iter()
                .map(|entry| (entry.key().clone(), entry.size))
                .collect();

            // Sort by size (largest first)
            entries.sort_by(|a, b| b.1.cmp(&a.1));

            // Remove up to 50% of entries starting with largest
            let target_removals = self.entries.len() / 2;
            for (key, _) in entries.into_iter().take(target_removals) {
                if !to_remove.contains(&key) {
                    to_remove.push(key);
                }
            }
        }

        tracing::info!(
            "Aggressive cleanup removing {} cache entries",
            to_remove.len()
        );

        for key in to_remove {
            self.entries.remove(&key);
        }
    }

    pub fn current_size(&self) -> usize {
        // Use cached size for performance - recalculate only when necessary
        self.calculate_precise_size()
    }

    fn calculate_precise_size(&self) -> usize {
        self.entries
            .iter()
            .map(|entry| {
                let key_size = entry.key().len();
                let file_size = entry.value().size;
                let metadata_size = METADATA_OVERHEAD_PER_ENTRY;
                key_size + file_size + metadata_size
            })
            .sum()
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    pub fn clear(&self) {
        self.entries.clear();
    }

    #[allow(dead_code)]
    fn evict_oldest(&self) {
        // Find oldest entry key first
        let oldest_key = self
            .entries
            .iter()
            .min_by_key(|entry| entry.accessed)
            .map(|entry| entry.key().clone());

        // Remove the oldest entry if found
        if let Some(key) = oldest_key {
            self.entries.remove(&key);
        }
    }
}

#[derive(Clone)]
pub struct CachedFile {
    pub path: String,
    pub content: Vec<u8>,
    pub mime_type: String,
    pub size: usize,
    pub accessed: chrono::DateTime<chrono::Utc>,
}

pub struct OperationStatus {
    pub id: Uuid,
    pub operation_type: OperationType,
    pub progress: f32,
    pub message: String,
    pub cancellation_token: tokio_util::sync::CancellationToken,
    pub started_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum OperationType {
    FileAnalysis,
    Organization,
    ModelDownload,
    DatabaseMigration,
    BulkOperation,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressEvent {
    pub id: String,
    pub operation_type: OperationType,
    pub progress: f32,
    pub message: String,
    pub completed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceUsage {
    pub active_operations: usize,
    pub cache_items: usize,
    pub cache_memory_bytes: usize,
    pub database_connected: bool,
    pub ai_service_available: bool,
}

/// Simple privacy-first analytics tracker
pub struct AnalyticsTracker {
    events: Arc<RwLock<Vec<AnalyticsEvent>>>,
    start_time: std::time::Instant,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyticsEvent {
    pub event_name: String,
    pub properties: serde_json::Value,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

impl Default for AnalyticsTracker {
    fn default() -> Self {
        Self::new()
    }
}

impl AnalyticsTracker {
    pub fn new() -> Self {
        Self {
            events: Arc::new(RwLock::new(Vec::new())),
            start_time: std::time::Instant::now(),
        }
    }

    pub async fn track_event(&self, event_name: &str, properties: serde_json::Value) -> Result<()> {
        let event = AnalyticsEvent {
            event_name: event_name.to_string(),
            properties,
            timestamp: chrono::Utc::now(),
        };

        let mut events = self.events.write();
        events.push(event);

        // Keep only last 1000 events to prevent unbounded growth
        if events.len() > 1000 {
            events.remove(0);
        }

        Ok(())
    }

    pub async fn get_usage_stats(&self) -> Result<serde_json::Value> {
        let events = self.events.read();
        let session_duration = self.start_time.elapsed().as_secs();

        let event_counts =
            events
                .iter()
                .fold(std::collections::HashMap::new(), |mut acc, event| {
                    *acc.entry(event.event_name.clone()).or_insert(0) += 1;
                    acc
                });

        Ok(serde_json::json!({
            "session_duration_seconds": session_duration,
            "total_events": events.len(),
            "event_counts": event_counts,
            "unique_events": event_counts.len(),
            "app_version": env!("CARGO_PKG_VERSION"),
            "platform": std::env::consts::OS,
        }))
    }
}

/// Rate limiter for expensive operations
pub struct RateLimiter {
    calls: DashMap<String, VecDeque<i64>>,
    max_calls_per_minute: usize,
}

impl Default for RateLimiter {
    fn default() -> Self {
        Self::new()
    }
}

impl RateLimiter {
    pub fn new() -> Self {
        Self {
            calls: DashMap::new(),
            max_calls_per_minute: 60, // Default: 60 calls per minute
        }
    }

    pub async fn check_rate_limit(&self, operation: &str) -> Result<()> {
        let now = chrono::Utc::now().timestamp();
        let mut calls = self
            .calls
            .entry(operation.to_string())
            .or_default();

        // Remove calls older than 1 minute
        while let Some(&time) = calls.front() {
            if now - time > 60 {
                calls.pop_front();
            } else {
                break;
            }
        }

        if calls.len() >= self.max_calls_per_minute {
            return Err(crate::error::AppError::TooManyRequests {
                message: format!("Rate limit exceeded for {}", operation),
            });
        }

        calls.push_back(now);
        Ok(())
    }
}
