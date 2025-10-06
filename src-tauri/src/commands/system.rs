use crate::{
    error::Result,
    state::AppState,
    utils::security::{
        is_path_allowed, validate_and_sanitize_path_legacy as validate_and_sanitize_path,
    },
};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use sysinfo::{Disks, System};
use tauri::AppHandle;
use tauri::{Manager, State};
use tracing::info;

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemInfo {
    pub platform: String,
    pub arch: String,
    pub version: String,
    pub total_memory: u64,
    pub free_memory: u64,
    pub cpu_count: usize,
    pub gpu_available: bool,
    pub home_dir: String,
    pub temp_dir: String,
    pub app_version: String,
    pub rust_version: String,
    pub node_version: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StorageInfo {
    pub total_space: u64,
    pub free_space: u64,
    pub used_space: u64,
    pub app_data_size: u64,
    pub cache_size: u64,
    pub database_size: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DefaultFolders {
    pub home: String,
    pub documents: String,
    pub downloads: String,
    pub pictures: String,
    pub videos: String,
    pub music: String,
    pub desktop: String,
}

#[tauri::command]
pub async fn frontend_ready(app: tauri::AppHandle) -> Result<()> {
    info!("Frontend reported ready - showing main window");

    if let Some(window) = app.get_webview_window("main") {
        // Show the window now that frontend is ready
        if let Err(e) = window.show() {
            tracing::error!("Failed to show window: {}", e);
        }

        // Focus the window
        if let Err(e) = window.set_focus() {
            tracing::error!("Failed to focus window: {}", e);
        }

        info!("Main window shown and focused");
    } else {
        tracing::error!("Main window not found");
    }

    Ok(())
}

#[tauri::command]
pub async fn get_basic_system_info(app: tauri::AppHandle) -> Result<SystemInfo> {
    let mut sys = System::new_all();
    sys.refresh_all();

    let platform = std::env::consts::OS.to_string();
    let arch = std::env::consts::ARCH.to_string();
    let version = System::long_os_version().unwrap_or_else(|| "Unknown".to_string());

    let total_memory = sys.total_memory();
    let free_memory = sys.available_memory();
    let cpu_count = sys.cpus().len();

    // Simple GPU detection (would need more sophisticated detection in production)
    let gpu_available = check_gpu_availability();

    let home_dir = dirs::home_dir()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|| "Unknown".to_string());

    let temp_dir = std::env::temp_dir().display().to_string();

    let app_version = app.package_info().version.to_string();
    let rust_version = rustc_version();
    let node_version = node_version().await;

    Ok(SystemInfo {
        platform,
        arch,
        version,
        total_memory,
        free_memory,
        cpu_count,
        gpu_available,
        home_dir,
        temp_dir,
        app_version,
        rust_version,
        node_version,
    })
}

#[tauri::command]
pub async fn get_storage_info(
    state: State<'_, std::sync::Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<StorageInfo> {
    let disks = Disks::new_with_refreshed_list();

    // Get disk info for app directory
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| crate::error::AppError::ConfigError {
            message: format!("Failed to get app directory: {}", e),
        })?;

    let mut total_space = 0u64;
    let mut free_space = 0u64;

    for disk in &disks {
        if app_dir.starts_with(disk.mount_point()) {
            total_space = disk.total_space();
            free_space = disk.available_space();
            break;
        }
    }

    let used_space = total_space.saturating_sub(free_space);

    // Calculate app-specific sizes
    let app_data_size = calculate_dir_size(&app_dir).await?;
    let cache_size = state.file_cache.current_size();
    let database_size = calculate_database_size(&app_dir).await?;

    Ok(StorageInfo {
        total_space,
        free_space,
        used_space,
        app_data_size,
        cache_size: cache_size as u64,
        database_size,
    })
}

#[tauri::command]
pub async fn get_default_folders(app: tauri::AppHandle) -> Result<DefaultFolders> {
    let home = dirs::home_dir()
        .map(|p| p.display().to_string())
        .unwrap_or_default();

    let documents = app
        .path()
        .document_dir()
        .map(|p| p.display().to_string())
        .unwrap_or_default();

    let downloads = app
        .path()
        .download_dir()
        .map(|p| p.display().to_string())
        .unwrap_or_default();

    let pictures = app
        .path()
        .picture_dir()
        .map(|p| p.display().to_string())
        .unwrap_or_default();

    let videos = app
        .path()
        .video_dir()
        .map(|p| p.display().to_string())
        .unwrap_or_default();

    let music = app
        .path()
        .audio_dir()
        .map(|p| p.display().to_string())
        .unwrap_or_default();

    let desktop = app
        .path()
        .desktop_dir()
        .map(|p| p.display().to_string())
        .unwrap_or_default();

    Ok(DefaultFolders {
        home,
        documents,
        downloads,
        pictures,
        videos,
        music,
        desktop,
    })
}

