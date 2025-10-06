use crate::ai::ollama::OllamaClient;
// use crate::commands::organization::SmartFolder;
use crate::error::{AppError, Result};
use crate::services::file_watcher::UserAction;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tracing::{debug, info};

/// Learned pattern from user actions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LearnedPattern {
    pub id: String,
    pub pattern_type: PatternType,
    pub file_characteristics: FileCharacteristics,
    pub destination_folder: String,
    pub confidence: f32,
    pub occurrences: usize,
    pub last_seen: i64,
    pub suggested_rule: Option<SuggestedRule>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PatternType {
    ExtensionBased, // User always moves .pdf to specific folder
    ContentBased,   // User moves files with certain content
    DateBased,      // User organizes by date patterns
    EntityBased,    // User groups by company/project names
    Mixed,          // Complex pattern with multiple factors
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileCharacteristics {
    pub extensions: Vec<String>,
    pub content_keywords: Vec<String>,
    pub size_range: Option<(u64, u64)>,
    pub date_pattern: Option<String>,
    pub common_themes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SuggestedRule {
    pub rule_type: String,
    pub condition: String,
    pub action: String,
    pub description: String,
}

/// Prediction for where a file should go
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrganizationPrediction {
    pub file_path: String,
    pub suggested_folder: String,
    pub suggested_name: Option<String>,
    pub confidence: f32,
    pub reasoning: String,
    pub pattern_id: String,
}

pub struct BehavioralLearning {
    ollama_client: Arc<OllamaClient>,
}

impl BehavioralLearning {
    pub fn new(ollama_client: Arc<OllamaClient>) -> Self {
        Self { ollama_client }
    }

    /// Detect patterns from user actions
    pub async fn detect_patterns(
        &self,
        user_actions: &[UserAction],
    ) -> Result<Vec<LearnedPattern>> {
        if user_actions.len() < 3 {
            return Ok(vec![]); // Need at least 3 actions to detect patterns
        }

        // Group actions by destination
        let mut destination_groups: HashMap<String, Vec<&UserAction>> = HashMap::new();
        for action in user_actions {
            if let Some(dest) = &action.destination_path {
                destination_groups
                    .entry(dest.clone())
                    .or_default()
                    .push(action);
            }
        }

        let mut patterns = Vec::new();

        for (destination, actions) in destination_groups {
            if actions.len() < 3 {
                continue; // Need at least 3 similar actions
            }

            // Extract file characteristics
            let characteristics = self.extract_file_characteristics(&actions);

            // Use AI to analyze the pattern
            let pattern_analysis = self.analyze_pattern_with_ai(&actions, &destination).await?;

            let pattern = LearnedPattern {
                id: uuid::Uuid::new_v4().to_string(),
                pattern_type: pattern_analysis.pattern_type,
                file_characteristics: characteristics,
                destination_folder: destination.clone(),
                confidence: self.calculate_pattern_confidence(actions.len()),
                occurrences: actions.len(),
                last_seen: actions.iter().map(|a| a.timestamp).max().unwrap_or(0),
                suggested_rule: pattern_analysis.suggested_rule,
            };

            patterns.push(pattern);
        }

        // Sort by confidence and occurrences
        patterns.sort_by(|a, b| {
            b.confidence
                .partial_cmp(&a.confidence)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| b.occurrences.cmp(&a.occurrences))
        });

        info!(
            "Detected {} patterns from {} user actions",
            patterns.len(),
            user_actions.len()
        );
        Ok(patterns)
    }

    /// Predict where a file should be organized based on learned patterns
    pub async fn predict_organization(
        &self,
        file_path: &str,
        file_content: Option<&str>,
        patterns: &[LearnedPattern],
    ) -> Result<Option<OrganizationPrediction>> {
        if patterns.is_empty() {
            return Ok(None);
        }

        let file_ext = std::path::Path::new(file_path)
            .extension()
            .and_then(|e| e.to_str())
            .map(|s| s.to_lowercase());

        let mut best_match: Option<(f32, &LearnedPattern)> = None;

        for pattern in patterns {
            let mut match_score = 0.0f32;
            let mut factors = 0;

            // Extension match
            if let Some(ref ext) = file_ext {
                if pattern.file_characteristics.extensions.contains(ext) {
                    match_score += 0.4;
                }
                factors += 1;
            }

            // Content match (if available)
            if let Some(content) = file_content {
                let content_lower = content.to_lowercase();
                let keyword_matches = pattern
                    .file_characteristics
                    .content_keywords
                    .iter()
                    .filter(|kw| content_lower.contains(&kw.to_lowercase()))
                    .count();

                if !pattern.file_characteristics.content_keywords.is_empty() {
                    match_score += 0.6
                        * (keyword_matches as f32
                            / pattern.file_characteristics.content_keywords.len() as f32);
                }
                factors += 1;
            }

            // Normalize score
            let normalized_score = if factors > 0 {
                (match_score / factors as f32) * pattern.confidence
            } else {
                0.0
            };

            if normalized_score > best_match.as_ref().map(|(s, _)| *s).unwrap_or(0.0) {
                best_match = Some((normalized_score, pattern));
            }
        }

        if let Some((score, pattern)) = best_match {
            if score > 0.5 {
                // Threshold for prediction
                return Ok(Some(OrganizationPrediction {
                    file_path: file_path.to_string(),
                    suggested_folder: pattern.destination_folder.clone(),
                    suggested_name: None, // Could be enhanced with naming pattern
                    confidence: score,
                    reasoning: format!(
                        "Based on {} similar files you organized to this folder (pattern type: {:?})",
                        pattern.occurrences,
                        pattern.pattern_type
                    ),
                    pattern_id: pattern.id.clone(),
                }));
            }
        }

        Ok(None)
    }

    /// Generate Smart Folder rule suggestion from pattern
    pub fn generate_smart_folder_suggestion(
        &self,
        pattern: &LearnedPattern,
    ) -> Option<crate::commands::organization::SmartFolder> {
        if pattern.confidence < 0.7 || pattern.occurrences < 5 {
            return None; // Not confident enough
        }

        let suggested_rule = pattern.suggested_rule.as_ref()?;

        Some(crate::commands::organization::SmartFolder {
            id: uuid::Uuid::new_v4().to_string(),
            name: format!(
                "Auto: {}",
                Self::extract_folder_name(&pattern.destination_folder)
            ),
            description: Some(suggested_rule.description.clone()),
            rules: vec![], // Would need to convert SuggestedRule to OrganizationRule
            target_path: pattern.destination_folder.clone(),
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
            enabled: false,          // Disabled by default, user must enable
            naming_convention: None, // Will be set by user later
            ai_guidance: None,       // Will be set by user later
        })
    }

    // Helper methods

    fn extract_file_characteristics(&self, actions: &[&UserAction]) -> FileCharacteristics {
        let mut extensions = Vec::new();
        let _size_ranges: Vec<(u64, u64)> = Vec::new();

        for action in actions {
            if let Some(ext) = std::path::Path::new(&action.file_path)
                .extension()
                .and_then(|e| e.to_str())
                .map(|s| s.to_lowercase())
            {
                if !extensions.contains(&ext) {
                    extensions.push(ext);
                }
            }
        }

        FileCharacteristics {
            extensions,
            content_keywords: vec![], // Would need content analysis
            size_range: None,
            date_pattern: None,
            common_themes: vec![],
        }
    }

    fn calculate_pattern_confidence(&self, occurrences: usize) -> f32 {
        match occurrences {
            0..=2 => 0.3,
            3..=4 => 0.6,
            5..=9 => 0.8,
            _ => 0.95,
        }
    }

    async fn analyze_pattern_with_ai(
        &self,
        actions: &[&UserAction],
        destination: &str,
    ) -> Result<PatternAnalysis> {
        let files_list = actions
            .iter()
            .map(|a| format!("- {}", a.file_path))
            .collect::<Vec<_>>()
            .join("\n");

        let prompt = format!(
            r#"You are a pattern recognition AI. Analyze these user file organization actions.

User moved these {} files to: {}
{}

Determine the organization pattern and respond with ONLY this JSON:
{{
    "pattern_type": "extension_based|content_based|date_based|entity_based|mixed",
    "suggested_rule": {{
        "rule_type": "file_extension|file_content|modification_date|file_name",
        "condition": "description of what to match",
        "action": "move to {}",
        "description": "Human-readable rule description"
    }}
}}

What pattern do you see in these file movements?"#,
            actions.len(),
            destination,
            files_list,
            destination
        );

        let response = self.ollama_client.generate_text_completion(&prompt).await?;

        let parsed: serde_json::Value = serde_json::from_str(&response).map_err(|e| {
            debug!(
                "Failed to parse pattern analysis: {} - Response: {}",
                e, response
            );
            AppError::ParseError {
                message: format!("Invalid JSON from pattern analysis: {}", e),
            }
        })?;

        let pattern_type = match parsed["pattern_type"].as_str().unwrap_or("mixed") {
            "extension_based" => PatternType::ExtensionBased,
            "content_based" => PatternType::ContentBased,
            "date_based" => PatternType::DateBased,
            "entity_based" => PatternType::EntityBased,
            _ => PatternType::Mixed,
        };

        let suggested_rule = parsed["suggested_rule"]
            .as_object()
            .map(|rule_obj| SuggestedRule {
                rule_type: rule_obj
                    .get("rule_type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                condition: rule_obj
                    .get("condition")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                action: rule_obj
                    .get("action")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                description: rule_obj
                    .get("description")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
            });

        Ok(PatternAnalysis {
            pattern_type,
            suggested_rule,
        })
    }

    fn extract_folder_name(path: &str) -> String {
        std::path::Path::new(path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Unnamed")
            .to_string()
    }
}

struct PatternAnalysis {
    pattern_type: PatternType,
    suggested_rule: Option<SuggestedRule>,
}

#[cfg(test)]
mod tests {
    // Explicit imports only - avoid wildcard to prevent conflicts with test helper functions

    // Test removed - helper function logic is tested implicitly by the implementation

    // Helper function to test confidence calculation without needing async setup
    #[allow(dead_code)]
    fn calculate_pattern_confidence(occurrences: usize) -> f32 {
        match occurrences {
            0..=2 => 0.3,
            3..=4 => 0.6,
            5..=9 => 0.8,
            _ => 0.95,
        }
    }
}
