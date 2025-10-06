use crate::error::Result;
use async_trait::async_trait;
use id3::TagLike;
use serde::{Deserialize, Serialize};
use std::path::Path; // Import TagLike trait for id3 methods

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioMetadata {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub genre: Option<String>,
    pub year: Option<i32>,
    pub track_number: Option<u32>,
    pub track_total: Option<u32>,
    pub disc_number: Option<u32>,
    pub disc_total: Option<u32>,
    pub duration: Option<f64>, // Duration in seconds
    pub bitrate: Option<u32>,
    pub sample_rate: Option<u32>,
    pub channels: Option<u16>,
    pub format: String,
    pub codec: Option<String>,
    pub file_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoMetadata {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub genre: Option<String>,
    pub year: Option<i32>,
    pub duration: Option<f64>, // Duration in seconds
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub frame_rate: Option<f64>,
    pub bitrate: Option<u32>,
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    pub format: String,
    pub container: Option<String>,
    pub file_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessedMedia {
    pub audio_metadata: Option<AudioMetadata>,
    pub video_metadata: Option<VideoMetadata>,
    pub media_type: MediaType,
    pub processing_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MediaType {
    Audio,
    Video,
    Unknown,
}

#[async_trait]
pub trait MediaAnalyzer {
    async fn analyze(&self, media_path: &Path) -> Result<ProcessedMedia>;
    fn supported_formats(&self) -> Vec<&'static str>;
}

pub struct AudioAnalyzer;

#[async_trait]
impl MediaAnalyzer for AudioAnalyzer {
    async fn analyze(&self, media_path: &Path) -> Result<ProcessedMedia> {
        let extension = media_path
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("")
            .to_lowercase();

        let file_size = std::fs::metadata(media_path)?.len();

        // Try different audio metadata extraction methods based on format
        let audio_metadata = match extension.as_str() {
            "mp3" => self
                .extract_mp3_metadata(media_path, file_size)
                .await
                .unwrap_or_default(),
            "flac" => self
                .extract_flac_metadata(media_path, file_size)
                .await
                .unwrap_or_default(),
            "m4a" | "mp4" | "aac" => self
                .extract_mp4_metadata(media_path, file_size)
                .await
                .unwrap_or_default(),
            _ => self
                .extract_generic_audio_metadata(media_path, file_size)
                .await
                .unwrap_or_default(),
        };

        Ok(ProcessedMedia {
            audio_metadata: Some(audio_metadata),
            video_metadata: None,
            media_type: MediaType::Audio,
            processing_error: None,
        })
    }

    fn supported_formats(&self) -> Vec<&'static str> {
        vec!["mp3", "flac", "ogg", "wav", "m4a", "aac", "wma", "opus"]
    }
}

impl AudioAnalyzer {
    async fn extract_mp3_metadata(
        &self,
        media_path: &Path,
        file_size: u64,
    ) -> Result<AudioMetadata> {
        #[cfg(feature = "id3")]
        {
            use id3::Tag;

            match Tag::read_from_path(media_path) {
                Ok(tag) => {
                    // Duration calculation would require additional parsing, using 0.0 as placeholder
                    let duration = 0.0;

                    Ok(AudioMetadata {
                        title: tag.title().map(|s| s.to_string()),
                        artist: tag.artist().map(|s| s.to_string()),
                        album: tag.album().map(|s| s.to_string()),
                        album_artist: tag.album_artist().map(|s| s.to_string()),
                        genre: tag.genre().map(|s| s.to_string()),
                        year: tag.year(),
                        track_number: tag.track(),
                        track_total: tag.total_tracks(),
                        disc_number: tag.disc(),
                        disc_total: tag.total_discs(),
                        duration: Some(duration),
                        bitrate: None, // Would need additional parsing
                        sample_rate: None,
                        channels: None,
                        format: "MP3".to_string(),
                        codec: Some("MP3".to_string()),
                        file_size,
                    })
                }
                Err(_) => Ok(AudioMetadata::default_for_format("MP3", file_size)),
            }
        }
        #[cfg(not(feature = "id3"))]
        {
            let _ = media_path;
            Ok(AudioMetadata::default_for_format("MP3", file_size))
        }
    }

    async fn extract_flac_metadata(
        &self,
        media_path: &Path,
        file_size: u64,
    ) -> Result<AudioMetadata> {
        #[cfg(feature = "metaflac")]
        {
            use metaflac::Tag;

            match Tag::read_from_path(media_path) {
                Ok(tag) => {
                    // Extract vorbis comments
                    let vorbis_comments = tag.vorbis_comments();
                    let get_comment = |key: &str| -> Option<String> {
                        vorbis_comments
                            .and_then(|vc| vc.get(key))
                            .map(|v| v[0].clone())
                    };

                    let stream_info = tag.get_streaminfo();
                    let duration =
                        stream_info.map(|si| si.total_samples as f64 / si.sample_rate as f64);

                    Ok(AudioMetadata {
                        title: get_comment("TITLE"),
                        artist: get_comment("ARTIST"),
                        album: get_comment("ALBUM"),
                        album_artist: get_comment("ALBUMARTIST"),
                        genre: get_comment("GENRE"),
                        year: get_comment("DATE")
                            .or_else(|| get_comment("YEAR"))
                            .and_then(|s| s.parse().ok()),
                        track_number: get_comment("TRACKNUMBER").and_then(|s| s.parse().ok()),
                        track_total: get_comment("TRACKTOTAL")
                            .or_else(|| get_comment("TOTALTRACKS"))
                            .and_then(|s| s.parse().ok()),
                        disc_number: get_comment("DISCNUMBER").and_then(|s| s.parse().ok()),
                        disc_total: get_comment("DISCTOTAL")
                            .or_else(|| get_comment("TOTALDISCS"))
                            .and_then(|s| s.parse().ok()),
                        duration,
                        bitrate: stream_info.map(|si| {
                            ((file_size * 8) as f64
                                / (si.total_samples as f64 / si.sample_rate as f64)
                                / 1000.0) as u32
                        }),
                        sample_rate: stream_info.map(|si| si.sample_rate),
                        channels: stream_info.map(|si| si.channels as u16),
                        format: "FLAC".to_string(),
                        codec: Some("FLAC".to_string()),
                        file_size,
                    })
                }
                Err(_) => Ok(AudioMetadata::default_for_format("FLAC", file_size)),
            }
        }
        #[cfg(not(feature = "metaflac"))]
        {
            let _ = media_path;
            Ok(AudioMetadata::default_for_format("FLAC", file_size))
        }
    }

    async fn extract_mp4_metadata(
        &self,
        media_path: &Path,
        file_size: u64,
    ) -> Result<AudioMetadata> {
        #[cfg(feature = "mp4parse")]
        {
            use std::fs::File;
            use std::io::BufReader;

            let file = File::open(media_path)?;
            let mut reader = BufReader::new(file);

            match mp4parse::read_mp4(&mut reader) {
                Ok(mp4) => {
                    let mut metadata = AudioMetadata::default_for_format("MP4", file_size);

                    // Calculate duration from tracks
                    if let Some(track) = mp4.tracks.first() {
                        let duration_seconds = track
                            .duration
                            .map(|d| d as f64 / track.timescale.unwrap_or(1) as f64);
                        metadata.duration = duration_seconds;

                        if let Some(audio_sample_entry) = &track.audio {
                            metadata.sample_rate = Some(audio_sample_entry.samplerate >> 16); // Fixed-point conversion
                            metadata.channels = Some(audio_sample_entry.channelcount);
                        }
                    }

                    // iTunes-style metadata extraction from moov atom would require
                    // more complex MP4 structure parsing. For now, use basic metadata.

                    Ok(metadata)
                }
                Err(_) => Ok(AudioMetadata::default_for_format("MP4", file_size)),
            }
        }
        #[cfg(not(feature = "mp4parse"))]
        {
            let _ = media_path;
            Ok(AudioMetadata::default_for_format("MP4", file_size))
        }
    }

    async fn extract_generic_audio_metadata(
        &self,
        media_path: &Path,
        file_size: u64,
    ) -> Result<AudioMetadata> {
        #[cfg(feature = "audiotags")]
        {
            use audiotags::Tag;

            match Tag::new().read_from_path(media_path) {
                Ok(tag) => {
                    let extension = media_path
                        .extension()
                        .and_then(|ext| ext.to_str())
                        .unwrap_or("Unknown")
                        .to_uppercase();

                    Ok(AudioMetadata {
                        title: tag.title().map(|s| s.to_string()),
                        artist: tag.artist().map(|s| s.to_string()),
                        album: tag.album_title().map(|s| s.to_string()),
                        album_artist: tag.album_artist().map(|s| s.to_string()),
                        genre: tag.genre().map(|s| s.to_string()),
                        year: tag.year(),
                        track_number: tag.track_number().map(|v| v as u32),
                        track_total: tag.total_tracks().map(|v| v as u32),
                        disc_number: tag.disc_number().map(|v| v as u32),
                        disc_total: tag.total_discs().map(|v| v as u32),
                        duration: tag.duration(),
                        bitrate: None,
                        sample_rate: None,
                        channels: None,
                        format: extension,
                        codec: None,
                        file_size,
                    })
                }
                Err(_) => {
                    let format = media_path
                        .extension()
                        .and_then(|ext| ext.to_str())
                        .unwrap_or("Unknown")
                        .to_uppercase();
                    Ok(AudioMetadata::default_for_format(&format, file_size))
                }
            }
        }
        #[cfg(not(feature = "audiotags"))]
        {
            let format = media_path
                .extension()
                .and_then(|ext| ext.to_str())
                .unwrap_or("Unknown")
                .to_uppercase();
            Ok(AudioMetadata::default_for_format(&format, file_size))
        }
    }
}

pub struct VideoAnalyzer;

#[async_trait]
impl MediaAnalyzer for VideoAnalyzer {
    async fn analyze(&self, media_path: &Path) -> Result<ProcessedMedia> {
        let extension = media_path
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("")
            .to_lowercase();

        let file_size = std::fs::metadata(media_path)?.len();

        let video_metadata = match extension.as_str() {
            "mp4" | "m4v" | "mov" => self
                .extract_mp4_video_metadata(media_path, file_size)
                .await
                .unwrap_or_default(),
            _ => self
                .extract_generic_video_metadata(media_path, file_size)
                .await
                .unwrap_or_default(),
        };

        Ok(ProcessedMedia {
            audio_metadata: None,
            video_metadata: Some(video_metadata),
            media_type: MediaType::Video,
            processing_error: None,
        })
    }

    fn supported_formats(&self) -> Vec<&'static str> {
        vec![
            "mp4", "avi", "mkv", "mov", "wmv", "flv", "webm", "m4v", "3gp",
        ]
    }
}

impl VideoAnalyzer {
    async fn extract_mp4_video_metadata(
        &self,
        _media_path: &Path,
        file_size: u64,
    ) -> Result<VideoMetadata> {
        #[cfg(feature = "mp4parse")]
        {
            use std::fs::File;
            use std::io::BufReader;

            let file = File::open(media_path)?;
            let mut reader = BufReader::new(file);

            match mp4parse::read_mp4(&mut reader) {
                Ok(mp4) => {
                    let mut metadata = VideoMetadata::default_for_format("MP4", file_size);

                    // Find video and audio tracks
                    let mut video_track = None;
                    let mut audio_track = None;

                    for track in &mp4.tracks {
                        if track.video.is_some() && video_track.is_none() {
                            video_track = Some(track);
                        } else if track.audio.is_some() && audio_track.is_none() {
                            audio_track = Some(track);
                        }
                    }

                    // Extract video information
                    if let Some(vtrack) = video_track {
                        metadata.duration = vtrack
                            .duration
                            .map(|d| d as f64 / vtrack.timescale.unwrap_or(1) as f64);

                        if let Some(video_sample_entry) = &vtrack.video {
                            metadata.width = Some(video_sample_entry.width);
                            metadata.height = Some(video_sample_entry.height);
                        }
                    }

                    // Extract audio codec from audio track
                    if let Some(atrack) = audio_track {
                        if atrack.audio.is_some() {
                            metadata.audio_codec = Some("AAC".to_string()); // Common for MP4
                        }
                    }

                    metadata.video_codec = Some("H.264".to_string()); // Common for MP4
                    metadata.container = Some("MP4".to_string());

                    Ok(metadata)
                }
                Err(_) => Ok(VideoMetadata::default_for_format("MP4", file_size)),
            }
        }
        #[cfg(not(feature = "mp4parse"))]
        {
            Ok(VideoMetadata::default_for_format("MP4", file_size))
        }
    }

    async fn extract_generic_video_metadata(
        &self,
        media_path: &Path,
        file_size: u64,
    ) -> Result<VideoMetadata> {
        // For other video formats, we'd need FFmpeg or similar
        // For now, return basic metadata
        let format = media_path
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("Unknown")
            .to_uppercase();

        Ok(VideoMetadata::default_for_format(&format, file_size))
    }
}

impl Default for AudioMetadata {
    fn default() -> Self {
        Self {
            title: None,
            artist: None,
            album: None,
            album_artist: None,
            genre: None,
            year: None,
            track_number: None,
            track_total: None,
            disc_number: None,
            disc_total: None,
            duration: None,
            bitrate: None,
            sample_rate: None,
            channels: None,
            format: "Unknown".to_string(),
            codec: None,
            file_size: 0,
        }
    }
}

impl AudioMetadata {
    fn default_for_format(format: &str, file_size: u64) -> Self {
        Self {
            format: format.to_string(),
            file_size,
            ..Default::default()
        }
    }
}

impl Default for VideoMetadata {
    fn default() -> Self {
        Self {
            title: None,
            artist: None,
            album: None,
            genre: None,
            year: None,
            duration: None,
            width: None,
            height: None,
            frame_rate: None,
            bitrate: None,
            video_codec: None,
            audio_codec: None,
            format: "Unknown".to_string(),
            container: None,
            file_size: 0,
        }
    }
}

impl VideoMetadata {
    fn default_for_format(format: &str, file_size: u64) -> Self {
        Self {
            format: format.to_string(),
            file_size,
            ..Default::default()
        }
    }
}

// Media analyzer manager
pub struct MediaAnalyzerManager {
    audio_analyzer: AudioAnalyzer,
    video_analyzer: VideoAnalyzer,
}

impl MediaAnalyzerManager {
    pub fn new() -> Self {
        Self {
            audio_analyzer: AudioAnalyzer,
            video_analyzer: VideoAnalyzer,
        }
    }

    pub async fn analyze_media(&self, media_path: &Path) -> Result<ProcessedMedia> {
        let extension = media_path
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("")
            .to_lowercase();

        // Determine if it's audio or video based on extension
        if self
            .audio_analyzer
            .supported_formats()
            .contains(&extension.as_str())
        {
            self.audio_analyzer.analyze(media_path).await
        } else if self
            .video_analyzer
            .supported_formats()
            .contains(&extension.as_str())
        {
            self.video_analyzer.analyze(media_path).await
        } else {
            Ok(ProcessedMedia {
                audio_metadata: None,
                video_metadata: None,
                media_type: MediaType::Unknown,
                processing_error: Some(format!("Unsupported media format: {}", extension)),
            })
        }
    }

    pub fn is_supported_media(&self, media_path: &Path) -> bool {
        let extension = media_path
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("")
            .to_lowercase();

        self.audio_analyzer
            .supported_formats()
            .contains(&extension.as_str())
            || self
                .video_analyzer
                .supported_formats()
                .contains(&extension.as_str())
    }

    pub fn get_media_type(&self, media_path: &Path) -> MediaType {
        let extension = media_path
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("")
            .to_lowercase();

        if self
            .audio_analyzer
            .supported_formats()
            .contains(&extension.as_str())
        {
            MediaType::Audio
        } else if self
            .video_analyzer
            .supported_formats()
            .contains(&extension.as_str())
        {
            MediaType::Video
        } else {
            MediaType::Unknown
        }
    }
}

impl Default for MediaAnalyzerManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_media_type_detection() {
        let manager = MediaAnalyzerManager::new();

        assert!(matches!(
            manager.get_media_type(Path::new("test.mp3")),
            MediaType::Audio
        ));
        assert!(matches!(
            manager.get_media_type(Path::new("test.flac")),
            MediaType::Audio
        ));
        assert!(matches!(
            manager.get_media_type(Path::new("test.mp4")),
            MediaType::Video
        ));
        assert!(matches!(
            manager.get_media_type(Path::new("test.avi")),
            MediaType::Video
        ));
        assert!(matches!(
            manager.get_media_type(Path::new("test.unknown")),
            MediaType::Unknown
        ));
    }

    #[test]
    fn test_media_support_detection() {
        let manager = MediaAnalyzerManager::new();

        assert!(manager.is_supported_media(Path::new("test.mp3")));
        assert!(manager.is_supported_media(Path::new("test.mp4")));
        assert!(manager.is_supported_media(Path::new("test.flac")));
        assert!(manager.is_supported_media(Path::new("test.avi")));
        assert!(!manager.is_supported_media(Path::new("test.unknown")));
    }
}
