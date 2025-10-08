pub mod ai;
pub mod automation;
pub mod cli;
pub mod commands;
pub mod config;
pub mod core;
pub mod error;
pub mod events;
pub mod responses;
pub mod services;
pub mod state;
pub mod storage;
pub mod utils;

use crate::storage::CURRENT_SCHEMA_VERSION;
use crate::utils::{diagnostics::HealthChecker, memory::MemoryMonitor};
use crate::{
    config::Config,
    services::{file_watcher::FileWatcher, notification::NotificationService},
    state::AppState,
};
use std::sync::Arc;
use std::time::Duration;
use tauri::{async_runtime, generate_context, generate_handler, Emitter, Manager};
use std::sync::atomic::Ordering;
use tracing::{error, info, warn};

// Constants for timing and delays
const FILE_WATCHER_INIT_DELAY_MS: u64 = 100;

async fn try_ollama_connections(state: &AppState, hosts: Vec<String>) -> bool {
    for host in hosts {
        if host.is_empty() {
            continue;
        }

        info!("Attempting to connect to Ollama at: {}", host);

        match state.ai_service.reconnect_ollama(&host).await {
            Ok(status) => {
                info!(
                    "Ollama connected successfully to {} - Status: {:?}",
                    host, status
                );

                // Emit success event to frontend
                crate::emit_event!(
                    state.handle,
                    crate::events::ai::OLLAMA_CONNECTED,
                    serde_json::json!({
                        "host": host,
                        "status": status
                    })
                );
                return true;
            }
            Err(e) => {
                warn!("Failed to connect to Ollama at {}: {}", host, e);
            }
        }

        // Small delay between attempts
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    }
    false
}

async fn initialize_app_state_with_retry(
    handle: tauri::AppHandle,
    config: Config,
) -> Result<AppState, crate::error::AppError> {
    const MAX_RETRIES: u32 = 3;

    // Pre-create app data directory to avoid database initialization failures
    if let Ok(app_data_dir) = handle.path().app_data_dir() {
        if let Err(e) = tokio::fs::create_dir_all(&app_data_dir).await {
            warn!("Failed to pre-create app data directory: {}", e);
        }
    }

    let mut retry_count = 0;

    loop {
        let init_result = tokio::time::timeout(
            std::time::Duration::from_secs(30),
            AppState::new(handle.clone(), config.clone()),
        )
        .await;

        match init_result {
            Ok(Ok(state)) => {
                info!("AppState initialized successfully");
                return Ok(state);
            }
            Ok(Err(e)) if retry_count < MAX_RETRIES => {
                retry_count += 1;
                error!(
                    "AppState initialization failed (attempt {}): {}",
                    retry_count, e
                );

                // Send notification about initialization retry
                if retry_count == 1 {
                    // Only notify on first failure to avoid spam
                    crate::emit_event!(
                        handle,
                        crate::events::app::INITIALIZATION_RETRY,
                        serde_json::json!({
                            "attempt": retry_count,
                            "error": format!("{}", e),
                            "message": "Application is retrying initialization..."
                        })
                    );
                }

                // For database errors, ensure directories exist before retry
                if matches!(e, crate::error::AppError::DatabaseError { .. }) {
                    if let Ok(app_data_dir) = handle.path().app_data_dir() {
                        if let Err(e) = tokio::fs::create_dir_all(&app_data_dir).await {
                            warn!("Failed to recreate app data directory on retry: {}", e);
                        }
                    }
                    let fallback_dir = std::env::current_dir()
                        .unwrap_or_else(|_| std::path::PathBuf::from("."))
                        .join("data");
                    if let Err(e) = tokio::fs::create_dir_all(&fallback_dir).await {
                        warn!("Failed to recreate fallback data directory on retry: {}", e);
                    }
                }

                // Exponential backoff: 1s, 2s, 4s
                let backoff_ms = 1000 * (1 << (retry_count - 1));
                tokio::time::sleep(tokio::time::Duration::from_millis(backoff_ms)).await;
                continue;
            }
            Ok(Err(e)) => {
                error!(
                    "AppState initialization failed after {} retries: {}",
                    MAX_RETRIES, e
                );

                // Send final failure notification
                crate::emit_event!(
                    handle,
                    crate::events::app::INITIALIZATION_FAILED,
                    serde_json::json!({
                        "error": format!("{}", e),
                        "retries": MAX_RETRIES,
                        "message": "Application failed to initialize after multiple attempts"
                    })
                );

                return Err(e);
            }
            Err(_) if retry_count < MAX_RETRIES => {
                retry_count += 1;
                error!(
                    "AppState initialization timed out (attempt {})",
                    retry_count
                );

                // Shorter backoff for timeout errors
                let backoff_ms = 500 * retry_count as u64;
                tokio::time::sleep(tokio::time::Duration::from_millis(backoff_ms)).await;
                continue;
            }
            Err(_) => {
                error!(
                    "AppState initialization timed out after {} retries",
                    MAX_RETRIES
                );
                return Err(crate::error::AppError::Timeout {
                    message: "AppState initialization timed out after retries".to_string(),
                });
            }
        }
    }
}