#[tauri::command]
pub async fn open_folder(path: String, app: tauri::AppHandle) -> Result<()> {
    // Validate and sanitize path to prevent command injection
    let sanitized_path = validate_and_sanitize_path(&path, &app)?;

    // Ensure path exists and is a directory
    if !sanitized_path.exists() || !sanitized_path.is_dir() {
        return Err(crate::error::AppError::InvalidPath {
            message: "Path does not exist or is not a directory".to_string(),
        });
    }

    // Ensure path is within allowed directories
    if !is_path_allowed(&sanitized_path, &app)? {
        return Err(crate::error::AppError::SecurityError {
            message: "Access to this directory is not allowed".to_string(),
        });
    }

    // Use the canonicalized path for maximum security
    let path_str = sanitized_path.to_string_lossy();

    // Enhanced safety check - ensure no shell metacharacters or command injection attempts
    let dangerous_chars = [
        ';', '&', '|', '`', '$', '(', ')', '<', '>', '"', '\'', '\\', '*', '?',
    ];
    if path_str.chars().any(|c| dangerous_chars.contains(&c)) {
        return Err(crate::error::AppError::SecurityError {
            message: "Path contains potentially dangerous characters".to_string(),
        });
    }

    // Ensure path doesn't contain executable patterns
    if path_str.to_lowercase().contains(".exe")
        || path_str.to_lowercase().contains(".bat")
        || path_str.to_lowercase().contains(".cmd")
        || path_str.to_lowercase().contains(".sh")
    {
        return Err(crate::error::AppError::SecurityError {
            message: "Cannot open executable files".to_string(),
        });
    }

    #[cfg(target_os = "windows")]
    {
        // Use explorer with /select to be more specific
        // Pass path as separate argument to prevent injection
        let mut cmd = std::process::Command::new("explorer");
        cmd.arg("/select,").arg(&*sanitized_path);

        // Set environment variables to prevent DLL injection
        cmd.env_clear();
        cmd.env(
            "SYSTEMROOT",
            std::env::var("SYSTEMROOT").unwrap_or_else(|_| "C:\\Windows".to_string()),
        );

        cmd.spawn()
            .map_err(|e| crate::error::AppError::SystemError {
                message: format!("Failed to open folder: {}", e),
            })?;
    }

    #[cfg(target_os = "macos")]
    {
        // Use open with -R for reveal in Finder
        // Pass path as separate argument to prevent injection
        let mut cmd = std::process::Command::new("open");
        cmd.arg("-R").arg(&*sanitized_path);

        // Clear environment for security
        cmd.env_clear();
        cmd.env("PATH", "/usr/bin:/bin");

        cmd.spawn()
            .map_err(|e| crate::error::AppError::SystemError {
                message: format!("Failed to open folder: {}", e),
            })?;
    }

    #[cfg(target_os = "linux")]
    {
        // Use xdg-open with the validated path
        // Pass path as separate argument to prevent injection
        let mut cmd = std::process::Command::new("xdg-open");
        cmd.arg(&*sanitized_path);

        // Clear environment for security
        cmd.env_clear();
        cmd.env("PATH", "/usr/bin:/bin");

        cmd.spawn()
            .map_err(|e| crate::error::AppError::SystemError {
                message: format!("Failed to open folder: {}", e),
            })?;
    }

    Ok(())
}

