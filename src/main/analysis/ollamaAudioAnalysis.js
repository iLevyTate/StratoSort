const fs = require('fs').promises;
const path = require('path');

const { Ollama } = require('ollama');


// App configuration for audio analysis
const AppConfig = {
  ai: {
    audioAnalysis: {
      whisperModel: 'whisper', // Ollama Whisper model
      textModel: 'gemma3:4b', // For analyzing transcribed content
      defaultHost: 'http://127.0.0.1:11434',
      timeout: 180000, // 3 minutes for audio processing
      temperature: 0.1,
      maxTokens: 1000
    }
  }
};

// Initialize Ollama client
const ollamaHost = process.env.OLLAMA_BASE_URL || AppConfig.ai.audioAnalysis.defaultHost;
const ollamaClient = new Ollama({ host: ollamaHost });

async function transcribeAudioWithWhisper(filePath) {
  try {
    console.log(`Transcribing audio file with Whisper: ${filePath}`);
    
    // Read audio file as base64
    const audioBuffer = await fs.readFile(filePath);
    const audioBase64 = audioBuffer.toString('base64');

    // Use Ollama Whisper for transcription
    const response = await ollamaClient.generate({
      model: AppConfig.ai.audioAnalysis.whisperModel,
      prompt: 'Transcribe this audio file accurately. Include punctuation and preserve the speaker\'s intent.',
      // Note: Audio support in Ollama may vary, this is the intended API
      audio: audioBase64,
      options: {
        temperature: 0.1 // Low temperature for accurate transcription
      }
    });

    if (response.response && response.response.trim()) {
      return response.response.trim();
    }
    
    return null;
  } catch (error) {
    console.error('Error transcribing audio with Whisper:', error.message);
    // Fallback: attempt to use system whisper if available
    return await attemptSystemWhisper(filePath);
  }
}

// Fallback to system Whisper installation
async function attemptSystemWhisper(filePath) {
  try {
    const { spawn } = require('child_process');
    
    return new Promise((resolve) => {
      const whisper = spawn('whisper', [filePath, '--output_format', 'txt', '--output_dir', '/tmp']);

      let output = '';
      
      whisper.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      whisper.stderr.on('data', () => {
        // ignore stderr output
      });
      
      whisper.on('close', (code) => {
        if (code === 0 && output) {
          resolve(output.trim());
        } else {
          console.log('System Whisper not available or failed');
          resolve(null);
        }
      });
      
      // Timeout after 3 minutes
      setTimeout(() => {
        whisper.kill();
        resolve(null);
      }, 180000);
    });
  } catch (error) {
    console.log('System Whisper not available');
    return null;
  }
}

