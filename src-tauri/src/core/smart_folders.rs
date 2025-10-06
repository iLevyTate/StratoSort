use crate::{commands::organization::OrganizationRule, error::Result, storage::Database};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::sync::Arc;

/// Protected folder configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProtectedFolder {
    pub id: String,
    pub path: String,
    pub reason: Option<String>,
    pub created_at: i64,
    pub updated_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SmartFolder {
    pub id: String,
    pub name: String,
    pub path: String,
    pub rules: Vec<OrganizationRule>,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

pub struct SmartFolderManager {
    database: Arc<Database>,
}

impl SmartFolderManager {
    pub fn new(database: Arc<Database>) -> Self {
        Self { database }
    }

    pub async fn create(&self, folder: SmartFolder) -> Result<()> {
        // Save to database
        let rules_json = serde_json::to_string(&folder.rules)?;

        sqlx::query(
            r#"
            INSERT INTO smart_folders 
            (id, name, path, rules, icon, color, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&folder.id)
        .bind(&folder.name)
        .bind(&folder.path)
        .bind(&rules_json)
        .bind(&folder.icon)
        .bind(&folder.color)
        .bind(folder.created_at)
        .bind(folder.updated_at)
        .execute(self.database.pool())
        .await?;

        Ok(())
    }

    pub async fn get(&self, id: &str) -> Result<Option<SmartFolder>> {
        let row = sqlx::query(
            r#"
            SELECT * FROM smart_folders WHERE id = ?
            "#,
        )
        .bind(id)
        .fetch_optional(self.database.pool())
        .await?;

        if let Some(row) = row {
            let rules: Vec<OrganizationRule> = serde_json::from_str(row.get("rules"))?;

            Ok(Some(SmartFolder {
                id: row.get("id"),
                name: row.get("name"),
                path: row.get("path"),
                rules,
                icon: row.get("icon"),
                color: row.get("color"),
                created_at: row.get("created_at"),
                updated_at: row.get("updated_at"),
            }))
        } else {
            Ok(None)
        }
    }

    pub async fn get_all(&self) -> Result<Vec<SmartFolder>> {
        let rows = sqlx::query(
            r#"
            SELECT * FROM smart_folders ORDER BY name
            "#,
        )
        .fetch_all(self.database.pool())
        .await?;

        let mut folders = Vec::new();
        for row in rows {
            let rules: Vec<OrganizationRule> = serde_json::from_str(row.get("rules"))?;

            folders.push(SmartFolder {
                id: row.get("id"),
                name: row.get("name"),
                path: row.get("path"),
                rules,
                icon: row.get("icon"),
                color: row.get("color"),
                created_at: row.get("created_at"),
                updated_at: row.get("updated_at"),
            });
        }

        Ok(folders)
    }

    pub async fn update(&self, folder: SmartFolder) -> Result<()> {
        let rules_json = serde_json::to_string(&folder.rules)?;

        sqlx::query(
            r#"
            UPDATE smart_folders 
            SET name = ?, path = ?, rules = ?, icon = ?, color = ?, updated_at = ?
            WHERE id = ?
            "#,
        )
        .bind(&folder.name)
        .bind(&folder.path)
        .bind(&rules_json)
        .bind(&folder.icon)
        .bind(&folder.color)
        .bind(folder.updated_at)
        .bind(&folder.id)
        .execute(self.database.pool())
        .await?;

        Ok(())
    }

    pub async fn delete(&self, id: &str) -> Result<()> {
        sqlx::query("DELETE FROM smart_folders WHERE id = ?")
            .bind(id)
            .execute(self.database.pool())
            .await?;

        Ok(())
    }

    pub async fn save_all(&self) -> Result<()> {
        // Flush any pending changes
        self.database.flush().await?;
        Ok(())
    }

    /// Find smart folders that match the given file path
    pub async fn find_matching_folders(&self, file_path: &str) -> Result<Vec<SmartFolder>> {
        let folders = self.get_all().await?;
        let mut matching_folders = Vec::new();

        for folder in folders {
            // Default to AND combination for rules
            if self.matches_rules(file_path, &folder.rules, "AND").await {
                matching_folders.push(folder);
            }
        }

        Ok(matching_folders)
    }

    /// Check if a file matches the rules of a smart folder
    pub async fn matches_rules(
        &self,
        file_path: &str,
        rules: &[OrganizationRule],
        combine_with: &str,
    ) -> bool {
        use crate::commands::organization::RuleType;

        // Early return if no rules
        if rules.is_empty() {
            return false;
        }

        // Get file metadata once for all rules that need it
        let metadata = std::fs::metadata(file_path).ok();

        let path = std::path::Path::new(file_path);
        let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");

        let mut rule_results = Vec::new();

        for rule in rules {
            if !rule.enabled {
                continue;
            }

            let field_value = match &rule.rule_type {
                RuleType::FileExtension => path
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("")
                    .to_string(),
                RuleType::FileName => file_name.to_string(),
                RuleType::FileContent => {
                    // Read first 10KB of file for content matching
                    self.read_file_preview(file_path, 10240)
                        .await
                        .unwrap_or_default()
                }
                RuleType::FileSize => metadata
                    .as_ref()
                    .map(|m| m.len().to_string())
                    .unwrap_or_default(),
                RuleType::CreationDate => metadata
                    .as_ref()
                    .and_then(|m| m.created().ok())
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs().to_string())
                    .unwrap_or_default(),
                RuleType::ModificationDate => metadata
                    .as_ref()
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs().to_string())
                    .unwrap_or_default(),
                RuleType::MimeType => mime_guess::from_path(path)
                    .first_or_octet_stream()
                    .to_string(),
                RuleType::Path => file_path.to_string(),
            };

            let matches = self.evaluate_condition(&rule.condition, &field_value, &rule.rule_type);
            rule_results.push(matches);
        }

        // Combine results based on combine_with parameter (AND/OR)
        if rule_results.is_empty() {
            return false;
        }

        match combine_with {
            "OR" => rule_results.iter().any(|&r| r),
            "AND" => rule_results.iter().all(|&r| r),
            _ => rule_results.iter().all(|&r| r), // Default to AND logic
        }
    }

    /// Evaluate a condition against a value
    fn evaluate_condition(
        &self,
        condition: &crate::commands::organization::RuleCondition,
        value: &str,
        rule_type: &crate::commands::organization::RuleType,
    ) -> bool {
        use crate::commands::organization::{ConditionOperator, RuleType};

        match condition.operator {
            ConditionOperator::Equals => value.eq_ignore_ascii_case(&condition.value),
            ConditionOperator::Contains => value
                .to_lowercase()
                .contains(&condition.value.to_lowercase()),
            ConditionOperator::StartsWith => value
                .to_lowercase()
                .starts_with(&condition.value.to_lowercase()),
            ConditionOperator::EndsWith => value
                .to_lowercase()
                .ends_with(&condition.value.to_lowercase()),
            ConditionOperator::GreaterThan => {
                // Handle numeric comparisons for size and dates
                match rule_type {
                    RuleType::FileSize | RuleType::CreationDate | RuleType::ModificationDate => {
                        match (value.parse::<u64>(), condition.value.parse::<u64>()) {
                            (Ok(val), Ok(cond)) => val > cond,
                            _ => false,
                        }
                    }
                    _ => false,
                }
            }
            ConditionOperator::LessThan => {
                // Handle numeric comparisons for size and dates
                match rule_type {
                    RuleType::FileSize | RuleType::CreationDate | RuleType::ModificationDate => {
                        match (value.parse::<u64>(), condition.value.parse::<u64>()) {
                            (Ok(val), Ok(cond)) => val < cond,
                            _ => false,
                        }
                    }
                    _ => false,
                }
            }
            ConditionOperator::Regex => {
                // Compile and cache regex for performance
                match regex::Regex::new(&condition.value) {
                    Ok(re) => re.is_match(value),
                    Err(_) => false,
                }
            }
        }
    }

    /// Read a preview of file content for content-based rules
    async fn read_file_preview(&self, file_path: &str, max_bytes: usize) -> Result<String> {
        use tokio::io::AsyncReadExt;

        let mut file = tokio::fs::File::open(file_path).await?;
        let mut buffer = vec![0u8; max_bytes];
        let bytes_read = file.read(&mut buffer).await?;
        buffer.truncate(bytes_read);

        Ok(String::from_utf8_lossy(&buffer).to_string())
    }

    /// Search for smart folders by name or path
    pub async fn search(&self, query: &str) -> Result<Vec<SmartFolder>> {
        let query_lower = query.to_lowercase();
        let folders = self.get_all().await?;

        let mut matching_folders = Vec::new();
        for folder in folders {
            if folder.name.to_lowercase().contains(&query_lower)
                || folder.path.to_lowercase().contains(&query_lower)
            {
                matching_folders.push(folder);
            }
        }

        Ok(matching_folders)
    }

    /// Get folders by color
    pub async fn get_by_color(&self, color: &str) -> Result<Vec<SmartFolder>> {
        let rows = sqlx::query(
            r#"
            SELECT * FROM smart_folders WHERE color = ? ORDER BY name
            "#,
        )
        .bind(color)
        .fetch_all(self.database.pool())
        .await?;

        let mut folders = Vec::new();
        for row in rows {
            let rules: Vec<OrganizationRule> = serde_json::from_str(row.get("rules"))?;

            folders.push(SmartFolder {
                id: row.get("id"),
                name: row.get("name"),
                path: row.get("path"),
                rules,
                icon: row.get("icon"),
                color: row.get("color"),
                created_at: row.get("created_at"),
                updated_at: row.get("updated_at"),
            });
        }

        Ok(folders)
    }

    /// Get recently created folders
    pub async fn get_recent(&self, limit: i32) -> Result<Vec<SmartFolder>> {
        let rows = sqlx::query(
            r#"
            SELECT * FROM smart_folders 
            ORDER BY created_at DESC 
            LIMIT ?
            "#,
        )
        .bind(limit)
        .fetch_all(self.database.pool())
        .await?;

        let mut folders = Vec::new();
        for row in rows {
            let rules: Vec<OrganizationRule> = serde_json::from_str(row.get("rules"))?;

            folders.push(SmartFolder {
                id: row.get("id"),
                name: row.get("name"),
                path: row.get("path"),
                rules,
                icon: row.get("icon"),
                color: row.get("color"),
                created_at: row.get("created_at"),
                updated_at: row.get("updated_at"),
            });
        }

        Ok(folders)
    }
}

