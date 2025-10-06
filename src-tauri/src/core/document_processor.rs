use crate::error::{AppError, Result};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DocumentMetadata {
    pub title: Option<String>,
    pub author: Option<String>,
    pub subject: Option<String>,
    pub creator: Option<String>,
    pub creation_date: Option<String>,
    pub modified_date: Option<String>,
    pub page_count: Option<u32>,
    pub word_count: Option<u32>,
    pub language: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessedDocument {
    pub text_content: String,
    pub metadata: DocumentMetadata,
    pub file_type: String,
    pub processing_error: Option<String>,
}

#[async_trait]
pub trait DocumentProcessor {
    async fn process(&self, file_path: &Path) -> Result<ProcessedDocument>;
    fn supported_extensions(&self) -> Vec<&'static str>;
}

pub struct PdfProcessor;

#[async_trait]
impl DocumentProcessor for PdfProcessor {
    async fn process(&self, file_path: &Path) -> Result<ProcessedDocument> {
        // Try pdf-extract first (simpler)
        match self.extract_with_pdf_extract(file_path).await {
            Ok(doc) => Ok(doc),
            Err(_) => {
                // Fallback to lopdf for more advanced PDF handling
                self.extract_with_lopdf(file_path).await
            }
        }
    }

    fn supported_extensions(&self) -> Vec<&'static str> {
        vec!["pdf"]
    }
}

impl PdfProcessor {
    async fn extract_with_pdf_extract(&self, _file_path: &Path) -> Result<ProcessedDocument> {
        #[cfg(feature = "pdf-extract")]
        {
            let file_bytes: Vec<u8> = tokio::fs::read(_file_path).await?;
            let text = pdf_extract::extract_text_from_mem(&file_bytes).map_err(|e| {
                AppError::ProcessingError {
                    message: format!("PDF extraction failed: {}", e),
                }
            })?;

            let word_count = count_words(&text);

            Ok(ProcessedDocument {
                text_content: text,
                metadata: DocumentMetadata {
                    title: None,
                    author: None,
                    subject: None,
                    creator: None,
                    creation_date: None,
                    modified_date: None,
                    page_count: None,
                    word_count: Some(word_count),
                    language: None,
                },
                file_type: "PDF".to_string(),
                processing_error: None,
            })
        }
        #[cfg(not(feature = "pdf-extract"))]
        {
            Err(AppError::ProcessingError {
                message: "PDF processing not enabled. Enable 'pdf-extract' feature".to_string(),
            })
        }
    }

    async fn extract_with_lopdf(&self, _file_path: &Path) -> Result<ProcessedDocument> {
        #[cfg(feature = "lopdf")]
        {
            use lopdf::Document;

            let doc = Document::load(file_path).map_err(|e| AppError::ProcessingError {
                message: format!("Failed to load PDF: {}", e),
            })?;

            let mut text_content = String::new();
            let page_count = doc.get_pages().len() as u32;

            // Extract text from all pages
            for (page_num, _) in doc.get_pages() {
                if let Ok(page_text) = doc.extract_text(&[page_num]) {
                    text_content.push_str(&page_text);
                    text_content.push('\n');
                }
            }

            // Extract metadata
            let mut metadata = DocumentMetadata {
                title: None,
                author: None,
                subject: None,
                creator: None,
                creation_date: None,
                modified_date: None,
                page_count: Some(page_count),
                word_count: Some(count_words(&text_content)),
                language: None,
            };

            // Try to extract document info
            if let Ok(info_dict) = doc.trailer.get(b"Info") {
                if let Ok(info_dict) = info_dict.as_dict() {
                    if let Ok(title) = info_dict.get(b"Title").and_then(|t| t.as_str()) {
                        metadata.title = Some(title.to_string());
                    }
                    if let Ok(author) = info_dict.get(b"Author").and_then(|a| a.as_str()) {
                        metadata.author = Some(author.to_string());
                    }
                    if let Ok(subject) = info_dict.get(b"Subject").and_then(|s| s.as_str()) {
                        metadata.subject = Some(subject.to_string());
                    }
                    if let Ok(creator) = info_dict.get(b"Creator").and_then(|c| c.as_str()) {
                        metadata.creator = Some(creator.to_string());
                    }
                }
            }

            Ok(ProcessedDocument {
                text_content,
                metadata,
                file_type: "PDF".to_string(),
                processing_error: None,
            })
        }
        #[cfg(not(feature = "lopdf"))]
        {
            Err(AppError::ProcessingError {
                message: "Advanced PDF processing not enabled. Enable 'lopdf' feature".to_string(),
            })
        }
    }
}

