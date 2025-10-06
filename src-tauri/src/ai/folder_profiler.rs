use crate::ai::ollama::OllamaClient;
use crate::error::{AppError, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Arc;
use tokio::fs;
use tracing::debug;

/// Profile of a folder's organization and content
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FolderProfile {
    pub path: String,
    pub purpose: String,         // "2024 tax filing documents"
    pub themes: Vec<String>,     // ["financial", "tax", "business-expenses"]
    pub naming_pattern: String,  // "{type}_{date:YYYY-MM-DD}_{description}"
    pub file_types: Vec<String>, // ["pdf", "docx", "xlsx"]
    pub date_range: Option<DateRange>,
    pub sample_size: usize, // How many files were sampled
    pub confidence: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DateRange {
    pub start: String,
    pub end: String,
}

pub struct FolderProfiler {
    ollama_client: Arc<OllamaClient>,
}

impl FolderProfiler {
    pub fn new(ollama_client: Arc<OllamaClient>) -> Self {
        Self { ollama_client }
    }

    /// Profile a folder to understand its organization
    pub async fn profile_folder(
        &self,
        folder_path: &str,
        max_samples: usize,
    ) -> Result<FolderProfile> {
        // Sample files from the folder
        let sampled_files = self
            .sample_folder_contents(folder_path, max_samples)
            .await?;

        if sampled_files.is_empty() {
            return Ok(FolderProfile {
                path: folder_path.to_string(),
                purpose: "Empty folder".to_string(),
                themes: vec![],
                naming_pattern: "{name}".to_string(),
                file_types: vec![],
                date_range: None,
                sample_size: 0,
                confidence: 0.0,
            });
        }

        // Extract file types
        let file_types: Vec<String> = sampled_files
            .iter()
            .filter_map(|f| {
                Path::new(&f.name)
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .map(|s| s.to_lowercase())
            })
            .collect();

        // Build analysis prompt
        let files_summary = sampled_files
            .iter()
            .map(|f| format!("- {} ({})", f.name, f.content_preview))
            .collect::<Vec<_>>()
            .join("\n");

        let prompt = format!(
            r#"You are a folder organization analyzer. Analyze these sample files and determine the folder's organization pattern.

Folder: {}
Sample files ({}):
{}

Analyze and respond with ONLY this JSON structure (no additional text):
{{
    "purpose": "What is this folder's main purpose? (1 sentence)",
    "themes": ["theme1", "theme2", "theme3"],
    "naming_pattern": "Detected naming convention using placeholders like {{type}}, {{date}}, {{description}}, {{project}}, {{name}}",
    "date_range": {{
        "start": "YYYY-MM-DD or null",
        "end": "YYYY-MM-DD or null"
    }},
    "confidence": 0.0-1.0
}}

Focus on:
- What types of files are stored here?
- What naming convention is used? (date-first? project-based? descriptive?)
- What themes or categories are present?
- What temporal context (if any)?
"#,
            folder_path,
            sampled_files.len(),
            files_summary
        );

        let response = self.ollama_client.generate_text_completion(&prompt).await?;

        // Parse JSON response
        let parsed: serde_json::Value = serde_json::from_str(&response).map_err(|e| {
            debug!(
                "Failed to parse folder profile JSON: {} - Response: {}",
                e, response
            );
            AppError::ParseError {
                message: format!("Invalid JSON response from folder profiler: {}", e),
            }
        })?;

        let date_range = if let Some(dr) = parsed["date_range"].as_object() {
            if let (Some(start), Some(end)) = (dr.get("start"), dr.get("end")) {
                if !start.is_null() && !end.is_null() {
                    Some(DateRange {
                        start: start.as_str().unwrap_or("").to_string(),
                        end: end.as_str().unwrap_or("").to_string(),
                    })
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        };

        Ok(FolderProfile {
            path: folder_path.to_string(),
            purpose: parsed["purpose"]
                .as_str()
                .unwrap_or("Unknown purpose")
                .to_string(),
            themes: parsed["themes"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default(),
            naming_pattern: parsed["naming_pattern"]
                .as_str()
                .unwrap_or("{name}")
                .to_string(),
            file_types,
            date_range,
            sample_size: sampled_files.len(),
            confidence: parsed["confidence"].as_f64().unwrap_or(0.5) as f32,
        })
    }

    /// Sample folder contents for analysis (avoid reading entire folder)
    async fn sample_folder_contents(
        &self,
        folder_path: &str,
        max_samples: usize,
    ) -> Result<Vec<FileSample>> {
        let mut samples = Vec::new();
        let mut entries = fs::read_dir(folder_path).await.map_err(AppError::Io)?;

        while let Some(entry) = entries.next_entry().await.map_err(AppError::Io)? {
            if samples.len() >= max_samples {
                break;
            }

            let path = entry.path();
            if !path.is_file() {
                continue;
            }

            let file_name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();

            // Read first 500 chars for preview
            let content_preview = match fs::read_to_string(&path).await {
                Ok(content) => content.chars().take(500).collect(),
                Err(_) => "[Binary file]".to_string(),
            };

            samples.push(FileSample {
                name: file_name,
                content_preview,
            });
        }

        Ok(samples)
    }

    /// Profile multiple folders in batch
    pub async fn profile_folders_batch(
        &self,
        folder_paths: Vec<String>,
        max_samples: usize,
    ) -> Vec<Result<FolderProfile>> {
        let mut results = Vec::new();
        for path in folder_paths {
            results.push(self.profile_folder(&path, max_samples).await);
        }
        results
    }
}

#[derive(Debug)]
struct FileSample {
    name: String,
    content_preview: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_folder_profile_structure() {
        // Test structure validation
        let profile = FolderProfile {
            path: "/test".to_string(),
            purpose: "test".to_string(),
            themes: vec!["theme1".to_string()],
            naming_pattern: "{name}".to_string(),
            file_types: vec!["txt".to_string()],
            date_range: None,
            sample_size: 5,
            confidence: 0.8,
        };

        assert_eq!(profile.sample_size, 5);
        assert_eq!(profile.confidence, 0.8);
    }
}
