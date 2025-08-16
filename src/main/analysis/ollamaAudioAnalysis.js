const path = require('path');

/**
 * Minimal audio analysis stub to satisfy tests and return structured errors.
 * The real audio analysis is currently disabled in the app.
 */
async function analyzeAudioFile(filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const supported = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'];
    if (!supported.includes(ext)) {
      return {
        error: `Unsupported audio format: ${ext || 'unknown'}`,
        category: 'unsupported',
        keywords: [],
        confidence: 0,
        has_transcription: false,
        suggestedName: path.basename(filePath, ext),
      };
    }
    // Not implemented path: return graceful response
    return {
      error: 'Audio analysis not enabled',
      category: 'audio',
      keywords: [],
      confidence: 0,
      has_transcription: false,
      suggestedName: path.basename(filePath, ext),
    };
  } catch (error) {
    return {
      error: error.message,
      category: 'audio',
      keywords: [],
      confidence: 0,
      has_transcription: false,
      suggestedName: path.basename(filePath),
    };
  }
}

module.exports = { analyzeAudioFile };
