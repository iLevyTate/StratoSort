use crate::{core::ProtectedFolder, error::Result, state::AppState};
use chrono::Utc;
use serde::Deserialize;
use std::sync::Arc;
use tauri::{Emitter, State};
use uuid::Uuid;

/// Request to create a protected folder
#[derive(Debug, Deserialize)]
pub struct CreateProtectedFolderRequest {
    pub path: String,
    pub reason: Option<String>,
}

/// Request to update a protected folder
#[derive(Debug, Deserialize)]
pub struct UpdateProtectedFolderRequest {
    pub id: String,
    pub path: String,
    pub reason: Option<String>,
}

/// List all protected folders
#[tauri::command]
pub async fn list_protected_folders(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ProtectedFolder>> {
    state.protected_folders.list().await
}

/// Create a new protected folder
#[tauri::command]
pub async fn create_protected_folder(
    request: CreateProtectedFolderRequest,
    state: State<'_, Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<ProtectedFolder> {
    let folder = ProtectedFolder {
        id: Uuid::new_v4().to_string(),
        path: request.path,
        reason: request.reason,
        created_at: Utc::now().timestamp(),
        updated_at: None,
    };

    state.protected_folders.create(folder.clone()).await?;

    // Emit event for UI updates
    let _ = app.emit("protected-folder-created", &folder);

    Ok(folder)
}

/// Update an existing protected folder
#[tauri::command]
pub async fn update_protected_folder(
    request: UpdateProtectedFolderRequest,
    state: State<'_, Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<ProtectedFolder> {
    let mut folder = state
        .protected_folders
        .list()
        .await?
        .into_iter()
        .find(|f| f.id == request.id)
        .ok_or_else(|| crate::error::AppError::NotFound {
            message: format!("Protected folder with id {} not found", request.id),
        })?;

    folder.path = request.path;
    folder.reason = request.reason;
    folder.updated_at = Some(Utc::now().timestamp());

    state.protected_folders.update(folder.clone()).await?;

    // Emit event for UI updates
    let _ = app.emit("protected-folder-updated", &folder);

    Ok(folder)
}

/// Delete a protected folder
#[tauri::command]
pub async fn delete_protected_folder(
    id: String,
    state: State<'_, Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<()> {
    state.protected_folders.delete(&id).await?;

    // Emit event for UI updates
    let _ = app.emit("protected-folder-deleted", &id);

    Ok(())
}

/// Check if a path is protected
#[tauri::command]
pub async fn is_path_protected(path: String, state: State<'_, Arc<AppState>>) -> Result<bool> {
    state.protected_folders.is_path_protected(&path).await
}
