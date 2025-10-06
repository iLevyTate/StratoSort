pub mod behavioral_learning;
pub mod connection;
pub mod embeddings;
pub mod folder_profiler;
pub mod matching_engine;
pub mod ollama;
pub mod ollama_manager;
pub mod semantic_analyzer;

#[cfg(test)]
mod tests;

use crate::{config::Config, error::Result};
use async_trait::async_trait;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

/// Main AI service that manages different providers
pub struct AiService {
    config: Arc<RwLock<Config>>,
    provider: Arc<RwLock<AiProvider>>,
    ollama_client: Arc<RwLock<Option<Arc<ollama::OllamaClient>>>>,
}

impl AiService {
    pub async fn new(config: &Config) -> Result<Self> {
        let provider = match config.ai_provider.to_lowercase().as_str() {
            "ollama" => AiProvider::Ollama,
            "fallback" => AiProvider::Fallback,
            "" | "default" => AiProvider::Ollama, // Default to Ollama if unspecified
            invalid => {
                tracing::warn!("Unknown AI provider '{}', defaulting to Ollama", invalid);
                AiProvider::Ollama
            }
        };

        // Try to create OllamaClient only if provider is Ollama, and only auto-fallback if not explicitly set to fallback
        let (ollama_client, final_provider) = match provider {
            AiProvider::Ollama => {
                // Validate ollama_host before attempting to create client
                if config.ollama_host.is_empty() {
                    tracing::warn!("Ollama host is empty. Using fallback mode.");
                    (None, AiProvider::Fallback)
                } else {
                    match ollama::OllamaClient::new(&config.ollama_host).await {
                        Ok(client) => {
                            tracing::info!(
                                "Ollama client initialized successfully with host: {}",
                                config.ollama_host
                            );

                            // Auto-pull required models
                            if let Err(e) = client.ensure_models_available().await {
                                tracing::warn!(
                                    "Failed to auto-pull required models: {}. Continuing anyway.",
                                    e
                                );
                            }

                            (Some(client), AiProvider::Ollama)
                        }
                        Err(e) => {
                            tracing::warn!("Failed to initialize Ollama client with host '{}': {}. Using fallback mode.", config.ollama_host, e);
                            (None, AiProvider::Fallback)
                        }
                    }
                }
            }
            AiProvider::Fallback => {
                tracing::info!("AI provider explicitly set to fallback mode");
                (None, AiProvider::Fallback)
            }
        };

        Ok(Self {
            config: Arc::new(RwLock::new(config.clone())),
            provider: Arc::new(RwLock::new(final_provider)),
            ollama_client: Arc::new(RwLock::new(ollama_client.map(Arc::new))),
        })
    }

    pub async fn update_config(&self, config: &Config) -> Result<()> {
        let old_config = self.config.read().clone();
        let old_provider = self.provider.read().clone();

        // Determine new provider
        let new_provider = match config.ai_provider.to_lowercase().as_str() {
            "ollama" => AiProvider::Ollama,
            "fallback" => AiProvider::Fallback,
            "" | "default" => AiProvider::Ollama,
            invalid => {
                tracing::warn!("Unknown AI provider '{}', defaulting to Ollama", invalid);
                AiProvider::Ollama
            }
        };

        // Check if we need to reinitialize the client
        let should_reinit = matches!(new_provider, AiProvider::Ollama)
            && (!matches!(old_provider, AiProvider::Ollama)
                || old_config.ollama_host != config.ollama_host);

        // Update config first
        *self.config.write() = config.clone();

        if should_reinit {
            // Reinitialize Ollama client with new config
            tracing::info!("Reinitializing Ollama client due to config change");

            let (new_provider, ollama_client) = if config.ollama_host.is_empty() {
                tracing::warn!("Ollama host is empty. Switching to fallback mode.");
                (AiProvider::Fallback, None)
            } else {
                match ollama::OllamaClient::new(&config.ollama_host).await {
                    Ok(client) => {
                        tracing::info!(
                            "Ollama client reinitialized successfully with host: {}",
                            config.ollama_host
                        );
                        (AiProvider::Ollama, Some(Arc::new(client)))
                    }
                    Err(e) => {
                        tracing::warn!("Failed to reinitialize Ollama client with host '{}': {}. Switching to fallback mode.", config.ollama_host, e);
                        (AiProvider::Fallback, None)
                    }
                }
            };

            // CRITICAL: Update both atomically to prevent race condition
            // where provider=Ollama but client=None
            *self.provider.write() = new_provider;
            *self.ollama_client.write() = ollama_client;
        } else if matches!(new_provider, AiProvider::Fallback)
            && !matches!(old_provider, AiProvider::Fallback)
        {
            // Switching to explicit fallback mode
            tracing::info!("Switching to explicit fallback mode");
            *self.provider.write() = AiProvider::Fallback;
            *self.ollama_client.write() = None;
        } else {
            // Just update provider if no client reinit needed
            *self.provider.write() = new_provider;
        }

        Ok(())
    }

