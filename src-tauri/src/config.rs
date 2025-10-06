use crate::error::Result;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    // AI Settings
    pub ai_provider: String,
    pub ollama_host: String,
    pub ollama_model: String,
    pub ollama_vision_model: String,
    pub ollama_embedding_model: String,
    pub embedding_dimensions: usize,

    // File Settings
    pub watch_folders: bool,
    pub watch_paths: Vec<String>,
    pub default_smart_folder_location: String,
    pub file_extensions_to_ignore: Vec<String>,
    pub max_file_size: u64,

    // Performance Settings
    pub max_concurrent_analysis: usize,
    pub max_concurrent_operations: usize,
    pub cache_size: usize,
    pub enable_gpu: bool,

    // Resource Limits
    pub max_concurrent_reads: usize,
    pub max_total_memory_mb: usize,
    pub max_single_file_size_mb: usize,
    pub max_directory_scan_depth: usize,

    // UI Settings
    pub theme: String,
    pub language: String,
    pub show_notifications: bool,
    pub notification_duration: u64,

    // Privacy Settings
    pub enable_telemetry: bool,
    pub enable_crash_reports: bool,
    pub enable_analytics: bool,

    // Behavior Settings
    pub confirm_before_delete: bool,
    pub confirm_before_move: bool,
    pub auto_analyze_on_add: bool,
    pub preserve_file_timestamps: bool,

    // Enhanced Organization Settings
    pub recents_quarantine_days: u32, // NEW: Days before auto-organizing recent files
    pub enable_behavioral_learning: bool, // NEW: Learn from user actions
    pub min_pattern_occurrences: usize, // NEW: Min actions to detect pattern (default 3)
    pub auto_apply_high_confidence: bool, // NEW: Auto-apply predictions >90% confidence

    // Advanced Settings
    pub debug_mode: bool,
    pub log_level: String,
    pub history_retention: u64,
    pub undo_history_size: usize,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            // AI Settings
            ai_provider: "ollama".to_string(),
            ollama_host: "http://localhost:11434".to_string(),
            ollama_model: "llama3.2:3b".to_string(),
            ollama_vision_model: "llava:7b".to_string(),
            ollama_embedding_model: "nomic-embed-text".to_string(),
            embedding_dimensions: 768, // Default for nomic-embed-text

            // File Settings
            watch_folders: false,
            watch_paths: vec![],
            default_smart_folder_location: "".to_string(),
            file_extensions_to_ignore: vec![
                ".tmp".to_string(),
                ".cache".to_string(),
                ".temp".to_string(),
                ".part".to_string(),
            ],
            max_file_size: 100 * 1024 * 1024, // 100MB

            // Performance Settings
            max_concurrent_analysis: 3,
            max_concurrent_operations: 5,
            cache_size: 100 * 1024 * 1024, // 100MB
            enable_gpu: false,

            // Resource Limits
            max_concurrent_reads: 5,
            max_total_memory_mb: 100,
            max_single_file_size_mb: 10,
            max_directory_scan_depth: 10,

            // UI Settings
            theme: "auto".to_string(),
            language: "en".to_string(),
            show_notifications: true,
            notification_duration: 3000,

            // Privacy Settings
            enable_telemetry: false,
            enable_crash_reports: false,
            enable_analytics: false,

            // Behavior Settings
            confirm_before_delete: true,
            confirm_before_move: false,
            auto_analyze_on_add: true,
            preserve_file_timestamps: true,

            // Enhanced Organization Defaults
            recents_quarantine_days: 3,
            enable_behavioral_learning: true,
            min_pattern_occurrences: 3,
            auto_apply_high_confidence: false,

            // Advanced Settings
            debug_mode: false,
            log_level: "info".to_string(),
            history_retention: 30, // days
            undo_history_size: 50,
        }
    }
}

impl Config {
    /// Load configuration from disk with environment variable overrides
    pub fn load(handle: &AppHandle) -> Result<Self> {
        let config_path = Self::config_path(handle)?;

        let mut config = if config_path.exists() {
            let content = std::fs::read_to_string(&config_path)?;
            let mut config: Self = serde_json::from_str(&content)?;

            // Set default smart folder location if not set
            if config.default_smart_folder_location.is_empty() {
                config.default_smart_folder_location = Self::default_smart_folder_path(handle)?;
            }

            config
        } else {
            let config = Self {
                default_smart_folder_location: Self::default_smart_folder_path(handle)?,
                ..Self::default()
            };

            // Save default config
            config.save(handle)?;

            config
        };

        // Apply environment variable overrides
        config.apply_env_overrides();

        // Validate configuration
        config.validate()?;

        Ok(config)
    }

