use crate::ai::ollama::OllamaClient;
use crate::error::{AppError, Result};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::debug;

/// Deep semantic analysis of file content
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SemanticProfile {
    pub path: String,
    pub topic: String,          // Main topic (2-4 words)
    pub purpose: FilePurpose,   // invoice, receipt, reference, etc.
    pub entities: Vec<Entity>,  // People, companies, projects
    pub dates: Vec<String>,     // Dates mentioned in content
    pub domain: String,         // business, personal, tax, etc.
    pub themes: Vec<String>,    // wildlife, research, etc.
    pub suggested_name: String, // AI-suggested descriptive name
    pub confidence: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FilePurpose {
    Invoice,
    Receipt,
    Contract,
    Reference,
    Report,
    Photo,
    Document,
    Code,
    Data,
    Other(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Entity {
    pub entity_type: EntityType,
    pub name: String,
    pub confidence: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum EntityType {
    Person,
    Company,
    Project,
    Location,
    Other,
}

pub struct SemanticAnalyzer {
    ollama_client: Arc<OllamaClient>,
}

impl SemanticAnalyzer {
    pub fn new(ollama_client: Arc<OllamaClient>) -> Self {
        Self { ollama_client }
    }

    /// Analyze file semantics for deep understanding
    pub async fn analyze_file_semantics(
        &self,
        file_path: &str,
        content: &str,
    ) -> Result<SemanticProfile> {
        // Truncate content for analysis (first 15000 chars for deeper analysis)
        let truncated_content = content.chars().take(15000).collect::<String>();

        let prompt = format!(
            r#"You are a semantic file analyzer. Analyze this file content deeply and provide structured JSON.

File: {}
Content:
---
{}
---

Extract semantic information and respond with ONLY this JSON structure (no additional text):
{{
    "topic": "2-4 word main topic",
    "purpose": "invoice|receipt|contract|reference|report|photo|document|code|data|other",
    "entities": [
        {{
            "entity_type": "person|company|project|location|other",
            "name": "entity name",
            "confidence": 0.0-1.0
        }}
    ],
    "dates": ["2024-02-05", "2024-03-10"],
    "domain": "business|personal|tax|education|entertainment|other",
    "themes": ["theme1", "theme2", "theme3"],
    "suggested_name": "descriptive_filename_based_on_content",
    "confidence": 0.0-1.0
}}

Focus on:
- Main topic and purpose (what is this file for?)
- Key entities mentioned (people, companies, projects)
- Important dates referenced
- Domain/category
- Core themes for organization
- A meaningful filename suggestion"#,
            file_path, truncated_content
        );

        let response = self.ollama_client.generate_text_completion(&prompt).await?;

        // Parse JSON response
        let parsed: serde_json::Value = serde_json::from_str(&response).map_err(|e| {
            debug!(
                "Failed to parse semantic analysis JSON: {} - Response: {}",
                e, response
            );
            AppError::ParseError {
                message: format!("Invalid JSON response from semantic analyzer: {}", e),
            }
        })?;

        Ok(SemanticProfile {
            path: file_path.to_string(),
            topic: parsed["topic"].as_str().unwrap_or("unknown").to_string(),
            purpose: parse_purpose(parsed["purpose"].as_str().unwrap_or("other")),
            entities: parse_entities(&parsed["entities"]),
            dates: parsed["dates"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default(),
            domain: parsed["domain"].as_str().unwrap_or("other").to_string(),
            themes: parsed["themes"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default(),
            suggested_name: parsed["suggested_name"]
                .as_str()
                .unwrap_or("unnamed")
                .to_string(),
            confidence: parsed["confidence"].as_f64().unwrap_or(0.5) as f32,
        })
    }

    /// Batch analyze multiple files
    pub async fn analyze_batch(
        &self,
        file_contents: Vec<(String, String)>,
    ) -> Vec<Result<SemanticProfile>> {
        let mut results = Vec::new();
        for (path, content) in file_contents {
            results.push(self.analyze_file_semantics(&path, &content).await);
        }
        results
    }
}

fn parse_purpose(purpose_str: &str) -> FilePurpose {
    match purpose_str.to_lowercase().as_str() {
        "invoice" => FilePurpose::Invoice,
        "receipt" => FilePurpose::Receipt,
        "contract" => FilePurpose::Contract,
        "reference" => FilePurpose::Reference,
        "report" => FilePurpose::Report,
        "photo" => FilePurpose::Photo,
        "document" => FilePurpose::Document,
        "code" => FilePurpose::Code,
        "data" => FilePurpose::Data,
        other => FilePurpose::Other(other.to_string()),
    }
}

fn parse_entities(entities_val: &serde_json::Value) -> Vec<Entity> {
    let mut entities = Vec::new();
    if let Some(arr) = entities_val.as_array() {
        for entity_val in arr {
            let entity_type_str = entity_val["entity_type"].as_str().unwrap_or("other");
            let entity_type = match entity_type_str.to_lowercase().as_str() {
                "person" => EntityType::Person,
                "company" => EntityType::Company,
                "project" => EntityType::Project,
                "location" => EntityType::Location,
                _ => EntityType::Other,
            };

            entities.push(Entity {
                entity_type,
                name: entity_val["name"].as_str().unwrap_or("").to_string(),
                confidence: entity_val["confidence"].as_f64().unwrap_or(0.5) as f32,
            });
        }
    }
    entities
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_purpose() {
        assert!(matches!(parse_purpose("invoice"), FilePurpose::Invoice));
        assert!(matches!(parse_purpose("receipt"), FilePurpose::Receipt));
        assert!(matches!(parse_purpose("contract"), FilePurpose::Contract));
    }
}
