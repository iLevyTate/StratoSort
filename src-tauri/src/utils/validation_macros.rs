/// Macro to validate paths in Tauri commands
/// Usage: #[validate_paths(source_path, target_path)]
/// This will validate all specified path parameters before executing the command
#[macro_export]
macro_rules! validate_paths {
    ($app:expr, $($path:ident),*) => {
        $(
            let $path = match $crate::utils::security::validate_and_sanitize_path(&$path, &$app) {
                Ok(validated) => validated.canonical().to_string_lossy().to_string(),
                Err(e) => return Err(e.into()),
            };
        )*
    };
}

/// Macro to validate a single path parameter
/// Usage: validate_path!(app, directory_path)
#[macro_export]
macro_rules! validate_path {
    ($app:expr, $path:expr) => {
        match $crate::utils::security::validate_and_sanitize_path($path, &$app) {
            Ok(validated) => validated.canonical().to_string_lossy().to_string(),
            Err(e) => return Err(e.into()),
        }
    };
}

/// Macro to validate paths with custom error handling
/// Usage: validate_paths_or!(app, source_path, target_path, "Custom error message")
#[macro_export]
macro_rules! validate_paths_or {
    ($app:expr, $($path:ident),*, $error_msg:expr) => {
        $(
            let $path = match $crate::utils::security::validate_and_sanitize_path(&$path, &$app) {
                Ok(validated) => validated.canonical().to_string_lossy().to_string(),
                Err(_) => return Err($crate::error::AppError::SecurityError {
                    message: $error_msg.to_string(),
                }),
            };
        )*
    };
}