pub struct DocxProcessor;

#[async_trait]
impl DocumentProcessor for DocxProcessor {
    async fn process(&self, file_path: &Path) -> Result<ProcessedDocument> {
        #[cfg(feature = "docx-rs")]
        {
            use docx_rs::*;

            let file_bytes = tokio::fs::read(file_path).await?;

            match read_docx(&file_bytes) {
                Ok(docx) => {
                    let mut text_content = String::new();

                    // Extract text content from document
                    for child in &docx.document.children {
                        match child {
                            DocumentChild::Paragraph(p) => {
                                for run_child in &p.children {
                                    if let ParagraphChild::Run(run) = run_child {
                                        for run_child in &run.children {
                                            if let RunChild::Text(text) = run_child {
                                                text_content.push_str(&text.text);
                                            }
                                        }
                                    }
                                }
                                text_content.push('\n');
                            }
                            _ => {}
                        }
                    }

                    // Extract metadata from core properties
                    // Note: docx-rs v0.4+ uses method accessors instead of direct field access
                    let metadata = DocumentMetadata {
                        title: None, // docx-rs v0.4 doesn't expose title directly
                        author: None,
                        subject: None,
                        creator: None,
                        creation_date: None,
                        modified_date: None,
                        page_count: None,
                        word_count: Some(count_words(&text_content)),
                        language: None,
                    };

                    Ok(ProcessedDocument {
                        text_content,
                        metadata,
                        file_type: "DOCX".to_string(),
                        processing_error: None,
                    })
                }
                Err(e) => Ok(ProcessedDocument {
                    text_content: String::new(),
                    metadata: DocumentMetadata::default(),
                    file_type: "DOCX".to_string(),
                    processing_error: Some(format!("DOCX parsing failed: {}", e)),
                }),
            }
        }
        #[cfg(not(feature = "docx-rs"))]
        {
            let _ = file_path;
            Err(AppError::ProcessingError {
                message: "DOCX processing not enabled. Enable 'docx-rs' feature".to_string(),
            })
        }
    }

    fn supported_extensions(&self) -> Vec<&'static str> {
        vec!["docx"]
    }
}

pub struct ExcelProcessor;

#[async_trait]
impl DocumentProcessor for ExcelProcessor {
    async fn process(&self, file_path: &Path) -> Result<ProcessedDocument> {
        #[cfg(feature = "calamine")]
        {
            use calamine::{open_workbook, Reader, Xlsx};

            let mut workbook: Xlsx<_> =
                open_workbook(file_path).map_err(|e| AppError::ProcessingError {
                    message: format!("Failed to open Excel file: {}", e),
                })?;

            let mut text_content = String::new();
            let mut _total_rows = 0;

            // Get all worksheet names
            let sheet_names = workbook.sheet_names();
            let _sheet_count = sheet_names.len();

            for sheet_name in &sheet_names {
                if let Ok(range) = workbook.worksheet_range(&sheet_name) {
                    text_content.push_str(&format!("=== Sheet: {} ===\n", sheet_name));

                    let (height, _width) = range.get_size();
                    _total_rows += height;

                    // Extract cell values as text
                    // calamine v0.26+ uses DataType as a trait, need to handle differently
                    for row in range.rows() {
                        let row_text: Vec<String> = row
                            .iter()
                            .map(|cell| {
                                // Convert cell to string using Display trait
                                format!("{}", cell)
                            })
                            .collect();

                        text_content.push_str(&row_text.join("\t"));
                        text_content.push('\n');
                    }
                    text_content.push('\n');
                }
            }

            let word_count = count_words(&text_content);
            let _sheet_count = sheet_names.len();

            Ok(ProcessedDocument {
                text_content,
                metadata: DocumentMetadata {
                    title: file_path
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .map(|s| s.to_string()),
                    author: None,
                    subject: None,
                    creator: None,
                    creation_date: None,
                    modified_date: None,
                    page_count: Some(_sheet_count as u32),
                    word_count: Some(word_count),
                    language: None,
                },
                file_type: "Excel".to_string(),
                processing_error: None,
            })
        }
        #[cfg(not(feature = "calamine"))]
        {
            let _ = file_path;
            Err(AppError::ProcessingError {
                message: "Excel processing not enabled. Enable 'calamine' feature".to_string(),
            })
        }
    }

