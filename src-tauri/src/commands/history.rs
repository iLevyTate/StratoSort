use crate::{error::Result, state::AppState};
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, State};

#[derive(Debug, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: String,
    pub operation_type: String,
    pub source: String,
    pub destination: Option<String>,
    pub timestamp: i64,
    pub can_undo: bool,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HistoryState {
    pub can_undo: bool,
    pub can_redo: bool,
    pub undo_count: usize,
    pub redo_count: usize,
}

#[tauri::command]
pub async fn undo(
    state: State<'_, std::sync::Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<UndoResult> {
    let operation = state.undo_redo.undo().await?;

    if let Some(op) = operation {
        // Perform the undo operation
        let success = perform_undo_operation(&op, &state).await?;

        if success {
            app.emit("history-operation-undone", &op)?;
        }

        Ok(UndoResult {
            success,
            operation: Some(op),
            state: get_history_state_internal(&state).await?,
        })
    } else {
        Ok(UndoResult {
            success: false,
            operation: None,
            state: get_history_state_internal(&state).await?,
        })
    }
}

#[tauri::command]
pub async fn redo(
    state: State<'_, std::sync::Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<RedoResult> {
    let operation = state.undo_redo.redo().await?;

    if let Some(op) = operation {
        // Perform the redo operation
        let success = perform_redo_operation(&op, &state).await?;

        if success {
            app.emit("history-operation-redone", &op)?;
        }

        Ok(RedoResult {
            success,
            operation: Some(op),
            state: get_history_state_internal(&state).await?,
        })
    } else {
        Ok(RedoResult {
            success: false,
            operation: None,
            state: get_history_state_internal(&state).await?,
        })
    }
}