#[tauri::command]
pub async fn open_with_default(path: String, app: tauri::AppHandle) -> Result<()> {
    // Validate and sanitize path to prevent command injection
    let sanitized_path = validate_and_sanitize_path(&path, &app)?;

    // Ensure path exists
    if !sanitized_path.exists() {
        return Err(crate::error::AppError::FileNotFound {
            path: sanitized_path.display().to_string(),
        });
    }

    // Ensure path is within allowed directories
    if !is_path_allowed(&sanitized_path, &app)? {
        return Err(crate::error::AppError::SecurityError {
            message: "Access to this file is not allowed".to_string(),
        });
    }

    // Additional security check - prevent opening of potentially dangerous files
    let path_str = sanitized_path.to_string_lossy().to_lowercase();
    let dangerous_extensions = [
        ".exe", ".bat", ".cmd", ".com", ".scr", ".pif", ".vbs", ".js", ".jar",
    ];

    if dangerous_extensions
        .iter()
        .any(|ext| path_str.ends_with(ext))
    {
        return Err(crate::error::AppError::SecurityError {
            message: "Cannot open potentially dangerous file types".to_string(),
        });
    }

    #[cfg(target_os = "windows")]
    {
        let mut cmd = std::process::Command::new("cmd");
        cmd.args(["/c", "start", ""]).arg(&*sanitized_path);
        cmd.env_clear();
        cmd.env(
            "SYSTEMROOT",
            std::env::var("SYSTEMROOT").unwrap_or_else(|_| "C:\\Windows".to_string()),
        );

        cmd.spawn()
            .map_err(|e| crate::error::AppError::SystemError {
                message: format!("Failed to open file: {}", e),
            })?;
    }

    #[cfg(target_os = "macos")]
    {
        let mut cmd = std::process::Command::new("open");
        cmd.arg(&*sanitized_path);
        cmd.env_clear();
        cmd.env("PATH", "/usr/bin:/bin");

        cmd.spawn()
            .map_err(|e| crate::error::AppError::SystemError {
                message: format!("Failed to open file: {}", e),
            })?;
    }

    #[cfg(target_os = "linux")]
    {
        let mut cmd = std::process::Command::new("xdg-open");
        cmd.arg(&*sanitized_path);
        cmd.env_clear();
        cmd.env("PATH", "/usr/bin:/bin");

        cmd.spawn()
            .map_err(|e| crate::error::AppError::SystemError {
                message: format!("Failed to open file: {}", e),
            })?;
    }

    Ok(())
}

#[tauri::command]
pub async fn show_in_folder(path: String, app: tauri::AppHandle) -> Result<()> {
    // Validate and sanitize path to prevent command injection
    let sanitized_path = validate_and_sanitize_path(&path, &app)?;

    // Ensure path exists
    if !sanitized_path.exists() {
        return Err(crate::error::AppError::FileNotFound {
            path: sanitized_path.display().to_string(),
        });
    }

    // Ensure path is within allowed directories
    if !is_path_allowed(&sanitized_path, &app)? {
        return Err(crate::error::AppError::SecurityError {
            message: "Access to this file is not allowed".to_string(),
        });
    }

    let _parent = sanitized_path
        .parent()
        .ok_or_else(|| crate::error::AppError::InvalidPath {
            message: "Cannot get parent directory".to_string(),
        })?;

    let _path_str = sanitized_path.display().to_string();

    #[cfg(target_os = "windows")]
    {
        let mut cmd = std::process::Command::new("explorer");
        cmd.arg("/select,").arg(&*sanitized_path);
        cmd.env_clear();
        cmd.env(
            "SYSTEMROOT",
            std::env::var("SYSTEMROOT").unwrap_or_else(|_| "C:\\Windows".to_string()),
        );

        cmd.spawn()
            .map_err(|e| crate::error::AppError::SystemError {
                message: format!("Failed to show file in folder: {}", e),
            })?;
    }

    #[cfg(target_os = "macos")]
    {
        let mut cmd = std::process::Command::new("open");
        cmd.arg("-R").arg(&*sanitized_path);
        cmd.env_clear();
        cmd.env("PATH", "/usr/bin:/bin");

        cmd.spawn()
            .map_err(|e| crate::error::AppError::SystemError {
                message: format!("Failed to show file in folder: {}", e),
            })?;
    }

    #[cfg(target_os = "linux")]
    {
        // Try to use file manager with selection support
        let mut nautilus_cmd = std::process::Command::new("nautilus");
        nautilus_cmd.arg("--select").arg(&*sanitized_path);
        nautilus_cmd.env_clear();
        nautilus_cmd.env("PATH", "/usr/bin:/bin");

        if nautilus_cmd.spawn().is_ok() {
            return Ok(());
        }

        // Fallback to opening parent directory
        let mut xdg_cmd = std::process::Command::new("xdg-open");
        xdg_cmd.arg(parent);
        xdg_cmd.env_clear();
        xdg_cmd.env("PATH", "/usr/bin:/bin");

        xdg_cmd
            .spawn()
            .map_err(|e| crate::error::AppError::SystemError {
                message: format!("Failed to open parent folder: {}", e),
            })?;
    }

    Ok(())
}