    /// Apply environment variable overrides to configuration
    fn apply_env_overrides(&mut self) {
        // AI Settings
        if let Ok(host) = std::env::var("OLLAMA_HOST") {
            self.ollama_host = host;
        }
        if let Ok(model) = std::env::var("OLLAMA_MODEL") {
            self.ollama_model = model;
        }
        if let Ok(vision_model) = std::env::var("OLLAMA_VISION_MODEL") {
            self.ollama_vision_model = vision_model;
        }
        if let Ok(embedding_model) = std::env::var("OLLAMA_EMBEDDING_MODEL") {
            self.ollama_embedding_model = embedding_model;
        }

        // File Settings
        if let Ok(watch_enabled) = std::env::var("FILE_WATCH_ENABLED") {
            match watch_enabled.parse::<bool>() {
                Ok(value) => self.watch_folders = value,
                Err(e) => {
                    tracing::warn!(
                        "Invalid FILE_WATCH_ENABLED value '{}': {}. Using default.",
                        watch_enabled,
                        e
                    );
                }
            }
        }
        if let Ok(max_size) = std::env::var("MAX_FILE_SIZE") {
            match max_size.parse::<u64>() {
                Ok(value) => self.max_file_size = value,
                Err(e) => {
                    tracing::warn!(
                        "Invalid MAX_FILE_SIZE value '{}': {}. Using default.",
                        max_size,
                        e
                    );
                }
            }
        }

        // Performance Settings
        if let Ok(max_analysis) = std::env::var("MAX_CONCURRENT_ANALYSIS") {
            match max_analysis.parse::<usize>() {
                Ok(value) => self.max_concurrent_analysis = value,
                Err(e) => {
                    tracing::warn!(
                        "Invalid MAX_CONCURRENT_ANALYSIS value '{}': {}. Using default.",
                        max_analysis,
                        e
                    );
                }
            }
        }
        if let Ok(max_ops) = std::env::var("MAX_CONCURRENT_OPERATIONS") {
            match max_ops.parse::<usize>() {
                Ok(value) => self.max_concurrent_operations = value,
                Err(e) => {
                    tracing::warn!(
                        "Invalid MAX_CONCURRENT_OPERATIONS value '{}': {}. Using default.",
                        max_ops,
                        e
                    );
                }
            }
        }
        if let Ok(cache_size) = std::env::var("CACHE_SIZE_MB") {
            match cache_size.parse::<usize>() {
                Ok(size_mb) => self.cache_size = size_mb * 1024 * 1024, // Convert MB to bytes
                Err(e) => {
                    tracing::warn!(
                        "Invalid CACHE_SIZE_MB value '{}': {}. Using default.",
                        cache_size,
                        e
                    );
                }
            }
        }
        if let Ok(enable_gpu) = std::env::var("ENABLE_GPU_ACCELERATION") {
            match enable_gpu.parse::<bool>() {
                Ok(value) => self.enable_gpu = value,
                Err(e) => {
                    tracing::warn!(
                        "Invalid ENABLE_GPU_ACCELERATION value '{}': {}. Using default.",
                        enable_gpu,
                        e
                    );
                }
            }
        }

        // UI Settings
        if let Ok(theme) = std::env::var("THEME") {
            self.theme = theme;
        }
        if let Ok(language) = std::env::var("LANGUAGE") {
            self.language = language;
        }
        if let Ok(show_notifications) = std::env::var("SHOW_NOTIFICATIONS") {
            match show_notifications.parse::<bool>() {
                Ok(value) => self.show_notifications = value,
                Err(e) => {
                    tracing::warn!(
                        "Invalid SHOW_NOTIFICATIONS value '{}': {}. Using default.",
                        show_notifications,
                        e
                    );
                }
            }
        }
        if let Ok(duration) = std::env::var("NOTIFICATION_DURATION_MS") {
            match duration.parse::<u64>() {
                Ok(value) => self.notification_duration = value,
                Err(e) => {
                    tracing::warn!(
                        "Invalid NOTIFICATION_DURATION_MS value '{}': {}. Using default.",
                        duration,
                        e
                    );
                }
            }
        }

        // Privacy Settings
        if let Ok(enable_telemetry) = std::env::var("ENABLE_TELEMETRY") {
            match enable_telemetry.parse::<bool>() {
                Ok(value) => self.enable_telemetry = value,
                Err(e) => {
                    tracing::warn!(
                        "Invalid ENABLE_TELEMETRY value '{}': {}. Using default.",
                        enable_telemetry,
                        e
                    );
                }
            }
        }
        if let Ok(enable_crash_reports) = std::env::var("ENABLE_CRASH_REPORTS") {
            match enable_crash_reports.parse::<bool>() {
                Ok(value) => self.enable_crash_reports = value,
                Err(e) => {
                    tracing::warn!(
                        "Invalid ENABLE_CRASH_REPORTS value '{}': {}. Using default.",
                        enable_crash_reports,
                        e
                    );
                }
            }
        }
        if let Ok(enable_analytics) = std::env::var("ENABLE_ANALYTICS") {
            match enable_analytics.parse::<bool>() {
                Ok(value) => self.enable_analytics = value,
                Err(e) => {
                    tracing::warn!(
                        "Invalid ENABLE_ANALYTICS value '{}': {}. Using default.",
                        enable_analytics,
                        e
                    );
                }
            }
        }

        // Behavior Settings
        if let Ok(confirm_delete) = std::env::var("CONFIRM_BEFORE_DELETE") {
            match confirm_delete.parse::<bool>() {
                Ok(value) => self.confirm_before_delete = value,
                Err(e) => {
                    tracing::warn!(
                        "Invalid CONFIRM_BEFORE_DELETE value '{}': {}. Using default.",
                        confirm_delete,
                        e
                    );
                }
            }
        }
        if let Ok(confirm_move) = std::env::var("CONFIRM_BEFORE_MOVE") {
            match confirm_move.parse::<bool>() {
                Ok(value) => self.confirm_before_move = value,
                Err(e) => {
                    tracing::warn!(
                        "Invalid CONFIRM_BEFORE_MOVE value '{}': {}. Using default.",
                        confirm_move,
                        e
                    );
                }
            }
        }

        // Advanced Settings
        if let Ok(debug_mode) = std::env::var("DEBUG_MODE") {
            match debug_mode.parse::<bool>() {
                Ok(value) => self.debug_mode = value,
                Err(e) => {
                    tracing::warn!(
                        "Invalid DEBUG_MODE value '{}': {}. Using default.",
                        debug_mode,
                        e
                    );
                }
            }
        }
        if let Ok(history_retention) = std::env::var("HISTORY_RETENTION_DAYS") {
            match history_retention.parse::<u64>() {
                Ok(value) => self.history_retention = value,
                Err(e) => {
                    tracing::warn!(
                        "Invalid HISTORY_RETENTION_DAYS value '{}': {}. Using default.",
                        history_retention,
                        e
                    );
                }
            }
        }
        if let Ok(undo_size) = std::env::var("UNDO_HISTORY_SIZE") {
            match undo_size.parse::<usize>() {
                Ok(value) => self.undo_history_size = value,
                Err(e) => {
                    tracing::warn!(
                        "Invalid UNDO_HISTORY_SIZE value '{}': {}. Using default.",
                        undo_size,
                        e
                    );
                }
            }
        }

        // File extensions to ignore
        if let Ok(extensions) = std::env::var("FILE_EXTENSIONS_IGNORE") {
            self.file_extensions_to_ignore = extensions
                .split(',')
                .map(|s| s.trim().to_string())
                .collect();
        }

        tracing::debug!("Applied environment variable overrides to configuration");
    }

