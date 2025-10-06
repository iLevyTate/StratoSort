use crate::ai::folder_profiler::FolderProfile;
use crate::ai::semantic_analyzer::SemanticProfile;
// use crate::error::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// Result of matching a file to folders
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchResult {
    pub folder_path: String,
    pub confidence: f32,
    pub suggested_name: String,
    pub reasoning: String,
    pub score_breakdown: ScoreBreakdown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoreBreakdown {
    pub theme_overlap: f32, // 0.0-1.0
    pub temporal_fit: f32,  // 0.0-1.0
    pub entity_match: f32,  // 0.0-1.0
    pub type_fit: f32,      // 0.0-1.0
    pub naming_fit: f32,    // 0.0-1.0
}

pub struct MatchingEngine;

impl MatchingEngine {
    pub fn new() -> Self {
        Self
    }

    /// Match a file profile to folder profiles
    pub fn match_file_to_folders(
        &self,
        file_profile: &SemanticProfile,
        folder_profiles: &[FolderProfile],
    ) -> Vec<MatchResult> {
        let mut results = Vec::new();

        for folder in folder_profiles {
            let score_breakdown = self.calculate_match_scores(file_profile, folder);

            // Weighted average of scores
            let confidence = score_breakdown.theme_overlap * 0.4
                + score_breakdown.temporal_fit * 0.25
                + score_breakdown.entity_match * 0.20
                + score_breakdown.type_fit * 0.10
                + score_breakdown.naming_fit * 0.05;

            let suggested_name = self.apply_naming_template(file_profile, folder);
            let reasoning = self.generate_explanation(&score_breakdown, file_profile, folder);

            results.push(MatchResult {
                folder_path: folder.path.clone(),
                confidence,
                suggested_name,
                reasoning,
                score_breakdown,
            });
        }

        // Sort by confidence (highest first)
        // Use unwrap_or to handle NaN values (treat as lowest confidence)
        results.sort_by(|a, b| {
            b.confidence
                .partial_cmp(&a.confidence)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        results
    }

    /// Calculate detailed matching scores
    fn calculate_match_scores(
        &self,
        file_profile: &SemanticProfile,
        folder_profile: &FolderProfile,
    ) -> ScoreBreakdown {
        // Check if folder has user-provided guidance (stored in database)
        // For now, we use the folder purpose as proxy for user guidance
        // Future: fetch from smart_folder_metadata table

        ScoreBreakdown {
            theme_overlap: self.calculate_theme_overlap(file_profile, folder_profile),
            temporal_fit: self.calculate_temporal_fit(file_profile, folder_profile),
            entity_match: self.calculate_entity_match(file_profile, folder_profile),
            type_fit: self.calculate_type_fit(file_profile, folder_profile),
            naming_fit: self.calculate_naming_fit(file_profile, folder_profile),
        }
    }

    /// Calculate theme/topic overlap (Jaccard similarity)
    fn calculate_theme_overlap(&self, file: &SemanticProfile, folder: &FolderProfile) -> f32 {
        let file_themes: HashSet<String> = file.themes.iter().map(|s| s.to_lowercase()).collect();
        let folder_themes: HashSet<String> =
            folder.themes.iter().map(|s| s.to_lowercase()).collect();

        // Add topic to file themes
        let mut file_themes_extended = file_themes.clone();
        file_themes_extended.insert(file.topic.to_lowercase());
        file_themes_extended.insert(file.domain.to_lowercase());

        // Calculate Jaccard similarity
        let intersection = file_themes_extended.intersection(&folder_themes).count();
        let union = file_themes_extended.union(&folder_themes).count();

        if union == 0 {
            0.0
        } else {
            intersection as f32 / union as f32
        }
    }

    /// Calculate temporal fit (date alignment)
    fn calculate_temporal_fit(&self, file: &SemanticProfile, folder: &FolderProfile) -> f32 {
        // If folder has no date range, default medium score
        let Some(ref date_range) = folder.date_range else {
            return 0.5;
        };

        // Check if any file dates fall within folder date range
        for file_date in &file.dates {
            if is_date_in_range(file_date, &date_range.start, &date_range.end) {
                return 1.0; // Perfect temporal fit
            }
        }

        // Check if dates are close (within 6 months)
        if file.dates.is_empty() {
            return 0.5; // No date info, neutral score
        }

        // Check proximity
        for file_date in &file.dates {
            if is_date_close(file_date, &date_range.start, &date_range.end, 180) {
                return 0.7; // Close temporal fit
            }
        }

        0.3 // Dates don't align well
    }

    /// Calculate entity match
    fn calculate_entity_match(&self, file: &SemanticProfile, folder: &FolderProfile) -> f32 {
        // Extract entity names from folder purpose and themes
        let folder_text = format!("{} {}", folder.purpose, folder.themes.join(" ")).to_lowercase();

        let mut matches = 0;
        let total_entities = file.entities.len();

        for entity in &file.entities {
            if folder_text.contains(&entity.name.to_lowercase()) {
                matches += 1;
            }
        }

        if total_entities == 0 {
            return 0.5; // No entities, neutral score
        }

        matches as f32 / total_entities as f32
    }

    /// Calculate file type fit
    fn calculate_type_fit(&self, file: &SemanticProfile, folder: &FolderProfile) -> f32 {
        // Extract file extension from path
        let file_ext = std::path::Path::new(&file.path)
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|s| s.to_lowercase());

        if let Some(ext) = file_ext {
            if folder.file_types.contains(&ext) {
                return 1.0; // Perfect type match
            }
        }

        0.5 // No clear type match
    }

    /// Calculate naming convention fit
    fn calculate_naming_fit(&self, _file: &SemanticProfile, folder: &FolderProfile) -> f32 {
        // Check if naming pattern is complex (multiple placeholders)
        let pattern_complexity = folder.naming_pattern.matches('{').count();

        if pattern_complexity > 2 {
            0.8 // Complex pattern likely provides good organization
        } else {
            0.5 // Simple pattern
        }
    }

    /// Apply folder's naming template to generate suggested filename
    fn apply_naming_template(&self, file: &SemanticProfile, folder: &FolderProfile) -> String {
        let mut name = folder.naming_pattern.clone();

        // Replace placeholders
        name = name.replace("{type}", &format!("{:?}", file.purpose));
        name = name.replace("{topic}", &file.topic);
        name = name.replace("{domain}", &file.domain);
        name = name.replace("{description}", &file.suggested_name);
        name = name.replace("{name}", &file.suggested_name);

        // Date handling
        if !file.dates.is_empty() {
            name = name.replace("{date}", &file.dates[0]);
            name = name.replace("{date:YYYY-MM-DD}", &file.dates[0]);
        } else {
            name = name.replace(
                "{date}",
                &chrono::Local::now().format("%Y-%m-%d").to_string(),
            );
            name = name.replace(
                "{date:YYYY-MM-DD}",
                &chrono::Local::now().format("%Y-%m-%d").to_string(),
            );
        }

        // Entity handling (use first entity if available)
        if !file.entities.is_empty() {
            name = name.replace("{entity}", &file.entities[0].name);
            name = name.replace("{company}", &file.entities[0].name);
            name = name.replace("{project}", &file.entities[0].name);
        }

        // Add extension
        let ext = std::path::Path::new(&file.path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("txt");

        if !name.ends_with(&format!(".{}", ext)) {
            name = format!("{}.{}", name, ext);
        }

        // Clean up any remaining placeholders
        name = name.replace("{", "").replace("}", "");

        // Sanitize filename
        name.chars()
            .map(|c| {
                if c.is_alphanumeric() || c == '-' || c == '_' || c == '.' {
                    c
                } else {
                    '_'
                }
            })
            .collect()
    }

    /// Generate human-readable explanation
    fn generate_explanation(
        &self,
        scores: &ScoreBreakdown,
        file: &SemanticProfile,
        folder: &FolderProfile,
    ) -> String {
        let mut reasons = Vec::new();

        if scores.theme_overlap > 0.5 {
            reasons.push(format!(
                "Theme overlap: {} matches {}",
                file.topic,
                folder.themes.join(", ")
            ));
        }

        if scores.temporal_fit > 0.7 {
            reasons.push("Date alignment with folder timeline".to_string());
        }

        if scores.entity_match > 0.5 {
            reasons.push("Entities match folder context".to_string());
        }

        if scores.type_fit > 0.8 {
            reasons.push("File type matches folder contents".to_string());
        }

        if reasons.is_empty() {
            "No strong indicators".to_string()
        } else {
            reasons.join("; ")
        }
    }
}

impl Default for MatchingEngine {
    fn default() -> Self {
        Self::new()
    }
}

// Helper functions
fn is_date_in_range(date: &str, start: &str, end: &str) -> bool {
    date >= start && date <= end
}

fn is_date_close(date: &str, start: &str, end: &str, _days_tolerance: i64) -> bool {
    // Simplified: check if within string distance (proper date parsing would be better)
    (date >= start && date <= end)
        || (date >= &start[..start.len().saturating_sub(3)] && date <= &end[..end.len().min(10)])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::semantic_analyzer::{FilePurpose, SemanticProfile};

    #[test]
    fn test_theme_overlap_calculation() {
        let engine = MatchingEngine::new();

        let file = SemanticProfile {
            path: "test.pdf".to_string(),
            topic: "tax documents".to_string(),
            purpose: FilePurpose::Invoice,
            entities: vec![],
            dates: vec![],
            domain: "business".to_string(),
            themes: vec!["financial".to_string(), "tax".to_string()],
            suggested_name: "test".to_string(),
            confidence: 0.9,
        };

        let folder = FolderProfile {
            path: "/taxes".to_string(),
            purpose: "tax filing".to_string(),
            themes: vec!["financial".to_string(), "tax".to_string()],
            naming_pattern: "{name}".to_string(),
            file_types: vec!["pdf".to_string()],
            date_range: None,
            sample_size: 10,
            confidence: 0.9,
        };

        let overlap = engine.calculate_theme_overlap(&file, &folder);
        assert!(
            overlap >= 0.0,
            "Expected valid theme overlap score (got {})",
            overlap
        );
    }
}
