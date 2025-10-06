use crate::error::{AppError, Result};
use std::process::{Command, Stdio};
use std::time::Duration;
use tokio::time::sleep;
use tracing::{info, warn, error};

/// Manages Ollama service lifecycle and model management
pub struct OllamaManager {
    host: String,
}

impl OllamaManager {
    /// Create a new Ollama manager
    pub fn new(host: &str) -> Self {
        Self {
            host: host.to_string(),
        }
    }

    /// Check if Ollama service is running
    pub async fn is_running(&self) -> bool {
        match reqwest::get(&format!("{}/api/tags", self.host)).await {
            Ok(response) => response.status().is_success(),
            Err(_) => false,
        }
    }

    /// Start Ollama service if not running
    pub async fn ensure_running(&self) -> Result<()> {
        if self.is_running().await {
            info!("Ollama is already running at {}", self.host);
            return Ok(());
        }

        info!("Ollama not running, attempting to start...");

        // Try to start Ollama
        match Command::new("ollama")
            .arg("serve")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
        {
            Ok(child) => {
                info!("Started Ollama process (PID: {})", child.id());

                // Wait for Ollama to start up
                let mut attempts = 0;
                while attempts < 30 { // Wait up to 30 seconds
                    sleep(Duration::from_secs(1)).await;
                    if self.is_running().await {
                        info!("Ollama successfully started and responding at {}", self.host);
                        return Ok(());
                    }
                    attempts += 1;
                }

                warn!("Ollama process started but service not responding after 30 seconds");
                Err(AppError::AiError { message: "Ollama started but not responding".to_string() })
            }
            Err(e) => {
                error!("Failed to start Ollama process: {}", e);
                Err(AppError::AiError { message: format!("Failed to start Ollama: {}", e) })
            }
        }
    }

    /// Check if a model is available locally
    pub async fn is_model_available(&self, model_name: &str) -> Result<bool> {
        let client = reqwest::Client::new();
        match client
            .get(format!("{}/api/show", self.host))
            .query(&[("name", model_name)])
            .send()
            .await
        {
            Ok(response) => Ok(response.status().is_success()),
            Err(_) => Ok(false),
        }
    }

    /// Pull a model if not available
    pub async fn ensure_model_available(&self, model_name: &str) -> Result<()> {
        if self.is_model_available(model_name).await.unwrap_or(false) {
            info!("Model '{}' is already available", model_name);
            return Ok(());
        }

        info!("Pulling model '{}'...", model_name);

        match Command::new("ollama")
            .args(["pull", model_name])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
        {
            Ok(status) if status.success() => {
                info!("Successfully pulled model '{}'", model_name);
                Ok(())
            }
            Ok(status) => {
                let err_msg = format!("Failed to pull model '{}' (exit code: {})", model_name, status);
                error!("{}", err_msg);
                Err(AppError::AiError { message: err_msg })
            }
            Err(e) => {
                let err_msg = format!("Failed to execute ollama pull for '{}': {}", model_name, e);
                error!("{}", err_msg);
                Err(AppError::AiError { message: err_msg })
            }
        }
    }

    /// Ensure all required models are available
    pub async fn ensure_required_models(&self, models: &[&str]) -> Result<()> {
        for model in models {
            self.ensure_model_available(model).await?;
        }
        info!("All required models are available");
        Ok(())
    }

    /// Get list of available models
    pub async fn list_available_models(&self) -> Result<Vec<String>> {
        let client = reqwest::Client::new();
        match client
            .get(format!("{}/api/tags", self.host))
            .send()
            .await
        {
            Ok(response) if response.status().is_success() => {
                match response.json::<serde_json::Value>().await {
                    Ok(json) => {
                        if let Some(models) = json.get("models").and_then(|m| m.as_array()) {
                            let model_names = models
                                .iter()
                                .filter_map(|model| model.get("name").and_then(|n| n.as_str()))
                                .map(|s| s.to_string())
                                .collect();
                            Ok(model_names)
                        } else {
                            Ok(vec![])
                        }
                    }
                    Err(e) => {
                        warn!("Failed to parse models response: {}", e);
                        Ok(vec![])
                    }
                }
            }
            Ok(response) => {
                warn!("Failed to fetch models list: HTTP {}", response.status());
                Ok(vec![])
            }
            Err(e) => {
                warn!("Failed to fetch models list: {}", e);
                Ok(vec![])
            }
        }
    }
}

/// Initialize Ollama service with auto-start and model management
pub async fn initialize_ollama_service(config: &crate::config::Config) -> Result<()> {
    let manager = OllamaManager::new(&config.ollama_host);

    // Ensure Ollama is running
    manager.ensure_running().await?;

    // Ensure required models are available
    let required_models: Vec<&str> = vec![
        &config.ollama_model,
        &config.ollama_vision_model,
        &config.ollama_embedding_model,
    ];

    manager.ensure_required_models(&required_models).await?;

    info!("Ollama service fully initialized with all required models");
    Ok(())
}
