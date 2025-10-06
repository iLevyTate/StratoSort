use chrono;
use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("File not found: {path}")]
    FileNotFound { path: String },

    #[error("Resource not found: {message}")]
    NotFound { message: String },

    #[error("Access denied: {path}")]
    AccessDenied { path: String },

    #[error("Invalid path: {message}")]
    InvalidPath { message: String },

    #[error("AI service error: {message}")]
    AiError { message: String },

    #[error("Database error: {message}")]
    DatabaseError { message: String },

    #[error("Configuration error: {message}")]
    ConfigError { message: String },

    #[error("Network error: {message}")]
    NetworkError { message: String },

    #[error("Resource limit exceeded: {message}")]
    ResourceLimitExceeded { message: String },

    #[error("Parse error: {message}")]
    ParseError { message: String },

    #[error("Processing error: {message}")]
    ProcessingError { message: String },

    #[error("Operation cancelled")]
    Cancelled,

    #[error("Resource not available: {resource}")]
    ResourceNotAvailable { resource: String },

    #[error("Invalid input: {message}")]
    InvalidInput { message: String },

    #[error("Security error: {message}")]
    SecurityError { message: String },

    #[error("System error: {message}")]
    SystemError { message: String },

    #[error("Storage full")]
    StorageFull,

    #[error("Model not found: {model}")]
    ModelNotFound { model: String },

    #[error("Operation timed out: {message}")]
    Timeout { message: String },

    #[error("Validation error for {field}: {message}")]
    ValidationError { field: String, message: String },

    #[error("Invalid operation: {message}")]
    InvalidOperation { message: String },

    #[error("Too many requests: {message}")]
    TooManyRequests { message: String },

    #[error(transparent)]
    Io(#[from] std::io::Error),

    #[error(transparent)]
    Tauri(#[from] tauri::Error),

    #[error(transparent)]
    SqlxError(#[from] sqlx::Error),

    #[error(transparent)]
    SerdeJson(#[from] serde_json::Error),

    #[error(transparent)]
    NotifyError(#[from] notify::Error),

    #[error(transparent)]
    ReqwestError(#[from] reqwest::Error),

    #[cfg(feature = "zip")]
    #[error(transparent)]
    ZipError(#[from] zip::result::ZipError),

    #[error(transparent)]
    Other(#[from] anyhow::Error),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        // Create a sanitized error response
        let error_response = ErrorResponse {
            error_type: self.error_type(),
            message: self.user_message(),
            recoverable: self.is_recoverable(),
        };

        error_response.serialize(serializer)
    }
}

#[derive(Serialize)]
struct ErrorResponse {
    error_type: String,
    message: String,
    recoverable: bool,
}

impl AppError {
    /// Returns a user-friendly error message
    pub fn user_message(&self) -> String {
        match self {
            Self::FileNotFound { .. } => "The requested file could not be found".to_string(),
            Self::NotFound { message } => format!("Not found: {}", message),
            Self::AccessDenied { .. } => "Access to this resource is denied".to_string(),
            Self::InvalidPath { .. } => "The provided path is invalid".to_string(),
            Self::AiError { .. } => "AI service is temporarily unavailable".to_string(),
            Self::DatabaseError { .. } => "Database operation failed".to_string(),
            Self::ConfigError { .. } => "Configuration is invalid".to_string(),
            Self::NetworkError { .. } => "Network connection failed".to_string(),
            Self::ParseError { .. } => "Failed to parse the data".to_string(),
            Self::ProcessingError { message } => message.clone(),
            Self::Cancelled => "Operation was cancelled".to_string(),
            Self::ResourceNotAvailable { resource } => format!("{} is not available", resource),
            Self::InvalidInput { message } => message.clone(),
            Self::SecurityError { .. } => "Security violation detected".to_string(),
            Self::SystemError { .. } => "System operation failed".to_string(),
            Self::StorageFull => "Storage space is full".to_string(),
            Self::ModelNotFound { model } => format!("Model '{}' is not installed", model),
            Self::Io(_) => "File operation failed".to_string(),
            Self::Tauri(_) => "Application error occurred".to_string(),
            Self::SqlxError(_) => "Database error occurred".to_string(),
            Self::SerdeJson(_) => "Data processing error".to_string(),
            Self::NotifyError(_) => "File watching error occurred".to_string(),
            Self::ReqwestError(_) => "Network request failed".to_string(),
            #[cfg(feature = "zip")]
            Self::ZipError(_) => "Archive processing error".to_string(),
            Self::Other(_) => "An unexpected error occurred".to_string(),
            Self::ResourceLimitExceeded { message } => message.clone(),
            Self::Timeout { message } => message.clone(),
            Self::ValidationError { field: _, message } => message.clone(),
            Self::InvalidOperation { message } => message.clone(),
            Self::TooManyRequests { message } => message.clone(),
        }
    }

    /// Returns the error type for frontend handling
    pub fn error_type(&self) -> String {
        match self {
            Self::FileNotFound { .. } => "FILE_NOT_FOUND",
            Self::NotFound { .. } => "NOT_FOUND",
            Self::AccessDenied { .. } => "ACCESS_DENIED",
            Self::InvalidPath { .. } => "INVALID_PATH",
            Self::AiError { .. } => "AI_ERROR",
            Self::DatabaseError { .. } => "DATABASE_ERROR",
            Self::ConfigError { .. } => "CONFIG_ERROR",
            Self::NetworkError { .. } => "NETWORK_ERROR",
            Self::ParseError { .. } => "PARSE_ERROR",
            Self::ProcessingError { .. } => "PROCESSING_ERROR",
            Self::Cancelled => "CANCELLED",
            Self::ResourceNotAvailable { .. } => "RESOURCE_NOT_AVAILABLE",
            Self::InvalidInput { .. } => "INVALID_INPUT",
            Self::SecurityError { .. } => "SECURITY_ERROR",
            Self::SystemError { .. } => "SYSTEM_ERROR",
            Self::StorageFull => "STORAGE_FULL",
            Self::ModelNotFound { .. } => "MODEL_NOT_FOUND",
            Self::Timeout { .. } => "TIMEOUT",
            Self::Io(_) => "IO_ERROR",
            Self::Tauri(_) => "TAURI_ERROR",
            Self::SqlxError(_) => "DATABASE_ERROR",
            Self::SerdeJson(_) => "PARSE_ERROR",
            Self::NotifyError(_) => "FILE_WATCHER_ERROR",
            Self::ReqwestError(_) => "NETWORK_ERROR",
            #[cfg(feature = "zip")]
            Self::ZipError(_) => "ARCHIVE_ERROR",
            Self::Other(_) => "UNKNOWN_ERROR",
            Self::ResourceLimitExceeded { .. } => "RESOURCE_LIMIT_EXCEEDED",
            Self::ValidationError { .. } => "VALIDATION_ERROR",
            Self::InvalidOperation { .. } => "INVALID_OPERATION",
            Self::TooManyRequests { .. } => "TOO_MANY_REQUESTS",
        }
        .to_string()
    }

    /// Indicates if the error is recoverable
    pub fn is_recoverable(&self) -> bool {
        !matches!(
            self,
            Self::StorageFull
                | Self::AccessDenied { .. }
                | Self::ConfigError { .. }
                | Self::SecurityError { .. }
        )
    }

    /// Returns the complete error source chain for debugging
    pub fn source_chain(&self) -> Vec<String> {
        let mut chain = vec![self.to_string()];
        let mut current: &dyn std::error::Error = self;

        while let Some(source) = current.source() {
            chain.push(source.to_string());
            current = source;
        }

        chain
    }

    /// Returns detailed error information including source chain
    pub fn detailed_info(&self) -> serde_json::Value {
        serde_json::json!({
            "error_type": self.error_type(),
            "message": self.user_message(),
            "technical_details": self.to_string(),
            "recoverable": self.is_recoverable(),
            "source_chain": self.source_chain(),
            "timestamp": chrono::Utc::now().to_rfc3339()
        })
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