    /// Save configuration to disk
    pub fn save(&self, handle: &AppHandle) -> Result<()> {
        let config_path = Self::config_path(handle)?;

        // Ensure directory exists
        if let Some(parent) = config_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let content = serde_json::to_string_pretty(self)?;
        std::fs::write(&config_path, content)?;

        tracing::info!("Configuration saved to {:?}", config_path);
        Ok(())
    }

    /// Reset to default configuration
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    /// Validate configuration
    pub fn validate(&self) -> Result<()> {
        let mut errors = Vec::new();

        // Validate AI settings
        self.validate_ai_settings(&mut errors);

        // Validate file settings
        self.validate_file_settings(&mut errors);

        // Validate performance settings
        self.validate_performance_settings(&mut errors);

        // Validate UI settings
        self.validate_ui_settings(&mut errors);

        // Validate privacy settings
        self.validate_privacy_settings(&mut errors);

        // Validate advanced settings
        self.validate_advanced_settings(&mut errors);

        if !errors.is_empty() {
            return Err(crate::error::AppError::ConfigError {
                message: errors.join(", "),
            });
        }

        Ok(())
    }

    /// Validate AI settings specifically
    fn validate_ai_settings(&self, errors: &mut Vec<String>) {
        if self.ai_provider.is_empty() {
            errors.push("AI provider cannot be empty".to_string());
        }

        if !self.ai_provider.is_empty()
            && !["ollama", "openai", "anthropic"].contains(&self.ai_provider.as_str())
        {
            errors.push(format!("Unsupported AI provider: {}", self.ai_provider));
        }

        if self.ollama_host.is_empty() {
            errors.push("Ollama host cannot be empty".to_string());
        } else if !self.ollama_host.starts_with("http://")
            && !self.ollama_host.starts_with("https://")
        {
            errors.push("Ollama host must start with http:// or https://".to_string());
        }

        if self.ollama_model.is_empty() {
            errors.push("Ollama model cannot be empty".to_string());
        } else if !self.ollama_model.contains(':') {
            errors.push("Ollama model should include a tag (e.g., 'llama3.2:3b')".to_string());
        }

        if self.ollama_vision_model.is_empty() {
            errors.push("Ollama vision model cannot be empty".to_string());
        } else if !self.ollama_vision_model.contains(':') {
            errors.push("Ollama vision model should include a tag (e.g., 'llava:7b')".to_string());
        }

        if self.ollama_embedding_model.is_empty() {
            errors.push("Ollama embedding model cannot be empty".to_string());
        } else if !self.ollama_embedding_model.contains(':') {
            errors.push("Ollama embedding model should include a tag (e.g., 'nomic-embed-text')".to_string());
        }
    }

