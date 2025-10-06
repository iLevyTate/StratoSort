use crate::error::{AppError, Result};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{RwLock, Semaphore};
use tracing::{debug, error, info, warn};

/// Connection pool for managing Ollama API connections
pub struct ConnectionPool {
    /// Maximum number of concurrent connections
    max_connections: usize,
    /// Semaphore to limit concurrent requests
    semaphore: Arc<Semaphore>,
    /// Connection statistics
    stats: Arc<RwLock<ConnectionStats>>,
    /// Circuit breaker state
    circuit_breaker: Arc<RwLock<CircuitBreaker>>,
}

#[derive(Debug, Clone, Default)]
struct ConnectionStats {
    total_requests: u64,
    successful_requests: u64,
    failed_requests: u64,
    total_latency_ms: u64,
    last_request_time: Option<Instant>,
}

/// Circuit breaker for preventing cascading failures
#[derive(Debug, Clone)]
pub struct CircuitBreaker {
    state: CircuitState,
    failure_threshold: u32,
    success_threshold: u32,
    half_open_requests: u32,
    last_failure_time: Option<Instant>,
    consecutive_failures: u32,
    consecutive_successes: u32,
    backoff_duration: Duration,
}

#[derive(Debug, Clone, PartialEq)]
enum CircuitState {
    Closed,   // Normal operation
    Open,     // Failing, reject requests
    HalfOpen, // Testing if service recovered
}

impl Default for CircuitBreaker {
    fn default() -> Self {
        Self {
            state: CircuitState::Closed,
            failure_threshold: 5,
            success_threshold: 3,
            half_open_requests: 0,
            last_failure_time: None,
            consecutive_failures: 0,
            consecutive_successes: 0,
            backoff_duration: Duration::from_secs(1), // Start with 1 second backoff
        }
    }
}

impl CircuitBreaker {
    /// Calculate exponential backoff duration
    fn calculate_backoff(&self) -> Duration {
        // 1s, 2s, 4s, 8s, 16s, 32s, max 60s
        let seconds = 2u64.pow(self.consecutive_failures.min(6));
        Duration::from_secs(seconds.min(60))
    }
}

impl ConnectionPool {
    pub fn new(max_connections: usize) -> Self {
        Self {
            max_connections,
            semaphore: Arc::new(Semaphore::new(max_connections)),
            stats: Arc::new(RwLock::new(ConnectionStats::default())),
            circuit_breaker: Arc::new(RwLock::new(CircuitBreaker::default())),
        }
    }

    /// Acquire a connection permit
    pub async fn acquire(&self) -> Result<ConnectionPermit> {
        // Check circuit breaker FIRST before acquiring semaphore
        {
            let mut breaker = self.circuit_breaker.write().await;
            breaker.check_state();

            match breaker.state {
                CircuitState::Open => {
                    return Err(AppError::AiError {
                        message: "Circuit breaker is open - Ollama service is unavailable".to_string(),
                    });
                }
                CircuitState::HalfOpen => {
                    if breaker.half_open_requests >= 1 {
                        return Err(AppError::AiError {
                            message: "Circuit breaker is testing - please retry later".to_string(),
                        });
                    }
                    breaker.half_open_requests += 1;
                }
                CircuitState::Closed => {}
            }
        } // Drop the lock before acquiring semaphore

        // Try to acquire permit with timeout
        let permit = match tokio::time::timeout(
            Duration::from_secs(5),
            self.semaphore.clone().acquire_owned(),
        )
        .await
        {
            Ok(Ok(permit)) => permit,
            Ok(Err(_)) => {
                return Err(AppError::AiError {
                    message: "Failed to acquire connection permit".to_string(),
                });
            }
            Err(_) => {
                return Err(AppError::Timeout {
                    message: "Connection pool timeout".to_string(),
                });
            }
        };

        // Double-check circuit breaker after acquiring semaphore (handle race condition)
        {
            let breaker = self.circuit_breaker.read().await;
            if breaker.state == CircuitState::Open {
                drop(permit); // Release the permit since we're not proceeding
                return Err(AppError::AiError {
                    message: "Circuit breaker opened during request - Ollama service is unavailable".to_string(),
                });
            }
        }

        let start_time = Instant::now();
        let mut stats = self.stats.write().await;
        stats.total_requests += 1;
        stats.last_request_time = Some(start_time);
        drop(stats);

        Ok(ConnectionPermit {
            _permit: permit,
            pool: self.clone(),
            start_time,
        })
    }

    /// Record successful request
    pub async fn record_success(&self, latency: Duration) {
        let mut stats = self.stats.write().await;
        stats.successful_requests += 1;
        stats.total_latency_ms += latency.as_millis() as u64;
        drop(stats);

        let mut breaker = self.circuit_breaker.write().await;
        breaker.on_success();
    }

