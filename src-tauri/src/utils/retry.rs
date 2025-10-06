/// Retry logic and circuit breaker for resilient LLM operations
use crate::error::Result;
use std::future::Future;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tokio::time::sleep;
use tracing::{debug, warn};

/// Configuration for retry behavior
#[derive(Debug, Clone)]
pub struct RetryConfig {
    /// Maximum number of retry attempts
    pub max_retries: u32,
    /// Initial backoff duration
    pub initial_backoff: Duration,
    /// Maximum backoff duration
    pub max_backoff: Duration,
    /// Backoff multiplier (exponential)
    pub backoff_multiplier: f64,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_retries: 3,
            initial_backoff: Duration::from_millis(100),
            max_backoff: Duration::from_secs(10),
            backoff_multiplier: 2.0,
        }
    }
}

/// Execute operation with exponential backoff retry
pub async fn with_retry<F, Fut, T, E>(
    operation_name: &str,
    config: &RetryConfig,
    mut operation: F,
) -> std::result::Result<T, E>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = std::result::Result<T, E>>,
    E: std::fmt::Display,
{
    let mut attempts = 0;
    let mut backoff = config.initial_backoff;

    loop {
        match operation().await {
            Ok(result) => {
                if attempts > 0 {
                    debug!("{} succeeded after {} retries", operation_name, attempts);
                }
                return Ok(result);
            }
            Err(e) => {
                attempts += 1;

                if attempts > config.max_retries {
                    warn!(
                        "{} failed after {} attempts: {}",
                        operation_name, config.max_retries, e
                    );
                    return Err(e);
                }

                warn!(
                    "{} attempt {}/{} failed: {}. Retrying in {:?}",
                    operation_name, attempts, config.max_retries, e, backoff
                );

                sleep(backoff).await;

                // Exponential backoff
                backoff = Duration::from_millis(
                    ((backoff.as_millis() as f64 * config.backoff_multiplier) as u64)
                        .min(config.max_backoff.as_millis() as u64),
                );
            }
        }
    }
}

/// Circuit breaker states
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum CircuitState {
    Closed,   // Normal operation
    Open,     // Failures detected, blocking requests
    HalfOpen, // Testing if service recovered
}

/// Circuit breaker for preventing cascading failures
pub struct CircuitBreaker {
    state: Arc<RwLock<CircuitState>>,
    failure_count: Arc<RwLock<u32>>,
    failure_threshold: u32,
    timeout: Duration,
    last_failure_time: Arc<RwLock<Option<std::time::Instant>>>,
}

impl CircuitBreaker {
    pub fn new(failure_threshold: u32, _success_threshold: u32, timeout: Duration) -> Self {
        Self {
            state: Arc::new(RwLock::new(CircuitState::Closed)),
            failure_count: Arc::new(RwLock::new(0)),
            failure_threshold,
            timeout,
            last_failure_time: Arc::new(RwLock::new(None)),
        }
    }

    /// Execute operation through circuit breaker
    pub async fn call<F, Fut, T>(&self, operation_name: &str, operation: F) -> Result<T>
    where
        F: FnOnce() -> Fut,
        Fut: Future<Output = Result<T>>,
    {
        // Check if circuit should transition from Open to HalfOpen
        self.check_timeout().await;

        let state = *self.state.read().await;

        match state {
            CircuitState::Open => Err(crate::error::AppError::AiError {
                message: format!(
                    "Circuit breaker is OPEN for {}. Service temporarily unavailable.",
                    operation_name
                ),
            }),
            CircuitState::HalfOpen | CircuitState::Closed => match operation().await {
                Ok(result) => {
                    self.on_success().await;
                    Ok(result)
                }
                Err(e) => {
                    self.on_failure().await;
                    Err(e)
                }
            },
        }
    }

    async fn check_timeout(&self) {
        let last_failure = *self.last_failure_time.read().await;

        if let Some(last_time) = last_failure {
            if last_time.elapsed() >= self.timeout {
                let mut state = self.state.write().await;
                if *state == CircuitState::Open {
                    debug!("Circuit breaker transitioning to HALF_OPEN");
                    *state = CircuitState::HalfOpen;
                }
            }
        }
    }

    async fn on_success(&self) {
        let mut state = self.state.write().await;

        match *state {
            CircuitState::HalfOpen => {
                // After success in HalfOpen, check if we can close
                let mut failure_count = self.failure_count.write().await;
                *failure_count = 0;
                *state = CircuitState::Closed;
                debug!("Circuit breaker CLOSED after successful recovery");
            }
            CircuitState::Closed => {
                // Reset failure count on success
                let mut failure_count = self.failure_count.write().await;
                *failure_count = 0;
            }
            _ => {}
        }
    }

