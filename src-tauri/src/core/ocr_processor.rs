use crate::error::{AppError, Result};
use std::path::Path;

/// Manager for OCR (Optical Character Recognition) processing
pub struct OcrProcessorManager {
    _ocr_available: bool,
}

impl Default for OcrProcessorManager {
    fn default() -> Self {
        Self::new()
    }
}

impl OcrProcessorManager {
    pub fn new() -> Self {
        // Check if OCR dependencies are available
        let ocr_available = false; // Will be checked when needed

        Self {
            _ocr_available: ocr_available,
        }
    }

    /// Check if OCR functionality is available (dependencies loaded)
    pub fn is_ocr_available(&self) -> bool {
        #[cfg(feature = "ocr")]
        {
            // Try to initialize Tesseract to check if it's available
            if let Ok(_) = tesseract::Tesseract::new(None, Some("eng")) {
                true
            } else {
                false
            }
        }
        #[cfg(not(feature = "ocr"))]
        {
            false
        }
    }

    /// Extract text from an image file
    pub async fn extract_text_from_image<P: AsRef<Path>>(&self, _image_path: P) -> Result<String> {
        #[cfg(feature = "ocr")]
        {
            let image_path = _image_path.as_ref();

            // Check if file exists
            if !image_path.exists() {
                return Err(AppError::FileNotFound {
                    path: image_path.display().to_string(),
                });
            }

            // Check if OCR is available before proceeding
            if !self.is_ocr_available() {
                return Err(AppError::ProcessingError {
                    message: "OCR not available - Tesseract/Leptonica not installed on system".to_string(),
                });
            }

            // Load image
            let img = image::open(image_path)?;

            // Convert to grayscale for better OCR results
            let gray_img = img.grayscale();

            // Convert to RGB format for Tesseract
            let rgb_img = image::DynamicImage::ImageRgb8(gray_img.to_rgb8());

            // Encode image to bytes
            let mut image_data = Vec::new();
            rgb_img.write_to(&mut Cursor::new(&mut image_data), image::ImageFormat::Png)?;

            // Initialize Tesseract
            let tesseract = tesseract::Tesseract::new(None, Some("eng")).map_err(|e| {
                AppError::ProcessingError {
                    message: format!("Failed to initialize Tesseract: {}", e),
                }
            })?;

            // Set image data
            tesseract
                .set_image_from_mem(&image_data)
                .map_err(|e| AppError::ProcessingError {
                    message: format!("Failed to set image data: {}", e),
                })?;

            // Extract text
            let text = tesseract
                .get_text()
                .map_err(|e| AppError::ProcessingError {
                    message: format!("Failed to extract text: {}", e),
                })?;

            Ok(text.trim().to_string())
        }
        #[cfg(not(feature = "ocr"))]
        {
            Err(AppError::ProcessingError {
                message: "OCR functionality not available - feature not enabled".to_string(),
            })
        }
    }

    /// Extract text from image bytes
    pub async fn extract_text_from_image_bytes(&self, _image_data: &[u8]) -> Result<String> {
        #[cfg(feature = "ocr")]
        {
            // Check if OCR is available before proceeding
            if !self.is_ocr_available() {
                return Err(AppError::ProcessingError {
                    message: "OCR not available - Tesseract/Leptonica not installed on system".to_string(),
                });
            }

            // Initialize Tesseract
            let tesseract = tesseract::Tesseract::new(None, Some("eng")).map_err(|e| {
                AppError::ProcessingError {
                    message: format!("Failed to initialize Tesseract: {}", e),
                }
            })?;

            // Set image data directly
            tesseract
                .set_image_from_mem(image_data)
                .map_err(|e| AppError::ProcessingError {
                    message: format!("Failed to set image data: {}", e),
                })?;

            // Extract text
            let text = tesseract
                .get_text()
                .map_err(|e| AppError::ProcessingError {
                    message: format!("Failed to extract text: {}", e),
                })?;

            Ok(text.trim().to_string())
        }
        #[cfg(not(feature = "ocr"))]
        {
            Err(AppError::ProcessingError {
                message: "OCR functionality not available - feature not enabled".to_string(),
            })
        }
    }

    /// Check if a file is an image that can be processed by OCR
    pub fn is_image_file(&self, file_path: &str) -> bool {
        if let Some(extension) = std::path::Path::new(file_path).extension() {
            let ext = extension.to_string_lossy().to_lowercase();
            matches!(
                ext.as_str(),
                "png" | "jpg" | "jpeg" | "bmp" | "tiff" | "tif" | "gif"
            )
        } else {
            false
        }
    }

    /// Get supported image formats for OCR
    pub fn get_supported_formats(&self) -> Vec<&'static str> {
        vec!["png", "jpg", "jpeg", "bmp", "tiff", "tif", "gif"]
    }
}