#[tauri::command]
pub async fn clear_cache(state: State<'_, std::sync::Arc<AppState>>) -> Result<ClearCacheResult> {
    let before_size = state.file_cache.current_size();

    // Clear file cache
    state.file_cache.clear();

    // Clean up database
    state.cleanup_cache().await?;

    let after_size = state.file_cache.current_size();
    let freed = before_size.saturating_sub(after_size);

    Ok(ClearCacheResult {
        freed_bytes: freed,
        success: true,
    })
}

#[tauri::command]
pub async fn get_app_logs(app: tauri::AppHandle, lines: Option<usize>) -> Result<Vec<String>> {
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|e| crate::error::AppError::ConfigError {
            message: format!("Failed to get log directory: {}", e),
        })?;

    let log_file = log_dir.join("stratosort.log");

    if !log_file.exists() {
        return Ok(vec![]);
    }

    let content = tokio::fs::read_to_string(&log_file).await?;
    let all_lines: Vec<String> = content.lines().map(|l| l.to_string()).collect();

    if let Some(n) = lines {
        let start = all_lines.len().saturating_sub(n);
        Ok(all_lines[start..].to_vec())
    } else {
        Ok(all_lines)
    }
}

#[tauri::command]
pub async fn restart_app(app: tauri::AppHandle) -> Result<()> {
    // Note: app.restart() terminates the process, so this function never returns
    app.restart();
}

#[tauri::command]
pub async fn check_for_updates(_app: tauri::AppHandle) -> Result<UpdateInfo> {
    let current_version = env!("CARGO_PKG_VERSION").to_string();

    // Check for updates from GitHub releases
    match check_github_releases(&current_version).await {
        Ok(update_info) => Ok(update_info),
        Err(e) => {
            tracing::warn!("Failed to check for updates: {}", e);
            // Return current version info on failure
            Ok(UpdateInfo {
                update_available: false,
                current_version: current_version.clone(),
                latest_version: current_version.clone(),
                download_url: None,
                release_notes: None,
            })
        }
    }
}

async fn check_github_releases(current_version: &str) -> Result<UpdateInfo> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .user_agent("StratoSort/1.0")
        .build()?;

    // GitHub API endpoint for latest release
    let url = "https://api.github.com/repos/StratoSortTeam/StratoSortRust/releases/latest";

    let response = client.get(url).send().await?;
    let release: GitHubRelease = response.json().await?;

    let latest_version = release
        .tag_name
        .strip_prefix('v')
        .unwrap_or(&release.tag_name);
    let update_available = is_newer_version(current_version, latest_version);

    Ok(UpdateInfo {
        update_available,
        current_version: current_version.to_string(),
        latest_version: latest_version.to_string(),
        download_url: find_download_url(&release.assets),
        release_notes: Some(release.body),
    })
}

fn is_newer_version(current: &str, latest: &str) -> bool {
    use std::cmp::Ordering;

    let current_parts: Vec<u32> = current.split('.').filter_map(|s| s.parse().ok()).collect();
    let latest_parts: Vec<u32> = latest.split('.').filter_map(|s| s.parse().ok()).collect();

    let max_len = current_parts.len().max(latest_parts.len());

    for i in 0..max_len {
        let current_part = current_parts.get(i).unwrap_or(&0);
        let latest_part = latest_parts.get(i).unwrap_or(&0);

        match current_part.cmp(latest_part) {
            Ordering::Less => return true,
            Ordering::Greater => return false,
            Ordering::Equal => continue,
        }
    }

    false
}

fn find_download_url(assets: &[GitHubAsset]) -> Option<String> {
    #[cfg(target_os = "windows")]
    let pattern = ".msi";
    #[cfg(target_os = "macos")]
    let pattern = ".dmg";
    #[cfg(target_os = "linux")]
    let pattern = ".AppImage";

    assets
        .iter()
        .find(|asset| asset.name.contains(pattern))
        .map(|asset| asset.browser_download_url.clone())
}

fn check_gpu_availability() -> bool {
    // Simple check - in production, you'd use a proper GPU detection library
    #[cfg(target_os = "windows")]
    {
        // Check for DirectX or Vulkan support
        true
    }

    #[cfg(target_os = "macos")]
    {
        // macOS always has Metal support
        true
    }

    #[cfg(target_os = "linux")]
    {
        // Check for GPU drivers
        std::path::Path::new("/dev/dri").exists()
    }
}

