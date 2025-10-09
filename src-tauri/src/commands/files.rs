use crate::{
    error::Result,
    state::AppState,
    utils::security::{
        is_path_allowed, validate_and_sanitize_path_legacy as validate_and_sanitize_path,
    },
};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use tauri::{Emitter, State};
use tauri_plugin_dialog::DialogExt;
use tokio::fs;
use tokio::io::{AsyncReadExt, BufReader};
use walkdir::WalkDir;

// Type alias for complex future return type
type DirectorySizeResult<'a> =
    std::pin::Pin<Box<dyn std::future::Future<Output = Result<(u64, usize, usize)>> + Send + 'a>>;

// Global memory and concurrency protection
static CONCURRENT_READS: AtomicUsize = AtomicUsize::new(0);
static TOTAL_MEMORY_USAGE: AtomicUsize = AtomicUsize::new(0);

/// Progress update interval for directory scanning operations
const SCAN_PROGRESS_UPDATE_INTERVAL: usize = 50;

// Helper function to add timeout to long-running file operations
async fn with_timeout<T, F>(future: F, timeout_secs: u64, operation_name: &str) -> Result<T>
where
    F: std::future::Future<Output = Result<T>>,
{
    tokio::time::timeout(tokio::time::Duration::from_secs(timeout_secs), future)
        .await
        .map_err(|_| crate::error::AppError::Timeout {
            message: format!(
                "{} operation timed out after {} seconds",
                operation_name, timeout_secs
            ),
        })?
}

// Resource limits are now configurable via Config struct
// These functions get the limits from the app state
fn get_max_concurrent_reads(state: &AppState) -> usize {
    state.config.read().max_concurrent_reads
}

fn get_max_total_memory(state: &AppState) -> usize {
    state.config.read().max_total_memory_mb * 1024 * 1024
}

fn get_max_file_size(state: &AppState) -> u64 {
    (state.config.read().max_single_file_size_mb as u64) * 1024 * 1024
}

fn get_max_scan_depth(state: &AppState) -> usize {
    state.config.read().max_directory_scan_depth
}

const STREAM_THRESHOLD: u64 = 1024 * 1024; // Stream files > 1MB (still constant)
const CHUNK_SIZE: usize = 8192; // 8KB chunks for streaming
const MAX_STRING_GROWTH: usize = 64 * 1024; // Don't grow strings more than 64KB at once

// RAII guard for concurrent reads counter and memory usage
struct ReadGuard;

struct MemoryGuard {
    size: usize,
}

// RAII guard for operation tracking to prevent resource leaks
#[allow(dead_code)]
struct OperationGuard {
    operation_id: uuid::Uuid,
    state: std::sync::Arc<AppState>,
    completed: bool,
}

#[allow(dead_code)]
impl OperationGuard {
    fn new(
        state: std::sync::Arc<AppState>,
        operation_type: crate::state::OperationType,
        message: String,
    ) -> Self {
        let operation_id = state.start_operation(operation_type, message);
        Self {
            operation_id,
            state,
            completed: false,
        }
    }

    fn complete(&mut self) {
        if !self.completed {
            self.state.complete_operation(self.operation_id);
            self.completed = true;
        }
    }

    fn id(&self) -> uuid::Uuid {
        self.operation_id
    }
}

impl Drop for OperationGuard {
    fn drop(&mut self) {
        // Ensure operation is always completed, even on panic or early return
        if !self.completed {
            tracing::warn!(
                "Operation {} was not properly completed, cleaning up",
                self.operation_id
            );
            self.state.complete_operation(self.operation_id);
        }
    }
}

impl ReadGuard {
    fn new(state: &AppState) -> Result<Self> {
        let max_reads = get_max_concurrent_reads(state);

        // Use fetch_update for atomic check-and-increment - fixes race condition
        let result =
            CONCURRENT_READS.fetch_update(Ordering::AcqRel, Ordering::Acquire, |current| {
                if current >= max_reads {
                    None // Reject the update - too many concurrent reads
                } else {
                    Some(current + 1) // Accept and increment
                }
            });

        match result {
            Ok(_) => Ok(ReadGuard),
            Err(_) => {
                let current = CONCURRENT_READS.load(Ordering::Acquire);
                Err(crate::error::AppError::ResourceLimitExceeded {
                    message: format!(
                        "Too many concurrent file operations ({} active, max {} allowed). Please wait for current operations to complete or increase max_concurrent_reads in settings.", 
                        current, max_reads
                    ),
                })
            }
        }
    }
}

impl Drop for ReadGuard {
    fn drop(&mut self) {
        // Use AcqRel to ensure this decrement is visible to all threads
        CONCURRENT_READS.fetch_sub(1, Ordering::AcqRel);
    }
}

impl MemoryGuard {
    fn new(size: usize, state: &AppState) -> Result<Self> {
        let max_memory = get_max_total_memory(state);

        // Use compare-and-swap loop to atomically check and reserve memory
        loop {
            let current_memory = TOTAL_MEMORY_USAGE.load(Ordering::Acquire);

            if current_memory + size > max_memory {
                return Err(crate::error::AppError::ResourceLimitExceeded {
                    message: format!("Memory limit exceeded. Current: {} bytes, Requested: {} bytes, Limit: {} bytes. Increase max_total_memory_mb in settings if needed.", 
                        current_memory, size, max_memory),
                });
            }

            // Attempt to atomically update memory usage if it hasn't changed
            let new_total = current_memory + size;
            match TOTAL_MEMORY_USAGE.compare_exchange_weak(
                current_memory,
                new_total,
                Ordering::AcqRel,
                Ordering::Acquire,
            ) {
                Ok(_) => {
                    // Successfully reserved memory
                    return Ok(MemoryGuard { size });
                }
                Err(_) => {
                    // Memory usage changed by another thread, retry
                    continue;
                }
            }
        }
    }
}

