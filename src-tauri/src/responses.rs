use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Standard command response wrapper for consistent frontend error handling
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandResponse<T> {
    /// Indicates if the command succeeded
    pub success: bool,
    /// The response data (only present if success is true)
    pub data: Option<T>,
    /// Error information (only present if success is false)
    pub error: Option<CommandError>,
    /// Additional metadata about the response
    pub metadata: Option<HashMap<String, serde_json::Value>>,
}

/// Error information for failed commands
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandError {
    /// Error type for frontend handling
    pub error_type: String,
    /// User-friendly error message
    pub message: String,
    /// Technical error details (for debugging)
    pub technical_details: Option<String>,
    /// Whether the error is recoverable
    pub recoverable: bool,
    /// Error code for programmatic handling
    pub code: Option<String>,
}

/// Progress information for long-running operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandProgress {
    /// Operation ID for tracking
    pub operation_id: String,
    /// Current progress (0.0 to 1.0)
    pub progress: f32,
    /// Current status message
    pub message: String,
    /// Whether the operation is completed
    pub completed: bool,
    /// Estimated time remaining (optional)
    pub estimated_remaining_seconds: Option<u64>,
}

/// Batch operation response for multiple items
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchResponse<T> {
    /// Total number of items processed
    pub total_items: usize,
    /// Number of successful operations
    pub successful_items: usize,
    /// Number of failed operations
    pub failed_items: usize,
    /// Results for successful operations
    pub results: Vec<T>,
    /// Errors for failed operations
    pub errors: Vec<CommandError>,
    /// Overall success status
    pub success: bool,
}

/// File operation response with detailed information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileOperationResponse {
    /// Path that was operated on
    pub path: String,
    /// Type of operation performed
    pub operation_type: String,
    /// Whether the operation succeeded
    pub success: bool,
    /// Size of the file (if applicable)
    pub size: Option<u64>,
    /// Error information (if failed)
    pub error: Option<CommandError>,
}

/// Pagination information for list responses
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaginationInfo {
    /// Current page number (1-based)
    pub page: usize,
    /// Number of items per page
    pub per_page: usize,
    /// Total number of items across all pages
    pub total_items: usize,
    /// Total number of pages
    pub total_pages: usize,
    /// Whether there are more pages after this one
    pub has_next: bool,
    /// Whether there are pages before this one
    pub has_previous: bool,
}

/// Paginated response for list operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaginatedResponse<T> {
    /// The items for the current page
    pub items: Vec<T>,
    /// Pagination information
    pub pagination: PaginationInfo,
}

impl<T> CommandResponse<T> {
    /// Create a successful response
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
            metadata: None,
        }
    }

    /// Create a successful response with metadata
    pub fn success_with_metadata(data: T, metadata: HashMap<String, serde_json::Value>) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
            metadata: Some(metadata),
        }
    }

    /// Create an error response from an AppError
    pub fn error(error: AppError) -> CommandResponse<()> {
        CommandResponse {
            success: false,
            data: None,
            error: Some(CommandError::from_app_error(error)),
            metadata: None,
        }
    }

    /// Create an error response with custom error information
    pub fn error_with_details(
        error_type: String,
        message: String,
        technical_details: Option<String>,
        recoverable: bool,
    ) -> CommandResponse<()> {
        CommandResponse {
            success: false,
            data: None,
            error: Some(CommandError {
                error_type,
                message,
                technical_details,
                recoverable,
                code: None,
            }),
            metadata: None,
        }
    }
}

impl CommandError {
    /// Create a CommandError from an AppError
    pub fn from_app_error(error: AppError) -> Self {
        Self {
            error_type: error.error_type(),
            message: error.user_message(),
            technical_details: Some(error.to_string()),
            recoverable: error.is_recoverable(),
            code: None,
        }
    }

    /// Create a CommandError with a specific error code
    pub fn with_code(mut self, code: String) -> Self {
        self.code = Some(code);
        self
    }
}

/// Helper macros for creating command responses
#[macro_export]
macro_rules! success_response {
    ($data:expr) => {
        $crate::responses::CommandResponse::success($data)
    };
    ($data:expr, $($key:expr => $value:expr),* $(,)?) => {
        {
            let mut metadata = std::collections::HashMap::new();
            $(
                metadata.insert($key.to_string(), serde_json::json!($value));
            )*
            $crate::responses::CommandResponse::success_with_metadata($data, metadata)
        }
    };
}

#[macro_export]
macro_rules! error_response {
    ($error:expr) => {
        $crate::responses::CommandResponse::error($error)
    };
    ($error_type:expr, $message:expr) => {
        $crate::responses::CommandResponse::error_with_details(
            $error_type,
            $message,
            None,
            true
        )
    };
    ($error_type:expr, $message:expr, $recoverable:expr) => {
        $crate::responses::CommandResponse::error_with_details(
            $error_type,
            $message,
            None,
            $recoverable
        )
    };
}

/// Convert a Result to a CommandResponse
pub trait IntoCommandResponse<T> {
    fn into_response(self) -> CommandResponse<T>
    where
        T: Default;
}

impl<T> IntoCommandResponse<T> for crate::error::Result<T>
where
    T: Default,
{
    fn into_response(self) -> CommandResponse<T> {
        match self {
            Ok(data) => CommandResponse::success(data),
            Err(error) => CommandResponse {
                success: false,
                data: Some(T::default()),
                error: Some(CommandError::from_app_error(error)),
                metadata: None,
            },
        }
    }
}
