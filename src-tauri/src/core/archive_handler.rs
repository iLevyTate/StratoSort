use crate::error::{AppError, Result};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchiveEntry {
    pub path: String,
    pub size: u64,
    pub is_directory: bool,
    pub last_modified: Option<String>,
    pub compression_ratio: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchiveInfo {
    pub entries: Vec<ArchiveEntry>,
    pub total_files: u32,
    pub total_directories: u32,
    pub uncompressed_size: u64,
    pub compressed_size: u64,
    pub format: String,
    pub processing_error: Option<String>,
}

#[async_trait]
pub trait ArchiveHandler {
    async fn list_contents(&self, archive_path: &Path) -> Result<ArchiveInfo>;
    async fn extract_to(&self, archive_path: &Path, destination: &Path) -> Result<Vec<PathBuf>>;
    fn supported_extensions(&self) -> Vec<&'static str>;
}

pub struct ZipHandler;

#[async_trait]
impl ArchiveHandler for ZipHandler {
    async fn list_contents(&self, archive_path: &Path) -> Result<ArchiveInfo> {
        #[cfg(feature = "zip")]
        {
            use std::fs::File;
            use zip::ZipArchive;

            let file = File::open(archive_path).map_err(|e| AppError::ProcessingError {
                message: format!("Failed to open ZIP file: {}", e),
            })?;

            let mut archive = ZipArchive::new(file).map_err(|e| AppError::ProcessingError {
                message: format!("Failed to read ZIP archive: {}", e),
            })?;

            let mut entries = Vec::new();
            let mut total_files = 0;
            let mut total_directories = 0;
            let mut uncompressed_size = 0;
            let compressed_size = std::fs::metadata(archive_path)?.len();

            for i in 0..archive.len() {
                match archive.by_index(i) {
                    Ok(file) => {
                        let is_directory = file.is_dir();
                        if is_directory {
                            total_directories += 1;
                        } else {
                            total_files += 1;
                        }

                        let size = file.size();
                        uncompressed_size += size;

                        let compression_ratio = if size > 0 {
                            Some(file.compressed_size() as f32 / size as f32)
                        } else {
                            None
                        };

                        entries.push(ArchiveEntry {
                            path: file.name().to_string(),
                            size,
                            is_directory,
                            last_modified: file
                                .last_modified()
                                .and_then(|dt| dt.to_time().ok())
                                .map(|time| format!("{:?}", time)),
                            compression_ratio,
                        });
                    }
                    Err(e) => {
                        return Ok(ArchiveInfo {
                            entries: vec![],
                            total_files: 0,
                            total_directories: 0,
                            uncompressed_size: 0,
                            compressed_size,
                            format: "ZIP".to_string(),
                            processing_error: Some(format!("Error reading ZIP entry {}: {}", i, e)),
                        });
                    }
                }
            }

            Ok(ArchiveInfo {
                entries,
                total_files,
                total_directories,
                uncompressed_size,
                compressed_size,
                format: "ZIP".to_string(),
                processing_error: None,
            })
        }
        #[cfg(not(feature = "zip"))]
        {
            let _ = archive_path;
            Err(AppError::ProcessingError {
                message: "ZIP processing not enabled. Enable 'zip' feature".to_string(),
            })
        }
    }

    async fn extract_to(&self, archive_path: &Path, destination: &Path) -> Result<Vec<PathBuf>> {
        #[cfg(feature = "zip")]
        {
            use std::fs::{create_dir_all, File};
            use std::io::copy;
            use zip::ZipArchive;

            let file = File::open(archive_path)?;
            let mut archive = ZipArchive::new(file)?;
            let mut extracted_files = Vec::new();

            for i in 0..archive.len() {
                let mut file = archive.by_index(i)?;
                let outpath = destination.join(file.name());

                if file.is_dir() {
                    create_dir_all(&outpath)?;
                } else {
                    if let Some(parent) = outpath.parent() {
                        create_dir_all(parent)?;
                    }
                    let mut outfile = File::create(&outpath)?;
                    copy(&mut file, &mut outfile)?;
                    extracted_files.push(outpath);
                }
            }

            Ok(extracted_files)
        }
        #[cfg(not(feature = "zip"))]
        {
            let _ = (archive_path, destination);
            Err(AppError::ProcessingError {
                message: "ZIP extraction not enabled. Enable 'zip' feature".to_string(),
            })
        }
    }

    fn supported_extensions(&self) -> Vec<&'static str> {
        vec!["zip"]
    }
}