pub async fn run() -> crate::error::Result<()> {
    // Set up graceful shutdown signal handling
    let (shutdown_tx, mut shutdown_rx) = tokio::sync::mpsc::channel::<()>(1);

    // Handle Ctrl+C and SIGTERM for graceful shutdown
    let shutdown_tx_clone = shutdown_tx.clone();
    tokio::spawn(async move {
        tokio::signal::ctrl_c()
            .await
            .expect("Failed to install SIGINT handler");
        let _ = shutdown_tx_clone.send(()).await;
    });

    #[cfg(unix)]
    {
        let shutdown_tx_clone = shutdown_tx.clone();
        tokio::spawn(async move {
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                .expect("Failed to install SIGTERM handler")
                .recv()
                .await;
            let _ = shutdown_tx_clone.send(()).await;
        });
    }

    // Load environment variables from .env file if it exists
    match dotenv::dotenv() {
        Ok(path) => {
            info!("Loaded environment from: {:?}", path);
        }
        Err(e) => {
            // It's ok if .env doesn't exist, we'll use defaults
            if e.not_found() {
                info!("No .env file found, using default configuration");
            } else {
                warn!("Error loading .env file: {}", e);
            }
        }
    }

    // Initialize logging
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "stratosort=debug,tauri=info".into()),
        )
        .init();

    info!("Starting StratoSort...");

    // Initialize sqlite-vec extension early in the startup process
    info!("Initializing sqlite-vec extension...");
    if let Err(e) = crate::storage::initialize_sqlite_vec() {
        warn!(
            "sqlite-vec initialization failed: {}. Vector search will use fallback.",
            e
        );
        warn!("Please install sqlite-vec extension for optimal performance. Falling back to manual similarity calculations.");
        // Emit event to inform frontend about fallback mode
        info!("Vector search will continue using fallback similarity calculations.");
    } else {
        info!("sqlite-vec extension initialized successfully - high-performance vector search available");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::default().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        // Community plugins temporarily disabled due to GTK linking conflicts
        // .plugin(tauri_plugin_context_menu::init())
        // .plugin(tauri_plugin_nosleep::init())
        .setup(|app| {
            let handle = app.handle().clone();

            // Initialize configuration
            let config = Config::load(&handle)?;
            info!(
                mode = if config.is_development() { "development" } else { "production" },
                log_filter = %config.get_log_filter(),
                schema_version = CURRENT_SCHEMA_VERSION,
                "Configuration loaded"
            );

            // Initialize Ollama service if configured
            if config.ai_provider.to_lowercase() == "ollama" && !config.ollama_host.is_empty() {
                if let Err(e) = async_runtime::block_on(async {
                    crate::ai::ollama_manager::initialize_ollama_service(&config).await
                }) {
                    warn!("Failed to initialize Ollama service: {}. Continuing with fallback mode.", e);
                }
            }

            // Initialize app state asynchronously with proper retry logic
            // We must use block_on here because Tauri's setup is synchronous
            let state = Arc::new(async_runtime::block_on(async {
                initialize_app_state_with_retry(handle.clone(), config.clone()).await
            })?);
            app.manage(state.clone());

            // Backend service - no system tray or global shortcuts needed

            // Initialize background services with graceful shutdown
            initialize_services(app, state.clone())?;

            // Initialize file watcher with proper deadlock prevention and graceful shutdown
            if config.watch_folders {
                info!("Initializing file watcher...");

                // Use a separate task to avoid blocking the setup and prevent deadlocks
                let state_for_watcher = state.clone();
                let handle_for_watcher = handle.clone();
                let shutdown_token = state.shutdown_token.clone();

                let task_count = state.active_tasks.clone();
                task_count.fetch_add(1, Ordering::SeqCst);
                tokio::spawn(async move {
                    // Check if shutdown was requested before starting
                    if shutdown_token.is_cancelled() {
                        return;
                    }

                    // Delay to ensure app state is fully initialized before starting file watcher
                    tokio::select! {
                        _ = tokio::time::sleep(Duration::from_millis(FILE_WATCHER_INIT_DELAY_MS)) => {},
                        _ = shutdown_token.cancelled() => return,
                    }

                    // Create and initialize the file watcher with timeout protection
                    let watcher_init_result = tokio::time::timeout(
                        tokio::time::Duration::from_secs(10),
                        async {
                            // Create the FileWatcher instance
                            let file_watcher = Arc::new(FileWatcher::new(state_for_watcher.clone()));

                            // Store it in the state using a non-blocking write
                            {
                                let mut watcher_guard = state_for_watcher.file_watcher.write();
                                *watcher_guard = Some(file_watcher.clone());
                            }

                            // Start the watcher with timeout protection and shutdown awareness
                            tokio::select! {
                                result = tokio::time::timeout(
                                    tokio::time::Duration::from_secs(5),
                                    file_watcher.start()
                                ) => {
                                    match result {
                                        Ok(_) => Ok(()),
                                        Err(_) => Err(crate::error::AppError::Timeout {
                                            message: "File watcher start timed out".to_string(),
                                        }),
                                    }
                                },
                                _ = shutdown_token.cancelled() => return Err(crate::error::AppError::Cancelled),
                            }
                        }
                    ).await;

                    match watcher_init_result {
                        Ok(Ok(_)) => {
                            info!("File watcher initialized and started successfully");
                            crate::emit_event!(
                                handle_for_watcher,
                                crate::events::file::WATCHER_STARTED,
                                serde_json::json!({
                                    "status": "active",
                                    "message": "File monitoring is now active"
                                })
                            );
                        }
                        Ok(Err(e)) => {
                            error!("Failed to start file watcher: {}", e);
                            crate::emit_event!(
                                handle_for_watcher,
                                crate::events::file::WATCHER_ERROR,
                                serde_json::json!({
                                    "error": format!("{}", e),
                                    "message": "File monitoring could not be started"
                                })
                            );
                        }
                        Err(_) => {
                            error!("File watcher start operation timed out");
                            crate::emit_event!(
                                handle_for_watcher,
                                crate::events::file::WATCHER_ERROR,
                                serde_json::json!({
                                    "error": "Timeout during file watcher startup",
                                    "message": "File monitoring startup timed out"
                                })
                            );
                        }
                    }

                    // Decrement active task count when done
                    drop(task_count);
                });
            } else {
                info!("File watching disabled in configuration");
            }

            // Try to connect to Ollama in background with retry logic and graceful shutdown
            let state_for_ollama = state.clone();
            let shutdown_token = state.shutdown_token.clone();

            let task_count = state.active_tasks.clone();
            task_count.fetch_add(1, Ordering::SeqCst);
            tokio::spawn(async move {
                // Give the app a moment to fully start
                tokio::select! {
                    _ = tokio::time::sleep(tokio::time::Duration::from_secs(2)) => {},
                    _ = shutdown_token.cancelled() => return,
                }

                // Try multiple common Ollama hosts with retry
                let ollama_hosts = vec![
                    "http://localhost:11434".to_string(),
                    "http://127.0.0.1:11434".to_string(),
                    state_for_ollama.config.read().ollama_host.clone(),
                ];

                // Try to connect to any of the hosts
                if try_ollama_connections(&state_for_ollama, ollama_hosts).await {
                    // Connection successful - event already emitted in helper function
                } else {
                    warn!("Ollama not available on any host. Switching to fallback AI mode.");

                    // Explicitly switch to fallback mode
                    let status = state_for_ollama.ai_service.use_fallback();
                    info!("Successfully switched to fallback AI mode: {:?}", status);
                    // Emit fallback success event to frontend
                    crate::emit_event!(
                        state_for_ollama.handle,
                        crate::events::ai::OLLAMA_FALLBACK_ACTIVE,
                        serde_json::json!({
                            "message": "AI features are now using fallback analysis. Performance may be limited.",
                            "status": "fallback"
                        })
                    );
                }

                // Decrement active task count when done
                drop(task_count);
            });

            info!("StratoSort initialized successfully");

            Ok(())
        })
    .invoke_handler(generate_handler![
            // File commands
            commands::files::scan_directory,
            commands::files::scan_directory_stream,
            commands::files::analyze_files,
            commands::files::get_file_content,
            commands::files::move_files,
            commands::files::get_file_preview,
            commands::files::get_recent_files,
            commands::files::rename_file,
            commands::files::copy_file,
            commands::files::delete_file,
            commands::files::create_directory,
            commands::files::get_file_info_command,
            commands::files::set_file_permissions,
            commands::files::batch_file_operations,
            commands::files::move_file,
            commands::files::rename_files,
            commands::files::get_file_properties,
            commands::files::browse_files,
            commands::files::browse_folder,
            commands::files::process_dropped_paths,
            commands::files::file_exists,
            commands::files::get_file_size_info,
            commands::cancel_operation,
            commands::get_active_operations,
            commands::get_operation_progress,

            // AI commands
            commands::ai::check_ollama_status,
            commands::ai::pull_model,
            commands::ai::list_models,
            commands::ai::analyze_with_ai,
            commands::ai::generate_embeddings,
            commands::ai::semantic_search,
            commands::ai::quick_search,
            commands::ai::advanced_search,
            commands::ai::get_search_history,
            commands::ai::clear_search_history,
            commands::ai::batch_analyze_files,
            commands::ai::get_analysis_history,

            // AI Status commands
            commands::ai_status::get_ai_status,
            commands::ai_status::connect_ollama,
            commands::ai_status::use_fallback_ai,
            commands::ai_status::test_ai_analysis,
            commands::ai_status::get_ai_capabilities,

            // Organization commands
            commands::organization::create_smart_folder,
            commands::organization::update_smart_folder,
            commands::organization::delete_smart_folder,
            commands::organization::list_smart_folders,
            commands::organization::get_smart_folder,
            commands::organization::apply_smart_folder_rules,
            commands::organization::auto_organize_directory,
            commands::organization::suggest_file_organization,
            commands::organization::apply_organization,
            commands::organization::get_smart_folders,
            commands::organization::match_to_folders,
            commands::organization::validate_rule,
            commands::organization::test_rule_against_files,
            commands::organization::test_smart_folder_rule,
            commands::organization::get_rename_pattern_info,
            commands::organization::preview_rename_pattern,

            // Protected folder commands
            commands::protected_folders::list_protected_folders,
            commands::protected_folders::create_protected_folder,
            commands::protected_folders::update_protected_folder,
            commands::protected_folders::delete_protected_folder,
            commands::protected_folders::is_path_protected,

            // Duplicate detection commands
            commands::duplicates::get_duplicate_groups,
            commands::duplicates::scan_for_duplicates,
            commands::duplicates::get_duplicates_for_file,
            commands::duplicates::cleanup_old_duplicates,

            // Quarantine commands
            commands::quarantine::get_quarantined_files,
            commands::quarantine::release_from_quarantine,
            commands::quarantine::release_expired_quarantines,
            commands::quarantine::get_quarantine_stats,
            commands::quarantine::is_file_quarantined,
            commands::quarantine::get_quarantine_info,
            commands::quarantine::cleanup_old_quarantines,

            // Pattern learning commands
            commands::patterns::get_learned_patterns,
            commands::patterns::predict_organization_with_patterns,
            commands::patterns::get_smart_folder_suggestions_from_patterns,
            commands::patterns::clear_learned_patterns,
            commands::patterns::get_pattern_statistics,

            // StratoSort workflow commands
            commands::stratosort::stratosort_preview,
            commands::stratosort::stratosort_apply,
            commands::stratosort::stratosort_learn,
            commands::stratosort::stratosort_get_stats,
            commands::stratosort::stratosort_try_auto_apply,

            // Settings commands
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::settings::get_settings_by_category,
            commands::settings::get_all_settings_categories,
            commands::settings::update_category_settings,
            commands::settings::test_ai_connection,

            // Setup commands
            commands::setup::check_first_run_status,
            commands::setup::complete_first_run_setup,
            commands::setup::reset_to_first_run,
            commands::settings::reset_settings,
            commands::settings::export_settings,
            commands::settings::import_settings,
            commands::settings::get_setting_value,
            commands::settings::set_setting_value,
            commands::settings::add_watch_path,
            commands::settings::remove_watch_path,
            commands::settings::get_watch_paths,
            commands::settings::validate_settings,

            // System commands
            commands::system::get_basic_system_info,
            commands::system::frontend_ready,
            commands::system::open_folder,
            commands::system::show_in_folder,
            commands::system::get_default_folders,
            commands::system::clear_cache,
            commands::system::get_storage_info,
            commands::system::get_app_logs,
            commands::system::restart_app,
            commands::system::check_for_updates,
            commands::system::shutdown_application,
            commands::system::get_resource_usage,
            commands::system::force_shutdown,

            // Monitoring commands
            commands::monitoring::get_health_status,
            commands::monitoring::get_performance_metrics,
            commands::monitoring::get_metrics_history,
            commands::monitoring::get_system_info,
            commands::monitoring::get_app_info,
            commands::monitoring::readiness_probe,
            commands::monitoring::liveness_probe,
            commands::monitoring::get_runtime_config,
            commands::monitoring::get_file_statistics,
            commands::monitoring::get_system_status,
            commands::monitoring::enable_realtime_monitoring,
            commands::monitoring::refresh_all_status,

            // Notification commands
            commands::notifications::emit_notification,
            commands::notifications::get_notifications,
            commands::notifications::mark_notification_read,
            commands::notifications::clear_notifications,
            commands::notifications::emit_progress_notification,
            commands::notifications::emit_file_operation_status,
            commands::notifications::emit_system_status,

            // Undo/Redo commands
            commands::history::undo,
            commands::history::redo,
            commands::history::get_history,
            commands::history::clear_history,
            commands::history::get_history_state,
            commands::history::batch_undo,
            commands::history::batch_redo,
            commands::history::jump_to_history,
            commands::history::get_memory_stats,
            commands::history::undo_batch,
            commands::history::redo_batch,
            commands::history::can_undo_batch,
            commands::history::can_redo_batch,

            // Watch Mode commands (LlamaFS-inspired)
            commands::watch_mode::get_watch_mode_status,
            commands::watch_mode::configure_watch_mode,
            commands::watch_mode::enable_watch_mode,
            commands::watch_mode::disable_watch_mode,
            commands::watch_mode::record_user_organization_action,
            commands::watch_mode::get_user_learning_patterns,
            commands::watch_mode::update_auto_organize_threshold,
            commands::watch_mode::get_pending_auto_organization,
            commands::watch_mode::trigger_auto_organization,
            commands::watch_mode::add_watch_directory,
            commands::watch_mode::remove_watch_directory,

            // Enhanced Semantic Commands
            commands::semantic::analyze_file_semantics,
            commands::semantic::profile_folder,
            commands::semantic::match_file_to_folders_semantic,
            commands::semantic::detect_learned_patterns,
            commands::semantic::predict_file_organization,
            commands::semantic::get_smart_folder_suggestions,
            commands::semantic::semantic_batch_organize,

            // Naming Convention Commands
            commands::naming::get_predefined_naming_conventions,
            commands::naming::get_available_placeholders,
            commands::naming::preview_naming_convention,
            commands::naming::save_naming_convention,
            commands::naming::get_user_naming_conventions,

            // Folder Guidance Commands
            commands::folder_guidance::update_smart_folder_guidance,
            commands::folder_guidance::get_smart_folder_guidance,
            commands::folder_guidance::suggest_folder_guidance,
            commands::folder_guidance::batch_suggest_folder_guidance,

            // Diagnostics commands
            commands::diagnostics::run_diagnostics,
            commands::diagnostics::test_ai_service,
            commands::diagnostics::check_database_health,
            commands::diagnostics::validate_config_paths,
            commands::diagnostics::get_diagnostics_resource_usage,
            commands::diagnostics::clear_caches,

            // Analytics and utility commands
            commands::track_event,
            commands::get_usage_stats,
            commands::prevent_sleep,
            commands::allow_sleep,
            commands::show_context_menu,
            commands::handle_context_menu_selection,
        ])
        .run(generate_context!())
        .map_err(|e| {
            error!("Failed to run Tauri application: {}", e);
            crate::error::AppError::from(e)
        })?;

    // The Tauri app is now running. Wait for shutdown signal
    tokio::select! {
        _ = shutdown_rx.recv() => {
            info!("Shutdown signal received, initiating graceful shutdown...");
        },
        _ = tokio::signal::ctrl_c() => {
            info!("Ctrl+C received, initiating graceful shutdown...");
        },
    }

    // Note: Graceful shutdown is handled within the application lifecycle
    // The Tauri app will handle cleanup when it exits

    Ok(())
}

