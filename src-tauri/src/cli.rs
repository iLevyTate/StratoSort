/// CLI entry point for headless automation
/// This allows running file analysis and organization without the GUI
use crate::{ai::AiService, config::Config, storage::Database};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tracing::{error, info};

#[derive(Debug)]
pub enum CliCommand {
    Analyze {
        path: PathBuf,
        recursive: bool,
    },
    Organize {
        directory: PathBuf,
        auto_execute: bool,
    },
    BatchAnalyze {
        paths: Vec<PathBuf>,
    },
    EmbedDirectory {
        directory: PathBuf,
    },
    SemanticSearch {
        query: String,
        limit: usize,
    },
    AutomateDirectory {
        directory: PathBuf,
        continuous: bool,
    },
}

pub struct CliApp {
    state: Arc<CliState>,
}

impl CliApp {
    /// Initialize CLI application with minimal setup
    pub async fn new() -> Result<Self, Box<dyn std::error::Error>> {
        // Initialize logging for CLI
        tracing_subscriber::fmt()
            .with_env_filter(
                tracing_subscriber::EnvFilter::try_from_default_env()
                    .unwrap_or_else(|_| "stratosort=info".into()),
            )
            .init();

        // Load environment variables
        dotenv::dotenv().ok();

        // Initialize sqlite-vec extension
        if let Err(e) = crate::storage::initialize_sqlite_vec() {
            eprintln!("Warning: sqlite-vec initialization failed: {}", e);
        }

        // Create a minimal AppHandle substitute for CLI mode
        // We'll use a temporary directory for database in CLI mode
        let temp_dir = std::env::temp_dir().join("stratosort_cli");
        std::fs::create_dir_all(&temp_dir)?;

        let db_path = temp_dir.join("stratosort_cli.db");

        // Load configuration first
        let config = Config::default(); // Use defaults for CLI

        let database = Database::new_from_url(&format!("sqlite://{}", db_path.display())).await?;

        // Quick configuration validation
        crate::utils::validation::validate_config_quick(&config)?;

        // Initialize AI service
        let ai_service = AiService::new(&config).await?;

        // Create minimal app state for CLI
        let state = Arc::new(CliState::new(database, ai_service, config).await?);

        // Full validation after initialization
        let config_clone = state.config.read().clone();
        match crate::utils::validation::validate_configuration(
            &config_clone,
            &state.db,
            &state.ai_service,
        )
        .await
        {
            Ok(validation_result) => {
                if !validation_result.is_valid {
                    eprintln!("⚠️  Configuration validation found issues:");
                    for error in &validation_result.errors {
                        eprintln!("  ❌ {}", error);
                    }
                    for warning in &validation_result.warnings {
                        eprintln!("  ⚠️  {}", warning);
                    }

                    if !validation_result.errors.is_empty() {
                        return Err("Configuration validation failed".into());
                    }
                }
            }
            Err(e) => {
                eprintln!("Warning: Could not complete validation: {}", e);
            }
        }

        Ok(Self { state })
    }

    /// Execute a CLI command
    pub async fn execute(&self, command: CliCommand) -> Result<(), Box<dyn std::error::Error>> {
        match command {
            CliCommand::Analyze { path, recursive } => {
                info!("Analyzing path: {}", path.display());

                if path.is_file() {
                    let analysis = self.analyze_file(&path).await?;
                    println!("{}", serde_json::to_string_pretty(&analysis)?);
                } else if path.is_dir() {
                    let files = if recursive {
                        self.scan_directory_recursive(&path).await?
                    } else {
                        self.scan_directory(&path).await?
                    };

                    for file in files {
                        match self.analyze_file(&file).await {
                            Ok(analysis) => {
                                println!("{}: {}", file.display(), analysis.category);
                            }
                            Err(e) => {
                                error!("Failed to analyze {}: {}", file.display(), e);
                            }
                        }
                    }
                }
            }

            CliCommand::Organize {
                directory,
                auto_execute,
            } => {
                info!("Organizing directory: {}", directory.display());

                let suggestions = self.suggest_organization(&directory).await?;

                if auto_execute {
                    self.execute_organization(&suggestions).await?;
                    println!("✓ Organized {} files", suggestions.len());
                } else {
                    for suggestion in &suggestions {
                        println!(
                            "{} → {} (confidence: {:.2})",
                            suggestion.source_path, suggestion.target_folder, suggestion.confidence
                        );
                    }
                    println!("\nRun with --auto-execute to apply these changes");
                }
            }

            CliCommand::BatchAnalyze { paths } => {
                info!("Batch analyzing {} files", paths.len());

                for path in paths {
                    match self.analyze_file(&path).await {
                        Ok(analysis) => {
                            println!("{}", serde_json::to_string_pretty(&analysis)?);
                        }
                        Err(e) => {
                            error!("Failed to analyze {}: {}", path.display(), e);
                        }
                    }
                }
            }

            CliCommand::EmbedDirectory { directory } => {
                info!(
                    "Generating embeddings for directory: {}",
                    directory.display()
                );

                let files = self.scan_directory_recursive(&directory).await?;
                let mut embedded_count = 0;

                for file in files {
                    if let Ok(analysis) = self.analyze_file(&file).await {
                        let text = format!("{} {}", analysis.category, analysis.tags.join(" "));

                        match self.state.ai_service.generate_embeddings(&text).await {
                            Ok(embedding) => {
                                self.state
                                    .db
                                    .save_embedding(
                                        &file.to_string_lossy(),
                                        &embedding,
                                        Some("nomic-embed-text"),
                                    )
                                    .await?;
                                embedded_count += 1;
                            }
                            Err(e) => {
                                error!("Failed to embed {}: {}", file.display(), e);
                            }
                        }
                    }
                }

                println!("✓ Generated embeddings for {} files", embedded_count);
            }

            CliCommand::SemanticSearch { query, limit } => {
                info!("Semantic search for: {}", query);

                let embedding = self.state.ai_service.generate_embeddings(&query).await?;
                let results = self.state.db.semantic_search(&embedding, limit).await?;

                for (path, similarity) in results {
                    println!("{} (similarity: {:.4})", path, similarity);
                }
            }

            CliCommand::AutomateDirectory {
                directory,
                continuous,
            } => {
                info!("Starting automated processing for: {}", directory.display());

                if continuous {
                    self.run_continuous_automation(&directory).await?;
                } else {
                    self.run_single_automation(&directory).await?;
                }
            }
        }

        Ok(())
    }

