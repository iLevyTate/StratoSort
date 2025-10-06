use crate::error::Result;
use chrono::{DateTime, Utc};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::time::{Duration, Instant};

/// System health status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthStatus {
    pub status: String,
    pub timestamp: DateTime<Utc>,
    pub uptime_seconds: u64,
    pub version: String,
    pub database_connected: bool,
    pub ai_service_available: bool,
    pub memory_usage_mb: f64,
    pub disk_usage_percentage: f64,
    pub active_operations: usize,
    pub cache_hit_rate: Option<f64>,
    pub checks: Vec<HealthCheck>,
}

/// Individual health check result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthCheck {
    pub name: String,
    pub status: HealthCheckStatus,
    pub response_time_ms: u64,
    pub message: Option<String>,
    pub last_success: Option<DateTime<Utc>>,
    pub last_failure: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum HealthCheckStatus {
    #[serde(rename = "healthy")]
    Healthy,
    #[serde(rename = "degraded")]
    Degraded,
    #[serde(rename = "unhealthy")]
    Unhealthy,
}

/// Performance metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceMetrics {
    pub timestamp: DateTime<Utc>,
    pub memory_usage_mb: f64,
    pub memory_usage_percentage: f64,
    pub cpu_usage_percentage: f64,
    pub disk_usage_mb: f64,
    pub disk_usage_percentage: f64,
    pub active_operations: usize,
    pub total_requests: u64,
    pub average_response_time_ms: f64,
    pub cache_hit_rate: f64,
    pub cache_size_mb: f64,
    pub database_connections: usize,
    pub uptime_seconds: u64,
    pub errors_per_minute: f64,
    pub throughput_ops_per_second: f64,
}

/// Monitoring service that tracks application health and performance
pub struct MonitoringService {
    start_time: Instant,
    total_requests: AtomicU64,
    total_errors: AtomicU64,
    response_times: Arc<RwLock<Vec<Duration>>>,
    cache_hits: AtomicU64,
    cache_misses: AtomicU64,
    health_checks: Arc<RwLock<HashMap<String, HealthCheck>>>,
    metrics_history: Arc<RwLock<Vec<PerformanceMetrics>>>,
}

impl Default for MonitoringService {
    fn default() -> Self {
        Self::new()
    }
}

impl MonitoringService {
    /// Create a new monitoring service
    pub fn new() -> Self {
        Self {
            start_time: Instant::now(),
            total_requests: AtomicU64::new(0),
            total_errors: AtomicU64::new(0),
            response_times: Arc::new(RwLock::new(Vec::new())),
            cache_hits: AtomicU64::new(0),
            cache_misses: AtomicU64::new(0),
            health_checks: Arc::new(RwLock::new(HashMap::new())),
            metrics_history: Arc::new(RwLock::new(Vec::new())),
        }
    }

    /// Record a request with its response time
    pub fn record_request(&self, response_time: Duration, is_error: bool) {
        self.total_requests.fetch_add(1, Ordering::SeqCst);

        if is_error {
            self.total_errors.fetch_add(1, Ordering::SeqCst);
        }

        // Keep only recent response times to prevent memory growth
        let mut times = self.response_times.write();
        times.push(response_time);
        if times.len() > 1000 {
            times.remove(0);
        }
    }

    /// Record cache hit/miss
    pub fn record_cache_hit(&self, is_hit: bool) {
        if is_hit {
            self.cache_hits.fetch_add(1, Ordering::SeqCst);
        } else {
            self.cache_misses.fetch_add(1, Ordering::SeqCst);
        }
    }