pub struct TarHandler;

#[async_trait]
impl ArchiveHandler for TarHandler {
    async fn list_contents(&self, archive_path: &Path) -> Result<ArchiveInfo> {
        #[cfg(all(
            feature = "tar",
            feature = "flate2",
            feature = "bzip2",
            feature = "xz2"
        ))]
        {
            use std::fs::File;
            use tar::Archive;

            let extension = archive_path
                .extension()
                .and_then(|ext| ext.to_str())
                .unwrap_or("")
                .to_lowercase();

            let file = File::open(archive_path)?;
            let compressed_size = file.metadata()?.len();

            let mut archive = match extension.as_str() {
                "gz" | "tgz" => {
                    use flate2::read::GzDecoder;
                    Archive::new(GzDecoder::new(file))
                }
                "bz2" | "tbz2" => {
                    use bzip2::read::BzDecoder;
                    Archive::new(BzDecoder::new(file))
                }
                "xz" | "txz" => {
                    use xz2::read::XzDecoder;
                    Archive::new(XzDecoder::new(file))
                }
                _ => Archive::new(file), // Plain tar
            };

            let mut entries = Vec::new();
            let mut total_files = 0;
            let mut total_directories = 0;
            let mut uncompressed_size = 0;

            for entry_result in archive.entries()? {
                match entry_result {
                    Ok(entry) => {
                        let header = entry.header();
                        let path = entry.path()?.to_string_lossy().to_string();
                        let size = header.size()?;
                        let is_directory = header.entry_type().is_dir();

                        if is_directory {
                            total_directories += 1;
                        } else {
                            total_files += 1;
                        }

                        uncompressed_size += size;

                        let last_modified = header.mtime().map(|mtime| {
                            chrono::DateTime::from_timestamp(mtime as i64, 0)
                                .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
                                .unwrap_or_else(|| "Unknown".to_string())
                        });

                        entries.push(ArchiveEntry {
                            path,
                            size,
                            is_directory,
                            last_modified,
                            compression_ratio: if uncompressed_size > 0 {
                                Some(compressed_size as f32 / uncompressed_size as f32)
                            } else {
                                None
                            },
                        });
                    }
                    Err(e) => {
                        return Ok(ArchiveInfo {
                            entries: vec![],
                            total_files: 0,
                            total_directories: 0,
                            uncompressed_size: 0,
                            compressed_size,
                            format: "TAR".to_string(),
                            processing_error: Some(format!("Error reading TAR entry: {}", e)),
                        });
                    }
                }
            }

            Ok(ArchiveInfo {
                entries,
                total_files,
                total_directories,
                uncompressed_size,
                compressed_size,
                format: "TAR".to_string(),
                processing_error: None,
            })
        }
        #[cfg(not(all(
            feature = "tar",
            feature = "flate2",
            feature = "bzip2",
            feature = "xz2"
        )))]
        {
            let _ = archive_path;
            Err(AppError::ProcessingError {
                message: "TAR processing not enabled. Enable 'tar', 'flate2', 'bzip2', and 'xz2' features".to_string()
            })
        }
    }

    async fn extract_to(&self, archive_path: &Path, destination: &Path) -> Result<Vec<PathBuf>> {
        #[cfg(all(
            feature = "tar",
            feature = "flate2",
            feature = "bzip2",
            feature = "xz2"
        ))]
        {
            use std::fs::File;
            use tar::Archive;

            let extension = archive_path
                .extension()
                .and_then(|ext| ext.to_str())
                .unwrap_or("")
                .to_lowercase();

            let file = File::open(archive_path)?;

            let mut archive = match extension.as_str() {
                "gz" | "tgz" => {
                    use flate2::read::GzDecoder;
                    Archive::new(GzDecoder::new(file))
                }
                "bz2" | "tbz2" => {
                    use bzip2::read::BzDecoder;
                    Archive::new(BzDecoder::new(file))
                }
                "xz" | "txz" => {
                    use xz2::read::XzDecoder;
                    Archive::new(XzDecoder::new(file))
                }
                _ => Archive::new(file),
            };

            archive.unpack(destination)?;

            // Return list of extracted files
            let mut extracted_files = Vec::new();
            for entry_result in std::fs::read_dir(destination)? {
                if let Ok(entry) = entry_result {
                    extracted_files.push(entry.path());
                }
            }

            Ok(extracted_files)
        }
        #[cfg(not(all(
            feature = "tar",
            feature = "flate2",
            feature = "bzip2",
            feature = "xz2"
        )))]
        {
            let _ = (archive_path, destination);
            Err(AppError::ProcessingError {
                message: "TAR extraction not enabled. Enable required features".to_string(),
            })
        }
    }

    fn supported_extensions(&self) -> Vec<&'static str> {
        vec!["tar", "tar.gz", "tgz", "tar.bz2", "tbz2", "tar.xz", "txz"]
    }
}

