use crate::ai::{AiProvider, AiService};
use crate::config::Config;

#[tokio::test]
async fn test_fallback_file_analysis() {
    let config = create_test_config_with_provider("fallback");
    let ai_service = AiService::new(&config).await.unwrap();

    // Test various file types
    let test_cases = vec![
        (
            "This is a contract agreement between parties.",
            "application/pdf",
            "contract",
            "legal",
        ),
        (
            "Invoice #12345 for services rendered.",
            "text/plain",
            "invoice",
            "financial",
        ),
        (
            "This is a report from quarterly review.",
            "text/plain",
            "report",
            "quarterly",
        ),
        (
            "PowerPoint presentation content",
            "application/vnd.ms-powerpoint",
            "slides",
            "business",
        ),
    ];

    for (content, file_type, expected_tag, expected_tag2) in test_cases {
        let result = ai_service.analyze_file(content, file_type).await.unwrap();

        assert_eq!(result.confidence, 0.5); // Fallback confidence
        assert!(
            result.tags.iter().any(|tag| tag.contains(expected_tag))
                || result.tags.iter().any(|tag| tag.contains(expected_tag2)),
            "Missing expected tags for content: {}",
            content
        );
        assert!(!result.summary.is_empty());
    }
}

#[tokio::test]
async fn test_fallback_image_analysis() {
    let config = create_test_config_with_provider("fallback");
    let ai_service = AiService::new(&config).await.unwrap();

    // Create a temporary test file to simulate image analysis
    let temp_dir = std::env::temp_dir();
    let test_image_path = temp_dir.join("test_image.png");

    // Create a minimal PNG file for testing
    let png_data = create_minimal_png();
    std::fs::write(&test_image_path, png_data).unwrap();

    let result = ai_service
        .analyze_image(test_image_path.to_str().unwrap())
        .await
        .unwrap();

    assert_eq!(result.category, "Images");
    assert_eq!(result.confidence, 0.3); // Fallback image confidence
    assert!(result.tags.contains(&"image".to_string()));
    assert!(result.tags.contains(&"png".to_string()));
    assert!(!result.summary.is_empty());

    // Cleanup
    std::fs::remove_file(&test_image_path).ok();
}

#[tokio::test]
async fn test_fallback_organization_suggestions() {
    let config = create_test_config_with_provider("fallback");
    let ai_service = AiService::new(&config).await.unwrap();

    let test_files = vec![
        "document.pdf".to_string(),
        "photo.jpg".to_string(),
        "music.mp3".to_string(),
        "presentation.pptx".to_string(),
        "model.stl".to_string(),
    ];

    let smart_folders = vec![
        create_test_smart_folder("Documents", "Document files", "pdf"),
        create_test_smart_folder("Images", "Image files", "jpg"),
        create_test_smart_folder("Audio", "Audio files", "mp3"),
        create_test_smart_folder("Presentations", "Presentation files", "pptx"),
        create_test_smart_folder("3D Print Files", "3D model files", "stl"),
    ];

    let suggestions = ai_service
        .suggest_organization(test_files, smart_folders)
        .await
        .unwrap();

    assert_eq!(suggestions.len(), 5);

    // Check that each file was categorized correctly
    let doc_suggestion = suggestions
        .iter()
        .find(|s| s.source_path == "document.pdf")
        .unwrap();
    assert_eq!(doc_suggestion.target_folder, "Documents");
    assert!(doc_suggestion.confidence > 0.7); // Smart folder matching has higher confidence

    let image_suggestion = suggestions
        .iter()
        .find(|s| s.source_path == "photo.jpg")
        .unwrap();
    assert_eq!(image_suggestion.target_folder, "Images");

    let audio_suggestion = suggestions
        .iter()
        .find(|s| s.source_path == "music.mp3")
        .unwrap();
    assert_eq!(audio_suggestion.target_folder, "Audio");

    let ppt_suggestion = suggestions
        .iter()
        .find(|s| s.source_path == "presentation.pptx")
        .unwrap();
    assert_eq!(ppt_suggestion.target_folder, "Presentations");

    let stl_suggestion = suggestions
        .iter()
        .find(|s| s.source_path == "model.stl")
        .unwrap();
    assert_eq!(stl_suggestion.target_folder, "3D Print Files");
}

#[tokio::test]
async fn test_fallback_3d_file_detection() {
    let config = create_test_config_with_provider("fallback");
    let ai_service = AiService::new(&config).await.unwrap();

    let test_cases = vec![
        ("miniature_knight.stl", "miniature", "tabletop"),
        ("landscape_terrain.obj", "terrain", "environment"),
        ("functional_tool.stl", "functional", "tool"),
        ("prototype_part.3mf", "prototype", "replacement-part"),
        ("decorative_art.blend", "artistic", "source-file"),
    ];

    for (filename, expected_tag1, expected_tag2) in test_cases {
        let result = ai_service
            .analyze_file_with_path("3D model content", "model/stl", filename)
            .await
            .unwrap();

        assert_eq!(result.category, "3D Print Files");
        assert!(result.tags.contains(&"3d-model".to_string()));

        // Check for specific tags based on filename
        let has_expected_tag = result.tags.iter().any(|tag| tag.contains(expected_tag1))
            || result.tags.iter().any(|tag| tag.contains(expected_tag2));
        assert!(
            has_expected_tag,
            "Missing expected tags for {}: got {:?}",
            filename, result.tags
        );
    }
}