    /// Analyzes file content using AI
    pub async fn analyze_file(&self, content: &str, file_type: &str) -> Result<FileAnalysis> {
        self.analyze_file_with_path(content, file_type, "").await
    }

    /// Analyzes file content using AI with path parameter
    pub async fn analyze_file_with_path(
        &self,
        content: &str,
        file_type: &str,
        path: &str,
    ) -> Result<FileAnalysis> {
        let provider = self.provider.read().clone();

        match provider {
            AiProvider::Ollama => {
                let client_opt = self.ollama_client.read().clone();
                if let Some(client) = client_opt {
                    let mut analysis = client.analyze_file(content, file_type).await?;
                    analysis.path = path.to_string();
                    Ok(analysis)
                } else {
                    self.fallback_analysis_with_path(content, file_type, path)
                }
            }
            AiProvider::Fallback => self.fallback_analysis_with_path(content, file_type, path),
        }
    }

    /// Analyzes image files using vision AI
    pub async fn analyze_image(&self, image_path: &str) -> Result<FileAnalysis> {
        let provider = self.provider.read().clone();

        match provider {
            AiProvider::Ollama => {
                let client_opt = self.ollama_client.read().clone();
                if let Some(client) = client_opt {
                    client.analyze_image(image_path).await
                } else {
                    // Fallback for images when Ollama is not available
                    self.fallback_image_analysis(image_path)
                }
            }
            AiProvider::Fallback => self.fallback_image_analysis(image_path),
        }
    }

    /// Generates embeddings for semantic search
    pub async fn generate_embeddings(&self, text: &str) -> Result<Vec<f32>> {
        let provider = self.provider.read().clone();
        let config = self.config.read().clone();

        match provider {
            AiProvider::Ollama => {
                let client_opt = self.ollama_client.read().clone();
                if let Some(client) = client_opt {
                    // Use Ollama client's embeddings first
                    match client.generate_embeddings(text).await {
                        Ok(embeddings) => Ok(embeddings),
                        Err(e) => {
                            tracing::warn!(
                                "Ollama client embedding failed: {}. Trying direct API.",
                                e
                            );
                            // Fallback to direct API call
                            embeddings::generate_embeddings_with_ollama(
                                text,
                                &config.ollama_host,
                                "nomic-embed-text", // Use production embedding model
                            )
                            .await
                        }
                    }
                } else {
                    // Try direct API call if client not available
                    embeddings::generate_embeddings_with_ollama(
                        text,
                        &config.ollama_host,
                        "nomic-embed-text",
                    )
                    .await
                }
            }
            AiProvider::Fallback => embeddings::generate_simple_embeddings(text),
        }
    }

    /// Fallback analysis when AI is not available
    #[allow(dead_code)]
    fn fallback_analysis(&self, content: &str, file_type: &str) -> Result<FileAnalysis> {
        self.fallback_analysis_with_path(content, file_type, "")
    }