pub struct SevenZipHandler;

#[async_trait]
impl ArchiveHandler for SevenZipHandler {
    async fn list_contents(&self, archive_path: &Path) -> Result<ArchiveInfo> {
        #[cfg(feature = "sevenz-rust")]
        {
            use sevenz_rust::SevenZReader;
            use std::fs::File;

            let file = File::open(archive_path)?;
            let compressed_size = file.metadata()?.len();

            let mut reader = SevenZReader::new(file).map_err(|e| AppError::ProcessingError {
                message: format!("Failed to read 7Z archive: {}", e),
            })?;

            let mut entries = Vec::new();
            let mut total_files = 0;
            let mut total_directories = 0;
            let mut uncompressed_size = 0;

            for entry in reader.archive().files {
                let size = entry.size();
                let is_directory = entry.is_directory();
                let path = entry.name().to_string();

                if is_directory {
                    total_directories += 1;
                } else {
                    total_files += 1;
                }

                uncompressed_size += size;

                // 7Z stores timestamps differently
                let last_modified = entry
                    .creation_time()
                    .or_else(|| entry.last_write_time())
                    .map(|time| format!("{:?}", time));

                entries.push(ArchiveEntry {
                    path,
                    size,
                    is_directory,
                    last_modified,
                    compression_ratio: if size > 0 {
                        Some(compressed_size as f32 / uncompressed_size as f32)
                    } else {
                        None
                    },
                });
            }

            Ok(ArchiveInfo {
                entries,
                total_files,
                total_directories,
                uncompressed_size,
                compressed_size,
                format: "7Z".to_string(),
                processing_error: None,
            })
        }
        #[cfg(not(feature = "sevenz-rust"))]
        {
            let _ = archive_path;
            Err(AppError::ProcessingError {
                message: "7Z processing not enabled. Enable 'sevenz-rust' feature".to_string(),
            })
        }
    }

