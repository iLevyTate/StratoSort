use crate::{
    ai::{
        BehavioralLearning, FolderProfile, FolderProfiler, LearnedPattern, MatchResult,
        MatchingEngine, OrganizationPrediction, SemanticAnalyzer, SemanticProfile,
    },
    error::Result,
    state::AppState,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use tracing::info;

/// Analyze file with deep semantic understanding
#[tauri::command]
pub async fn analyze_file_semantics(
    file_path: String,
    state: State<'_, Arc<AppState>>,
) -> Result<SemanticProfile> {
    // Read file content
    let content = tokio::fs::read_to_string(&file_path)
        .await
        .map_err(crate::error::AppError::Io)?;

    // Get Ollama client
    let ollama_client =
        state
            .ai_service
            .get_ollama_client()
            .ok_or_else(|| crate::error::AppError::AiError {
                message: "Ollama client not available".to_string(),
            })?;

    let analyzer = SemanticAnalyzer::new(ollama_client);
    analyzer.analyze_file_semantics(&file_path, &content).await
}

/// Profile a folder to understand its organization
#[tauri::command]
pub async fn profile_folder(
    folder_path: String,
    max_samples: Option<usize>,
    state: State<'_, Arc<AppState>>,
) -> Result<FolderProfile> {
    let samples = max_samples.unwrap_or(15);

    let ollama_client =
        state
            .ai_service
            .get_ollama_client()
            .ok_or_else(|| crate::error::AppError::AiError {
                message: "Ollama client not available".to_string(),
            })?;

    let profiler = FolderProfiler::new(ollama_client);
    profiler.profile_folder(&folder_path, samples).await
}

/// Match file to folders using semantic analysis
#[tauri::command]
pub async fn match_file_to_folders_semantic(
    file_path: String,
    folder_paths: Vec<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<MatchResult>> {
    // Analyze file
    let content = tokio::fs::read_to_string(&file_path)
        .await
        .map_err(crate::error::AppError::Io)?;

    let ollama_client =
        state
            .ai_service
            .get_ollama_client()
            .ok_or_else(|| crate::error::AppError::AiError {
                message: "Ollama client not available".to_string(),
            })?;

    let analyzer = SemanticAnalyzer::new(ollama_client.clone());
    let file_profile = analyzer
        .analyze_file_semantics(&file_path, &content)
        .await?;

    // Profile folders
    let profiler = FolderProfiler::new(ollama_client);
    let mut folder_profiles = Vec::new();
    for folder_path in folder_paths {
        if let Ok(profile) = profiler.profile_folder(&folder_path, 15).await {
            folder_profiles.push(profile);
        }
    }

    // Match
    let engine = MatchingEngine::new();
    Ok(engine.match_file_to_folders(&file_profile, &folder_profiles))
}

/// Detect patterns from user actions
#[tauri::command]
pub async fn detect_learned_patterns(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<LearnedPattern>> {
    let ollama_client =
        state
            .ai_service
            .get_ollama_client()
            .ok_or_else(|| crate::error::AppError::AiError {
                message: "Ollama client not available".to_string(),
            })?;

    // Get user actions from file watcher
    let watcher_arc = {
        let watcher_guard = state.file_watcher.read();
        watcher_guard.as_ref().map(Arc::clone)
    };

    if let Some(watcher) = watcher_arc {
        let actions = watcher.get_recent_user_actions(1000).await;
        let learning = BehavioralLearning::new(ollama_client);
        learning.detect_patterns(&actions).await
    } else {
        Ok(vec![])
    }
}

/// Predict where a file should be organized
#[tauri::command]
pub async fn predict_file_organization(
    file_path: String,
    state: State<'_, Arc<AppState>>,
) -> Result<Option<OrganizationPrediction>> {
    let ollama_client =
        state
            .ai_service
            .get_ollama_client()
            .ok_or_else(|| crate::error::AppError::AiError {
                message: "Ollama client not available".to_string(),
            })?;

    // Get learned patterns
    let watcher_arc = {
        let watcher_guard = state.file_watcher.read();
        watcher_guard.as_ref().map(Arc::clone)
    };

    if let Some(watcher) = watcher_arc {
        let actions = watcher.get_recent_user_actions(1000).await;
        let learning = BehavioralLearning::new(ollama_client);
        let patterns = learning.detect_patterns(&actions).await?;

        // Read file content
        let content = tokio::fs::read_to_string(&file_path).await.ok();

        learning
            .predict_organization(&file_path, content.as_deref(), &patterns)
            .await
    } else {
        Ok(None)
    }
}

/// Get Smart Folder suggestions from learned patterns
#[tauri::command]
pub async fn get_smart_folder_suggestions(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<crate::commands::organization::SmartFolder>> {
    let ollama_client =
        state
            .ai_service
            .get_ollama_client()
            .ok_or_else(|| crate::error::AppError::AiError {
                message: "Ollama client not available".to_string(),
            })?;

    let watcher_arc = {
        let watcher_guard = state.file_watcher.read();
        watcher_guard.as_ref().map(Arc::clone)
    };

    if let Some(watcher) = watcher_arc {
        let actions = watcher.get_recent_user_actions(1000).await;
        let learning = BehavioralLearning::new(ollama_client);
        let patterns = learning.detect_patterns(&actions).await?;

        let suggestions: Vec<_> = patterns
            .iter()
            .filter_map(|p| learning.generate_smart_folder_suggestion(p))
            .collect();

        info!(
            "Generated {} Smart Folder suggestions from learned patterns",
            suggestions.len()
        );
        Ok(suggestions)
    } else {
        Ok(vec![])
    }
}

/// Enhanced batch organization with semantic analysis
#[tauri::command]
pub async fn semantic_batch_organize(
    directory_path: String,
    use_folder_profiling: bool,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<EnhancedOrganizationPreview>> {
    let operation_id = state.start_operation(
        crate::state::OperationType::Organization,
        format!("Semantic batch organization: {}", directory_path),
    );

    state.update_progress(operation_id, 0.1, "Scanning directory".to_string());

    // Scan files
    let mut file_paths = Vec::new();
    let mut entries = tokio::fs::read_dir(&directory_path).await?;
    while let Some(entry) = entries.next_entry().await? {
        if entry.file_type().await?.is_file() {
            file_paths.push(entry.path().display().to_string());
        }
    }

    state.update_progress(
        operation_id,
        0.2,
        format!("Found {} files", file_paths.len()),
    );

    let ollama_client =
        state
            .ai_service
            .get_ollama_client()
            .ok_or_else(|| crate::error::AppError::AiError {
                message: "Ollama client not available".to_string(),
            })?;

    // Deep semantic analysis of files
    state.update_progress(operation_id, 0.3, "Analyzing file contents".to_string());
    let analyzer = SemanticAnalyzer::new(ollama_client.clone());
    let mut semantic_profiles = Vec::new();

    for (idx, path) in file_paths.iter().enumerate() {
        if let Ok(content) = tokio::fs::read_to_string(path).await {
            if let Ok(profile) = analyzer.analyze_file_semantics(path, &content).await {
                semantic_profiles.push((path.clone(), profile));
            }
        }
        if idx % 10 == 0 {
            let progress = 0.3 + (0.3 * idx as f32 / file_paths.len() as f32);
            state.update_progress(
                operation_id,
                progress,
                format!("Analyzed {} files", idx + 1),
            );
        }
    }

    // Profile folders if requested
    state.update_progress(operation_id, 0.6, "Analyzing folder structure".to_string());
    let folder_profiles = if use_folder_profiling {
        let profiler = FolderProfiler::new(ollama_client.clone());
        let smart_folders = state.database.list_smart_folders().await?;
        let mut profiles = Vec::new();
        for folder in smart_folders {
            if let Ok(profile) = profiler.profile_folder(&folder.target_path, 15).await {
                profiles.push(profile);
            }
        }
        profiles
    } else {
        vec![]
    };

    // Match files to folders
    state.update_progress(operation_id, 0.8, "Matching files to folders".to_string());
    let engine = MatchingEngine::new();
    let mut previews = Vec::new();

    for (file_path, profile) in semantic_profiles {
        if !folder_profiles.is_empty() {
            let matches = engine.match_file_to_folders(&profile, &folder_profiles);
            if let Some(best_match) = matches.first() {
                previews.push(EnhancedOrganizationPreview {
                    source_path: file_path,
                    target_folder: best_match.folder_path.clone(),
                    suggested_name: best_match.suggested_name.clone(),
                    confidence: best_match.confidence,
                    reasoning: best_match.reasoning.clone(),
                    semantic_profile: profile,
                });
            }
        }
    }

    state.update_progress(
        operation_id,
        1.0,
        "Organization preview complete".to_string(),
    );
    state.complete_operation(operation_id);

    Ok(previews)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EnhancedOrganizationPreview {
    pub source_path: String,
    pub target_folder: String,
    pub suggested_name: String,
    pub confidence: f32,
    pub reasoning: String,
    pub semantic_profile: SemanticProfile,
}