    /// Get current health status with comprehensive error handling
    pub async fn get_health_status(
        &self,
        app_state: &crate::state::AppState,
    ) -> Result<HealthStatus> {
        let uptime = self.start_time.elapsed().as_secs();

        // Run health checks with error recovery
        let mut checks = Vec::new();
        let mut system_errors = Vec::new();

        // Database health check
        let db_check = self.check_database_health(&app_state.database).await;
        if matches!(db_check.status, HealthCheckStatus::Unhealthy) {
            system_errors.push(format!(
                "Database: {}",
                db_check.message.as_deref().unwrap_or("Connection failed")
            ));
        }
        checks.push(db_check.clone());

        // AI service health check
        let ai_check = self.check_ai_service_health(&app_state.ai_service).await;
        if matches!(ai_check.status, HealthCheckStatus::Unhealthy) {
            system_errors.push(format!(
                "AI Service: {}",
                ai_check.message.as_deref().unwrap_or("Service unavailable")
            ));
        }
        checks.push(ai_check.clone());

        // Memory health check with error recovery
        let memory_check = match self.check_memory_health().await {
            Ok(check) => {
                if matches!(check.status, HealthCheckStatus::Unhealthy) {
                    system_errors.push(format!(
                        "Memory: {}",
                        check.message.as_deref().unwrap_or("High usage")
                    ));
                }
                check
            }
            Err(e) => {
                system_errors.push(format!("Memory check failed: {}", e));
                HealthCheck {
                    name: "memory".to_string(),
                    status: HealthCheckStatus::Unhealthy,
                    response_time_ms: 0,
                    message: Some("Memory check failed".to_string()),
                    last_success: None,
                    last_failure: Some(Utc::now()),
                }
            }
        };
        checks.push(memory_check);

        // Disk health check with error recovery
        let disk_check = match self.check_disk_health().await {
            Ok(check) => {
                if matches!(check.status, HealthCheckStatus::Unhealthy) {
                    system_errors.push(format!(
                        "Disk: {}",
                        check.message.as_deref().unwrap_or("Low space")
                    ));
                }
                check
            }
            Err(e) => {
                system_errors.push(format!("Disk check failed: {}", e));
                HealthCheck {
                    name: "disk".to_string(),
                    status: HealthCheckStatus::Unhealthy,
                    response_time_ms: 0,
                    message: Some("Disk check failed".to_string()),
                    last_success: None,
                    last_failure: Some(Utc::now()),
                }
            }
        };
        checks.push(disk_check.clone());

        // Calculate overall status
        let overall_status = if checks
            .iter()
            .any(|c| matches!(c.status, HealthCheckStatus::Unhealthy))
        {
            "unhealthy"
        } else if checks
            .iter()
            .any(|c| matches!(c.status, HealthCheckStatus::Degraded))
        {
            "degraded"
        } else {
            "healthy"
        };

        // Get system metrics with fallback values
        let memory_usage = Self::get_memory_usage_safe();
        let disk_usage = Self::get_disk_usage_percentage_safe();
        let cache_hit_rate = self.calculate_cache_hit_rate();

        // Log system errors if any
        if !system_errors.is_empty() {
            tracing::warn!("Health check errors: {}", system_errors.join(", "));
        }

        Ok(HealthStatus {
            status: overall_status.to_string(),
            timestamp: Utc::now(),
            uptime_seconds: uptime,
            version: env!("CARGO_PKG_VERSION").to_string(),
            database_connected: matches!(db_check.status, HealthCheckStatus::Healthy),
            ai_service_available: matches!(ai_check.status, HealthCheckStatus::Healthy),
            memory_usage_mb: memory_usage,
            disk_usage_percentage: disk_usage,
            active_operations: app_state.active_operations.len(),
            cache_hit_rate,
            checks,
        })
    }

