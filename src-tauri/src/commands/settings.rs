use crate::{config::Config, error::Result, state::AppState};
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager, State};

#[tauri::command]
pub async fn get_settings(state: State<'_, std::sync::Arc<AppState>>) -> Result<Config> {
    Ok(state.config.read().clone())
}

#[tauri::command]
pub async fn update_settings(
    settings: Config,
    state: State<'_, std::sync::Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<()> {
    // Validate settings
    settings.validate()?;

    // Update state
    state.update_config(settings.clone()).await?;

    // Emit settings updated event
    app.emit("settings-updated", &settings)?;

    Ok(())
}

#[tauri::command]
pub async fn reset_settings(
    state: State<'_, std::sync::Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<Config> {
    let config = Config {
        default_smart_folder_location: app
            .path()
            .document_dir()
            .map_err(|e| crate::error::AppError::ConfigError {
                message: format!("Failed to get documents directory: {}", e),
            })?
            .join("StratoSort")
            .display()
            .to_string(),
        ..Config::default()
    };

    // Update state
    state.update_config(config.clone()).await?;

    // Emit event
    app.emit("settings-reset", &config)?;

    Ok(config)
}

#[tauri::command]
pub async fn export_settings(state: State<'_, std::sync::Arc<AppState>>) -> Result<String> {
    let config = state.config.read().clone();
    Ok(config.export())
}

#[tauri::command]
pub async fn import_settings(
    json: String,
    state: State<'_, std::sync::Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<Config> {
    let config = Config::import(&json)?;

    // Update state
    state.update_config(config.clone()).await?;

    // Emit event
    app.emit("settings-imported", &config)?;

    Ok(config)
}

