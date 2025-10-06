use crate::error::Result;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use sysinfo::System;
use tokio::time::{interval, Duration};
use tracing::{debug, warn};

pub struct MemoryMonitor {
    threshold: f32,
}

impl Default for MemoryMonitor {
    fn default() -> Self {
        Self::new()
    }
}

impl MemoryMonitor {
    pub fn new() -> Self {
        Self { threshold: 80.0 }
    }

    pub async fn start(self: Arc<Self>) -> Result<()> {
        let mut interval = interval(Duration::from_secs(30));

        tokio::spawn(async move {
            loop {
                interval.tick().await;
                self.check_memory();
            }
        });

        Ok(())
    }

    fn check_memory(&self) {
        let mut sys = System::new_all();
        sys.refresh_memory();

        let used = sys.used_memory();
        let total = sys.total_memory();
        let percentage = (used as f32 / total as f32) * 100.0;

        debug!("Memory usage: {:.1}%", percentage);

        if percentage > self.threshold {
            warn!("High memory usage: {:.1}%", percentage);
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryUsage {
    pub used_mb: f64,
    pub total_mb: f64,
    pub available_mb: f64,
    pub percentage: f64,
}

/// Get current memory usage information
pub async fn get_memory_usage() -> MemoryUsage {
    // Use spawn_blocking for system information gathering
    tokio::task::spawn_blocking(|| {
        let mut sys = System::new();
        sys.refresh_memory();

        let used = sys.used_memory();
        let total = sys.total_memory();
        let available = sys.available_memory();

        let used_mb = used as f64 / 1_024_000.0;
        let total_mb = total as f64 / 1_024_000.0;
        let available_mb = available as f64 / 1_024_000.0;
        let percentage = if total > 0 {
            (used as f64 / total as f64) * 100.0
        } else {
            0.0
        };

        MemoryUsage {
            used_mb,
            total_mb,
            available_mb,
            percentage,
        }
    })
    .await
    .unwrap_or({
        // Fallback values if system info gathering fails
        MemoryUsage {
            used_mb: 0.0,
            total_mb: 0.0,
            available_mb: 0.0,
            percentage: 0.0,
        }
    })
}
