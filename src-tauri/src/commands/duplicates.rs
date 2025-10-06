use crate::{core::DuplicateDetectorManager, error::Result, state::AppState};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{Emitter, State};

/// Information about duplicate files
#[derive(Debug, Serialize, Deserialize)]
pub struct DuplicateInfo {
    pub file_path: String,
    pub hash: String,
    pub size: i64,
    pub group_id: String,
}

/// Request to scan for duplicates in a directory
#[derive(Debug, Deserialize)]
pub struct ScanDuplicatesRequest {
    pub directory_path: String,
    pub recursive: bool,
}

/// Get all duplicate groups
#[tauri::command]
pub async fn get_duplicate_groups(
    state: State<'_, Arc<AppState>>,
) -> Result<
    Vec<(
        crate::core::duplicate_detector::DuplicateGroup,
        Vec<crate::core::duplicate_detector::DuplicateGroupMember>,
    )>,
> {
    state.duplicate_detector.get_duplicate_groups().await
}

/// Scan a directory for duplicate files
#[tauri::command]
pub async fn scan_for_duplicates(
    request: ScanDuplicatesRequest,
    state: State<'_, Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<Vec<DuplicateInfo>> {
    use walkdir::WalkDir;

    let mut duplicates = Vec::new();

    // Validate and sanitize the directory path
    let validated_path = crate::utils::security::validate_and_sanitize_path(&request.directory_path, &app)
        .map_err(|_| crate::error::AppError::SecurityError {
            message: "Invalid directory path provided".to_string(),
        })?;

    let directory_path = validated_path.canonical().to_string_lossy().to_string();

    // Check if directory exists
    if !tokio::fs::metadata(&directory_path).await?.is_dir() {
        return Err(crate::error::AppError::FileNotFound {
            path: format!("Directory not found: {}", directory_path),
        });
    }

    // Check if directory is protected
    if state
        .protected_folders
        .is_path_protected(&directory_path)
        .await?
    {
        return Err(crate::error::AppError::SecurityError {
            message: format!(
                "Cannot scan protected directory: {}",
                directory_path
            ),
        });
    }

    // Start operation tracking
    let operation_id = state.start_operation(
        crate::state::OperationType::FileAnalysis,
        format!("Scanning for duplicates in: {}", directory_path),
    );

    let mut processed_files = 0;

    if request.recursive {
        for entry in WalkDir::new(&directory_path)
            .max_depth(10) // Limit depth to prevent infinite recursion
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if entry.file_type().is_file() {
                // Check for cancellation
                if let Some(op) = state.active_operations.get(&operation_id) {
                    if op.cancellation_token.is_cancelled() {
                        state.complete_operation(operation_id);
                        return Err(crate::error::AppError::Cancelled);
                    }
                }

                let file_path = entry.path().to_string_lossy().to_string();

                // Check if file is protected
                if state
                    .protected_folders
                    .is_path_protected(&file_path)
                    .await
                    .unwrap_or(false)
                {
                    continue; // Skip protected files
                }

                // Process file for duplicates
                if let Ok(Some(group_id)) = state
                    .duplicate_detector
                    .process_file_for_duplicates(&file_path)
                    .await
                {
                    // Get file info to return
                    if let Ok(metadata) = tokio::fs::metadata(&file_path).await {
                        if let Ok(hash) =
                            DuplicateDetectorManager::calculate_file_hash(&file_path).await
                        {
                            duplicates.push(DuplicateInfo {
                                file_path: file_path.clone(),
                                hash: hash.clone(),
                                size: metadata.len() as i64,
                                group_id: group_id.clone(),
                            });

                            // Emit event for found duplicate
                            let _ = app.emit(
                                "duplicate-found",
                                serde_json::json!({
                                    "file_path": file_path.clone(),
                                    "group_id": group_id.clone(),
                                    "hash": hash.clone(),
                                    "size": metadata.len()
                                }),
                            );
                        }
                    }
                }

                processed_files += 1;

                // Update progress periodically
                if processed_files % 100 == 0 {
                    let progress = 0.1 + (0.9 * processed_files as f32 / 1000.0); // Estimate
                    state.update_progress(
                        operation_id,
                        progress.min(0.9),
                        format!("Processed {} files", processed_files),
                    );
                }
            }
        }
    } else {
        // Non-recursive scan
        let mut entries = tokio::fs::read_dir(&directory_path).await?;

        while let Some(entry) = entries.next_entry().await? {
            if entry.file_type().await?.is_file() {
                // Check for cancellation
                if let Some(op) = state.active_operations.get(&operation_id) {
                    if op.cancellation_token.is_cancelled() {
                        state.complete_operation(operation_id);
                        return Err(crate::error::AppError::Cancelled);
                    }
                }

                let file_path = entry.path().to_string_lossy().to_string();

                // Check if file is protected
                if state
                    .protected_folders
                    .is_path_protected(&file_path)
                    .await
                    .unwrap_or(false)
                {
                    continue; // Skip protected files
                }

                // Process file for duplicates
                if let Ok(Some(group_id)) = state
                    .duplicate_detector
                    .process_file_for_duplicates(&file_path)
                    .await
                {
                    // Get file info to return
                    if let Ok(metadata) = tokio::fs::metadata(&file_path).await {
                        if let Ok(hash) =
                            DuplicateDetectorManager::calculate_file_hash(&file_path).await
                        {
                            duplicates.push(DuplicateInfo {
                                file_path: file_path.clone(),
                                hash: hash.clone(),
                                size: metadata.len() as i64,
                                group_id: group_id.clone(),
                            });

                            // Emit event for found duplicate
                            let _ = app.emit(
                                "duplicate-found",
                                serde_json::json!({
                                    "file_path": file_path.clone(),
                                    "group_id": group_id.clone(),
                                    "hash": hash.clone(),
                                    "size": metadata.len()
                                }),
                            );
                        }
                    }
                }

                processed_files += 1;
            }
        }
    }

    // Complete operation
    state.update_progress(
        operation_id,
        1.0,
        format!("Found {} duplicates", duplicates.len()),
    );
    state.complete_operation(operation_id);

    Ok(duplicates)
}

/// Get duplicates for a specific file
#[tauri::command]
pub async fn get_duplicates_for_file(
    file_path: String,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<String>> {
    state
        .duplicate_detector
        .get_duplicates_for_file(&file_path)
        .await
}

/// Clean up old duplicate records
#[tauri::command]
pub async fn cleanup_old_duplicates(
    days_old: i64,
    state: State<'_, Arc<AppState>>,
) -> Result<usize> {
    state
        .duplicate_detector
        .cleanup_old_duplicates(days_old)
        .await
}
