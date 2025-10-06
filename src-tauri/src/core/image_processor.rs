use crate::error::{AppError, Result};
use async_trait::async_trait;
use image::{GenericImageView, ImageFormat, ImageReader};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageMetadata {
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub color_type: String,
    pub bit_depth: Option<u8>,
    pub file_size: u64,

    // EXIF data
    pub camera_make: Option<String>,
    pub camera_model: Option<String>,
    pub lens_model: Option<String>,
    pub datetime_original: Option<String>,
    pub datetime_digitized: Option<String>,
    pub gps_latitude: Option<f64>,
    pub gps_longitude: Option<f64>,
    pub gps_altitude: Option<f64>,
    pub focal_length: Option<f64>,
    pub aperture: Option<f64>,
    pub iso_speed: Option<u32>,
    pub exposure_time: Option<String>,
    pub flash: Option<String>,
    pub orientation: Option<u16>,

    // Additional metadata
    pub dpi_x: Option<f64>,
    pub dpi_y: Option<f64>,
    pub color_space: Option<String>,
    pub white_balance: Option<String>,
    pub metering_mode: Option<String>,
    pub exposure_mode: Option<String>,
    pub scene_capture_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessedImage {
    pub metadata: ImageMetadata,
    pub thumbnail_path: Option<String>,
    pub processing_error: Option<String>,
}

#[async_trait]
pub trait ImageProcessor {
    async fn process(
        &self,
        image_path: &Path,
        thumbnail_dir: Option<&Path>,
    ) -> Result<ProcessedImage>;
    async fn create_thumbnail(
        &self,
        image_path: &Path,
        thumbnail_path: &Path,
        max_size: u32,
    ) -> Result<()>;
    fn supported_formats(&self) -> Vec<&'static str>;
    async fn extract_basic_metadata(
        &self,
        image_path: &Path,
    ) -> Result<(u32, u32, String, String, Option<u8>)>;
    fn calculate_thumbnail_size(&self, width: u32, height: u32, max_size: u32) -> (u32, u32);
    async fn create_thumbnail_for_image(
        &self,
        image_path: &Path,
        thumbnail_dir: &Path,
        max_size: u32,
    ) -> Result<String>;
}

pub struct StandardImageProcessor;

#[async_trait]
impl ImageProcessor for StandardImageProcessor {
    async fn process(
        &self,
        image_path: &Path,
        thumbnail_dir: Option<&Path>,
    ) -> Result<ProcessedImage> {
        // Get basic image info using image crate
        let basic_metadata = self.extract_basic_metadata(image_path).await?;

        // Extract EXIF data if available (only with kamadak-exif feature)
        #[cfg(feature = "kamadak-exif")]
        let exif_metadata = self
            .extract_exif_metadata(image_path)
            .await
            .unwrap_or_default();

        #[cfg(not(feature = "kamadak-exif"))]
        let exif_metadata = ImageMetadata::default();

        // Combine metadata
        let metadata = ImageMetadata {
            width: basic_metadata.0,
            height: basic_metadata.1,
            format: basic_metadata.2,
            color_type: basic_metadata.3,
            bit_depth: basic_metadata.4,
            file_size: std::fs::metadata(image_path)?.len(),
            ..exif_metadata
        };

        // Create thumbnail if thumbnail directory is provided
        let thumbnail_path = if let Some(thumb_dir) = thumbnail_dir {
            match self
                .create_thumbnail_for_image(image_path, thumb_dir, 200)
                .await
            {
                Ok(path) => Some(path),
                Err(e) => {
                    tracing::warn!(
                        "Failed to create thumbnail for {}: {}",
                        image_path.display(),
                        e
                    );
                    None
                }
            }
        } else {
            None
        };

        Ok(ProcessedImage {
            metadata,
            thumbnail_path,
            processing_error: None,
        })
    }

    async fn create_thumbnail(
        &self,
        image_path: &Path,
        thumbnail_path: &Path,
        max_size: u32,
    ) -> Result<()> {
        use std::fs;

        // Ensure thumbnail directory exists
        if let Some(parent) = thumbnail_path.parent() {
            fs::create_dir_all(parent)?;
        }

        let img =
            ImageReader::open(image_path)?
                .decode()
                .map_err(|e| AppError::ProcessingError {
                    message: format!("Failed to decode image: {}", e),
                })?;

        let (width, height) = img.dimensions();
        let (new_width, new_height) = self.calculate_thumbnail_size(width, height, max_size);

        let thumbnail = img.resize(new_width, new_height, image::imageops::FilterType::Lanczos3);

        thumbnail
            .save_with_format(thumbnail_path, ImageFormat::Jpeg)
            .map_err(|e| AppError::ProcessingError {
                message: format!("Failed to save thumbnail: {}", e),
            })?;

        Ok(())
    }

    fn supported_formats(&self) -> Vec<&'static str> {
        vec![
            "jpg", "jpeg", "png", "gif", "bmp", "tiff", "tif", "webp", "ico", "avif",
        ]
    }

    async fn extract_basic_metadata(
        &self,
        image_path: &Path,
    ) -> Result<(u32, u32, String, String, Option<u8>)> {
        let reader = ImageReader::open(image_path)?;
        let format = reader
            .format()
            .map(|f| format!("{:?}", f))
            .unwrap_or_else(|| "Unknown".to_string());

        let img = reader.decode().map_err(|e| AppError::ProcessingError {
            message: format!("Failed to decode image: {}", e),
        })?;

        let (width, height) = img.dimensions();
        let color_type = format!("{:?}", img.color());

        Ok((width, height, format, color_type, None))
    }

    fn calculate_thumbnail_size(&self, width: u32, height: u32, max_size: u32) -> (u32, u32) {
        let aspect_ratio = width as f32 / height as f32;

        if width > height {
            let new_width = max_size.min(width);
            let new_height = (new_width as f32 / aspect_ratio) as u32;
            (new_width, new_height)
        } else {
            let new_height = max_size.min(height);
            let new_width = (new_height as f32 * aspect_ratio) as u32;
            (new_width, new_height)
        }
    }

    async fn create_thumbnail_for_image(
        &self,
        image_path: &Path,
        thumbnail_dir: &Path,
        max_size: u32,
    ) -> Result<String> {
        let filename = image_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("thumbnail");

        let thumbnail_filename = format!("{}_thumb.jpg", filename);
        let thumbnail_path = thumbnail_dir.join(&thumbnail_filename);

        self.create_thumbnail(image_path, &thumbnail_path, max_size)
            .await?;

        Ok(thumbnail_path.to_string_lossy().to_string())
    }

    #[cfg(feature = "kamadak-exif")]
    fn dms_to_decimal(&self, dms: &[kamadak_exif::Rational]) -> f64 {
        if dms.len() >= 3 {
            let degrees = dms[0].to_f64();
            let minutes = dms[1].to_f64();
            let seconds = dms[2].to_f64();
            degrees + minutes / 60.0 + seconds / 3600.0
        } else {
            0.0
        }
    }

    #[cfg(feature = "kamadak-exif")]
    fn decode_flash_value(&self, flash: u16) -> String {
        match flash {
            0x0000 => "Flash did not fire".to_string(),
            0x0001 => "Flash fired".to_string(),
            0x0005 => "Strobe return light not detected".to_string(),
            0x0007 => "Strobe return light detected".to_string(),
            0x0009 => "Flash fired, compulsory flash mode".to_string(),
            0x000D => "Flash fired, compulsory flash mode, return light not detected".to_string(),
            0x000F => "Flash fired, compulsory flash mode, return light detected".to_string(),
            0x0010 => "Flash did not fire, compulsory flash mode".to_string(),
            0x0018 => "Flash did not fire, auto mode".to_string(),
            0x0019 => "Flash fired, auto mode".to_string(),
            0x001D => "Flash fired, auto mode, return light not detected".to_string(),
            0x001F => "Flash fired, auto mode, return light detected".to_string(),
            0x0020 => "No flash function".to_string(),
            0x0041 => "Flash fired, red-eye reduction mode".to_string(),
            0x0045 => "Flash fired, red-eye reduction mode, return light not detected".to_string(),
            0x0047 => "Flash fired, red-eye reduction mode, return light detected".to_string(),
            0x0049 => "Flash fired, compulsory flash mode, red-eye reduction mode".to_string(),
            0x004D => "Flash fired, compulsory flash mode, red-eye reduction mode, return light not detected".to_string(),
            0x004F => "Flash fired, compulsory flash mode, red-eye reduction mode, return light detected".to_string(),
            0x0059 => "Flash fired, auto mode, red-eye reduction mode".to_string(),
            0x005D => "Flash fired, auto mode, return light not detected, red-eye reduction mode".to_string(),
            0x005F => "Flash fired, auto mode, return light detected, red-eye reduction mode".to_string(),
            _ => format!("Unknown flash mode: 0x{:04X}", flash),
        }
    }

    #[cfg(feature = "kamadak-exif")]
    fn decode_white_balance_value(&self, wb: u16) -> String {
        match wb {
            0 => "Auto".to_string(),
            1 => "Manual".to_string(),
            _ => format!("Unknown: {}", wb),
        }
    }

    #[cfg(feature = "kamadak-exif")]
    fn decode_metering_mode_value(&self, mode: u16) -> String {
        match mode {
            0 => "Unknown".to_string(),
            1 => "Average".to_string(),
            2 => "Center-weighted average".to_string(),
            3 => "Spot".to_string(),
            4 => "Multi-spot".to_string(),
            5 => "Multi-segment".to_string(),
            6 => "Partial".to_string(),
            255 => "Other".to_string(),
            _ => format!("Unknown: {}", mode),
        }
    }

    #[cfg(feature = "kamadak-exif")]
    fn decode_exposure_mode_value(&self, mode: u16) -> String {
        match mode {
            0 => "Auto exposure".to_string(),
            1 => "Manual exposure".to_string(),
            2 => "Auto bracket".to_string(),
            _ => format!("Unknown: {}", mode),
        }
    }

    #[cfg(feature = "kamadak-exif")]
    fn decode_scene_capture_type_value(&self, scene: u16) -> String {
        match scene {
            0 => "Standard".to_string(),
            1 => "Landscape".to_string(),
            2 => "Portrait".to_string(),
            3 => "Night scene".to_string(),
            _ => format!("Unknown: {}", scene),
        }

        fn dms_to_decimal(&self, dms: &[kamadak_exif::Rational]) -> f64 {
            if dms.len() >= 3 {
                let degrees = dms[0].to_f64();
                let minutes = dms[1].to_f64();
                let seconds = dms[2].to_f64();
                degrees + minutes / 60.0 + seconds / 3600.0
            } else {
                0.0
            }
        }

        fn decode_flash_value(&self, flash: u16) -> String {
            match flash {
                0x0000 => "Flash did not fire".to_string(),
                0x0001 => "Flash fired".to_string(),
                0x0005 => "Strobe return light not detected".to_string(),
                0x0007 => "Strobe return light detected".to_string(),
                0x0009 => "Flash fired, compulsory flash mode".to_string(),
                0x000D => "Flash fired, compulsory flash mode, return light not detected".to_string(),
                0x000F => "Flash fired, compulsory flash mode, return light detected".to_string(),
                0x0010 => "Flash did not fire, compulsory flash mode".to_string(),
                0x0018 => "Flash did not fire, auto mode".to_string(),
                0x0019 => "Flash fired, auto mode".to_string(),
                0x001D => "Flash fired, auto mode, return light not detected".to_string(),
                0x001F => "Flash fired, auto mode, return light detected".to_string(),
                0x0020 => "No flash function".to_string(),
                0x0041 => "Flash fired, red-eye reduction mode".to_string(),
                0x0045 => "Flash fired, red-eye reduction mode, return light not detected".to_string(),
                0x0047 => "Flash fired, red-eye reduction mode, return light detected".to_string(),
                0x0049 => "Flash fired, compulsory flash mode, red-eye reduction mode".to_string(),
                0x004D => "Flash fired, compulsory flash mode, red-eye reduction mode, return light not detected".to_string(),
                0x004F => "Flash fired, compulsory flash mode, red-eye reduction mode, return light detected".to_string(),
                0x0059 => "Flash fired, auto mode, red-eye reduction mode".to_string(),
                0x005D => "Flash fired, auto mode, red-eye reduction mode, return light not detected".to_string(),
                0x005F => "Flash fired, auto mode, red-eye reduction mode, return light detected".to_string(),
                _ => format!("Unknown flash value: 0x{:04X}", flash),
            }
        }

        fn decode_white_balance_value(&self, wb: u16) -> String {
            match wb {
                0 => "Auto".to_string(),
                1 => "Manual".to_string(),
                _ => format!("Unknown: {}", wb),
            }
        }

        fn decode_metering_mode_value(&self, mode: u16) -> String {
            match mode {
                0 => "Unknown".to_string(),
                1 => "Average".to_string(),
                2 => "Center-weighted average".to_string(),
                3 => "Spot".to_string(),
                4 => "Multi-spot".to_string(),
                5 => "Pattern".to_string(),
                6 => "Partial".to_string(),
                255 => "Other".to_string(),
                _ => format!("Unknown: {}", mode),
            }
        }

        fn decode_exposure_mode_value(&self, mode: u16) -> String {
            match mode {
                0 => "Auto exposure".to_string(),
                1 => "Manual exposure".to_string(),
                2 => "Auto bracket".to_string(),
                _ => format!("Unknown: {}", mode),
            }
        }

        fn decode_scene_capture_type_value(&self, scene: u16) -> String {
            match scene {
                0 => "Standard".to_string(),
                1 => "Landscape".to_string(),
                2 => "Portrait".to_string(),
                3 => "Night scene".to_string(),
                _ => format!("Unknown: {}", scene),
            }
        }
    }
}