/// Manager for protected folders
pub struct ProtectedFolderManager {
    database: Arc<Database>,
}

impl ProtectedFolderManager {
    pub fn new(database: Arc<Database>) -> Self {
        Self { database }
    }

    /// Create a new protected folder
    pub async fn create(&self, folder: ProtectedFolder) -> Result<()> {
        sqlx::query(
            r#"
            INSERT INTO protected_folders
            (id, path, reason, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            "#,
        )
        .bind(&folder.id)
        .bind(&folder.path)
        .bind(&folder.reason)
        .bind(folder.created_at)
        .bind(folder.updated_at)
        .execute(self.database.pool())
        .await?;

        Ok(())
    }

    /// Get all protected folders
    pub async fn list(&self) -> Result<Vec<ProtectedFolder>> {
        let rows = sqlx::query(
            r#"
            SELECT id, path, reason, created_at, updated_at
            FROM protected_folders
            ORDER BY path
            "#,
        )
        .fetch_all(self.database.pool())
        .await?;

        let folders = rows
            .into_iter()
            .map(|row| ProtectedFolder {
                id: row.get("id"),
                path: row.get("path"),
                reason: row.get("reason"),
                created_at: row.get("created_at"),
                updated_at: row.get("updated_at"),
            })
            .collect();

        Ok(folders)
    }

    /// Check if a path is protected
    pub async fn is_path_protected(&self, path: &str) -> Result<bool> {
        let protected_folders = self.list().await?;

        for folder in protected_folders {
            if path.starts_with(&folder.path) {
                return Ok(true);
            }
        }

        Ok(false)
    }

    /// Delete a protected folder
    pub async fn delete(&self, id: &str) -> Result<()> {
        sqlx::query("DELETE FROM protected_folders WHERE id = ?")
            .bind(id)
            .execute(self.database.pool())
            .await?;

        Ok(())
    }

    /// Update a protected folder
    pub async fn update(&self, folder: ProtectedFolder) -> Result<()> {
        sqlx::query(
            r#"
            UPDATE protected_folders
            SET path = ?, reason = ?, updated_at = ?
            WHERE id = ?
            "#,
        )
        .bind(&folder.path)
        .bind(&folder.reason)
        .bind(folder.updated_at)
        .bind(&folder.id)
        .execute(self.database.pool())
        .await?;

        Ok(())
    }
}
