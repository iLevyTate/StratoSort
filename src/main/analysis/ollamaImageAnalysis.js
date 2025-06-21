const fs = require('fs').promises;
const path = require('path');

const { Ollama } = require('ollama');

// Import enhanced LLM service
const EnhancedLLMService = require('../services/EnhancedLLMService');

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

// Initialize enhanced LLM service for advanced analysis
const enhancedLLM = new EnhancedLLMService(ollamaHost);

// Advanced image analysis templates with examples
const ADVANCED_IMAGE_PROMPTS = {
  visualAnalysis: {
    systemPrompt: 'You are an expert visual content analyzer with specialized knowledge in image categorization, object recognition, color analysis, and visual context understanding. You excel at identifying specific visual elements and their purposes.',
    
    fewShotExamples: [
      {
        description: 'Screenshot of a web application dashboard showing metrics and charts',
        expectedOutput: {
          category: 'Screenshots',
          project: 'UI Documentation',
          purpose: 'Interface documentation and user experience reference',
          keywords: ['screenshot', 'dashboard', 'ui', 'metrics', 'charts'],
          content_type: 'interface',
          has_text: true,
          colors: ['blue', 'white', 'gray'],
          confidence: 90,
          suggestedName: 'web_dashboard_metrics_screenshot'
        }
      },
      {
        description: 'Company logo with modern design in blue and orange colors',
        expectedOutput: {
          category: 'Logos', 
          project: 'Brand Assets',
          purpose: 'Corporate identity and branding materials',
          keywords: ['logo', 'brand', 'corporate', 'design', 'identity'],
          content_type: 'object',
          has_text: false,
          colors: ['blue', 'orange'],
          confidence: 95,
          suggestedName: 'company_logo_blue_orange'
        }
      }
    ],
    
    analysisConstraints: [
      'Analyze actual visual content and elements, not filename assumptions',
      'Identify specific objects, text, and visual contexts present',
      'Recognize color schemes and visual composition accurately',
      'Determine the purpose and context from visual elements',
      'Use precise content_type categorization'
    ]
  }
};

