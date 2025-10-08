use crate::{error::Result, state::AppState};
use serde::{Deserialize, Serialize};
use tauri::{Emitter, State};
use tracing;

/// Progress update interval for organization operations
const ORGANIZATION_PROGRESS_UPDATE_INTERVAL: usize = 10;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SmartFolder {
    pub id: String,
    pub name: String,
    pub description: Option<String>, // User can describe what files belong here
    pub rules: Vec<OrganizationRule>,
    pub target_path: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub enabled: bool,
    pub naming_convention: Option<crate::commands::naming::NamingConvention>, // NEW: User's preferred naming pattern
    pub ai_guidance: Option<String>, // NEW: Additional AI guidance from user
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OrganizationRule {
    pub id: String,
    pub rule_type: RuleType,
    pub condition: RuleCondition,
    pub action: RuleAction,
    pub priority: i32,
    pub enabled: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum RuleType {
    FileExtension,
    FileSize,
    FileName,
    FileContent,
    CreationDate,
    ModificationDate,
    MimeType,
    Path,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RuleCondition {
    pub field: String,
    pub operator: ConditionOperator,
    pub value: String,
    pub case_sensitive: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum ConditionOperator {
    Equals,
    Contains,
    StartsWith,
    EndsWith,
    GreaterThan,
    LessThan,
    Regex,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RuleAction {
    pub action_type: ActionType,
    pub target_folder: String,
    pub rename_pattern: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum ActionType {
    Move,
    Copy,
    Rename,
    Tag,
}

#[tauri::command]
pub async fn create_smart_folder(
    name: String,
    description: Option<String>,
    target_path: String,
    rules: Vec<OrganizationRule>,
    state: State<'_, std::sync::Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<SmartFolder> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now();

    let smart_folder = SmartFolder {
        id: id.clone(),
        name: name.clone(),
        description,
        rules,
        target_path,
        created_at: now,
        updated_at: now,
        naming_convention: None,
        ai_guidance: None,
        enabled: true,
    };

    // Save to database
    match state.database.save_smart_folder(&smart_folder).await {
        Ok(_) => {
            // Emit success notification
            let _ = app.emit(
                "notification",
                serde_json::json!({
                    "type": "success",
                    "title": "Smart Folder Created",
                    "message": format!("Smart folder '{}' has been created successfully", name),
                    "timestamp": chrono::Utc::now().timestamp(),
                }),
            );

            tracing::info!("Created smart folder: {} ({})", name, id);
            Ok(smart_folder)
        }
        Err(e) => {
            tracing::error!("Failed to create smart folder '{}': {}", name, e);

            let _ = app.emit("notification", serde_json::json!({
                "type": "error",
                "title": "Failed to Create Smart Folder",
                "message": format!("Could not create smart folder '{}': {}", name, e.user_message()),
                "timestamp": chrono::Utc::now().timestamp(),
            }));

            Err(e)
        }
    }
}

#[tauri::command]
pub async fn update_smart_folder(
    id: String,
    name: Option<String>,
    description: Option<String>,
    target_path: Option<String>,
    rules: Option<Vec<OrganizationRule>>,
    enabled: Option<bool>,
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<SmartFolder> {
    let mut smart_folder = state.database.get_smart_folder(&id).await?.ok_or_else(|| {
        crate::error::AppError::NotFound {
            message: format!("Smart folder not found: {}", id),
        }
    })?;

    // Update fields
    if let Some(n) = name {
        smart_folder.name = n;
    }
    if let Some(d) = description {
        smart_folder.description = Some(d);
    }
    if let Some(tp) = target_path {
        smart_folder.target_path = tp;
    }
    if let Some(r) = rules {
        smart_folder.rules = r;
    }
    if let Some(e) = enabled {
        smart_folder.enabled = e;
    }

    smart_folder.updated_at = chrono::Utc::now();

    // Save to database
    state.database.save_smart_folder(&smart_folder).await?;

    Ok(smart_folder)
}

#[tauri::command]
pub async fn delete_smart_folder(
    id: String,
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<bool> {
    state.database.delete_smart_folder(&id).await?;
    Ok(true)
}

#[tauri::command]
pub async fn list_smart_folders(
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<Vec<SmartFolder>> {
    state.database.list_smart_folders().await
}

#[tauri::command]
pub async fn get_smart_folder(
    id: String,
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<Option<SmartFolder>> {
    state.database.get_smart_folder(&id).await
}

#[tauri::command]
pub async fn apply_smart_folder_rules(
    folder_id: String,
    file_paths: Vec<String>,
    dry_run: bool,
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<Vec<OrganizationPreview>> {
    let smart_folder = state
        .database
        .get_smart_folder(&folder_id)
        .await?
        .ok_or_else(|| crate::error::AppError::NotFound {
            message: format!("Smart folder not found: {}", folder_id),
        })?;

    if !smart_folder.enabled {
        return Ok(vec![]);
    }

    let mut previews = Vec::new();

    for file_path in file_paths {
        let file_info = match tokio::fs::metadata(&file_path).await {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };

        // Check if any rules match this file
        for rule in &smart_folder.rules {
            if !rule.enabled {
                continue;
            }

            let matches = match rule.rule_type {
                RuleType::FileExtension => {
                    let ext = std::path::Path::new(&file_path)
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or("");
                    evaluate_condition(&rule.condition, ext)
                }
                RuleType::FileName => {
                    let name = std::path::Path::new(&file_path)
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("");
                    evaluate_condition(&rule.condition, name)
                }
                RuleType::FileSize => {
                    evaluate_condition(&rule.condition, &file_info.len().to_string())
                }
                RuleType::MimeType => {
                    let mime = mime_guess::from_path(&file_path)
                        .first_or_octet_stream()
                        .to_string();
                    evaluate_condition(&rule.condition, &mime)
                }
                RuleType::FileContent => {
                    // For file content matching, read a portion of the file
                    if let Ok(content) = tokio::fs::read_to_string(&file_path).await {
                        evaluate_condition(&rule.condition, &content)
                    } else {
                        false
                    }
                }
                RuleType::CreationDate => {
                    // Get file creation time
                    if let Ok(created) = file_info.created() {
                        if let Ok(datetime) = created.duration_since(std::time::UNIX_EPOCH) {
                            let timestamp = datetime.as_secs().to_string();
                            evaluate_condition(&rule.condition, &timestamp)
                        } else {
                            false
                        }
                    } else {
                        false
                    }
                }
                RuleType::ModificationDate => {
                    // Get file modification time
                    if let Ok(modified) = file_info.modified() {
                        if let Ok(datetime) = modified.duration_since(std::time::UNIX_EPOCH) {
                            let timestamp = datetime.as_secs().to_string();
                            evaluate_condition(&rule.condition, &timestamp)
                        } else {
                            false
                        }
                    } else {
                        false
                    }
                }
                RuleType::Path => {
                    // Match against the full file path
                    evaluate_condition(&rule.condition, &file_path)
                }
            };

            if matches {
                let target_path = std::path::Path::new(&smart_folder.target_path)
                    .join(&rule.action.target_folder);

                let preview = OrganizationPreview {
                    source_path: file_path.clone(),
                    target_path: target_path.display().to_string(),
                    action: rule.action.action_type.clone(),
                    rule_id: rule.id.clone(),
                    confidence: 1.0, // Rule-based, so high confidence
                    rename_pattern: if rule.action.action_type == ActionType::Rename {
                        rule.action.rename_pattern.clone()
                    } else {
                        None
                    },
                };

                previews.push(preview);

                // If not dry run, perform the action
                if !dry_run {
                    match rule.action.action_type {
                        ActionType::Move => {
                            if let Some(parent) = target_path.parent() {
                                let _ = tokio::fs::create_dir_all(parent).await;
                            }
                            let _ = tokio::fs::rename(&file_path, &target_path).await;
                        }
                        ActionType::Copy => {
                            if let Some(parent) = target_path.parent() {
                                let _ = tokio::fs::create_dir_all(parent).await;
                            }
                            let _ = tokio::fs::copy(&file_path, &target_path).await;
                        }
                        ActionType::Rename => {
                            // Use the rename_pattern if provided, otherwise fall back to target_folder
                            let rename_pattern = rule
                                .action
                                .rename_pattern
                                .as_ref()
                                .unwrap_or(&rule.action.target_folder);

                            // Process rename pattern with placeholders
                            let new_name = apply_rename_pattern(&file_path, rename_pattern);
                            let parent = std::path::Path::new(&file_path)
                                .parent()
                                .unwrap_or(std::path::Path::new("."));
                            let new_path = parent.join(&new_name);
                            let _ = tokio::fs::rename(&file_path, &new_path).await;
                        }
                        ActionType::Tag => {
                            // For tagging, store metadata in database
                            // This would typically involve adding tags to the file's metadata
                            // For now, we'll just log it as the database operation would need more context
                            tracing::debug!(
                                "Tagged file {} with folder {}",
                                file_path,
                                rule.action.target_folder
                            );
                        }
                    }
                }

                break; // Only apply first matching rule
            }
        }
    }

    Ok(previews)
}

#[tauri::command]
pub async fn auto_organize_directory(
    directory_path: String,
    use_ai: bool,
    state: State<'_, std::sync::Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<Vec<OrganizationPreview>> {
    // Check if directory is protected
    if state
        .protected_folders
        .is_path_protected(&directory_path)
        .await?
    {
        return Err(crate::error::AppError::SecurityError {
            message: format!("Cannot organize protected directory: {}", directory_path),
        });
    }

    // Start progress tracking for organization
    let operation_id = state.start_operation(
        crate::state::OperationType::Organization,
        format!("Auto-organizing directory: {}", directory_path),
    );

    // Phase 1: Scan directory for files (10% progress)
    state.update_progress(
        operation_id,
        0.1,
        "Scanning directory for files".to_string(),
    );

    let mut file_paths = Vec::new();
    let mut entries = tokio::fs::read_dir(&directory_path).await?;

    while let Some(entry) = entries.next_entry().await? {
        // Check for cancellation
        if let Some(op) = state.active_operations.get(&operation_id) {
            if op.cancellation_token.is_cancelled() {
                state.complete_operation(operation_id);
                return Err(crate::error::AppError::Cancelled);
            }
        }

        if entry.file_type().await?.is_file() {
            file_paths.push(entry.path().display().to_string());
        }
    }

    state.update_progress(
        operation_id,
        0.2,
        format!("Found {} files to organize", file_paths.len()),
    );

    let mut all_previews = Vec::new();

    // Phase 2: AI analysis if requested (20-60% progress)
    let ai_analyses = if use_ai {
        state.update_progress(
            operation_id,
            0.3,
            "Starting AI analysis of files".to_string(),
        );

        let mut analyses = std::collections::HashMap::new();
        let total_files = file_paths.len();

        for (index, file_path) in file_paths.iter().enumerate() {
            // Check for cancellation
            if let Some(op) = state.active_operations.get(&operation_id) {
                if op.cancellation_token.is_cancelled() {
                    state.complete_operation(operation_id);
                    return Err(crate::error::AppError::Cancelled);
                }
            }

            // Analyze files that don't already have analysis results
            if state
                .database
                .get_analysis(file_path)
                .await
                .unwrap_or(None)
                .is_none()
            {
                // Use spawn_blocking for file I/O to avoid blocking the async runtime
                let file_path_owned = file_path.to_string();
                match tokio::task::spawn_blocking(move || std::fs::read_to_string(&file_path_owned)).await {
                    Ok(Ok(content)) => {
                        if let Ok(analysis) = state.ai_service.analyze_file(&content, "").await {
                            analyses.insert(file_path.clone(), analysis.category.clone());
                            // Store analysis result for future use
                            let _ = state.database.save_analysis(&analysis).await;
                        }
                    }
                    Ok(Err(e)) => {
                        tracing::warn!("Failed to read file for AI analysis: {}", e);
                    }
                    Err(e) => {
                        tracing::warn!("Task panicked while reading file: {}", e);
                    }
                }
            }

            // Update progress for AI analysis (30-60% range)
            if index % ORGANIZATION_PROGRESS_UPDATE_INTERVAL == 0 || index == total_files - 1 {
                let ai_progress = 0.3 + (0.3 * index as f32 / total_files as f32);
                state.update_progress(
                    operation_id,
                    ai_progress,
                    format!("Analyzed {} of {} files", index + 1, total_files),
                );
            }
        }
        analyses
    } else {
        std::collections::HashMap::new()
    };

    // Phase 3: Apply smart folder rules (60-90% progress)
    state.update_progress(operation_id, 0.6, "Applying smart folder rules".to_string());

    let smart_folders = state.database.list_smart_folders().await?;
    for (index, folder) in smart_folders.iter().enumerate() {
        // Check for cancellation
        if let Some(op) = state.active_operations.get(&operation_id) {
            if op.cancellation_token.is_cancelled() {
                state.complete_operation(operation_id);
                return Err(crate::error::AppError::Cancelled);
            }
        }

        if folder.enabled {
            let previews = apply_smart_folder_rules_enhanced(
                folder.id.clone(),
                file_paths.clone(),
                true, // dry run
                &ai_analyses,
                state.clone(),
            )
            .await?;
            all_previews.extend(previews);
        }

        // Update progress for rule application
        let rule_progress = 0.6 + (0.3 * index as f32 / smart_folders.len() as f32);
        state.update_progress(
            operation_id,
            rule_progress,
            format!("Applied rule: {}", folder.name),
        );
    }

    // Phase 4: AI fallback suggestions if needed (90-95% progress)
    if use_ai && all_previews.is_empty() {
        state.update_progress(
            operation_id,
            0.9,
            "Generating AI organization suggestions".to_string(),
        );

        let smart_folders = state
            .database
            .list_smart_folders()
            .await
            .unwrap_or_default();
        let suggestions = state
            .ai_service
            .suggest_organization(file_paths, smart_folders)
            .await?;
        for suggestion in suggestions {
            all_previews.push(OrganizationPreview {
                source_path: suggestion.source_path,
                target_path: format!("{}/{}", directory_path, suggestion.target_folder),
                action: ActionType::Move,
                rule_id: "ai-suggestion".to_string(),
                confidence: suggestion.confidence,
                rename_pattern: None, // AI suggestions don't use rename patterns by default
            });
        }
    }

    // Complete the operation
    state.update_progress(
        operation_id,
        1.0,
        format!(
            "Organization complete: {} suggestions generated",
            all_previews.len()
        ),
    );
    state.complete_operation(operation_id);

    // Emit event for organization preview ready
    let _ = app.emit(
        "organization-preview-ready",
        serde_json::json!({
            "previews": all_previews,
            "count": all_previews.len(),
            "directory": directory_path
        }),
    );

    Ok(all_previews)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OrganizationPreview {
    pub source_path: String,
    pub target_path: String,
    pub action: ActionType,
    pub rule_id: String,
    pub confidence: f32,
    pub rename_pattern: Option<String>, // Optional rename pattern for preview
}

#[tauri::command]
pub async fn suggest_file_organization(
    paths: Vec<String>,
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<Vec<crate::ai::OrganizationSuggestion>> {
    if paths.is_empty() {
        return Ok(vec![]);
    }

    if paths.len() > 1000 {
        return Err(crate::error::AppError::SecurityError {
            message: "Too many files for organization suggestion (max 1000)".to_string(),
        });
    }

    let smart_folders = state
        .database
        .list_smart_folders()
        .await
        .unwrap_or_default();
    state
        .ai_service
        .suggest_organization(paths, smart_folders)
        .await
}

#[tauri::command]
pub async fn apply_organization(
    operations: Vec<OrganizationOperation>,
    state: State<'_, std::sync::Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<Vec<OrganizationResult>> {
    if operations.is_empty() {
        return Err(crate::error::AppError::InvalidInput {
            message: "No operations provided".to_string(),
        });
    }

    if operations.len() > 500 {
        return Err(crate::error::AppError::SecurityError {
            message: "Too many operations requested (max 500)".to_string(),
        });
    }

    let mut results = Vec::new();
    let operation_id = state.start_operation(
        crate::state::OperationType::BulkOperation,
        format!("Organizing {} files", operations.len()),
    );

    // Start a batch operation for atomic undo/redo
    let batch_id = state.undo_redo.start_batch(format!("Organization of {} files", operations.len())).await;

    for (index, op) in operations.iter().enumerate() {
        let progress = index as f32 / operations.len() as f32;
        state.update_progress(
            operation_id,
            progress,
            format!(
                "Organizing: {}",
                std::path::Path::new(&op.source_path)
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
            ),
        );

        let result = match perform_organization_operation(op).await {
            Ok(_) => {
                // Record operation in batch for atomic undo
                let operation = crate::storage::Operation {
                    id: uuid::Uuid::new_v4().to_string(),
                    operation_type: "move".to_string(),
                    source: op.source_path.clone(),
                    destination: Some(op.target_path.clone()),
                    timestamp: chrono::Utc::now().timestamp(),
                    metadata: None,
                };

                if let Err(e) = state.undo_redo.record_in_batch(&batch_id, operation).await {
                    tracing::warn!("Failed to record operation in batch: {}", e);
                }

                // Emit success event for this operation
                let _ = app.emit(
                    "organization-success",
                    serde_json::json!({
                        "source_path": op.source_path,
                        "target_path": op.target_path,
                        "action": op.action,
                        "timestamp": chrono::Utc::now().timestamp(),
                    }),
                );

                OrganizationResult {
                    source_path: op.source_path.clone(),
                    target_path: op.target_path.clone(),
                    action: op.action.clone(),
                    success: true,
                    error: None,
                }
            }
            Err(e) => {
                tracing::error!(
                    "Organization operation failed for {}: {}",
                    op.source_path,
                    e
                );

                // Emit error event for this operation
                let _ = app.emit(
                    "organization-failed",
                    serde_json::json!({
                        "source_path": op.source_path,
                        "target_path": op.target_path,
                        "action": op.action,
                        "error": e.to_string(),
                        "error_type": e.error_type(),
                        "recoverable": e.is_recoverable(),
                        "timestamp": chrono::Utc::now().timestamp(),
                    }),
                );

                OrganizationResult {
                    source_path: op.source_path.clone(),
                    target_path: op.target_path.clone(),
                    action: op.action.clone(),
                    success: false,
                    error: Some(e.to_string()),
                }
            }
        };

        results.push(result);
    }

    // Commit the batch operation for atomic undo/redo
    // Only commit if there were successful operations
    let success_count = results.iter().filter(|r| r.success).count();
    if success_count > 0 {
        if let Err(e) = state.undo_redo.commit_batch(&batch_id).await {
            tracing::warn!("Failed to commit batch operation: {}", e);
        }
    }

    state.complete_operation(operation_id);

    // Emit completion summary
    let total_count = results.len();

    if success_count == total_count {
        let _ = app.emit(
            "notification",
            serde_json::json!({
                "type": "success",
                "title": "Organization Complete",
                "message": format!("Successfully organized {} files", success_count),
                "timestamp": chrono::Utc::now().timestamp(),
            }),
        );
    } else {
        let _ = app.emit("notification", serde_json::json!({
            "type": "warning",
            "title": "Organization Partially Complete",
            "message": format!("Organized {} of {} files. {} failed.", success_count, total_count, total_count - success_count),
            "timestamp": chrono::Utc::now().timestamp(),
        }));
    }

    Ok(results)
}

#[tauri::command]
pub async fn get_smart_folders(
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<Vec<SmartFolder>> {
    state.database.list_smart_folders().await
}

#[tauri::command]
pub async fn match_to_folders(
    paths: Vec<String>,
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<Vec<FolderMatch>> {
    let smart_folders = state.database.list_smart_folders().await?;
    let mut matches = Vec::new();

    for path in paths {
        let mut best_match: Option<FolderMatch> = None;
        let mut best_confidence = 0.0;

        for folder in &smart_folders {
            if !folder.enabled {
                continue;
            }

            let confidence = calculate_folder_match_confidence(&path, folder).await;
            if confidence > best_confidence && confidence > 0.5 {
                best_confidence = confidence;
                best_match = Some(FolderMatch {
                    file_path: path.clone(),
                    folder_id: folder.id.clone(),
                    folder_name: folder.name.clone(),
                    confidence,
                    suggested_action: ActionType::Move,
                });
            }
        }

        if let Some(m) = best_match {
            matches.push(m);
        }
    }

    Ok(matches)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OrganizationOperation {
    pub source_path: String,
    pub target_path: String,
    pub action: ActionType,
    pub rename_pattern: Option<String>, // Optional rename pattern for Rename actions
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OrganizationResult {
    pub source_path: String,
    pub target_path: String,
    pub action: ActionType,
    pub success: bool,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FolderMatch {
    pub file_path: String,
    pub folder_id: String,
    pub folder_name: String,
    pub confidence: f32,
    pub suggested_action: ActionType,
}

async fn perform_organization_operation(op: &OrganizationOperation) -> Result<()> {
    let source = std::path::Path::new(&op.source_path);

    // For rename operations with a pattern, calculate the new name
    let target_path = if op.action == ActionType::Rename && op.rename_pattern.is_some() {
        let pattern =
            op.rename_pattern
                .as_ref()
                .ok_or_else(|| crate::error::AppError::InvalidInput {
                    message: "Rename pattern is required for rename operations".to_string(),
                })?;
        let new_name = apply_rename_pattern(&op.source_path, pattern);

        // If target_path contains a directory, use it; otherwise use source parent
        let target = std::path::Path::new(&op.target_path);
        if target.is_dir() || op.target_path.ends_with('/') || op.target_path.ends_with('\\') {
            // target_path is a directory, append the new name
            target.join(&new_name)
        } else if let Some(parent) = target.parent() {
            // target_path includes a filename, replace it with new name
            parent.join(&new_name)
        } else {
            // Use source parent directory
            source
                .parent()
                .unwrap_or(std::path::Path::new("."))
                .join(&new_name)
        }
    } else {
        std::path::Path::new(&op.target_path).to_path_buf()
    };

    if !source.exists() {
        return Err(crate::error::AppError::FileNotFound {
            path: op.source_path.clone(),
        });
    }

    // Create target directory if needed
    if let Some(parent) = target_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    match op.action {
        ActionType::Move => {
            tokio::fs::rename(source, &target_path).await?;
        }
        ActionType::Copy => {
            if source.is_dir() {
                copy_dir_all(source, &target_path).await?;
            } else {
                tokio::fs::copy(source, &target_path).await?;
            }
        }
        ActionType::Rename => {
            tokio::fs::rename(source, &target_path).await?;
        }
        _ => {
            return Err(crate::error::AppError::InvalidInput {
                message: format!("Unsupported action: {:?}", op.action),
            });
        }
    }

    Ok(())
}

async fn copy_dir_all(src: &std::path::Path, dst: &std::path::Path) -> Result<()> {
    tokio::fs::create_dir_all(dst).await?;

    let mut entries = tokio::fs::read_dir(src).await?;
    while let Some(entry) = entries.next_entry().await? {
        let ty = entry.file_type().await?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());

        if ty.is_dir() {
            Box::pin(copy_dir_all(&src_path, &dst_path)).await?;
        } else {
            tokio::fs::copy(&src_path, &dst_path).await?;
        }
    }

    Ok(())
}

pub async fn calculate_folder_match_confidence(file_path: &str, folder: &SmartFolder) -> f32 {
    let path = std::path::Path::new(file_path);
    let mut total_score = 0.0;
    let mut rule_count = 0;

    // Try to get AI analysis for enhanced matching
    // Note: For now, we'll extract category info from file extension/path pattern
    // A future enhancement can integrate with AI service analysis results
    let ai_category: Option<String> = infer_file_category(file_path);

    for rule in &folder.rules {
        if !rule.enabled {
            continue;
        }

        rule_count += 1;

        let matches = match rule.rule_type {
            RuleType::FileExtension => {
                let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
                evaluate_condition(&rule.condition, ext)
            }
            RuleType::FileName => {
                let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                evaluate_condition(&rule.condition, name)
            }
            RuleType::MimeType => {
                let mime = mime_guess::from_path(path)
                    .first_or_octet_stream()
                    .to_string();
                evaluate_condition(&rule.condition, &mime)
            }
            RuleType::FileSize => {
                // Get file size for comparison using spawn_blocking
                let file_path_owned = file_path.to_string();
                match tokio::task::spawn_blocking(move || std::fs::metadata(&file_path_owned)).await {
                    Ok(Ok(metadata)) => {
                        let size_str = metadata.len().to_string();
                        evaluate_condition(&rule.condition, &size_str)
                    }
                    Ok(Err(e)) => {
                        tracing::warn!("Failed to get file metadata for size comparison: {}", e);
                        false
                    }
                    Err(e) => {
                        tracing::warn!("Task panicked while getting file metadata: {}", e);
                        false
                    }
                }
            }
            RuleType::FileContent => {
                // Read file content for matching using spawn_blocking (first 10KB for performance)
                let file_path_owned = file_path.to_string();
                match tokio::task::spawn_blocking(move || std::fs::read_to_string(&file_path_owned)).await {
                    Ok(Ok(content)) => {
                        let preview = if content.len() > 10240 {
                            &content[..10240]
                        } else {
                            &content
                        };
                        evaluate_condition(&rule.condition, preview)
                    }
                    Ok(Err(e)) => {
                        tracing::warn!("Failed to read file for content matching: {}", e);
                        false
                    }
                    Err(e) => {
                        tracing::warn!("Task panicked while reading file for content matching: {}", e);
                        false
                    }
                }
            }
            RuleType::CreationDate => {
                // Get creation date for comparison using spawn_blocking
                let file_path_owned = file_path.to_string();
                match tokio::task::spawn_blocking(move || std::fs::metadata(&file_path_owned)).await {
                    Ok(Ok(metadata)) => {
                        if let Ok(created) = metadata.created() {
                            if let Ok(duration) = created.duration_since(std::time::UNIX_EPOCH) {
                                let timestamp_str = duration.as_secs().to_string();
                                evaluate_condition(&rule.condition, &timestamp_str)
                            } else {
                                false
                            }
                        } else {
                            false
                        }
                    }
                    Ok(Err(e)) => {
                        tracing::warn!("Failed to get file metadata for creation date: {}", e);
                        false
                    }
                    Err(e) => {
                        tracing::warn!("Task panicked while getting file metadata for creation date: {}", e);
                        false
                    }
                }
            }
            RuleType::ModificationDate => {
                // Get modification date for comparison using spawn_blocking
                let file_path_owned = file_path.to_string();
                match tokio::task::spawn_blocking(move || std::fs::metadata(&file_path_owned)).await {
                    Ok(Ok(metadata)) => {
                        if let Ok(modified) = metadata.modified() {
                            if let Ok(duration) = modified.duration_since(std::time::UNIX_EPOCH) {
                                let timestamp_str = duration.as_secs().to_string();
                                evaluate_condition(&rule.condition, &timestamp_str)
                            } else {
                                false
                            }
                        } else {
                            false
                        }
                    }
                    Ok(Err(e)) => {
                        tracing::warn!("Failed to get file metadata for modification date: {}", e);
                        false
                    }
                    Err(e) => {
                        tracing::warn!("Task panicked while getting file metadata for modification date: {}", e);
                        false
                    }
                }
            }
            RuleType::Path => {
                // Match against the full file path
                evaluate_condition(&rule.condition, file_path)
            }
        };

        if matches {
            total_score += 1.0;
        }
    }

    // Enhanced confidence calculation
    let base_confidence = if rule_count > 0 {
        total_score / rule_count as f32
    } else {
        0.0
    };

    // Boost confidence if AI analysis matches folder purpose/name

    if let Some(category) = ai_category {
        let folder_name_lower = folder.name.to_lowercase();
        let category_lower = category.to_lowercase();

        // If AI category matches folder name/type, boost confidence
        if folder_name_lower.contains(&category_lower)
            || category_lower.contains(&folder_name_lower)
        {
            (base_confidence + 0.3).min(1.0) // Boost by 30% but cap at 100%
        } else {
            base_confidence
        }
    } else {
        base_confidence
    }
}

fn evaluate_condition(condition: &RuleCondition, value: &str) -> bool {
    let case_sensitive = condition.case_sensitive.unwrap_or(false);

    // Prepare values for comparison based on case sensitivity
    let (compare_value, compare_condition) = if case_sensitive {
        (value.to_string(), condition.value.clone())
    } else {
        (value.to_lowercase(), condition.value.to_lowercase())
    };

    match condition.operator {
        ConditionOperator::Equals => compare_value == compare_condition,
        ConditionOperator::Contains => compare_value.contains(&compare_condition),
        ConditionOperator::StartsWith => compare_value.starts_with(&compare_condition),
        ConditionOperator::EndsWith => compare_value.ends_with(&compare_condition),
        ConditionOperator::GreaterThan => {
            if let (Ok(val), Ok(cond)) = (value.parse::<f64>(), condition.value.parse::<f64>()) {
                val > cond
            } else {
                false
            }
        }
        ConditionOperator::LessThan => {
            if let (Ok(val), Ok(cond)) = (value.parse::<f64>(), condition.value.parse::<f64>()) {
                val < cond
            } else {
                false
            }
        }
        ConditionOperator::Regex => {
            let regex_flags = if case_sensitive {
                &condition.value
            } else {
                // For case-insensitive regex, we need to add the 'i' flag if not already present
                &format!("(?i){}", condition.value)
            };

            if let Ok(regex) = regex::Regex::new(regex_flags) {
                regex.is_match(value)
            } else {
                false
            }
        }
    }
}

/// Enhanced smart folder rules application with AI analysis integration
async fn apply_smart_folder_rules_enhanced(
    folder_id: String,
    file_paths: Vec<String>,
    dry_run: bool,
    ai_analyses: &std::collections::HashMap<String, String>,
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<Vec<OrganizationPreview>> {
    let folder = state.database.get_smart_folder(&folder_id).await?.ok_or(
        crate::error::AppError::DatabaseError {
            message: "Smart folder not found".to_string(),
        },
    )?;

    let mut previews = Vec::new();

    for file_path in file_paths {
        // Calculate confidence using both rules and AI analysis
        let confidence =
            calculate_folder_match_confidence_with_ai(&file_path, &folder, ai_analyses).await;

        if confidence > 0.5 {
            let target_path = std::path::Path::new(&folder.target_path)
                .join(
                    std::path::Path::new(&file_path)
                        .file_name()
                        .unwrap_or_default(),
                )
                .display()
                .to_string();

            previews.push(OrganizationPreview {
                source_path: file_path,
                target_path,
                action: ActionType::Move,
                rule_id: folder_id.clone(),
                confidence,
                rename_pattern: None, // This function uses Move action by default
            });
        }
    }

    if !dry_run {
        // Actually perform the moves (implementation would be here)
        // For now, just return the previews
    }

    Ok(previews)
}

/// Calculate folder match confidence enhanced with AI analysis
async fn calculate_folder_match_confidence_with_ai(
    file_path: &str,
    folder: &SmartFolder,
    ai_analyses: &std::collections::HashMap<String, String>,
) -> f32 {
    // Start with base confidence from rules
    let base_confidence = calculate_folder_match_confidence(file_path, folder).await;

    // Enhance with AI analysis if available
    if let Some(ai_category) = ai_analyses.get(file_path) {
        let folder_name_lower = folder.name.to_lowercase();
        let category_lower = ai_category.to_lowercase();

        // AI category matches folder name/purpose
        if folder_name_lower.contains(&category_lower)
            || category_lower.contains(&folder_name_lower)
            || folder
                .description
                .as_ref()
                .map(|d| d.to_lowercase().contains(&category_lower))
                .unwrap_or(false)
        {
            (base_confidence + 0.4).min(1.0) // Boost by 40% but cap at 100%
        } else {
            base_confidence
        }
    } else {
        base_confidence
    }
}

/// Preview how files would be renamed with a given pattern
#[tauri::command]
pub async fn preview_rename_pattern(
    file_paths: Vec<String>,
    pattern: String,
    options: Option<RenameOptions>,
) -> Result<Vec<RenamePreview>> {
    let mut previews = Vec::new();
    let options = options.unwrap_or_default();

    // Reset counter for this preview session
    if options.reset_counter {
        RENAME_COUNTER.store(options.counter_start, std::sync::atomic::Ordering::SeqCst);
    }

    for file_path in file_paths.iter().take(100) {
        // Limit preview to 100 files
        let new_name = apply_rename_pattern_with_options(file_path, &pattern, &options);

        let valid = validate_filename(&new_name);
        let full_new_path = if let Some(parent) = std::path::Path::new(file_path).parent() {
            parent.join(&new_name).display().to_string()
        } else {
            new_name.clone()
        };

        previews.push(RenamePreview {
            original_path: file_path.clone(),
            new_name: new_name.clone(),
            full_new_path,
            valid,
            error: if !valid {
                Some(get_filename_error(&new_name))
            } else {
                None
            },
        });
    }

    Ok(previews)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RenamePreview {
    pub original_path: String,
    pub new_name: String,
    pub full_new_path: String,
    pub valid: bool,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RenameOptions {
    pub lowercase: bool,
    pub uppercase: bool,
    pub capitalize_words: bool,
    pub replace_spaces: Option<String>,
    pub remove_special_chars: bool,
    pub counter_start: usize,
    pub counter_padding: usize,
    pub reset_counter: bool,
    pub custom_text: Option<String>,
}

impl Default for RenameOptions {
    fn default() -> Self {
        Self {
            lowercase: false,
            uppercase: false,
            capitalize_words: false,
            replace_spaces: None,
            remove_special_chars: false,
            counter_start: 1,
            counter_padding: 4,
            reset_counter: true,
            custom_text: None,
        }
    }
}

// Global counter for rename operations
static RENAME_COUNTER: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(1);

/// Apply rename pattern with additional options
fn apply_rename_pattern_with_options(
    file_path: &str,
    pattern: &str,
    options: &RenameOptions,
) -> String {
    let path = std::path::Path::new(file_path);

    // Extract file components
    let name_without_ext = path
        .file_stem()
        .and_then(|n| n.to_str())
        .unwrap_or("unnamed");
    let extension = path.extension().and_then(|e| e.to_str()).unwrap_or("");

    // Apply text transformations to name if requested
    let mut processed_name = name_without_ext.to_string();

    if options.lowercase {
        processed_name = processed_name.to_lowercase();
    } else if options.uppercase {
        processed_name = processed_name.to_uppercase();
    } else if options.capitalize_words {
        processed_name = capitalize_words(&processed_name);
    }

    if let Some(ref replacement) = options.replace_spaces {
        processed_name = processed_name.replace(' ', replacement);
    }

    if options.remove_special_chars {
        processed_name = processed_name
            .chars()
            .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_' || *c == ' ')
            .collect();
    }

    // Get current date/time components
    let now = chrono::Local::now();

    // Replace placeholders in pattern
    let mut result = pattern.to_string();

    // Basic placeholders with processed name
    result = result.replace("{name}", &processed_name);
    result = result.replace("{ext}", extension);
    result = result.replace("{filename}", &format!("{}.{}", processed_name, extension));

    // Date/time placeholders
    result = result.replace("{year}", &now.format("%Y").to_string());
    result = result.replace("{month}", &now.format("%m").to_string());
    result = result.replace("{day}", &now.format("%d").to_string());
    result = result.replace("{date}", &now.format("%Y-%m-%d").to_string());
    result = result.replace("{time}", &now.format("%H-%M-%S").to_string());
    result = result.replace("{timestamp}", &now.format("%Y%m%d-%H%M%S").to_string());

    // Counter placeholders with configurable padding
    let count = RENAME_COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    let padded_counter = format!("{:0width$}", count, width = options.counter_padding);
    result = result.replace("{counter}", &padded_counter);
    result = result.replace("{count}", &count.to_string());

    // Custom text placeholder
    if let Some(ref custom) = options.custom_text {
        result = result.replace("{custom}", custom);
    }

    // Clean up the result - remove any invalid characters for filenames
    result = result.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");

    // Ensure extension is added if not included in pattern
    if !result.contains('.') && !extension.is_empty() {
        result.push('.');
        result.push_str(extension);
    }

    // Apply final case transformation to entire result if needed
    if options.lowercase && extension.is_empty() {
        result = result.to_lowercase();
    }

    result
}

/// Helper function to capitalize words
fn capitalize_words(s: &str) -> String {
    s.split_whitespace()
        .map(|word| {
            let mut chars = word.chars();
            match chars.next() {
                None => String::new(),
                Some(first) => first.to_uppercase().chain(chars).collect(),
            }
        })
        .collect::<Vec<String>>()
        .join(" ")
}

/// Get detailed error message for invalid filename
fn get_filename_error(name: &str) -> String {
    if name.is_empty() {
        return "Filename cannot be empty".to_string();
    }

    if name.len() > 255 {
        return format!("Filename too long ({} characters, max 255)", name.len());
    }

    // Check for invalid characters
    let invalid_chars = ['/', '\\', ':', '*', '?', '"', '<', '>', '|', '\0'];
    for c in name.chars() {
        if invalid_chars.contains(&c) {
            return format!("Invalid character '{}' in filename", c);
        }
    }

    // Check for reserved Windows names
    let reserved_names = [
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
        "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];

    let name_upper = name.to_uppercase();
    let base_name = if let Some(dot_pos) = name_upper.find('.') {
        &name_upper[..dot_pos]
    } else {
        &name_upper
    };

    if reserved_names.contains(&base_name) {
        return format!("'{}' is a reserved filename on Windows", base_name);
    }

    if name.ends_with(' ') {
        return "Filename cannot end with a space".to_string();
    }

    if name.ends_with('.') {
        return "Filename cannot end with a period".to_string();
    }

    "Unknown filename validation error".to_string()
}

/// Validate filename for invalid characters
fn validate_filename(name: &str) -> bool {
    // Check for empty or too long names
    if name.is_empty() || name.len() > 255 {
        return false;
    }

    // Check for invalid characters
    let invalid_chars = ['/', '\\', ':', '*', '?', '"', '<', '>', '|', '\0'];
    if name.chars().any(|c| invalid_chars.contains(&c)) {
        return false;
    }

    // Check for reserved Windows names
    let reserved_names = [
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
        "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];

    let name_upper = name.to_uppercase();
    let base_name = if let Some(dot_pos) = name_upper.find('.') {
        &name_upper[..dot_pos]
    } else {
        &name_upper
    };

    if reserved_names.contains(&base_name) {
        return false;
    }

    // Check for names ending with space or period
    if name.ends_with(' ') || name.ends_with('.') {
        return false;
    }

    true
}

/// Apply rename pattern with placeholders to generate new filename
fn apply_rename_pattern(file_path: &str, pattern: &str) -> String {
    let path = std::path::Path::new(file_path);

    // Extract file components
    let name_without_ext = path
        .file_stem()
        .and_then(|n| n.to_str())
        .unwrap_or("unnamed");
    let extension = path.extension().and_then(|e| e.to_str()).unwrap_or("");

    // Get current date/time components
    let now = chrono::Local::now();

    // Replace placeholders in pattern
    let mut result = pattern.to_string();

    // Basic placeholders
    result = result.replace("{name}", name_without_ext);
    result = result.replace("{ext}", extension);
    result = result.replace("{filename}", &format!("{}.{}", name_without_ext, extension));

    // Date/time placeholders
    result = result.replace("{year}", &now.format("%Y").to_string());
    result = result.replace("{month}", &now.format("%m").to_string());
    result = result.replace("{day}", &now.format("%d").to_string());
    result = result.replace("{date}", &now.format("%Y-%m-%d").to_string());
    result = result.replace("{time}", &now.format("%H-%M-%S").to_string());
    result = result.replace("{timestamp}", &now.format("%Y%m%d-%H%M%S").to_string());

    // Counter placeholder (uses global RENAME_COUNTER)
    let count = RENAME_COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    result = result.replace("{counter}", &format!("{:04}", count));
    result = result.replace("{count}", &count.to_string());

    // Clean up the result - remove any invalid characters for filenames
    result = result.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");

    // Ensure extension is added if not included in pattern
    if !result.contains('.') && !extension.is_empty() {
        result.push('.');
        result.push_str(extension);
    }

    result
}

/// Infer file category from extension and path patterns for AI-enhanced matching
fn infer_file_category(file_path: &str) -> Option<String> {
    let path = std::path::Path::new(file_path);
    let extension = path.extension().and_then(|e| e.to_str()).unwrap_or("");
    let filename = path.file_name().and_then(|n| n.to_str()).unwrap_or("");

    match extension.to_lowercase().as_str() {
        // Document files
        "pdf" | "doc" | "docx" | "docm" | "dot" | "dotx" | "dotm" | "txt" | "rtf" | "odt"
        | "ott" | "pages" => Some("Documents".to_string()),

        // Image files
        "jpg" | "jpeg" | "png" | "gif" | "bmp" | "svg" | "webp" | "tiff" => {
            Some("Images".to_string())
        }

        // Video files
        "mp4" | "avi" | "mkv" | "mov" | "wmv" | "flv" | "webm" | "m4v" => {
            Some("Videos".to_string())
        }

        // Audio files
        "mp3" | "wav" | "flac" | "aac" | "ogg" | "wma" | "m4a" => Some("Audio".to_string()),

        // Code files
        "rs" | "py" | "js" | "ts" | "java" | "c" | "cpp" | "h" | "hpp" | "go" | "php" => {
            Some("Code".to_string())
        }

        // Archive files
        "zip" | "rar" | "7z" | "tar" | "gz" | "bz2" => Some("Archives".to_string()),

        // Spreadsheet files
        "xls" | "xlsx" | "xlsm" | "xlsb" | "xlt" | "xltx" | "xltm" | "csv" | "tsv" | "ods"
        | "ots" | "numbers" => Some("Spreadsheets".to_string()),

        // Presentation files
        "ppt" | "pptx" | "pptm" | "ppsx" | "pps" | "pot" | "potx" | "potm" | "odp" | "key" => {
            Some("Presentations".to_string())
        }

        // 3D Print files
        "stl" | "obj" | "3mf" | "amf" | "ply" | "x3d" | "dae" | "blend" | "fbx" | "3ds" | "max"
        | "c4d" | "ma" | "mb" | "skp" | "dwg" | "dxf" | "step" | "stp" | "iges" | "igs"
        | "brep" | "gcode" | "g" | "ngc" | "cnc" | "prusa" | "chitubox" | "lgs" | "pws" | "sl1"
        | "ctb" | "cbddlp" | "photon" | "pmsq" | "zip3d" => Some("3D Print Files".to_string()),

        _ => {
            // Try to infer from filename patterns
            let filename_lower = filename.to_lowercase();

            if filename_lower.contains("screenshot") || filename_lower.contains("screen") {
                Some("Screenshots".to_string())
            } else if filename_lower.contains("download") {
                Some("Downloads".to_string())
            } else if filename_lower.contains("backup") {
                Some("Backups".to_string())
            } else if filename_lower.contains("temp") || filename_lower.contains("tmp") {
                Some("Temporary".to_string())
            } else if filename_lower.contains("print")
                || filename_lower.contains("model")
                || filename_lower.contains("miniature")
                || filename_lower.contains("figurine")
                || filename_lower.contains("prototype")
            {
                Some("3D Print Files".to_string())
            } else {
                None
            }
        }
    }
}

// New validation and testing structures
#[derive(Debug, Serialize, Deserialize)]
pub struct RuleValidationResult {
    pub valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
    pub suggestions: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RuleTestResult {
    pub file_path: String,
    pub matches: bool,
    pub match_value: Option<String>,
    pub error: Option<String>,
    pub execution_time_ms: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RuleTestSummary {
    pub rule_id: String,
    pub total_files: usize,
    pub matched_files: usize,
    pub failed_files: usize,
    pub average_execution_time_ms: f64,
    pub results: Vec<RuleTestResult>,
}

/// Validate a rule for correctness and provide suggestions
#[tauri::command]
pub async fn validate_rule(
    rule: OrganizationRule,
    _state: State<'_, std::sync::Arc<AppState>>,
) -> Result<RuleValidationResult> {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let mut suggestions = Vec::new();

    // Validate rule structure
    if rule.id.trim().is_empty() {
        errors.push("Rule ID cannot be empty".to_string());
    }

    if rule.condition.field.trim().is_empty() {
        errors.push("Rule condition field cannot be empty".to_string());
    }

    if rule.condition.value.trim().is_empty() {
        warnings.push("Rule condition value is empty - this may not match anything".to_string());
    }

    if rule.action.target_folder.trim().is_empty() {
        errors.push("Target folder cannot be empty".to_string());
    }

    // Validate rule type and condition compatibility
    match rule.rule_type {
        RuleType::FileSize => {
            if !matches!(
                rule.condition.operator,
                ConditionOperator::GreaterThan
                    | ConditionOperator::LessThan
                    | ConditionOperator::Equals
            ) {
                warnings.push("File size rules typically work best with GreaterThan, LessThan, or Equals operators".to_string());
            }

            if rule.condition.value.parse::<u64>().is_err() {
                errors.push(
                    "File size condition value must be a valid number (in bytes)".to_string(),
                );
            } else {
                suggestions.push("Consider using human-readable units in your UI (KB, MB, GB) and convert to bytes".to_string());
            }
        }
        RuleType::CreationDate | RuleType::ModificationDate => {
            if !matches!(
                rule.condition.operator,
                ConditionOperator::GreaterThan
                    | ConditionOperator::LessThan
                    | ConditionOperator::Equals
            ) {
                warnings.push("Date rules typically work best with GreaterThan, LessThan, or Equals operators".to_string());
            }

            // Try to parse as timestamp
            if rule.condition.value.parse::<u64>().is_err() {
                // Try to parse as date string
                if chrono::DateTime::parse_from_rfc3339(&rule.condition.value).is_err() {
                    errors.push(
                        "Date condition value must be a valid timestamp or ISO 8601 date string"
                            .to_string(),
                    );
                }
            }
        }
        RuleType::FileExtension => {
            if rule.condition.value.starts_with('.') {
                suggestions.push("File extension should not include the dot (.) - it will be added automatically".to_string());
            }

            if rule.condition.value.contains(' ') {
                warnings.push("File extensions typically don't contain spaces".to_string());
            }
        }
        RuleType::FileName | RuleType::Path => {
            if matches!(
                rule.condition.operator,
                ConditionOperator::GreaterThan | ConditionOperator::LessThan
            ) {
                warnings.push(
                    "Numeric comparison operators are unusual for file name or path rules"
                        .to_string(),
                );
            }

            // Check regex patterns if using regex operator
            if matches!(rule.condition.operator, ConditionOperator::Regex) {
                if let Err(e) = regex::Regex::new(&rule.condition.value) {
                    errors.push(format!("Invalid regex pattern: {}", e));
                } else {
                    suggestions.push(
                        "Test your regex pattern with sample data to ensure it works as expected"
                            .to_string(),
                    );
                }
            }
        }
        RuleType::MimeType => {
            // Basic MIME type validation
            if !rule.condition.value.contains('/') {
                warnings.push(
                    "MIME types typically contain a '/' character (e.g., 'image/jpeg')".to_string(),
                );
            }
        }
        RuleType::FileContent => {
            if matches!(
                rule.condition.operator,
                ConditionOperator::GreaterThan | ConditionOperator::LessThan
            ) {
                warnings.push(
                    "Numeric comparison operators are unusual for file content rules".to_string(),
                );
            }

            // Check regex patterns if using regex operator
            if matches!(rule.condition.operator, ConditionOperator::Regex) {
                if let Err(e) = regex::Regex::new(&rule.condition.value) {
                    errors.push(format!("Invalid regex pattern: {}", e));
                } else {
                    suggestions.push(
                        "Test your regex pattern with sample data to ensure it works as expected"
                            .to_string(),
                    );
                }
            }

            suggestions.push("File content matching can be slow for large files. Consider using other rule types when possible".to_string());
        }
    }

    // Validate priority
    if rule.priority < 0 {
        warnings.push(
            "Negative priority values are unusual. Lower numbers = higher priority".to_string(),
        );
    }

    if rule.priority > 1000 {
        warnings.push("Very high priority values (>1000) are unusual".to_string());
    }

    // Case sensitivity suggestions
    if rule.condition.case_sensitive.is_none() {
        suggestions.push(
            "Consider specifying case_sensitive explicitly for predictable behavior".to_string(),
        );
    }

    // Action validation
    match rule.action.action_type {
        ActionType::Rename => {
            if rule.action.rename_pattern.is_none()
                || rule
                    .action
                    .rename_pattern
                    .as_ref()
                    .map_or(true, |p| p.trim().is_empty())
            {
                errors.push("Rename action requires a rename pattern".to_string());
            }
        }
        ActionType::Tag => {
            suggestions.push("Tag action stores metadata but doesn't move files. Ensure this matches your intent".to_string());
        }
        _ => {}
    }

    let valid = errors.is_empty();

    if valid {
        suggestions.push("Rule validation passed! Consider testing with sample files".to_string());
    }

    Ok(RuleValidationResult {
        valid,
        errors,
        warnings,
        suggestions,
    })
}

/// Test a rule against a set of sample files
#[tauri::command]
pub async fn test_rule_against_files(
    rule: OrganizationRule,
    file_paths: Vec<String>,
    _state: State<'_, std::sync::Arc<AppState>>,
) -> Result<RuleTestSummary> {
    if file_paths.len() > 100 {
        return Err(crate::error::AppError::InvalidInput {
            message: "Too many files for rule testing (max 100)".to_string(),
        });
    }

    let mut results = Vec::new();
    let mut total_execution_time = 0.0;
    let mut matched_files = 0;
    let mut failed_files = 0;

    for file_path in &file_paths {
        let start_time = std::time::Instant::now();

        let test_result = match test_rule_against_single_file(&rule, file_path).await {
            Ok((matches, match_value)) => {
                if matches {
                    matched_files += 1;
                }

                RuleTestResult {
                    file_path: file_path.clone(),
                    matches,
                    match_value: Some(match_value),
                    error: None,
                    execution_time_ms: start_time.elapsed().as_secs_f64() * 1000.0,
                }
            }
            Err(e) => {
                failed_files += 1;
                RuleTestResult {
                    file_path: file_path.clone(),
                    matches: false,
                    match_value: None,
                    error: Some(e.to_string()),
                    execution_time_ms: start_time.elapsed().as_secs_f64() * 1000.0,
                }
            }
        };

        total_execution_time += test_result.execution_time_ms;
        results.push(test_result);
    }

    let average_execution_time = if file_paths.is_empty() {
        0.0
    } else {
        total_execution_time / file_paths.len() as f64
    };

    Ok(RuleTestSummary {
        rule_id: rule.id.clone(),
        total_files: file_paths.len(),
        matched_files,
        failed_files,
        average_execution_time_ms: average_execution_time,
        results,
    })
}

/// Helper function to test a rule against a single file
async fn test_rule_against_single_file(
    rule: &OrganizationRule,
    file_path: &str,
) -> Result<(bool, String)> {
    if !std::path::Path::new(file_path).exists() {
        return Err(crate::error::AppError::FileNotFound {
            path: file_path.to_string(),
        });
    }

    let path = std::path::Path::new(file_path);

    let (matches, match_value) = match rule.rule_type {
        RuleType::FileExtension => {
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
            (evaluate_condition(&rule.condition, ext), ext.to_string())
        }
        RuleType::FileName => {
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            (evaluate_condition(&rule.condition, name), name.to_string())
        }
        RuleType::Path => (
            evaluate_condition(&rule.condition, file_path),
            file_path.to_string(),
        ),
        RuleType::MimeType => {
            let mime = mime_guess::from_path(path)
                .first_or_octet_stream()
                .to_string();
            (evaluate_condition(&rule.condition, &mime), mime)
        }
        RuleType::FileSize => {
            let metadata = tokio::fs::metadata(file_path).await?;
            let size_str = metadata.len().to_string();
            (evaluate_condition(&rule.condition, &size_str), size_str)
        }
        RuleType::FileContent => {
            let content = tokio::fs::read_to_string(file_path).await.map_err(|_| {
                crate::error::AppError::InvalidInput {
                    message: format!("Could not read file content: {}", file_path),
                }
            })?;

            // Limit content size for testing
            let preview = if content.len() > 10240 {
                &content[..10240]
            } else {
                &content
            };

            (
                evaluate_condition(&rule.condition, preview),
                format!("Content preview ({} chars)", preview.len()),
            )
        }
        RuleType::CreationDate => {
            let metadata = tokio::fs::metadata(file_path).await?;
            let created = metadata
                .created()
                .map_err(|_| crate::error::AppError::InvalidInput {
                    message: "Could not get file creation time".to_string(),
                })?;

            let duration = created.duration_since(std::time::UNIX_EPOCH).map_err(|_| {
                crate::error::AppError::InvalidInput {
                    message: "Invalid file creation time".to_string(),
                }
            })?;

            let timestamp_str = duration.as_secs().to_string();
            (
                evaluate_condition(&rule.condition, &timestamp_str),
                timestamp_str,
            )
        }
        RuleType::ModificationDate => {
            let metadata = tokio::fs::metadata(file_path).await?;
            let modified =
                metadata
                    .modified()
                    .map_err(|_| crate::error::AppError::InvalidInput {
                        message: "Could not get file modification time".to_string(),
                    })?;

            let duration = modified
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|_| crate::error::AppError::InvalidInput {
                    message: "Invalid file modification time".to_string(),
                })?;

            let timestamp_str = duration.as_secs().to_string();
            (
                evaluate_condition(&rule.condition, &timestamp_str),
                timestamp_str,
            )
        }
    };

    Ok((matches, match_value))
}

/// Test a smart folder's rules against sample files
#[derive(Debug, Serialize, Deserialize)]
pub struct RenamePatternInfo {
    pub placeholders: Vec<PatternPlaceholder>,
    pub examples: Vec<RenameExample>,
    pub presets: Vec<NamingPreset>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PatternPlaceholder {
    pub placeholder: String,
    pub description: String,
    pub example: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RenameExample {
    pub pattern: String,
    pub description: String,
    pub before: String,
    pub after: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NamingPreset {
    pub id: String,
    pub name: String,
    pub description: String,
    pub pattern: String,
    pub category: String,
    pub example_before: String,
    pub example_after: String,
}

/// Get information about available rename pattern placeholders
#[tauri::command]
pub async fn get_rename_pattern_info() -> Result<RenamePatternInfo> {
    Ok(RenamePatternInfo {
        placeholders: vec![
            PatternPlaceholder {
                placeholder: "{name}".to_string(),
                description: "Original filename without extension".to_string(),
                example: "document".to_string(),
            },
            PatternPlaceholder {
                placeholder: "{ext}".to_string(),
                description: "File extension".to_string(),
                example: "pdf".to_string(),
            },
            PatternPlaceholder {
                placeholder: "{filename}".to_string(),
                description: "Full original filename with extension".to_string(),
                example: "document.pdf".to_string(),
            },
            PatternPlaceholder {
                placeholder: "{year}".to_string(),
                description: "Current year (4 digits)".to_string(),
                example: "2024".to_string(),
            },
            PatternPlaceholder {
                placeholder: "{month}".to_string(),
                description: "Current month (2 digits)".to_string(),
                example: "03".to_string(),
            },
            PatternPlaceholder {
                placeholder: "{day}".to_string(),
                description: "Current day (2 digits)".to_string(),
                example: "15".to_string(),
            },
            PatternPlaceholder {
                placeholder: "{date}".to_string(),
                description: "Current date in YYYY-MM-DD format".to_string(),
                example: "2024-03-15".to_string(),
            },
            PatternPlaceholder {
                placeholder: "{time}".to_string(),
                description: "Current time in HH-MM-SS format".to_string(),
                example: "14-30-45".to_string(),
            },
            PatternPlaceholder {
                placeholder: "{timestamp}".to_string(),
                description: "Full timestamp YYYYMMDD-HHMMSS".to_string(),
                example: "20240315-143045".to_string(),
            },
            PatternPlaceholder {
                placeholder: "{counter}".to_string(),
                description: "Incrementing counter with padding (0001, 0002...)".to_string(),
                example: "0001".to_string(),
            },
            PatternPlaceholder {
                placeholder: "{count}".to_string(),
                description: "Incrementing counter without padding".to_string(),
                example: "1".to_string(),
            },
        ],
        examples: vec![
            RenameExample {
                pattern: "{date}_{name}.{ext}".to_string(),
                description: "Add date prefix to files".to_string(),
                before: "report.pdf".to_string(),
                after: "2024-03-15_report.pdf".to_string(),
            },
            RenameExample {
                pattern: "{name}_{counter}.{ext}".to_string(),
                description: "Add sequential numbering".to_string(),
                before: "photo.jpg".to_string(),
                after: "photo_0001.jpg".to_string(),
            },
            RenameExample {
                pattern: "archive_{timestamp}_{name}.{ext}".to_string(),
                description: "Archive files with timestamp".to_string(),
                before: "data.csv".to_string(),
                after: "archive_20240315-143045_data.csv".to_string(),
            },
            RenameExample {
                pattern: "{year}/{month}/{name}.{ext}".to_string(),
                description: "Organize by year and month folders".to_string(),
                before: "invoice.pdf".to_string(),
                after: "2024/03/invoice.pdf".to_string(),
            },
        ],
        presets: get_naming_presets(),
    })
}

/// Get preset naming conventions
fn get_naming_presets() -> Vec<NamingPreset> {
    vec![
        // Date-based formats
        NamingPreset {
            id: "date_prefix".to_string(),
            name: "Date Prefix".to_string(),
            description: "Add date at the beginning of filename".to_string(),
            pattern: "{date}_{name}.{ext}".to_string(),
            category: "Date-based".to_string(),
            example_before: "report.pdf".to_string(),
            example_after: "2024-03-15_report.pdf".to_string(),
        },
        NamingPreset {
            id: "date_suffix".to_string(),
            name: "Date Suffix".to_string(),
            description: "Add date at the end of filename".to_string(),
            pattern: "{name}_{date}.{ext}".to_string(),
            category: "Date-based".to_string(),
            example_before: "report.pdf".to_string(),
            example_after: "report_2024-03-15.pdf".to_string(),
        },
        NamingPreset {
            id: "timestamp_archive".to_string(),
            name: "Timestamp Archive".to_string(),
            description: "Archive format with full timestamp".to_string(),
            pattern: "archive_{timestamp}_{name}.{ext}".to_string(),
            category: "Date-based".to_string(),
            example_before: "data.csv".to_string(),
            example_after: "archive_20240315-143045_data.csv".to_string(),
        },
        // Sequential formats
        NamingPreset {
            id: "sequential_numbered".to_string(),
            name: "Sequential Numbering".to_string(),
            description: "Add sequential numbers to files".to_string(),
            pattern: "{name}_{counter}.{ext}".to_string(),
            category: "Sequential".to_string(),
            example_before: "photo.jpg".to_string(),
            example_after: "photo_0001.jpg".to_string(),
        },
        NamingPreset {
            id: "numbered_prefix".to_string(),
            name: "Number Prefix".to_string(),
            description: "Sequential number at the beginning".to_string(),
            pattern: "{counter}_{name}.{ext}".to_string(),
            category: "Sequential".to_string(),
            example_before: "document.txt".to_string(),
            example_after: "0001_document.txt".to_string(),
        },
        // Organization formats
        NamingPreset {
            id: "year_month_folders".to_string(),
            name: "Year/Month Folders".to_string(),
            description: "Organize into year and month subdirectories".to_string(),
            pattern: "{year}/{month}/{name}.{ext}".to_string(),
            category: "Folder Organization".to_string(),
            example_before: "invoice.pdf".to_string(),
            example_after: "2024/03/invoice.pdf".to_string(),
        },
        NamingPreset {
            id: "date_folders".to_string(),
            name: "Date Folders".to_string(),
            description: "Organize into date-named folders".to_string(),
            pattern: "{date}/{name}.{ext}".to_string(),
            category: "Folder Organization".to_string(),
            example_before: "photo.jpg".to_string(),
            example_after: "2024-03-15/photo.jpg".to_string(),
        },
        // Professional formats
        NamingPreset {
            id: "project_versioned".to_string(),
            name: "Project Version".to_string(),
            description: "Project files with version numbers".to_string(),
            pattern: "{name}_v{counter}.{ext}".to_string(),
            category: "Professional".to_string(),
            example_before: "design.psd".to_string(),
            example_after: "design_v0001.psd".to_string(),
        },
        NamingPreset {
            id: "client_dated".to_string(),
            name: "Client Date Format".to_string(),
            description: "Professional format with date".to_string(),
            pattern: "{date}-{name}-FINAL.{ext}".to_string(),
            category: "Professional".to_string(),
            example_before: "proposal.docx".to_string(),
            example_after: "2024-03-15-proposal-FINAL.docx".to_string(),
        },
        // Photo/Media formats
        NamingPreset {
            id: "photo_datetime".to_string(),
            name: "Photo DateTime".to_string(),
            description: "Photography naming with date and time".to_string(),
            pattern: "IMG_{date}_{time}_{counter}.{ext}".to_string(),
            category: "Photography".to_string(),
            example_before: "photo.jpg".to_string(),
            example_after: "IMG_2024-03-15_14-30-45_0001.jpg".to_string(),
        },
        NamingPreset {
            id: "camera_roll".to_string(),
            name: "Camera Roll".to_string(),
            description: "Camera-style naming".to_string(),
            pattern: "DSC_{counter}.{ext}".to_string(),
            category: "Photography".to_string(),
            example_before: "image.jpg".to_string(),
            example_after: "DSC_0001.jpg".to_string(),
        },
        // Simple formats
        NamingPreset {
            id: "keep_original".to_string(),
            name: "Keep Original".to_string(),
            description: "Keep original filename".to_string(),
            pattern: "{name}.{ext}".to_string(),
            category: "Simple".to_string(),
            example_before: "document.pdf".to_string(),
            example_after: "document.pdf".to_string(),
        },
        NamingPreset {
            id: "lowercase".to_string(),
            name: "Lowercase".to_string(),
            description: "Convert to lowercase (requires additional processing)".to_string(),
            pattern: "{name}.{ext}".to_string(),
            category: "Simple".to_string(),
            example_before: "MyDocument.PDF".to_string(),
            example_after: "mydocument.pdf".to_string(),
        },
    ]
}

#[tauri::command]
pub async fn test_smart_folder_rule(
    rule: OrganizationRule,
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<RuleValidationResult> {
    // First validate the rule structure
    let validation = validate_rule(rule.clone(), state.clone()).await?;

    // If there are errors, return immediately
    if !validation.errors.is_empty() {
        return Ok(validation);
    }

    // Test the rule against some sample files to provide feedback
    let sample_files = vec![
        "document.pdf".to_string(),
        "image.jpg".to_string(),
        "video.mp4".to_string(),
        "presentation.pptx".to_string(),
        "spreadsheet.xlsx".to_string(),
    ];

    let test_result = test_rule_against_files(rule, sample_files, state).await?;

    // Add suggestions based on test results
    let mut suggestions = validation.suggestions;
    if test_result.matched_files == 0 {
        suggestions.push(
            "This rule didn't match any sample files. Consider adjusting the conditions."
                .to_string(),
        );
    } else if test_result.matched_files == test_result.total_files {
        suggestions.push(
            "This rule matches all sample files. Consider making it more specific.".to_string(),
        );
    }

    Ok(RuleValidationResult {
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings,
        suggestions,
    })
}