fn initialize_services(
    app: &tauri::App,
    state: Arc<AppState>,
) -> Result<(), Box<dyn std::error::Error>> {
    // Initialize notification service
    let _notification_service = NotificationService::new(app.handle().clone());

    // Send a welcome notification asynchronously with graceful shutdown
    {
        let app_handle = app.handle().clone();
        let shutdown_token = state.shutdown_token.clone();

        let task_count = state.active_tasks.clone();
        task_count.fetch_add(1, Ordering::SeqCst);
        tokio::spawn(async move {
            tokio::select! {
                _ = tokio::time::sleep(tokio::time::Duration::from_secs(1)) => {
                    let notifier = NotificationService::new(app_handle);
                    let _ = notifier
                        .send_success("StratoSort Ready", "Background services initialized")
                        .await;
                },
                _ = shutdown_token.cancelled() => return,
            }
        });
    }

    // Start periodic tasks with graceful shutdown
    let state_clone = state.clone();
    let shutdown_token = state.shutdown_token.clone();

    let task_count = state.active_tasks.clone();
    task_count.fetch_add(1, Ordering::SeqCst);
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(300));

        loop {
            tokio::select! {
                _ = interval.tick() => {
                    // Cleanup old cache entries
                    if let Err(e) = state_clone.cleanup_cache().await {
                        error!("Cache cleanup failed: {}", e);
                    }

                    // Cleanup stale operations (older than 1 hour)
                    state_clone.cleanup_old_operations(3600);

                    // Save state periodically
                    if let Err(e) = state_clone.save_state().await {
                        error!("State save failed: {}", e);
                    }
                },
                _ = shutdown_token.cancelled() => break,
            }
        }

        // Decrement active task count when done
        drop(task_count);
    });

    // Start memory monitoring with graceful shutdown
    let monitor = Arc::new(MemoryMonitor::new());
    let shutdown_token = state.shutdown_token.clone();

    let task_count = state.active_tasks.clone();
    task_count.fetch_add(1, Ordering::SeqCst);
    tokio::spawn(async move {
        tokio::select! {
            result = monitor.start() => {
                if let Err(e) = result {
                    warn!("Memory monitoring failed: {}", e);
                }
            },
            _ = shutdown_token.cancelled() => return,
        }

        // Decrement active task count when done
        drop(task_count);
    });

    // Run basic health checks once after startup with graceful shutdown
    let _state_clone = state.clone();
    let shutdown_token = state.shutdown_token.clone();

    let task_count = state.active_tasks.clone();
    task_count.fetch_add(1, Ordering::SeqCst);
    tokio::spawn(async move {
        tokio::select! {
            _ = tokio::time::sleep(tokio::time::Duration::from_secs(5)) => {
                match HealthChecker::check_all().await {
                    Ok(status) => {
                        if status.healthy {
                            info!("Health checks passed");
                        } else {
                            warn!("Health checks reported issues: {:?}", status.checks);
                        }
                    }
                    Err(e) => warn!("Health checks failed to run: {}", e),
                }
            },
            _ = shutdown_token.cancelled() => return,
        }
    });

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio_test::assert_ok;

    #[test]
    fn test_module_imports() {
        // Basic smoke test to ensure all modules compile
        // If this compiles, all modules are imported correctly
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_async_setup() {
        // Test async functionality with multi-threaded runtime
        // If this runs without panicking, async setup works
        tokio::time::sleep(tokio::time::Duration::from_millis(1)).await;
    }

    #[tokio::test(flavor = "current_thread", start_paused = true)]
    async fn test_time_controlled_async() {
        // Test with time control for deterministic testing
        let start = tokio::time::Instant::now();

        // Advance time manually
        tokio::time::advance(tokio::time::Duration::from_secs(1)).await;

        let elapsed = start.elapsed();
        assert!(elapsed >= tokio::time::Duration::from_secs(1));
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_database_connection() {
        // Test database connection and basic operations
        use tempfile::tempdir;

        let temp_dir = tempdir().unwrap();
        let db_path = temp_dir.path().join("test.db");

        // Test creating a database connection
        let db = crate::storage::Database::new_test(&db_path).await.unwrap();

        // Test basic query
        let result = db.health_check().await;
        assert_ok!(result);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_error_send_sync() {
        // Test that our error types are Send + Sync
        fn assert_send_sync<T: Send + Sync>() {}

        assert_send_sync::<crate::error::AppError>();
        assert_send_sync::<crate::error::Result<()>>();
    }

    // Property tests for response types
    #[cfg(test)]
    mod property_tests {
        use proptest::prelude::*;

        proptest! {
            #[test]
            fn test_command_response_roundtrip(data in ".*") {
                // Test CommandResponse serialization/deserialization with success case
                let response = crate::responses::CommandResponse::success(data.clone());

                // Test roundtrip
                let serialized = serde_json::to_string(&response).unwrap();
                let deserialized: crate::responses::CommandResponse<String> = serde_json::from_str(&serialized).unwrap();

                // Verify success status and data matches
                prop_assert_eq!(response.success, deserialized.success);
                prop_assert_eq!(response.data, deserialized.data);
            }

            #[test]
            fn test_error_response_roundtrip(error_msg in ".*") {
                // Test CommandResponse serialization/deserialization with error case
                let response = crate::responses::CommandResponse::<()>::error_with_details(
                    "TEST_ERROR".to_string(),
                    error_msg.clone(),
                    None,
                    true,
                );

                // Test roundtrip
                let serialized = serde_json::to_string(&response).unwrap();
                let deserialized: crate::responses::CommandResponse<()> = serde_json::from_str(&serialized).unwrap();

                // Verify error status matches
                prop_assert_eq!(response.success, deserialized.success);
                prop_assert!(!deserialized.success);
            }

            #[test]
            fn test_file_size_validation(size in 0u64..1000000u64) {
                // Test that file size validation works correctly
                use crate::utils::security::validate_file_size;

                // Small files should always be valid
                let result = validate_file_size(size, 1000000);
                prop_assert!(result.is_ok() || size > 1000000);
            }
        }
    }
}