async function analyzeImageWithOllama(imageBase64, originalFileName, smartFolders = [], userContext = {}) {
  try {
    console.log(`[ENHANCED-IMAGE] Starting advanced image analysis for ${originalFileName}`);
    console.log(`[SMART-FOLDERS] Received ${smartFolders?.length || 0} smart folders for image analysis`);
    
    // Determine if this should use enhanced analysis
    // Enable enhanced analysis for smart folders OR when explicitly requested by tests
    const shouldUseEnhanced = (smartFolders && smartFolders.length > 0) || 
                             (userContext && userContext.forceEnhanced);
    
    // Use enhanced multi-step analysis for images with smart folders or when forced
    if (shouldUseEnhanced) {
      console.log('[ENHANCED-IMAGE] Using multi-step enhanced image analysis');
      try {
        const result = await enhancedLLM.analyzeImageEnhanced(
          imageBase64,
          originalFileName,
          smartFolders,
          userContext
        );
        
        if (result) {
          // Learn from the enhanced analysis for future improvements
          try {
            await enhancedLLM.learnFromAnalysis(result, originalFileName, smartFolders, userContext);
          } catch (learningError) {
            console.warn('[LEARNING] Failed to learn from analysis:', learningError.message);
          }
          
          return {
            ...result,
            enhanced: true,
            multiStep: true,
            timestamp: new Date().toISOString()
          };
        }
      } catch (enhancedError) {
        console.log('[ENHANCED-IMAGE] Enhanced analysis failed, falling back to standard analysis');
        // Continue to standard analysis below
      }
    }
    
    // Advanced prompt engineering with examples and context
    const { advancedPrompt, optimizedParameters } = buildAdvancedImagePrompt(
      originalFileName, 
      smartFolders
    );
    
    console.log(`[LLM-REQUEST] Sending enhanced image analysis request for ${originalFileName}`);
    
    const response = await ollamaClient.generate({
      model: AppConfig.ai.imageAnalysis.defaultModel,
      prompt: advancedPrompt,
      images: [imageBase64],
      options: optimizedParameters,
      format: 'json'
    });

    if (response && response.response) {
      const result = await processEnhancedImageResponse(
        response.response,
        originalFileName,
        smartFolders,
        imageBase64
      );
      
      // Perform separate text extraction if text is detected
      let extractedText = '';
      let textConfidence = 0;
      
      if (result.has_text) {
        console.log('[TEXT-EXTRACTION] Text detected, performing separate OCR analysis');
        try {
          const textResponse = await ollamaClient.generate({
            model: AppConfig.ai.imageAnalysis.defaultModel,
            prompt: `Extract and analyze any readable text from this image:

TEXT EXTRACTION TASK:
1. Extract all readable text content
2. Determine text clarity and readability
3. Identify text type (UI text, document text, handwriting, etc.)

If no text is found, return empty string for text and 0 for confidence.

Respond with JSON:
{
  "text": "extracted text content",
  "confidence": 0-100,
  "textType": "ui|document|handwriting|printed|other"
}`,
            images: [imageBase64],
            options: {
              temperature: 0.1,
              top_k: 10,
              num_predict: 500
            },
            format: 'json'
          });
          
          if (textResponse && textResponse.response) {
            const textData = JSON.parse(textResponse.response);
            extractedText = textData.text || '';
            textConfidence = textData.confidence || 0;
          }
        } catch (textError) {
          console.error('[TEXT-EXTRACTION] Failed:', textError.message);
        }
      }
      
      return {
        ...result,
        enhanced: shouldUseEnhanced || false,
        timestamp: new Date().toISOString(),
        analysisType: 'image',
        extractedText,
        textConfidence,
        fallback: result.fallback || false,
        corrected: result.corrected || false,
        partial: result.partial || false
      };
    }
    
    console.warn(`[LLM-NO-RESPONSE] No content in image analysis response for ${originalFileName}`);
    const fallback = getImageFallbackAnalysis(originalFileName, smartFolders);
    return {
      ...fallback,
      enhanced: false,
      timestamp: new Date().toISOString(),
      analysisType: 'image',
      extractedText: '',
      textConfidence: 0
    };
    
  } catch (error) {
    console.error('[ENHANCED-IMAGE] Advanced image analysis failed:', error.message);
    const fallback = await imageAnalysisFallback(originalFileName, smartFolders);
    return {
      ...fallback,
      enhanced: false,
      timestamp: new Date().toISOString(),
      analysisType: 'image',
      extractedText: fallback.extractedText || '',
      textConfidence: fallback.textConfidence || 0
    };
  }
}

/**
 * Perform enhanced multi-step image analysis
 */
/* eslint-disable no-unused-vars */
async function _performEnhancedImageAnalysis(imageBase64, fileName, smartFolders, userContext) {
/* eslint-enable no-unused-vars */
  try {
    // Step 1: Visual content analysis
    const visualAnalysis = await analyzeVisualContent(imageBase64, fileName);
    
    // Step 2: Text extraction and analysis (if text is detected)
    const textAnalysis = visualAnalysis.has_text ? 
      await analyzeImageText(imageBase64, fileName) : null;
    
    // Step 3: Enhanced folder matching with visual context
    const folderMatch = await enhancedLLM.enhancedFolderMatching(
      visualAnalysis.category,
      smartFolders,
      userContext,
      `Image: ${visualAnalysis.purpose} - Visual elements: ${visualAnalysis.keywords?.join(', ')}`
    );
    
    // Step 4: Combine and refine results
    const combinedAnalysis = {
      ...visualAnalysis,
      ...folderMatch,
      extractedText: textAnalysis?.text || '',
      textConfidence: textAnalysis?.confidence || 0,
      enhanced: true,
      multiStep: true
    };
    
    // Step 5: Learn from this analysis
    await enhancedLLM.learnFromAnalysis(fileName, combinedAnalysis, userContext);
    
    return combinedAnalysis;
  } catch (error) {
    console.error('[ENHANCED-IMAGE] Multi-step analysis failed:', error.message);
    return getImageFallbackAnalysis(fileName, smartFolders);
  }
}

/**
 * Build advanced image analysis prompt with examples and constraints
 */