    /// Validate file settings specifically
    fn validate_file_settings(&self, errors: &mut Vec<String>) {
        if self.max_file_size == 0 {
            errors.push("Max file size must be greater than 0".to_string());
        }

        if self.max_file_size > 10 * 1024 * 1024 * 1024 {
            // 10GB
            errors.push("Max file size is too large (>10GB)".to_string());
        }

        if self.max_single_file_size_mb == 0 {
            errors.push("Max single file size must be greater than 0".to_string());
        }

        if self.max_single_file_size_mb > 1024 {
            // 1GB in MB
            errors.push("Max single file size is too large (>1GB)".to_string());
        }

        if self.max_directory_scan_depth == 0 {
            errors.push("Max directory scan depth must be at least 1".to_string());
        }

        if self.max_directory_scan_depth > 50 {
            errors.push("Max directory scan depth is too large (>50)".to_string());
        }

        // Validate watch paths exist if watching is enabled
        if self.watch_folders {
            for path in &self.watch_paths {
                if path.is_empty() {
                    errors.push("Watch path cannot be empty".to_string());
                }
            }
        }

        // Validate smart folder location if set
        if !self.default_smart_folder_location.is_empty() {
            let path: std::path::PathBuf =
                std::path::PathBuf::from(&self.default_smart_folder_location);
            if path.exists() && !path.is_dir() {
                errors.push(format!(
                    "Default smart folder location exists but is not a directory: {}",
                    self.default_smart_folder_location
                ));
            }
        }

        // Validate file extensions format
        for ext in &self.file_extensions_to_ignore {
            if !ext.starts_with('.') {
                errors.push(format!("File extension '{}' must start with a dot", ext));
            }
        }
    }