    /// Fallback analysis with path parameter
    fn fallback_analysis_with_path(
        &self,
        content: &str,
        file_type: &str,
        path: &str,
    ) -> Result<FileAnalysis> {
        // Simple rule-based analysis
        let category = match file_type {
            t if t.starts_with("image/") => "Images",
            t if t.starts_with("video/") => "Videos",
            t if t.starts_with("audio/") => "Audio",
            t if t.contains("pdf") => "Documents",
            t if t.contains("text") => "Text",
            t if t.contains("presentation") || t.contains("powerpoint") => "Presentations",
            t if t.contains("spreadsheet") || t.contains("excel") => "Spreadsheets",
            t if t.contains("word") || t.contains("document") => "Documents",
            t if t.contains("model")
                || t.contains("3d")
                || t.contains("cad")
                || t.contains("mesh") =>
            {
                "3D Print Files"
            }
            _ => "Other",
        };

        let mut tags = Vec::new();

        // Extract simple tags from content and path
        let content_lower = content.to_lowercase();
        let path_lower = path.to_lowercase();

        if content_lower.contains("invoice") {
            tags.push("invoice".to_string());
            tags.push("financial".to_string());
        }
        if content_lower.contains("contract") {
            tags.push("contract".to_string());
            tags.push("legal".to_string());
        }
        if content_lower.contains("report") {
            tags.push("report".to_string());
        }

        // PowerPoint-specific content analysis
        if category == "Presentations" {
            tags.push("slides".to_string());

            // Analyze content for presentation type
            if content_lower.contains("meeting") || content_lower.contains("agenda") {
                tags.push("meeting".to_string());
            }
            if content_lower.contains("training") || content_lower.contains("course") {
                tags.push("training".to_string());
            }
            if content_lower.contains("sales") || content_lower.contains("pitch") {
                tags.push("sales".to_string());
            }
            if content_lower.contains("quarterly") || content_lower.contains("annual") {
                tags.push("corporate".to_string());
            }
            if content_lower.contains("template") {
                tags.push("template".to_string());
            }

            // Filename-based detection
            if path_lower.contains("template") {
                tags.push("template".to_string());
            }
            if path_lower.contains("meeting") {
                tags.push("meeting".to_string());
            }
            if path_lower.contains("presentation") {
                tags.push("business".to_string());
            }
        }

        // 3D Print file-specific analysis
        if category == "3D Print Files" {
            tags.push("3d-model".to_string());

            // Analyze filename for 3D print type
            if path_lower.contains("miniature")
                || path_lower.contains("mini")
                || path_lower.contains("figurine")
            {
                tags.push("miniature".to_string());
                tags.push("tabletop".to_string());
            }
            if path_lower.contains("terrain") || path_lower.contains("landscape") {
                tags.push("terrain".to_string());
                tags.push("environment".to_string());
            }
            if path_lower.contains("tool")
                || path_lower.contains("functional")
                || path_lower.contains("utility")
            {
                tags.push("functional".to_string());
                tags.push("tool".to_string());
            }
            if path_lower.contains("prototype") || path_lower.contains("test") {
                tags.push("prototype".to_string());
            }
            if path_lower.contains("art")
                || path_lower.contains("sculpture")
                || path_lower.contains("decorative")
            {
                tags.push("artistic".to_string());
                tags.push("decorative".to_string());
            }
            if path_lower.contains("repair")
                || path_lower.contains("replacement")
                || path_lower.contains("part")
            {
                tags.push("replacement-part".to_string());
                tags.push("repair".to_string());
            }
            if path_lower.contains("toy") || path_lower.contains("game") {
                tags.push("toy".to_string());
                tags.push("game".to_string());
            }

            // File type specific tags
            if path_lower.ends_with(".stl") {
                tags.push("stereolithography".to_string());
            }
            if path_lower.ends_with(".gcode") || path_lower.ends_with(".g") {
                tags.push("sliced".to_string());
                tags.push("print-ready".to_string());
            }
            if path_lower.ends_with(".blend") {
                tags.push("blender".to_string());
                tags.push("source-file".to_string());
            }
            if path_lower.ends_with(".3mf") {
                tags.push("microsoft-3mf".to_string());
            }
            if path_lower.contains("prusa") || path_lower.contains(".prusa") {
                tags.push("prusa-slicer".to_string());
            }
            if path_lower.contains("cura") {
                tags.push("cura-slicer".to_string());
            }
        }

        let summary = if category == "Presentations" {
            format!(
                "PowerPoint presentation: {}",
                if !tags.is_empty() {
                    format!("Contains {}", tags.join(", "))
                } else {
                    "Slide presentation".to_string()
                }
            )
        } else if category == "3D Print Files" {
            format!(
                "3D print file: {}",
                if !tags.is_empty() {
                    format!("Tagged as {}", tags.join(", "))
                } else {
                    "3D model or printing file".to_string()
                }
            )
        } else {
            format!("File type: {}", file_type)
        };

        Ok(FileAnalysis {
            path: path.to_string(),
            category: category.to_string(),
            tags,
            summary,
            confidence: 0.5,
            extracted_text: None,
            detected_language: None,
            metadata: serde_json::json!({}),
        })
    }

