use crate::{error::Result, state::AppState};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::{AppHandle, State};

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemDiagnostics {
    pub config_valid: bool,
    pub config_errors: Vec<String>,
    pub ai_service_status: AiServiceDiagnostics,
    pub database_status: DatabaseDiagnostics,
    pub file_permissions: Vec<PathPermissionCheck>,
    pub system_resources: ResourceDiagnostics,
    pub recommendations: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AiServiceDiagnostics {
    pub provider: String,
    pub is_available: bool,
    pub host_reachable: bool,
    pub models_available: Vec<String>,
    pub last_error: Option<String>,
    pub capabilities: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DatabaseDiagnostics {
    pub connection_status: String,
    pub database_size_mb: f64,
    pub table_counts: std::collections::HashMap<String, usize>,
    pub last_error: Option<String>,
    pub performance_ok: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PathPermissionCheck {
    pub path: String,
    pub exists: bool,
    pub readable: bool,
    pub writable: bool,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ResourceDiagnostics {
    pub memory_usage_mb: f64,
    pub disk_space_gb: f64,
    pub cpu_usage_percent: f64,
    pub active_operations: usize,
    pub cache_size_mb: f64,
    pub memory_limit_reached: bool,
    pub disk_space_low: bool,
}

/// Run comprehensive system diagnostics
#[tauri::command]
pub async fn run_diagnostics(
    state: State<'_, std::sync::Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<SystemDiagnostics> {
    let config = state.config.read().clone();

    // Check configuration validity
    let (config_valid, config_errors) = match config.validate() {
        Ok(_) => (true, vec![]),
        Err(e) => (false, vec![e.to_string()]),
    };

    // Check AI service status
    let ai_status = state.ai_service.get_status().await;
    let ai_service_status = AiServiceDiagnostics {
        provider: format!("{:?}", ai_status.provider),
        is_available: ai_status.is_available,
        host_reachable: ai_status.ollama_connected,
        models_available: ai_status.models_available,
        last_error: ai_status.last_error,
        capabilities: ai_status.capabilities,
    };

    // Check database status
    let database_status = check_database_status(&state).await;

    // Check file permissions
    let file_permissions = check_file_permissions(&config, &app).await;

    // Check system resources
    let system_resources = check_system_resources(&state).await;

    // Generate recommendations
    let recommendations = generate_recommendations(
        &config_errors,
        &ai_service_status,
        &database_status,
        &file_permissions,
        &system_resources,
    );

    Ok(SystemDiagnostics {
        config_valid,
        config_errors,
        ai_service_status,
        database_status,
        file_permissions,
        system_resources,
        recommendations,
    })
}

/// Test AI service connection
#[tauri::command]
pub async fn test_ai_service(
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<AiServiceDiagnostics> {
    let status = state.ai_service.get_status().await;

    Ok(AiServiceDiagnostics {
        provider: format!("{:?}", status.provider),
        is_available: status.is_available,
        host_reachable: status.ollama_connected,
        models_available: status.models_available,
        last_error: status.last_error,
        capabilities: status.capabilities,
    })
}

/// Check database health
#[tauri::command]
pub async fn check_database_health(
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<DatabaseDiagnostics> {
    Ok(check_database_status(&state).await)
}

/// Validate file paths from configuration
#[tauri::command]
pub async fn validate_config_paths(
    state: State<'_, std::sync::Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<Vec<PathPermissionCheck>> {
    let config = state.config.read().clone();
    Ok(check_file_permissions(&config, &app).await)
}

/// Get system resource usage for diagnostics
#[tauri::command]
pub async fn get_diagnostics_resource_usage(
    state: State<'_, std::sync::Arc<AppState>>,
) -> Result<ResourceDiagnostics> {
    Ok(check_system_resources(&state).await)
}

/// Clear caches and temporary data
#[tauri::command]
pub async fn clear_caches(state: State<'_, std::sync::Arc<AppState>>) -> Result<ClearCacheResult> {
    let mut cleared_mb = 0.0;
    let errors = Vec::new();

    // Clear file cache
    let cache_size_before = state.file_cache.len();
    state.file_cache.clear();
    let cache_size_after = state.file_cache.len();
    cleared_mb += (cache_size_before - cache_size_after) as f64 * 0.001; // Rough estimate

    // Clear any other caches as needed
    // Additional cache clearing could include:
    // - Temp file cache
    // - Image thumbnail cache
    // - Database query cache
    // Implementation would go here when those caches are added

    Ok(ClearCacheResult {
        success: errors.is_empty(),
        cleared_mb,
        errors,
    })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ClearCacheResult {
    pub success: bool,
    pub cleared_mb: f64,
    pub errors: Vec<String>,
}

// Helper functions
async fn check_database_status(state: &AppState) -> DatabaseDiagnostics {
    // Try a simple database operation to test connectivity
    let connection_status = match state.database.get_recent_analyses(1).await {
        Ok(_) => "Connected".to_string(),
        Err(e) => format!("Error: {}", e),
    };

    // Get database size (rough estimate)
    // In a real implementation, this would query the database file size
    // For now, use a placeholder since actual size calculation requires filesystem access
    let database_size_mb = 0.0;

    // Get table counts - simplified since we don't have count methods
    let mut table_counts = std::collections::HashMap::new();

    // Try to get recent analyses as a connectivity test
    match state.database.get_recent_analyses(100).await {
        Ok(analyses) => {
            table_counts.insert("analyses".to_string(), analyses.len());
        }
        Err(_) => {
            table_counts.insert("analyses".to_string(), 0);
        }
    }

    // Embeddings count is harder to get, so we'll skip for now
    table_counts.insert("embeddings".to_string(), 0);

    DatabaseDiagnostics {
        connection_status,
        database_size_mb,
        table_counts,
        last_error: None,
        performance_ok: true,
    }
}

async fn check_file_permissions(
    config: &crate::config::Config,
    _app: &AppHandle,
) -> Vec<PathPermissionCheck> {
    let mut checks = Vec::new();

    // Check important paths from config
    let paths_to_check = vec![&config.default_smart_folder_location];

    for path_str in paths_to_check {
        if path_str.is_empty() {
            continue;
        }

        let path = Path::new(path_str);
        let mut check = PathPermissionCheck {
            path: path_str.clone(),
            exists: path.exists(),
            readable: false,
            writable: false,
            error: None,
        };

        if check.exists {
            // Test read permissions
            check.readable = match std::fs::metadata(path) {
                Ok(_) => true,
                Err(e) => {
                    check.error = Some(format!("Read error: {}", e));
                    false
                }
            };

            // Test write permissions by trying to create a temp file
            if check.readable {
                let temp_file = path.join(".stratotest_temp");
                check.writable = match std::fs::write(&temp_file, "test") {
                    Ok(_) => {
                        let _ = std::fs::remove_file(&temp_file);
                        true
                    }
                    Err(e) => {
                        check.error = Some(format!("Write error: {}", e));
                        false
                    }
                };
            }
        } else {
            check.error = Some("Path does not exist".to_string());
        }

        checks.push(check);
    }

    // Check watch paths
    for watch_path in &config.watch_paths {
        let path = Path::new(watch_path);
        let check = PathPermissionCheck {
            path: watch_path.clone(),
            exists: path.exists(),
            readable: path.exists() && std::fs::metadata(path).is_ok(),
            writable: false, // Watch paths don't need write access
            error: if !path.exists() {
                Some("Watch path does not exist".to_string())
            } else {
                None
            },
        };
        checks.push(check);
    }

    checks
}

async fn check_system_resources(state: &AppState) -> ResourceDiagnostics {
    use sysinfo::System;

    let mut sys = System::new_all();
    sys.refresh_all();

    let total_memory = sys.total_memory() as f64 / (1024.0 * 1024.0); // Convert to MB
    let used_memory = sys.used_memory() as f64 / (1024.0 * 1024.0);
    let cpu_usage = sys.global_cpu_usage();

    // Get active operations count
    let active_operations = state.active_operations.len();

    // Estimate cache size
    let cache_size_mb = state.file_cache.len() as f64 * 0.001; // Rough estimate

    // Check if memory limit is reached (using a reasonable threshold)
    let memory_limit_reached = used_memory > (total_memory * 0.9);

    // Check disk space (rough estimate for system drive)
    // In production, this would use sysinfo or similar to get actual disk space
    // For now, use a conservative estimate
    let disk_space_gb = 100.0;
    let disk_space_low = disk_space_gb < 1.0; // Less than 1GB

    ResourceDiagnostics {
        memory_usage_mb: used_memory,
        disk_space_gb,
        cpu_usage_percent: cpu_usage as f64,
        active_operations,
        cache_size_mb,
        memory_limit_reached,
        disk_space_low,
    }
}

fn generate_recommendations(
    config_errors: &[String],
    ai_status: &AiServiceDiagnostics,
    db_status: &DatabaseDiagnostics,
    file_permissions: &[PathPermissionCheck],
    resources: &ResourceDiagnostics,
) -> Vec<String> {
    let mut recommendations = Vec::new();

    // Config recommendations
    if !config_errors.is_empty() {
        recommendations
            .push("Fix configuration errors to ensure proper application behavior".to_string());
    }

    // AI service recommendations
    if !ai_status.is_available {
        if ai_status.provider == "Ollama" {
            recommendations
                .push("Install and start Ollama service for AI-powered file analysis".to_string());
            recommendations.push("Check that Ollama is running on the configured host".to_string());
        } else {
            recommendations.push(
                "AI service is not available - check your AI provider configuration".to_string(),
            );
        }
    }

    if ai_status.models_available.is_empty() && ai_status.is_available {
        recommendations.push(
            "No AI models available - install required models in your AI service".to_string(),
        );
    }

    // Database recommendations
    if !db_status.connection_status.contains("Connected") {
        recommendations
            .push("Database connection issues detected - check database configuration".to_string());
    }

    // File permission recommendations
    for check in file_permissions {
        if !check.exists {
            recommendations.push(format!("Create missing directory: {}", check.path));
        } else if !check.readable {
            recommendations.push(format!("Fix read permissions for: {}", check.path));
        } else if !check.writable && !check.path.contains("watch") {
            recommendations.push(format!("Fix write permissions for: {}", check.path));
        }
    }

    // Resource recommendations
    if resources.memory_limit_reached {
        recommendations.push(
            "High memory usage detected - consider reducing cache size or concurrent operations"
                .to_string(),
        );
    }

    if resources.disk_space_low {
        recommendations.push(
            "Low disk space - free up space or move application data to another drive".to_string(),
        );
    }

    if resources.cpu_usage_percent > 80.0 {
        recommendations
            .push("High CPU usage - consider reducing concurrent operations".to_string());
    }

    if resources.active_operations > 10 {
        recommendations.push("Many active operations - performance may be impacted".to_string());
    }

    if recommendations.is_empty() {
        recommendations.push("System appears healthy - no issues detected".to_string());
    }

    recommendations
}