    /// Record failed request
    pub async fn record_failure(&self) {
        let mut stats = self.stats.write().await;
        stats.failed_requests += 1;
        drop(stats);

        let mut breaker = self.circuit_breaker.write().await;
        breaker.on_failure();
    }

    /// Get connection statistics
    pub async fn get_stats(&self) -> ConnectionPoolStats {
        let stats = self.stats.read().await;
        let breaker = self.circuit_breaker.read().await;

        let avg_latency_ms = if stats.successful_requests > 0 {
            stats.total_latency_ms / stats.successful_requests
        } else {
            0
        };

        ConnectionPoolStats {
            total_requests: stats.total_requests,
            successful_requests: stats.successful_requests,
            failed_requests: stats.failed_requests,
            avg_latency_ms,
            circuit_breaker_state: format!("{:?}", breaker.state),
            available_connections: self.semaphore.available_permits(),
            max_connections: self.max_connections,
        }
    }
}

impl Clone for ConnectionPool {
    fn clone(&self) -> Self {
        Self {
            max_connections: self.max_connections,
            semaphore: self.semaphore.clone(),
            stats: self.stats.clone(),
            circuit_breaker: self.circuit_breaker.clone(),
        }
    }
}

impl CircuitBreaker {
    /// Check and update circuit breaker state
    fn check_state(&mut self) {
        if self.state == CircuitState::Open {
            if let Some(last_failure) = self.last_failure_time {
                // Use exponential backoff for timeout calculation
                let timeout_duration = self.calculate_backoff();
                if last_failure.elapsed() >= timeout_duration {
                    info!("Circuit breaker transitioning to half-open after backoff period");
                    self.state = CircuitState::HalfOpen;
                    self.half_open_requests = 0;
                    self.backoff_duration = timeout_duration; // Store for next failure
                }
            }
        }
    }

    /// Record successful request
    fn on_success(&mut self) {
        self.consecutive_failures = 0;
        self.consecutive_successes += 1;

        if self.state == CircuitState::HalfOpen
            && self.consecutive_successes >= self.success_threshold
        {
            info!("Circuit breaker closing - service recovered");
            self.state = CircuitState::Closed;
            self.half_open_requests = 0;
        }
    }

    /// Record failed request
    fn on_failure(&mut self) {
        self.consecutive_successes = 0;
        self.consecutive_failures += 1;
        self.last_failure_time = Some(Instant::now());

        match self.state {
            CircuitState::Closed => {
                if self.consecutive_failures >= self.failure_threshold {
                    error!("Circuit breaker opening - too many failures (exponential backoff: {:?})", self.calculate_backoff());
                    self.state = CircuitState::Open;
                    // Update backoff duration for next timeout calculation
                    self.backoff_duration = self.calculate_backoff();
                }
            }
            CircuitState::HalfOpen => {
                warn!("Circuit breaker reopening - test request failed");
                self.state = CircuitState::Open;
                self.half_open_requests = 0;
                // Reset backoff on half-open failure
                self.backoff_duration = Duration::from_secs(1);
            }
            _ => {}
        }
    }
}

/// Permit for making a connection
pub struct ConnectionPermit {
    _permit: tokio::sync::OwnedSemaphorePermit,
    pool: ConnectionPool,
    start_time: Instant,
}

impl ConnectionPermit {
    /// Mark the request as successful
    pub async fn success(self) {
        let latency = self.start_time.elapsed();
        self.pool.record_success(latency).await;
        debug!("Request completed successfully in {:?}", latency);
    }

    /// Mark the request as failed
    pub async fn failure(self) {
        self.pool.record_failure().await;
        debug!("Request failed after {:?}", self.start_time.elapsed());
    }
}

#[derive(Debug, Clone)]
pub struct ConnectionPoolStats {
    pub total_requests: u64,
    pub successful_requests: u64,
    pub failed_requests: u64,
    pub avg_latency_ms: u64,
    pub circuit_breaker_state: String,
    pub available_connections: usize,
    pub max_connections: usize,
}

/// Health check for Ollama server
pub async fn check_ollama_health(host: &str, port: u16) -> Result<bool> {
    use std::net::{TcpStream, ToSocketAddrs};

    let addr = format!("{}:{}", host, port);

    // Try to connect with timeout
    let result = tokio::task::spawn_blocking(move || match addr.to_socket_addrs() {
        Ok(mut addrs) => {
            if let Some(socket_addr) = addrs.next() {
                TcpStream::connect_timeout(&socket_addr, Duration::from_secs(2)).is_ok()
            } else {
                false
            }
        }
        Err(_) => false,
    })
    .await;

    match result {
        Ok(is_connected) => Ok(is_connected),
        Err(_) => Ok(false),
    }
}
