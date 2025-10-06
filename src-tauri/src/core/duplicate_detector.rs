use crate::{
    error::{AppError, Result},
    storage::Database,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::Row;
use std::fs::File;
use std::io::{BufReader, Read};
use std::path::Path;
use std::sync::Arc;
use tokio::fs;
use uuid::Uuid;

/// Represents a file with its hash for duplicate detection
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileDuplicate {
    pub id: String,
    pub hash: String,
    pub size: i64,
    pub created_at: i64,
}

/// Represents a group of duplicate files
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateGroup {
    pub id: String,
    pub master_file_id: String,
    pub created_at: i64,
}

/// Represents a file that is a member of a duplicate group
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateGroupMember {
    pub id: String,
    pub group_id: String,
    pub file_id: String,
    pub file_path: String,
    pub added_at: i64,
}

/// Manager for duplicate file detection and management
pub struct DuplicateDetectorManager {
    database: Arc<Database>,
}

impl DuplicateDetectorManager {
    pub fn new(database: Arc<Database>) -> Self {
        Self { database }
    }

    /// Calculate SHA-256 hash of a file
    pub async fn calculate_file_hash<P: AsRef<Path>>(path: P) -> Result<String> {
        let path = path.as_ref();

        // Check if file exists and get its size
        let metadata = fs::metadata(path).await?;
        let file_size = metadata.len();

        // For very large files, we might want to hash only parts
        // For now, we'll hash the entire file
        if file_size > 100 * 1024 * 1024 {
            // 100MB limit
            return Err(AppError::InvalidInput {
                message: "File too large for duplicate detection (max 100MB)".to_string(),
            });
        }

        // Open file and calculate hash
        let file = File::open(path)?;
        let mut reader = BufReader::new(file);
        let mut hasher = Sha256::new();
        let mut buffer = [0; 8192]; // 8KB buffer

        loop {
            let bytes_read = reader.read(&mut buffer)?;
            if bytes_read == 0 {
                break;
            }
            hasher.update(&buffer[..bytes_read]);
        }

        let hash_result = hasher.finalize();
        Ok(format!("{:x}", hash_result))
    }

    /// Check if a file hash already exists in the database
    pub async fn hash_exists(&self, hash: &str, size: i64) -> Result<bool> {
        let count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM file_duplicates WHERE hash = ? AND size = ?")
                .bind(hash)
                .bind(size)
                .fetch_one(self.database.pool())
                .await?;

        Ok(count > 0)
    }

    /// Store a file hash in the database
    pub async fn store_file_hash(&self, hash: &str, size: i64) -> Result<String> {
        let id = Uuid::new_v4().to_string();

        sqlx::query("INSERT INTO file_duplicates (id, hash, size, created_at) VALUES (?, ?, ?, ?)")
            .bind(&id)
            .bind(hash)
            .bind(size)
            .bind(Utc::now().timestamp())
            .execute(self.database.pool())
            .await?;

        Ok(id)
    }

    /// Find or create duplicate group for a hash
    pub async fn find_or_create_duplicate_group(&self, hash: &str, size: i64) -> Result<String> {
        // Check if this hash+size combination already exists
        if let Ok(file_id) = self.get_file_id_by_hash_and_size(hash, size).await {
            // Check if this file is already in a group
            if let Ok(group_id) = self.get_group_for_file(&file_id).await {
                return Ok(group_id);
            }

            // Create new group with this file as master
            let group_id = Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO duplicate_groups (id, master_file_id, created_at) VALUES (?, ?, ?)",
            )
            .bind(&group_id)
            .bind(&file_id)
            .bind(Utc::now().timestamp())
            .execute(self.database.pool())
            .await?;

            return Ok(group_id);
        }

        // This is a new hash, store it and create group
        let file_id = self.store_file_hash(hash, size).await?;

        let group_id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO duplicate_groups (id, master_file_id, created_at) VALUES (?, ?, ?)",
        )
        .bind(&group_id)
        .bind(&file_id)
        .bind(Utc::now().timestamp())
        .execute(self.database.pool())
        .await?;

        Ok(group_id)
    }

    /// Get file ID by hash and size
    pub async fn get_file_id_by_hash_and_size(&self, hash: &str, size: i64) -> Result<String> {
        let id: String =
            sqlx::query_scalar("SELECT id FROM file_duplicates WHERE hash = ? AND size = ?")
                .bind(hash)
                .bind(size)
                .fetch_one(self.database.pool())
                .await?;

        Ok(id)
    }

    /// Get duplicate group for a file
    pub async fn get_group_for_file(&self, file_id: &str) -> Result<String> {
        let group_id: String = sqlx::query_scalar(
            "SELECT dg.id FROM duplicate_groups dg JOIN duplicate_group_members dgm ON dg.id = dgm.group_id WHERE dgm.file_id = ?"
        )
        .bind(file_id)
        .fetch_one(self.database.pool())
        .await?;

        Ok(group_id)
    }

    /// Add file to duplicate group
    pub async fn add_file_to_group(
        &self,
        group_id: &str,
        file_id: &str,
        file_path: &str,
    ) -> Result<()> {
        let member_id = Uuid::new_v4().to_string();

        sqlx::query(
            "INSERT INTO duplicate_group_members (id, group_id, file_id, file_path, added_at) VALUES (?, ?, ?, ?, ?)"
        )
        .bind(&member_id)
        .bind(group_id)
        .bind(file_id)
        .bind(file_path)
        .bind(Utc::now().timestamp())
        .execute(self.database.pool())
        .await?;

        Ok(())
    }

    /// Get all duplicate groups
    pub async fn get_duplicate_groups(
        &self,
    ) -> Result<Vec<(DuplicateGroup, Vec<DuplicateGroupMember>)>> {
        let group_rows = sqlx::query(
            "SELECT id, master_file_id, created_at FROM duplicate_groups ORDER BY created_at DESC",
        )
        .fetch_all(self.database.pool())
        .await?;

        let mut result = Vec::new();

        for group_row in group_rows {
            let group = DuplicateGroup {
                id: group_row.get("id"),
                master_file_id: group_row.get("master_file_id"),
                created_at: group_row.get("created_at"),
            };

            let member_rows = sqlx::query(
                "SELECT id, group_id, file_id, file_path, added_at FROM duplicate_group_members WHERE group_id = ? ORDER BY added_at"
            )
            .bind(&group.id)
            .fetch_all(self.database.pool())
            .await?;

            let members: Vec<DuplicateGroupMember> = member_rows
                .into_iter()
                .map(|row| DuplicateGroupMember {
                    id: row.get("id"),
                    group_id: row.get("group_id"),
                    file_id: row.get("file_id"),
                    file_path: row.get("file_path"),
                    added_at: row.get("added_at"),
                })
                .collect();

            result.push((group, members));
        }

        Ok(result)
    }

    /// Process a file for duplicate detection
    pub async fn process_file_for_duplicates<P: AsRef<Path>>(
        &self,
        path: P,
    ) -> Result<Option<String>> {
        let path = path.as_ref();

        // Skip directories
        if path.is_dir() {
            return Ok(None);
        }

        // Calculate file hash
        let hash = Self::calculate_file_hash(path).await?;
        let metadata = fs::metadata(path).await?;
        let size = metadata.len();

        // Check if this hash+size combination already exists
        if self.hash_exists(&hash, size as i64).await? {
            // File already exists, add to existing group or create new group
            let group_id = self
                .find_or_create_duplicate_group(&hash, size as i64)
                .await?;
            let file_id = self
                .get_file_id_by_hash_and_size(&hash, size as i64)
                .await?;
            self.add_file_to_group(&group_id, &file_id, &path.to_string_lossy())
                .await?;

            Ok(Some(group_id))
        } else {
            // New file, store hash and create group
            let group_id = self
                .find_or_create_duplicate_group(&hash, size as i64)
                .await?;

            Ok(Some(group_id))
        }
    }

    /// Get duplicates for a specific file
    pub async fn get_duplicates_for_file(&self, file_path: &str) -> Result<Vec<String>> {
        // Calculate hash for the file
        let hash = Self::calculate_file_hash(file_path).await?;
        let metadata = fs::metadata(file_path).await?;
        let size = metadata.len();

        // Find the group for this hash+size
        if let Ok(file_id) = self.get_file_id_by_hash_and_size(&hash, size as i64).await {
            if let Ok(group_id) = self.get_group_for_file(&file_id).await {
                let members: Vec<String> = sqlx::query_scalar(
                    "SELECT file_path FROM duplicate_group_members WHERE group_id = ? AND file_path != ?"
                )
                .bind(&group_id)
                .bind(file_path)
                .fetch_all(self.database.pool())
                .await?;

                return Ok(members);
            }
        }

        Ok(Vec::new())
    }

    /// Clean up old duplicate records (older than specified days)
    pub async fn cleanup_old_duplicates(&self, days_old: i64) -> Result<usize> {
        let cutoff_timestamp = Utc::now().timestamp() - (days_old * 24 * 60 * 60);

        // Delete old duplicate group members
        let members_deleted: usize =
            sqlx::query("DELETE FROM duplicate_group_members WHERE added_at < ?")
                .bind(cutoff_timestamp)
                .execute(self.database.pool())
                .await?
                .rows_affected() as usize;

        // Delete empty groups
        let groups_deleted: usize = sqlx::query(
            "DELETE FROM duplicate_groups WHERE id NOT IN (SELECT DISTINCT group_id FROM duplicate_group_members)"
        )
        .execute(self.database.pool())
        .await?
        .rows_affected() as usize;

        // Delete unused file records
        let files_deleted: usize = sqlx::query(
            "DELETE FROM file_duplicates WHERE id NOT IN (SELECT master_file_id FROM duplicate_groups) AND id NOT IN (SELECT file_id FROM duplicate_group_members)"
        )
        .execute(self.database.pool())
        .await?
        .rows_affected() as usize;

        Ok(members_deleted + groups_deleted + files_deleted)
    }
}