    /// Get performance metrics
    pub async fn get_performance_metrics(
        &self,
        app_state: &crate::state::AppState,
    ) -> Result<PerformanceMetrics> {
        let uptime = self.start_time.elapsed().as_secs();
        let total_requests = self.total_requests.load(Ordering::SeqCst);
        let total_errors = self.total_errors.load(Ordering::SeqCst);

        let average_response_time = {
            let times = self.response_times.read();
            if times.is_empty() {
                0.0
            } else {
                let sum: Duration = times.iter().sum();
                sum.as_millis() as f64 / times.len() as f64
            }
        };

        let memory_usage_mb = Self::get_memory_usage();
        let memory_usage_percentage = Self::get_memory_usage_percentage();
        let cpu_usage = Self::get_cpu_usage();
        let disk_usage_mb = Self::get_disk_usage_mb();
        let disk_usage_percentage = Self::get_disk_usage_percentage();
        let cache_hit_rate = self.calculate_cache_hit_rate().unwrap_or(0.0);
        let cache_size = app_state.file_cache.len() as f64 * 0.001; // Rough estimate in MB

        let errors_per_minute = if uptime > 0 {
            (total_errors as f64 / uptime as f64) * 60.0
        } else {
            0.0
        };

        let throughput = if uptime > 0 {
            total_requests as f64 / uptime as f64
        } else {
            0.0
        };

        let metrics = PerformanceMetrics {
            timestamp: Utc::now(),
            memory_usage_mb,
            memory_usage_percentage,
            cpu_usage_percentage: cpu_usage,
            disk_usage_mb,
            disk_usage_percentage,
            active_operations: app_state.active_operations.len(),
            total_requests,
            average_response_time_ms: average_response_time,
            cache_hit_rate,
            cache_size_mb: cache_size,
            database_connections: 10, // Would get from actual connection pool
            uptime_seconds: uptime,
            errors_per_minute,
            throughput_ops_per_second: throughput,
        };

        // Store metrics in history (keep last 100 entries)
        {
            let mut history = self.metrics_history.write();
            history.push(metrics.clone());
            if history.len() > 100 {
                history.remove(0);
            }
        }

        Ok(metrics)
    }

    /// Get metrics history
    pub fn get_metrics_history(&self, limit: usize) -> Vec<PerformanceMetrics> {
        let history = self.metrics_history.read();
        let start = if history.len() > limit {
            history.len() - limit
        } else {
            0
        };
        history[start..].to_vec()
    }

    /// Check database health
    async fn check_database_health(&self, database: &crate::storage::Database) -> HealthCheck {
        let start = Instant::now();

        // Simple database connectivity test
        let (status, message) = match database.health_check().await {
            Ok(_) => (HealthCheckStatus::Healthy, None),
            Err(e) => (
                HealthCheckStatus::Unhealthy,
                Some(format!("Database connection failed: {}", e)),
            ),
        };

        let response_time = start.elapsed().as_millis() as u64;

        HealthCheck {
            name: "database".to_string(),
            status,
            response_time_ms: response_time,
            message,
            last_success: if matches!(status, HealthCheckStatus::Healthy) {
                Some(Utc::now())
            } else {
                None
            },
            last_failure: if !matches!(status, HealthCheckStatus::Healthy) {
                Some(Utc::now())
            } else {
                None
            },
        }
    }

    /// Check AI service health
    async fn check_ai_service_health(&self, ai_service: &crate::ai::AiService) -> HealthCheck {
        let start = Instant::now();

        let (status, message) = if ai_service.is_available().await {
            (HealthCheckStatus::Healthy, None)
        } else {
            (
                HealthCheckStatus::Degraded,
                Some("AI service is not available, using fallback mode".to_string()),
            )
        };

        let response_time = start.elapsed().as_millis() as u64;

        HealthCheck {
            name: "ai_service".to_string(),
            status,
            response_time_ms: response_time,
            message,
            last_success: if matches!(status, HealthCheckStatus::Healthy) {
                Some(Utc::now())
            } else {
                None
            },
            last_failure: if matches!(status, HealthCheckStatus::Unhealthy) {
                Some(Utc::now())
            } else {
                None
            },
        }
    }

    /// Check memory health with error handling
    async fn check_memory_health(&self) -> Result<HealthCheck> {
        let start = Instant::now();

        let memory_usage_percentage =
            match tokio::task::spawn_blocking(Self::get_memory_usage_percentage).await {
                Ok(usage) => usage,
                Err(e) => {
                    return Err(crate::error::AppError::SystemError {
                        message: format!("Failed to get memory usage: {}", e),
                    });
                }
            };

        let (status, message) = if memory_usage_percentage > 90.0 {
            (
                HealthCheckStatus::Unhealthy,
                Some(format!(
                    "High memory usage: {:.1}%",
                    memory_usage_percentage
                )),
            )
        } else if memory_usage_percentage > 75.0 {
            (
                HealthCheckStatus::Degraded,
                Some(format!(
                    "Elevated memory usage: {:.1}%",
                    memory_usage_percentage
                )),
            )
        } else {
            (HealthCheckStatus::Healthy, None)
        };

        let response_time = start.elapsed().as_millis() as u64;

        Ok(HealthCheck {
            name: "memory".to_string(),
            status,
            response_time_ms: response_time,
            message,
            last_success: if matches!(status, HealthCheckStatus::Healthy) {
                Some(Utc::now())
            } else {
                None
            },
            last_failure: if matches!(status, HealthCheckStatus::Unhealthy) {
                Some(Utc::now())
            } else {
                None
            },
        })
    }