impl Default for ImageMetadata {
    fn default() -> Self {
        Self {
            width: 0,
            height: 0,
            format: "Unknown".to_string(),
            color_type: "Unknown".to_string(),
            bit_depth: None,
            file_size: 0,
            camera_make: None,
            camera_model: None,
            lens_model: None,
            datetime_original: None,
            datetime_digitized: None,
            gps_latitude: None,
            gps_longitude: None,
            gps_altitude: None,
            focal_length: None,
            aperture: None,
            iso_speed: None,
            exposure_time: None,
            flash: None,
            orientation: None,
            dpi_x: None,
            dpi_y: None,
            color_space: None,
            white_balance: None,
            metering_mode: None,
            exposure_mode: None,
            scene_capture_type: None,
        }
    }
}

/// Manager for image processing operations
pub struct ImageProcessorManager {
    processor: StandardImageProcessor,
}

impl ImageProcessorManager {
    pub fn new() -> Self {
        Self {
            processor: StandardImageProcessor,
        }
    }

    pub async fn process_image(
        &self,
        image_path: &Path,
        thumbnail_dir: Option<&Path>,
    ) -> Result<ProcessedImage> {
        if !self.is_supported_format(image_path) {
            return Err(AppError::ProcessingError {
                message: format!("Unsupported image format: {:?}", image_path.extension()),
            });
        }

        self.processor.process(image_path, thumbnail_dir).await
    }

