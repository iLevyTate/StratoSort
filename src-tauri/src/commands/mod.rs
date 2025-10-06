pub mod ai;
pub mod ai_status;
pub mod diagnostics;
pub mod duplicates;
pub mod files;
pub mod folder_guidance;
pub mod history;
pub mod monitoring;
pub mod naming;
pub mod notifications;
pub mod organization;
pub mod patterns;
pub mod protected_folders;
pub mod quarantine;
pub mod semantic;
pub mod settings;
pub mod setup;
pub mod stratosort;
pub mod system;
pub mod watch_mode;

use crate::state::AppState;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, State};
use tracing::info;

#[tauri::command]
pub async fn cancel_operation(
    id: String,
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<bool, crate::error::AppError> {
    use uuid::Uuid;
    let uuid = Uuid::parse_str(&id).map_err(|_| crate::error::AppError::InvalidInput {
        message: "Invalid UUID".into(),
    })?;
    Ok(state.cancel_operation(uuid))
}

/// Get all active operations with their current status
#[tauri::command]
pub async fn get_active_operations(
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<Vec<ActiveOperationInfo>, crate::error::AppError> {
    let operations = state
        .active_operations
        .iter()
        .map(|entry| {
            let (id, status) = entry.pair();
            ActiveOperationInfo {
                id: id.to_string(),
                operation_type: status.operation_type.clone(),
                progress: status.progress,
                message: status.message.clone(),
                can_cancel: !status.cancellation_token.is_cancelled(),
                started_at: status.started_at,
            }
        })
        .collect();

    Ok(operations)
}

/// Internal helper function for get_active_operations that works with direct AppState reference
pub async fn get_active_operations_internal(
    state: &AppState,
) -> Result<Vec<ActiveOperationInfo>, crate::error::AppError> {
    let operations = state
        .active_operations
        .iter()
        .map(|entry| {
            let (id, status) = entry.pair();
            ActiveOperationInfo {
                id: id.to_string(),
                operation_type: status.operation_type.clone(),
                progress: status.progress,
                message: status.message.clone(),
                can_cancel: !status.cancellation_token.is_cancelled(),
                started_at: status.started_at,
            }
        })
        .collect();

    Ok(operations)
}

/// Get detailed progress information for a specific operation
#[tauri::command]
pub async fn get_operation_progress(
    id: String,
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<Option<ActiveOperationInfo>, crate::error::AppError> {
    use uuid::Uuid;
    let uuid = Uuid::parse_str(&id).map_err(|_| crate::error::AppError::InvalidInput {
        message: "Invalid UUID".into(),
    })?;

    if let Some(status) = state.active_operations.get(&uuid) {
        Ok(Some(ActiveOperationInfo {
            id,
            operation_type: status.operation_type.clone(),
            progress: status.progress,
            message: status.message.clone(),
            can_cancel: !status.cancellation_token.is_cancelled(),
            started_at: chrono::Utc::now(), // Would be better to track actual start time
        }))
    } else {
        Ok(None)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActiveOperationInfo {
    pub id: String,
    pub operation_type: crate::state::OperationType,
    pub progress: f32,
    pub message: String,
    pub can_cancel: bool,
    pub started_at: chrono::DateTime<chrono::Utc>,
}

/// Track user analytics events (privacy-first implementation)
#[tauri::command]
pub async fn track_event(
    event_name: String,
    properties: serde_json::Value,
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<(), crate::error::AppError> {
    // Simple privacy-first analytics - only logs locally for now
    // In production, this could be extended to send to analytics services
    info!(
        "Analytics Event: {} with properties: {}",
        event_name, properties
    );

    // Store in local analytics (could be extended to send to external service)
    let _ = state.analytics.track_event(&event_name, properties).await;

    Ok(())
}

/// Get basic usage statistics
#[tauri::command]
pub async fn get_usage_stats(
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<serde_json::Value, crate::error::AppError> {
    // Return basic anonymized usage statistics
    let stats = state.analytics.get_usage_stats().await?;
    Ok(stats)
}

/// Prevent screen sleep during operations (basic implementation)
#[tauri::command]
pub async fn prevent_sleep(
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<(), crate::error::AppError> {
    // Basic implementation - in production would use system APIs
    // For now, we'll track that sleep prevention is requested
    let _ = track_event(
        "sleep_prevention_activated".to_string(),
        serde_json::json!({"reason": "long_operation"}),
        state,
    )
    .await;

    info!("Screen sleep prevention activated for long-running operation");
    Ok(())
}

/// Allow screen sleep again
#[tauri::command]
pub async fn allow_sleep(
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<(), crate::error::AppError> {
    let _ = track_event(
        "sleep_prevention_deactivated".to_string(),
        serde_json::json!({}),
        state,
    )
    .await;

    info!("Screen sleep prevention deactivated");
    Ok(())
}

/// Show context menu for file operations (custom implementation without GTK)
#[tauri::command]
pub async fn show_context_menu(
    window: tauri::Window,
    x: f64,
    y: f64,
    items: Vec<ContextMenuItem>,
) -> Result<(), crate::error::AppError> {
    // Custom context menu implementation that avoids GTK linking conflicts
    // Emit an event to the frontend to display a custom context menu

    window
        .emit(
            "context-menu-request",
            serde_json::json!({
                "x": x,
                "y": y,
                "items": items
            }),
        )
        .map_err(|e| {
            crate::error::AppError::Io(std::io::Error::other(format!(
                "Context menu event emission failed: {}",
                e
            )))
        })?;

    Ok(())
}

/// Handle context menu item selection from frontend
#[tauri::command]
pub async fn handle_context_menu_selection(
    selection: String,
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<(), crate::error::AppError> {
    // Track context menu usage for analytics
    let _ = state
        .analytics
        .track_event(
            "context_menu_used",
            serde_json::json!({
                "action": selection
            }),
        )
        .await;

    info!("Context menu action selected: {}", selection);
    Ok(())
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ContextMenuItem {
    pub label: String,
    pub action: String,
    pub enabled: Option<bool>,
}

// Command modules - accessed via full paths in lib.rs