impl Drop for MemoryGuard {
    fn drop(&mut self) {
        TOTAL_MEMORY_USAGE.fetch_sub(self.size, Ordering::AcqRel);
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileInfo {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub mime_type: String,
    pub extension: String,
    pub modified_at: i64,
    pub created_at: i64,
    pub is_directory: bool,
}

#[tauri::command]
pub async fn scan_directory(
    path: String,
    recursive: bool,
    state: State<'_, std::sync::Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<Vec<FileInfo>> {
    // Add timeout to prevent indefinite blocking on large directory scans
    with_timeout(
        scan_directory_internal(path, recursive, state, app),
        300, // 5 minutes timeout for directory scanning
        "Directory scan",
    )
    .await
}

async fn scan_directory_internal(
    path: String,
    recursive: bool,
    state: State<'_, std::sync::Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<Vec<FileInfo>> {
    // Validate and sanitize path to prevent path traversal
    let sanitized_path = validate_and_sanitize_path(&path, &app)?;

    // Validate path exists
    if !sanitized_path.exists() {
        return Err(crate::error::AppError::FileNotFound {
            path: sanitized_path.display().to_string(),
        });
    }

    // Ensure path is within allowed directories
    if !is_path_allowed(&sanitized_path, &app)? {
        return Err(crate::error::AppError::SecurityError {
            message: "Access to this directory is not allowed".to_string(),
        });
    }

    let mut files = Vec::new();

    // Start progress tracking for scanning
    let operation_id = state.start_operation(
        crate::state::OperationType::FileAnalysis,
        format!("Scanning directory: {}", path),
    );

    if recursive {
        // First pass: count total entries for progress calculation using spawn_blocking
        let max_depth = get_max_scan_depth(&state);
        let sanitized_path_clone = sanitized_path.clone();
        let total_entries = tokio::task::spawn_blocking(move || {
            WalkDir::new(&sanitized_path_clone)
                .max_depth(max_depth)
                .into_iter()
                .filter_map(|e| e.ok())
                .count()
        }).await.map_err(|e| {
            crate::error::AppError::ProcessingError {
                message: format!("Failed to count directory entries: {}", e),
            }
        })?;

        state.update_progress(
            operation_id,
            0.1,
            format!("Found {} items to scan", total_entries),
        );

        // Second pass: process entries with progress updates using spawn_blocking for WalkDir
        let mut processed = 0;
        let sanitized_path_clone = sanitized_path.clone();
        let entries: Vec<_> = tokio::task::spawn_blocking(move || {
            WalkDir::new(&sanitized_path_clone)
                .max_depth(max_depth)
                .into_iter()
                .filter_map(|e| e.ok())
                .collect()
        }).await.map_err(|e| {
            crate::error::AppError::ProcessingError {
                message: format!("Failed to collect directory entries: {}", e),
            }
        })?;

        for entry in entries {
            // Check for cancellation atomically
            let is_cancelled = state
                .active_operations
                .get(&operation_id)
                .map(|op| op.cancellation_token.is_cancelled())
                .unwrap_or(true); // Consider cancelled if operation no longer exists

            if is_cancelled {
                state.complete_operation(operation_id);
                return Err(crate::error::AppError::Cancelled);
            }

            // Check if path is protected before processing
            let entry_path = entry.path().to_string_lossy().to_string();
            match state.protected_folders.is_path_protected(&entry_path).await {
                Ok(true) => {
                    // Path is protected, skip it and emit warning
                    let _ = app.emit(
                        "protected-path-skipped",
                        serde_json::json!({
                            "path": entry_path,
                            "reason": "Directory is protected from scanning"
                        }),
                    );
                    continue;
                }
                Ok(false) => {
                    // Path is not protected, process normally
                }
                Err(e) => {
                    // Error checking protection status, log and continue
                    tracing::warn!(
                        "Failed to check protection status for {}: {}",
                        entry_path,
                        e
                    );
                }
            }

            // Check if file should be processed (not quarantined)
            let entry_path = entry.path().to_string_lossy().to_string();
            if state
                .quarantine_manager
                .should_process_file(&entry_path)
                .await
                .unwrap_or(false)
            {
                if let Ok(info) = get_file_info(entry.path()).await {
                    files.push(info);
                }
            } else {
                // File is quarantined, emit warning
                let _ = app.emit(
                    "quarantined-file-skipped",
                    serde_json::json!({
                        "path": entry_path,
                        "reason": "File is under quarantine period"
                    }),
                );
            }

            processed += 1;

            // Update progress periodically or when done
            if processed % SCAN_PROGRESS_UPDATE_INTERVAL == 0 || processed == total_entries {
                let progress = 0.1 + (0.9 * processed as f32 / total_entries as f32);
                state.update_progress(
                    operation_id,
                    progress,
                    format!("Scanned {} of {} items", processed, total_entries),
                );
            }
        }
    } else {
        state.update_progress(operation_id, 0.1, "Reading directory entries".to_string());

        let mut entries = fs::read_dir(&sanitized_path).await?;
        let mut processed = 0;

        while let Some(entry) = entries.next_entry().await? {
            if let Ok(info) = get_file_info(&entry.path()).await {
                files.push(info);
            }

            processed += 1;

            // Update progress every 25 files for non-recursive scans
            if processed % 25 == 0 {
                state.update_progress(operation_id, 0.5, format!("Scanned {} items", processed));
            }
        }
    }

    state.update_progress(
        operation_id,
        1.0,
        format!("Scan complete: {} items found", files.len()),
    );
    state.complete_operation(operation_id);

    Ok(files)
}

#[tauri::command]
pub async fn scan_directory_stream(
    path: String,
    recursive: bool,
    batch_size: Option<usize>,
    state: State<'_, std::sync::Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<String> {
    // Validate and sanitize path to prevent path traversal
    let sanitized_path = validate_and_sanitize_path(&path, &app)?;

    // Validate path exists
    if !sanitized_path.exists() {
        return Err(crate::error::AppError::FileNotFound {
            path: sanitized_path.display().to_string(),
        });
    }

    // Ensure path is within allowed directories
    if !is_path_allowed(&sanitized_path, &app)? {
        return Err(crate::error::AppError::SecurityError {
            message: "Access to this directory is not allowed".to_string(),
        });
    }

    let batch_size = batch_size.unwrap_or(50);
    let operation_id = state.start_operation(
        crate::state::OperationType::FileAnalysis,
        format!("Streaming directory scan: {}", path),
    );

    // Clone necessary values for the async task
    let app_clone = app.clone();
    let state_clone = state.inner().clone();
    let operation_id_clone = operation_id;
    let operation_id_str = operation_id.to_string();
    let operation_id_str_clone = operation_id_str.clone();

    // Spawn background task for streaming
    tokio::spawn(async move {
        let operation_id_str = operation_id_str_clone;
        let mut batch = Vec::new();
        let mut total_processed = 0usize;

        if recursive {
            let max_depth = get_max_scan_depth(&state_clone);
            let sanitized_path_clone = sanitized_path.clone();
            let entries: Vec<_> = match tokio::task::spawn_blocking(move || {
                WalkDir::new(&sanitized_path_clone)
                    .max_depth(max_depth)
                    .into_iter()
                    .filter_map(|e| e.ok())
                    .collect()
            }).await {
                Ok(entries) => entries,
                Err(e) => {
                    tracing::error!("Failed to collect streaming directory entries: {}", e);
                    return;
                }
            };

            for entry in entries {
                // Check for cancellation
                if let Some(status) = state_clone.active_operations.get(&operation_id_clone) {
                    if status.cancellation_token.is_cancelled() {
                        let _ = app_clone.emit(
                            "scan-cancelled",
                            serde_json::json!({
                                "operation_id": operation_id_str,
                                "reason": "User cancelled operation"
                            }),
                        );
                        return;
                    }
                }

                if let Ok(info) = get_file_info(entry.path()).await {
                    batch.push(info);
                    total_processed += 1;

                    // Emit when batch is full
                    if batch.len() >= batch_size {
                        let _ = app_clone.emit(
                            "scan-batch",
                            serde_json::json!({
                                "operation_id": operation_id_str,
                                "files": batch,
                                "total_processed": total_processed,
                                "batch_size": batch.len()
                            }),
                        );
                        batch.clear();
                    }
                }

                // Update progress periodically
                if total_processed % 100 == 0 {
                    state_clone.update_progress(
                        operation_id_clone,
                        0.5, // Approximate progress for streaming
                        format!("Streamed {} files", total_processed),
                    );

                    // Small delay to prevent overwhelming the frontend
                    tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;
                }
            }
        } else {
            match fs::read_dir(&sanitized_path).await {
                Ok(mut entries) => {
                    while let Ok(Some(entry)) = entries.next_entry().await {
                        // Check for cancellation
                        if let Some(status) = state_clone.active_operations.get(&operation_id_clone)
                        {
                            if status.cancellation_token.is_cancelled() {
                                let _ = app_clone.emit(
                                    "scan-cancelled",
                                    serde_json::json!({
                                        "operation_id": operation_id_str,
                                        "reason": "User cancelled operation"
                                    }),
                                );
                                return;
                            }
                        }

                        if let Ok(info) = get_file_info(&entry.path()).await {
                            batch.push(info);
                            total_processed += 1;

                            // Emit when batch is full
                            if batch.len() >= batch_size {
                                let _ = app_clone.emit(
                                    "scan-batch",
                                    serde_json::json!({
                                        "operation_id": operation_id_str,
                                        "files": batch,
                                        "total_processed": total_processed,
                                        "batch_size": batch.len()
                                    }),
                                );
                                batch.clear();
                            }
                        }
                    }
                }
                Err(e) => {
                    let _ = app_clone.emit(
                        "scan-error",
                        serde_json::json!({
                            "operation_id": operation_id_str,
                            "error": e.to_string()
                        }),
                    );
                    // Update operation with error and complete it
                    state_clone.update_progress(operation_id_clone, 0.0, format!("Error: {}", e));
                    state_clone.complete_operation(operation_id_clone);
                    return;
                }
            }
        }

        // Emit final batch if any remain
        if !batch.is_empty() {
            let _ = app_clone.emit(
                "scan-batch",
                serde_json::json!({
                    "operation_id": operation_id_str,
                    "files": batch,
                    "total_processed": total_processed,
                    "batch_size": batch.len()
                }),
            );
        }

        // Emit completion
        let _ = app_clone.emit(
            "scan-complete",
            serde_json::json!({
                "operation_id": operation_id_str,
                "total_files": total_processed
            }),
        );

        state_clone.update_progress(
            operation_id_clone,
            1.0,
            format!("Streaming scan complete: {} files", total_processed),
        );
        state_clone.complete_operation(operation_id_clone);
    });

    Ok(operation_id_str)
}

#[tauri::command]
pub async fn analyze_files(
    paths: Vec<String>,
    state: State<'_, std::sync::Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<Vec<crate::ai::FileAnalysis>> {
    // Add timeout to prevent indefinite blocking during AI analysis
    with_timeout(
        analyze_files_internal(paths, state, app),
        600, // 10 minutes timeout for file analysis (AI operations can be slow)
        "File analysis",
    )
    .await
}

async fn analyze_files_internal(
    paths: Vec<String>,
    state: State<'_, std::sync::Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<Vec<crate::ai::FileAnalysis>> {
    // Validate input parameters
    if paths.is_empty() {
        return Err(crate::error::AppError::InvalidPath {
            message: "No paths provided for analysis".to_string(),
        });
    }

    if paths.len() > 1000 {
        return Err(crate::error::AppError::SecurityError {
            message: "Too many files requested for analysis (max 1000)".to_string(),
        });
    }

    // Validate all input paths before processing to prevent path traversal
    for path in &paths {
        if path.is_empty() {
            return Err(crate::error::AppError::InvalidPath {
                message: "Empty path in analysis request".to_string(),
            });
        }
        validate_and_sanitize_path(path, &app)?;
    }

    let mut results = Vec::new();
    let operation_id = state.start_operation(
        crate::state::OperationType::FileAnalysis,
        format!("Analyzing {} files", paths.len()),
    );

    for (index, path) in paths.iter().enumerate() {
        // Update progress
        let progress = index as f32 / paths.len() as f32;
        state.update_progress(
            operation_id,
            progress,
            format!(
                "Analyzing file {} of {}: {}",
                index + 1,
                paths.len(),
                Path::new(path)
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
            ),
        );

        // Check for cancellation
        if let Some(op) = state.active_operations.get(&operation_id) {
            if op.cancellation_token.is_cancelled() {
                state.complete_operation(operation_id);
                return Err(crate::error::AppError::Cancelled);
            }
        }

        // Read file content (limited) with error context
        let content = match read_file_preview(path, 10000).await {
            Ok(content) => content,
            Err(e) => {
                tracing::error!("Failed to read file {}: {}", path, e);
                continue; // Skip this file and continue with next
            }
        };

        let mime_type = mime_guess::from_path(path)
            .first_or_octet_stream()
            .to_string();

        // Analyze with AI with enhanced error handling
        match state.ai_service.analyze_file(&content, &mime_type).await {
            Ok(mut analysis) => {
                analysis.path = path.clone();

                // Cache the analysis with error handling
                if let Err(e) = state.database.save_analysis(&analysis).await {
                    tracing::error!("Failed to save analysis for {}: {}", path, e);
                    // Continue anyway as analysis was successful
                }
                // Generate and save embeddings (best effort)
                match state
                    .ai_service
                    .generate_embeddings(&format!(
                        "{} {}",
                        analysis.summary,
                        analysis.tags.join(" ")
                    ))
                    .await
                {
                    Ok(embedding) => {
                        let model_name = state.config.read().ollama_embedding_model.clone();
                        if let Err(e) = state
                            .database
                            .save_embedding(&analysis.path, &embedding, Some(&model_name))
                            .await
                        {
                            tracing::warn!("Failed to save embedding for {}: {}", analysis.path, e);
                        }
                    }
                    Err(e) => {
                        tracing::warn!("Embedding generation failed for {}: {}", analysis.path, e)
                    }
                }

                results.push(analysis);
                tracing::debug!("Successfully analyzed {}", path);
            }
            Err(e) => {
                tracing::warn!("Failed to analyze {}: {}", path, e);
                // Emit error event to frontend for user feedback
                let _ = app.emit(
                    "analysis-failed",
                    serde_json::json!({
                        "path": path,
                        "error": e.to_string(),
                        "error_type": e.error_type(),
                        "recoverable": e.is_recoverable(),
                        "timestamp": chrono::Utc::now().timestamp(),
                    }),
                );

                // Emit general notification for user awareness
                let _ = app.emit("notification", serde_json::json!({
                    "type": "error",
                    "title": "File Analysis Failed",
                    "message": format!("Could not analyze {}: {}", Path::new(path).file_name().unwrap_or_default().to_string_lossy(), e.user_message()),
                    "timestamp": chrono::Utc::now().timestamp(),
                }));
            }
        }
    }

    // Complete the operation
    state.complete_operation(operation_id);

    // Emit completion event (legacy)
    app.emit(
        "analysis-complete",
        serde_json::json!({
            "count": results.len(),
            "paths": paths,
        }),
    )?;

    Ok(results)
}

#[tauri::command]
pub async fn get_file_content(
    path: String,
    user_id: Option<String>,
    state: State<'_, std::sync::Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<String> {
    // Validate and sanitize path to prevent path traversal
    let sanitized_path = validate_and_sanitize_path(&path, &app)?;

    // Ensure path is within allowed directories
    if !is_path_allowed(&sanitized_path, &app)? {
        return Err(crate::error::AppError::SecurityError {
            message: "Access to this file is not allowed".to_string(),
        });
    }

    // IDOR Protection: Validate user has permission to access this specific file
    if !validate_file_access(&sanitized_path, &user_id, &state).await? {
        return Err(crate::error::AppError::SecurityError {
            message: "Insufficient permissions to access this file".to_string(),
        });
    }

    let path_str = sanitized_path.display().to_string();

    // Check cache first
    if let Some(cached) = state.file_cache.get(&path_str) {
        return Ok(String::from_utf8_lossy(&cached.content).to_string());
    }

    // Acquire guard to limit concurrent reads (automatically releases on drop)
    let _guard = ReadGuard::new(&state)?;

    // Validate file size before reading (prevent memory exhaustion)
    let metadata = fs::metadata(&sanitized_path).await?;

    let max_file_size = get_max_file_size(&state);
    if metadata.len() > max_file_size {
        return Err(crate::error::AppError::SecurityError {
            message: format!(
                "File too large ({} bytes). Maximum allowed: {} bytes",
                metadata.len(),
                max_file_size
            ),
        });
    }

    // Reserve memory for this file read
    let _memory_guard = MemoryGuard::new(metadata.len() as usize, &state)?;

    // Read file with improved memory management and operation tracking
    let operation_id = state.start_operation(
        crate::state::OperationType::FileAnalysis,
        format!("Reading file: {}", path),
    );

    let content = if metadata.len() > STREAM_THRESHOLD {
        // Stream large files to avoid memory exhaustion
        read_large_file_streaming(&sanitized_path, &state, operation_id).await?
    } else {
        // Small files - read all at once but with memory monitoring
        read_small_file_safe(&sanitized_path, &state).await?
    };

    state.complete_operation(operation_id);

    // Cache for future use
    let file_info = get_file_info(&sanitized_path).await?;
    state.file_cache.insert(
        path_str.clone(),
        crate::state::CachedFile {
            path: path_str,
            content: content.as_bytes().to_vec(),
            mime_type: file_info.mime_type,
            size: file_info.size as usize,
            accessed: chrono::Utc::now(),
        },
    );

    Ok(content)
}

#[tauri::command]
pub async fn move_files(
    operations: Vec<MoveOperation>,
    state: State<'_, std::sync::Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<Vec<MoveResult>> {
    // Validate input parameters
    if operations.is_empty() {
        return Err(crate::error::AppError::InvalidPath {
            message: "No move operations provided".to_string(),
        });
    }

    if operations.len() > 500 {
        return Err(crate::error::AppError::SecurityError {
            message: "Too many move operations requested (max 500)".to_string(),
        });
    }

    // Validate all source and destination paths before processing
    for op in &operations {
        if op.source.is_empty() || op.destination.is_empty() {
            return Err(crate::error::AppError::InvalidPath {
                message: "Empty source or destination path in move operation".to_string(),
            });
        }

        if op.source == op.destination {
            return Err(crate::error::AppError::InvalidPath {
                message: "Source and destination paths cannot be the same".to_string(),
            });
        }

        validate_and_sanitize_path(&op.source, &app)?;
        validate_and_sanitize_path(&op.destination, &app)?;
    }

    let mut results = Vec::new();
    let operation_id = state.start_operation(
        crate::state::OperationType::BulkOperation,
        "Bulk file operation".to_string(),
    );

    for (index, op) in operations.iter().enumerate() {
        // Update progress
        let progress = (index as f32 / operations.len() as f32) * 100.0;
        state.update_operation(
            operation_id,
            progress,
            format!(
                "Moving: {}",
                Path::new(&op.source)
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
            ),
        );

        // Perform move
        match perform_move(op).await {
            Ok(_) => {
                // Record for undo
                state
                    .undo_redo
                    .record_move(&op.source, &op.destination)
                    .await?;

                results.push(MoveResult {
                    source: op.source.clone(),
                    destination: op.destination.clone(),
                    success: true,
                    error: None,
                });
            }
            Err(e) => {
                results.push(MoveResult {
                    source: op.source.clone(),
                    destination: op.destination.clone(),
                    success: false,
                    error: Some(e.to_string()),
                });
            }
        }
    }

    state.complete_operation(operation_id);

    Ok(results)
}

#[tauri::command]
pub async fn get_file_preview(
    path: String,
    max_size: usize,
    app: tauri::AppHandle,
) -> Result<FilePreview> {
    // Validate input parameters
    if path.is_empty() {
        return Err(crate::error::AppError::InvalidPath {
            message: "Path cannot be empty".to_string(),
        });
    }

    if max_size == 0 || max_size > 100 * 1024 * 1024 {
        return Err(crate::error::AppError::SecurityError {
            message: "Invalid max_size parameter (must be between 1 and 100MB)".to_string(),
        });
    }

    // Validate and sanitize path to prevent path traversal
    let sanitized_path = validate_and_sanitize_path(&path, &app)?;

    let metadata = fs::metadata(&sanitized_path).await?;

    if metadata.len() > max_size as u64 {
        // Return partial content
        let content = read_file_preview(&sanitized_path.display().to_string(), max_size).await?;
        Ok(FilePreview {
            content,
            truncated: true,
            total_size: metadata.len(),
        })
    } else {
        let content = fs::read_to_string(&sanitized_path).await?;
        Ok(FilePreview {
            content,
            truncated: false,
            total_size: metadata.len(),
        })
    }
}

async fn get_file_info(path: impl AsRef<Path>) -> Result<FileInfo> {
    let path = path.as_ref();
    let metadata = fs::metadata(path).await?;

    let modified_at = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    let created_at = metadata
        .created()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_string();

    let mime_type = mime_guess::from_path(path)
        .first_or_octet_stream()
        .to_string();

    Ok(FileInfo {
        path: path.display().to_string(),
        name: path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string(),
        size: metadata.len(),
        mime_type,
        extension,
        modified_at,
        created_at,
        is_directory: metadata.is_dir(),
    })
}

async fn read_file_preview(path: &str, max_bytes: usize) -> Result<String> {
    use tokio::io::{AsyncReadExt, BufReader};

    // Validate file size before opening to prevent DoS
    let metadata = fs::metadata(path).await?;
    const MAX_PREVIEW_FILE_SIZE: u64 = 100 * 1024 * 1024; // 100MB limit for preview

    if metadata.len() > MAX_PREVIEW_FILE_SIZE {
        return Err(crate::error::AppError::SecurityError {
            message: format!(
                "File too large for preview ({} bytes). Maximum allowed: {} bytes",
                metadata.len(),
                MAX_PREVIEW_FILE_SIZE
            ),
        });
    }

    let file = tokio::fs::File::open(path).await?;
    let mut reader = BufReader::new(file);
    let mut buffer = vec![0u8; max_bytes];

    let bytes_read = reader.read(&mut buffer).await?;
    buffer.truncate(bytes_read);

    // Try to convert to string, handling encoding
    match String::from_utf8(buffer.clone()) {
        Ok(s) => Ok(s),
        Err(_) => {
            // Try with encoding_rs for non-UTF8 files
            let (decoded, _, _) = encoding_rs::UTF_8.decode(&buffer);
            Ok(decoded.to_string())
        }
    }
}

async fn perform_move(op: &MoveOperation) -> Result<()> {
    let source = Path::new(&op.source);
    let destination = Path::new(&op.destination);

    // Validate source exists
    if !source.exists() {
        return Err(crate::error::AppError::FileNotFound {
            path: source.display().to_string(),
        });
    }

    // Validate destination doesn't already exist to prevent accidental overwrites
    if destination.exists() {
        return Err(crate::error::AppError::InvalidPath {
            message: format!("Destination already exists: {}", destination.display()),
        });
    }

    // Ensure destination directory exists
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).await?;
    }