#[tokio::test]
async fn test_fallback_presentation_detection() {
    let config = create_test_config_with_provider("fallback");
    let ai_service = AiService::new(&config).await.unwrap();

    let test_cases = vec![
        ("Meeting agenda for quarterly review", "meeting"),
        ("Training course materials", "training"),
        ("Sales pitch presentation", "sales"),
        ("Annual report slides", "corporate"),
        ("Template for presentations", "template"),
    ];

    for (content, expected_tag) in test_cases {
        let result = ai_service
            .analyze_file(content, "application/vnd.ms-powerpoint")
            .await
            .unwrap();

        assert_eq!(result.category, "Presentations");
        assert!(result.tags.contains(&"slides".to_string()));
        assert!(
            result.tags.contains(&expected_tag.to_string()),
            "Missing expected tag '{}' for content: {}",
            expected_tag,
            content
        );
    }
}

#[tokio::test]
async fn test_provider_status_fallback() {
    let config = create_test_config_with_provider("fallback");
    let ai_service = AiService::new(&config).await.unwrap();

    let status = ai_service.get_status().await;

    assert!(matches!(status.provider, AiProvider::Fallback));
    assert!(status.is_available);
    assert!(!status.ollama_connected);
    assert!(status
        .capabilities
        .contains(&"basic_file_analysis".to_string()));
    assert!(status
        .capabilities
        .contains(&"simple_embeddings".to_string()));
    assert!(status
        .capabilities
        .contains(&"rule_based_organization".to_string()));
}

#[tokio::test]
async fn test_use_fallback_method() {
    let mut config = create_test_config_with_provider("ollama");
    config.ollama_host = "invalid_host".to_string(); // Force fallback

    let ai_service = AiService::new(&config).await.unwrap();

    // Should automatically fall back due to invalid host
    let status = ai_service.get_status().await;
    assert!(matches!(status.provider, AiProvider::Fallback));

    // Test explicit fallback switch
    let fallback_status = ai_service.use_fallback();
    assert!(matches!(fallback_status.provider, AiProvider::Fallback));
    assert!(fallback_status.is_available);
    assert!(fallback_status
        .models_available
        .contains(&"fallback".to_string()));
}

// Helper functions
fn create_test_config_with_provider(provider: &str) -> Config {
    Config {
        ai_provider: provider.to_string(),
        ollama_host: "localhost:11434".to_string(),
        ..Default::default()
    }
}

fn create_test_smart_folder(
    name: &str,
    description: &str,
    extension: &str,
) -> crate::commands::organization::SmartFolder {
    use chrono::Utc;

    crate::commands::organization::SmartFolder {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.to_string(),
        description: Some(description.to_string()),
        enabled: true,
        target_path: format!("/test/{}", name),
        created_at: Utc::now(),
        updated_at: Utc::now(),
        naming_convention: None,
        ai_guidance: None,
        rules: vec![crate::commands::organization::OrganizationRule {
            id: uuid::Uuid::new_v4().to_string(),
            rule_type: crate::commands::organization::RuleType::FileExtension,
            condition: crate::commands::organization::RuleCondition {
                field: "extension".to_string(),
                operator: crate::commands::organization::ConditionOperator::Equals,
                value: extension.to_string(),
                case_sensitive: Some(false),
            },
            action: crate::commands::organization::RuleAction {
                action_type: crate::commands::organization::ActionType::Move,
                target_folder: name.to_string(),
                rename_pattern: None,
            },
            priority: 1,
            enabled: true,
        }],
    }
}

fn create_minimal_png() -> Vec<u8> {
    // Minimal valid PNG file (1x1 transparent pixel)
    vec![
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
        0x00, 0x00, 0x00, 0x0D, // IHDR chunk length
        0x49, 0x48, 0x44, 0x52, // IHDR chunk type
        0x00, 0x00, 0x00, 0x01, // Width: 1
        0x00, 0x00, 0x00, 0x01, // Height: 1
        0x08, 0x06, 0x00, 0x00, 0x00, // Bit depth, color type, compression, filter, interlace
        0x1F, 0x15, 0xC4, 0x89, // IHDR CRC
        0x00, 0x00, 0x00, 0x0A, // IDAT chunk length
        0x49, 0x44, 0x41, 0x54, // IDAT chunk type
        0x78, 0x9C, 0x62, 0x00, 0x02, 0x00, 0x00, 0x05, 0x00, 0x01, // Compressed image data
        0x0D, 0x0A, 0x2D, 0xB4, // IDAT CRC
        0x00, 0x00, 0x00, 0x00, // IEND chunk length
        0x49, 0x45, 0x4E, 0x44, // IEND chunk type
        0xAE, 0x42, 0x60, 0x82, // IEND CRC
    ]
}
