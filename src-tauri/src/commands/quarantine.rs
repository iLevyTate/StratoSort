use crate::{error::Result, state::AppState};
use std::sync::Arc;
use tauri::{Emitter, State};

/// Get all quarantined files
#[tauri::command]
pub async fn get_quarantined_files(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<crate::core::quarantine_manager::QuarantinedFile>> {
    state.quarantine_manager.get_quarantined_files().await
}

/// Release a file from quarantine
#[tauri::command]
pub async fn release_from_quarantine(
    file_path: String,
    state: State<'_, Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<()> {
    state
        .quarantine_manager
        .release_from_quarantine(&file_path)
        .await?;

    // Emit event for UI updates
    let _ = app.emit(
        "file-released-from-quarantine",
        serde_json::json!({
            "file_path": file_path
        }),
    );

    Ok(())
}

/// Release all expired quarantines
#[tauri::command]
pub async fn release_expired_quarantines(
    state: State<'_, Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<usize> {
    let released_count = state
        .quarantine_manager
        .release_expired_quarantines()
        .await?;

    if released_count > 0 {
        let _ = app.emit(
            "expired-quarantines-released",
            serde_json::json!({
                "count": released_count
            }),
        );
    }

    Ok(released_count)
}

/// Get quarantine statistics
#[tauri::command]
pub async fn get_quarantine_stats(
    state: State<'_, Arc<AppState>>,
) -> Result<crate::core::quarantine_manager::QuarantineStats> {
    state.quarantine_manager.get_quarantine_stats().await
}

/// Check if a file is quarantined
#[tauri::command]
pub async fn is_file_quarantined(
    file_path: String,
    state: State<'_, Arc<AppState>>,
) -> Result<bool> {
    state
        .quarantine_manager
        .is_file_quarantined(&file_path)
        .await
}

/// Get quarantine info for a file
#[tauri::command]
pub async fn get_quarantine_info(
    file_path: String,
    state: State<'_, Arc<AppState>>,
) -> Result<Option<crate::core::quarantine_manager::QuarantinedFile>> {
    state
        .quarantine_manager
        .get_quarantine_info(&file_path)
        .await
}

/// Clean up old quarantine records
#[tauri::command]
pub async fn cleanup_old_quarantines(
    days_old: i64,
    state: State<'_, Arc<AppState>>,
) -> Result<usize> {
    state
        .quarantine_manager
        .cleanup_old_quarantines(days_old)
        .await
}