    fn supported_extensions(&self) -> Vec<&'static str> {
        vec!["xlsx", "xls", "ods"]
    }
}

pub struct CsvProcessor;

#[async_trait]
impl DocumentProcessor for CsvProcessor {
    async fn process(&self, file_path: &Path) -> Result<ProcessedDocument> {
        #[cfg(feature = "csv")]
        {
            use csv::Reader;

            let file_content = tokio::fs::read_to_string(file_path).await?;
            let mut reader = Reader::from_reader(file_content.as_bytes());

            let mut text_content = String::new();
            let mut row_count = 0;
            let mut headers = Vec::new();

            // Get headers
            if let Ok(header_record) = reader.headers() {
                headers = header_record.iter().map(|h| h.to_string()).collect();
                text_content.push_str(&headers.join("\t"));
                text_content.push('\n');
            }

            // Process records
            for result in reader.records() {
                match result {
                    Ok(record) => {
                        let row: Vec<String> =
                            record.iter().map(|field| field.to_string()).collect();
                        text_content.push_str(&row.join("\t"));
                        text_content.push('\n');
                        row_count += 1;
                    }
                    Err(e) => {
                        text_content.push_str(&format!("ERROR parsing row: {}\n", e));
                    }
                }
            }

            Ok(ProcessedDocument {
                text_content,
                metadata: DocumentMetadata {
                    title: file_path
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .map(|s| s.to_string()),
                    author: None,
                    subject: None,
                    creator: None,
                    creation_date: None,
                    modified_date: None,
                    page_count: Some(1),
                    word_count: Some(row_count),
                    language: None,
                },
                file_type: "CSV".to_string(),
                processing_error: None,
            })
        }
        #[cfg(not(feature = "csv"))]
        {
            let _ = file_path;
            Err(AppError::ProcessingError {
                message: "CSV processing not enabled. Enable 'csv' feature".to_string(),
            })
        }
    }

    fn supported_extensions(&self) -> Vec<&'static str> {
        vec!["csv"]
    }
}

pub struct MarkdownProcessor;

#[async_trait]
impl DocumentProcessor for MarkdownProcessor {
    async fn process(&self, file_path: &Path) -> Result<ProcessedDocument> {
        let raw_content = tokio::fs::read_to_string(file_path).await?;

        #[cfg(feature = "pulldown-cmark")]
        {
            use pulldown_cmark::{html, Parser};

            let parser = Parser::new(&raw_content);
            let mut html_content = String::new();
            html::push_html(&mut html_content, parser);

            // For now, keep both raw markdown and HTML
            let text_content = format!("{}\n\n--- HTML ---\n{}", raw_content, html_content);

            // Extract title from first h1
            let title = extract_first_heading(&raw_content);

            Ok(ProcessedDocument {
                text_content,
                metadata: DocumentMetadata {
                    title,
                    author: None,
                    subject: None,
                    creator: None,
                    creation_date: None,
                    modified_date: None,
                    page_count: Some(1),
                    word_count: Some(count_words(&raw_content)),
                    language: None,
                },
                file_type: "Markdown".to_string(),
                processing_error: None,
            })
        }
        #[cfg(not(feature = "pulldown-cmark"))]
        {
            // Fallback: just use raw markdown
            let title = extract_first_heading(&raw_content);

            Ok(ProcessedDocument {
                text_content: raw_content.clone(),
                metadata: DocumentMetadata {
                    title,
                    author: None,
                    subject: None,
                    creator: None,
                    creation_date: None,
                    modified_date: None,
                    page_count: Some(1),
                    word_count: Some(count_words(&raw_content)),
                    language: None,
                },
                file_type: "Markdown".to_string(),
                processing_error: None,
            })
        }
    }