    /// Check disk health with error handling
    async fn check_disk_health(&self) -> Result<HealthCheck> {
        let start = Instant::now();

        let disk_usage_percentage =
            match tokio::task::spawn_blocking(Self::get_disk_usage_percentage).await {
                Ok(usage) => usage,
                Err(e) => {
                    return Err(crate::error::AppError::SystemError {
                        message: format!("Failed to get disk usage: {}", e),
                    });
                }
            };

        let (status, message) = if disk_usage_percentage > 95.0 {
            (
                HealthCheckStatus::Unhealthy,
                Some(format!(
                    "Disk space critical: {:.1}%",
                    disk_usage_percentage
                )),
            )
        } else if disk_usage_percentage > 85.0 {
            (
                HealthCheckStatus::Degraded,
                Some(format!("Disk space low: {:.1}%", disk_usage_percentage)),
            )
        } else {
            (HealthCheckStatus::Healthy, None)
        };

        let response_time = start.elapsed().as_millis() as u64;

        Ok(HealthCheck {
            name: "disk".to_string(),
            status,
            response_time_ms: response_time,
            message,
            last_success: if matches!(status, HealthCheckStatus::Healthy) {
                Some(Utc::now())
            } else {
                None
            },
            last_failure: if matches!(status, HealthCheckStatus::Unhealthy) {
                Some(Utc::now())
            } else {
                None
            },
        })
    }

    /// Calculate cache hit rate
    fn calculate_cache_hit_rate(&self) -> Option<f64> {
        let hits = self.cache_hits.load(Ordering::SeqCst);
        let misses = self.cache_misses.load(Ordering::SeqCst);
        let total = hits + misses;

        if total > 0 {
            Some((hits as f64 / total as f64) * 100.0)
        } else {
            None
        }
    }

    // System metrics helpers

    fn get_memory_usage() -> f64 {
        use sysinfo::System;
        let mut sys = System::new();
        sys.refresh_memory();
        sys.used_memory() as f64 / 1_024_000.0 // Convert to MB
    }

    fn get_memory_usage_percentage() -> f64 {
        use sysinfo::System;
        let mut sys = System::new();
        sys.refresh_memory();
        (sys.used_memory() as f64 / sys.total_memory() as f64) * 100.0
    }

    /// Safe memory usage getter with error handling
    fn get_memory_usage_safe() -> f64 {
        use sysinfo::System;
        match std::panic::catch_unwind(|| {
            let mut sys = System::new();
            sys.refresh_memory();
            sys.used_memory() as f64 / 1_024_000.0
        }) {
            Ok(usage) => usage,
            Err(_) => {
                tracing::error!("Failed to get memory usage, returning 0");
                0.0
            }
        }
    }

    /// Safe disk usage percentage getter with error handling
    fn get_disk_usage_percentage_safe() -> f64 {
        use sysinfo::{Disks, System};
        match std::panic::catch_unwind(|| {
            let _sys = System::new();
            let disks = Disks::new_with_refreshed_list();

            let (used, total): (u64, u64) = disks
                .iter()
                .map(|disk| {
                    (
                        disk.total_space() - disk.available_space(),
                        disk.total_space(),
                    )
                })
                .fold((0, 0), |(acc_used, acc_total), (used, total)| {
                    (acc_used + used, acc_total + total)
                });

            if total > 0 {
                (used as f64 / total as f64) * 100.0
            } else {
                0.0
            }
        }) {
            Ok(percentage) => percentage,
            Err(_) => {
                tracing::error!("Failed to get disk usage, returning 0");
                0.0
            }
        }
    }

