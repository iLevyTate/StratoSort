use crate::{error::Result, state::AppState};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tauri::State;
use tracing::error;

#[derive(Debug, Serialize, Deserialize)]
pub struct OllamaStatus {
    pub is_installed: bool,
    pub is_running: bool,
    pub version: Option<String>,
    pub models: Vec<ModelInfo>,
    pub default_model: Option<String>,
    pub host: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ModelInfo {
    pub name: String,
    pub size: u64,
    pub modified_at: String,
}

#[tauri::command]
pub async fn check_ollama_status(
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<OllamaStatus> {
    use tauri::Emitter;

    // Check if Ollama is available
    let is_running = state.ai_service.is_available().await;

    // Get installed models if running
    let models = if is_running {
        if let Some(client) = state.ai_service.get_ollama_client() {
            match client.list_models_detailed().await {
                Ok(models) => models
                    .into_iter()
                    .map(|m| ModelInfo {
                        name: m.name,
                        size: m.size,
                        modified_at: m.modified_at,
                    })
                    .collect(),
                Err(e) => {
                    error!("Failed to list Ollama models: {}", e);
                    Vec::new()
                }
            }
        } else {
            vec![]
        }
    } else {
        vec![]
    };

    let status = OllamaStatus {
        is_installed: is_running, // Simplified check
        is_running,
        version: if is_running {
            Some("latest".to_string())
        } else {
            None
        },
        models,
        default_model: Some(state.config.read().ollama_model.clone()),
        host: state.config.read().ollama_host.clone(),
    };

    // Emit status event to frontend
    let _ = state.handle.emit(
        "ollama-status-checked",
        serde_json::json!({
            "status": &status,
            "timestamp": chrono::Utc::now().timestamp()
        }),
    );

    Ok(status)
}

#[tauri::command]
pub async fn pull_model(model: String, state: State<'_, std::sync::Arc<AppState>>) -> Result<()> {
    // Input validation
    if model.is_empty() {
        return Err(crate::error::AppError::InvalidPath {
            message: "Model name cannot be empty".to_string(),
        });
    }

    if model.len() > 100 {
        return Err(crate::error::AppError::SecurityError {
            message: "Model name too long (max 100 characters)".to_string(),
        });
    }

    // Validate model name format (alphanumeric, dashes, underscores, colons for tags)
    if !model
        .chars()
        .all(|c| c.is_alphanumeric() || c == '-' || c == '_' || c == ':' || c == '.')
    {
        return Err(crate::error::AppError::SecurityError {
            message: "Invalid model name format. Only alphanumeric characters, dashes, underscores, colons, and dots are allowed".to_string(),
        });
    }

    if let Some(client) = state.ai_service.get_ollama_client() {
        client.pull_model(&model).await?;
    } else {
        return Err(crate::error::AppError::AiError {
            message: "Ollama is not available".to_string(),
        });
    }

    Ok(())
}

#[tauri::command]
pub async fn list_models(state: State<'_, std::sync::Arc<AppState>>) -> Result<Vec<ModelInfo>> {
    if let Some(client) = state.ai_service.get_ollama_client() {
        let models = client
            .list_models_detailed()
            .await?
            .into_iter()
            .map(|m| ModelInfo {
                name: m.name,
                size: m.size,
                modified_at: m.modified_at,
            })
            .collect();
        Ok(models)
    } else {
        Ok(vec![])
    }
}

#[tauri::command]
pub async fn analyze_with_ai(
    content: String,
    mime_type: String,
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<crate::ai::FileAnalysis> {
    // Input validation
    if content.len() > 10 * 1024 * 1024 {
        // 10MB limit
        return Err(crate::error::AppError::SecurityError {
            message: "Content too large for analysis (max 10MB)".to_string(),
        });
    }

    if mime_type.is_empty() || mime_type.len() > 200 {
        return Err(crate::error::AppError::InvalidPath {
            message: "Invalid MIME type".to_string(),
        });
    }

    // Validate MIME type format
    if !mime_type
        .chars()
        .all(|c| c.is_alphanumeric() || c == '/' || c == '-' || c == '+' || c == '.')
    {
        return Err(crate::error::AppError::SecurityError {
            message: "Invalid MIME type format".to_string(),
        });
    }

    // Try AI analysis with graceful degradation
    match state.ai_service.analyze_file(&content, &mime_type).await {
        Ok(analysis) => Ok(analysis),
        Err(crate::error::AppError::AiError { .. }) => {
            // Fallback to basic analysis when AI service is unavailable
            tracing::warn!("AI service unavailable, using basic file analysis");
            Ok(crate::ai::FileAnalysis {
                path: "".to_string(), // Will be set by caller
                category: infer_basic_category(&mime_type),
                tags: infer_basic_tags(&mime_type, &content),
                summary: format!("Basic analysis: {} file", mime_type),
                confidence: 0.6, // Lower confidence for basic analysis
                extracted_text: Some(if mime_type.starts_with("text/") {
                    content.chars().take(1000).collect()
                } else {
                    "Binary file".to_string()
                }),
                detected_language: if mime_type.starts_with("text/") {
                    Some("unknown".to_string())
                } else {
                    None
                },
                metadata: serde_json::json!({
                    "fallback_analysis": true,
                    "reason": "AI service unavailable"
                }),
            })
        }
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub async fn generate_embeddings(
    text: String,
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<Vec<f32>> {
    // Input validation
    if text.is_empty() {
        return Err(crate::error::AppError::InvalidPath {
            message: "Text cannot be empty for embedding generation".to_string(),
        });
    }

    if text.len() > 100 * 1024 {
        // 100KB limit for embeddings
        return Err(crate::error::AppError::SecurityError {
            message: "Text too long for embedding generation (max 100KB)".to_string(),
        });
    }

    // Try AI embedding generation with graceful degradation
    match state.ai_service.generate_embeddings(&text).await {
        Ok(embeddings) => Ok(embeddings),
        Err(crate::error::AppError::AiError { .. }) => {
            // Fallback to basic text hashing when AI service is unavailable
            tracing::warn!("AI service unavailable, using basic text vectorization");
            Ok(generate_basic_text_vector(&text))
        }
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub async fn semantic_search(
    query: String,
    limit: usize,
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<Vec<crate::ai::FileAnalysis>> {
    // Input validation
    if query.is_empty() {
        return Err(crate::error::AppError::InvalidPath {
            message: "Search query cannot be empty".to_string(),
        });
    }

    if query.len() > 1000 {
        return Err(crate::error::AppError::SecurityError {
            message: "Search query too long (max 1000 characters)".to_string(),
        });
    }

    if limit == 0 || limit > 500 {
        return Err(crate::error::AppError::SecurityError {
            message: "Invalid limit (must be between 1 and 500)".to_string(),
        });
    }
    // Enhanced semantic search with production-quality Ollama embeddings
    let mut results = Vec::new();

    // Strategy 1: High-quality Ollama embedding-based similarity search
    match state.ai_service.generate_embeddings(&query).await {
        Ok(query_embedding) => {
            tracing::info!(
                "Generated {} dimension embedding for query: '{}'",
                query_embedding.len(),
                query
            );

            let embedding_results = state
                .database
                .semantic_search(&query_embedding, limit * 2)
                .await?;

            let mut embedding_matches = 0;
            for (path, score) in embedding_results {
                // Only include high-confidence matches (threshold raised for production)
                if score > 0.3 {
                    // Raised from default to ensure quality
                    if let Ok(Some(analysis)) = state.database.get_analysis(&path).await {
                        results.push((analysis, score, "ollama-embedding".to_string()));
                        embedding_matches += 1;
                    }
                }
            }

            tracing::info!(
                "Found {} high-confidence embedding matches for query: '{}'",
                embedding_matches,
                query
            );
        }
        Err(e) => {
            tracing::warn!(
                "Embedding generation failed for query '{}': {}. Falling back to text search.",
                query,
                e
            );
        }
    }

    // Strategy 2: Category-based matching
    let category_results = state.database.search_by_category(&query).await?;
    for path in category_results {
        if let Ok(Some(analysis)) = state.database.get_analysis(&path).await {
            // Check if already found via embedding
            if !results.iter().any(|(a, _, _)| a.path == analysis.path) {
                results.push((analysis, 0.8, "category".to_string())); // High confidence for category match
            }
        }
    }

    // Strategy 3: Tag-based matching
    let query_words: Vec<String> = query.split_whitespace().map(|s| s.to_lowercase()).collect();
    let tag_results = state.database.search_by_tags(&query_words).await?;
    for path in tag_results {
        if let Ok(Some(analysis)) = state.database.get_analysis(&path).await {
            // Check if already found
            if !results.iter().any(|(a, _, _)| a.path == analysis.path) {
                results.push((analysis, 0.7, "tags".to_string())); // Good confidence for tag match
            }
        }
    }

    // Strategy 4: Content-based text search
    let content_results = enhanced_content_search(&query, &state.database).await?;
    for (path, score) in content_results {
        if let Ok(Some(analysis)) = state.database.get_analysis(&path).await {
            // Check if already found
            if !results.iter().any(|(a, _, _)| a.path == analysis.path) {
                results.push((analysis, score, "content".to_string()));
            }
        }
    }

    // Hybrid Search: Combine and boost scores from multiple strategies
    let mut path_scores: std::collections::HashMap<
        String,
        (crate::ai::FileAnalysis, f32, Vec<String>),
    > = std::collections::HashMap::new();

    for (analysis, score, strategy) in results {
        let path = analysis.path.clone();

        if let Some((existing_analysis, existing_score, mut strategies)) = path_scores.remove(&path)
        {
            // File found by multiple strategies - boost the score
            let combined_score = existing_score + (score * 0.5); // Boost for multi-strategy match
            strategies.push(strategy);
            path_scores.insert(path, (existing_analysis, combined_score, strategies));
        } else {
            path_scores.insert(path, (analysis, score, vec![strategy]));
        }
    }

    // Convert back to vector and sort by combined scores
    let mut hybrid_results: Vec<(crate::ai::FileAnalysis, f32, Vec<String>)> =
        path_scores.into_values().collect();

    // Sort by hybrid score (descending) and take top results
    hybrid_results.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    hybrid_results.truncate(limit);

    // Log hybrid search performance
    let total_strategies: usize = hybrid_results
        .iter()
        .map(|(_, _, strategies)| strategies.len())
        .sum();
    let multi_strategy_matches = hybrid_results
        .iter()
        .filter(|(_, _, strategies)| strategies.len() > 1)
        .count();

    tracing::info!(
        "Hybrid search for '{}': {} results, {} multi-strategy matches, {} total strategy hits",
        query,
        hybrid_results.len(),
        multi_strategy_matches,
        total_strategies
    );

    // Extract just the analyses with metadata
    let enhanced_results: Vec<crate::ai::FileAnalysis> = hybrid_results
        .into_iter()
        .map(|(mut analysis, score, strategies)| {
            // Add hybrid search metadata
            analysis.metadata = serde_json::json!({
                "hybrid_score": score,
                "matching_strategies": strategies,
                "multi_strategy_match": strategies.len() > 1
            });
            analysis
        })
        .collect();

    Ok(enhanced_results)
}

#[tauri::command]
pub async fn quick_search(
    query: String,
    limit: Option<usize>,
    file_types: Option<Vec<String>>,
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<Vec<QuickSearchResult>> {
    // Input validation
    if query.trim().is_empty() {
        return Ok(Vec::new()); // Return empty results for empty query
    }

    if query.len() > 500 {
        return Err(crate::error::AppError::SecurityError {
            message: "Search query too long (max 500 characters)".to_string(),
        });
    }

    let search_limit = limit.unwrap_or(50).min(200); // Default 50, max 200 for quick search

    // Validate file types filter
    if let Some(ref types) = file_types {
        if types.len() > 20 {
            return Err(crate::error::AppError::SecurityError {
                message: "Too many file type filters (max 20)".to_string(),
            });
        }
        for file_type in types {
            if file_type.len() > 10
                || !file_type
                    .chars()
                    .all(|c| c.is_alphanumeric() || c == '.' || c == '-')
            {
                return Err(crate::error::AppError::SecurityError {
                    message: "Invalid file type filter format".to_string(),
                });
            }
        }
    }

    let query_lower = query.to_lowercase();
    let query_words: Vec<String> = query_lower
        .split_whitespace()
        .map(|s| s.to_string())
        .collect();

    let mut results = Vec::new();

    // Strategy 1: Filename-based search (fastest)
    let filename_results = state
        .database
        .search_by_filename(&query_lower, search_limit)
        .await?;
    for path in filename_results {
        if let Ok(Some(analysis)) = state.database.get_analysis(&path).await {
            // Apply file type filter if specified
            if let Some(ref types) = file_types {
                let file_ext = std::path::Path::new(&path)
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("")
                    .to_lowercase();

                if !types
                    .iter()
                    .any(|t| t.trim_start_matches('.').to_lowercase() == file_ext)
                {
                    continue;
                }
            }

            let path_clone = analysis.path.clone();
            results.push(QuickSearchResult {
                path: analysis.path.clone(),
                name: std::path::Path::new(&analysis.path)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string(),
                category: analysis.category,
                summary: analysis.summary,
                match_type: "filename".to_string(),
                relevance_score: calculate_filename_relevance(&path_clone, &query_lower),
                size: get_file_size(&path_clone).await.unwrap_or(0),
                modified_at: get_file_modified(&path_clone).await.unwrap_or(0),
            });
        }
    }

    // Strategy 2: Category-based search (medium speed)
    if results.len() < search_limit {
        let category_results = state.database.search_by_category(&query).await?;
        for path in category_results
            .into_iter()
            .take(search_limit - results.len())
        {
            if let Ok(Some(analysis)) = state.database.get_analysis(&path).await {
                // Skip if already found via filename search
                if results.iter().any(|r| r.path == analysis.path) {
                    continue;
                }

                // Apply file type filter
                if let Some(ref types) = file_types {
                    let file_ext = std::path::Path::new(&path)
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or("")
                        .to_lowercase();

                    if !types
                        .iter()
                        .any(|t| t.trim_start_matches('.').to_lowercase() == file_ext)
                    {
                        continue;
                    }
                }

                let path_clone = analysis.path.clone();
                results.push(QuickSearchResult {
                    path: analysis.path.clone(),
                    name: std::path::Path::new(&analysis.path)
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("")
                        .to_string(),
                    category: analysis.category,
                    summary: analysis.summary,
                    match_type: "category".to_string(),
                    relevance_score: 0.8, // Fixed high relevance for category matches
                    size: get_file_size(&path_clone).await.unwrap_or(0),
                    modified_at: get_file_modified(&path_clone).await.unwrap_or(0),
                });
            }
        }
    }

    // Strategy 3: Tag-based search (medium speed)
    if results.len() < search_limit {
        let tag_results = state.database.search_by_tags(&query_words).await?;
        for path in tag_results.into_iter().take(search_limit - results.len()) {
            if let Ok(Some(analysis)) = state.database.get_analysis(&path).await {
                // Skip if already found
                if results.iter().any(|r| r.path == analysis.path) {
                    continue;
                }

                // Apply file type filter
                if let Some(ref types) = file_types {
                    let file_ext = std::path::Path::new(&path)
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or("")
                        .to_lowercase();

                    if !types
                        .iter()
                        .any(|t| t.trim_start_matches('.').to_lowercase() == file_ext)
                    {
                        continue;
                    }
                }

                let path_clone = analysis.path.clone();
                results.push(QuickSearchResult {
                    path: analysis.path.clone(),
                    name: std::path::Path::new(&analysis.path)
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("")
                        .to_string(),
                    category: analysis.category,
                    summary: analysis.summary,
                    match_type: "tags".to_string(),
                    relevance_score: 0.7, // Fixed good relevance for tag matches
                    size: get_file_size(&path_clone).await.unwrap_or(0),
                    modified_at: get_file_modified(&path_clone).await.unwrap_or(0),
                });
            }
        }
    }

    // Sort by relevance score (descending) and limit results
    results.sort_by(|a, b| {
        b.relevance_score
            .partial_cmp(&a.relevance_score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    results.truncate(search_limit);

    // Record search in history (fire-and-forget)
    let _ = record_search_history(&query, "quick_search", results.len(), &state).await;

    Ok(results)
}

#[tauri::command]
pub async fn get_search_history(
    limit: Option<usize>,
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<Vec<SearchHistoryEntry>> {
    let search_limit = limit.unwrap_or(20).min(100);
    state.database.get_search_history(search_limit).await
}

#[tauri::command]
pub async fn clear_search_history(
    older_than_days: Option<i64>,
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<usize> {
    let cutoff_days = older_than_days.unwrap_or(30);
    let cutoff_timestamp = chrono::Utc::now().timestamp() - (cutoff_days * 24 * 60 * 60);
    state.database.clear_search_history(cutoff_timestamp).await
}

#[tauri::command]
pub async fn advanced_search(
    query: String,
    filters: SearchFilters,
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<Vec<crate::ai::FileAnalysis>> {
    // Input validation
    if query.is_empty() {
        return Err(crate::error::AppError::InvalidPath {
            message: "Search query cannot be empty".to_string(),
        });
    }

    if query.len() > 1000 {
        return Err(crate::error::AppError::SecurityError {
            message: "Search query too long (max 1000 characters)".to_string(),
        });
    }

    // Validate filters
    validate_search_filters(&filters)?;

    let limit = filters.limit.unwrap_or(100).min(500);

    // Build advanced search query
    let mut results = Vec::new();

    // Start with semantic search if enabled and no specific filters that would make it less relevant
    if filters.use_semantic.unwrap_or(true) && filters.file_types.is_none() {
        if let Ok(embedding) = state.ai_service.generate_embeddings(&query).await {
            if let Ok(embedding_results) =
                state.database.semantic_search(&embedding, limit * 2).await
            {
                for (path, score) in embedding_results {
                    if let Ok(Some(analysis)) = state.database.get_analysis(&path).await {
                        if apply_filters(&analysis, &filters).await? {
                            results.push((analysis, score));
                        }
                    }
                }
            }
        }
    }

    // Category search with filters
    if let Some(ref category) = filters.category {
        let category_results = state.database.search_by_category(category).await?;
        for path in category_results {
            if let Ok(Some(analysis)) = state.database.get_analysis(&path).await {
                if !results.iter().any(|(a, _)| a.path == analysis.path)
                    && apply_filters(&analysis, &filters).await?
                {
                    results.push((analysis, 0.8));
                }
            }
        }
    }

    // Tag search with filters
    let query_words: Vec<String> = query.split_whitespace().map(|s| s.to_lowercase()).collect();
    let tag_results = state.database.search_by_tags(&query_words).await?;
    for path in tag_results {
        if let Ok(Some(analysis)) = state.database.get_analysis(&path).await {
            if !results.iter().any(|(a, _)| a.path == analysis.path)
                && apply_filters(&analysis, &filters).await?
            {
                results.push((analysis, 0.7));
            }
        }
    }

    // Content search with filters
    let content_results = enhanced_content_search(&query, &state.database).await?;
    for (path, score) in content_results {
        if let Ok(Some(analysis)) = state.database.get_analysis(&path).await {
            if !results.iter().any(|(a, _)| a.path == analysis.path)
                && apply_filters(&analysis, &filters).await?
            {
                results.push((analysis, score));
            }
        }
    }

    // Sort and limit results
    results.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    results.truncate(limit);

    let final_results: Vec<crate::ai::FileAnalysis> =
        results.into_iter().map(|(analysis, _)| analysis).collect();

    // Record advanced search in history
    let _ = record_search_history(&query, "advanced_search", final_results.len(), &state).await;

    Ok(final_results)
}

#[tauri::command]
pub async fn reconnect_ollama(
    host: String,
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<crate::ai::AiServiceStatus> {
    // Input validation
    if host.is_empty() {
        return Err(crate::error::AppError::InvalidInput {
            message: "Ollama host cannot be empty".to_string(),
        });
    }

    if host.len() > 200 {
        return Err(crate::error::AppError::SecurityError {
            message: "Host URL too long (max 200 characters)".to_string(),
        });
    }

    // Basic URL validation
    if !host.starts_with("http://") && !host.starts_with("https://") {
        return Err(crate::error::AppError::InvalidInput {
            message: "Host must start with http:// or https://".to_string(),
        });
    }

    tracing::info!("Manual Ollama reconnection requested to: {}", host);

    match state.ai_service.reconnect_ollama(&host).await {
        Ok(status) => {
            tracing::info!("Ollama reconnection successful");
            Ok(status)
        }
        Err(e) => {
            tracing::warn!("Ollama reconnection failed: {}", e);
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn get_ai_service_status(
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<crate::ai::AiServiceStatus> {
    Ok(state.ai_service.get_status().await)
}

/// Infer basic file category from MIME type when AI is unavailable
fn infer_basic_category(mime_type: &str) -> String {
    match mime_type {
        t if t.starts_with("text/") => "Text Document".to_string(),
        t if t.starts_with("image/") => "Image".to_string(),
        t if t.starts_with("video/") => "Video".to_string(),
        t if t.starts_with("audio/") => "Audio".to_string(),
        t if t.starts_with("application/pdf") => "PDF Document".to_string(),
        t if t.contains("spreadsheet") || t.contains("excel") => "Spreadsheet".to_string(),
        t if t.contains("presentation") || t.contains("powerpoint") => "Presentation".to_string(),
        t if t.contains("document") || t.contains("word") => "Document".to_string(),
        t if t.contains("archive") || t.contains("zip") || t.contains("tar") => {
            "Archive".to_string()
        }
        t if t.contains("executable") || t.contains("application") => "Application".to_string(),
        _ => "Unknown".to_string(),
    }
}

/// Infer basic tags from MIME type and content when AI is unavailable
fn infer_basic_tags(mime_type: &str, content: &str) -> Vec<String> {
    let mut tags = vec!["basic-analysis".to_string()];

    // MIME type based tags
    if mime_type.starts_with("text/") {
        tags.push("text".to_string());
        if mime_type.contains("plain") {
            tags.push("plain-text".to_string());
        }
    } else if mime_type.starts_with("image/") {
        tags.push("image".to_string());
        if mime_type.contains("jpeg") || mime_type.contains("jpg") {
            tags.push("photo".to_string());
        }
    } else if mime_type.starts_with("application/") {
        tags.push("application".to_string());
    }

    // Content-based inference for text files
    if mime_type.starts_with("text/") && content.len() > 10 {
        let lower_content = content.to_lowercase();
        if lower_content.contains("import ") || lower_content.contains("function ") {
            tags.push("code".to_string());
        }
        if lower_content.contains("# ") || lower_content.contains("## ") {
            tags.push("markdown".to_string());
        }
        if lower_content.contains("todo") || lower_content.contains("task") {
            tags.push("notes".to_string());
        }
    }

    tags
}

/// Generate a basic text vector when AI embeddings are unavailable
fn generate_basic_text_vector(text: &str) -> Vec<f32> {
    use std::collections::HashMap;

    // Create a simple TF-IDF-like vector from text
    let lowercase_text = text.to_lowercase();
    let words: Vec<String> = lowercase_text
        .split_whitespace()
        .filter(|w| w.len() > 2) // Filter out very short words
        .map(|s| s.to_string())
        .collect();

    let mut word_counts = HashMap::new();
    for word in &words {
        *word_counts.entry(word.as_str()).or_insert(0) += 1;
    }

    // Create a fixed-size vector (768 dimensions to match nomic-embed-text)
    let mut vector = vec![0.0f32; 768];

    // Use a simple hash-based approach to map words to vector positions
    for (word, count) in word_counts {
        let hash = simple_hash(word);
        let index = (hash % 768) as usize;

        // TF (term frequency) component
        let tf = count as f32 / words.len() as f32;

        // Simple IDF approximation (longer words get higher weight)
        let idf = (word.len() as f32 / 10.0).min(2.0);

        vector[index] += tf * idf;
    }

    // Normalize the vector
    let magnitude: f32 = vector.iter().map(|x| x * x).sum::<f32>().sqrt();
    if magnitude > 0.0 {
        for value in &mut vector {
            *value /= magnitude;
        }
    }

    vector
}

/// Simple hash function for word-to-index mapping
fn simple_hash(word: &str) -> u32 {
    let mut hash = 5381u32;
    for byte in word.bytes() {
        hash = hash.wrapping_mul(33).wrapping_add(byte as u32);
    }
    hash
}

/// Enhanced content-based search with fuzzy matching
async fn enhanced_content_search(
    query: &str,
    database: &crate::storage::Database,
) -> Result<Vec<(String, f32)>> {
    let query_lower = query.to_lowercase();
    let query_words: Vec<&str> = query_lower.split_whitespace().collect();

    // Search in extracted text and summaries
    let rows = sqlx::query(
        r#"
        SELECT path, summary, extracted_text, category
        FROM file_analysis
        WHERE summary IS NOT NULL OR extracted_text IS NOT NULL
        "#,
    )
    .fetch_all(database.pool())
    .await?;

    let mut results = Vec::new();

    for row in rows {
        let path: String = row.get("path");
        let summary: Option<String> = row.get("summary");
        let extracted_text: Option<String> = row.get("extracted_text");
        let category: Option<String> = row.get("category");

        let mut score = 0.0;
        let mut matches = 0;

        // Check summary match
        if let Some(summary) = &summary {
            let summary_lower = summary.to_lowercase();
            for word in &query_words {
                if summary_lower.contains(word) {
                    score += 0.4; // Summary matches are important
                    matches += 1;
                }
            }
        }

        // Check extracted text match
        if let Some(extracted_text) = &extracted_text {
            let text_lower = extracted_text.to_lowercase();
            for word in &query_words {
                if text_lower.contains(word) {
                    score += 0.3; // Content matches are good
                    matches += 1;
                }
            }
        }

        // Check category match
        if let Some(category) = &category {
            let category_lower = category.to_lowercase();
            if category_lower.contains(&query_lower) || query_lower.contains(&category_lower) {
                score += 0.5; // Category matches are very relevant
                matches += 1;
            }
        }

        // Only include results with matches
        if matches > 0 {
            // Normalize score by number of words for better ranking
            let normalized_score = (score / query_words.len() as f32).min(1.0);
            results.push((path, normalized_score));
        }
    }

    // Sort by score (descending)
    results.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    Ok(results)
}

/// Calculate filename relevance based on query match
fn calculate_filename_relevance(path: &str, query: &str) -> f32 {
    let filename = std::path::Path::new(path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    if filename == query {
        return 1.0; // Perfect match
    }

    if filename.contains(query) {
        // Partial match - score based on match length relative to filename length
        let match_ratio = query.len() as f32 / filename.len() as f32;
        return 0.7 + (match_ratio * 0.3); // 0.7 to 1.0 range
    }

    // Check word boundaries
    for word in query.split_whitespace() {
        if filename.contains(word) {
            return 0.6; // Word match
        }
    }

    0.3 // Fallback score
}

/// Get file size helper
async fn get_file_size(path: &str) -> Result<u64> {
    let metadata = tokio::fs::metadata(path).await?;
    Ok(metadata.len())
}

/// Get file modification time helper
async fn get_file_modified(path: &str) -> Result<i64> {
    let metadata = tokio::fs::metadata(path).await?;
    let modified = metadata
        .modified()?
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| crate::error::AppError::InvalidPath {
            message: "Invalid modification time".to_string(),
        })?
        .as_secs() as i64;
    Ok(modified)
}

/// Record search in history
async fn record_search_history(
    query: &str,
    search_type: &str,
    result_count: usize,
    state: &State<'_, std::sync::Arc<crate::state::AppState>>,
) -> Result<()> {
    let entry = SearchHistoryEntry {
        id: uuid::Uuid::new_v4().to_string(),
        query: query.to_string(),
        search_type: search_type.to_string(),
        result_count,
        timestamp: chrono::Utc::now().timestamp(),
    };

    state.database.save_search_history(&entry).await
}

/// Validate search filters
fn validate_search_filters(filters: &SearchFilters) -> Result<()> {
    if let Some(ref file_types) = filters.file_types {
        if file_types.len() > 50 {
            return Err(crate::error::AppError::SecurityError {
                message: "Too many file type filters (max 50)".to_string(),
            });
        }
        for file_type in file_types {
            if file_type.len() > 20 || file_type.is_empty() {
                return Err(crate::error::AppError::SecurityError {
                    message: "Invalid file type filter".to_string(),
                });
            }
        }
    }

    if let Some(min_size) = filters.min_size {
        if let Some(max_size) = filters.max_size {
            if min_size > max_size {
                return Err(crate::error::AppError::InvalidInput {
                    message: "Minimum size cannot be greater than maximum size".to_string(),
                });
            }
        }
    }

    if let Some(date_from) = filters.date_from {
        if let Some(date_to) = filters.date_to {
            if date_from > date_to {
                return Err(crate::error::AppError::InvalidInput {
                    message: "Start date cannot be after end date".to_string(),
                });
            }
        }
    }

    if let Some(min_confidence) = filters.min_confidence {
        if !(0.0..=1.0).contains(&min_confidence) {
            return Err(crate::error::AppError::InvalidInput {
                message: "Confidence must be between 0.0 and 1.0".to_string(),
            });
        }
    }

    if let Some(limit) = filters.limit {
        if limit == 0 || limit > 1000 {
            return Err(crate::error::AppError::SecurityError {
                message: "Limit must be between 1 and 1000".to_string(),
            });
        }
    }

    Ok(())
}

/// Apply filters to analysis result
async fn apply_filters(
    analysis: &crate::ai::FileAnalysis,
    filters: &SearchFilters,
) -> Result<bool> {
    // File type filter
    if let Some(ref file_types) = filters.file_types {
        let file_ext = std::path::Path::new(&analysis.path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        if !file_types
            .iter()
            .any(|t| t.trim_start_matches('.').to_lowercase() == file_ext)
        {
            return Ok(false);
        }
    }

    // Category filter
    if let Some(ref category) = filters.category {
        if !analysis
            .category
            .to_lowercase()
            .contains(&category.to_lowercase())
        {
            return Ok(false);
        }
    }

    // Confidence filter
    if let Some(min_confidence) = filters.min_confidence {
        if analysis.confidence < min_confidence {
            return Ok(false);
        }
    }

    // File size filters
    if let Ok(metadata) = tokio::fs::metadata(&analysis.path).await {
        let file_size = metadata.len();

        if let Some(min_size) = filters.min_size {
            if file_size < min_size {
                return Ok(false);
            }
        }

        if let Some(max_size) = filters.max_size {
            if file_size > max_size {
                return Ok(false);
            }
        }

        // Date filters
        if let Ok(modified) = metadata.modified() {
            if let Ok(duration) = modified.duration_since(std::time::UNIX_EPOCH) {
                let modified_timestamp = duration.as_secs() as i64;

                if let Some(date_from) = filters.date_from {
                    if modified_timestamp < date_from {
                        return Ok(false);
                    }
                }

                if let Some(date_to) = filters.date_to {
                    if modified_timestamp > date_to {
                        return Ok(false);
                    }
                }
            }
        }
    }

    Ok(true)
}

#[tauri::command]
pub async fn suggest_organization(
    files: Vec<String>,
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<Vec<crate::ai::OrganizationSuggestion>> {
    // Get all available smart folders for context
    let smart_folders = state
        .database
        .list_smart_folders()
        .await
        .unwrap_or_default();
    state
        .ai_service
        .suggest_organization(files, smart_folders)
        .await
}

#[tauri::command]
pub async fn batch_analyze_files(
    paths: Vec<String>,
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<Vec<crate::ai::FileAnalysis>> {
    if paths.len() > 1000 {
        return Err(crate::error::AppError::SecurityError {
            message: "Too many files for batch analysis (max 1000)".to_string(),
        });
    }

    let operation_id = state.start_operation(
        crate::state::OperationType::FileAnalysis,
        format!("Batch analyzing {} files", paths.len()),
    );

    let mut results = Vec::new();
    for (index, path) in paths.iter().enumerate() {
        let progress = index as f32 / paths.len() as f32;
        state.update_progress(operation_id, progress, format!("Analyzing {}", path));

        // Read file content with size limit
        match tokio::fs::read_to_string(path).await {
            Ok(content) => {
                let mime_type = mime_guess::from_path(path)
                    .first_or_octet_stream()
                    .to_string();
                match state.ai_service.analyze_file(&content, &mime_type).await {
                    Ok(mut analysis) => {
                        analysis.path = path.clone();

                        // Save to database
                        let _ = state.database.save_analysis(&analysis).await;

                        // Generate and save embeddings
                        if let Ok(embedding) = state
                            .ai_service
                            .generate_embeddings(&format!(
                                "{} {}",
                                analysis.summary,
                                analysis.tags.join(" ")
                            ))
                            .await
                        {
                            let model_name = state.config.read().ollama_embedding_model.clone();
                            let _ = state
                                .database
                                .save_embedding(&analysis.path, &embedding, Some(&model_name))
                                .await;
                        }

                        results.push(analysis);
                    }
                    Err(e) => {
                        tracing::warn!("Failed to analyze {}: {}", path, e);
                    }
                }
            }
            Err(e) => {
                tracing::warn!("Failed to read file {}: {}", path, e);
            }
        }
    }

    state.complete_operation(operation_id);
    Ok(results)
}

#[tauri::command]
pub async fn get_analysis_history(
    limit: Option<usize>,
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<Vec<AnalysisHistoryEntry>> {
    let limit = limit.unwrap_or(50).min(200);
    let recent_files = state.database.get_recent_analyses(limit as u32).await?;

    let mut history = Vec::new();
    for path in recent_files {
        if let Ok(Some(analysis)) = state.database.get_analysis(&path).await {
            history.push(AnalysisHistoryEntry {
                path: analysis.path,
                category: analysis.category,
                summary: analysis.summary,
                confidence: analysis.confidence,
                analyzed_at: chrono::Utc::now(), // Would need to add timestamp to analysis
            });
        }
    }

    Ok(history)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AnalysisHistoryEntry {
    pub path: String,
    pub category: String,
    pub summary: String,
    pub confidence: f32,
    pub analyzed_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct QuickSearchResult {
    pub path: String,
    pub name: String,
    pub category: String,
    pub summary: String,
    pub match_type: String,
    pub relevance_score: f32,
    pub size: u64,
    pub modified_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchHistoryEntry {
    pub id: String,
    pub query: String,
    pub search_type: String,
    pub result_count: usize,
    pub timestamp: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchFilters {
    pub file_types: Option<Vec<String>>,
    pub category: Option<String>,
    pub min_size: Option<u64>,
    pub max_size: Option<u64>,
    pub date_from: Option<i64>,
    pub date_to: Option<i64>,
    pub min_confidence: Option<f32>,
    pub limit: Option<usize>,
    pub use_semantic: Option<bool>,
}