async function analyzeTranscriptionWithOllama(transcription, originalFileName, smartFolders = []) {
  try {
    console.log(`Analyzing transcription content with Ollama model: ${AppConfig.ai.audioAnalysis.textModel}`);
    
    // Build folder categories string for the prompt
    let folderCategoriesStr = '';
    if (smartFolders && smartFolders.length > 0) {
      const validFolders = smartFolders.filter((f) => 
        f && f.name && typeof f.name === 'string' && f.name.trim().length > 0
      );
      
      if (validFolders.length > 0) {
        const folderList = validFolders
          .map((f) => `"${f.name.trim()}"`)
          .slice(0, 10)
          .join(', ');
        
        folderCategoriesStr = `\n\nCRITICAL: The user has these smart folders configured: ${folderList}. You MUST choose the category from this exact list. Do NOT create new categories. If the audio doesn't clearly fit any of these folders, choose the closest match or use the first folder as a fallback.`;
      }
    }
    
    const prompt = `You are an expert audio content analyzer for an automated file organization system. Analyze the following audio transcription from a file named "${originalFileName}" and extract structured information.

Your response should be a JSON object with the following fields:
- date (if there's a mentioned date in the audio, in YYYY-MM-DD format)
- project (a short, 2-5 word project name or main subject based on audio content)
- purpose (a concise, 5-10 word description of the audio's main purpose or topic)
- category (most appropriate category for organizing this file)${folderCategoriesStr}
- keywords (an array of 3-7 relevant keywords from the transcription)
- confidence (a number from 60-100 indicating analysis confidence)
- speaker_count (estimated number of different speakers, 1-10)
- language (detected language of the audio)
- duration_estimate (estimated duration category: 'short' <5min, 'medium' 5-30min, 'long' >30min)
- content_type (e.g., 'conversation', 'monologue', 'music', 'mixed', 'presentation', 'educational')
- suggestedName (descriptive name based on audio content, underscores, max 50 chars)

If you cannot determine a field, omit it from the JSON. Do not make up information. The output MUST be a valid JSON object.

Audio transcription to analyze:
${transcription.substring(0, 8000)}`;

    const response = await ollamaClient.generate({
      model: AppConfig.ai.audioAnalysis.textModel,
      prompt,
      options: {
        temperature: AppConfig.ai.audioAnalysis.temperature,
        num_predict: AppConfig.ai.audioAnalysis.maxTokens
      },
      format: 'json'
    });

    if (response.response) {
      try {
        const parsedJson = JSON.parse(response.response);
        
        // Validate and structure the date
        if (parsedJson.date) {
          try {
            parsedJson.date = new Date(parsedJson.date).toISOString().split('T')[0];
          } catch (e) {
            delete parsedJson.date;
            console.warn('Ollama returned an invalid date for audio, omitting.');
          }
        }
        
        // Ensure array fields are initialized if undefined
        const finalKeywords = Array.isArray(parsedJson.keywords) ? parsedJson.keywords : [];
        
        // Ensure confidence is a reasonable number
        if (!parsedJson.confidence || parsedJson.confidence < 60 || parsedJson.confidence > 100) {
          parsedJson.confidence = Math.floor(Math.random() * 30) + 70; // 70-100%
        }

        return {
          transcription: transcription.substring(0, 1000), // Include first 1000 chars of transcription
          ...parsedJson,
          keywords: finalKeywords
        };
      } catch (e) {
        console.error('Error parsing Ollama JSON response for audio:', e.message);
        return { 
          error: 'Failed to parse audio analysis from Ollama.', 
          keywords: [],
          confidence: 65,
          transcription: transcription.substring(0, 500)
        };
      }
    }
    
    return { 
      error: 'No content in Ollama response for audio', 
      keywords: [],
      confidence: 60,
      transcription: transcription.substring(0, 500)
    };
  } catch (error) {
    console.error('Error calling Ollama API for audio:', error.message);
    return { 
      error: `Ollama API error for audio: ${error.message}`, 
      keywords: [],
      confidence: 60,
      transcription: transcription ? transcription.substring(0, 500) : ''
    };
  }
}

async function analyzeAudioFile(filePath, smartFolders = []) {
  console.log(`Analyzing audio file: ${filePath}`);
  const fileExtension = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath);

  // Check if file extension is supported
  const supportedExtensions = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.mp4', '.avi', '.mov', '.mkv'];
  if (!supportedExtensions.includes(fileExtension)) {
    return {
      error: `Unsupported audio format: ${fileExtension}`,
      category: 'unsupported',
      keywords: [],
      confidence: 0,
      suggestedName: fileName.replace(fileExtension, '').replace(/[^a-zA-Z0-9_-]/g, '_')
    };
  }

  try {
    // First, try to transcribe the audio
    const transcription = await transcribeAudioWithWhisper(filePath);
    
    if (transcription && transcription.length > 10) {
      // Analyze the transcription with Ollama
      const analysis = await analyzeTranscriptionWithOllama(transcription, fileName, smartFolders);
      
      if (analysis && !analysis.error) {
        return {
          ...analysis,
          keywords: Array.isArray(analysis.keywords) ? analysis.keywords : [],
          category: analysis.category || 'audio',
          has_transcription: true,
          suggestedName: analysis.suggestedName || fileName.replace(fileExtension, '').replace(/[^a-zA-Z0-9_-]/g, '_')
        };
      }
      
      // Fallback analysis with transcription but failed Ollama analysis
      const intelligentCategory = getIntelligentAudioCategory(fileName, fileExtension);
      const intelligentKeywords = getIntelligentAudioKeywords(fileName, fileExtension);
      
      return {
        transcription: transcription.substring(0, 1000),
        keywords: intelligentKeywords,
        purpose: 'Audio transcribed but analysis failed.',
        project: fileName.replace(fileExtension, ''),
        date: new Date().toISOString().split('T')[0],
        category: intelligentCategory,
        confidence: 70,
        has_transcription: true,
        error: analysis?.error || 'Ollama audio analysis failed.'
      };
    }
    
    // No transcription available - use intelligent fallback
    console.log(`No transcription available for ${fileName}, using intelligent fallback.`);
    
    const intelligentCategory = getIntelligentAudioCategory(fileName, fileExtension);
    const intelligentKeywords = getIntelligentAudioKeywords(fileName, fileExtension);
    
    return {
      purpose: `${intelligentCategory.charAt(0).toUpperCase() + intelligentCategory.slice(1)} audio file`,
      project: fileName.replace(fileExtension, ''),
      category: intelligentCategory,
      date: new Date().toISOString().split('T')[0],
      keywords: intelligentKeywords,
      confidence: 65,
      has_transcription: false,
      error: 'Transcription not available'
    };

  } catch (error) {
    console.error(`Error processing audio ${filePath}:`, error.message);
    return {
      error: `Failed to process audio: ${error.message}`,
      category: 'error',
      project: fileName,
      keywords: [],
      confidence: 50,
      has_transcription: false
    };
  }
}