    async fn on_failure(&self) {
        let mut failure_count = self.failure_count.write().await;
        *failure_count += 1;

        let mut state = self.state.write().await;

        match *state {
            CircuitState::Closed => {
                if *failure_count >= self.failure_threshold {
                    *state = CircuitState::Open;
                    *self.last_failure_time.write().await = Some(std::time::Instant::now());
                    warn!(
                        "Circuit breaker OPENED after {} failures",
                        self.failure_threshold
                    );
                }
            }
            CircuitState::HalfOpen => {
                // Failure in HalfOpen means service still unhealthy
                *state = CircuitState::Open;
                *self.last_failure_time.write().await = Some(std::time::Instant::now());
                warn!("Circuit breaker returned to OPEN state after failed recovery attempt");
            }
            _ => {}
        }
    }

    /// Get current circuit breaker status
    pub async fn status(&self) -> CircuitBreakerStatus {
        CircuitBreakerStatus {
            state: *self.state.read().await,
            failure_count: *self.failure_count.read().await,
            failure_threshold: self.failure_threshold,
        }
    }
}

#[derive(Debug, Clone)]
pub struct CircuitBreakerStatus {
    pub state: CircuitState,
    pub failure_count: u32,
    pub failure_threshold: u32,
}

impl std::fmt::Display for CircuitBreakerStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "CircuitBreaker {{ state: {:?}, failures: {}/{} }}",
            self.state, self.failure_count, self.failure_threshold
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[tokio::test]
    async fn test_retry_success_first_attempt() {
        let config = RetryConfig::default();
        let attempt_count = Arc::new(AtomicUsize::new(0));
        let count_clone = attempt_count.clone();

        let result = with_retry("test_op", &config, move || {
            let count = count_clone.clone();
            async move {
                count.fetch_add(1, Ordering::SeqCst);
                Ok::<_, String>(42)
            }
        })
        .await;

        assert_eq!(result, Ok(42));
        assert_eq!(attempt_count.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn test_retry_success_after_failures() {
        let config = RetryConfig {
            max_retries: 3,
            initial_backoff: Duration::from_millis(10),
            ..Default::default()
        };
        let attempt_count = Arc::new(AtomicUsize::new(0));
        let count_clone = attempt_count.clone();

        let result = with_retry("test_op", &config, move || {
            let count = count_clone.clone();
            async move {
                let current = count.fetch_add(1, Ordering::SeqCst) + 1;
                if current < 3 {
                    Err("temporary failure")
                } else {
                    Ok(42)
                }
            }
        })
        .await;

        assert_eq!(result, Ok(42));
        assert_eq!(attempt_count.load(Ordering::SeqCst), 3);
    }

    #[tokio::test]
    async fn test_retry_max_attempts_exceeded() {
        let config = RetryConfig {
            max_retries: 2,
            initial_backoff: Duration::from_millis(10),
            ..Default::default()
        };
        let attempt_count = Arc::new(AtomicUsize::new(0));
        let count_clone = attempt_count.clone();

        let result = with_retry("test_op", &config, move || {
            let count = count_clone.clone();
            async move {
                count.fetch_add(1, Ordering::SeqCst);
                Err::<i32, _>("permanent failure")
            }
        })
        .await;

        assert_eq!(result, Err("permanent failure"));
        assert_eq!(attempt_count.load(Ordering::SeqCst), 3); // Initial + 2 retries
    }

    #[tokio::test]
    async fn test_circuit_breaker_opens_after_failures() {
        let cb = CircuitBreaker::new(3, 1, Duration::from_secs(1));
        let call_count = Arc::new(AtomicUsize::new(0));

        // Make 3 failing calls to trigger circuit open
        for _ in 0..3 {
            let count_clone = call_count.clone();
            let _ = cb
                .call("test", move || {
                    let count = count_clone.clone();
                    async move {
                        count.fetch_add(1, Ordering::SeqCst);
                        Err::<(), _>(crate::error::AppError::AiError {
                            message: "test failure".to_string(),
                        })
                    }
                })
                .await;
        }

        // Circuit should be open now
        let status = cb.status().await;
        assert_eq!(status.state, CircuitState::Open);

        // Next call should be rejected without calling operation
        let result = cb.call("test", || async { Ok(()) }).await;
        assert!(result.is_err());
    }
}
