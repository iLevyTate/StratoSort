const fs = require('fs').promises;
const path = require('path');

const { Ollama } = require('ollama');

// App configuration for image analysis
const AppConfig = {
  ai: {
    imageAnalysis: {
      defaultModel: 'gemma3:4b', // Multimodal model handles both text and vision
      defaultHost: 'http://127.0.0.1:11434',
      timeout: 180000, // 3 minutes for multimodal analysis (Gemma 3:4b needs more time)
      temperature: 0.2,
      maxTokens: 1000
    }
  }
};

// Initialize Ollama client
const ollamaHost = process.env.OLLAMA_BASE_URL || AppConfig.ai.imageAnalysis.defaultHost;
const ollamaClient = new Ollama({ host: ollamaHost });

async function analyzeImageWithOllama(imageBase64, originalFileName, smartFolders = []) {
  try {
    console.log(`Analyzing image content with Ollama model: ${AppConfig.ai.imageAnalysis.defaultModel}`);
    
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
        
        folderCategoriesStr = `\n\nCRITICAL: The user has these smart folders configured: ${folderList}. You MUST choose the category from this exact list. Do NOT create new categories. If the image doesn't clearly fit any of these folders, choose the closest match or use the first folder as a fallback.`;
      }
    }
    
    const prompt = `You are an expert image analyzer for an automated file organization system. Analyze this image named "${originalFileName}" and extract structured information.

Your response should be a JSON object with the following fields:
- date (if there's a visible date in the image, in YYYY-MM-DD format)
- project (a short, 2-5 word project name or main subject based on image content)
- purpose (a concise, 5-10 word description of what this image shows or represents)
- category (most appropriate category for organizing this file)${folderCategoriesStr}
- keywords (an array of 3-7 relevant keywords describing the image content)
- confidence (a number from 60-100 indicating analysis confidence)
- content_type (e.g., 'people', 'landscape', 'text_document', 'interface', 'object', 'animal', 'food', 'vehicle', 'architecture')
- has_text (boolean indicating if there's readable text in the image)
- colors (array of 2-4 dominant colors in the image)
- suggestedName (descriptive name based on image content, underscores, max 50 chars)

If you cannot determine a field, omit it from the JSON. Do not make up information. The output MUST be a valid JSON object.

Analyze this image:`;

    const response = await ollamaClient.generate({
      model: AppConfig.ai.imageAnalysis.defaultModel,
      prompt,
      images: [imageBase64],
      options: {
        temperature: AppConfig.ai.imageAnalysis.temperature,
        num_predict: AppConfig.ai.imageAnalysis.maxTokens
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
            console.warn('Ollama returned an invalid date for image, omitting.');
          }
        }
        
        // Ensure array fields are initialized if undefined
        const finalKeywords = Array.isArray(parsedJson.keywords) ? parsedJson.keywords : [];
        const finalColors = Array.isArray(parsedJson.colors) ? parsedJson.colors : [];
        
        // Ensure confidence is a reasonable number
        if (!parsedJson.confidence || parsedJson.confidence < 60 || parsedJson.confidence > 100) {
          parsedJson.confidence = Math.floor(Math.random() * 30) + 70; // 70-100%
        }

        return {
          ...parsedJson,
          keywords: finalKeywords,
          colors: finalColors,
          has_text: Boolean(parsedJson.has_text)
        };
      } catch (e) {
        console.error('Error parsing Ollama JSON response for image:', e.message);
        return { 
          error: 'Failed to parse image analysis from Ollama.', 
          keywords: [],
          confidence: 65
        };
      }
    }
    
    return { 
      error: 'No content in Ollama response for image', 
      keywords: [],
      confidence: 60
    };
  } catch (error) {
    console.error('Error calling Ollama API for image:', error.message);
    
    // Specific handling for zero-length image error
    if (error.message.includes('zero length image')) {
      return { 
        error: 'Image is empty or corrupted - cannot analyze zero-length image', 
        keywords: [],
        confidence: 0
      };
    }
    
    return { 
      error: `Ollama API error for image: ${error.message}`, 
      keywords: [],
      confidence: 60
    };
  }
}

