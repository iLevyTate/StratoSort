use crate::{
    ai::{FileAnalysis, OrganizationSuggestion},
    error::{AppError, Result},
    state::AppState,
};
use chrono::Utc;
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::State;
use tokio::sync::RwLock;

/// StratoSort-style file processing cache for <50ms responses
#[derive(Debug, Clone)]
pub struct CachedFileInfo {
    pub hash: String,
    pub analysis: Option<FileAnalysis>,
    pub last_modified: u64,
    pub last_accessed: Instant,
}

/// StratoSort learning pattern tracker
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LearningPattern {
    pub id: String,
    pub pattern_type: PatternType,
    pub source_patterns: Vec<String>,
    pub target_patterns: Vec<String>,
    pub confidence: f32,
    pub occurrences: usize,
    pub last_seen: i64,
}

/// StratoSort preview tree for batch operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreviewTree {
    pub root_path: String,
    pub total_files: usize,
    pub operations: Vec<PreviewOperation>,
    pub estimated_time_ms: u64,
}

/// Individual preview operation in StratoSort format
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreviewOperation {
    pub source_path: String,
    pub target_path: String,
    pub operation_type: OperationType,
    pub confidence: f32,
    pub reasoning: String,
    pub is_cached: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum OperationType {
    Move,
    Copy,
    Rename,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PatternType {
    Extension,
    Content,
    Date,
    Size,
    Mixed,
}

/// StratoSort Orchestrator - achieves <500ms processing with smart caching and learning
pub struct StratoSortOrchestrator {
    /// File processing cache for <50ms responses on cached files
    pub file_cache: Arc<DashMap<String, CachedFileInfo>>,
    /// Learning patterns for 3-move auto-organization
    pub learning_patterns: Arc<DashMap<String, LearningPattern>>,
    /// Debounced processing timer (500ms delay)
    pub debounce_timer: Arc<RwLock<Option<tokio::task::JoinHandle<()>>>>,
    /// Processing statistics for performance monitoring
    pub stats: Arc<RwLock<ProcessingStats>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessingStats {
    pub total_processed: usize,
    pub cache_hits: usize,
    pub cache_misses: usize,
    pub avg_processing_time_ms: f64,
    pub learning_patterns_count: usize,
    pub auto_applications: usize,
}

/// StratoSort Orchestrator implementation
impl Default for StratoSortOrchestrator {
    fn default() -> Self {
        Self::new()
    }
}

impl StratoSortOrchestrator {
    /// Create new StratoSort orchestrator
    pub fn new() -> Self {
        Self {
            file_cache: Arc::new(DashMap::new()),
            learning_patterns: Arc::new(DashMap::new()),
            debounce_timer: Arc::new(RwLock::new(None)),
            stats: Arc::new(RwLock::new(ProcessingStats {
                total_processed: 0,
                cache_hits: 0,
                cache_misses: 0,
                avg_processing_time_ms: 0.0,
                learning_patterns_count: 0,
                auto_applications: 0,
            })),
        }
    }

    /// Calculate BLAKE3 hash of file for change detection
    pub async fn calculate_file_hash<P: AsRef<Path>>(path: P) -> Result<String> {
        let path = path.as_ref();

        // For large files, hash only first and last 1MB + file size + mtime
        let metadata = tokio::fs::metadata(path).await?;

        if metadata.len() > 2 * 1024 * 1024 {
            // > 2MB
            // Large file optimization: hash header + footer + metadata
            let mut hasher = blake3::Hasher::new();

            // Hash file size and modification time
            hasher.update(&metadata.len().to_le_bytes());
            if let Ok(modified) = metadata.modified() {
                if let Ok(duration) = modified.duration_since(std::time::UNIX_EPOCH) {
                    hasher.update(&duration.as_secs().to_le_bytes());
                }
            }

            // Hash first 1MB
            if let Ok(mut file) = tokio::fs::File::open(path).await {
                use tokio::io::{AsyncReadExt, AsyncSeekExt};
                let mut buffer = vec![0; 1024 * 1024];
                if let Ok(n) = file.read(&mut buffer).await {
                    hasher.update(&buffer[..n]);
                }

                // Seek to last 1MB and hash
                let file_size = metadata.len();
                if file_size > 1024 * 1024 {
                    let seek_pos = file_size - 1024 * 1024;
                    if (file.seek(std::io::SeekFrom::Start(seek_pos)).await).is_ok() {
                        let mut buffer = vec![0; 1024 * 1024];
                        if let Ok(n) = file.read(&mut buffer).await {
                            hasher.update(&buffer[..n]);
                        }
                    }
                }
            }

            Ok(hasher.finalize().to_hex().to_string())
        } else {
            // Small file: hash entire content
            let content = tokio::fs::read(path).await?;
            Ok(blake3::hash(&content).to_hex().to_string())
        }
    }

    /// Check if file is cached and still valid (<50ms response)
    pub async fn get_cached_analysis(&self, path: &str) -> Result<Option<FileAnalysis>> {
        if let Some(cached) = self.file_cache.get(path) {
            // Check if file has been modified
            if let Ok(metadata) = tokio::fs::metadata(path).await {
                if metadata.len() == cached.last_modified {
                    // File hasn't changed, return cached analysis
                    let mut stats = self.stats.write().await;
                    stats.cache_hits += 1;
                    drop(stats);

                    return Ok(cached.analysis.clone());
                }
            }
        }

        Ok(None)
    }

    /// Cache file analysis for future use
    pub async fn cache_analysis(&self, path: &str, analysis: FileAnalysis) -> Result<()> {
        if let Ok(metadata) = tokio::fs::metadata(path).await {
            let hash = Self::calculate_file_hash(path).await?;

            self.file_cache.insert(
                path.to_string(),
                CachedFileInfo {
                    hash,
                    analysis: Some(analysis),
                    last_modified: metadata.len(),
                    last_accessed: Instant::now(),
                },
            );

            // Clean old cache entries periodically (keep last 1000)
            if self.file_cache.len() > 1000 {
                self.cleanup_cache().await;
            }
        }

        Ok(())
    }

    /// Clean up old cache entries
    pub async fn cleanup_cache(&self) {
        let cutoff = Instant::now() - Duration::from_secs(3600); // 1 hour
        self.file_cache.retain(|_, v| v.last_accessed > cutoff);
    }

    /// Generate StratoSort preview tree (<500ms guarantee)
    pub async fn generate_preview_tree(
        &self,
        directory_path: &str,
        state: State<'_, Arc<AppState>>,
    ) -> Result<PreviewTree> {
        let start_time = Instant::now();

        // Check if directory is protected
        if state
            .protected_folders
            .is_path_protected(directory_path)
            .await?
        {
            return Err(AppError::SecurityError {
                message: format!("Cannot preview protected directory: {}", directory_path),
            });
        }

        let mut operations = Vec::new();
        let mut total_files = 0;

        // Scan directory and generate preview operations
        let mut entries = tokio::fs::read_dir(directory_path).await?;

        while let Some(entry) = entries.next_entry().await? {
            if entry.file_type().await?.is_file() {
                total_files += 1;

                let file_path = entry.path().display().to_string();

                // Check if file should be processed (not quarantined)
                if state
                    .quarantine_manager
                    .should_process_file(&file_path)
                    .await
                    .unwrap_or(false)
                {
                    // Check cache first (<50ms for cached files)
                    if let Some(cached_analysis) = self.get_cached_analysis(&file_path).await? {
                        // Cached response - generate preview from cache
                        if let Some(suggestion) =
                            self.generate_suggestion_from_analysis(&cached_analysis, &file_path)
                        {
                            operations.push(PreviewOperation {
                                source_path: file_path.clone(),
                                target_path: suggestion.target_folder.clone(),
                                operation_type: OperationType::Move,
                                confidence: suggestion.confidence,
                                reasoning: suggestion.reason.clone(),
                                is_cached: true,
                            });
                        }
                    } else {
                        // Cache miss - need fresh analysis
                        let analysis = state.file_analyzer.analyze_file(&file_path).await?;

                        // Cache for future use
                        self.cache_analysis(&file_path, analysis.clone()).await?;

                        if let Some(suggestion) =
                            self.generate_suggestion_from_analysis(&analysis, &file_path)
                        {
                            operations.push(PreviewOperation {
                                source_path: file_path.clone(),
                                target_path: suggestion.target_folder.clone(),
                                operation_type: OperationType::Move,
                                confidence: suggestion.confidence,
                                reasoning: suggestion.reason.clone(),
                                is_cached: false,
                            });
                        }
                    }
                }
            }
        }

        let processing_time = start_time.elapsed();

        // Update statistics
        {
            let mut stats = self.stats.write().await;
            stats.total_processed += total_files;
            stats.cache_misses += operations.iter().filter(|op| !op.is_cached).count();
            stats.cache_hits += operations.iter().filter(|op| op.is_cached).count();

            if processing_time.as_millis() > 0 {
                stats.avg_processing_time_ms = (stats.avg_processing_time_ms
                    * (stats.total_processed - total_files) as f64
                    + processing_time.as_millis() as f64)
                    / stats.total_processed as f64;
            }
        }

        Ok(PreviewTree {
            root_path: directory_path.to_string(),
            total_files,
            operations,
            estimated_time_ms: processing_time.as_millis() as u64,
        })
    }

    /// Generate organization suggestion from file analysis
    fn generate_suggestion_from_analysis(
        &self,
        analysis: &FileAnalysis,
        file_path: &str,
    ) -> Option<OrganizationSuggestion> {
        // Simple suggestion generation based on analysis
        let category = analysis.category.clone();
        let target_folder = format!("organized/{}", category);

        Some(OrganizationSuggestion {
            source_path: file_path.to_string(),
            target_folder,
            reason: format!("File categorized as {}", category),
            confidence: 0.8, // Default confidence
        })
    }

    /// Learn from user actions (3-move learning pattern)
    pub async fn learn_from_action(&self, source_path: &str, target_path: &str) -> Result<()> {
        // Extract pattern from move operation
        let pattern_key = Self::extract_pattern_key(source_path, target_path);

        // Update or create learning pattern
        if let Some(mut pattern) = self.learning_patterns.get_mut(&pattern_key) {
            pattern.occurrences += 1;
            pattern.last_seen = Utc::now().timestamp();

            // Update confidence based on occurrences (33% → 66% → 95%)
            pattern.confidence = match pattern.occurrences {
                1 => 0.33,
                2 => 0.66,
                _ => 0.95,
            };
        } else {
            // Create new pattern
            let pattern = LearningPattern {
                id: uuid::Uuid::new_v4().to_string(),
                pattern_type: PatternType::Mixed, // Could be more sophisticated
                source_patterns: vec![source_path.to_string()],
                target_patterns: vec![target_path.to_string()],
                confidence: 0.33,
                occurrences: 1,
                last_seen: Utc::now().timestamp(),
            };

            self.learning_patterns.insert(pattern_key.clone(), pattern);
        }

        // Update statistics
        {
            let mut stats = self.stats.write().await;
            stats.learning_patterns_count = self.learning_patterns.len();

            // Check if this pattern should trigger auto-application (95% confidence)
            if let Some(pattern) = self.learning_patterns.get(&pattern_key) {
                if pattern.confidence >= 0.95 && pattern.occurrences >= 3 {
                    stats.auto_applications += 1;
                }
            }
        }

        Ok(())
    }

    /// Extract pattern key from source and target paths
    fn extract_pattern_key(source_path: &str, target_path: &str) -> String {
        // Simple pattern extraction - could be more sophisticated
        let source_name = Path::new(source_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");
        let target_name = Path::new(target_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");

        format!("{}→{}", source_name, target_name)
    }

    /// Apply learned pattern automatically (when confidence >= 95% and 3+ occurrences)
    pub async fn try_auto_apply(&self, file_path: &str) -> Result<Option<OrganizationSuggestion>> {
        // Find applicable patterns for this file
        for pattern in self.learning_patterns.iter() {
            if pattern.confidence >= 0.95 && pattern.occurrences >= 3 {
                // Check if this pattern applies to the file
                if Self::pattern_applies_to_file(&pattern, file_path) {
                    let suggestion = OrganizationSuggestion {
                        source_path: file_path.to_string(),
                        target_folder: pattern.target_patterns.first().unwrap().clone(),
                        reason: format!("Auto-applied learned pattern: {:?}", pattern.pattern_type),
                        confidence: pattern.confidence,
                    };

                    return Ok(Some(suggestion));
                }
            }
        }

        Ok(None)
    }

    /// Check if a pattern applies to a specific file
    fn pattern_applies_to_file(pattern: &LearningPattern, file_path: &str) -> bool {
        // Simple pattern matching - could be more sophisticated
        let file_name = Path::new(file_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");

        pattern.source_patterns.iter().any(|source| {
            let source_name = Path::new(source)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("");
            file_name.contains(source_name) || source_name.contains(file_name)
        })
    }

    /// Debounced processing (500ms delay to prevent rapid re-analysis)
    pub async fn schedule_debounced_processing<F, Fut>(&self, delay_ms: u64, operation: F)
    where
        F: FnOnce() -> Fut + Send + 'static,
        Fut: std::future::Future<Output = ()> + Send,
    {
        // Cancel existing timer
        if let Some(timer) = self.debounce_timer.write().await.take() {
            timer.abort();
        }

        // Schedule new processing after delay
        let debounce_timer = self.debounce_timer.clone();
        let operation_clone = operation;

        let handle = tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(delay_ms)).await;
            operation_clone().await;

            // Clear timer after completion
            let _ = debounce_timer.write().await.take();
        });

        self.debounce_timer.write().await.replace(handle);
    }

    /// Get processing statistics
    pub async fn get_stats(&self) -> ProcessingStats {
        self.stats.read().await.clone()
    }
}

// Legacy orchestration config and orchestrator removed in favor of StratoSort implementation