    async fn extract_to(&self, archive_path: &Path, destination: &Path) -> Result<Vec<PathBuf>> {
        #[cfg(feature = "sevenz-rust")]
        {
            use sevenz_rust::SevenZReader;
            use std::fs::{create_dir_all, File};
            use std::io::Write;

            let file = File::open(archive_path)?;
            let mut reader = SevenZReader::new(file)?;
            let mut extracted_files = Vec::new();

            reader.for_each_entries(|entry, reader| {
                let output_path = destination.join(entry.name());

                if entry.is_directory() {
                    create_dir_all(&output_path)?;
                } else {
                    if let Some(parent) = output_path.parent() {
                        create_dir_all(parent)?;
                    }

                    let mut output_file = File::create(&output_path)?;
                    let mut buffer = vec![0u8; entry.size() as usize];
                    reader.read_exact(&mut buffer)?;
                    output_file.write_all(&buffer)?;

                    extracted_files.push(output_path);
                }
                Ok(true)
            })?;

            Ok(extracted_files)
        }
        #[cfg(not(feature = "sevenz-rust"))]
        {
            let _ = (archive_path, destination);
            Err(AppError::ProcessingError {
                message: "7Z extraction not enabled. Enable 'sevenz-rust' feature".to_string(),
            })
        }
    }

    fn supported_extensions(&self) -> Vec<&'static str> {
        vec!["7z"]
    }
}

pub struct RarHandler;

#[async_trait]
impl ArchiveHandler for RarHandler {
    async fn list_contents(&self, archive_path: &Path) -> Result<ArchiveInfo> {
        #[cfg(feature = "unrar")]
        {
            use unrar::Archive;

            let mut archive = Archive::new(archive_path.to_string_lossy().to_string())
                .list()
                .map_err(|e| AppError::ProcessingError {
                    message: format!("Failed to read RAR archive: {:?}", e),
                })?;

            let compressed_size = std::fs::metadata(archive_path)?.len();
            let mut entries = Vec::new();
            let mut total_files = 0;
            let mut total_directories = 0;
            let mut uncompressed_size = 0;

            for entry_result in archive {
                match entry_result {
                    Ok(entry) => {
                        let size = entry.unpacked_size;
                        let is_directory = entry.is_directory();

                        if is_directory {
                            total_directories += 1;
                        } else {
                            total_files += 1;
                        }

                        uncompressed_size += size;

                        entries.push(ArchiveEntry {
                            path: entry.filename.clone(),
                            size,
                            is_directory,
                            last_modified: Some(format!("{:?}", entry.file_time)),
                            compression_ratio: if size > 0 {
                                Some(entry.packed_size as f32 / size as f32)
                            } else {
                                None
                            },
                        });
                    }
                    Err(e) => {
                        return Ok(ArchiveInfo {
                            entries: vec![],
                            total_files: 0,
                            total_directories: 0,
                            uncompressed_size: 0,
                            compressed_size,
                            format: "RAR".to_string(),
                            processing_error: Some(format!("Error reading RAR entry: {:?}", e)),
                        });
                    }
                }
            }

            Ok(ArchiveInfo {
                entries,
                total_files,
                total_directories,
                uncompressed_size,
                compressed_size,
                format: "RAR".to_string(),
                processing_error: None,
            })
        }
        #[cfg(not(feature = "unrar"))]
        {
            let _ = archive_path;
            Err(AppError::ProcessingError {
                message: "RAR processing not enabled. Enable 'unrar' feature".to_string(),
            })
        }
    }

    async fn extract_to(&self, archive_path: &Path, destination: &Path) -> Result<Vec<PathBuf>> {
        #[cfg(feature = "unrar")]
        {
            use std::fs::create_dir_all;
            use unrar::Archive;

            create_dir_all(destination)?;

            Archive::new(archive_path.to_string_lossy().to_string())
                .extract_to(destination.to_string_lossy().to_string())
                .map_err(|e| AppError::ProcessingError {
                    message: format!("Failed to extract RAR archive: {:?}", e),
                })?
                .process()
                .map_err(|e| AppError::ProcessingError {
                    message: format!("RAR extraction process failed: {:?}", e),
                })?;

            // Return list of extracted files
            let mut extracted_files = Vec::new();
            if let Ok(entries) = std::fs::read_dir(destination) {
                for entry in entries.flatten() {
                    extracted_files.push(entry.path());
                }
            }

            Ok(extracted_files)
        }
        #[cfg(not(feature = "unrar"))]
        {
            let _ = (archive_path, destination);
            Err(AppError::ProcessingError {
                message: "RAR extraction not enabled. Enable 'unrar' feature".to_string(),
            })
        }
    }