    pub async fn create_thumbnail(
        &self,
        image_path: &Path,
        thumbnail_path: &Path,
        max_size: u32,
    ) -> Result<()> {
        self.processor
            .create_thumbnail(image_path, thumbnail_path, max_size)
            .await
    }

    pub fn is_supported_format(&self, image_path: &Path) -> bool {
        let extension = image_path
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("")
            .to_lowercase();

        self.processor
            .supported_formats()
            .contains(&extension.as_str())
    }
}

impl Default for ImageProcessorManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_thumbnail_size_calculation() {
        let processor = StandardImageProcessor;

        // Test landscape image
        let (width, height) = processor.calculate_thumbnail_size(1920, 1080, 200);
        assert_eq!(width, 200);
        assert_eq!(height, 112);

        // Test portrait image
        let (width, height) = processor.calculate_thumbnail_size(1080, 1920, 200);
        assert_eq!(width, 112);
        assert_eq!(height, 200);

        // Test square image
        let (width, height) = processor.calculate_thumbnail_size(1000, 1000, 200);
        assert_eq!(width, 200);
        assert_eq!(height, 200);
    }

    #[test]
    fn test_image_format_support() {
        let manager = ImageProcessorManager::new();

        assert!(manager.is_supported_format(Path::new("test.jpg")));
        assert!(manager.is_supported_format(Path::new("test.png")));
        assert!(manager.is_supported_format(Path::new("test.gif")));
        assert!(manager.is_supported_format(Path::new("test.webp")));
        assert!(!manager.is_supported_format(Path::new("test.unknown")));
    }
}