    /// Validate performance settings specifically
    fn validate_performance_settings(&self, errors: &mut Vec<String>) {
        if self.max_concurrent_analysis == 0 {
            errors.push("Max concurrent analysis must be at least 1".to_string());
        }

        if self.max_concurrent_analysis > 20 {
            errors.push("Max concurrent analysis is too high (>20)".to_string());
        }

        if self.max_concurrent_operations == 0 {
            errors.push("Max concurrent operations must be at least 1".to_string());
        }

        if self.max_concurrent_operations > 50 {
            errors.push("Max concurrent operations is too high (>50)".to_string());
        }

        if self.max_concurrent_reads == 0 {
            errors.push("Max concurrent reads must be at least 1".to_string());
        }

        if self.cache_size == 0 {
            errors.push("Cache size must be greater than 0".to_string());
        }

        if self.cache_size > 10 * 1024 * 1024 * 1024 {
            // 10GB
            errors.push("Cache size is too large (>10GB)".to_string());
        }

        if self.max_total_memory_mb == 0 {
            errors.push("Max total memory must be greater than 0".to_string());
        }

        if self.max_total_memory_mb > 32 * 1024 {
            // 32GB in MB
            errors.push("Max total memory is too large (>32GB)".to_string());
        }
    }

    /// Validate UI settings specifically
    fn validate_ui_settings(&self, errors: &mut Vec<String>) {
        if !["light", "dark", "auto", "system"].contains(&self.theme.as_str()) {
            errors.push(format!(
                "Invalid theme: {}. Must be light, dark, auto, or system",
                self.theme
            ));
        }

        if self.language.is_empty() {
            errors.push("Language cannot be empty".to_string());
        }

        if self.language.len() < 2 || self.language.len() > 5 {
            errors.push(format!(
                "Language must be 2-5 characters, got: {} ({} chars)",
                self.language,
                self.language.len()
            ));
        }

        if self.notification_duration == 0 {
            errors.push("Notification duration must be greater than 0".to_string());
        } else if self.notification_duration < 1000 {
            errors.push("Notification duration must be at least 1000ms".to_string());
        }

        if self.notification_duration > 30000 {
            errors.push("Notification duration is too long (>30s)".to_string());
        }
    }

    /// Validate privacy settings specifically
    #[allow(clippy::ptr_arg)]
    fn validate_privacy_settings(&self, _errors: &mut Vec<String>) {
        // Privacy settings are boolean flags, so no specific validation needed
        // This function exists for completeness and future expansion
    }

    /// Validate advanced settings specifically
    fn validate_advanced_settings(&self, errors: &mut Vec<String>) {
        if !["error", "warn", "info", "debug", "trace"].contains(&self.log_level.as_str()) {
            errors.push(format!(
                "Invalid log level: {}. Must be error, warn, info, debug, or trace",
                self.log_level
            ));
        }

        if self.history_retention == 0 {
            errors.push("History retention must be greater than 0".to_string());
        }

        if self.history_retention > 365 * 24 * 60 * 60 {
            // 1 year in seconds
            errors.push("History retention is too long (>1 year)".to_string());
        }

        if self.undo_history_size == 0 {
            errors.push("Undo history size must be greater than 0".to_string());
        }

        if self.undo_history_size > 10000 {
            errors.push("Undo history size is too large (>10000)".to_string());
        }

        // Validate enhanced organization settings
        if self.recents_quarantine_days == 0 {
            errors.push("Recents quarantine days must be greater than 0".to_string());
        }

        if self.recents_quarantine_days > 365 {
            errors.push("Recents quarantine days is too large (>365 days)".to_string());
        }

        if self.min_pattern_occurrences == 0 {
            errors.push("Min pattern occurrences must be greater than 0".to_string());
        }

        if self.min_pattern_occurrences > 100 {
            errors.push("Min pattern occurrences is too large (>100)".to_string());
        }
    }

    /// Check if this is the first run (no config exists)
    pub fn is_first_run(handle: &AppHandle) -> Result<bool> {
        let config_path = Self::config_path(handle)?;
        Ok(!config_path.exists())
    }

    /// Create configuration for first run with smart folder location
    pub fn create_first_run_config(
        handle: &AppHandle,
        smart_folder_location: String,
    ) -> Result<Self> {
        let mut config = Self {
            default_smart_folder_location: if smart_folder_location.is_empty() {
                Self::default_smart_folder_path(handle)?
            } else {
                smart_folder_location
            },
            ..Self::default()
        };

        // Apply environment variable overrides
        config.apply_env_overrides();

        // Save the configuration
        config.save(handle)?;

        Ok(config)
    }