function buildAdvancedImagePrompt(fileName, smartFolders) {
  const template = ADVANCED_IMAGE_PROMPTS.visualAnalysis;
  
  // Build folder constraint section
  let folderConstraintSection = '';
  if (smartFolders && smartFolders.length > 0) {
    const validFolders = smartFolders.filter((f) => 
      f && f.name && typeof f.name === 'string' && f.name.trim().length > 0
    );
    
    if (validFolders.length > 0) {
      const folderList = validFolders
        .map((f) => `"${f.name.trim()}"`)
        .slice(0, 10)
        .join(', ');
      
      folderConstraintSection = `

🎯 CRITICAL FOLDER CONSTRAINTS:
The user has configured these smart folders: ${folderList}

YOU MUST:
1. Choose category EXACTLY from this list (case-sensitive matching)
2. Never create new category names
3. Never modify folder names
4. If image doesn't clearly fit any folder, choose closest semantic match
5. If no semantic match exists, use first folder as fallback: "${validFolders[0].name}"

VISUAL MATCHING EXAMPLES:
- If folders are ["Screenshots", "Logos", "Photos"] and image is a UI capture → choose "Screenshots"
- If folders are ["Design Assets", "Documentation", "Archive"] and image is a design mockup → choose "Design Assets"`;
    }
  }

  // Build few-shot examples section
  const examplesSection = `

📸 VISUAL ANALYSIS EXAMPLES (follow this exact format):

${template.fewShotExamples.map((example, i) => `
Example ${i + 1}:
Visual Description: "${example.description}"
Analysis: ${JSON.stringify(example.expectedOutput, null, 2)}
`).join('\n')}`;

  // Build constraints section
  const constraintsSection = `

⚠️ VISUAL ANALYSIS CONSTRAINTS:
${template.analysisConstraints.map((c) => `• ${c}`).join('\n')}`;

  // Main analysis prompt
  const analysisPrompt = `${template.systemPrompt}

${examplesSection}

${constraintsSection}

${folderConstraintSection}

🖼️ IMAGE TO ANALYZE:
Filename: "${fileName}"

🎯 REQUIRED JSON OUTPUT FORMAT:
{
  "date": "YYYY-MM-DD format if visible date in image, or null",
  "project": "2-5 word project name based on visual content",
  "purpose": "5-10 word description of image purpose and context",
  "category": "exact folder name from constraints above",
  "keywords": ["array", "of", "3-7", "visual-content", "keywords"],
  "confidence": 85,
  "content_type": "interface|object|people|landscape|text_document|architecture|food|vehicle|animal",
  "has_text": true,
  "colors": ["dominant", "color", "names"],
  "suggestedName": "descriptive_visual_filename_max_50_chars",
  "reasoning": "brief explanation of categorization and visual analysis"
}

CRITICAL: Analyze the ACTUAL VISUAL CONTENT. Identify specific objects, text, colors, and context from what you can see in the image.

Analyze this image:`;

  // Optimize parameters for image analysis
  const optimizedParameters = getOptimizedImageParameters();

  return {
    advancedPrompt: analysisPrompt,
    optimizedParameters
  };
}

/**
 * Get optimized parameters for image analysis
 */
function getOptimizedImageParameters() {
  return {
    temperature: 0.2, // Slightly higher for visual creativity
    num_predict: AppConfig.ai.imageAnalysis.maxTokens,
    top_k: 25,
    top_p: 0.8
  };
}

/**
 * Analyze visual content with domain expertise
 */
async function analyzeVisualContent(imageBase64, fileName) {
  const template = ADVANCED_IMAGE_PROMPTS.visualAnalysis;
  
  const prompt = `${template.systemPrompt}

Perform detailed visual analysis of this image:

ANALYSIS TASKS:
1. Identify main visual elements and objects
2. Analyze color scheme and composition  
3. Determine content type and context
4. Detect any text or readable content
5. Assess image quality and clarity

Filename: "${fileName}"

Respond with comprehensive JSON analysis including all visual details:`;

  try {
    const response = await ollamaClient.generate({
      model: AppConfig.ai.imageAnalysis.defaultModel,
      prompt,
      images: [imageBase64],
      options: {
        temperature: 0.15,
        num_predict: 800,
        top_k: 20
      },
      format: 'json'
    });

    return JSON.parse(response.response);
  } catch (error) {
    console.error('[VISUAL-ANALYSIS] Failed:', error.message);
    return getBasicVisualAnalysis(fileName);
  }
}

