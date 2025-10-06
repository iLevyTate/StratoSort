use crate::{error::Result, state::AppState};
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, Mutex, RwLock};
use tracing::{debug, error, info, warn};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEvent {
    pub event_type: String,
    pub path: String,
    pub timestamp: i64,
    pub file_name: Option<String>,
    pub extension: Option<String>,
    // Enhanced fields for learning
    pub source_path: Option<String>,      // For move operations
    pub destination_path: Option<String>, // For move operations
    pub is_user_action: bool,             // vs system action
    pub operation_id: Option<String>,     // To group related operations
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserAction {
    pub action_type: UserActionType,
    pub timestamp: i64,
    pub file_path: String,
    pub destination_path: Option<String>,
    pub folder_created: Option<String>,
    pub rename_pattern: Option<String>,
    pub confidence: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum UserActionType {
    CreateFolder,
    MoveFile,
    RenameFile,
    DeleteFile,
    CopyFile,
    OrganizeFiles, // Bulk organization action
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchModeConfig {
    pub enabled: bool,
    pub watch_directories: Vec<String>,
    pub auto_organize_delay_ms: u64, // Delay before auto-organizing new files
    pub learning_enabled: bool,
    pub confidence_threshold: f32, // Minimum confidence for auto-organization
    pub max_auto_organize_count: usize, // Max files to auto-organize at once
    pub excluded_extensions: Vec<String>,
    pub excluded_directories: Vec<String>,
}

impl Default for WatchModeConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            watch_directories: vec![],
            auto_organize_delay_ms: 2000, // 2 seconds delay
            learning_enabled: true,
            confidence_threshold: 0.7,
            max_auto_organize_count: 10,
            excluded_extensions: vec![".tmp".to_string(), ".lock".to_string()],
            excluded_directories: vec![".git".to_string(), "node_modules".to_string()],
        }
    }
}

#[derive(Debug)]
pub struct PendingFile {
    pub path: PathBuf,
    pub detected_at: Instant,
    pub file_size: u64,
    pub last_modified: SystemTime,
}

pub struct FileWatcher {
    state: Arc<AppState>,
    app_handle: AppHandle,
    watcher: Arc<Mutex<Option<RecommendedWatcher>>>,
    shutdown_tx: Arc<Mutex<Option<mpsc::Sender<()>>>>,
    // Enhanced watch mode fields
    watch_config: Arc<RwLock<WatchModeConfig>>,
    pending_files: Arc<RwLock<HashMap<PathBuf, PendingFile>>>,
    user_actions: Arc<RwLock<Vec<UserAction>>>,
    recent_operations: Arc<RwLock<HashMap<String, Vec<FileEvent>>>>, // operation_id -> events
    // Event deduplication to prevent race conditions
    recent_events: Arc<RwLock<HashMap<String, Instant>>>,
    event_debounce_duration: Duration,
}

impl FileWatcher {
    pub fn new(state: Arc<AppState>) -> Self {
        Self {
            state: state.clone(),
            app_handle: state.handle.clone(),
            watcher: Arc::new(Mutex::new(None)),
            shutdown_tx: Arc::new(Mutex::new(None)),
            watch_config: Arc::new(RwLock::new(WatchModeConfig::default())),
            pending_files: Arc::new(RwLock::new(HashMap::new())),
            user_actions: Arc::new(RwLock::new(Vec::new())),
            recent_operations: Arc::new(RwLock::new(HashMap::new())),
            recent_events: Arc::new(RwLock::new(HashMap::new())),
            event_debounce_duration: Duration::from_millis(100), // 100ms debounce
        }
    }