    /// Get configuration file path
    fn config_path(handle: &AppHandle) -> Result<PathBuf> {
        let app_dir =
            handle
                .path()
                .app_config_dir()
                .map_err(|e| crate::error::AppError::ConfigError {
                    message: format!("Failed to get config directory: {}", e),
                })?;

        Ok(app_dir.join("config.json"))
    }

    /// Get default smart folder location
    fn default_smart_folder_path(handle: &AppHandle) -> Result<String> {
        let documents_dir =
            handle
                .path()
                .document_dir()
                .map_err(|e| crate::error::AppError::ConfigError {
                    message: format!("Failed to get documents directory: {}", e),
                })?;

        Ok(documents_dir.join("StratoSort").display().to_string())
    }

    /// Export configuration
    pub fn export(&self) -> String {
        serde_json::to_string_pretty(self).unwrap_or_default()
    }

    /// Import configuration
    pub fn import(json: &str) -> Result<Self> {
        let mut config: Self = serde_json::from_str(json)?;

        // Migrate if needed
        if config.needs_migration() {
            config.migrate();
        }

        config.validate()?;
        Ok(config)
    }

    /// Check if running in development mode
    pub fn is_development(&self) -> bool {
        self.debug_mode || cfg!(debug_assertions)
    }

    /// Get configuration warnings that don't prevent operation but should be addressed
    pub fn get_warnings(&self) -> Vec<String> {
        let mut warnings = Vec::new();

        // Check for potentially problematic settings
        if self.max_file_size > 1024 * 1024 * 1024 {
            // 1GB
            warnings.push(
                "max_file_size is very large (>1GB) - this may cause memory issues".to_string(),
            );
        }

        if self.cache_size > 1024 * 1024 * 1024 {
            // 1GB
            warnings
                .push("cache_size is very large (>1GB) - this may cause memory issues".to_string());
        }

        if self.max_concurrent_analysis > 10 {
            warnings.push(
                "max_concurrent_analysis is very high (>10) - this may overwhelm your system"
                    .to_string(),
            );
        }

        if self.history_retention > 365 * 24 * 60 * 60 {
            // 1 year in seconds
            warnings.push(
                "history_retention is very long (>1 year) - this may cause database bloat"
                    .to_string(),
            );
        }

        if self.undo_history_size > 10000 {
            warnings.push(
                "undo_history_size is very large (>10000) - this may cause memory issues"
                    .to_string(),
            );
        }

        if !self.default_smart_folder_location.starts_with('/')
            && !self.default_smart_folder_location.contains(':')
        {
            warnings.push("default_smart_folder_location appears to be a relative path - consider using an absolute path".to_string());
        }

        warnings
    }

    /// Check if configuration needs migration to newer version
    pub fn needs_migration(&self) -> bool {
        // For now, just check if ollama_embedding_model is set
        // In the future, add version checking
        self.ollama_embedding_model.is_empty() || self.ollama_vision_model.is_empty()
    }

    /// Migrate configuration to current version
    pub fn migrate(&mut self) {
        if self.ollama_embedding_model.is_empty() {
            self.ollama_embedding_model = "nomic-embed-text".to_string();
        }

        if self.ollama_vision_model.is_empty() {
            self.ollama_vision_model = "llava:7b".to_string();
        }

        // Ensure reasonable defaults for new fields
        if self.notification_duration == 0 {
            self.notification_duration = 5000; // 5 seconds
        }

        if self.history_retention == 0 {
            self.history_retention = 30 * 24 * 60 * 60; // 30 days
        }

        if self.undo_history_size == 0 {
            self.undo_history_size = 100;
        }
    }

    /// Get log filter based on log level
    pub fn get_log_filter(&self) -> String {
        match self.log_level.as_str() {
            "error" => "stratosort=error,tauri=error",
            "warn" => "stratosort=warn,tauri=warn",
            "info" => "stratosort=info,tauri=info",
            "debug" => "stratosort=debug,tauri=debug",
            _ => "stratosort=info,tauri=info",
        }
        .to_string()
    }
}
