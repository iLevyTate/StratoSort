use crate::{error::Result, state::AppState};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::sync::Arc;
use tauri::State;

/// User-defined naming convention for files
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NamingConvention {
    pub id: String,
    pub name: String,
    pub pattern: String, // e.g., "{date}_{description}.{ext}"
    pub description: String,
    pub placeholders: Vec<PlaceholderInfo>,
    pub case_style: CaseStyle,
    pub separator: String,
    pub examples: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaceholderInfo {
    pub placeholder: String, // e.g., "{date}"
    pub description: String,
    pub example: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CaseStyle {
    PascalCase,
    CamelCase,
    SnakeCase,
    KebabCase,
    Lowercase,
    Uppercase,
    Original,
}

/// Predefined naming conventions for common use cases
#[tauri::command]
pub async fn get_predefined_naming_conventions() -> Result<Vec<NamingConvention>> {
    Ok(vec![
        NamingConvention {
            id: "date-first".to_string(),
            name: "Date First".to_string(),
            pattern: "{date}_{description}.{ext}".to_string(),
            description: "Date comes first, followed by description".to_string(),
            placeholders: get_standard_placeholders(),
            case_style: CaseStyle::SnakeCase,
            separator: "_".to_string(),
            examples: vec![
                "2024-03-15_invoice_acme_corp.pdf".to_string(),
                "2024-03-15_meeting_notes.docx".to_string(),
            ],
        },
        NamingConvention {
            id: "descriptive".to_string(),
            name: "Descriptive First".to_string(),
            pattern: "{description}_{date}.{ext}".to_string(),
            description: "Description first, then date".to_string(),
            placeholders: get_standard_placeholders(),
            case_style: CaseStyle::PascalCase,
            separator: "_".to_string(),
            examples: vec![
                "InvoiceAcmeCorp_2024-03-15.pdf".to_string(),
                "MeetingNotes_2024-03-15.docx".to_string(),
            ],
        },
        NamingConvention {
            id: "project-based".to_string(),
            name: "Project Based".to_string(),
            pattern: "{project}_{type}_{date}.{ext}".to_string(),
            description: "Project, then type, then date".to_string(),
            placeholders: get_standard_placeholders(),
            case_style: CaseStyle::KebabCase,
            separator: "_".to_string(),
            examples: vec![
                "acme-website_invoice_2024-03-15.pdf".to_string(),
                "stratosort_design_2024-03-15.fig".to_string(),
            ],
        },
        NamingConvention {
            id: "semantic".to_string(),
            name: "Semantic (AI Generated)".to_string(),
            pattern: "{topic}_{entity}_{date}.{ext}".to_string(),
            description: "Let AI choose the best name based on content".to_string(),
            placeholders: get_semantic_placeholders(),
            case_style: CaseStyle::SnakeCase,
            separator: "_".to_string(),
            examples: vec![
                "financial_report_acme_corp_2024-03-15.pdf".to_string(),
                "nature_documentation_wildlife_2024-02-05.md".to_string(),
            ],
        },
        NamingConvention {
            id: "keep-original".to_string(),
            name: "Keep Original".to_string(),
            pattern: "{original_name}.{ext}".to_string(),
            description: "Don't rename files, keep original names".to_string(),
            placeholders: vec![PlaceholderInfo {
                placeholder: "{original_name}".to_string(),
                description: "Original filename without extension".to_string(),
                example: "invoice".to_string(),
            }],
            case_style: CaseStyle::Original,
            separator: "".to_string(),
            examples: vec!["invoice.pdf".to_string(), "meeting-notes.docx".to_string()],
        },
    ])
}

/// Get all available placeholders for naming patterns
#[tauri::command]
pub async fn get_available_placeholders() -> Result<Vec<PlaceholderInfo>> {
    let mut placeholders = get_standard_placeholders();
    placeholders.extend(get_semantic_placeholders());
    Ok(placeholders)
}

/// Preview how files would be renamed with a specific naming convention
#[tauri::command]
pub async fn preview_naming_convention(
    file_paths: Vec<String>,
    naming_convention: NamingConvention,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<NamingPreview>> {
    let mut previews = Vec::new();

    for file_path in file_paths.iter().take(20) {
        // Preview first 20 files
        // Get semantic analysis if pattern uses semantic placeholders
        let semantic_profile = if uses_semantic_placeholders(&naming_convention.pattern) {
            // Analyze file to get semantic data
            if let Ok(content) = tokio::fs::read_to_string(file_path).await {
                let ollama_client = state.ai_service.get_ollama_client();
                if let Some(client) = ollama_client {
                    let analyzer = crate::ai::SemanticAnalyzer::new(client);
                    analyzer
                        .analyze_file_semantics(file_path, &content)
                        .await
                        .ok()
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        };

        let new_name =
            apply_naming_convention(file_path, &naming_convention, semantic_profile.as_ref());

        previews.push(NamingPreview {
            original_path: file_path.clone(),
            original_name: std::path::Path::new(file_path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string(),
            new_name: new_name.clone(),
            pattern_used: naming_convention.pattern.clone(),
        });
    }

    Ok(previews)
}

/// Save a custom naming convention
#[tauri::command]
pub async fn save_naming_convention(
    naming_convention: NamingConvention,
    state: State<'_, Arc<AppState>>,
) -> Result<()> {
    // Store in database as JSON
    let json_data = serde_json::to_string(&naming_convention)?;

    sqlx::query(
        "INSERT OR REPLACE INTO naming_conventions (id, name, pattern, data, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(&naming_convention.id)
    .bind(&naming_convention.name)
    .bind(&naming_convention.pattern)
    .bind(&json_data)
    .bind(chrono::Utc::now().timestamp())
    .execute(state.database.pool())
    .await?;

    Ok(())
}

/// Get user's saved naming conventions
#[tauri::command]
pub async fn get_user_naming_conventions(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<NamingConvention>> {
    let rows = sqlx::query("SELECT data FROM naming_conventions ORDER BY created_at DESC")
        .fetch_all(state.database.pool())
        .await?;

    let mut conventions = Vec::new();
    for row in rows {
        let json_data: String = row.get("data");
        if let Ok(convention) = serde_json::from_str::<NamingConvention>(&json_data) {
            conventions.push(convention);
        }
    }

    Ok(conventions)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NamingPreview {
    pub original_path: String,
    pub original_name: String,
    pub new_name: String,
    pub pattern_used: String,
}

// Helper functions

fn get_standard_placeholders() -> Vec<PlaceholderInfo> {
    vec![
        PlaceholderInfo {
            placeholder: "{date}".to_string(),
            description: "Current date (YYYY-MM-DD)".to_string(),
            example: "2024-03-15".to_string(),
        },
        PlaceholderInfo {
            placeholder: "{year}".to_string(),
            description: "Current year".to_string(),
            example: "2024".to_string(),
        },
        PlaceholderInfo {
            placeholder: "{month}".to_string(),
            description: "Current month (MM)".to_string(),
            example: "03".to_string(),
        },
        PlaceholderInfo {
            placeholder: "{day}".to_string(),
            description: "Current day (DD)".to_string(),
            example: "15".to_string(),
        },
        PlaceholderInfo {
            placeholder: "{time}".to_string(),
            description: "Current time (HH-MM-SS)".to_string(),
            example: "14-30-45".to_string(),
        },
        PlaceholderInfo {
            placeholder: "{original_name}".to_string(),
            description: "Original filename without extension".to_string(),
            example: "invoice".to_string(),
        },
        PlaceholderInfo {
            placeholder: "{ext}".to_string(),
            description: "File extension".to_string(),
            example: "pdf".to_string(),
        },
        PlaceholderInfo {
            placeholder: "{counter}".to_string(),
            description: "Incremental counter (001, 002, ...)".to_string(),
            example: "001".to_string(),
        },
    ]
}

fn get_semantic_placeholders() -> Vec<PlaceholderInfo> {
    vec![
        PlaceholderInfo {
            placeholder: "{topic}".to_string(),
            description: "AI-detected main topic (2-4 words)".to_string(),
            example: "financial_report".to_string(),
        },
        PlaceholderInfo {
            placeholder: "{purpose}".to_string(),
            description: "AI-detected file purpose (invoice, receipt, etc.)".to_string(),
            example: "invoice".to_string(),
        },
        PlaceholderInfo {
            placeholder: "{entity}".to_string(),
            description: "First AI-detected entity (company, person, project)".to_string(),
            example: "acme_corp".to_string(),
        },
        PlaceholderInfo {
            placeholder: "{domain}".to_string(),
            description: "AI-detected domain (business, personal, tax, etc.)".to_string(),
            example: "business".to_string(),
        },
        PlaceholderInfo {
            placeholder: "{description}".to_string(),
            description: "AI-generated descriptive name".to_string(),
            example: "quarterly_revenue_analysis".to_string(),
        },
        PlaceholderInfo {
            placeholder: "{project}".to_string(),
            description: "AI-detected project name from content".to_string(),
            example: "website_redesign".to_string(),
        },
        PlaceholderInfo {
            placeholder: "{company}".to_string(),
            description: "AI-detected company name from content".to_string(),
            example: "acme_corp".to_string(),
        },
    ]
}

fn uses_semantic_placeholders(pattern: &str) -> bool {
    pattern.contains("{topic}")
        || pattern.contains("{purpose}")
        || pattern.contains("{entity}")
        || pattern.contains("{domain}")
        || pattern.contains("{description}")
        || pattern.contains("{project}")
        || pattern.contains("{company}")
}

fn apply_naming_convention(
    file_path: &str,
    convention: &NamingConvention,
    semantic_profile: Option<&crate::ai::SemanticProfile>,
) -> String {
    let path = std::path::Path::new(file_path);
    let mut result = convention.pattern.clone();

    // Original filename
    let original_name = path
        .file_stem()
        .and_then(|n| n.to_str())
        .unwrap_or("unnamed");
    let extension = path.extension().and_then(|e| e.to_str()).unwrap_or("");

    // Standard placeholders
    let now = chrono::Local::now();
    result = result.replace("{date}", &now.format("%Y-%m-%d").to_string());
    result = result.replace("{year}", &now.format("%Y").to_string());
    result = result.replace("{month}", &now.format("%m").to_string());
    result = result.replace("{day}", &now.format("%d").to_string());
    result = result.replace("{time}", &now.format("%H-%M-%S").to_string());
    result = result.replace("{original_name}", original_name);
    result = result.replace("{ext}", extension);

    // Semantic placeholders (if available)
    if let Some(profile) = semantic_profile {
        result = result.replace("{topic}", &sanitize_for_filename(&profile.topic));
        result = result.replace(
            "{purpose}",
            &format!("{:?}", profile.purpose).to_lowercase(),
        );
        result = result.replace("{domain}", &sanitize_for_filename(&profile.domain));
        result = result.replace(
            "{description}",
            &sanitize_for_filename(&profile.suggested_name),
        );

        if !profile.entities.is_empty() {
            result = result.replace(
                "{entity}",
                &sanitize_for_filename(&profile.entities[0].name),
            );
            result = result.replace(
                "{company}",
                &sanitize_for_filename(&profile.entities[0].name),
            );
            result = result.replace(
                "{project}",
                &sanitize_for_filename(&profile.entities[0].name),
            );
        }
    }

    // Apply case style
    result = apply_case_style(&result, &convention.case_style);

    // Sanitize filename
    result = result.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");

    // Ensure extension
    if !result.ends_with(&format!(".{}", extension)) && !extension.is_empty() {
        result = format!("{}.{}", result, extension);
    }

    result
}

fn sanitize_for_filename(s: &str) -> String {
    s.chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect::<String>()
        .to_lowercase()
}

fn apply_case_style(s: &str, style: &CaseStyle) -> String {
    match style {
        CaseStyle::PascalCase => to_pascal_case(s),
        CaseStyle::CamelCase => to_camel_case(s),
        CaseStyle::SnakeCase => s.to_lowercase().replace(['-', ' '], "_"),
        CaseStyle::KebabCase => s.to_lowercase().replace(['_', ' '], "-"),
        CaseStyle::Lowercase => s.to_lowercase(),
        CaseStyle::Uppercase => s.to_uppercase(),
        CaseStyle::Original => s.to_string(),
    }
}

fn to_pascal_case(s: &str) -> String {
    s.split(['_', '-', ' '])
        .filter(|w| !w.is_empty())
        .map(|w| {
            let mut chars = w.chars();
            match chars.next() {
                None => String::new(),
                Some(first) => {
                    first.to_uppercase().collect::<String>() + &chars.as_str().to_lowercase()
                }
            }
        })
        .collect()
}

fn to_camel_case(s: &str) -> String {
    let pascal = to_pascal_case(s);
    let mut chars = pascal.chars();
    match chars.next() {
        None => String::new(),
        Some(first) => first.to_lowercase().collect::<String>() + chars.as_str(),
    }
}
