use crate::error::Result;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tracing;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Notification {
    pub id: String,
    pub title: String,
    pub body: String,
    pub icon: Option<String>,
    pub sound: Option<String>,
    pub urgency: NotificationUrgency,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum NotificationUrgency {
    Low,
    Normal,
    Critical,
}

pub struct NotificationService {
    app_handle: AppHandle,
}

impl NotificationService {
    pub fn new(app_handle: AppHandle) -> Self {
        Self { app_handle }
    }

    pub async fn send(&self, title: &str, body: &str) -> Result<String> {
        let notification = Notification {
            id: Uuid::new_v4().to_string(),
            title: title.to_string(),
            body: body.to_string(),
            icon: None,
            sound: None,
            urgency: NotificationUrgency::Normal,
        };

        self.send_notification(notification).await
    }

    pub async fn send_notification(&self, notification: Notification) -> Result<String> {
        let id = notification.id.clone();

        // Use Tauri's notification plugin
        match tauri_plugin_notification::NotificationExt::notification(&self.app_handle)
            .builder()
            .title(&notification.title)
            .body(&notification.body)
            .show()
        {
            Ok(_) => {}
            Err(e) => {
                tracing::warn!("Failed to show system notification: {}", e);
                // Continue anyway, we'll still emit to frontend
            }
        }

        // Also emit to frontend
        self.app_handle.emit("notification", &notification)?;

        Ok(id)
    }

    pub async fn send_success(&self, title: &str, body: &str) -> Result<String> {
        self.send(title, body).await
    }

    pub async fn send_error(&self, title: &str, body: &str) -> Result<String> {
        let notification = Notification {
            id: Uuid::new_v4().to_string(),
            title: title.to_string(),
            body: body.to_string(),
            icon: None,
            sound: None,
            urgency: NotificationUrgency::Critical,
        };

        self.send_notification(notification).await
    }

    pub async fn send_progress(&self, title: &str, progress: f32) -> Result<String> {
        let body = format!("Progress: {:.0}%", progress * 100.0);
        self.send(title, &body).await
    }

    /// Send warning notification for operations that might have failed silently
    pub async fn send_warning(&self, title: &str, body: &str) -> Result<String> {
        let notification = Notification {
            id: Uuid::new_v4().to_string(),
            title: title.to_string(),
            body: body.to_string(),
            icon: Some("warning".to_string()),
            sound: None,
            urgency: NotificationUrgency::Normal,
        };

        self.send_notification(notification).await
    }

    /// Send operation failure notification with detailed context
    pub async fn send_operation_failure(
        &self,
        operation: &str,
        error: &str,
        suggested_action: Option<&str>,
    ) -> Result<String> {
        let body = if let Some(action) = suggested_action {
            format!(
                "{} failed: {}. Suggested action: {}",
                operation, error, action
            )
        } else {
            format!("{} failed: {}", operation, error)
        };

        let notification = Notification {
            id: Uuid::new_v4().to_string(),
            title: format!("Operation Failed: {}", operation),
            body,
            icon: Some("error".to_string()),
            sound: Some("error".to_string()),
            urgency: NotificationUrgency::Critical,
        };

        // Also emit detailed failure event to frontend
        self.app_handle.emit(
            "operation-failure",
            serde_json::json!({
                "operation": operation,
                "error": error,
                "suggested_action": suggested_action,
                "timestamp": chrono::Utc::now().timestamp(),
                "notification_id": notification.id
            }),
        )?;

        self.send_notification(notification).await
    }

    /// Send timeout notification for operations that took too long
    pub async fn send_timeout_notification(
        &self,
        operation: &str,
        timeout_seconds: u64,
    ) -> Result<String> {
        let body = format!(
            "{} timed out after {} seconds. The operation may still be running in the background.",
            operation, timeout_seconds
        );

        let notification = Notification {
            id: Uuid::new_v4().to_string(),
            title: "Operation Timeout".to_string(),
            body,
            icon: Some("warning".to_string()),
            sound: None,
            urgency: NotificationUrgency::Normal,
        };

        // Emit timeout event to frontend
        self.app_handle.emit(
            "operation-timeout",
            serde_json::json!({
                "operation": operation,
                "timeout_seconds": timeout_seconds,
                "timestamp": chrono::Utc::now().timestamp(),
                "notification_id": notification.id
            }),
        )?;

        self.send_notification(notification).await
    }

    /// Send resource limit notification
    pub async fn send_resource_limit_notification(
        &self,
        resource_type: &str,
        current: usize,
        limit: usize,
    ) -> Result<String> {
        let body = format!(
            "Resource limit reached for {}: {}/{} in use. Some operations may be delayed.",
            resource_type, current, limit
        );

        let notification = Notification {
            id: Uuid::new_v4().to_string(),
            title: "Resource Limit Reached".to_string(),
            body,
            icon: Some("warning".to_string()),
            sound: None,
            urgency: NotificationUrgency::Normal,
        };

        // Emit resource limit event to frontend
        self.app_handle.emit(
            "resource-limit",
            serde_json::json!({
                "resource_type": resource_type,
                "current": current,
                "limit": limit,
                "timestamp": chrono::Utc::now().timestamp(),
                "notification_id": notification.id
            }),
        )?;

        self.send_notification(notification).await
    }
}
