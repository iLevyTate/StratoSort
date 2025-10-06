use crate::{
    automation::orchestrator::{OperationType, PreviewOperation, PreviewTree, ProcessingStats},
    error::Result,
    state::AppState,
};
use serde::Deserialize;
use std::sync::Arc;
use tauri::{Emitter, State};

/// StratoSort preview request
#[derive(Debug, Deserialize)]
pub struct StratoSortPreviewRequest {
    pub directory_path: String,
}

/// StratoSort apply request
#[derive(Debug, Deserialize)]
pub struct StratoSortApplyRequest {
    pub operations: Vec<PreviewOperation>,
}

/// StratoSort learn request
#[derive(Debug, Deserialize)]
pub struct StratoSortLearnRequest {
    pub source_path: String,
    pub target_path: String,
}

/// Generate StratoSort preview tree (<500ms guarantee)
#[tauri::command]
pub async fn stratosort_preview(
    request: StratoSortPreviewRequest,
    state: State<'_, Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<PreviewTree> {
    let preview_tree = {
        let state_ref = &state;
        state
            .stratosort_orchestrator
            .generate_preview_tree(&request.directory_path, (*state_ref).clone())
            .await?
    };

    // Emit event for preview ready
    let _ = app.emit(
        "organization-preview-ready",
        serde_json::json!({
            "preview_tree": preview_tree,
            "directory": request.directory_path
        }),
    );

    Ok(preview_tree)
}

/// Apply StratoSort operations
#[tauri::command]
pub async fn stratosort_apply(
    request: StratoSortApplyRequest,
    state: State<'_, Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<Vec<String>> {
    let mut applied_files = Vec::new();

    for operation in request.operations {
        match operation.operation_type {
            OperationType::Move => {
                // Validate source and target paths
                let validated_source = crate::utils::security::validate_and_sanitize_path(&operation.source_path, &app)
                    .map_err(|_| crate::error::AppError::SecurityError {
                        message: "Invalid source path provided".to_string(),
                    })?;
                let validated_target = crate::utils::security::validate_and_sanitize_path(&operation.target_path, &app)
                    .map_err(|_| crate::error::AppError::SecurityError {
                        message: "Invalid target path provided".to_string(),
                    })?;

                let source_path = validated_source.canonical().to_string_lossy().to_string();
                let target_path = validated_target.canonical().to_string_lossy().to_string();

                // Perform the move operation
                match tokio::fs::rename(&source_path, &target_path).await {
                    Ok(_) => {
                        applied_files.push(source_path.clone());

                        // Learn from this move for future auto-application
                        if let Err(e) = state
                            .stratosort_orchestrator
                            .learn_from_action(&source_path, &target_path)
                            .await
                        {
                            tracing::warn!("Failed to learn from move operation: {}", e);
                        }

                        // Auto-quarantine moved file
                        if let Err(e) = state
                            .quarantine_manager
                            .auto_quarantine_moved_file(
                                &target_path,
                                &source_path,
                            )
                            .await
                        {
                            tracing::warn!("Failed to quarantine moved file: {}", e);
                        }

                        // Emit success event
                        let _ = app.emit(
                            "file-moved",
                            serde_json::json!({
                                "source": source_path,
                                "target": target_path,
                                "confidence": operation.confidence
                            }),
                        );
                    }
                    Err(e) => {
                        tracing::error!("Failed to move file {}: {}", source_path, e);
                        let _ = app.emit(
                            "file-move-failed",
                            serde_json::json!({
                                "source": source_path,
                                "target": target_path,
                                "error": e.to_string()
                            }),
                        );
                    }
                }
            }
            _ => {
                // Other operation types can be implemented later
                tracing::warn!("Unsupported operation type: {:?}", operation.operation_type);
            }
        }
    }

    Ok(applied_files)
}

/// Learn from user action for StratoSort pattern recognition
#[tauri::command]
pub async fn stratosort_learn(
    request: StratoSortLearnRequest,
    state: State<'_, Arc<AppState>>,
) -> Result<()> {
    state
        .stratosort_orchestrator
        .learn_from_action(&request.source_path, &request.target_path)
        .await?;

    // Check if this triggers auto-application for similar files
    if let Ok(Some(suggestion)) = state
        .stratosort_orchestrator
        .try_auto_apply(&request.source_path)
        .await
    {
        // Emit event for potential auto-application
        let _ = state.handle.emit(
            "pattern-detected",
            serde_json::json!({
                "source_path": request.source_path,
                "target_folder": suggestion.target_folder,
                "confidence": suggestion.confidence,
                "auto_apply": true
            }),
        );
    }

    Ok(())
}

/// Get StratoSort processing statistics
#[tauri::command]
pub async fn stratosort_get_stats(state: State<'_, Arc<AppState>>) -> Result<ProcessingStats> {
    Ok(state.stratosort_orchestrator.get_stats().await)
}

/// Try auto-apply learned patterns to a file
#[tauri::command]
pub async fn stratosort_try_auto_apply(
    file_path: String,
    state: State<'_, Arc<AppState>>,
) -> Result<Option<crate::ai::OrganizationSuggestion>> {
    state
        .stratosort_orchestrator
        .try_auto_apply(&file_path)
        .await
}
