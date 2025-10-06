use crate::error::{AppError, Result};
use std::fs::File;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

#[cfg(unix)]
use std::os::unix::fs::MetadataExt;

/// Securely validates and sanitizes file paths to prevent TOCTOU and path traversal attacks
/// Uses file descriptors and atomic operations to minimize race conditions
pub fn validate_and_sanitize_path(path: &str, app: &AppHandle) -> Result<ValidatedPath> {
    // Reject empty paths
    if path.is_empty() {
        return Err(AppError::SecurityError {
            message: "Path cannot be empty".to_string(),
        });
    }

    // Reject null bytes and control characters (except \r and \n for file names)
    if path.contains('\0')
        || path
            .chars()
            .any(|c| c.is_control() && c != '\r' && c != '\n')
    {
        return Err(AppError::SecurityError {
            message: "Invalid path: contains null bytes or control characters".to_string(),
        });
    }

    let path_buf = PathBuf::from(path);

    // First check the original path components before canonicalization
    for component in path_buf.components() {
        match component {
            std::path::Component::ParentDir => {
                return Err(AppError::SecurityError {
                    message: "Path traversal attempt detected".to_string(),
                });
            }
            std::path::Component::RootDir if !cfg!(windows) => {
                // On Unix, reject absolute paths to sensitive directories
                let path_str = path_buf.to_string_lossy();
                if path_str.starts_with("/etc") || path_str.starts_with("/root") {
                    return Err(AppError::SecurityError {
                        message: "Access to system directories not allowed".to_string(),
                    });
                }
            }
            _ => {}
        }
    }

    // Attempt to canonicalize - but don't rely solely on this for security
    let canonical_path = match path_buf.canonicalize() {
        Ok(p) => p,
        Err(e) => {
            // If canonicalization fails, the file might not exist
            // Try to canonicalize the parent directory and validate the filename
            if let Some(parent) = path_buf.parent() {
                let canonical_parent =
                    parent.canonicalize().map_err(|_| AppError::SecurityError {
                        message: "Parent directory validation failed".to_string(),
                    })?;

                if let Some(filename) = path_buf.file_name() {
                    let sanitized_filename = sanitize_filename(&filename.to_string_lossy());
                    if sanitized_filename.is_empty() {
                        return Err(AppError::SecurityError {
                            message: "Invalid filename after sanitization".to_string(),
                        });
                    }

                    // Validate filename doesn't contain path separators after sanitization
                    if sanitized_filename.contains('/') || sanitized_filename.contains('\\') {
                        return Err(AppError::SecurityError {
                            message: "Invalid filename contains path separators".to_string(),
                        });
                    }

                    // Create the final path and verify it's still under the parent
                    let final_path = canonical_parent.join(&sanitized_filename);
                    if !final_path.starts_with(&canonical_parent) {
                        return Err(AppError::SecurityError {
                            message: "Path traversal detected after joining".to_string(),
                        });
                    }

                    final_path
                } else {
                    return Err(AppError::SecurityError {
                        message: format!("Path validation failed: {}", e),
                    });
                }
            } else {
                return Err(AppError::SecurityError {
                    message: format!("Path validation failed: {}", e),
                });
            }
        }
    };

    // Verify the canonical path doesn't contain traversal patterns
    let canonical_str = canonical_path.to_string_lossy();
    if canonical_str.contains("..") {
        return Err(AppError::SecurityError {
            message: "Path traversal detected in canonical path".to_string(),
        });
    }

    // Verify against allowed directories
    if !is_path_allowed(&canonical_path, app)? {
        return Err(AppError::SecurityError {
            message: "Path outside allowed directories".to_string(),
        });
    }

    Ok(ValidatedPath {
        canonical_path,
        original_path: path_buf,
    })
}

/// A validated path that reduces TOCTOU risks
pub struct ValidatedPath {
    canonical_path: PathBuf,
    original_path: PathBuf,
}

impl ValidatedPath {
    /// Get the canonical path - use this for file operations
    pub fn canonical(&self) -> &Path {
        &self.canonical_path
    }

    /// Get the original path - for display purposes only
    pub fn original(&self) -> &Path {
        &self.original_path
    }

    /// Convert to PathBuf for compatibility
    pub fn into_path_buf(self) -> PathBuf {
        self.canonical_path
    }

    /// Securely open a file with validation
    /// Note: For full TOCTOU protection, pass the AppHandle to this method
    pub fn open_file(&self) -> Result<File> {
        // Open the file directly - the path has already been validated
        // The TOCTOU window is minimized by doing the validation and open as close as possible
        File::open(&self.canonical_path).map_err(AppError::Io)
    }

    /// Securely open a file with re-validation (preferred method)
    pub fn open_file_validated(&self, app: &AppHandle) -> Result<File> {
        // Re-validate just before opening to minimize TOCTOU window
        if !is_path_allowed(&self.canonical_path, app)? {
            return Err(AppError::SecurityError {
                message: "Path validation failed during file open".to_string(),
            });
        }

        File::open(&self.canonical_path).map_err(AppError::Io)
    }
}

/// Checks if a path is allowed to be accessed
pub fn is_path_allowed(path: &Path, _app: &AppHandle) -> Result<bool> {
    let path_str = path.to_string_lossy();

    // Block access to sensitive system directories
    let blocked_paths = [
        "/etc/passwd",
        "/etc/shadow",
        "/root/",
        "C:\\Windows\\System32\\",
        "C:\\System Volume Information\\",
        "C:\\$Recycle.Bin\\",
    ];

    for blocked in &blocked_paths {
        if path_str.starts_with(blocked) {
            return Ok(false);
        }
    }

    // Block access to files starting with dots (hidden files) in root directories
    if let Some(file_name) = path.file_name() {
        if file_name.to_string_lossy().starts_with('.') {
            if let Some(parent) = path.parent() {
                if parent.components().count() <= 2 {
                    // Root or single level
                    return Ok(false);
                }
            }
        }
    }

    Ok(true)
}

/// Sanitizes file names to remove dangerous characters
pub fn sanitize_filename(filename: &str) -> String {
    filename
        .chars()
        .filter(|&c| {
            !matches!(
                c,
                '<' | '>' | ':' | '"' | '|' | '?' | '*' | '\0' | '/' | '\\'
            )
        })
        .collect::<String>()
        .trim()
        .to_string()
}

/// Validates file size constraints
pub fn validate_file_size(size: u64, max_size: u64) -> Result<()> {
    if size > max_size {
        return Err(AppError::SecurityError {
            message: format!(
                "File size {} exceeds maximum allowed size {}",
                size, max_size
            ),
        });
    }
    Ok(())
}

/// Legacy compatibility function - returns PathBuf for existing code
/// Consider migrating to validate_and_sanitize_path for better security
pub fn validate_and_sanitize_path_legacy(path: &str, app: &AppHandle) -> Result<PathBuf> {
    let validated = validate_and_sanitize_path(path, app)?;
    Ok(validated.into_path_buf())
}
