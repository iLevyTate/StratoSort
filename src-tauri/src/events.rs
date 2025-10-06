/// Standardized event names for consistent cross-application communication
///
/// Event Naming Conventions:
/// - Use kebab-case for all event names
/// - Structure: {domain}-{action}-{target}
/// - Examples: "file-watcher-started", "operation-progress-updated"
///
/// Event Domains:
/// - app: Application lifecycle events
/// - ai: AI service and model events
/// - file: File system and watcher events
/// - operation: Long-running operation events
/// - settings: Configuration change events
/// - system: System status and health events
/// - notification: User notification events
use serde_json::Value;

pub mod app {
    pub const INITIALIZATION_RETRY: &str = "app-initialization-retry";
    pub const INITIALIZATION_FAILED: &str = "app-initialization-failed";
    pub const READY: &str = "app-ready";
    pub const SHUTDOWN: &str = "app-shutdown";
}

pub mod ai {
    pub const STATUS_CHANGED: &str = "ai-status-changed";
    pub const STATUS_UPDATE: &str = "ai-status-update";
    pub const OLLAMA_CONNECTED: &str = "ai-ollama-connected";
    pub const OLLAMA_STATUS_CHECKED: &str = "ai-ollama-status-checked";
    pub const OLLAMA_FALLBACK_ACTIVE: &str = "ai-ollama-fallback-active";
    pub const MODEL_DOWNLOADED: &str = "ai-model-downloaded";
    pub const ANALYSIS_COMPLETE: &str = "ai-analysis-complete";
}

pub mod file {
    pub const WATCHER_STARTED: &str = "file-watcher-started";
    pub const WATCHER_ERROR: &str = "file-watcher-error";
    pub const WATCHER_STOPPED: &str = "file-watcher-stopped";
    pub const EVENT: &str = "file-event"; // Simplified from "enhanced-file-event"
    pub const AUTO_ORGANIZED: &str = "file-auto-organized";
    pub const SCAN_BATCH: &str = "file-scan-batch";
    pub const SCAN_COMPLETE: &str = "file-scan-complete";
    pub const SCAN_ERROR: &str = "file-scan-error";
    pub const SCAN_CANCELLED: &str = "file-scan-cancelled";
}

pub mod operation {
    pub const PROGRESS: &str = "operation-progress";
    pub const COMPLETE: &str = "operation-complete";
    pub const ERROR: &str = "operation-error";
    pub const FAILURE: &str = "operation-failure";
    pub const TIMEOUT: &str = "operation-timeout";
    pub const CANCELLED: &str = "operation-cancelled";
    pub const STARTED: &str = "operation-started";
}

pub mod settings {
    pub const UPDATED: &str = "settings-updated";
    pub const RESET: &str = "settings-reset";
    pub const IMPORTED: &str = "settings-imported";
    pub const CATEGORY_UPDATED: &str = "settings-category-updated";
    pub const WATCH_PATH_ADDED: &str = "settings-watch-path-added";
    pub const WATCH_PATH_REMOVED: &str = "settings-watch-path-removed";
    pub const VALUE_CHANGED: &str = "settings-value-changed";
}

pub mod system {
    pub const STATUS_UPDATE: &str = "system-status-update";
    pub const HEALTH_UPDATE: &str = "health-status-update";
    pub const RESOURCE_LIMIT: &str = "system-resource-limit";
    pub const METRICS_COLLECTED: &str = "system-metrics-collected";
    pub const OPERATIONS_STATUS_UPDATE: &str = "operations-status-update";
}

pub mod history {
    pub const OPERATION_UNDONE: &str = "history-operation-undone";
    pub const OPERATION_REDONE: &str = "history-operation-redone";
    pub const CLEARED: &str = "history-cleared";
    pub const BATCH_UNDO: &str = "history-batch-undo";
    pub const BATCH_REDO: &str = "history-batch-redo";
    pub const JUMPED_TO: &str = "history-jumped-to";
}

pub mod notification {
    pub const SENT: &str = "notification-sent";
    pub const PROGRESS: &str = "notification-progress";
    pub const FILE_OPERATION_STATUS: &str = "notification-file-operation-status";
    pub const SYSTEM_STATUS: &str = "notification-system-status";
    // Keep legacy "notification" for backwards compatibility
    pub const LEGACY: &str = "notification";
}

pub mod watch_mode {
    pub const ENABLED: &str = "watch-mode-enabled";
    pub const DISABLED: &str = "watch-mode-disabled";
    pub const CONFIGURED: &str = "watch-mode-configured";
    pub const DIRECTORY_ADDED: &str = "watch-mode-directory-added";
    pub const DIRECTORY_REMOVED: &str = "watch-mode-directory-removed";
    pub const AUTO_ORGANIZATION_TRIGGERED: &str = "watch-mode-auto-organization-triggered";
}

/// Helper function to create consistent event payloads
pub fn create_event_payload(event_type: &str, data: Value) -> Value {
    serde_json::json!({
        "event_type": event_type,
        "timestamp": chrono::Utc::now().timestamp_millis(),
        "data": data
    })
}

/// Helper macro for emitting events with consistent structure
#[macro_export]
macro_rules! emit_event {
    ($handle:expr, $event:expr, $data:expr) => {
        if let Err(e) = $handle.emit($event, $crate::events::create_event_payload($event, $data)) {
            tracing::error!("Failed to emit event '{}': {}", $event, e);
        }
    };
}

pub use emit_event;
