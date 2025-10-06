use crate::error::Result;
use tracing::{debug, info, warn};

/// Initialize sqlite-vec extension at the SQLite connection level
/// This should be called early in the application lifecycle
///
/// # Safety
///
/// This function contains an unsafe block that calls the SQLite C FFI.
/// The safety guarantees are:
///
/// 1. **Function Contract**: `sqlite3_vec_init()` is a well-defined C function
///    from the sqlite-vec library that follows SQLite's extension initialization
///    protocol. It registers vector search functions with SQLite.
///
/// 2. **Memory Safety**: The function does not take ownership of any memory,
///    does not return pointers, and performs no manual memory allocation that
///    Rust needs to manage. SQLite manages all extension lifecycle internally.
///
/// 3. **Thread Safety**: While the function modifies global SQLite state, it is
///    designed to be called during application initialization before concurrent
///    database access begins.
///
/// 4. **Side Effects**: The only side effect is registering the vec0 virtual table
///    module with SQLite, which is the intended behavior.
///
/// # Panics
///
/// This function does not panic. The underlying C function has no documented
/// panic conditions.
pub fn initialize_sqlite_vec() -> Result<()> {
    // Register sqlite-vec extension with SQLite
    // Note: sqlite-vec init function returns void, so we handle errors differently
    unsafe {
        // SAFETY: See function-level safety documentation above.
        // This registers the extension globally for all new SQLite connections.
        // The sqlite-vec crate provides this function as a standard SQLite extension
        // initialization function with the signature: extern "C" fn() -> ()
        sqlite_vec::sqlite3_vec_init();
        debug!("sqlite-vec extension initialization called");
    }

    // Skip runtime verification since it causes runtime conflicts
    // The extension availability will be verified later during actual database operations

    info!("sqlite-vec extension initialization completed");
    Ok(())
}

/// Check if sqlite-vec extension can be loaded
pub async fn check_vec_extension_availability() -> bool {
    use sqlx::sqlite::SqlitePool;

    // Create a temporary in-memory connection to test
    let pool_result = SqlitePool::connect("sqlite::memory:").await;

    match pool_result {
        Ok(pool) => {
            // Try to call vec_version function
            let version_result = sqlx::query_scalar::<_, String>("SELECT vec_version()")
                .fetch_one(&pool)
                .await;

            match version_result {
                Ok(version) => {
                    debug!("sqlite-vec extension is available, version: {}", version);
                    pool.close().await;
                    true
                }
                Err(_) => {
                    debug!("sqlite-vec extension functions not available");
                    pool.close().await;
                    false
                }
            }
        }
        Err(e) => {
            warn!("Failed to create test SQLite connection: {}", e);
            false
        }
    }
}

/// Alternative initialization method using rusqlite for applications that need it
///
/// # Safety
///
/// This function contains an unsafe block with a `transmute` operation for FFI.
/// The safety guarantees are:
///
/// 1. **Transmute Safety**: We are converting a function pointer to a void pointer
///    for SQLite's C API. The transmute is necessary because:
///    - `sqlite3_auto_extension` expects: `Option<unsafe extern "C" fn(*mut sqlite3_api_routines) -> c_int>`
///    - We have: `extern "C" fn() -> ()`
///    - SQLite will call the function pointer with the correct signature
///
/// 2. **Function Pointer Validity**: The `sqlite3_vec_init` function is statically
///    linked from the sqlite-vec crate and remains valid for the program lifetime.
///    There is no risk of dangling function pointers.
///
/// 3. **SQLite Contract**: We're following SQLite's documented pattern for
///    auto-loading extensions. See: https://www.sqlite.org/c3ref/auto_extension.html
///
/// 4. **Error Handling**: The function checks the return code and propagates errors
///    via Result rather than panicking.
///
/// # Alternatives Considered
///
/// This pattern is unavoidable when working with SQLite's C API from Rust.
/// Alternative approaches would require wrapping the entire SQLite library,
/// which the rusqlite crate already does safely for most operations.
#[cfg(feature = "rusqlite-init")]
pub fn initialize_with_rusqlite() -> Result<()> {
    use crate::error::AppError;
    use rusqlite::{ffi::sqlite3_auto_extension, Connection};

    // Register sqlite-vec extension to auto-load with new connections
    unsafe {
        // SAFETY: See function-level safety documentation above.
        // This transmute is the standard pattern for SQLite extension auto-loading.
        // The function pointer is valid for the program lifetime, and SQLite will
        // invoke it with the correct calling convention.
        let result = sqlite3_auto_extension(Some(std::mem::transmute(
            sqlite_vec::sqlite3_vec_init as *const (),
        )));

        if result != 0 {
            return Err(AppError::DatabaseError {
                message: format!("Failed to auto-register sqlite-vec extension: {}", result),
            });
        }
    }

    // Test the extension works
    let conn = Connection::open_in_memory().map_err(|e| AppError::DatabaseError {
        message: format!("Failed to create test connection: {}", e),
    })?;

    let version: Result<String, _> = conn.query_row("SELECT vec_version()", [], |row| row.get(0));

    match version {
        Ok(ver) => {
            info!(
                "sqlite-vec extension verified with rusqlite, version: {}",
                ver
            );
            Ok(())
        }
        Err(e) => Err(AppError::DatabaseError {
            message: format!("sqlite-vec extension not working: {}", e),
        }),
    }
}

/// Configuration for vector extension
#[derive(Debug, Clone)]
pub struct VectorConfig {
    pub default_dimensions: usize,
    pub enable_quantization: bool,
    pub use_experimental_features: bool,
}

impl Default for VectorConfig {
    fn default() -> Self {
        Self {
            default_dimensions: 768, // Standard for nomic-embed-text (full model output)
            enable_quantization: false,
            use_experimental_features: false,
        }
    }
}

/// Get recommended vector configuration based on the embedding model
pub fn get_vector_config_for_model(model_name: &str) -> VectorConfig {
    let mut config = VectorConfig::default();

    match model_name {
        "nomic-embed-text" => {
            config.default_dimensions = 768; // Full model dimensions (Matryoshka learning supports 256-768)
        }
        "text-embedding-ada-002" => {
            config.default_dimensions = 1536;
        }
        "sentence-transformers/all-MiniLM-L6-v2" => {
            config.default_dimensions = 384;
        }
        "sentence-transformers/all-mpnet-base-v2" => {
            config.default_dimensions = 768;
        }
        _ => {
            warn!(
                "Unknown embedding model: {}, using default config",
                model_name
            );
        }
    }

    config
}