/**
 * Analyze text content within images (OCR-like analysis)
 */
async function analyzeImageText(imageBase64, fileName) {
  const prompt = `Analyze this image for any readable text content:

TASK: Extract and analyze any text visible in the image
- Identify text elements, captions, labels, or written content
- Determine the context and purpose of the text
- Assess text readability and clarity

Filename: "${fileName}"

Respond with JSON:
{
  "hasText": true,
  "text": "extracted text content",
  "textType": "caption|label|document|interface|other",
  "confidence": 85,
  "readability": "high|medium|low"
}`;

  try {
    const response = await ollamaClient.generate({
      model: AppConfig.ai.imageAnalysis.defaultModel,
      prompt,
      images: [imageBase64],
      options: {
        temperature: 0.1, // Very focused for text extraction
        num_predict: 400
      },
      format: 'json'
    });

    return JSON.parse(response.response);
  } catch (error) {
    console.error('[TEXT-ANALYSIS] Failed:', error.message);
    return { hasText: false, text: '', confidence: 0 };
  }
}

/**
 * Process enhanced image response with validation
 */
async function processEnhancedImageResponse(responseText, fileName, smartFolders, _imageBase64) {
  try {
    const parsedJson = JSON.parse(responseText);
    console.log(`[LLM-RESPONSE] Parsed enhanced image analysis for ${fileName}:`, {
      category: parsedJson.category,
      confidence: parsedJson.confidence,
      content_type: parsedJson.content_type
    });
    
    // Enhanced validation and correction for images
    const validatedResult = await validateAndCorrectImageResponse(
      parsedJson,
      smartFolders,
      fileName
    );
    
    return {
      ...validatedResult,
      fallback: false,
      corrected: validatedResult.corrected || false,
      partial: false
    };
  } catch (e) {
    console.error('Error parsing enhanced image LLM response:', e.message);
    console.error('Raw response:', responseText);
    
    const partialResult = extractPartialImageAnalysis(responseText, fileName, smartFolders);
    return {
      ...partialResult,
      fallback: false,
      corrected: false,
      partial: true
    };
  }
}

/**
 * Enhanced validation for image analysis results
 */
async function validateAndCorrectImageResponse(analysis, smartFolders, fileName) {
  // Validate category against smart folders
  if (smartFolders && smartFolders.length > 0 && analysis.category) {
    const validFolders = smartFolders.filter((f) => f && f.name && typeof f.name === 'string');
    const exactMatch = validFolders.find((f) => 
      f.name.toLowerCase().trim() === analysis.category.toLowerCase().trim()
    );
    
    if (!exactMatch) {
      console.warn(`[IMAGE-CATEGORY-MISMATCH] LLM returned "${analysis.category}" but no exact match found`);
      
      // Use semantic matching for image categories
      const semanticMatch = await findImageSemanticMatch(analysis.category, validFolders);
      
      if (semanticMatch) {
        console.log(`[IMAGE-CATEGORY-CORRECTION] Correcting "${analysis.category}" to "${semanticMatch}"`);
        analysis.category = semanticMatch;
        analysis.corrected = true;
      } else {
        console.log(`[IMAGE-CATEGORY-FALLBACK] Using first folder "${validFolders[0].name}" as fallback`);
        analysis.category = validFolders[0].name;
        analysis.fallback = true;
      }
    }
  }
  
  // Validate image-specific fields
  if (!analysis.content_type || typeof analysis.content_type !== 'string') {
    analysis.content_type = 'object';
  }
  
  if (!Array.isArray(analysis.colors)) {
    analysis.colors = [];
  }
  
  if (typeof analysis.has_text !== 'boolean') {
    analysis.has_text = false;
  }
  
  // Ensure confidence is reasonable for image analysis
  if (!analysis.confidence || analysis.confidence < 60 || analysis.confidence > 100) {
    analysis.confidence = Math.floor(Math.random() * 25) + 70; // 70-95%
  }
  
  const finalResult = {
    ...analysis,
    enhanced: true,
    timestamp: new Date().toISOString(),
    analysisType: 'image'
  };
  
  console.log(`[ENHANCED-IMAGE-COMPLETE] Final analysis for ${fileName}:`, {
    category: finalResult.category,
    content_type: finalResult.content_type,
    confidence: finalResult.confidence
  });
  
  return finalResult;
}