    fn get_cpu_usage() -> f64 {
        use sysinfo::System;
        let mut sys = System::new();
        std::thread::sleep(std::time::Duration::from_millis(200));
        sys.refresh_cpu_all();
        sys.global_cpu_usage() as f64
    }

    fn get_disk_usage_mb() -> f64 {
        use sysinfo::{Disks, System};
        let _sys = System::new();
        let disks = Disks::new_with_refreshed_list();

        disks
            .iter()
            .map(|disk| (disk.total_space() - disk.available_space()) as f64 / 1_024_000.0)
            .sum()
    }

    fn get_disk_usage_percentage() -> f64 {
        use sysinfo::{Disks, System};
        let _sys = System::new();
        let disks = Disks::new_with_refreshed_list();

        let (used, total): (u64, u64) = disks
            .iter()
            .map(|disk| {
                (
                    disk.total_space() - disk.available_space(),
                    disk.total_space(),
                )
            })
            .fold((0, 0), |(acc_used, acc_total), (used, total)| {
                (acc_used + used, acc_total + total)
            });

        if total > 0 {
            (used as f64 / total as f64) * 100.0
        } else {
            0.0
        }
    }

    /// Get the start time of the monitoring service
    pub fn get_start_time(&self) -> Instant {
        self.start_time
    }

    /// Start periodic metrics collection
    pub fn start_periodic_collection(&self, app_state: std::sync::Arc<crate::state::AppState>) {
        let monitoring = std::sync::Arc::new(self.clone());
        let state = app_state;

        tokio::spawn(async move {
            let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(60)); // Collect every minute

            loop {
                interval.tick().await;

                // Collect performance metrics
                if let Ok(metrics) = monitoring.get_performance_metrics(&state).await {
                    // Metrics are automatically stored in history by get_performance_metrics
                    tracing::debug!(
                        "Collected metrics: CPU {:.1}%, Memory {:.1}%, Active Ops: {}",
                        metrics.cpu_usage_percentage,
                        metrics.memory_usage_percentage,
                        metrics.active_operations
                    );

                    // Emit metrics to frontend if configured
                    // Use Emitter trait explicitly
                    use tauri::Emitter;
                    let _ = state.handle.emit("metrics-collected", &metrics);
                } else {
                    tracing::warn!("Failed to collect periodic metrics");
                }
            }
        });
    }

    /// Enable/disable metrics collection
    pub fn set_metrics_collection_enabled(&self, enabled: bool) {
        if enabled {
            tracing::info!("Periodic metrics collection enabled");
        } else {
            tracing::info!("Periodic metrics collection disabled");
        }
        // Note: In a full implementation, you would store this state and conditionally run collection
    }

    /// Shutdown the monitoring service
    pub async fn shutdown(&self) {
        // Clear metrics history
        self.metrics_history.write().clear();
        self.health_checks.write().clear();
        self.response_times.write().clear();
        tracing::info!("Monitoring service shut down");
    }
}

// Clone implementation for MonitoringService to enable sharing
impl Clone for MonitoringService {
    fn clone(&self) -> Self {
        Self {
            start_time: self.start_time,
            total_requests: AtomicU64::new(self.total_requests.load(Ordering::SeqCst)),
            total_errors: AtomicU64::new(self.total_errors.load(Ordering::SeqCst)),
            response_times: Arc::clone(&self.response_times),
            cache_hits: AtomicU64::new(self.cache_hits.load(Ordering::SeqCst)),
            cache_misses: AtomicU64::new(self.cache_misses.load(Ordering::SeqCst)),
            health_checks: Arc::clone(&self.health_checks),
            metrics_history: Arc::clone(&self.metrics_history),
        }
    }
}

/// Middleware for automatic request monitoring
pub struct MonitoringMiddleware {
    monitoring: Arc<MonitoringService>,
}

impl MonitoringMiddleware {
    pub fn new(monitoring: Arc<MonitoringService>) -> Self {
        Self { monitoring }
    }

