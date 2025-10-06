use crate::{config::Config, error::Result, storage::Database};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::sync::Arc;
use tokio::fs;
use uuid::Uuid;

/// Represents a quarantined file
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuarantinedFile {
    pub id: String,
    pub file_path: String,
    pub original_path: String,
    pub reason: Option<String>,
    pub quarantine_until: i64,
    pub created_at: i64,
}

/// Manager for quarantined files (recently moved files)
pub struct QuarantineManager {
    database: Arc<Database>,
    config: Arc<parking_lot::RwLock<Config>>,
}

impl QuarantineManager {
    pub fn new(database: Arc<Database>, config: Arc<parking_lot::RwLock<Config>>) -> Self {
        Self { database, config }
    }

    /// Quarantine a file for a specified number of days
    pub async fn quarantine_file(
        &self,
        file_path: &str,
        original_path: &str,
        reason: Option<&str>,
        days: Option<u32>,
    ) -> Result<String> {
        let quarantine_days = if let Some(days) = days {
            days
        } else {
            let config = self.config.read();
            config.recents_quarantine_days
        }; // Lock is automatically released here

        let quarantine_until = Utc::now().timestamp() + (quarantine_days as i64 * 24 * 60 * 60);

        let id = Uuid::new_v4().to_string();

        sqlx::query(
            r#"
            INSERT INTO quarantined_files
            (id, file_path, original_path, reason, quarantine_until, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&id)
        .bind(file_path)
        .bind(original_path)
        .bind(reason)
        .bind(quarantine_until)
        .bind(Utc::now().timestamp())
        .execute(self.database.pool())
        .await?;

        Ok(id)
    }

    /// Check if a file is currently quarantined
    pub async fn is_file_quarantined(&self, file_path: &str) -> Result<bool> {
        let current_timestamp = Utc::now().timestamp();

        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM quarantined_files WHERE file_path = ? AND quarantine_until > ?",
        )
        .bind(file_path)
        .bind(current_timestamp)
        .fetch_one(self.database.pool())
        .await?;

        Ok(count > 0)
    }

    /// Get quarantine info for a file
    pub async fn get_quarantine_info(&self, file_path: &str) -> Result<Option<QuarantinedFile>> {
        let current_timestamp = Utc::now().timestamp();

        let row = sqlx::query(
            "SELECT id, file_path, original_path, reason, quarantine_until, created_at FROM quarantined_files WHERE file_path = ? AND quarantine_until > ?"
        )
        .bind(file_path)
        .bind(current_timestamp)
        .fetch_optional(self.database.pool())
        .await?;

        if let Some(row) = row {
            Ok(Some(QuarantinedFile {
                id: row.get("id"),
                file_path: row.get("file_path"),
                original_path: row.get("original_path"),
                reason: row.get("reason"),
                quarantine_until: row.get("quarantine_until"),
                created_at: row.get("created_at"),
            }))
        } else {
            Ok(None)
        }
    }

    /// Release a file from quarantine
    pub async fn release_from_quarantine(&self, file_path: &str) -> Result<()> {
        sqlx::query("DELETE FROM quarantined_files WHERE file_path = ?")
            .bind(file_path)
            .execute(self.database.pool())
            .await?;

        Ok(())
    }

    /// Release all expired quarantines
    pub async fn release_expired_quarantines(&self) -> Result<usize> {
        let current_timestamp = Utc::now().timestamp();

        let deleted: usize =
            sqlx::query("DELETE FROM quarantined_files WHERE quarantine_until <= ?")
                .bind(current_timestamp)
                .execute(self.database.pool())
                .await?
                .rows_affected() as usize;

        Ok(deleted)
    }

    /// Get all currently quarantined files
    pub async fn get_quarantined_files(&self) -> Result<Vec<QuarantinedFile>> {
        let current_timestamp = Utc::now().timestamp();

        let rows = sqlx::query(
            "SELECT id, file_path, original_path, reason, quarantine_until, created_at FROM quarantined_files WHERE quarantine_until > ? ORDER BY created_at DESC"
        )
        .bind(current_timestamp)
        .fetch_all(self.database.pool())
        .await?;

        let files = rows
            .into_iter()
            .map(|row| QuarantinedFile {
                id: row.get("id"),
                file_path: row.get("file_path"),
                original_path: row.get("original_path"),
                reason: row.get("reason"),
                quarantine_until: row.get("quarantine_until"),
                created_at: row.get("created_at"),
            })
            .collect();

        Ok(files)
    }

    /// Auto-quarantine a file after it's moved (based on config)
    pub async fn auto_quarantine_moved_file(
        &self,
        file_path: &str,
        original_path: &str,
    ) -> Result<Option<String>> {
        // Check if auto-quarantine is enabled
        let quarantine_days = {
            let config = self.config.read();
            config.recents_quarantine_days
        }; // Lock is automatically released here

        if quarantine_days == 0 {
            return Ok(None); // Quarantine disabled
        }

        // Check if file is already quarantined
        let is_quarantined = self.is_file_quarantined(file_path).await?;
        if is_quarantined {
            return Ok(None); // Already quarantined
        }

        // Quarantine the file
        let quarantine_id = self
            .quarantine_file(
                file_path,
                original_path,
                Some("Recently moved file - under quarantine period"),
                Some(quarantine_days),
            )
            .await?;

        Ok(Some(quarantine_id))
    }

    /// Check if a file should be processed (not quarantined and file exists)
    pub async fn should_process_file(&self, file_path: &str) -> Result<bool> {
        // Check if file exists
        if fs::metadata(file_path).await.is_err() {
            return Ok(false);
        }

        // Check if file is quarantined
        if self.is_file_quarantined(file_path).await? {
            return Ok(false);
        }

        Ok(true)
    }

    /// Clean up old quarantine records (older than specified days)
    pub async fn cleanup_old_quarantines(&self, days_old: i64) -> Result<usize> {
        let cutoff_timestamp = Utc::now().timestamp() - (days_old * 24 * 60 * 60);

        let deleted: usize = sqlx::query("DELETE FROM quarantined_files WHERE created_at < ?")
            .bind(cutoff_timestamp)
            .execute(self.database.pool())
            .await?
            .rows_affected() as usize;

        Ok(deleted)
    }

    /// Get quarantine statistics
    pub async fn get_quarantine_stats(&self) -> Result<QuarantineStats> {
        let current_timestamp = Utc::now().timestamp();

        let total_quarantined: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM quarantined_files WHERE quarantine_until > ?")
                .bind(current_timestamp)
                .fetch_one(self.database.pool())
                .await?;

        let expired_quarantined: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM quarantined_files WHERE quarantine_until <= ?",
        )
        .bind(current_timestamp)
        .fetch_one(self.database.pool())
        .await?;

        Ok(QuarantineStats {
            total_quarantined: total_quarantined as usize,
            expired_quarantined: expired_quarantined as usize,
        })
    }
}

/// Statistics about quarantined files
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuarantineStats {
    pub total_quarantined: usize,
    pub expired_quarantined: usize,
}
