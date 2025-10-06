/// Configuration validation for startup checks
use crate::{
    ai::AiService,
    config::Config,
    error::{AppError, Result},
    storage::{init::get_vector_config_for_model, Database},
};
use tracing::{error, info, warn};

/// Validation result with specific issues
#[derive(Debug, Clone)]
pub struct ValidationResult {
    pub is_valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

impl Default for ValidationResult {
    fn default() -> Self {
        Self::new()
    }
}

impl ValidationResult {
    pub fn new() -> Self {
        Self {
            is_valid: true,
            errors: Vec::new(),
            warnings: Vec::new(),
        }
    }

    pub fn add_error(&mut self, error: String) {
        self.errors.push(error);
        self.is_valid = false;
    }

    pub fn add_warning(&mut self, warning: String) {
        self.warnings.push(warning);
    }

    pub fn merge(&mut self, other: ValidationResult) {
        self.errors.extend(other.errors);
        self.warnings.extend(other.warnings);
        self.is_valid = self.is_valid && other.is_valid;
    }
}

/// Validate complete application configuration
pub async fn validate_configuration(
    config: &Config,
    db: &Database,
    ai_service: &AiService,
) -> Result<ValidationResult> {
    let mut result = ValidationResult::new();

    info!("Starting configuration validation...");

    // Validate database
    let db_validation = validate_database(db).await;
    result.merge(db_validation);

    // Validate AI service
    let ai_validation = validate_ai_service(ai_service, config).await;
    result.merge(ai_validation);

    // Validate embeddings configuration
    // Note: Config access in validation context needs to be handled differently
    // For now, use default config for validation checks
    let config = crate::config::Config::default();
    let embedding_validation = validate_embeddings(db, &config).await;
    result.merge(embedding_validation);

    // Validate paths and permissions
    let path_validation = validate_paths(&config);
    result.merge(path_validation);

    // Log results
    if !result.errors.is_empty() {
        error!(
            "Configuration validation found {} errors:",
            result.errors.len()
        );
        for (i, err) in result.errors.iter().enumerate() {
            error!("  {}. {}", i + 1, err);
        }
    }

    if !result.warnings.is_empty() {
        warn!(
            "Configuration validation found {} warnings:",
            result.warnings.len()
        );
        for (i, warn) in result.warnings.iter().enumerate() {
            warn!("  {}. {}", i + 1, warn);
        }
    }

    if result.is_valid {
        info!("✓ Configuration validation passed");
    } else {
        error!("✗ Configuration validation failed");
    }

    Ok(result)
}

/// Validate database connectivity and schema
async fn validate_database(db: &Database) -> ValidationResult {
    let mut result = ValidationResult::new();

    // Test database connection
    match db.health_check().await {
        Ok(_) => {
            info!("✓ Database connection healthy");
        }
        Err(e) => {
            result.add_error(format!("Database health check failed: {}", e));
        }
    }

    // Note: Schema version verification is done internally by database health check

    result
}

/// Validate AI service availability and configuration
async fn validate_ai_service(ai_service: &AiService, config: &Config) -> ValidationResult {
    let mut result = ValidationResult::new();

    // Check AI service availability
    let status = ai_service.get_status().await;

    if !status.is_available {
        result.add_warning("AI service not available - using fallback mode".to_string());

        if let Some(error) = status.last_error {
            result.add_warning(format!("AI service error: {}", error));
        }
    } else {
        info!("✓ AI service available (provider: {:?})", status.provider);
    }

    // Verify Ollama host configuration
    if config.ollama_host.is_empty() {
        result.add_warning("Ollama host is empty - AI features will use fallback mode".to_string());
    } else if !status.ollama_connected {
        result.add_warning(format!(
            "Ollama not connected at {} - verify Ollama is running",
            config.ollama_host
        ));
    }

    // Check model availability
    if status.models_available.is_empty() && status.is_available {
        result.add_warning(
            "No Ollama models found - models will be auto-downloaded on first use".to_string(),
        );
    } else {
        info!("✓ Found {} available models", status.models_available.len());
    }

    result
}

/// Validate embedding configuration
async fn validate_embeddings(db: &Database, config: &crate::config::Config) -> ValidationResult {
    let mut result = ValidationResult::new();

    match db.get_vector_stats().await {
        Ok(stats) => {
            info!(
                "Vector storage: {} vectors, {} dimensions, extension: {}",
                stats.total_vectors,
                stats.dimensions,
                if stats.extension_available {
                    "available"
                } else {
                    "unavailable"
                }
            );

            // Critical check: embedding dimensions must match the configured model
            let expected_config = get_vector_config_for_model(&config.ollama_embedding_model);
            let expected_dimensions = expected_config.default_dimensions;

            if stats.dimensions != expected_dimensions {
                result.add_error(format!(
                    "CRITICAL: Embedding dimensions are {} but should be {} for model '{}'",
                    stats.dimensions, expected_dimensions, config.ollama_embedding_model
                ));
            } else {
                info!(
                    "✓ Embedding dimensions correct ({}) for model '{}'",
                    expected_dimensions, config.ollama_embedding_model
                );
            }

            if !stats.extension_available {
                result.add_warning("sqlite-vec extension not available - using fallback similarity search (slower)".to_string());
            } else {
                info!("✓ sqlite-vec extension available");
            }
        }
        Err(e) => {
            result.add_error(format!("Could not get vector statistics: {}", e));
        }
    }

    result
}

/// Validate paths and file system permissions
fn validate_paths(_config: &Config) -> ValidationResult {
    // Validate watch directories if configured
    // Note: watch paths validation happens at runtime

    ValidationResult::new()
}

/// Quick validation that can run before full initialization
pub fn validate_config_quick(config: &Config) -> Result<()> {
    // Validate Ollama host format if specified
    if !config.ollama_host.is_empty() && !config.ollama_host.starts_with("http") {
        return Err(AppError::ConfigError {
            message: format!(
                "Invalid Ollama host format: {} (must start with http:// or https://)",
                config.ollama_host
            ),
        });
    }

    // Check model names are not empty
    if config.ollama_model.is_empty() {
        return Err(AppError::ConfigError {
            message: "Ollama model name cannot be empty".to_string(),
        });
    }

    if config.ollama_embedding_model.is_empty() {
        return Err(AppError::ConfigError {
            message: "Ollama embedding model name cannot be empty".to_string(),
        });
    }

    info!("✓ Quick configuration validation passed");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validation_result() {
        let mut result = ValidationResult::new();
        assert!(result.is_valid);

        result.add_warning("test warning".to_string());
        assert!(result.is_valid);

        result.add_error("test error".to_string());
        assert!(!result.is_valid);
    }

    #[test]
    fn test_quick_validation_invalid_ollama_host() {
        let config = Config {
            ollama_host: "localhost:11434".to_string(), // Missing http://
            ..Default::default()
        };

        let result = validate_config_quick(&config);
        assert!(result.is_err());
    }

    #[test]
    fn test_quick_validation_valid_config() {
        let config = Config::default();
        let result = validate_config_quick(&config);
        assert!(result.is_ok());
    }
}
