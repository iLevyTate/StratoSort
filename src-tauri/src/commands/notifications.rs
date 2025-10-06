use crate::{error::Result, state::AppState};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Notification {
    pub id: String,
    pub notification_type: NotificationType,
    pub title: String,
    pub message: String,
    pub timestamp: i64,
    pub read: bool,
    pub actions: Vec<NotificationAction>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum NotificationType {
    Success,
    Info,
    Warning,
    Error,
    Progress,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NotificationAction {
    pub id: String,
    pub label: String,
    pub action_type: ActionType,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum ActionType {
    Dismiss,
    Retry,
    Undo,
    OpenFile,
    OpenFolder,
    ViewDetails,
}

#[tauri::command]
pub async fn emit_notification(
    notification_type: String,
    title: String,
    message: String,
    actions: Option<Vec<NotificationAction>>,
    metadata: Option<serde_json::Value>,
    state: State<'_, std::sync::Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<String> {
    let id = uuid::Uuid::new_v4().to_string();
    let timestamp = chrono::Utc::now().timestamp();

    let notification_type = match notification_type.as_str() {
        "success" => NotificationType::Success,
        "info" => NotificationType::Info,
        "warning" => NotificationType::Warning,
        "error" => NotificationType::Error,
        "progress" => NotificationType::Progress,
        _ => NotificationType::Info,
    };

    let notification = Notification {
        id: id.clone(),
        notification_type: notification_type.clone(),
        title: title.clone(),
        message: message.clone(),
        timestamp,
        read: false,
        actions: actions.unwrap_or_default(),
        metadata,
    };

    // Store notification in database for persistence
    if let Err(e) = state.database.save_notification(&notification).await {
        tracing::warn!("Failed to save notification to database: {}", e);
    }

    // Emit to frontend
    let _ = app.emit("notification", &notification);

    // Also emit to legacy notification event for backwards compatibility
    let _ = app.emit(
        "app-notification",
        serde_json::json!({
            "id": id,
            "type": notification_type,
            "title": title,
            "message": message,
            "timestamp": timestamp,
        }),
    );

    tracing::info!("Emitted notification: {} - {}", title, message);
    Ok(id)
}

#[tauri::command]
pub async fn get_notifications(
    limit: Option<usize>,
    unread_only: Option<bool>,
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<Vec<Notification>> {
    state
        .database
        .get_notifications(limit.unwrap_or(50), unread_only.unwrap_or(false))
        .await
}

#[tauri::command]
pub async fn mark_notification_read(
    notification_id: String,
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<bool> {
    state
        .database
        .mark_notification_read(&notification_id)
        .await?;
    Ok(true)
}

#[tauri::command]
pub async fn clear_notifications(
    older_than_hours: Option<i64>,
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<usize> {
    let cutoff_time = chrono::Utc::now().timestamp() - (older_than_hours.unwrap_or(24) * 3600);
    state.database.clear_old_notifications(cutoff_time).await
}

#[tauri::command]
pub async fn emit_progress_notification(
    operation_id: String,
    title: String,
    message: String,
    progress: f32,
    total: Option<f32>,
    app: tauri::AppHandle,
) -> Result<()> {
    let notification = serde_json::json!({
        "id": operation_id,
        "type": "progress",
        "title": title,
        "message": message,
        "progress": progress,
        "total": total,
        "timestamp": chrono::Utc::now().timestamp(),
    });

    let _ = app.emit("notification-progress", notification);
    Ok(())
}

#[tauri::command]
pub async fn emit_file_operation_status(
    operation_type: String,
    file_path: String,
    status: String,
    details: Option<String>,
    app: tauri::AppHandle,
) -> Result<()> {
    let status_event = serde_json::json!({
        "operation_type": operation_type,
        "file_path": file_path,
        "status": status,
        "details": details,
        "timestamp": chrono::Utc::now().timestamp(),
    });

    let _ = app.emit("notification-file-operation-status", status_event);

    // Also emit a user-friendly notification for important status changes
    if status == "completed" || status == "failed" {
        let notification_type = if status == "completed" {
            "success"
        } else {
            "error"
        };
        let title = format!(
            "{} {}",
            operation_type
                .chars()
                .next()
                .map(|c| c.to_uppercase().collect::<String>() + &operation_type[1..])
                .unwrap_or_else(|| operation_type.to_string()),
            if status == "completed" {
                "Complete"
            } else {
                "Failed"
            }
        );

        let message = if let Some(details) = details {
            format!("{}: {}", file_path, details)
        } else {
            file_path
        };

        let _ = app.emit(
            "notification",
            serde_json::json!({
                "type": notification_type,
                "title": title,
                "message": message,
                "timestamp": chrono::Utc::now().timestamp(),
            }),
        );
    }

    Ok(())
}

#[tauri::command]
pub async fn emit_system_status(
    component: String,
    status: String,
    details: Option<String>,
    app: tauri::AppHandle,
) -> Result<()> {
    let status_event = serde_json::json!({
        "component": component,
        "status": status,
        "details": details,
        "timestamp": chrono::Utc::now().timestamp(),
    });

    let _ = app.emit("notification-system-status", status_event);

    // Emit notification for critical system status changes
    if status == "error" || status == "critical" {
        let _ = app.emit(
            "notification",
            serde_json::json!({
                "type": "error",
                "title": format!("{} Error", component),
                "message": details.unwrap_or_else(|| format!("{} encountered an error", component)),
                "timestamp": chrono::Utc::now().timestamp(),
            }),
        );
    }

    Ok(())
}

/// Utility function to emit error notifications with enhanced context
pub async fn emit_error_notification(
    app: &AppHandle,
    title: &str,
    error: &crate::error::AppError,
    context: Option<&str>,
) -> Result<()> {
    let message = if let Some(ctx) = context {
        format!("{}: {}", ctx, error.user_message())
    } else {
        error.user_message()
    };

    let notification = serde_json::json!({
        "type": "error",
        "title": title,
        "message": message,
        "error_type": error.error_type(),
        "recoverable": error.is_recoverable(),
        "timestamp": chrono::Utc::now().timestamp(),
    });

    let _ = app.emit("notification", notification);
    Ok(())
}

/// Utility function to emit success notifications
pub async fn emit_success_notification(app: &AppHandle, title: &str, message: &str) -> Result<()> {
    let notification = serde_json::json!({
        "type": "success",
        "title": title,
        "message": message,
        "timestamp": chrono::Utc::now().timestamp(),
    });

    let _ = app.emit("notification", notification);
    Ok(())
}

/// Utility function to emit warning notifications
pub async fn emit_warning_notification(
    app: &AppHandle,
    title: &str,
    message: &str,
    actions: Option<Vec<NotificationAction>>,
) -> Result<()> {
    let notification = serde_json::json!({
        "type": "warning",
        "title": title,
        "message": message,
        "actions": actions,
        "timestamp": chrono::Utc::now().timestamp(),
    });

    let _ = app.emit("notification", notification);
    Ok(())
}
