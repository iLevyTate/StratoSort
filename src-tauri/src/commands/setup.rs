use crate::{commands::organization::SmartFolder, config::Config, error::Result, state::AppState};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Debug, Serialize, Deserialize)]
pub struct FirstRunStatus {
    pub is_first_run: bool,
    pub config_exists: bool,
    pub database_exists: bool,
    pub smart_folders_exist: bool,
    pub ollama_available: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FirstRunSetup {
    pub smart_folder_location: Option<String>,
    pub enable_watch_mode: bool,
    pub watch_directories: Vec<String>,
    pub enable_notifications: bool,
    pub auto_analyze: bool,
    pub ollama_host: Option<String>,
}

/// Check if this is the first run of the application
#[tauri::command]
pub async fn check_first_run_status(
    app_handle: AppHandle,
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<FirstRunStatus> {
    let is_first_run = Config::is_first_run(&app_handle)?;
    let config_exists = !is_first_run;

    // Check if database has any data
    let smart_folders = state
        .database
        .list_smart_folders()
        .await
        .unwrap_or_default();
    let smart_folders_exist = !smart_folders.is_empty();

    // Check if database file exists
    let db_path = crate::storage::Database::database_path(&app_handle).unwrap_or_default();
    let database_exists = db_path.exists();

    // Check AI service status
    let ai_status = state.ai_service.get_status().await;
    let ollama_available = ai_status.ollama_connected;

    Ok(FirstRunStatus {
        is_first_run,
        config_exists,
        database_exists,
        smart_folders_exist,
        ollama_available,
    })
}

/// Complete first-run setup
#[tauri::command]
pub async fn complete_first_run_setup(
    setup: FirstRunSetup,
    app_handle: AppHandle,
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<String> {
    tracing::info!("Completing first-run setup: {:?}", setup);

    // Create configuration with user preferences
    let mut config = Config::create_first_run_config(
        &app_handle,
        setup.smart_folder_location.unwrap_or_default(),
    )?;

    // Apply user preferences
    config.watch_folders = setup.enable_watch_mode;

    // Clone watch_directories to avoid borrow issues
    let watch_dirs = setup.watch_directories.clone();
    config.watch_paths = watch_dirs;

    config.show_notifications = setup.enable_notifications;
    config.auto_analyze_on_add = setup.auto_analyze;

    if let Some(ollama_host) = setup.ollama_host {
        config.ollama_host = ollama_host;
    }

    // Save configuration
    config.save(&app_handle)?;

    // Update global config
    *state.config.write() = config.clone();

    // Create default smart folders
    if let Err(e) = create_default_smart_folders(&state).await {
        tracing::warn!("Failed to create default smart folders: {}", e);
    }

    // Reconnect to Ollama if host changed
    if state.ai_service.is_available().await {
        tracing::info!("Ollama is available, reconnecting with new config...");
        let _ = state.ai_service.reconnect_ollama(&config.ollama_host).await;
    }

    // Emit setup complete event
    let _ = app_handle.emit(
        "setup-complete",
        serde_json::json!({
            "success": true,
            "message": "Initial setup completed successfully"
        }),
    );

    // Get the actual path for smart folders
    let smart_folder_path = if config.default_smart_folder_location.is_empty() {
        app_handle
            .path()
            .document_dir()
            .unwrap_or_default()
            .join("StratoSort")
            .display()
            .to_string()
    } else {
        config.default_smart_folder_location.clone()
    };

    // Also get downloads directory for reference
    let downloads_dir = app_handle
        .path()
        .download_dir()
        .unwrap_or_default()
        .display()
        .to_string();

    Ok(serde_json::to_string(&serde_json::json!({
        "success": true,
        "config": config,
        "smart_folder_path": smart_folder_path,
        "downloads_path": downloads_dir,
        "message": "First-run setup completed successfully"
    }))?)
}

/// Reset application to first-run state
#[tauri::command]
pub async fn reset_to_first_run(app_handle: AppHandle, state: State<'_, AppState>) -> Result<()> {
    tracing::info!("Resetting application to first-run state");

    // Delete configuration
    let config_path = app_handle
        .path()
        .app_config_dir()
        .map_err(|e| crate::error::AppError::ConfigError {
            message: format!("Failed to get config directory: {}", e),
        })?
        .join("config.json");

    if config_path.exists() {
        std::fs::remove_file(&config_path)?;
    }

    // Clear database (but don't delete it)
    state.database.clear_all_data().await?;

    // Reset config to default
    state.config.write().reset();

    Ok(())
}

/// Create default smart folders for new users
async fn create_default_smart_folders(state: &AppState) -> Result<()> {
    let default_folders = vec![
        SmartFolder {
            id: uuid::Uuid::new_v4().to_string(),
            name: "Documents".to_string(),
            description: Some("Text documents, PDFs, and office files".to_string()),
            target_path: "~/StratoSort/Documents".to_string(),
            naming_convention: None,
            ai_guidance: None,
            rules: vec![
                crate::commands::organization::OrganizationRule {
                    id: uuid::Uuid::new_v4().to_string(),
                    rule_type: crate::commands::organization::RuleType::FileExtension,
                    condition: crate::commands::organization::RuleCondition {
                        field: "extension".to_string(),
                        operator: crate::commands::organization::ConditionOperator::Equals,
                        value: "pdf".to_string(),
                        case_sensitive: Some(false),
                    },
                    action: crate::commands::organization::RuleAction {
                        action_type: crate::commands::organization::ActionType::Move,
                        target_folder: "~/StratoSort/Documents".to_string(),
                        rename_pattern: None,
                    },
                    priority: 1,
                    enabled: true,
                },
                crate::commands::organization::OrganizationRule {
                    id: uuid::Uuid::new_v4().to_string(),
                    rule_type: crate::commands::organization::RuleType::FileExtension,
                    condition: crate::commands::organization::RuleCondition {
                        field: "extension".to_string(),
                        operator: crate::commands::organization::ConditionOperator::Equals,
                        value: "docx".to_string(),
                        case_sensitive: Some(false),
                    },
                    action: crate::commands::organization::RuleAction {
                        action_type: crate::commands::organization::ActionType::Move,
                        target_folder: "~/StratoSort/Documents".to_string(),
                        rename_pattern: None,
                    },
                    priority: 1,
                    enabled: true,
                },
                crate::commands::organization::OrganizationRule {
                    id: uuid::Uuid::new_v4().to_string(),
                    rule_type: crate::commands::organization::RuleType::FileExtension,
                    condition: crate::commands::organization::RuleCondition {
                        field: "extension".to_string(),
                        operator: crate::commands::organization::ConditionOperator::Equals,
                        value: "txt".to_string(),
                        case_sensitive: Some(false),
                    },
                    action: crate::commands::organization::RuleAction {
                        action_type: crate::commands::organization::ActionType::Move,
                        target_folder: "~/StratoSort/Documents".to_string(),
                        rename_pattern: None,
                    },
                    priority: 1,
                    enabled: true,
                },
            ],
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
            enabled: true,
        },
        SmartFolder {
            id: uuid::Uuid::new_v4().to_string(),
            name: "Images".to_string(),
            description: Some("Photos, screenshots, and image files".to_string()),
            target_path: "~/StratoSort/Images".to_string(),
            naming_convention: None,
            ai_guidance: None,
            rules: vec![
                crate::commands::organization::OrganizationRule {
                    id: uuid::Uuid::new_v4().to_string(),
                    rule_type: crate::commands::organization::RuleType::FileExtension,
                    condition: crate::commands::organization::RuleCondition {
                        field: "extension".to_string(),
                        operator: crate::commands::organization::ConditionOperator::Equals,
                        value: "jpg".to_string(),
                        case_sensitive: Some(false),
                    },
                    action: crate::commands::organization::RuleAction {
                        action_type: crate::commands::organization::ActionType::Move,
                        target_folder: "~/StratoSort/Images".to_string(),
                        rename_pattern: None,
                    },
                    priority: 1,
                    enabled: true,
                },
                crate::commands::organization::OrganizationRule {
                    id: uuid::Uuid::new_v4().to_string(),
                    rule_type: crate::commands::organization::RuleType::FileExtension,
                    condition: crate::commands::organization::RuleCondition {
                        field: "extension".to_string(),
                        operator: crate::commands::organization::ConditionOperator::Equals,
                        value: "png".to_string(),
                        case_sensitive: Some(false),
                    },
                    action: crate::commands::organization::RuleAction {
                        action_type: crate::commands::organization::ActionType::Move,
                        target_folder: "~/StratoSort/Images".to_string(),
                        rename_pattern: None,
                    },
                    priority: 1,
                    enabled: true,
                },
            ],
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
            enabled: true,
        },
        SmartFolder {
            id: uuid::Uuid::new_v4().to_string(),
            name: "Archives".to_string(),
            description: Some("ZIP files, compressed archives".to_string()),
            target_path: "~/StratoSort/Archives".to_string(),
            naming_convention: None,
            ai_guidance: None,
            rules: vec![
                crate::commands::organization::OrganizationRule {
                    id: uuid::Uuid::new_v4().to_string(),
                    rule_type: crate::commands::organization::RuleType::FileExtension,
                    condition: crate::commands::organization::RuleCondition {
                        field: "extension".to_string(),
                        operator: crate::commands::organization::ConditionOperator::Equals,
                        value: "zip".to_string(),
                        case_sensitive: Some(false),
                    },
                    action: crate::commands::organization::RuleAction {
                        action_type: crate::commands::organization::ActionType::Move,
                        target_folder: "~/StratoSort/Archives".to_string(),
                        rename_pattern: None,
                    },
                    priority: 1,
                    enabled: true,
                },
                crate::commands::organization::OrganizationRule {
                    id: uuid::Uuid::new_v4().to_string(),
                    rule_type: crate::commands::organization::RuleType::FileExtension,
                    condition: crate::commands::organization::RuleCondition {
                        field: "extension".to_string(),
                        operator: crate::commands::organization::ConditionOperator::Equals,
                        value: "rar".to_string(),
                        case_sensitive: Some(false),
                    },
                    action: crate::commands::organization::RuleAction {
                        action_type: crate::commands::organization::ActionType::Move,
                        target_folder: "~/StratoSort/Archives".to_string(),
                        rename_pattern: None,
                    },
                    priority: 1,
                    enabled: true,
                },
            ],
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
            enabled: true,
        },
        SmartFolder {
            id: uuid::Uuid::new_v4().to_string(),
            name: "Presentations".to_string(),
            description: Some("PowerPoint slides, Keynote, and presentation files".to_string()),
            target_path: "~/StratoSort/Presentations".to_string(),
            naming_convention: None,
            ai_guidance: None,
            rules: vec![
                crate::commands::organization::OrganizationRule {
                    id: uuid::Uuid::new_v4().to_string(),
                    rule_type: crate::commands::organization::RuleType::FileExtension,
                    condition: crate::commands::organization::RuleCondition {
                        field: "extension".to_string(),
                        operator: crate::commands::organization::ConditionOperator::Equals,
                        value: "ppt".to_string(),
                        case_sensitive: Some(false),
                    },
                    action: crate::commands::organization::RuleAction {
                        action_type: crate::commands::organization::ActionType::Move,
                        target_folder: "~/StratoSort/Presentations".to_string(),
                        rename_pattern: None,
                    },
                    priority: 1,
                    enabled: true,
                },
                crate::commands::organization::OrganizationRule {
                    id: uuid::Uuid::new_v4().to_string(),
                    rule_type: crate::commands::organization::RuleType::FileExtension,
                    condition: crate::commands::organization::RuleCondition {
                        field: "extension".to_string(),
                        operator: crate::commands::organization::ConditionOperator::Equals,
                        value: "pptx".to_string(),
                        case_sensitive: Some(false),
                    },
                    action: crate::commands::organization::RuleAction {
                        action_type: crate::commands::organization::ActionType::Move,
                        target_folder: "~/StratoSort/Presentations".to_string(),
                        rename_pattern: None,
                    },
                    priority: 1,
                    enabled: true,
                },
                crate::commands::organization::OrganizationRule {
                    id: uuid::Uuid::new_v4().to_string(),
                    rule_type: crate::commands::organization::RuleType::FileExtension,
                    condition: crate::commands::organization::RuleCondition {
                        field: "extension".to_string(),
                        operator: crate::commands::organization::ConditionOperator::Equals,
                        value: "key".to_string(),
                        case_sensitive: Some(false),
                    },
                    action: crate::commands::organization::RuleAction {
                        action_type: crate::commands::organization::ActionType::Move,
                        target_folder: "~/StratoSort/Presentations".to_string(),
                        rename_pattern: None,
                    },
                    priority: 1,
                    enabled: true,
                },
            ],
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
            enabled: true,
        },
        SmartFolder {
            id: uuid::Uuid::new_v4().to_string(),
            name: "3D Print Files".to_string(),
            description: Some(
                "3D models, STL files, G-code, and 3D printing related files".to_string(),
            ),
            target_path: "~/StratoSort/3D Print Files".to_string(),
            naming_convention: None,
            ai_guidance: None,
            rules: vec![
                crate::commands::organization::OrganizationRule {
                    id: uuid::Uuid::new_v4().to_string(),
                    rule_type: crate::commands::organization::RuleType::FileExtension,
                    condition: crate::commands::organization::RuleCondition {
                        field: "extension".to_string(),
                        operator: crate::commands::organization::ConditionOperator::Equals,
                        value: "stl".to_string(),
                        case_sensitive: Some(false),
                    },
                    action: crate::commands::organization::RuleAction {
                        action_type: crate::commands::organization::ActionType::Move,
                        target_folder: "~/StratoSort/3D Print Files".to_string(),
                        rename_pattern: None,
                    },
                    priority: 1,
                    enabled: true,
                },
                crate::commands::organization::OrganizationRule {
                    id: uuid::Uuid::new_v4().to_string(),
                    rule_type: crate::commands::organization::RuleType::FileExtension,
                    condition: crate::commands::organization::RuleCondition {
                        field: "extension".to_string(),
                        operator: crate::commands::organization::ConditionOperator::Equals,
                        value: "obj".to_string(),
                        case_sensitive: Some(false),
                    },
                    action: crate::commands::organization::RuleAction {
                        action_type: crate::commands::organization::ActionType::Move,
                        target_folder: "~/StratoSort/3D Print Files".to_string(),
                        rename_pattern: None,
                    },
                    priority: 1,
                    enabled: true,
                },
                crate::commands::organization::OrganizationRule {
                    id: uuid::Uuid::new_v4().to_string(),
                    rule_type: crate::commands::organization::RuleType::FileExtension,
                    condition: crate::commands::organization::RuleCondition {
                        field: "extension".to_string(),
                        operator: crate::commands::organization::ConditionOperator::Equals,
                        value: "gcode".to_string(),
                        case_sensitive: Some(false),
                    },
                    action: crate::commands::organization::RuleAction {
                        action_type: crate::commands::organization::ActionType::Move,
                        target_folder: "~/StratoSort/3D Print Files".to_string(),
                        rename_pattern: None,
                    },
                    priority: 1,
                    enabled: true,
                },
                crate::commands::organization::OrganizationRule {
                    id: uuid::Uuid::new_v4().to_string(),
                    rule_type: crate::commands::organization::RuleType::FileExtension,
                    condition: crate::commands::organization::RuleCondition {
                        field: "extension".to_string(),
                        operator: crate::commands::organization::ConditionOperator::Equals,
                        value: "3mf".to_string(),
                        case_sensitive: Some(false),
                    },
                    action: crate::commands::organization::RuleAction {
                        action_type: crate::commands::organization::ActionType::Move,
                        target_folder: "~/StratoSort/3D Print Files".to_string(),
                        rename_pattern: None,
                    },
                    priority: 1,
                    enabled: true,
                },
            ],
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
            enabled: true,
        },
    ];

    for folder in default_folders {
        if let Err(e) = state.database.save_smart_folder(&folder).await {
            tracing::warn!(
                "Failed to create default smart folder '{}': {}",
                folder.name,
                e
            );
        } else {
            tracing::info!("Created default smart folder: {}", folder.name);
        }
    }

    Ok(())
}