    /// Record request metrics
    pub fn record_request(&self, duration: Duration, success: bool) {
        self.monitoring.record_request(duration, !success);
    }

    /// Record cache metrics
    pub fn record_cache(&self, is_hit: bool) {
        self.monitoring.record_cache_hit(is_hit);
    }
}

/// Health check configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthCheckConfig {
    pub enabled: bool,
    pub interval_seconds: u64,
    pub timeout_seconds: u64,
    pub failure_threshold: u32,
    pub success_threshold: u32,
}

impl Default for HealthCheckConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            interval_seconds: 30,
            timeout_seconds: 10,
            failure_threshold: 3,
            success_threshold: 2,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::time::Duration;

    #[test]
    fn test_monitoring_service_creation() {
        let monitoring = MonitoringService::new();
        assert_eq!(monitoring.total_requests.load(Ordering::SeqCst), 0);
        assert_eq!(monitoring.total_errors.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn test_record_request() {
        let monitoring = MonitoringService::new();

        monitoring.record_request(Duration::from_millis(100), false);
        monitoring.record_request(Duration::from_millis(200), true);

        assert_eq!(monitoring.total_requests.load(Ordering::SeqCst), 2);
        assert_eq!(monitoring.total_errors.load(Ordering::SeqCst), 1);

        let times = monitoring.response_times.read();
        assert_eq!(times.len(), 2);
    }

    #[test]
    fn test_cache_hit_rate_calculation() {
        let monitoring = MonitoringService::new();

        // No cache activity
        assert_eq!(monitoring.calculate_cache_hit_rate(), None);

        // Record some cache activity
        monitoring.record_cache_hit(true);
        monitoring.record_cache_hit(true);
        monitoring.record_cache_hit(false);

        if let Some(hit_rate) = monitoring.calculate_cache_hit_rate() {
            assert!((hit_rate - 66.67).abs() < 0.01); // ~66.67%
        } else {
            panic!("Cache hit rate calculation should work with recorded data");
        }
    }

    #[test]
    fn test_health_check_status() {
        let check = HealthCheck {
            name: "test".to_string(),
            status: HealthCheckStatus::Healthy,
            response_time_ms: 50,
            message: None,
            last_success: Some(Utc::now()),
            last_failure: None,
        };

        assert!(matches!(check.status, HealthCheckStatus::Healthy));
        assert_eq!(check.name, "test");
        assert_eq!(check.response_time_ms, 50);
    }

    #[tokio::test]
    async fn test_metrics_history_limit() {
        let monitoring = MonitoringService::new();

        // Add more metrics than the limit
        for i in 0..150 {
            let metrics = PerformanceMetrics {
                timestamp: Utc::now(),
                memory_usage_mb: i as f64,
                memory_usage_percentage: 50.0,
                cpu_usage_percentage: 25.0,
                disk_usage_mb: 1000.0,
                disk_usage_percentage: 75.0,
                active_operations: 0,
                total_requests: i,
                average_response_time_ms: 100.0,
                cache_hit_rate: 80.0,
                cache_size_mb: 10.0,
                database_connections: 5,
                uptime_seconds: 3600,
                errors_per_minute: 0.1,
                throughput_ops_per_second: 10.0,
            };

            monitoring.metrics_history.write().push(metrics);
        }

        let history = monitoring.get_metrics_history(50);
        assert_eq!(history.len(), 50);

        // Should return the most recent 50 metrics
        assert_eq!(history[0].total_requests, 100); // 150 - 50
        assert_eq!(history[49].total_requests, 149);
    }

    #[test]
    fn test_system_metrics() {
        // These are basic smoke tests since actual values depend on the system
        let memory_usage = MonitoringService::get_memory_usage();
        assert!(memory_usage >= 0.0);

        let memory_percentage = MonitoringService::get_memory_usage_percentage();
        assert!((0.0..=100.0).contains(&memory_percentage));

        let disk_usage = MonitoringService::get_disk_usage_mb();
        assert!(disk_usage >= 0.0);

        let disk_percentage = MonitoringService::get_disk_usage_percentage();
        assert!((0.0..=100.0).contains(&disk_percentage));
    }
}