    fn supported_extensions(&self) -> Vec<&'static str> {
        vec!["rar"]
    }
}

// Archive handler manager
pub struct ArchiveHandlerManager {
    handlers: Vec<Box<dyn ArchiveHandler + Send + Sync>>,
}

impl ArchiveHandlerManager {
    pub fn new() -> Self {
        let handlers: Vec<Box<dyn ArchiveHandler + Send + Sync>> = vec![
            Box::new(ZipHandler),
            Box::new(TarHandler),
            Box::new(SevenZipHandler),
            Box::new(RarHandler),
        ];

        Self { handlers }
    }

    pub async fn list_archive_contents(&self, archive_path: &Path) -> Result<ArchiveInfo> {
        let extension = self.get_archive_extension(archive_path);

        for handler in &self.handlers {
            if handler
                .supported_extensions()
                .iter()
                .any(|ext| extension.contains(ext))
            {
                return handler.list_contents(archive_path).await;
            }
        }

        Err(AppError::ProcessingError {
            message: format!("Unsupported archive format: {}", extension),
        })
    }

    pub async fn extract_archive(
        &self,
        archive_path: &Path,
        destination: &Path,
    ) -> Result<Vec<PathBuf>> {
        let extension = self.get_archive_extension(archive_path);

        for handler in &self.handlers {
            if handler
                .supported_extensions()
                .iter()
                .any(|ext| extension.contains(ext))
            {
                return handler.extract_to(archive_path, destination).await;
            }
        }

        Err(AppError::ProcessingError {
            message: format!("Unsupported archive format for extraction: {}", extension),
        })
    }

    pub fn is_supported_archive(&self, file_path: &Path) -> bool {
        let extension = self.get_archive_extension(file_path);

        self.handlers.iter().any(|handler| {
            handler
                .supported_extensions()
                .iter()
                .any(|ext| extension.contains(ext))
        })
    }

    fn get_archive_extension(&self, path: &Path) -> String {
        let path_str = path.to_string_lossy().to_lowercase();

        // Handle compound extensions like .tar.gz
        if path_str.ends_with(".tar.gz") || path_str.ends_with(".tgz") {
            "tar.gz".to_string()
        } else if path_str.ends_with(".tar.bz2") || path_str.ends_with(".tbz2") {
            "tar.bz2".to_string()
        } else if path_str.ends_with(".tar.xz") || path_str.ends_with(".txz") {
            "tar.xz".to_string()
        } else {
            path.extension()
                .and_then(|ext| ext.to_str())
                .unwrap_or("")
                .to_lowercase()
        }
    }
}

impl Default for ArchiveHandlerManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_archive_extension_detection() {
        let manager = ArchiveHandlerManager::new();

        assert_eq!(manager.get_archive_extension(Path::new("test.zip")), "zip");
        assert_eq!(
            manager.get_archive_extension(Path::new("test.tar.gz")),
            "tar.gz"
        );
        assert_eq!(
            manager.get_archive_extension(Path::new("test.tgz")),
            "tar.gz"
        );
        assert_eq!(manager.get_archive_extension(Path::new("test.7z")), "7z");
        assert_eq!(manager.get_archive_extension(Path::new("test.rar")), "rar");
    }

    #[test]
    fn test_archive_support_detection() {
        let manager = ArchiveHandlerManager::new();

        assert!(manager.is_supported_archive(Path::new("test.zip")));
        assert!(manager.is_supported_archive(Path::new("test.tar")));
        assert!(manager.is_supported_archive(Path::new("test.tar.gz")));
        assert!(manager.is_supported_archive(Path::new("test.7z")));
        assert!(manager.is_supported_archive(Path::new("test.rar")));
        assert!(!manager.is_supported_archive(Path::new("test.unknown")));
    }
}