#[tauri::command]
pub async fn get_setting_value(
    key: String,
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<serde_json::Value> {
    let config = state.config.read();

    let value = match key.as_str() {
        "ai_provider" => serde_json::json!(config.ai_provider),
        "ollama_host" => serde_json::json!(config.ollama_host),
        "ollama_model" => serde_json::json!(config.ollama_model),
        "watch_folders" => serde_json::json!(config.watch_folders),
        "theme" => serde_json::json!(config.theme),
        "max_file_size" => serde_json::json!(config.max_file_size),
        "enable_gpu" => serde_json::json!(config.enable_gpu),
        "debug_mode" => serde_json::json!(config.debug_mode),
        _ => {
            return Err(crate::error::AppError::InvalidInput {
                message: format!("Unknown setting key: {}", key),
            })
        }
    };

    Ok(value)
}

#[tauri::command]
pub async fn set_setting_value(
    key: String,
    value: serde_json::Value,
    state: State<'_, std::sync::Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<()> {
    let mut config = state.config.read().clone();

    match key.as_str() {
        "ai_provider" => {
            config.ai_provider = value
                .as_str()
                .ok_or_else(|| crate::error::AppError::InvalidInput {
                    message: "Invalid value for ai_provider".to_string(),
                })?
                .to_string();
        }
        "ollama_host" => {
            config.ollama_host = value
                .as_str()
                .ok_or_else(|| crate::error::AppError::InvalidInput {
                    message: "Invalid value for ollama_host".to_string(),
                })?
                .to_string();
        }
        "ollama_model" => {
            config.ollama_model = value
                .as_str()
                .ok_or_else(|| crate::error::AppError::InvalidInput {
                    message: "Invalid value for ollama_model".to_string(),
                })?
                .to_string();
        }
        "watch_folders" => {
            config.watch_folders =
                value
                    .as_bool()
                    .ok_or_else(|| crate::error::AppError::InvalidInput {
                        message: "Invalid value for watch_folders".to_string(),
                    })?;
        }
        "theme" => {
            config.theme = value
                .as_str()
                .ok_or_else(|| crate::error::AppError::InvalidInput {
                    message: "Invalid value for theme".to_string(),
                })?
                .to_string();
        }
        "max_file_size" => {
            config.max_file_size =
                value
                    .as_u64()
                    .ok_or_else(|| crate::error::AppError::InvalidInput {
                        message: "Invalid value for max_file_size".to_string(),
                    })?;
        }
        "enable_gpu" => {
            config.enable_gpu =
                value
                    .as_bool()
                    .ok_or_else(|| crate::error::AppError::InvalidInput {
                        message: "Invalid value for enable_gpu".to_string(),
                    })?;
        }
        "debug_mode" => {
            config.debug_mode =
                value
                    .as_bool()
                    .ok_or_else(|| crate::error::AppError::InvalidInput {
                        message: "Invalid value for debug_mode".to_string(),
                    })?;
        }
        _ => {
            return Err(crate::error::AppError::InvalidInput {
                message: format!("Unknown setting key: {}", key),
            });
        }
    }

    // Validate and save
    config.validate()?;
    state.update_config(config.clone()).await?;

    // Emit event for specific setting
    app.emit(
        "settings-value-changed",
        serde_json::json!({
            "key": key,
            "value": value
        }),
    )?;

    Ok(())
}

#[tauri::command]
pub async fn add_watch_path(
    path: String,
    state: State<'_, std::sync::Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<()> {
    let mut config = state.config.read().clone();

    if !config.watch_paths.contains(&path) {
        config.watch_paths.push(path.clone());
        state.update_config(config).await?;

        // Also start watching the new path at runtime
        {
            let path_clone = path.clone();
            let watcher_arc = {
                let watcher_guard = state.file_watcher.read();
                watcher_guard.as_ref().map(std::sync::Arc::clone)
            };

            if let Some(watcher_arc) = watcher_arc {
                if let Err(e) = watcher_arc.add_watch_path(&path_clone).await {
                    tracing::warn!("Failed to add runtime watch path {}: {}", path_clone, e);
                }
            }
        }

        app.emit("settings-watch-path-added", &path)?;
    }

    Ok(())
}

#[tauri::command]
pub async fn remove_watch_path(
    path: String,
    state: State<'_, std::sync::Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<()> {
    let mut config = state.config.read().clone();

    config.watch_paths.retain(|p| p != &path);
    state.update_config(config).await?;

    // Also stop watching the path at runtime
    {
        let path_clone = path.clone();
        let watcher_arc = {
            let watcher_guard = state.file_watcher.read();
            watcher_guard.as_ref().map(std::sync::Arc::clone)
        };

        if let Some(watcher_arc) = watcher_arc {
            if let Err(e) = watcher_arc.remove_watch_path(&path_clone).await {
                tracing::warn!("Failed to remove runtime watch path {}: {}", path_clone, e);
            }
        }
    }

    app.emit("settings-watch-path-removed", &path)?;

    Ok(())
}

#[tauri::command]
pub async fn get_watch_paths(state: State<'_, std::sync::Arc<AppState>>) -> Result<Vec<String>> {
    Ok(state.config.read().watch_paths.clone())
}

#[tauri::command]
pub async fn validate_settings(settings: Config) -> Result<ValidationResult> {
    match settings.validate() {
        Ok(_) => Ok(ValidationResult {
            valid: true,
            errors: vec![],
        }),
        Err(e) => Ok(ValidationResult {
            valid: false,
            errors: vec![e.to_string()],
        }),
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ValidationResult {
    pub valid: bool,
    pub errors: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SettingsCategory {
    pub name: String,
    pub settings: serde_json::Value,
}

#[tauri::command]
pub async fn get_settings_by_category(
    category: String,
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<serde_json::Value> {
    let config = state.config.read().clone();

    let settings = match category.as_str() {
        "general" => serde_json::json!({
            "theme": config.theme,
            "language": config.language,
            "show_notifications": config.show_notifications,
            "notification_duration": config.notification_duration,
            "confirm_before_delete": config.confirm_before_delete,
            "confirm_before_move": config.confirm_before_move,
            "preserve_file_timestamps": config.preserve_file_timestamps
        }),
        "ai" => serde_json::json!({
            "ai_provider": config.ai_provider,
            "ollama_host": config.ollama_host,
            "ollama_model": config.ollama_model,
            "ollama_vision_model": config.ollama_vision_model,
            "ollama_embedding_model": config.ollama_embedding_model
        }),
        "files" => serde_json::json!({
            "watch_folders": config.watch_folders,
            "watch_paths": config.watch_paths,
            "default_smart_folder_location": config.default_smart_folder_location,
            "file_extensions_to_ignore": config.file_extensions_to_ignore,
            "max_file_size": config.max_file_size,
            "max_single_file_size_mb": config.max_single_file_size_mb,
            "max_directory_scan_depth": config.max_directory_scan_depth,
            "auto_analyze_on_add": config.auto_analyze_on_add
        }),
        "performance" => serde_json::json!({
            "max_concurrent_analysis": config.max_concurrent_analysis,
            "max_concurrent_operations": config.max_concurrent_operations,
            "max_concurrent_reads": config.max_concurrent_reads,
            "cache_size": config.cache_size,
            "enable_gpu": config.enable_gpu,
            "max_total_memory_mb": config.max_total_memory_mb
        }),
        "privacy" => serde_json::json!({
            "enable_telemetry": config.enable_telemetry,
            "enable_crash_reports": config.enable_crash_reports,
            "enable_analytics": config.enable_analytics
        }),
        "advanced" => serde_json::json!({
            "debug_mode": config.debug_mode,
            "log_level": config.log_level,
            "history_retention": config.history_retention,
            "undo_history_size": config.undo_history_size
        }),
        _ => {
            return Err(crate::error::AppError::InvalidInput {
                message: format!("Unknown settings category: {}", category),
            })
        }
    };

    Ok(settings)
}

#[tauri::command]
pub async fn get_all_settings_categories(
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<Vec<SettingsCategory>> {
    let config = state.config.read().clone();

    let categories = vec![
        SettingsCategory {
            name: "general".to_string(),
            settings: serde_json::json!({
                "theme": config.theme,
                "language": config.language,
                "show_notifications": config.show_notifications,
                "notification_duration": config.notification_duration,
                "confirm_before_delete": config.confirm_before_delete,
                "confirm_before_move": config.confirm_before_move,
                "preserve_file_timestamps": config.preserve_file_timestamps
            }),
        },
        SettingsCategory {
            name: "ai".to_string(),
            settings: serde_json::json!({
                "ai_provider": config.ai_provider,
                "ollama_host": config.ollama_host,
                "ollama_model": config.ollama_model,
                "ollama_vision_model": config.ollama_vision_model,
                "ollama_embedding_model": config.ollama_embedding_model
            }),
        },
        SettingsCategory {
            name: "files".to_string(),
            settings: serde_json::json!({
                "watch_folders": config.watch_folders,
                "watch_paths": config.watch_paths,
                "default_smart_folder_location": config.default_smart_folder_location,
                "file_extensions_to_ignore": config.file_extensions_to_ignore,
                "max_file_size": config.max_file_size,
                "max_single_file_size_mb": config.max_single_file_size_mb,
                "max_directory_scan_depth": config.max_directory_scan_depth,
                "auto_analyze_on_add": config.auto_analyze_on_add
            }),
        },
        SettingsCategory {
            name: "performance".to_string(),
            settings: serde_json::json!({
                "max_concurrent_analysis": config.max_concurrent_analysis,
                "max_concurrent_operations": config.max_concurrent_operations,
                "max_concurrent_reads": config.max_concurrent_reads,
                "cache_size": config.cache_size,
                "enable_gpu": config.enable_gpu,
                "max_total_memory_mb": config.max_total_memory_mb
            }),
        },
        SettingsCategory {
            name: "privacy".to_string(),
            settings: serde_json::json!({
                "enable_telemetry": config.enable_telemetry,
                "enable_crash_reports": config.enable_crash_reports,
                "enable_analytics": config.enable_analytics
            }),
        },
        SettingsCategory {
            name: "advanced".to_string(),
            settings: serde_json::json!({
                "debug_mode": config.debug_mode,
                "log_level": config.log_level,
                "history_retention": config.history_retention,
                "undo_history_size": config.undo_history_size
            }),
        },
    ];

    Ok(categories)
}

#[tauri::command]
pub async fn update_category_settings(
    category: String,
    settings: serde_json::Value,
    state: State<'_, std::sync::Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<()> {
    let mut config = state.config.read().clone();

    match category.as_str() {
        "general" => {
            if let Some(theme) = settings.get("theme").and_then(|v| v.as_str()) {
                config.theme = theme.to_string();
            }
            if let Some(language) = settings.get("language").and_then(|v| v.as_str()) {
                config.language = language.to_string();
            }
            if let Some(show_notifications) =
                settings.get("show_notifications").and_then(|v| v.as_bool())
            {
                config.show_notifications = show_notifications;
            }
            if let Some(notification_duration) = settings
                .get("notification_duration")
                .and_then(|v| v.as_u64())
            {
                config.notification_duration = notification_duration;
            }
            if let Some(confirm_before_delete) = settings
                .get("confirm_before_delete")
                .and_then(|v| v.as_bool())
            {
                config.confirm_before_delete = confirm_before_delete;
            }
            if let Some(confirm_before_move) = settings
                .get("confirm_before_move")
                .and_then(|v| v.as_bool())
            {
                config.confirm_before_move = confirm_before_move;
            }
            if let Some(preserve_file_timestamps) = settings
                .get("preserve_file_timestamps")
                .and_then(|v| v.as_bool())
            {
                config.preserve_file_timestamps = preserve_file_timestamps;
            }
        }
        "ai" => {
            if let Some(ai_provider) = settings.get("ai_provider").and_then(|v| v.as_str()) {
                config.ai_provider = ai_provider.to_string();
            }
            if let Some(ollama_host) = settings.get("ollama_host").and_then(|v| v.as_str()) {
                config.ollama_host = ollama_host.to_string();
            }
            if let Some(ollama_model) = settings.get("ollama_model").and_then(|v| v.as_str()) {
                config.ollama_model = ollama_model.to_string();
            }
            if let Some(ollama_vision_model) =
                settings.get("ollama_vision_model").and_then(|v| v.as_str())
            {
                config.ollama_vision_model = ollama_vision_model.to_string();
            }
            if let Some(ollama_embedding_model) = settings
                .get("ollama_embedding_model")
                .and_then(|v| v.as_str())
            {
                config.ollama_embedding_model = ollama_embedding_model.to_string();
            }
        }
        "files" => {
            if let Some(watch_folders) = settings.get("watch_folders").and_then(|v| v.as_bool()) {
                config.watch_folders = watch_folders;
            }
            if let Some(watch_paths_array) = settings.get("watch_paths").and_then(|v| v.as_array())
            {
                config.watch_paths = watch_paths_array
                    .iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect();
            }
            if let Some(default_location) = settings
                .get("default_smart_folder_location")
                .and_then(|v| v.as_str())
            {
                config.default_smart_folder_location = default_location.to_string();
            }
            if let Some(ignore_array) = settings
                .get("file_extensions_to_ignore")
                .and_then(|v| v.as_array())
            {
                config.file_extensions_to_ignore = ignore_array
                    .iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect();
            }
            if let Some(max_file_size) = settings.get("max_file_size").and_then(|v| v.as_u64()) {
                config.max_file_size = max_file_size;
            }
            if let Some(max_single_file_mb) = settings
                .get("max_single_file_size_mb")
                .and_then(|v| v.as_u64())
            {
                config.max_single_file_size_mb = max_single_file_mb as usize;
            }
            if let Some(max_depth) = settings
                .get("max_directory_scan_depth")
                .and_then(|v| v.as_u64())
            {
                config.max_directory_scan_depth = max_depth as usize;
            }
            if let Some(auto_analyze) = settings
                .get("auto_analyze_on_add")
                .and_then(|v| v.as_bool())
            {
                config.auto_analyze_on_add = auto_analyze;
            }
        }
        "performance" => {
            if let Some(max_analysis) = settings
                .get("max_concurrent_analysis")
                .and_then(|v| v.as_u64())
            {
                config.max_concurrent_analysis = max_analysis as usize;
            }
            if let Some(max_ops) = settings
                .get("max_concurrent_operations")
                .and_then(|v| v.as_u64())
            {
                config.max_concurrent_operations = max_ops as usize;
            }
            if let Some(max_reads) = settings
                .get("max_concurrent_reads")
                .and_then(|v| v.as_u64())
            {
                config.max_concurrent_reads = max_reads as usize;
            }
            if let Some(cache_size) = settings.get("cache_size").and_then(|v| v.as_u64()) {
                config.cache_size = cache_size as usize;
            }
            if let Some(enable_gpu) = settings.get("enable_gpu").and_then(|v| v.as_bool()) {
                config.enable_gpu = enable_gpu;
            }
            if let Some(max_memory) = settings.get("max_total_memory_mb").and_then(|v| v.as_u64()) {
                config.max_total_memory_mb = max_memory as usize;
            }
        }
        "privacy" => {
            if let Some(enable_telemetry) =
                settings.get("enable_telemetry").and_then(|v| v.as_bool())
            {
                config.enable_telemetry = enable_telemetry;
            }
            if let Some(enable_crash_reports) = settings
                .get("enable_crash_reports")
                .and_then(|v| v.as_bool())
            {
                config.enable_crash_reports = enable_crash_reports;
            }
            if let Some(enable_analytics) =
                settings.get("enable_analytics").and_then(|v| v.as_bool())
            {
                config.enable_analytics = enable_analytics;
            }
        }
        "advanced" => {
            if let Some(debug_mode) = settings.get("debug_mode").and_then(|v| v.as_bool()) {
                config.debug_mode = debug_mode;
            }
            if let Some(log_level) = settings.get("log_level").and_then(|v| v.as_str()) {
                config.log_level = log_level.to_string();
            }
            if let Some(history_retention) =
                settings.get("history_retention").and_then(|v| v.as_u64())
            {
                config.history_retention = history_retention;
            }
            if let Some(undo_size) = settings.get("undo_history_size").and_then(|v| v.as_u64()) {
                config.undo_history_size = undo_size as usize;
            }
        }
        _ => {
            return Err(crate::error::AppError::InvalidInput {
                message: format!("Unknown settings category: {}", category),
            })
        }
    }

    // Validate and save
    config.validate()?;
    state.update_config(config.clone()).await?;

    // Emit category-specific update event
    app.emit(
        "settings-category-updated",
        serde_json::json!({
            "category": category,
            "settings": settings
        }),
    )?;

    Ok(())
}

#[tauri::command]
pub async fn test_ai_connection(
    state: State<'_, std::sync::Arc<AppState>>,
    config: Option<serde_json::Value>,
) -> Result<serde_json::Value> {
    // Allow optional override of host via provided config
    let host = if let Some(cfg) = &config {
        cfg.get("host")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| state.config.read().ollama_host.clone())
    } else {
        let config = state.config.read();
        config.ollama_host.clone()
    };

    // Try to connect to the configured Ollama host
    match state.ai_service.reconnect_ollama(&host).await {
        Ok(status) => {
            let result = serde_json::json!({
                "success": true,
                "connected": status.ollama_connected,
                "host": host,
                "provider": status.provider,
                "models_available": status.models_available,
                "capabilities": status.capabilities,
                "message": if status.ollama_connected {
                    "Successfully connected to Ollama"
                } else {
                    "Connected to Ollama but no models available"
                },
                "error": status.last_error
            });
            Ok(result)
        }
        Err(e) => {
            let result = serde_json::json!({
                "success": false,
                "connected": false,
                "host": host,
                "message": format!("Failed to connect to Ollama: {}", e),
                "error": e.to_string()
            });
            Ok(result)
        }
    }
}