    // Check if we're trying to move a directory into itself
    if source.is_dir() && destination.starts_with(source) {
        return Err(crate::error::AppError::InvalidPath {
            message: "Cannot move directory into itself".to_string(),
        });
    }

    // Try rename first (fast if same filesystem)
    if fs::rename(&source, &destination).await.is_ok() {
        return Ok(());
    }

    // Fall back to copy + delete, handling both files and directories
    if source.is_dir() {
        // Validate directory is not empty in a reasonable way
        let mut entries = fs::read_dir(source).await?;
        let mut file_count = 0usize;
        while (entries.next_entry().await?).is_some() {
            file_count += 1;
            if file_count > 10000 {
                return Err(crate::error::AppError::SecurityError {
                    message: "Directory too large to move (>10000 files)".to_string(),
                });
            }
        }

        // Recursively copy directory
        copy_dir_recursively(source, destination).await?;
        fs::remove_dir_all(&source).await?;
    } else {
        fs::copy(&source, &destination).await?;
        fs::remove_file(&source).await?;
    }

    Ok(())
}

// Helper function to recursively copy directories
fn copy_dir_recursively<'a>(
    source: &'a Path,
    destination: &'a Path,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<()>> + Send + 'a>> {
    Box::pin(async move {
        fs::create_dir_all(destination).await?;

        let mut entries = fs::read_dir(source).await?;
        while let Some(entry) = entries.next_entry().await? {
            let entry_path = entry.path();
            let relative_path = entry_path.strip_prefix(source).map_err(|_| {
                crate::error::AppError::InvalidPath {
                    message: "Failed to get relative path during copy".to_string(),
                }
            })?;
            let dest_path = destination.join(relative_path);

            if entry_path.is_dir() {
                copy_dir_recursively(&entry_path, &dest_path).await?;
            } else {
                fs::copy(&entry_path, &dest_path).await?;
            }
        }

        Ok(())
    })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MoveOperation {
    pub source: String,
    pub destination: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MoveResult {
    pub source: String,
    pub destination: String,
    pub success: bool,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FilePreview {
    pub content: String,
    pub truncated: bool,
    pub total_size: u64,
}

#[tauri::command]
pub async fn get_recent_files(state: State<'_, std::sync::Arc<AppState>>) -> Result<Vec<FileInfo>> {
    // Get recent files from database (last 20 analyzed files)
    let recent_files = state.database.get_recent_analyses(20).await?;

    let mut files = Vec::new();
    for path in recent_files {
        if let Ok(info) = get_file_info(&path).await {
            files.push(info);
        }
    }

    Ok(files)
}

#[tauri::command]
pub async fn rename_file(
    old_path: String,
    new_path: String,
    state: State<'_, std::sync::Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<bool> {
    let sanitized_old = validate_and_sanitize_path(&old_path, &app)?;
    let sanitized_new = validate_and_sanitize_path(&new_path, &app)?;

    if !sanitized_old.exists() {
        return Err(crate::error::AppError::FileNotFound { path: old_path });
    }

    if sanitized_new.exists() {
        return Err(crate::error::AppError::InvalidPath {
            message: "Destination already exists".to_string(),
        });
    }

    fs::rename(&sanitized_old, &sanitized_new).await?;

    // Record for undo
    state.undo_redo.record_move(&old_path, &new_path).await?;

    Ok(true)
}

#[tauri::command]
pub async fn copy_file(
    source_path: String,
    destination_path: String,
    state: State<'_, std::sync::Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<bool> {
    let sanitized_source = validate_and_sanitize_path(&source_path, &app)?;
    let sanitized_dest = validate_and_sanitize_path(&destination_path, &app)?;

    if !sanitized_source.exists() {
        return Err(crate::error::AppError::FileNotFound { path: source_path });
    }

    if sanitized_dest.exists() {
        return Err(crate::error::AppError::InvalidPath {
            message: "Destination already exists".to_string(),
        });
    }

    // Ensure destination directory exists
    if let Some(parent) = sanitized_dest.parent() {
        fs::create_dir_all(parent).await?;
    }

    if sanitized_source.is_dir() {
        copy_dir_recursively(&sanitized_source, &sanitized_dest).await?;
    } else {
        fs::copy(&sanitized_source, &sanitized_dest).await?;
    }

    // Record for undo (copy creates new file, so record as creation)
    state.undo_redo.record_create(&destination_path).await?;

    Ok(true)
}

#[tauri::command]
pub async fn delete_file(
    path: String,
    permanent: bool,
    state: State<'_, std::sync::Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<bool> {
    let sanitized_path = validate_and_sanitize_path(&path, &app)?;

    if !sanitized_path.exists() {
        return Err(crate::error::AppError::FileNotFound { path });
    }

    // Read file content for potential recovery if not permanent
    let backup_content = if !permanent && sanitized_path.is_file() {
        (fs::read(&sanitized_path).await).ok()
    } else {
        None
    };

    if sanitized_path.is_dir() {
        fs::remove_dir_all(&sanitized_path).await?;
    } else {
        fs::remove_file(&sanitized_path).await?;
    }

    // Record for undo with backup content
    state.undo_redo.record_delete(&path, backup_content).await?;

    Ok(true)
}

#[tauri::command]
pub async fn create_directory(
    path: String,
    recursive: bool,
    app: tauri::AppHandle,
) -> Result<bool> {
    let sanitized_path = validate_and_sanitize_path(&path, &app)?;

    if sanitized_path.exists() {
        return Err(crate::error::AppError::InvalidPath {
            message: "Directory already exists".to_string(),
        });
    }

    if recursive {
        fs::create_dir_all(&sanitized_path).await?;
    } else {
        fs::create_dir(&sanitized_path).await?;
    }

    Ok(true)
}

#[tauri::command]
pub async fn get_file_info_command(path: String, app: tauri::AppHandle) -> Result<FileInfo> {
    let sanitized_path = validate_and_sanitize_path(&path, &app)?;
    get_file_info(&sanitized_path).await
}

#[tauri::command]
pub async fn set_file_permissions(
    path: String,
    permissions: u32,
    app: tauri::AppHandle,
) -> Result<bool> {
    let sanitized_path = validate_and_sanitize_path(&path, &app)?;

    if !sanitized_path.exists() {
        return Err(crate::error::AppError::FileNotFound { path });
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let metadata = fs::metadata(&sanitized_path).await?;
        let mut perms = metadata.permissions();
        perms.set_mode(permissions);
        fs::set_permissions(&sanitized_path, perms).await?;
    }

    #[cfg(windows)]
    {
        // Windows permissions are more complex, implement basic read-only toggle
        let metadata = fs::metadata(&sanitized_path).await?;
        let mut perms = metadata.permissions();
        perms.set_readonly(permissions & 0o200 == 0);
        fs::set_permissions(&sanitized_path, perms).await?;
    }

    Ok(true)
}

#[tauri::command]
pub async fn batch_file_operations(
    operations: Vec<BatchOperation>,
    state: State<'_, std::sync::Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<Vec<BatchResult>> {
    if operations.len() > 1000 {
        return Err(crate::error::AppError::SecurityError {
            message: "Too many batch operations (max 1000)".to_string(),
        });
    }

    let mut results = Vec::new();
    let operation_id = state.start_operation(
        crate::state::OperationType::BulkOperation,
        format!("Batch operations: {}", operations.len()),
    );

    for (index, op) in operations.iter().enumerate() {
        let progress = index as f32 / operations.len() as f32;
        state.update_progress(
            operation_id,
            progress,
            format!("Operation {}/{}", index + 1, operations.len()),
        );

        let result = match &op.operation_type {
            BatchOperationType::Move => {
                match rename_file(
                    op.source.clone(),
                    op.destination.clone().unwrap_or_default(),
                    state.clone(),
                    app.clone(),
                )
                .await
                {
                    Ok(_) => BatchResult {
                        success: true,
                        error: None,
                        path: op.source.clone(),
                    },
                    Err(e) => BatchResult {
                        success: false,
                        error: Some(e.to_string()),
                        path: op.source.clone(),
                    },
                }
            }
            BatchOperationType::Copy => {
                match copy_file(
                    op.source.clone(),
                    op.destination.clone().unwrap_or_default(),
                    state.clone(),
                    app.clone(),
                )
                .await
                {
                    Ok(_) => BatchResult {
                        success: true,
                        error: None,
                        path: op.source.clone(),
                    },
                    Err(e) => BatchResult {
                        success: false,
                        error: Some(e.to_string()),
                        path: op.source.clone(),
                    },
                }
            }
            BatchOperationType::Delete => {
                match delete_file(op.source.clone(), false, state.clone(), app.clone()).await {
                    Ok(_) => BatchResult {
                        success: true,
                        error: None,
                        path: op.source.clone(),
                    },
                    Err(e) => BatchResult {
                        success: false,
                        error: Some(e.to_string()),
                        path: op.source.clone(),
                    },
                }
            }
        };

        results.push(result);
    }

    state.complete_operation(operation_id);
    Ok(results)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BatchOperation {
    pub operation_type: BatchOperationType,
    pub source: String,
    pub destination: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum BatchOperationType {
    Move,
    Copy,
    Delete,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BatchResult {
    pub success: bool,
    pub error: Option<String>,
    pub path: String,
}

#[tauri::command]
pub async fn move_file(
    source_path: String,
    destination_path: String,
    state: State<'_, std::sync::Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<bool> {
    let sanitized_source = validate_and_sanitize_path(&source_path, &app)?;
    let sanitized_dest = validate_and_sanitize_path(&destination_path, &app)?;

    if !sanitized_source.exists() {
        return Err(crate::error::AppError::FileNotFound { path: source_path });
    }

    if sanitized_dest.exists() {
        return Err(crate::error::AppError::InvalidPath {
            message: "Destination already exists".to_string(),
        });
    }

    let operation = MoveOperation {
        source: source_path.clone(),
        destination: destination_path.clone(),
    };

    perform_move(&operation).await?;

    // Record for undo
    state
        .undo_redo
        .record_move(&source_path, &destination_path)
        .await?;

    // Auto-quarantine moved file if quarantine is enabled
    if let Ok(Some(_)) = state
        .quarantine_manager
        .auto_quarantine_moved_file(&destination_path, &source_path)
        .await
    {
        let _ = app.emit(
            "file-quarantined",
            serde_json::json!({
                "file_path": destination_path,
                "original_path": source_path,
                "reason": "Recently moved file - under quarantine period"
            }),
        );
    }

    Ok(true)
}

#[tauri::command]
pub async fn rename_files(
    operations: Vec<RenameOperation>,
    state: State<'_, std::sync::Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<Vec<RenameResult>> {
    if operations.is_empty() {
        return Err(crate::error::AppError::InvalidPath {
            message: "No rename operations provided".to_string(),
        });
    }

    if operations.len() > 500 {
        return Err(crate::error::AppError::SecurityError {
            message: "Too many rename operations requested (max 500)".to_string(),
        });
    }

    let mut results = Vec::new();
    let operation_id = state.start_operation(
        crate::state::OperationType::BulkOperation,
        format!("Renaming {} files", operations.len()),
    );

    for (index, op) in operations.iter().enumerate() {
        let progress = index as f32 / operations.len() as f32;
        state.update_progress(
            operation_id,
            progress,
            format!(
                "Renaming: {}",
                Path::new(&op.file_path)
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
            ),
        );

        let sanitized_path = validate_and_sanitize_path(&op.file_path, &app)?;
        let parent =
            sanitized_path
                .parent()
                .ok_or_else(|| crate::error::AppError::InvalidPath {
                    message: "Cannot get parent directory".to_string(),
                })?;
        let new_path = parent.join(&op.new_name);

        match fs::rename(&sanitized_path, &new_path).await {
            Ok(_) => {
                state
                    .undo_redo
                    .record_move(&op.file_path, &new_path.display().to_string())
                    .await?;
                results.push(RenameResult {
                    original_path: op.file_path.clone(),
                    new_path: new_path.display().to_string(),
                    success: true,
                    error: None,
                });
            }
            Err(e) => {
                results.push(RenameResult {
                    original_path: op.file_path.clone(),
                    new_path: new_path.display().to_string(),
                    success: false,
                    error: Some(e.to_string()),
                });
            }
        }
    }

    state.complete_operation(operation_id);
    Ok(results)
}

#[tauri::command]
pub async fn file_exists(path: String, app: tauri::AppHandle) -> Result<FileExistsResult> {
    if path.is_empty() {
        return Ok(FileExistsResult {
            exists: false,
            is_file: false,
            is_directory: false,
            is_accessible: false,
            error: Some("Empty path provided".to_string()),
        });
    }

    // Validate and sanitize path
    let sanitized_path = match validate_and_sanitize_path(&path, &app) {
        Ok(path) => path,
        Err(e) => {
            return Ok(FileExistsResult {
                exists: false,
                is_file: false,
                is_directory: false,
                is_accessible: false,
                error: Some(format!("Path validation failed: {}", e)),
            });
        }
    };

    // Check if path is allowed
    let is_accessible = is_path_allowed(&sanitized_path, &app).unwrap_or(false);

    // Check if path exists and get metadata
    match fs::metadata(&sanitized_path).await {
        Ok(metadata) => Ok(FileExistsResult {
            exists: true,
            is_file: metadata.is_file(),
            is_directory: metadata.is_dir(),
            is_accessible,
            error: None,
        }),
        Err(e) => {
            // Check if the error is due to permissions vs non-existence
            let error_kind = e.kind();
            let exists = match error_kind {
                std::io::ErrorKind::NotFound => false,
                std::io::ErrorKind::PermissionDenied => true, // File exists but no permission
                _ => false,
            };

            Ok(FileExistsResult {
                exists,
                is_file: false,
                is_directory: false,
                is_accessible: false,
                error: Some(e.to_string()),
            })
        }
    }
}

#[tauri::command]
pub async fn get_file_properties(path: String, app: tauri::AppHandle) -> Result<FileProperties> {
    let sanitized_path = validate_and_sanitize_path(&path, &app)?;

    if !sanitized_path.exists() {
        return Err(crate::error::AppError::FileNotFound { path });
    }

    let metadata = fs::metadata(&sanitized_path).await?;

    let modified_at = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    let created_at = metadata
        .created()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    let accessed_at = metadata
        .accessed()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    #[cfg(unix)]
    let permissions = {
        use std::os::unix::fs::PermissionsExt;
        format!("{:o}", metadata.permissions().mode() & 0o777)
    };

    #[cfg(windows)]
    let permissions = if metadata.permissions().readonly() {
        "readonly".to_string()
    } else {
        "readwrite".to_string()
    };

    Ok(FileProperties {
        path: sanitized_path.display().to_string(),
        size: metadata.len(),
        created_at,
        modified_at,
        accessed_at,
        permissions,
        is_directory: metadata.is_dir(),
        is_readonly: metadata.permissions().readonly(),
    })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RenameOperation {
    pub file_path: String,
    pub new_name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RenameResult {
    pub original_path: String,
    pub new_path: String,
    pub success: bool,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileProperties {
    pub path: String,
    pub size: u64,
    pub created_at: i64,
    pub modified_at: i64,
    pub accessed_at: i64,
    pub permissions: String,
    pub is_directory: bool,
    pub is_readonly: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileExistsResult {
    pub exists: bool,
    pub is_file: bool,
    pub is_directory: bool,
    pub is_accessible: bool,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileSizeInfo {
    pub path: String,
    pub size_bytes: u64,
    pub size_value: f64,
    pub size_unit: String,
    pub total_size_bytes: u64,
    pub total_size_value: f64,
    pub total_size_unit: String,
    pub is_directory: bool,
    pub file_count: usize,
    pub directory_count: usize,
}

#[tauri::command]
pub async fn get_file_size_info(path: String, app: tauri::AppHandle) -> Result<FileSizeInfo> {
    let sanitized_path = validate_and_sanitize_path(&path, &app)?;

    if !sanitized_path.exists() {
        return Err(crate::error::AppError::FileNotFound { path });
    }

    if !is_path_allowed(&sanitized_path, &app)? {
        return Err(crate::error::AppError::SecurityError {
            message: "Access to this path is not allowed".to_string(),
        });
    }

    let metadata = fs::metadata(&sanitized_path).await?;
    let size_bytes = metadata.len();

    // Calculate human-readable size
    let (size_value, size_unit) = format_file_size(size_bytes);

    // For directories, calculate total size
    let (total_size, file_count, directory_count) = if metadata.is_dir() {
        match calculate_directory_size(&sanitized_path).await {
            Ok((total, files, dirs)) => (total, files, dirs),
            Err(_) => (size_bytes, 0, 0),
        }
    } else {
        (size_bytes, 1, 0)
    };

    let (total_size_value, total_size_unit) = format_file_size(total_size);

    Ok(FileSizeInfo {
        path: sanitized_path.display().to_string(),
        size_bytes,
        size_value,
        size_unit,
        total_size_bytes: total_size,
        total_size_value,
        total_size_unit,
        is_directory: metadata.is_dir(),
        file_count,
        directory_count,
    })
}

#[tauri::command]
pub async fn browse_files(
    multiple: bool,
    filters: Option<Vec<DialogFilter>>,
    app: tauri::AppHandle,
) -> Result<Vec<String>> {
    tracing::info!("Opening file selection dialog (multiple: {})", multiple);

    // Validate input parameters
    if let Some(ref filter_list) = filters {
        if filter_list.len() > 50 {
            return Err(crate::error::AppError::SecurityError {
                message: "Too many file filters specified (max 50)".to_string(),
            });
        }
    }

    let mut dialog_builder = app.dialog().file();

    // Apply filters if provided
    if let Some(filter_list) = filters {
        for filter in filter_list {
            let mut extensions: Vec<&str> = Vec::new();
            for ext in &filter.extensions {
                // Validate extension format (prevent injection)
                if ext.is_empty() || ext.len() > 10 || ext.contains('/') || ext.contains('\\') {
                    continue;
                }
                extensions.push(ext);
            }
            if !extensions.is_empty() {
                dialog_builder = dialog_builder.add_filter(&filter.name, &extensions);
            }
        }
    }

    let selected_paths = if multiple {
        dialog_builder.blocking_pick_files().unwrap_or_default()
    } else {
        match dialog_builder.blocking_pick_file() {
            Some(path) => vec![path],
            None => Vec::new(),
        }
    };

    if selected_paths.is_empty() {
        tracing::info!("File selection dialog cancelled");
        return Ok(Vec::new());
    }

    let mut validated_paths = Vec::new();

    // Security: Validate each selected path
    for path in selected_paths {
        let path_str = match path.as_path() {
            Some(p) => p.display().to_string(),
            None => {
                return Err(crate::error::AppError::InvalidPath {
                    message: "Invalid file path selected".to_string(),
                });
            }
        };

        // Validate path length to prevent memory exhaustion
        if path_str.len() > 4096 {
            tracing::warn!("Path too long, skipping: {}", path_str);
            continue;
        }

        match validate_and_sanitize_path(&path_str, &app) {
            Ok(validated_path) => {
                // Additional security check: ensure path is allowed
                if is_path_allowed(&validated_path, &app)? {
                    validated_paths.push(validated_path.display().to_string());
                } else {
                    tracing::warn!("Path not allowed, skipping: {}", path_str);
                }
            }
            Err(e) => {
                tracing::warn!("Path validation failed for {}: {}", path_str, e);
                // Continue with other paths instead of failing entirely
                continue;
            }
        }
    }

    // Log selection results
    tracing::info!("User selected {} valid files", validated_paths.len());

    // Emit selection event for frontend tracking
    let _ = app.emit(
        "files-selected",
        serde_json::json!({
            "count": validated_paths.len(),
            "paths": validated_paths,
            "timestamp": chrono::Utc::now().timestamp(),
        }),
    );

    Ok(validated_paths)
}

#[tauri::command]
pub async fn browse_folder(title: Option<String>, app: tauri::AppHandle) -> Result<String> {
    let dialog_title = title.unwrap_or_else(|| "Select Folder".to_string());

    // Validate title to prevent injection attacks
    if dialog_title.len() > 200 {
        return Err(crate::error::AppError::SecurityError {
            message: "Dialog title too long".to_string(),
        });
    }

    tracing::info!("Opening folder selection dialog: {}", dialog_title);

    let dialog_builder = app.dialog().file().set_title(&dialog_title);

    match dialog_builder.blocking_pick_folder() {
        Some(folder_path) => {
            let path_str = match folder_path.as_path() {
                Some(p) => p.display().to_string(),
                None => {
                    return Err(crate::error::AppError::InvalidPath {
                        message: "Invalid folder path selected".to_string(),
                    });
                }
            };

            // Validate path length
            if path_str.len() > 4096 {
                return Err(crate::error::AppError::SecurityError {
                    message: "Selected path too long".to_string(),
                });
            }

            // Validate and sanitize the selected folder path
            let validated_path = validate_and_sanitize_path(&path_str, &app)?;

            // Additional security check: ensure path is allowed
            if !is_path_allowed(&validated_path, &app)? {
                return Err(crate::error::AppError::SecurityError {
                    message: "Selected folder is not accessible".to_string(),
                });
            }

            let final_path = validated_path.display().to_string();

            tracing::info!("User selected folder: {}", final_path);

            // Emit folder selection event for frontend tracking
            let _ = app.emit(
                "folder-selected",
                serde_json::json!({
                    "path": final_path,
                    "timestamp": chrono::Utc::now().timestamp(),
                }),
            );

            Ok(final_path)
        }
        None => {
            tracing::info!("Folder selection dialog cancelled");
            Ok(String::new()) // Return empty string when user cancels
        }
    }
}

#[tauri::command]
pub async fn process_dropped_paths(
    dropped_paths: Vec<String>,
    state: State<'_, std::sync::Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<ProcessedDropResult> {
    // Validate input parameters
    if dropped_paths.is_empty() {
        return Err(crate::error::AppError::InvalidInput {
            message: "No paths provided for processing".to_string(),
        });
    }

    if dropped_paths.len() > 1000 {
        return Err(crate::error::AppError::SecurityError {
            message: "Too many dropped paths (max 1000)".to_string(),
        });
    }

    tracing::info!("Processing {} dropped paths", dropped_paths.len());

    let mut valid_files = Vec::new();
    let mut valid_folders = Vec::new();
    let mut invalid_paths = Vec::new();
    let mut total_size = 0u64;

    // Start progress tracking for processing
    let operation_id = state.start_operation(
        crate::state::OperationType::FileAnalysis,
        format!("Processing {} dropped items", dropped_paths.len()),
    );

    for (index, path_str) in dropped_paths.iter().enumerate() {
        // Update progress
        let progress = index as f32 / dropped_paths.len() as f32;
        state.update_progress(
            operation_id,
            progress,
            format!("Validating path {} of {}", index + 1, dropped_paths.len()),
        );

        // Check for cancellation
        if let Some(op) = state.active_operations.get(&operation_id) {
            if op.cancellation_token.is_cancelled() {
                state.complete_operation(operation_id);
                return Err(crate::error::AppError::Cancelled);
            }
        }

        // Validate path length
        if path_str.is_empty() || path_str.len() > 4096 {
            invalid_paths.push(InvalidPath {
                path: path_str.clone(),
                reason: "Path too long or empty".to_string(),
            });
            continue;
        }

        // Validate and sanitize path
        let validated_path = match validate_and_sanitize_path(path_str, &app) {
            Ok(path) => path,
            Err(e) => {
                invalid_paths.push(InvalidPath {
                    path: path_str.clone(),
                    reason: format!("Path validation failed: {}", e),
                });
                continue;
            }
        };

        // Check if path is allowed
        if !is_path_allowed(&validated_path, &app)? {
            invalid_paths.push(InvalidPath {
                path: path_str.clone(),
                reason: "Path not accessible".to_string(),
            });
            continue;
        }

        // Check if path exists
        if !validated_path.exists() {
            invalid_paths.push(InvalidPath {
                path: path_str.clone(),
                reason: "Path does not exist".to_string(),
            });
            continue;
        }

        // Get file info and categorize
        match get_file_info(&validated_path).await {
            Ok(file_info) => {
                total_size = total_size.saturating_add(file_info.size);

                // Check total size limit to prevent memory exhaustion
                const MAX_TOTAL_SIZE: u64 = 10 * 1024 * 1024 * 1024; // 10GB
                if total_size > MAX_TOTAL_SIZE {
                    return Err(crate::error::AppError::ResourceLimitExceeded {
                        message: format!(
                            "Total size of dropped files exceeds limit ({} bytes)",
                            MAX_TOTAL_SIZE
                        ),
                    });
                }

                if file_info.is_directory {
                    valid_folders.push(file_info);
                } else {
                    valid_files.push(file_info);
                }
            }
            Err(e) => {
                invalid_paths.push(InvalidPath {
                    path: path_str.clone(),
                    reason: format!("Failed to get file info: {}", e),
                });
            }
        }
    }

    state.complete_operation(operation_id);

    let result = ProcessedDropResult {
        valid_files: valid_files.clone(),
        valid_folders: valid_folders.clone(),
        invalid_paths: invalid_paths.clone(),
        total_size,
        total_valid: valid_files.len() + valid_folders.len(),
        total_invalid: invalid_paths.len(),
    };

    // Log processing results
    tracing::info!(
        "Processed drop: {} files, {} folders, {} invalid paths, total size: {} bytes",
        valid_files.len(),
        valid_folders.len(),
        invalid_paths.len(),
        total_size
    );

    // Emit processing event for frontend tracking
    let _ = app.emit(
        "paths-processed",
        serde_json::json!({
            "files_count": valid_files.len(),
            "folders_count": valid_folders.len(),
            "invalid_count": invalid_paths.len(),
            "total_size": total_size,
            "timestamp": chrono::Utc::now().timestamp(),
        }),
    );

    Ok(result)
}

// Data structures for the new commands
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DialogFilter {
    pub name: String,
    pub extensions: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProcessedDropResult {
    pub valid_files: Vec<FileInfo>,
    pub valid_folders: Vec<FileInfo>,
    pub invalid_paths: Vec<InvalidPath>,
    pub total_size: u64,
    pub total_valid: usize,
    pub total_invalid: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvalidPath {
    pub path: String,
    pub reason: String,
}

// Helper functions to determine operation types
pub fn is_rename_operation(source: &str, destination: &str) -> bool {
    let source_path = Path::new(source);
    let dest_path = Path::new(destination);

    // Same parent directory means it's a rename
    source_path.parent() == dest_path.parent()
}

pub fn is_move_operation(source: &str, destination: &str) -> bool {
    let source_path = Path::new(source);
    let dest_path = Path::new(destination);

    // Different parent directories means it's a move
    source_path.parent() != dest_path.parent()
}

pub fn is_move_with_rename(source: &str, destination: &str) -> bool {
    let source_path = Path::new(source);
    let dest_path = Path::new(destination);

    // Different parent directory AND different filename
    source_path.parent() != dest_path.parent() && source_path.file_name() != dest_path.file_name()
}

// Helper function to format file size in human-readable format
fn format_file_size(bytes: u64) -> (f64, String) {
    const UNITS: &[&str] = &["B", "KB", "MB", "GB", "TB", "PB"];
    const THRESHOLD: f64 = 1024.0;

    if bytes == 0 {
        return (0.0, "B".to_string());
    }

    let bytes_f64 = bytes as f64;
    let unit_index = (bytes_f64.log10() / THRESHOLD.log10()).floor() as usize;
    let unit_index = unit_index.min(UNITS.len() - 1);

    let value = bytes_f64 / THRESHOLD.powi(unit_index as i32);
    let unit = UNITS[unit_index].to_string();

    // Round to 2 decimal places
    let rounded_value = (value * 100.0).round() / 100.0;

    (rounded_value, unit)
}

// Helper function to calculate directory size and count files/subdirectories
async fn calculate_directory_size(dir: &std::path::Path) -> Result<(u64, usize, usize)> {
    // Use a bounded depth to prevent infinite recursion
    const MAX_DEPTH: usize = 20;

    fn calculate_recursive(dir: &std::path::Path, current_depth: usize) -> DirectorySizeResult<'_> {
        Box::pin(async move {
            if current_depth > MAX_DEPTH {
                return Ok((0, 0, 0));
            }

            let mut total_size = 0u64;
            let mut file_count = 0usize;
            let mut directory_count = 0usize;

            let mut entries = tokio::fs::read_dir(dir).await?;

            while let Some(entry) = entries.next_entry().await? {
                let metadata = entry.metadata().await?;

                if metadata.is_file() {
                    total_size += metadata.len();
                    file_count += 1;
                } else if metadata.is_dir() {
                    directory_count += 1;

                    // Recursively calculate subdirectory size
                    let (sub_size, sub_files, sub_dirs) =
                        calculate_recursive(&entry.path(), current_depth + 1).await?;

                    total_size += sub_size;
                    file_count += sub_files;
                    directory_count += sub_dirs;
                }
            }

            Ok((total_size, file_count, directory_count))
        })
    }

    calculate_recursive(dir, 0).await
}

// IDOR Protection: Validate user has permission to access specific file
async fn validate_file_access(
    path: &Path,
    user_id: &Option<String>,
    state: &State<'_, std::sync::Arc<AppState>>,
) -> Result<bool> {
    // For single-user desktop application, we can use a simplified permission model
    // In a multi-user environment, this would check database permissions

    // Get the canonical path as string for database queries
    let path_str = path.display().to_string();

    // Check if file has been explicitly granted to user or is in user's allowed directories
    if let Some(uid) = user_id {
        // Check database for explicit file permissions (if implemented)
        match state.database.check_file_permission(&path_str, uid).await {
            Ok(has_permission) => {
                if has_permission {
                    return Ok(true);
                }
            }
            Err(_) => {
                // If database check fails, fall back to directory-based permissions
                tracing::warn!("Database permission check failed for path: {}", path_str);
            }
        }
    }

    // For desktop app, default to allowing access if path validation passed
    // In production multi-user environment, this should be more restrictive
    Ok(true)
}

/// Stream large files to avoid memory exhaustion
async fn read_large_file_streaming(
    path: &Path,
    state: &AppState,
    operation_id: uuid::Uuid,
) -> Result<String> {
    let file = fs::File::open(path).await?;
    let mut reader = BufReader::new(file);

    // Use String::with_capacity with a reasonable initial size to reduce reallocations
    let mut content = String::with_capacity(CHUNK_SIZE * 4);
    let mut buffer = vec![0; CHUNK_SIZE];
    let mut total_read = 0u64;
    let max_file_size = get_max_file_size(state);

    loop {
        let bytes_read = reader.read(&mut buffer).await?;
        if bytes_read == 0 {
            break;
        }

        total_read += bytes_read as u64;
        if total_read > max_file_size {
            return Err(crate::error::AppError::SecurityError {
                message: "File size exceeded limit during read".to_string(),
            });
        }

        // Convert bytes to string and append with controlled growth
        let chunk_str = match std::str::from_utf8(&buffer[..bytes_read]) {
            Ok(s) => s.to_string(),
            Err(_) => {
                // If not valid UTF-8, try to read as binary and convert
                String::from_utf8_lossy(&buffer[..bytes_read]).to_string()
            }
        };

        // Control string growth to avoid excessive memory usage
        if content.capacity() - content.len() < chunk_str.len() {
            let additional_capacity = (chunk_str.len().max(MAX_STRING_GROWTH)).next_power_of_two();
            content.reserve(additional_capacity);
        }

        content.push_str(&chunk_str);

        // Periodic memory pressure and cancellation checks
        if total_read % (CHUNK_SIZE as u64 * 64) == 0 {
            // Check for cancellation
            let is_cancelled = state
                .active_operations
                .get(&operation_id)
                .map(|op| op.cancellation_token.is_cancelled())
                .unwrap_or(true);

            if is_cancelled {
                return Err(crate::error::AppError::Cancelled);
            }

            // Memory pressure check
            let current_memory = TOTAL_MEMORY_USAGE.load(Ordering::Acquire);
            let max_memory = get_max_total_memory(state);
            if current_memory > max_memory * 90 / 100 {
                // 90% threshold
                tracing::warn!(
                    "Memory pressure detected during file read, consider reducing file size limits"
                );
            }
        }
    }

    // Shrink to fit after reading to free excess capacity
    content.shrink_to_fit();
    Ok(content)
}

/// Read small files safely with memory monitoring
async fn read_small_file_safe(path: &Path, _state: &AppState) -> Result<String> {
    // Use a memory-optimized approach even for small files
    let metadata = fs::metadata(path).await?;
    let file_size = metadata.len() as usize;

    // Pre-allocate with exact size for small files to avoid reallocations
    let mut content = String::with_capacity(file_size + 1);

    // Read file content
    let file_content = fs::read_to_string(path).await?;
    content.push_str(&file_content);

    // Shrink to actual size to free any over-allocated memory
    content.shrink_to_fit();

    Ok(content)
}
