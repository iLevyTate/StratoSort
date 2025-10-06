use crate::error::Result;
use reqwest;
use serde::{Deserialize, Serialize};
use tokio::time::Duration;

/// Request structure for Ollama embedding API
#[derive(Serialize)]
struct EmbeddingRequest {
    model: String,
    prompt: String,
}

/// Response structure for Ollama embedding API
#[derive(Deserialize)]
struct EmbeddingResponse {
    embedding: Vec<f64>,
}

/// Generates high-quality embeddings using Ollama embedding models
/// Falls back to simple embeddings if Ollama is unavailable
pub async fn generate_embeddings_with_ollama(
    text: &str,
    ollama_host: &str,
    model: &str,
) -> Result<Vec<f32>> {
    // Try Ollama first for high-quality embeddings
    match generate_ollama_embeddings(text, ollama_host, model).await {
        Ok(embeddings) => Ok(embeddings),
        Err(e) => {
            tracing::warn!("Ollama embedding failed: {}. Using fallback.", e);
            generate_simple_embeddings(text)
        }
    }
}

/// Generates embeddings using Ollama embedding models
async fn generate_ollama_embeddings(
    text: &str,
    ollama_host: &str,
    model: &str,
) -> Result<Vec<f32>> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()?;

    let request = EmbeddingRequest {
        model: model.to_string(),
        prompt: text.to_string(),
    };

    let response = client
        .post(format!("{}/api/embeddings", ollama_host))
        .json(&request)
        .send()
        .await?;

    if !response.status().is_success() {
        return Err(crate::error::AppError::AiError {
            message: format!("Ollama API error: {}", response.status()),
        });
    }

    let embedding_response: EmbeddingResponse = response.json().await?;

    // Convert f64 to f32 for consistency
    let embeddings: Vec<f32> = embedding_response
        .embedding
        .into_iter()
        .map(|x| x as f32)
        .collect();

    Ok(embeddings)
}

/// Generates simple embeddings for text using a basic hash-based approach
/// This is a fallback when more sophisticated embedding models aren't available
pub fn generate_simple_embeddings(text: &str) -> Result<Vec<f32>> {
    let mut embeddings = vec![0.0f32; 768]; // Match nomic-embed-text dimensions
    let words: Vec<&str> = text.split_whitespace().collect();

    for (i, word) in words.iter().enumerate() {
        let hash = hash_string(word);
        for j in 0..4 {
            let idx = ((hash >> (j * 8)) as usize) % embeddings.len();
            embeddings[idx] += 1.0 / (i + 1) as f32;
        }
    }

    normalize_vector(&mut embeddings);
    Ok(embeddings)
}

/// Simple string hash function
fn hash_string(s: &str) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    s.hash(&mut hasher);
    hasher.finish()
}

/// Normalizes a vector to unit length
fn normalize_vector(vec: &mut [f32]) {
    let magnitude: f32 = vec.iter().map(|x| x * x).sum::<f32>().sqrt();

    // Use epsilon comparison to avoid division by zero and handle floating point precision
    if magnitude > f32::EPSILON {
        for v in vec.iter_mut() {
            *v /= magnitude;
        }
    } else {
        // Set to zero vector if magnitude is too small to avoid undefined behavior
        for v in vec.iter_mut() {
            *v = 0.0;
        }
    }
}