    /// Fallback image analysis when vision AI is not available
    fn fallback_image_analysis(&self, image_path: &str) -> Result<FileAnalysis> {
        use std::path::Path;

        let path = Path::new(image_path);
        let extension = path
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("unknown")
            .to_lowercase();

        let filename = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("unknown");

        // Basic tags based on filename and extension
        let mut tags = vec!["image".to_string(), extension.clone()];

        // Add tags based on filename patterns
        let filename_lower = filename.to_lowercase();
        if filename_lower.contains("photo") || filename_lower.contains("pic") {
            tags.push("photo".to_string());
        }
        if filename_lower.contains("screenshot") || filename_lower.contains("screen") {
            tags.push("screenshot".to_string());
        }
        if filename_lower.contains("document") || filename_lower.contains("scan") {
            tags.push("document".to_string());
        }
        if filename_lower.contains("avatar") || filename_lower.contains("profile") {
            tags.push("avatar".to_string());
        }
        if filename_lower.contains("logo") {
            tags.push("logo".to_string());
        }

        Ok(FileAnalysis {
            path: image_path.to_string(),
            category: "Images".to_string(),
            tags,
            summary: format!("Image file: {} ({})", filename, extension.to_uppercase()),
            confidence: 0.3, // Lower confidence for fallback
            extracted_text: None,
            detected_language: None,
            metadata: serde_json::json!({
                "image_format": extension,
                "fallback_analysis": true
            }),
        })
    }

    /// Checks if AI service is available
    pub async fn is_available(&self) -> bool {
        let provider = self.provider.read().clone();

        match provider {
            AiProvider::Ollama => {
                let client_opt = self.ollama_client.read().clone();
                if let Some(client) = client_opt {
                    client.health_check().await.is_ok()
                } else {
                    false
                }
            }
            AiProvider::Fallback => true,
        }
    }

    /// Get comprehensive AI service status
    pub async fn get_status(&self) -> AiServiceStatus {
        let provider = self.provider.read().clone();
        let ollama_host = self.config.read().ollama_host.clone();

        let mut status = AiServiceStatus {
            provider: provider.clone(),
            is_available: false,
            ollama_connected: false,
            ollama_host,
            last_error: None,
            capabilities: Vec::new(),
            models_available: Vec::new(),
        };

        match provider {
            AiProvider::Ollama => {
                let client_opt = self.ollama_client.read().clone();
                if let Some(client) = client_opt {
                    match client.health_check().await {
                        Ok(_) => {
                            status.is_available = true;
                            status.ollama_connected = true;
                            status.capabilities = vec![
                                "file_analysis".to_string(),
                                "embeddings".to_string(),
                                "organization".to_string(),
                            ];

                            // Try to get available models
                            if let Ok(models) = client.list_models().await {
                                status.models_available = models;
                            }
                        }
                        Err(e) => {
                            status.last_error = Some(format!("Ollama health check failed: {}", e));
                        }
                    }
                } else {
                    status.last_error = Some("Ollama client not initialized".to_string());
                }
            }
            AiProvider::Fallback => {
                status.is_available = true;
                status.capabilities = vec![
                    "basic_file_analysis".to_string(),
                    "simple_embeddings".to_string(),
                    "rule_based_organization".to_string(),
                ];
            }
        }

        status
    }