fn rustc_version() -> String {
    // Use RUST_VERSION set by build.rs, fallback to package version
    option_env!("RUST_VERSION")
        .unwrap_or(env!("CARGO_PKG_VERSION"))
        .to_string()
}

async fn node_version() -> String {
    match tokio::process::Command::new("node")
        .arg("--version")
        .output()
        .await
    {
        Ok(output) => String::from_utf8_lossy(&output.stdout).trim().to_string(),
        Err(_) => "Unknown".to_string(),
    }
}

async fn calculate_dir_size(dir: &PathBuf) -> Result<u64> {
    calculate_dir_size_with_depth(dir, 0, 20).await // Max depth of 20 to prevent infinite recursion
}

async fn calculate_dir_size_with_depth(
    dir: &PathBuf,
    current_depth: u32,
    max_depth: u32,
) -> Result<u64> {
    // Prevent infinite recursion
    if current_depth > max_depth {
        return Err(crate::error::AppError::SecurityError {
            message: "Directory traversal depth limit exceeded".to_string(),
        });
    }

    let mut size = 0u64;
    let mut entries = tokio::fs::read_dir(dir).await?;

    // Track visited paths to detect symlink loops
    let canonical_dir = dir
        .canonicalize()
        .map_err(|_| crate::error::AppError::SecurityError {
            message: "Failed to canonicalize directory path".to_string(),
        })?;

    while let Some(entry) = entries.next_entry().await? {
        let entry_path = entry.path();
        let metadata = entry.metadata().await?;

        if metadata.is_file() {
            size += metadata.len();
        } else if metadata.is_dir() {
            // Check if this is a symlink to prevent loops
            let symlink_metadata = tokio::fs::symlink_metadata(&entry_path).await?;
            if symlink_metadata.file_type().is_symlink() {
                // Skip symlinks to prevent traversal attacks and infinite loops
                continue;
            }

            // Ensure we don't traverse outside the original directory tree
            let canonical_entry =
                entry_path
                    .canonicalize()
                    .map_err(|_| crate::error::AppError::SecurityError {
                        message: "Failed to canonicalize entry path".to_string(),
                    })?;

            if !canonical_entry.starts_with(&canonical_dir) {
                // Skip directories that would take us outside the original tree
                continue;
            }

            size += Box::pin(calculate_dir_size_with_depth(
                &entry_path,
                current_depth + 1,
                max_depth,
            ))
            .await?;
        }
    }

    Ok(size)
}

async fn calculate_database_size(app_dir: &Path) -> Result<u64> {
    let db_file = app_dir.join("stratosort.db");
    if db_file.exists() {
        let metadata = tokio::fs::metadata(&db_file).await?;
        Ok(metadata.len())
    } else {
        Ok(0)
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ClearCacheResult {
    pub freed_bytes: usize,
    pub success: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateInfo {
    pub update_available: bool,
    pub current_version: String,
    pub latest_version: String,
    pub download_url: Option<String>,
    pub release_notes: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    body: String,
    assets: Vec<GitHubAsset>,
}

#[derive(Debug, Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
}

/// Gracefully shutdown the application
#[tauri::command]
pub async fn shutdown_application(
    state: State<'_, std::sync::Arc<AppState>>,
    app_handle: AppHandle,
) -> Result<String> {
    tracing::info!("Shutdown requested via command");

    // Perform graceful shutdown
    if let Err(e) = state.shutdown().await {
        tracing::error!("Error during shutdown: {}", e);
        return Ok(format!("Shutdown completed with errors: {}", e));
    }

    // Give a moment for cleanup to complete
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    // Exit the application
    app_handle.exit(0);

    Ok("Application shutdown initiated".to_string())
}

/// Get current resource usage
#[tauri::command]
pub async fn get_resource_usage(
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<crate::state::ResourceUsage> {
    Ok(state.get_resource_usage().await)
}

/// Force close the application (emergency shutdown)
#[tauri::command]
pub async fn force_shutdown(app_handle: AppHandle) -> Result<String> {
    tracing::warn!("Force shutdown requested");

    // Immediate exit without cleanup
    app_handle.exit(1);

    Ok("Force shutdown initiated".to_string())
}
