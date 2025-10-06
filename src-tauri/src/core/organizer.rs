use crate::{ai::OrganizationSuggestion, core::SmartFolderManager, error::Result};
use std::sync::Arc;

pub struct Organizer {
    smart_folders: Arc<SmartFolderManager>,
}

impl Organizer {
    pub fn new(smart_folders: Arc<SmartFolderManager>) -> Self {
        Self { smart_folders }
    }

    pub async fn organize_files(&self, files: Vec<String>) -> Result<Vec<OrganizationSuggestion>> {
        let mut suggestions = Vec::new();

        // Get all smart folders
        let folders = self.smart_folders.get_all().await?;

        for file in files {
            // Check if file matches any smart folder rules
            for folder in &folders {
                if self.matches_folder_rules(&file, &folder.rules).await {
                    suggestions.push(OrganizationSuggestion {
                        source_path: file.clone(),
                        target_folder: folder.path.clone(),
                        reason: format!("Matches smart folder '{}'", folder.name),
                        confidence: 0.9,
                    });
                    break;
                }
            }
        }

        Ok(suggestions)
    }

    async fn matches_folder_rules(
        &self,
        file: &str,
        rules: &[crate::commands::organization::OrganizationRule],
    ) -> bool {
        // Use SmartFolderManager to check rules with AND combination
        self.smart_folders.matches_rules(file, rules, "AND").await
    }
}