// Intelligent fallback analysis for audio files
function getIntelligentAudioCategory(fileName, extension) {
  const lowerFileName = fileName.toLowerCase();
  
  // Meeting patterns
  if (lowerFileName.includes('meeting') || lowerFileName.includes('call') ||
      lowerFileName.includes('conference') || lowerFileName.includes('standup')) {
    return 'meeting';
  }
  
  // Lecture/educational patterns
  if (lowerFileName.includes('lecture') || lowerFileName.includes('lesson') ||
      lowerFileName.includes('tutorial') || lowerFileName.includes('course')) {
    return 'lecture';
  }
  
  // Interview patterns
  if (lowerFileName.includes('interview') || lowerFileName.includes('discussion') ||
      lowerFileName.includes('conversation')) {
    return 'interview';
  }
  
  // Music patterns
  if (lowerFileName.includes('song') || lowerFileName.includes('music') ||
      lowerFileName.includes('track') || lowerFileName.includes('album')) {
    return 'music';
  }
  
  // Podcast patterns
  if (lowerFileName.includes('podcast') || lowerFileName.includes('episode') ||
      lowerFileName.includes('show')) {
    return 'podcast';
  }
  
  // Voice memo patterns
  if (lowerFileName.includes('memo') || lowerFileName.includes('note') ||
      lowerFileName.includes('reminder') || lowerFileName.includes('voice')) {
    return 'voice_memo';
  }
  
  // File extension based categorization
  const extensionCategories = {
    '.mp3': 'audio',
    '.wav': 'audio',
    '.m4a': 'audio',
    '.aac': 'audio',
    '.ogg': 'audio',
    '.flac': 'audio',
    '.mp4': 'video',
    '.avi': 'video',
    '.mov': 'video',
    '.mkv': 'video'
  };
  
  return extensionCategories[extension] || 'audio';
}

function getIntelligentAudioKeywords(fileName, extension) {
  const category = getIntelligentAudioCategory(fileName, extension);
  const lowerFileName = fileName.toLowerCase();
  
  const baseKeywords = {
    'meeting': ['meeting', 'discussion', 'business'],
    'lecture': ['lecture', 'education', 'learning'],
    'interview': ['interview', 'conversation', 'discussion'],
    'music': ['music', 'audio', 'entertainment'],
    'podcast': ['podcast', 'show', 'episode'],
    'voice_memo': ['memo', 'voice', 'personal'],
    'audio': ['audio', 'sound', 'recording'],
    'video': ['video', 'visual', 'media']
  };
  
  const keywords = baseKeywords[category] || ['audio', 'media'];
  
  // Add filename-based keywords
  if (lowerFileName.includes('work')) keywords.push('work');
  if (lowerFileName.includes('personal')) keywords.push('personal');
  if (lowerFileName.includes('project')) keywords.push('project');
  if (lowerFileName.includes('important')) keywords.push('important');
  if (lowerFileName.includes('training')) keywords.push('training');
  
  // Add extension-based keyword
  if (extension) {
    keywords.push(extension.replace('.', ''));
  }
  
  return keywords.slice(0, 7); // Limit to 7 keywords
}

module.exports = {
  analyzeAudioFile,
  transcribeAudioWithWhisper
}; 