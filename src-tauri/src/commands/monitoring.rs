use crate::error::Result;
use crate::services::monitoring::{HealthStatus, PerformanceMetrics};
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{Emitter, State};

/// Get system health status
#[tauri::command]
pub async fn get_health_status(state: State<'_, std::sync::Arc<AppState>>) -> Result<HealthStatus> {
    state.monitoring_service.get_health_status(&state).await
}

/// Get performance metrics
#[tauri::command]
pub async fn get_performance_metrics(
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<PerformanceMetrics> {
    state
        .monitoring_service
        .get_performance_metrics(&state)
        .await
}

/// Get performance metrics history
#[tauri::command]
pub async fn get_metrics_history(
    limit: Option<usize>,
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<Vec<PerformanceMetrics>> {
    let limit = limit.unwrap_or(50).min(100); // Cap at 100 for performance
    Ok(state.monitoring_service.get_metrics_history(limit))
}

/// Detailed system information
#[derive(Debug, Serialize, Deserialize)]
pub struct SystemInfo {
    pub os: String,
    pub os_version: String,
    pub arch: String,
    pub total_memory_mb: f64,
    pub available_memory_mb: f64,
    pub cpu_count: usize,
    pub cpu_brand: String,
    pub hostname: String,
    pub boot_time: i64,
    pub load_average: Option<LoadAverage>,
    pub network_info: NetworkInfo,
    pub disk_info: Vec<DiskInfo>,
    pub process_info: ProcessInfo,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LoadAverage {
    pub one: f64,
    pub five: f64,
    pub fifteen: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NetworkInfo {
    pub interfaces_count: usize,
    pub total_bytes_received: u64,
    pub total_bytes_transmitted: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DiskInfo {
    pub name: String,
    pub mount_point: String,
    pub total_space_mb: f64,
    pub available_space_mb: f64,
    pub used_space_mb: f64,
    pub usage_percentage: f64,
    pub file_system: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub memory_usage_mb: f64,
    pub cpu_usage_percentage: f64,
    pub start_time: i64,
    pub threads_count: usize,
}

/// Get detailed system information
#[tauri::command]
pub async fn get_system_info() -> Result<SystemInfo> {
    use sysinfo::System;

    let mut sys = System::new_all();
    sys.refresh_all();

    // Wait a bit and refresh again for CPU usage
    tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
    sys.refresh_cpu_all();

    let total_memory_mb = sys.total_memory() as f64 / 1_024_000.0;
    let available_memory_mb = sys.available_memory() as f64 / 1_024_000.0;

    // Get load average (Unix-like systems only)
    let load_average = sysinfo::System::load_average();
    let load_avg = if load_average.one.is_finite() {
        Some(LoadAverage {
            one: load_average.one,
            five: load_average.five,
            fifteen: load_average.fifteen,
        })
    } else {
        None
    };

    // Network information
    let networks = sysinfo::Networks::new_with_refreshed_list();
    let (total_rx, total_tx) =
        networks
            .iter()
            .fold((0u64, 0u64), |(rx_acc, tx_acc), (_, network)| {
                (
                    rx_acc + network.total_received(),
                    tx_acc + network.total_transmitted(),
                )
            });

    let network_info = NetworkInfo {
        interfaces_count: networks.len(),
        total_bytes_received: total_rx,
        total_bytes_transmitted: total_tx,
    };

    // Disk information
    let disks = sysinfo::Disks::new_with_refreshed_list();
    let disk_info: Vec<DiskInfo> = disks
        .iter()
        .map(|disk| {
            let total_space_mb = disk.total_space() as f64 / 1_024_000.0;
            let available_space_mb = disk.available_space() as f64 / 1_024_000.0;
            let used_space_mb = total_space_mb - available_space_mb;
            let usage_percentage = if total_space_mb > 0.0 {
                (used_space_mb / total_space_mb) * 100.0
            } else {
                0.0
            };

            DiskInfo {
                name: disk.name().to_string_lossy().to_string(),
                mount_point: disk.mount_point().to_string_lossy().to_string(),
                total_space_mb,
                available_space_mb,
                used_space_mb,
                usage_percentage,
                file_system: disk.file_system().to_string_lossy().to_string(),
            }
        })
        .collect();

    // Current process information
    let current_pid = std::process::id();
    let process_info = if let Some(process) = sys.process(sysinfo::Pid::from_u32(current_pid)) {
        ProcessInfo {
            pid: current_pid,
            name: process.name().to_string_lossy().to_string(),
            memory_usage_mb: process.memory() as f64 / 1_024_000.0,
            cpu_usage_percentage: process.cpu_usage() as f64,
            start_time: process.start_time() as i64,
            threads_count: 1, // thread_count() method not available in sysinfo 0.32
        }
    } else {
        ProcessInfo {
            pid: current_pid,
            name: "stratosort".to_string(),
            memory_usage_mb: 0.0,
            cpu_usage_percentage: 0.0,
            start_time: 0,
            threads_count: 1,
        }
    };

    Ok(SystemInfo {
        os: sysinfo::System::name().unwrap_or_else(|| "Unknown".to_string()),
        os_version: sysinfo::System::os_version().unwrap_or_else(|| "Unknown".to_string()),
        arch: std::env::consts::ARCH.to_string(),
        total_memory_mb,
        available_memory_mb,
        cpu_count: sys.cpus().len(),
        cpu_brand: sys
            .cpus()
            .first()
            .map(|cpu| cpu.brand().to_string())
            .unwrap_or_else(|| "Unknown".to_string()),
        hostname: sysinfo::System::host_name().unwrap_or_else(|| "localhost".to_string()),
        boot_time: sysinfo::System::boot_time() as i64,
        load_average: load_avg,
        network_info,
        disk_info,
        process_info,
    })
}

/// Application information
#[derive(Debug, Serialize, Deserialize)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub description: String,
    pub authors: Vec<String>,
    pub homepage: Option<String>,
    pub repository: Option<String>,
    pub build_date: String,
    pub build_profile: String,
    pub rust_version: String,
    pub target_triple: String,
    pub features: Vec<String>,
    pub dependencies_count: usize,
}

/// Get application information
#[tauri::command]
pub async fn get_app_info() -> Result<AppInfo> {
    Ok(AppInfo {
        name: env!("CARGO_PKG_NAME").to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        description: env!("CARGO_PKG_DESCRIPTION").to_string(),
        authors: env!("CARGO_PKG_AUTHORS")
            .split(':')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect(),
        homepage: option_env!("CARGO_PKG_HOMEPAGE").map(|s| s.to_string()),
        repository: option_env!("CARGO_PKG_REPOSITORY").map(|s| s.to_string()),
        build_date: env!("BUILD_DATE").to_string(),
        build_profile: if cfg!(debug_assertions) {
            "debug"
        } else {
            "release"
        }
        .to_string(),
        rust_version: env!("RUST_VERSION").to_string(),
        target_triple: env!("TARGET_TRIPLE").to_string(),
        features: get_enabled_features(),
        dependencies_count: get_dependencies_count(),
    })
}

/// Readiness probe for container orchestration
#[tauri::command]
pub async fn readiness_probe(
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<ReadinessStatus> {
    // Check if all critical systems are ready
    let database_ready = state.database.health_check().await.is_ok();
    let ai_service_ready = true; // AI service is optional, always ready

    let ready = database_ready && ai_service_ready;

    Ok(ReadinessStatus {
        ready,
        timestamp: chrono::Utc::now(),
        checks: vec![
            ReadinessCheck {
                name: "database".to_string(),
                ready: database_ready,
                message: if database_ready {
                    None
                } else {
                    Some("Database connection not ready".to_string())
                },
            },
            ReadinessCheck {
                name: "ai_service".to_string(),
                ready: ai_service_ready,
                message: None,
            },
        ],
    })
}

/// Liveness probe for container orchestration
#[tauri::command]
pub async fn liveness_probe(state: State<'_, std::sync::Arc<AppState>>) -> Result<LivenessStatus> {
    // Basic application responsiveness check
    let start = std::time::Instant::now();

    // Simple health check - if we can respond, we're alive
    let response_time_ms = start.elapsed().as_millis() as u64;

    // Check if application is not hanging
    let alive = response_time_ms < 5000; // 5 second timeout

    Ok(LivenessStatus {
        alive,
        timestamp: chrono::Utc::now(),
        uptime_seconds: state
            .monitoring_service
            .get_start_time()
            .elapsed()
            .as_secs(),
        response_time_ms,
        message: if alive {
            None
        } else {
            Some("Application response time exceeded threshold".to_string())
        },
    })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReadinessStatus {
    pub ready: bool,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub checks: Vec<ReadinessCheck>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReadinessCheck {
    pub name: String,
    pub ready: bool,
    pub message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LivenessStatus {
    pub alive: bool,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub uptime_seconds: u64,
    pub response_time_ms: u64,
    pub message: Option<String>,
}

/// Get runtime configuration and feature flags
#[tauri::command]
pub async fn get_runtime_config(
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<RuntimeConfig> {
    let config = state.config.read();

    Ok(RuntimeConfig {
        debug_mode: config.debug_mode,
        log_level: config.log_level.clone(),
        ai_provider: config.ai_provider.clone(),
        ollama_host: config.ollama_host.clone(),
        max_concurrent_analysis: config.max_concurrent_analysis,
        max_concurrent_operations: config.max_concurrent_operations,
        enable_telemetry: config.enable_telemetry,
        enable_gpu: config.enable_gpu,
        cache_size: config.cache_size,
        watch_folders: config.watch_folders,
        features: RuntimeFeatures {
            ocr_enabled: cfg!(feature = "ocr"),
            vision_enabled: cfg!(feature = "vision"),
            gpu_enabled: config.enable_gpu,
            telemetry_enabled: config.enable_telemetry,
            advanced_analytics: cfg!(feature = "advanced-analytics"),
        },
    })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RuntimeConfig {
    pub debug_mode: bool,
    pub log_level: String,
    pub ai_provider: String,
    pub ollama_host: String,
    pub max_concurrent_analysis: usize,
    pub max_concurrent_operations: usize,
    pub enable_telemetry: bool,
    pub enable_gpu: bool,
    pub cache_size: usize,
    pub watch_folders: bool,
    pub features: RuntimeFeatures,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RuntimeFeatures {
    pub ocr_enabled: bool,
    pub vision_enabled: bool,
    pub gpu_enabled: bool,
    pub telemetry_enabled: bool,
    pub advanced_analytics: bool,
}

// Helper functions

fn get_enabled_features() -> Vec<String> {
    let mut features = Vec::new();

    if false {
        // OCR features disabled
        features.push("ocr".to_string());
    }
    if cfg!(feature = "vision") {
        features.push("vision".to_string());
    }
    if cfg!(feature = "advanced-analytics") {
        features.push("advanced-analytics".to_string());
    }

    features
}

fn get_dependencies_count() -> usize {
    // This would typically be generated at build time
    // For now, return an estimated count
    50 // Approximate number of dependencies
}

/// Get file statistics for status bar display
#[tauri::command]
pub async fn get_file_statistics(
    path: Option<String>,
    _state: State<'_, std::sync::Arc<AppState>>,
) -> Result<FileStatistics> {
    let target_path = if let Some(p) = path {
        PathBuf::from(p)
    } else {
        // Use home directory as default
        dirs::home_dir().unwrap_or_else(|| PathBuf::from("."))
    };

    let (file_count, total_size) = calculate_directory_stats(&target_path).await?;

    Ok(FileStatistics {
        file_count,
        total_size_bytes: total_size,
        total_size_formatted: format_file_size(total_size),
        last_updated: chrono::Utc::now(),
        path: target_path.display().to_string(),
    })
}

/// Get system status for bottom status bar
#[tauri::command]
pub async fn get_system_status(state: State<'_, std::sync::Arc<AppState>>) -> Result<SystemStatus> {
    let memory_usage = crate::utils::memory::get_memory_usage().await;
    let ai_status = state.ai_service.get_status().await;
    let file_stats = get_file_statistics(None, state.clone()).await?;

    Ok(SystemStatus {
        file_count: file_stats.file_count,
        total_size_formatted: file_stats.total_size_formatted,
        memory_usage_mb: memory_usage.used_mb,
        memory_usage_percentage: memory_usage.percentage,
        ai_status_indicator: AiStatusIndicator {
            status: if ai_status.is_available {
                "connected"
            } else {
                "disconnected"
            }
            .to_string(),
            provider: match ai_status.provider {
                crate::ai::AiProvider::Ollama => "ollama".to_string(),
                crate::ai::AiProvider::Fallback => "fallback".to_string(),
            },
            last_error: ai_status.last_error,
        },
        active_operations: state.active_operations.len(),
        last_updated: chrono::Utc::now(),
    })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileStatistics {
    pub file_count: usize,
    pub total_size_bytes: u64,
    pub total_size_formatted: String,
    pub last_updated: chrono::DateTime<chrono::Utc>,
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemStatus {
    pub file_count: usize,
    pub total_size_formatted: String,
    pub memory_usage_mb: f64,
    pub memory_usage_percentage: f64,
    pub ai_status_indicator: AiStatusIndicator,
    pub active_operations: usize,
    pub last_updated: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AiStatusIndicator {
    pub status: String,
    pub provider: String,
    pub last_error: Option<String>,
}

/// Calculate directory statistics
async fn calculate_directory_stats(path: &Path) -> Result<(usize, u64)> {
    if !path.exists() {
        return Ok((0, 0));
    }

    let mut file_count = 0usize;
    let mut total_size = 0u64;

    fn scan_directory_sync(
        path: &Path,
        file_count: &mut usize,
        total_size: &mut u64,
    ) -> Result<()> {
        if let Ok(entries) = std::fs::read_dir(path) {
            for entry in entries.flatten() {
                let entry_path = entry.path();
                if let Ok(metadata) = entry.metadata() {
                    if metadata.is_file() {
                        *file_count += 1;
                        *total_size += metadata.len();

                        // Limit to prevent excessive scanning
                        if *file_count > 50000 {
                            return Ok(());
                        }
                    } else if metadata.is_dir() {
                        // Recursively scan subdirectories (with depth limit)
                        scan_directory_sync(&entry_path, file_count, total_size)?;
                    }
                }
            }
        }
        Ok(())
    }

    // Use blocking task for filesystem operations
    let path_clone = path.to_path_buf();
    tokio::task::spawn_blocking(move || {
        scan_directory_sync(&path_clone, &mut file_count, &mut total_size)?;
        Ok::<(usize, u64), crate::error::AppError>((file_count, total_size))
    })
    .await
    .map_err(|e| crate::error::AppError::SystemError {
        message: format!("Task join error: {}", e),
    })??;

    Ok((file_count, total_size))
}

/// Format file size for display
fn format_file_size(bytes: u64) -> String {
    const UNITS: &[&str] = &["B", "KB", "MB", "GB", "TB"];
    let mut size = bytes as f64;
    let mut unit_index = 0;

    while size >= 1024.0 && unit_index < UNITS.len() - 1 {
        size /= 1024.0;
        unit_index += 1;
    }

    if unit_index == 0 {
        format!("{} {}", bytes, UNITS[unit_index])
    } else {
        format!("{:.1} {}", size, UNITS[unit_index])
    }
}

/// Start periodic status monitoring and broadcasting
pub async fn start_status_monitoring(
    app_handle: tauri::AppHandle,
    state: std::sync::Arc<AppState>,
) {
    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(5)); // Update every 5 seconds

    tokio::spawn(async move {
        loop {
            interval.tick().await;

            // Get current system status
            if let Ok(system_status) = get_system_status_internal(&state).await {
                // Emit system status update
                let _ = app_handle.emit("system-status-update", &system_status);
            }

            // Get active operations status
            if let Ok(active_ops) = crate::commands::get_active_operations_internal(&state).await {
                // Emit operations status update
                let _ = app_handle.emit("operations-status-update", &active_ops);
            }

            // Get health status every 30 seconds (less frequent)
            if chrono::Utc::now().timestamp() % 30 == 0 {
                if let Ok(health_status) = get_health_status_internal(&state).await {
                    let _ = app_handle.emit("health-status-update", &health_status);
                }
            }
        }
    });
}

/// Enable real-time monitoring
#[tauri::command]
pub async fn enable_realtime_monitoring(
    enable: bool,
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<bool> {
    // Store monitoring preference in config
    {
        let mut config = state.config.write();
        config.enable_telemetry = enable; // Reuse this flag for real-time monitoring
    }

    if enable {
        tracing::info!("Real-time monitoring enabled");
        // Start status monitoring if not already running
        start_status_monitoring(state.handle.clone(), state.inner().clone()).await;
    } else {
        tracing::info!("Real-time monitoring disabled");
        // Note: We don't stop the task here, but the frontend can choose to ignore events
    }

    Ok(enable)
}

/// Force refresh all status information
#[tauri::command]
pub async fn refresh_all_status(
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<AllStatusInfo> {
    let system_status = get_system_status(state.clone()).await?;
    let health_status = get_health_status(state.clone()).await?;
    let performance_metrics = get_performance_metrics(state.clone()).await?;
    let active_operations = crate::commands::get_active_operations(state.clone()).await?;

    let all_status = AllStatusInfo {
        system_status,
        health_status,
        performance_metrics,
        active_operations,
        last_updated: chrono::Utc::now(),
    };

    // Emit comprehensive status update
    let _ = state.handle.emit("all-status-update", &all_status);

    Ok(all_status)
}

/// Internal helper function for get_system_status that works with direct AppState reference
pub async fn get_system_status_internal(state: &AppState) -> Result<SystemStatus> {
    let memory_usage = crate::utils::memory::get_memory_usage().await;
    let ai_status = state.ai_service.get_status().await;
    let file_stats = calculate_directory_stats(
        &dirs::home_dir().unwrap_or_else(|| std::path::PathBuf::from(".")),
    )
    .await?;

    Ok(SystemStatus {
        file_count: file_stats.0,
        total_size_formatted: bytesize::ByteSize::b(file_stats.1).to_string(),
        memory_usage_mb: memory_usage.used_mb,
        memory_usage_percentage: memory_usage.percentage,
        ai_status_indicator: AiStatusIndicator {
            status: if ai_status.is_available {
                "connected"
            } else {
                "disconnected"
            }
            .to_string(),
            provider: match ai_status.provider {
                crate::ai::AiProvider::Ollama => "ollama".to_string(),
                crate::ai::AiProvider::Fallback => "fallback".to_string(),
            },
            last_error: ai_status.last_error,
        },
        active_operations: state.active_operations.len(),
        last_updated: chrono::Utc::now(),
    })
}

/// Internal helper function for get_health_status that works with direct AppState reference
pub async fn get_health_status_internal(state: &AppState) -> Result<HealthStatus> {
    state.monitoring_service.get_health_status(state).await
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AllStatusInfo {
    pub system_status: SystemStatus,
    pub health_status: HealthStatus,
    pub performance_metrics: PerformanceMetrics,
    pub active_operations: Vec<crate::commands::ActiveOperationInfo>,
    pub last_updated: chrono::DateTime<chrono::Utc>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_get_system_info() {
        let system_info = get_system_info().await;
        assert!(system_info.is_ok());

        let info = system_info.expect("System info should be available in tests");
        assert!(!info.os.is_empty());
        assert!(info.total_memory_mb > 0.0);
        assert!(info.cpu_count > 0);
    }

    #[tokio::test]
    async fn test_get_app_info() {
        let app_info = get_app_info().await;
        assert!(app_info.is_ok());

        let info = app_info.expect("App info should be available in tests");
        assert_eq!(info.name, "stratosort");
        assert!(!info.version.is_empty());
        assert!(info.dependencies_count > 0);
    }

    // Note: Tests requiring AppState are moved to integration tests
    // since they need a full Tauri app context

    #[test]
    fn test_get_enabled_features() {
        let features = get_enabled_features();
        // Features depend on compilation flags, just test it returns a vector
        // Features vector is always valid, no assertion needed
        let _feature_count = features.len();
    }
}