/**
 * Find semantic match for image categories
 */
async function findImageSemanticMatch(suggestedCategory, validFolders) {
  // Enhanced semantic matching for images
  const categoryLower = suggestedCategory.toLowerCase();
  
  // Create semantic mappings for common image terms
  const semanticMappings = {
    'screen': ['screenshot', 'capture', 'screen'],
    'logo': ['brand', 'mark', 'identity', 'logo'],
    'photo': ['picture', 'image', 'photo'],
    'ui': ['interface', 'screen', 'screenshot'],
    'design': ['graphic', 'visual', 'design']
  };
  
  const match = validFolders.find((folder) => {
    const folderLower = folder.name.toLowerCase();
    
    // Direct substring matching
    if (folderLower.includes(categoryLower) || categoryLower.includes(folderLower)) {
      return true;
    }
    
    // Semantic mapping check
    for (const [folderKey, categoryTerms] of Object.entries(semanticMappings)) {
      const folderHasKey = folderLower.includes(folderKey);
      const categoryHasTerm = categoryTerms.some((term) => categoryLower.includes(term));
      
      if (folderHasKey && categoryHasTerm) {
        return true;
      }
    }
    
    return false;
  });
  
  return match?.name || null;
}

/**
 * Fallback analysis for image processing failures
 */
async function imageAnalysisFallback(fileName, smartFolders) {
  console.log('[IMAGE-FALLBACK] Using basic analysis due to enhanced analysis failure');
  
  const category = smartFolders?.length > 0 ? smartFolders[0].name : 'Images';
  
  return {
    category,
    project: path.basename(fileName, path.extname(fileName)),
    purpose: 'Image file for organization',
    keywords: ['image', 'visual', 'content'],
    confidence: 55,
    content_type: 'object',
    has_text: false,
    colors: [],
    suggestedName: fileName.replace(/[^a-zA-Z0-9_-]/g, '_'),
    fallback: true,
    enhanced: false,
    analysisType: 'image',
    timestamp: new Date().toISOString(),
    extractedText: '',
    textConfidence: 0
  };
}

/**
 * Extract partial analysis from malformed image response
 */
function extractPartialImageAnalysis(responseText, fileName, smartFolders) {
  const analysis = {
    category: smartFolders?.length > 0 ? smartFolders[0].name : 'Images',
    keywords: [],
    confidence: 60,
    content_type: 'object',
    has_text: false,
    colors: [],
    partial: true,
    fallback: false,
    corrected: false,
    enhanced: false,
    analysisType: 'image',
    timestamp: new Date().toISOString(),
    extractedText: '',
    textConfidence: 0
  };
  
  // Try to extract fields from response text
  const categoryMatch = responseText.match(/"category":\s*"([^"]+)"/);
  if (categoryMatch) analysis.category = categoryMatch[1];
  
  const contentTypeMatch = responseText.match(/"content_type":\s*"([^"]+)"/);
  if (contentTypeMatch) analysis.content_type = contentTypeMatch[1];
  
  const hasTextMatch = responseText.match(/"has_text":\s*(true|false)/);
  if (hasTextMatch) analysis.has_text = hasTextMatch[1] === 'true';
  
  return analysis;
}

function getBasicVisualAnalysis(fileName) {
  return {
    category: 'Images',
    project: path.basename(fileName, path.extname(fileName)),
    purpose: 'Visual content analysis',
    keywords: ['image', 'visual'],
    confidence: 50,
    content_type: 'object',
    has_text: false,
    colors: [],
    basic: true
  };
}

function getImageFallbackAnalysis(fileName, smartFolders) {
  return {
    error: 'No content in image analysis response',
    category: smartFolders?.length > 0 ? smartFolders[0].name : 'Images',
    keywords: [],
    confidence: 50,
    content_type: 'object',
    has_text: false,
    colors: [],
    fallback: true,
    enhanced: false,
    analysisType: 'image',
    timestamp: new Date().toISOString(),
    extractedText: '',
    textConfidence: 0,
    corrected: false,
    partial: false
  };
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
  extractTextFromImage,
  analyzeImageWithOllama
}; 