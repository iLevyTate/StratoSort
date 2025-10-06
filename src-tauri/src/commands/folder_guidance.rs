use crate::{error::Result, state::AppState};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::sync::Arc;
use tauri::State;

/// Update Smart Folder with user-provided guidance
#[tauri::command]
pub async fn update_smart_folder_guidance(
    folder_id: String,
    description: Option<String>,
    ai_guidance: Option<String>,
    naming_convention_id: Option<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<()> {
    // Get existing folder
    let folder = state
        .database
        .get_smart_folder(&folder_id)
        .await?
        .ok_or_else(|| crate::error::AppError::InvalidInput {
            message: format!("Smart folder not found: {}", folder_id),
        })?;

    // Update fields
    let mut updated_folder = folder;
    if let Some(desc) = description {
        updated_folder.description = Some(desc);
    }

    // Update the SmartFolder fields directly (now available in struct)
    if let Some(guidance) = ai_guidance {
        updated_folder.ai_guidance = Some(guidance);
    }

    // For naming convention, we'll store just the ID reference
    // The frontend can load the full NamingConvention object when needed
    if naming_convention_id.is_some() {
        // For now, we'll store this in a separate metadata table
        // until we can properly integrate naming conventions into SmartFolder
        sqlx::query(
            "INSERT OR REPLACE INTO smart_folder_metadata (folder_id, naming_convention_id, updated_at) VALUES (?, ?, ?)"
        )
        .bind(&folder_id)
        .bind(naming_convention_id)
        .bind(chrono::Utc::now().timestamp())
        .execute(state.database.pool())
        .await?;
    }

    // Update the smart folder
    state.database.save_smart_folder(&updated_folder).await?;

    Ok(())
}

/// Get Smart Folder guidance and naming preferences
#[tauri::command]
pub async fn get_smart_folder_guidance(
    folder_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<SmartFolderGuidance> {
    // Get basic folder info
    let folder = state
        .database
        .get_smart_folder(&folder_id)
        .await?
        .ok_or_else(|| crate::error::AppError::InvalidInput {
            message: format!("Smart folder not found: {}", folder_id),
        })?;

    // Get additional metadata
    let row = sqlx::query(
        "SELECT ai_guidance, naming_convention_id FROM smart_folder_metadata WHERE folder_id = ?",
    )
    .bind(&folder_id)
    .fetch_optional(state.database.pool())
    .await?;

    let (_ai_guidance, naming_convention_id) = if let Some(row) = row {
        (
            row.try_get::<Option<String>, _>("ai_guidance")
                .ok()
                .flatten(),
            row.try_get::<Option<String>, _>("naming_convention_id")
                .ok()
                .flatten(),
        )
    } else {
        (None, None)
    };

    Ok(SmartFolderGuidance {
        folder_id: folder.id.clone(),
        folder_name: folder.name.clone(),
        description: folder.description.clone(),
        ai_guidance: folder.ai_guidance.clone(),
        naming_convention_id,
        examples: generate_examples(&folder, folder.ai_guidance.as_deref()),
    })
}

/// Analyze folder and suggest guidance based on existing files
#[tauri::command]
pub async fn suggest_folder_guidance(
    folder_path: String,
    state: State<'_, Arc<AppState>>,
) -> Result<FolderGuidanceSuggestion> {
    let ollama_client =
        state
            .ai_service
            .get_ollama_client()
            .ok_or_else(|| crate::error::AppError::AiError {
                message: "AI service not available".to_string(),
            })?;

    // Profile the folder
    let profiler = crate::ai::FolderProfiler::new(ollama_client.clone());
    let profile = profiler.profile_folder(&folder_path, 15).await?;

    // Generate suggestion using AI
    let prompt = format!(
        r#"Based on this folder analysis, suggest helpful guidance for an AI file organizer.

Folder: {}
Purpose: {}
Themes: {}
File Types: {}

Generate a concise description that would help an AI understand:
1. What types of files belong in this folder
2. How files should be named
3. Any specific organizational preferences

Respond with a single paragraph (2-3 sentences) that captures the essence."#,
        folder_path,
        profile.purpose,
        profile.themes.join(", "),
        profile.file_types.join(", ")
    );

    let suggested_guidance = ollama_client.generate_text_completion(&prompt).await?;

    Ok(FolderGuidanceSuggestion {
        folder_path,
        profile: profile.clone(),
        suggested_description: format!(
            "{} This folder contains {} files organized by {}.",
            profile.purpose,
            profile.file_types.join(", "),
            profile
                .themes
                .first()
                .unwrap_or(&"general category".to_string())
        ),
        suggested_ai_guidance: suggested_guidance,
        suggested_naming_pattern: profile.naming_pattern.clone(),
    })
}

/// Batch update multiple folders with AI-suggested guidance
#[tauri::command]
pub async fn batch_suggest_folder_guidance(
    folder_ids: Vec<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<FolderGuidanceSuggestion>> {
    let mut suggestions = Vec::new();

    for folder_id in folder_ids {
        // Get folder path
        if let Ok(Some(folder)) = state.database.get_smart_folder(&folder_id).await {
            if let Ok(suggestion) = suggest_folder_guidance(folder.target_path, state.clone()).await
            {
                suggestions.push(suggestion);
            }
        }
    }

    Ok(suggestions)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SmartFolderGuidance {
    pub folder_id: String,
    pub folder_name: String,
    pub description: Option<String>,
    pub ai_guidance: Option<String>,
    pub naming_convention_id: Option<String>,
    pub examples: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FolderGuidanceSuggestion {
    pub folder_path: String,
    pub profile: crate::ai::FolderProfile,
    pub suggested_description: String,
    pub suggested_ai_guidance: String,
    pub suggested_naming_pattern: String,
}

fn generate_examples(
    folder: &crate::commands::organization::SmartFolder,
    ai_guidance: Option<&str>,
) -> Vec<String> {
    let mut examples = Vec::new();

    // Generate example based on folder name and description
    let base_name = folder.name.to_lowercase().replace(' ', "_");
    examples.push(format!("{}_example_file.pdf", base_name));

    if let Some(guidance) = ai_guidance {
        // Parse guidance for examples
        if guidance.contains("invoice") {
            examples.push("invoice_2024-03-15_acme_corp.pdf".to_string());
        }
        if guidance.contains("receipt") {
            examples.push("receipt_2024-03-15_office_supplies.pdf".to_string());
        }
        if guidance.contains("report") {
            examples.push("monthly_report_2024-03.docx".to_string());
        }
    }

    examples
}