    /// Start the enhanced file watcher with learning capabilities
    pub async fn start(&self) -> Result<()> {
        {
            let watcher_guard = self.watcher.lock().await;
            if watcher_guard.is_some() {
                info!("Enhanced file watcher already running");
                return Ok(());
            }
        }

        let (tx, mut rx) = mpsc::channel(1000); // Increased buffer for high-activity directories
        let (shutdown_tx, mut shutdown_rx) = mpsc::channel(1);

        let app_handle = self.app_handle.clone();
        let state = self.state.clone();
        let watch_config = self.watch_config.clone();
        let pending_files = self.pending_files.clone();
        let user_actions = self.user_actions.clone();
        let recent_operations = self.recent_operations.clone();

        // Create enhanced watcher with learning capabilities
        let mut watcher = notify::recommended_watcher(move |res| match res {
            Ok(event) => {
                let tx_clone = tx.clone();
                tokio::task::spawn_blocking(move || {
                    let _ = tx_clone.blocking_send(event);
                });
            }
            Err(e) => {
                error!("Enhanced file watcher error: {}", e);
            }
        })?;

        // Add watch paths from configuration
        let config = watch_config.read().await;
        for path_str in &config.watch_directories {
            let path = Path::new(path_str);
            if path.exists() {
                watcher.watch(path, RecursiveMode::Recursive)?;
                info!("Enhanced watching path: {}", path.display());
            }
        }

        *self.watcher.lock().await = Some(watcher);
        *self.shutdown_tx.lock().await = Some(shutdown_tx);

        // Spawn enhanced event handler with learning and deduplication
        let event_handler_config = watch_config.clone();
        let event_handler_pending = pending_files.clone();
        let event_handler_actions = user_actions.clone();
        let event_handler_operations = recent_operations.clone();
        let event_handler_recent_events = self.recent_events.clone();
        let event_handler_debounce_duration = self.event_debounce_duration;

        tokio::spawn(async move {
            loop {
                tokio::select! {
                    Some(event) = rx.recv() => {
                        // Check for event deduplication
                        if let Some(event_path) = event.paths.first() {
                            let event_key = format!("{}:{:?}", event_path.display(), event.kind);
                            let now = Instant::now();

                            // Check if this event was recently processed
                            {
                                let mut recent_events = event_handler_recent_events.write().await;

                                // Clean up old events (older than debounce duration)
                                recent_events.retain(|_, &mut timestamp| {
                                    now.duration_since(timestamp) < event_handler_debounce_duration * 5
                                });

                                // Check if this event is a duplicate
                                if let Some(&last_time) = recent_events.get(&event_key) {
                                    if now.duration_since(last_time) < event_handler_debounce_duration {
                                        // Skip duplicate event
                                        debug!("Skipping duplicate event: {}", event_key);
                                        continue;
                                    }
                                }

                                // Record this event
                                recent_events.insert(event_key, now);
                            }
                        }

                        // Process event with error handling and recovery
                        handle_enhanced_file_event(
                            event,
                            &app_handle,
                            &state,
                            &event_handler_config,
                            &event_handler_pending,
                            &event_handler_actions,
                            &event_handler_operations
                        ).await;
                    }
                    _ = shutdown_rx.recv() => {
                        info!("Enhanced file watcher shutting down");
                        break;
                    }
                }
            }
        });

        // Spawn auto-organization processor
        let auto_org_config = watch_config.clone();
        let auto_org_pending = pending_files.clone();
        let auto_org_state = self.state.clone(); // Clone from self instead of moved variable
        let auto_org_app = self.app_handle.clone(); // Clone from self instead of moved variable

        tokio::spawn(async move {
            Self::auto_organization_processor(
                auto_org_config,
                auto_org_pending,
                auto_org_state,
                auto_org_app,
            )
            .await;
        });

        info!("Enhanced file watcher with learning started");
        Ok(())
    }

    pub async fn stop(&self) -> Result<()> {
        if let Some(tx) = self.shutdown_tx.lock().await.take() {
            let _ = tx.send(()).await;
        }

        *self.watcher.lock().await = None;
        info!("File watcher stopped");
        Ok(())
    }

    /// Configure watch mode settings
    pub async fn configure_watch_mode(&self, config: WatchModeConfig) -> Result<()> {
        let mut current_config = self.watch_config.write().await;
        *current_config = config;
        info!("Watch mode configuration updated");
        Ok(())
    }

    /// Get current watch mode configuration
    pub async fn get_watch_config(&self) -> WatchModeConfig {
        self.watch_config.read().await.clone()
    }

