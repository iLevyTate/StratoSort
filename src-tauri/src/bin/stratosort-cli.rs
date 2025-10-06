/// StratoSort CLI - Headless automation interface for LLM-driven file organization
use clap::{Parser, Subcommand};
use std::path::PathBuf;
use stratosort::cli::{CliApp, CliCommand};

#[derive(Parser)]
#[command(name = "stratosort-cli")]
#[command(about = "AI-powered file organization - headless mode", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Analyze files and extract metadata using LLM
    Analyze {
        /// Path to analyze (file or directory)
        path: PathBuf,

        /// Recursively analyze subdirectories
        #[arg(short, long)]
        recursive: bool,
    },

    /// Organize files into smart folders
    Organize {
        /// Directory to organize
        directory: PathBuf,

        /// Automatically execute moves without confirmation
        #[arg(long)]
        auto_execute: bool,
    },

    /// Batch analyze multiple files
    BatchAnalyze {
        /// List of file paths to analyze
        paths: Vec<PathBuf>,
    },

    /// Generate embeddings for all files in a directory
    EmbedDirectory {
        /// Directory to embed
        directory: PathBuf,
    },

    /// Semantic search across analyzed files
    Search {
        /// Search query
        query: String,

        /// Maximum number of results
        #[arg(short, long, default_value = "10")]
        limit: usize,
    },

    /// Run automated file processing
    Automate {
        /// Directory to monitor and process
        directory: PathBuf,

        /// Run continuously (monitor for changes)
        #[arg(short, long)]
        continuous: bool,
    },
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();

    // Initialize CLI app
    let app = match CliApp::new().await {
        Ok(app) => app,
        Err(e) => {
            eprintln!("Failed to initialize CLI app: {}", e);
            std::process::exit(1);
        }
    };

    // Convert CLI commands to internal commands
    let command = match cli.command {
        Commands::Analyze { path, recursive } => CliCommand::Analyze { path, recursive },
        Commands::Organize {
            directory,
            auto_execute,
        } => CliCommand::Organize {
            directory,
            auto_execute,
        },
        Commands::BatchAnalyze { paths } => CliCommand::BatchAnalyze { paths },
        Commands::EmbedDirectory { directory } => CliCommand::EmbedDirectory { directory },
        Commands::Search { query, limit } => CliCommand::SemanticSearch { query, limit },
        Commands::Automate {
            directory,
            continuous,
        } => CliCommand::AutomateDirectory {
            directory,
            continuous,
        },
    };

    // Execute command
    if let Err(e) = app.execute(command).await {
        eprintln!("Command failed: {}", e);
        std::process::exit(1);
    }
}