    fn supported_extensions(&self) -> Vec<&'static str> {
        vec!["md", "markdown", "mdown", "mkd", "mkdown"]
    }
}

pub struct TextProcessor;

#[async_trait]
impl DocumentProcessor for TextProcessor {
    async fn process(&self, file_path: &Path) -> Result<ProcessedDocument> {
        let text_content =
            tokio::fs::read_to_string(file_path)
                .await
                .map_err(|e| AppError::ProcessingError {
                    message: format!("Failed to read text file: {}", e),
                })?;

        Ok(ProcessedDocument {
            text_content: text_content.clone(),
            metadata: DocumentMetadata {
                title: file_path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .map(|s| s.to_string()),
                author: None,
                subject: None,
                creator: None,
                creation_date: None,
                modified_date: None,
                page_count: Some(1),
                word_count: Some(count_words(&text_content)),
                language: None,
            },
            file_type: "Text".to_string(),
            processing_error: None,
        })
    }

    fn supported_extensions(&self) -> Vec<&'static str> {
        vec![
            "txt",
            "text",
            "log",
            "cfg",
            "conf",
            "ini",
            "properties",
            "json",
            "xml",
            "yaml",
            "yml",
            "toml",
        ]
    }
}

// Document processor manager
pub struct DocumentProcessorManager {
    processors: Vec<Box<dyn DocumentProcessor + Send + Sync>>,
}

impl Default for DocumentProcessorManager {
    fn default() -> Self {
        Self::new()
    }
}

impl DocumentProcessorManager {
    pub fn new() -> Self {
        let processors: Vec<Box<dyn DocumentProcessor + Send + Sync>> = vec![
            Box::new(PdfProcessor),
            Box::new(DocxProcessor),
            Box::new(ExcelProcessor),
            Box::new(CsvProcessor),
            Box::new(MarkdownProcessor),
            Box::new(TextProcessor), // Should be last as it's the most generic
        ];

        Self { processors }
    }

    pub async fn process_document(&self, file_path: &Path) -> Result<ProcessedDocument> {
        let extension = file_path
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("")
            .to_lowercase();

        // Find appropriate processor
        for processor in &self.processors {
            if processor
                .supported_extensions()
                .contains(&extension.as_str())
            {
                return processor.process(file_path).await;
            }
        }

        Err(AppError::ProcessingError {
            message: format!("No processor found for file extension: {}", extension),
        })
    }

    pub fn is_supported(&self, file_path: &Path) -> bool {
        let extension = file_path
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("")
            .to_lowercase();

        self.processors.iter().any(|processor| {
            processor
                .supported_extensions()
                .contains(&extension.as_str())
        })
    }
}

// Helper functions
fn count_words(text: &str) -> u32 {
    text.split_whitespace().count() as u32
}

fn extract_first_heading(markdown: &str) -> Option<String> {
    for line in markdown.lines() {
        let trimmed = line.trim();
        if let Some(stripped) = trimmed.strip_prefix("# ") {
            return Some(stripped.trim().to_string());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[tokio::test]
    async fn test_text_processor() {
        let mut temp_file = NamedTempFile::new().unwrap();
        writeln!(temp_file, "Hello world\nThis is a test file.").unwrap();

        let processor = TextProcessor;
        let result = processor.process(temp_file.path()).await.unwrap();

        assert_eq!(result.file_type, "Text");
        assert!(result.text_content.contains("Hello world"));
        assert_eq!(result.metadata.word_count, Some(7));
    }

    #[tokio::test]
    async fn test_markdown_processor() {
        let mut temp_file = NamedTempFile::new().unwrap();
        writeln!(temp_file, "# Test Document\n\nThis is a **markdown** file.").unwrap();

        let processor = MarkdownProcessor;
        let result = processor.process(temp_file.path()).await.unwrap();

        assert_eq!(result.file_type, "Markdown");
        assert_eq!(result.metadata.title, Some("Test Document".to_string()));
    }

    #[test]
    fn test_document_processor_manager() {
        let manager = DocumentProcessorManager::new();

        assert!(manager.is_supported(Path::new("test.txt")));
        assert!(manager.is_supported(Path::new("test.md")));
        assert!(manager.is_supported(Path::new("test.pdf")));
        assert!(!manager.is_supported(Path::new("test.unknown")));
    }
}