    /// Record a user action for learning
    pub async fn record_user_action(&self, action: UserAction) {
        let mut actions = self.user_actions.write().await;
        actions.push(action.clone());

        // Keep only recent actions (last 1000)
        if actions.len() > 1000 {
            actions.drain(0..500); // Remove older half
        }

        debug!("Recorded user action: {:?}", action);
    }

    /// Get recent user actions for pattern learning
    pub async fn get_recent_user_actions(&self, limit: usize) -> Vec<UserAction> {
        let actions = self.user_actions.read().await;
        actions.iter().rev().take(limit).cloned().collect()
    }

    /// Get pending files count
    pub async fn get_pending_files_count(&self) -> usize {
        self.pending_files.read().await.len()
    }

    /// Get pending file paths
    pub async fn get_pending_file_paths(&self) -> Vec<String> {
        let pending = self.pending_files.read().await;
        pending
            .keys()
            .map(|path| path.to_string_lossy().to_string())
            .collect()
    }

    /// Clear pending files (used for manual trigger)
    pub async fn clear_pending_files(&self) -> usize {
        let mut pending = self.pending_files.write().await;
        let count = pending.len();
        pending.clear();
        count
    }

    pub async fn add_watch_path(&self, path: &str) -> Result<()> {
        let mut watcher_guard = self.watcher.lock().await;
        if let Some(watcher) = &mut *watcher_guard {
            let path = Path::new(path);
            if path.exists() {
                watcher.watch(path, RecursiveMode::Recursive)?;
                info!("Added watch path: {}", path.display());
            }
        }
        Ok(())
    }

    pub async fn remove_watch_path(&self, path: &str) -> Result<()> {
        let mut watcher_guard = self.watcher.lock().await;
        if let Some(watcher) = &mut *watcher_guard {
            let path = Path::new(path);
            watcher.unwatch(path)?;
            info!("Removed watch path: {}", path.display());
        }
        Ok(())
    }

    /// Auto-organization processor that runs continuously
    async fn auto_organization_processor(
        config: Arc<RwLock<WatchModeConfig>>,
        pending_files: Arc<RwLock<HashMap<PathBuf, PendingFile>>>,
        state: Arc<AppState>,
        app_handle: AppHandle,
    ) {
        let mut interval = tokio::time::interval(Duration::from_millis(1000)); // Check every second

        loop {
            interval.tick().await;

            let config_read = config.read().await;
            if !config_read.enabled {
                continue;
            }

            let auto_organize_delay = Duration::from_millis(config_read.auto_organize_delay_ms);
            let confidence_threshold = config_read.confidence_threshold;
            let max_count = config_read.max_auto_organize_count;
            drop(config_read);

            let mut pending = pending_files.write().await;
            let now = Instant::now();

            // Find files ready for auto-organization
            let ready_files: Vec<PathBuf> = pending
                .iter()
                .filter(|(_, pending_file)| {
                    now.duration_since(pending_file.detected_at) >= auto_organize_delay
                })
                .take(max_count)
                .map(|(path, _)| path.clone())
                .collect();

            // Remove processed files from pending
            for path in &ready_files {
                pending.remove(path);
            }
            drop(pending);

            if !ready_files.is_empty() {
                info!("Auto-organizing {} files", ready_files.len());

                // Process files for auto-organization
                for file_path in ready_files {
                    if let Err(e) = Self::auto_organize_single_file(
                        &file_path,
                        &state,
                        &app_handle,
                        confidence_threshold,
                    )
                    .await
                    {
                        warn!(
                            "Auto-organization failed for {}: {}",
                            file_path.display(),
                            e
                        );
                    }
                }
            }
        }
    }