    /// Switches to fallback provider
    pub fn use_fallback(&self) -> AiServiceStatus {
        *self.provider.write() = AiProvider::Fallback;
        tracing::info!("Switched to fallback AI provider");

        // Return status synchronously since fallback doesn't need async operations
        let config = self.config.read();
        AiServiceStatus {
            provider: AiProvider::Fallback,
            is_available: true,
            ollama_connected: false,
            ollama_host: config.ollama_host.clone(),
            last_error: None,
            capabilities: vec![
                "basic_file_analysis".to_string(),
                "simple_embeddings".to_string(),
                "rule_based_organization".to_string(),
            ],
            models_available: vec!["fallback".to_string()],
        }
    }

    /// Get the ollama client if available
    pub fn get_ollama_client(&self) -> Option<Arc<ollama::OllamaClient>> {
        self.ollama_client.read().clone()
    }

    /// Try to reconnect to Ollama with a new host (replaces try_initialize_ollama)
    pub async fn reconnect_ollama(&self, host: &str) -> Result<AiServiceStatus> {
        tracing::info!("Attempting to connect to Ollama at: {}", host);

        match ollama::OllamaClient::new(host).await {
            Ok(client) => {
                // Test the connection
                match client.health_check().await {
                    Ok(_) => {
                        tracing::info!("Ollama client connected successfully to {}", host);

                        // Update the client
                        *self.ollama_client.write() = Some(Arc::new(client));
                        *self.provider.write() = AiProvider::Ollama;

                        // Update config with working host and provider
                        {
                            let mut config = self.config.write();
                            config.ollama_host = host.to_string();
                            config.ai_provider = "ollama".to_string();
                        }

                        Ok(self.get_status().await)
                    }
                    Err(e) => {
                        tracing::warn!(
                            "Ollama client created but health check failed for {}: {}",
                            host,
                            e
                        );
                        let mut status = self.get_status().await;
                        status.last_error = Some(format!("Health check failed: {}", e));
                        Ok(status)
                    }
                }
            }
            Err(e) => {
                tracing::warn!("Failed to create Ollama client for {}: {}", host, e);
                let mut status = self.get_status().await;
                status.last_error = Some(format!("Connection failed: {}", e));
                Ok(status)
            }
        }
    }

    /// Suggests organization for a list of files
    pub async fn suggest_organization(
        &self,
        files: Vec<String>,
        smart_folders: Vec<crate::commands::organization::SmartFolder>,
    ) -> Result<Vec<OrganizationSuggestion>> {
        let provider = self.provider.read().clone();

        match provider {
            AiProvider::Ollama => {
                let client_opt = self.ollama_client.read().clone();
                if let Some(client) = client_opt {
                    client.suggest_organization(files, smart_folders).await
                } else {
                    self.fallback_suggest_organization(files, smart_folders)
                }
            }
            AiProvider::Fallback => self.fallback_suggest_organization(files, smart_folders),
        }
    }