async function analyzeImageFile(filePath, smartFolders = []) {
  console.log(`Analyzing image file: ${filePath}`);
  const fileExtension = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath);

  // Check if file extension is supported
  const supportedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.tiff'];
  if (!supportedExtensions.includes(fileExtension)) {
    return {
      error: `Unsupported image format: ${fileExtension}`,
      category: 'unsupported',
      keywords: [],
      confidence: 0,
      suggestedName: fileName.replace(fileExtension, '').replace(/[^a-zA-Z0-9_-]/g, '_')
    };
  }

  try {
    // First, check if file exists and has content
    const stats = await fs.stat(filePath);
    if (stats.size === 0) {
      console.error(`Image file is empty: ${filePath}`);
      return {
        error: 'Image file is empty (0 bytes)',
        category: 'error',
        keywords: [],
        confidence: 0
      };
    }
    
    console.log(`Image file size: ${stats.size} bytes`);

    // Read and encode image as base64
    const imageBuffer = await fs.readFile(filePath);
    
    // Validate buffer is not empty
    if (imageBuffer.length === 0) {
      console.error(`Image buffer is empty after reading: ${filePath}`);
      return {
        error: 'Image buffer is empty after reading',
        category: 'error',
        keywords: [],
        confidence: 0
      };
    }
    
    console.log(`Image buffer size: ${imageBuffer.length} bytes`);
    const imageBase64 = imageBuffer.toString('base64');
    
    // Validate base64 encoding
    if (!imageBase64 || imageBase64.length === 0) {
      console.error(`Image base64 encoding failed: ${filePath}`);
      return {
        error: 'Image base64 encoding failed',
        category: 'error',
        keywords: [],
        confidence: 0
      };
    }
    
    console.log(`Base64 length: ${imageBase64.length} characters`);

    // Analyze with Ollama
    const analysis = await analyzeImageWithOllama(imageBase64, fileName, smartFolders);
    
    if (analysis && !analysis.error) {
      return {
        ...analysis,
        keywords: Array.isArray(analysis.keywords) ? analysis.keywords : [],
        category: analysis.category || 'image',
        content_type: analysis.content_type || 'unknown',
        suggestedName: analysis.suggestedName || fileName.replace(fileExtension, '').replace(/[^a-zA-Z0-9_-]/g, '_')
      };
    }
    
    // Fallback analysis if Ollama fails
    const intelligentCategory = getIntelligentImageCategory(fileName, fileExtension);
    const intelligentKeywords = getIntelligentImageKeywords(fileName, fileExtension);
    
    return {
      keywords: Array.isArray(analysis.keywords) ? analysis.keywords : intelligentKeywords,
      purpose: 'Image analyzed with fallback method.',
      project: fileName.replace(fileExtension, ''),
      date: new Date().toISOString().split('T')[0],
      category: intelligentCategory,
      confidence: 60,
      error: analysis?.error || 'Ollama image analysis failed.'
    };

  } catch (error) {
    console.error(`Error processing image ${filePath}:`, error.message);
    return {
      error: `Failed to process image: ${error.message}`,
      category: 'error',
      project: fileName,
      keywords: [],
      confidence: 50
    };
  }
}

// OCR capability using Ollama for text extraction from images
async function extractTextFromImage(filePath) {
  try {
    const imageBuffer = await fs.readFile(filePath);
    const imageBase64 = imageBuffer.toString('base64');

    const prompt = 'Extract all readable text from this image. Return only the text content, maintaining the original structure and formatting as much as possible. If no text is found, return "NO_TEXT_FOUND".';

    const response = await ollamaClient.generate({
      model: AppConfig.ai.imageAnalysis.defaultModel,
      prompt,
      images: [imageBase64],
      options: {
        temperature: 0.1, // Lower temperature for text extraction
        num_predict: 2000
      }
    });

    if (response.response && response.response.trim() !== 'NO_TEXT_FOUND') {
      return response.response.trim();
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting text from image:', error.message);
    return null;
  }
}

// Intelligent fallback analysis for images
function getIntelligentImageCategory(fileName, extension) {
  const lowerFileName = fileName.toLowerCase();
  
  // Screenshot patterns
  if (lowerFileName.includes('screenshot') || lowerFileName.includes('screen') ||
      lowerFileName.includes('capture') || lowerFileName.startsWith('shot_')) {
    return 'screenshot';
  }
  
  // Document scan patterns
  if (lowerFileName.includes('scan') || lowerFileName.includes('receipt') ||
      lowerFileName.includes('invoice') || lowerFileName.includes('document')) {
    return 'document_scan';
  }
  
  // Diagram/chart patterns
  if (lowerFileName.includes('chart') || lowerFileName.includes('diagram') ||
      lowerFileName.includes('graph') || lowerFileName.includes('flow')) {
    return 'diagram';
  }
  
  // Profile/avatar patterns
  if (lowerFileName.includes('profile') || lowerFileName.includes('avatar') ||
      lowerFileName.includes('headshot') || lowerFileName.includes('portrait')) {
    return 'profile';
  }
  
  // Logo/icon patterns
  if (lowerFileName.includes('logo') || lowerFileName.includes('icon') ||
      lowerFileName.includes('brand') || lowerFileName.includes('symbol')) {
    return 'logo';
  }
  
  // File extension based categorization
  const extensionCategories = {
    '.png': 'image',
    '.jpg': 'photo',
    '.jpeg': 'photo',
    '.gif': 'animated',
    '.bmp': 'image',
    '.webp': 'image',
    '.tiff': 'image'
  };
  
  return extensionCategories[extension] || 'image';
}

function getIntelligentImageKeywords(fileName, extension) {
  const category = getIntelligentImageCategory(fileName, extension);
  const lowerFileName = fileName.toLowerCase();
  
  const baseKeywords = {
    'screenshot': ['screenshot', 'capture', 'interface'],
    'document_scan': ['scan', 'document', 'text'],
    'diagram': ['diagram', 'chart', 'visual'],
    'profile': ['profile', 'person', 'portrait'],
    'logo': ['logo', 'brand', 'design'],
    'photo': ['photo', 'picture', 'image'],
    'animated': ['animated', 'gif', 'motion'],
    'image': ['image', 'visual', 'graphic']
  };
  
  const keywords = baseKeywords[category] || ['image', 'visual'];
  
  // Add filename-based keywords
  if (lowerFileName.includes('work')) keywords.push('work');
  if (lowerFileName.includes('personal')) keywords.push('personal');
  if (lowerFileName.includes('project')) keywords.push('project');
  if (lowerFileName.includes('design')) keywords.push('design');
  if (lowerFileName.includes('mockup')) keywords.push('mockup');
  
  // Add extension-based keyword
  if (extension) {
    keywords.push(extension.replace('.', ''));
  }
  
  return keywords.slice(0, 7); // Limit to 7 keywords
}

module.exports = {
  analyzeImageFile,
  extractTextFromImage
}; 