#[tauri::command]
pub async fn get_history(
    limit: Option<usize>,
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<Vec<HistoryEntry>> {
    let operations = state
        .database
        .get_recent_operations(limit.unwrap_or(50))
        .await?;

    let entries: Vec<HistoryEntry> = operations
        .into_iter()
        .map(|op| HistoryEntry {
            id: op.id,
            operation_type: op.operation_type,
            source: op.source,
            destination: op.destination,
            timestamp: op.timestamp,
            can_undo: true, // Simplified - in production, check if operation is reversible
            metadata: op.metadata,
        })
        .collect();

    Ok(entries)
}

#[tauri::command]
pub async fn clear_history(
    state: State<'_, std::sync::Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<()> {
    state.undo_redo.clear().await?;

    app.emit("history-cleared", ())?;

    Ok(())
}

#[tauri::command]
pub async fn get_history_state(state: State<'_, std::sync::Arc<AppState>>) -> Result<HistoryState> {
    get_history_state_internal(&state).await
}

#[tauri::command]
pub async fn batch_undo(
    count: usize,
    state: State<'_, std::sync::Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<BatchUndoResult> {
    let mut successful = 0;
    let mut _failed = 0;
    let mut operations = Vec::new();

    for _ in 0..count {
        match state.undo_redo.undo().await {
            Ok(Some(op)) => {
                if perform_undo_operation(&op, &state).await? {
                    successful += 1;
                    operations.push(op);
                } else {
                    _failed += 1;
                    break; // Stop on first failure
                }
            }
            Ok(None) => break, // No more operations to undo
            Err(_) => {
                _failed += 1;
                break;
            }
        }
    }

    if successful > 0 {
        app.emit(
            "history-batch-undo",
            serde_json::json!({
                "count": successful,
                "operations": operations,
            }),
        )?;
    }

    Ok(BatchUndoResult {
        success: successful > 0,
        batch: None, // This is the old batch undo, doesn't use the new batch system
        operations_undone: successful,
        state: get_history_state_internal(&state).await?,
    })
}

#[tauri::command]
pub async fn batch_redo(
    count: usize,
    state: State<'_, std::sync::Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<BatchRedoResult> {
    let mut successful = 0;
    let mut failed = 0;
    let mut operations = Vec::new();

    for _ in 0..count {
        match state.undo_redo.redo().await {
            Ok(Some(op)) => {
                if perform_redo_operation(&op, &state).await? {
                    successful += 1;
                    operations.push(op);
                } else {
                    failed += 1;
                    break;
                }
            }
            Ok(None) => break,
            Err(_) => {
                failed += 1;
                break;
            }
        }
    }

    if successful > 0 {
        app.emit(
            "history-batch-redo",
            serde_json::json!({
                "count": successful,
                "operations": operations,
            }),
        )?;
    }

    Ok(BatchRedoResult {
        successful,
        failed,
        operations,
        state: get_history_state_internal(&state).await?,
    })
}

#[tauri::command]
pub async fn jump_to_history(
    operation_id: String,
    state: State<'_, std::sync::Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<JumpToHistoryResult> {
    let target_operation = state.database.get_operation_by_id(&operation_id).await?;

    if target_operation.is_none() {
        return Ok(JumpToHistoryResult {
            success: false,
            error: Some("Operation not found".to_string()),
            operations_undone: 0,
            operations_redone: 0,
            state: get_history_state_internal(&state).await?,
        });
    }

    let target_op = target_operation.ok_or_else(|| crate::error::AppError::NotFound {
        message: "Target operation not found".to_string(),
    })?;
    let current_history = state.database.get_recent_operations(100).await?;

    // Find the position of the target operation in history
    let target_position = current_history.iter().position(|op| op.id == operation_id);

    if target_position.is_none() {
        return Ok(JumpToHistoryResult {
            success: false,
            error: Some("Operation not found in recent history".to_string()),
            operations_undone: 0,
            operations_redone: 0,
            state: get_history_state_internal(&state).await?,
        });
    }

    let target_pos = target_position.ok_or_else(|| crate::error::AppError::NotFound {
        message: "Operation not found in recent history".to_string(),
    })?;
    let current_undo_count = state.undo_redo.undo_count().await;
    let operations_to_restore = target_pos;

    let mut undone = 0;
    let mut redone = 0;
    let mut success = true;
    let mut error_msg = None;

    // If we need to undo operations (target is older than current position)
    if operations_to_restore < current_undo_count {
        let undo_count = current_undo_count - operations_to_restore;
        for _ in 0..undo_count {
            match state.undo_redo.undo().await {
                Ok(Some(op)) => {
                    if perform_undo_operation(&op, &state).await? {
                        undone += 1;
                    } else {
                        success = false;
                        error_msg =
                            Some(format!("Failed to undo operation: {}", op.operation_type));
                        break;
                    }
                }
                Ok(None) => break,
                Err(e) => {
                    success = false;
                    error_msg = Some(format!("Error during undo: {}", e));
                    break;
                }
            }
        }
    }
    // If we need to redo operations (target is newer than current position)
    else if operations_to_restore > current_undo_count {
        let redo_count = operations_to_restore - current_undo_count;
        for _ in 0..redo_count {
            match state.undo_redo.redo().await {
                Ok(Some(op)) => {
                    if perform_redo_operation(&op, &state).await? {
                        redone += 1;
                    } else {
                        success = false;
                        error_msg =
                            Some(format!("Failed to redo operation: {}", op.operation_type));
                        break;
                    }
                }
                Ok(None) => break,
                Err(e) => {
                    success = false;
                    error_msg = Some(format!("Error during redo: {}", e));
                    break;
                }
            }
        }
    }

    if success {
        app.emit(
            "history-jumped-to",
            serde_json::json!({
                "operation_id": operation_id,
                "target_operation": target_op,
                "undone": undone,
                "redone": redone,
            }),
        )?;
    }

    Ok(JumpToHistoryResult {
        success,
        error: error_msg,
        operations_undone: undone,
        operations_redone: redone,
        state: get_history_state_internal(&state).await?,
    })
}

async fn perform_undo_operation(
    operation: &crate::storage::Operation,
    _state: &AppState,
) -> Result<bool> {
    // Pre-flight checks
    match operation.operation_type.as_str() {
        "move" => {
            // Reverse the move operation
            if let Some(destination) = &operation.destination {
                let source_path = std::path::PathBuf::from(&operation.source);
                let dest_path = std::path::PathBuf::from(destination);

                // Validate that the destination file exists
                if !dest_path.exists() {
                    tracing::warn!(
                        "Cannot undo move: destination file does not exist: {}",
                        destination
                    );
                    return Ok(false);
                }

                // Check if source directory exists
                if let Some(parent) = source_path.parent() {
                    if !parent.exists() {
                        if let Err(e) = tokio::fs::create_dir_all(parent).await {
                            tracing::error!("Failed to create directory for undo move: {}", e);
                            return Ok(false);
                        }
                    }
                }

                // Move file back
                match tokio::fs::rename(&dest_path, &source_path).await {
                    Ok(_) => {
                        tracing::info!(
                            "Successfully undid move: {} -> {}",
                            destination,
                            operation.source
                        );
                        Ok(true)
                    }
                    Err(e) => {
                        tracing::warn!("Failed to rename during undo, trying copy+delete: {}", e);
                        // Try copy + delete
                        match tokio::fs::copy(&dest_path, &source_path).await {
                            Ok(_) => match tokio::fs::remove_file(&dest_path).await {
                                Ok(_) => {
                                    tracing::info!(
                                        "Successfully undid move via copy+delete: {} -> {}",
                                        destination,
                                        operation.source
                                    );
                                    Ok(true)
                                }
                                Err(e) => {
                                    tracing::error!(
                                        "Failed to remove original after copy during undo: {}",
                                        e
                                    );
                                    Ok(false)
                                }
                            },
                            Err(e) => {
                                tracing::error!("Failed to copy during undo: {}", e);
                                Ok(false)
                            }
                        }
                    }
                }
            } else {
                tracing::error!("Cannot undo move: missing destination path");
                Ok(false)
            }
        }
        "copy" => {
            // Delete the copied file
            if let Some(destination) = &operation.destination {
                let dest_path = std::path::PathBuf::from(destination);
                if dest_path.exists() {
                    match tokio::fs::remove_file(destination).await {
                        Ok(_) => {
                            tracing::info!("Successfully undid copy by removing: {}", destination);
                            Ok(true)
                        }
                        Err(e) => {
                            tracing::error!("Failed to remove copied file during undo: {}", e);
                            Ok(false)
                        }
                    }
                } else {
                    tracing::warn!("Cannot undo copy: file does not exist: {}", destination);
                    Ok(false)
                }
            } else {
                tracing::error!("Cannot undo copy: missing destination path");
                Ok(false)
            }
        }
        "delete" => {
            // Restore from backup if available
            if let Some(metadata) = &operation.metadata {
                if let Some(backup_content_b64) = metadata.get("backup_content") {
                    if let Some(backup_str) = backup_content_b64.as_str() {
                        match BASE64_STANDARD.decode(backup_str) {
                            Ok(backup_content) => {
                                // Ensure directory exists
                                let source_path = std::path::PathBuf::from(&operation.source);
                                if let Some(parent) = source_path.parent() {
                                    if !parent.exists() {
                                        if let Err(e) = tokio::fs::create_dir_all(parent).await {
                                            tracing::error!(
                                                "Failed to create directory for undo delete: {}",
                                                e
                                            );
                                            return Ok(false);
                                        }
                                    }
                                }

                                match tokio::fs::write(&operation.source, backup_content).await {
                                    Ok(_) => {
                                        tracing::info!(
                                            "Successfully restored deleted file: {}",
                                            operation.source
                                        );
                                        Ok(true)
                                    }
                                    Err(e) => {
                                        tracing::error!("Failed to restore deleted file: {}", e);
                                        Ok(false)
                                    }
                                }
                            }
                            Err(e) => {
                                tracing::error!("Failed to decode backup content: {}", e);
                                Ok(false)
                            }
                        }
                    } else {
                        tracing::error!("Invalid backup content format");
                        Ok(false)
                    }
                } else {
                    tracing::warn!(
                        "Cannot undo delete: no backup content available for {}",
                        operation.source
                    );
                    Ok(false)
                }
            } else {
                tracing::warn!(
                    "Cannot undo delete: no metadata available for {}",
                    operation.source
                );
                Ok(false)
            }
        }
        "create" => {
            // Undo create by deleting the file
            let source_path = std::path::PathBuf::from(&operation.source);
            if source_path.exists() {
                match tokio::fs::remove_file(&operation.source).await {
                    Ok(_) => {
                        tracing::info!(
                            "Successfully undid create by removing: {}",
                            operation.source
                        );
                        Ok(true)
                    }
                    Err(e) => {
                        tracing::error!("Failed to remove created file during undo: {}", e);
                        Ok(false)
                    }
                }
            } else {
                tracing::warn!(
                    "Cannot undo create: file does not exist: {}",
                    operation.source
                );
                Ok(false)
            }
        }
        "rename" => {
            // Reverse the rename
            if let Some(destination) = &operation.destination {
                let dest_path = std::path::PathBuf::from(destination);
                let source_path = std::path::PathBuf::from(&operation.source);

                if !dest_path.exists() {
                    tracing::warn!(
                        "Cannot undo rename: renamed file does not exist: {}",
                        destination
                    );
                    return Ok(false);
                }

                // Check if source directory exists
                if let Some(parent) = source_path.parent() {
                    if !parent.exists() {
                        if let Err(e) = tokio::fs::create_dir_all(parent).await {
                            tracing::error!("Failed to create directory for undo rename: {}", e);
                            return Ok(false);
                        }
                    }
                }

                match tokio::fs::rename(destination, &operation.source).await {
                    Ok(_) => {
                        tracing::info!(
                            "Successfully undid rename: {} -> {}",
                            destination,
                            operation.source
                        );
                        Ok(true)
                    }
                    Err(e) => {
                        tracing::error!("Failed to undo rename: {}", e);
                        Ok(false)
                    }
                }
            } else {
                tracing::error!("Cannot undo rename: missing destination path");
                Ok(false)
            }
        }
        _ => Ok(false),
    }
}

async fn perform_redo_operation(
    operation: &crate::storage::Operation,
    _state: &AppState,
) -> Result<bool> {
    match operation.operation_type.as_str() {
        "move" | "rename" => {
            if let Some(destination) = &operation.destination {
                let source_path = std::path::PathBuf::from(&operation.source);
                let dest_path = std::path::PathBuf::from(destination);

                // Validate source exists
                if !source_path.exists() {
                    tracing::warn!(
                        "Cannot redo {}: source file does not exist: {}",
                        operation.operation_type,
                        operation.source
                    );
                    return Ok(false);
                }

                // Ensure destination directory exists
                if let Some(parent) = dest_path.parent() {
                    if !parent.exists() {
                        if let Err(e) = tokio::fs::create_dir_all(parent).await {
                            tracing::error!(
                                "Failed to create directory for redo {}: {}",
                                operation.operation_type,
                                e
                            );
                            return Ok(false);
                        }
                    }
                }

                match tokio::fs::rename(&source_path, &dest_path).await {
                    Ok(_) => {
                        tracing::info!(
                            "Successfully redid {}: {} -> {}",
                            operation.operation_type,
                            operation.source,
                            destination
                        );
                        Ok(true)
                    }
                    Err(e) => {
                        tracing::warn!("Failed to rename during redo, trying copy+delete: {}", e);
                        match tokio::fs::copy(&source_path, &dest_path).await {
                            Ok(_) => match tokio::fs::remove_file(&source_path).await {
                                Ok(_) => {
                                    tracing::info!(
                                        "Successfully redid {} via copy+delete: {} -> {}",
                                        operation.operation_type,
                                        operation.source,
                                        destination
                                    );
                                    Ok(true)
                                }
                                Err(e) => {
                                    tracing::error!(
                                        "Failed to remove source after copy during redo: {}",
                                        e
                                    );
                                    Ok(false)
                                }
                            },
                            Err(e) => {
                                tracing::error!("Failed to copy during redo: {}", e);
                                Ok(false)
                            }
                        }
                    }
                }
            } else {
                tracing::error!(
                    "Cannot redo {}: missing destination path",
                    operation.operation_type
                );
                Ok(false)
            }
        }
        "copy" => {
            if let Some(destination) = &operation.destination {
                let source_path = std::path::PathBuf::from(&operation.source);
                let dest_path = std::path::PathBuf::from(destination);

                // Validate source exists
                if !source_path.exists() {
                    tracing::warn!(
                        "Cannot redo copy: source file does not exist: {}",
                        operation.source
                    );
                    return Ok(false);
                }

                // Ensure destination directory exists
                if let Some(parent) = dest_path.parent() {
                    if !parent.exists() {
                        if let Err(e) = tokio::fs::create_dir_all(parent).await {
                            tracing::error!("Failed to create directory for redo copy: {}", e);
                            return Ok(false);
                        }
                    }
                }

                match tokio::fs::copy(&operation.source, destination).await {
                    Ok(_) => {
                        tracing::info!(
                            "Successfully redid copy: {} -> {}",
                            operation.source,
                            destination
                        );
                        Ok(true)
                    }
                    Err(e) => {
                        tracing::error!("Failed to redo copy: {}", e);
                        Ok(false)
                    }
                }
            } else {
                tracing::error!("Cannot redo copy: missing destination path");
                Ok(false)
            }
        }
        "delete" => {
            let source_path = std::path::PathBuf::from(&operation.source);

            if !source_path.exists() {
                tracing::warn!(
                    "Cannot redo delete: file does not exist: {}",
                    operation.source
                );
                return Ok(false);
            }

            match tokio::fs::remove_file(&operation.source).await {
                Ok(_) => {
                    tracing::info!("Successfully redid delete: {}", operation.source);
                    Ok(true)
                }
                Err(e) => {
                    tracing::error!("Failed to redo delete: {}", e);
                    Ok(false)
                }
            }
        }
        "create" => {
            // Redo create - this is tricky as we need original content
            // For now, we'll create an empty file if it doesn't exist
            let source_path = std::path::PathBuf::from(&operation.source);

            if source_path.exists() {
                tracing::warn!(
                    "Cannot redo create: file already exists: {}",
                    operation.source
                );
                return Ok(false);
            }

            // Ensure directory exists
            if let Some(parent) = source_path.parent() {
                if !parent.exists() {
                    if let Err(e) = tokio::fs::create_dir_all(parent).await {
                        tracing::error!("Failed to create directory for redo create: {}", e);
                        return Ok(false);
                    }
                }
            }

            // Try to restore original content if available in metadata
            let content = if let Some(metadata) = &operation.metadata {
                if let Some(original_content_b64) = metadata.get("original_content") {
                    if let Some(content_str) = original_content_b64.as_str() {
                        BASE64_STANDARD.decode(content_str).unwrap_or_default()
                    } else {
                        Vec::new()
                    }
                } else {
                    Vec::new()
                }
            } else {
                Vec::new()
            };

            match tokio::fs::write(&operation.source, content).await {
                Ok(_) => {
                    tracing::info!("Successfully redid create: {}", operation.source);
                    Ok(true)
                }
                Err(e) => {
                    tracing::error!("Failed to redo create: {}", e);
                    Ok(false)
                }
            }
        }
        _ => {
            tracing::warn!(
                "Unknown operation type for redo: {}",
                operation.operation_type
            );
            Ok(false)
        }
    }
}

async fn get_history_state_internal(state: &AppState) -> Result<HistoryState> {
    let can_undo = state.undo_redo.can_undo().await;
    let can_redo = state.undo_redo.can_redo().await;
    let undo_count = state.undo_redo.undo_count().await;
    let redo_count = state.undo_redo.redo_count().await;

    Ok(HistoryState {
        can_undo,
        can_redo,
        undo_count,
        redo_count,
    })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UndoResult {
    pub success: bool,
    pub operation: Option<crate::storage::Operation>,
    pub state: HistoryState,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BatchUndoResult {
    pub success: bool,
    pub batch: Option<crate::core::undo_redo::BatchOperation>,
    pub operations_undone: usize,
    pub state: HistoryState,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RedoResult {
    pub success: bool,
    pub operation: Option<crate::storage::Operation>,
    pub state: HistoryState,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BatchRedoResult {
    pub successful: usize,
    pub failed: usize,
    pub operations: Vec<crate::storage::Operation>,
    pub state: HistoryState,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct JumpToHistoryResult {
    pub success: bool,
    pub error: Option<String>,
    pub operations_undone: usize,
    pub operations_redone: usize,
    pub state: HistoryState,
}

#[tauri::command]
pub async fn get_memory_stats(
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<crate::core::undo_redo::MemoryStats> {
    Ok(state.undo_redo.get_memory_stats().await)
}

/// Undo the most recent batch operation
#[tauri::command]
pub async fn undo_batch(
    state: State<'_, std::sync::Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<BatchUndoResult> {
    let batch = state.undo_redo.undo_batch().await?;

    if let Some(batch_op) = &batch {
        // Perform undo for all operations in the batch (in reverse order)
        let mut operations_undone = 0;

        for operation in batch_op.operations.iter().rev() {
            if perform_undo_operation(operation, &state).await? {
                operations_undone += 1;
            }
        }

        // Emit event for batch undo completion
        let _ = app.emit("batch-operation-undone", serde_json::json!({
            "batch_id": batch_op.id,
            "operations_undone": operations_undone,
            "total_operations": batch_op.operations.len(),
        }));

        Ok(BatchUndoResult {
            success: true,
            batch: Some(batch_op.clone()),
            operations_undone,
            state: get_history_state_internal(&state).await?,
        })
    } else {
        Ok(BatchUndoResult {
            success: false,
            batch: None,
            operations_undone: 0,
            state: get_history_state_internal(&state).await?,
        })
    }
}

/// Redo the most recent undone batch operation
#[tauri::command]
pub async fn redo_batch(
    state: State<'_, std::sync::Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<BatchUndoResult> {
    let batch = state.undo_redo.redo_batch().await?;

    if let Some(batch_op) = &batch {
        // Perform redo for all operations in the batch (in forward order)
        let mut operations_redone = 0;

        for operation in &batch_op.operations {
            if perform_redo_operation(operation, &state).await? {
                operations_redone += 1;
            }
        }

        // Emit event for batch redo completion
        let _ = app.emit("batch-operation-redone", serde_json::json!({
            "batch_id": batch_op.id,
            "operations_redone": operations_redone,
            "total_operations": batch_op.operations.len(),
        }));

        Ok(BatchUndoResult {
            success: true,
            batch: Some(batch_op.clone()),
            operations_undone: operations_redone, // Note: using operations_undone for consistency
            state: get_history_state_internal(&state).await?,
        })
    } else {
        Ok(BatchUndoResult {
            success: false,
            batch: None,
            operations_undone: 0,
            state: get_history_state_internal(&state).await?,
        })
    }
}

/// Check if batch undo is available
#[tauri::command]
pub async fn can_undo_batch(
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<bool> {
    Ok(state.undo_redo.can_undo_batch().await)
}

/// Check if batch redo is available
#[tauri::command]
pub async fn can_redo_batch(
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<bool> {
    Ok(state.undo_redo.can_redo_batch().await)
}