    /// Auto-organize a single file based on AI analysis and learned patterns
    async fn auto_organize_single_file(
        file_path: &PathBuf,
        state: &Arc<AppState>,
        app_handle: &AppHandle,
        confidence_threshold: f32,
    ) -> Result<()> {
        let path_str = file_path.to_string_lossy().to_string();

        // 1. Analyze file with AI (if not already cached)
        let ai_analysis = match state.database.get_analysis(&path_str).await? {
            Some(existing_analysis) => Some(existing_analysis),
            None => {
                // Perform AI analysis
                if let Ok(content) = tokio::fs::read_to_string(&file_path).await {
                    match state.ai_service.analyze_file(&content, "").await {
                        Ok(analysis) => {
                            // Cache the analysis
                            let _ = state.database.save_analysis(&analysis).await;
                            Some(analysis)
                        }
                        Err(e) => {
                            warn!("AI analysis failed for {}: {}", path_str, e);
                            None
                        }
                    }
                } else {
                    None
                }
            }
        };

        // 2. Find best matching smart folder (using existing logic)
        let smart_folders = state.database.list_smart_folders().await?;
        let mut best_match = None;
        let mut highest_confidence = 0.0;

        for folder in smart_folders {
            if !folder.enabled {
                continue;
            }

            // Use existing confidence calculation from organization.rs
            let confidence = crate::commands::organization::calculate_folder_match_confidence(
                &path_str, &folder,
            )
            .await;

            if confidence > highest_confidence {
                highest_confidence = confidence;
                best_match = Some(folder);
            }
        }

        // 3. Auto-organize if confidence is high enough
        if highest_confidence >= confidence_threshold {
            if let Some(target_folder) = best_match {
                let target_dir = Path::new(&target_folder.target_path);

                // Create target directory if needed
                if let Some(parent) = target_dir.parent() {
                    let _ = tokio::fs::create_dir_all(parent).await;
                }

                // Generate smart filename
                let smart_filename = if let Some(ref analysis) = ai_analysis {
                    generate_smart_filename_from_analysis(&path_str, analysis)
                } else {
                    file_path
                        .file_name()
                        .map(|name| name.to_string_lossy().to_string())
                        .unwrap_or_else(|| "unknown_file".to_string())
                };

                let target_path = target_dir.join(&smart_filename);

                // Perform the move
                match tokio::fs::rename(&file_path, &target_path).await {
                    Ok(_) => {
                        info!(
                            "Auto-organized: {} -> {} (confidence: {:.1}%)",
                            file_path.display(),
                            target_path.display(),
                            highest_confidence * 100.0
                        );

                        // Emit success notification to frontend
                        let _ = app_handle.emit(
                            "file-auto-organized",
                            serde_json::json!({
                                "source": path_str,
                                "target": target_path.to_string_lossy(),
                                "confidence": highest_confidence,
                                "folder": target_folder.name
                            }),
                        );
                    }
                    Err(e) => {
                        warn!("Failed to auto-organize {}: {}", path_str, e);
                    }
                }
            }
        } else {
            debug!(
                "Skipping auto-organization for {} (confidence too low: {:.1}%)",
                path_str,
                highest_confidence * 100.0
            );
        }

        Ok(())
    }
}