    // Helper methods
    async fn analyze_file(
        &self,
        path: &PathBuf,
    ) -> Result<crate::ai::FileAnalysis, Box<dyn std::error::Error>> {
        let content = tokio::fs::read_to_string(path).await.unwrap_or_default();
        let file_type = mime_guess::from_path(path)
            .first_or_octet_stream()
            .to_string();

        let analysis = self
            .state
            .ai_service
            .analyze_file_with_path(&content, &file_type, &path.to_string_lossy())
            .await?;

        // Save to database
        self.state.db.save_analysis(&analysis).await?;

        Ok(analysis)
    }

    async fn scan_directory(
        &self,
        path: &PathBuf,
    ) -> Result<Vec<PathBuf>, Box<dyn std::error::Error>> {
        let mut files = Vec::new();

        let mut dir = tokio::fs::read_dir(path).await?;
        while let Some(entry) = dir.next_entry().await? {
            if entry.file_type().await?.is_file() {
                files.push(entry.path());
            }
        }

        Ok(files)
    }

    async fn scan_directory_recursive(
        &self,
        path: &Path,
    ) -> Result<Vec<PathBuf>, Box<dyn std::error::Error>> {
        let mut files = Vec::new();

        let mut stack = vec![path.to_path_buf()];

        while let Some(current) = stack.pop() {
            let mut dir = tokio::fs::read_dir(&current).await?;

            while let Some(entry) = dir.next_entry().await? {
                let path = entry.path();

                if entry.file_type().await?.is_dir() {
                    stack.push(path);
                } else {
                    files.push(path);
                }
            }
        }

        Ok(files)
    }

    async fn suggest_organization(
        &self,
        _directory: &Path,
    ) -> Result<Vec<crate::ai::OrganizationSuggestion>, Box<dyn std::error::Error>> {
        // Implementation would use the actual organization logic
        Ok(Vec::new())
    }

    async fn execute_organization(
        &self,
        _suggestions: &[crate::ai::OrganizationSuggestion],
    ) -> Result<(), Box<dyn std::error::Error>> {
        // Implementation would execute the file moves
        Ok(())
    }

    async fn run_single_automation(
        &self,
        directory: &Path,
    ) -> Result<(), Box<dyn std::error::Error>> {
        info!("Running single automation pass on: {}", directory.display());

        // 1. Scan directory
        let files = self.scan_directory_recursive(directory).await?;
        info!("Found {} files", files.len());

        // 2. Analyze all files
        for file in &files {
            if let Err(e) = self.analyze_file(file).await {
                error!("Analysis failed for {}: {}", file.display(), e);
            }
        }

        // 3. Generate embeddings
        for file in &files {
            if let Ok(Some(analysis)) = self.state.db.get_analysis(&file.to_string_lossy()).await {
                let text = format!("{} {}", analysis.category, analysis.tags.join(" "));

                if let Ok(embedding) = self.state.ai_service.generate_embeddings(&text).await {
                    let _ = self
                        .state
                        .db
                        .save_embedding(
                            &file.to_string_lossy(),
                            &embedding,
                            Some("nomic-embed-text"),
                        )
                        .await;
                }
            }
        }

        // 4. Organize files
        let suggestions = self.suggest_organization(directory).await?;
        self.execute_organization(&suggestions).await?;

        println!("✓ Automation complete: {} files processed", files.len());

        Ok(())
    }

    async fn run_continuous_automation(
        &self,
        directory: &Path,
    ) -> Result<(), Box<dyn std::error::Error>> {
        info!(
            "Starting continuous automation for: {}",
            directory.display()
        );

        loop {
            if let Err(e) = self.run_single_automation(directory).await {
                error!("Automation error: {}", e);
            }

            // Wait before next iteration
            tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;
        }
    }
}

/// CLI-specific state structure (without Tauri AppHandle)
pub struct CliState {
    pub db: Database,
    pub ai_service: AiService,
    pub config: Arc<parking_lot::RwLock<Config>>,
}

impl CliState {
    pub async fn new(
        database: Database,
        ai_service: AiService,
        config: Config,
    ) -> Result<Self, Box<dyn std::error::Error>> {
        use parking_lot::RwLock;

        Ok(Self {
            db: database,
            ai_service,
            config: Arc::new(RwLock::new(config)),
        })
    }
}