    /// Fallback organization suggestions when AI is not available
    fn fallback_suggest_organization(
        &self,
        files: Vec<String>,
        smart_folders: Vec<crate::commands::organization::SmartFolder>,
    ) -> Result<Vec<OrganizationSuggestion>> {
        let mut suggestions = Vec::new();

        for file in files {
            let path = std::path::Path::new(&file);
            let extension = path.extension().and_then(|e| e.to_str()).unwrap_or("");

            // Try to match with existing smart folders first
            let mut target_folder = "Other";
            let mut reason = format!("Based on file extension: .{}", extension);
            let mut confidence = 0.7;

            // Check if any smart folder rules would match this file
            for smart_folder in &smart_folders {
                if smart_folder.enabled {
                    // Simple extension-based matching against smart folder rules
                    let folder_matches = smart_folder.rules.iter().any(|rule| {
                        if rule.enabled
                            && rule.rule_type
                                == crate::commands::organization::RuleType::FileExtension
                        {
                            rule.condition.value.to_lowercase() == extension.to_lowercase()
                        } else {
                            false
                        }
                    });

                    if folder_matches {
                        target_folder = &smart_folder.name;
                        reason = format!(
                            "Matches smart folder '{}': {}",
                            smart_folder.name,
                            smart_folder
                                .description
                                .as_deref()
                                .unwrap_or("Smart folder rule")
                        );
                        confidence = 0.85; // Higher confidence when matching existing folders
                        break;
                    }
                }
            }

            // Fallback to basic extension matching if no smart folder matched
            if target_folder == "Other" {
                target_folder = match extension {
                    "jpg" | "jpeg" | "png" | "gif" | "bmp" => "Images",
                    "mp4" | "avi" | "mkv" | "mov" => "Videos",
                    "mp3" | "wav" | "flac" | "m4a" => "Audio",
                    "pdf" | "doc" | "docx" | "txt" | "rtf" | "odt" | "pages" => "Documents",
                    "ppt" | "pptx" | "pptm" | "ppsx" | "key" | "odp" => "Presentations",
                    "xls" | "xlsx" | "xlsm" | "csv" | "numbers" => "Spreadsheets",
                    "stl" | "obj" | "3mf" | "gcode" | "blend" | "fbx" | "dwg" => "3D Print Files",
                    "zip" | "rar" | "7z" | "tar" => "Archives",
                    _ => "Other",
                };
            }

            suggestions.push(OrganizationSuggestion {
                source_path: file.clone(),
                target_folder: target_folder.to_string(),
                reason,
                confidence,
            });
        }

        Ok(suggestions)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum AiProvider {
    Ollama,
    Fallback,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiServiceStatus {
    pub provider: AiProvider,
    pub is_available: bool,
    pub ollama_connected: bool,
    pub ollama_host: String,
    pub last_error: Option<String>,
    pub capabilities: Vec<String>,
    pub models_available: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileAnalysis {
    pub path: String,
    pub category: String,
    pub tags: Vec<String>,
    #[serde(rename = "content_summary")]
    pub summary: String,
    pub confidence: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extracted_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detected_language: Option<String>,
    #[serde(skip)]
    pub metadata: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrganizationSuggestion {
    pub source_path: String,
    pub target_folder: String,
    pub reason: String,
    pub confidence: f32,
}

#[async_trait]
pub trait AiEngine: Send + Sync {
    async fn analyze_file(&self, content: &str, file_type: &str) -> Result<FileAnalysis>;
    async fn generate_embeddings(&self, text: &str) -> Result<Vec<f32>>;
    async fn suggest_organization(
        &self,
        files: Vec<String>,
        smart_folders: Vec<crate::commands::organization::SmartFolder>,
    ) -> Result<Vec<OrganizationSuggestion>>;
}

// Re-export new AI modules
pub use behavioral_learning::{
    BehavioralLearning, LearnedPattern, OrganizationPrediction, PatternType,
};
pub use folder_profiler::{FolderProfile, FolderProfiler};
pub use matching_engine::{MatchResult, MatchingEngine, ScoreBreakdown};
pub use semantic_analyzer::{Entity, EntityType, FilePurpose, SemanticAnalyzer, SemanticProfile};