/// Enhanced file event handler with learning capabilities
async fn handle_enhanced_file_event(
    event: Event,
    app_handle: &AppHandle,
    _state: &Arc<AppState>,
    config: &Arc<RwLock<WatchModeConfig>>,
    pending_files: &Arc<RwLock<HashMap<PathBuf, PendingFile>>>,
    _user_actions: &Arc<RwLock<Vec<UserAction>>>,
    _recent_operations: &Arc<RwLock<HashMap<String, Vec<FileEvent>>>>,
) {
    debug!("Enhanced file event: {:?}", event);

    let config_read = config.read().await;
    if !config_read.enabled {
        return;
    }

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or_else(|_| {
            warn!("System time is before UNIX epoch, using fallback timestamp");
            0
        });

    match event.kind {
        EventKind::Create(_) => {
            for path in event.paths {
                // Skip if file should be ignored
                if should_ignore_file_enhanced(&path, &config_read) {
                    continue;
                }

                // Add to pending files for auto-organization
                if path.is_file() {
                    if let Ok(metadata) = tokio::fs::metadata(&path).await {
                        let pending_file = PendingFile {
                            path: path.clone(),
                            detected_at: Instant::now(),
                            file_size: metadata.len(),
                            last_modified: metadata.modified().unwrap_or(SystemTime::now()),
                        };

                        pending_files
                            .write()
                            .await
                            .insert(path.clone(), pending_file);

                        debug!("Added file to auto-organization queue: {}", path.display());
                    }
                }

                // Emit enhanced event to frontend
                let file_event = FileEvent {
                    event_type: "created".to_string(),
                    path: path.to_string_lossy().to_string(),
                    timestamp,
                    file_name: path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .map(|s| s.to_string()),
                    extension: path
                        .extension()
                        .and_then(|e| e.to_str())
                        .map(|s| s.to_string()),
                    source_path: None,
                    destination_path: None,
                    is_user_action: false, // System detected file creation
                    operation_id: None,
                };

                let _ = app_handle.emit("enhanced-file-event", &file_event);
            }
        }
        EventKind::Modify(_) => {
            // Handle file modifications - could indicate user is actively working with file
            for path in event.paths {
                if should_ignore_file_enhanced(&path, &config_read) {
                    continue;
                }

                let file_event = FileEvent {
                    event_type: "modified".to_string(),
                    path: path.to_string_lossy().to_string(),
                    timestamp,
                    file_name: path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .map(|s| s.to_string()),
                    extension: path
                        .extension()
                        .and_then(|e| e.to_str())
                        .map(|s| s.to_string()),
                    source_path: None,
                    destination_path: None,
                    is_user_action: true, // File modification likely user action
                    operation_id: None,
                };

                let _ = app_handle.emit("enhanced-file-event", &file_event);
            }
        }
        EventKind::Remove(_) => {
            for path in event.paths {
                // Remove from pending files if it was queued
                pending_files.write().await.remove(&path);

                let file_event = FileEvent {
                    event_type: "removed".to_string(),
                    path: path.to_string_lossy().to_string(),
                    timestamp,
                    file_name: path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .map(|s| s.to_string()),
                    extension: path
                        .extension()
                        .and_then(|e| e.to_str())
                        .map(|s| s.to_string()),
                    source_path: None,
                    destination_path: None,
                    is_user_action: true, // File deletion likely user action
                    operation_id: None,
                };

                let _ = app_handle.emit("enhanced-file-event", &file_event);
            }
        }
        _ => {
            // Handle other event types (access, rename, etc.)
            debug!("Unhandled event type: {:?}", event.kind);
        }
    }
}

/// Enhanced file filtering with watch mode configuration
fn should_ignore_file_enhanced(path: &Path, config: &WatchModeConfig) -> bool {
    let path_str = path.to_string_lossy().to_lowercase();

    // Check excluded extensions
    if let Some(extension) = path.extension().and_then(|e| e.to_str()) {
        let ext_lower = format!(".{}", extension.to_lowercase());
        if config.excluded_extensions.contains(&ext_lower) {
            return true;
        }
    }

    // Check excluded directories
    for excluded_dir in &config.excluded_directories {
        if path_str.contains(&excluded_dir.to_lowercase()) {
            return true;
        }
    }

    // Skip hidden files and temporary files
    if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
        if file_name.starts_with('.')
            || file_name.starts_with('~')
            || file_name.ends_with('~')
            || file_name.starts_with("Thumbs.db")
            || file_name.starts_with(".DS_Store")
        {
            return true;
        }
    }

    false
}

/// Generate smart filename based on AI analysis
fn generate_smart_filename_from_analysis(
    original_path: &str,
    analysis: &crate::ai::FileAnalysis,
) -> String {
    let path = Path::new(original_path);
    let extension = path.extension().and_then(|e| e.to_str()).unwrap_or("");

    // Use AI suggested name if available and high confidence
    if analysis.confidence > 0.8 && !analysis.summary.is_empty() {
        // Extract meaningful words from summary
        let meaningful_words: Vec<&str> = analysis
            .summary
            .split_whitespace()
            .filter(|word| {
                word.len() > 3
                    && ![
                        "the", "and", "for", "with", "this", "that", "from", "they", "have", "been",
                    ]
                    .contains(&word.to_lowercase().as_str())
            })
            .take(3)
            .collect();

        if !meaningful_words.is_empty() {
            let smart_name = meaningful_words
                .join("_")
                .chars()
                .map(|c| {
                    if c.is_alphanumeric() || c == '_' {
                        c
                    } else {
                        '_'
                    }
                })
                .collect::<String>();

            return format!("{}.{}", smart_name, extension);
        }
    }

    // Fallback to original filename
    path.file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string()
}
