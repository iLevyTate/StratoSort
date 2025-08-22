const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const {
  categoryMappingService,
} = require('../../shared/categoryMappingService');
const {
  getOllamaVisionModel,
  loadOllamaConfig,
  getOllamaClient,
} = require('../ollamaUtils');
const {
  AI_DEFAULTS,
  SUPPORTED_IMAGE_EXTENSIONS,
} = require('../../shared/constants');
const {
  normalizeAnalysisResult,
  buildFolderCategoriesString,
} = require('./utils');
const {
  getIntelligentCategory: getIntelligentImageCategory,
  getIntelligentKeywords: getIntelligentImageKeywords,
  safeSuggestedName,
} = require('./fallbackUtils');
const {
  getInstance: getEmbeddingIndex,
} = require('../services/EmbeddingIndexService');
const FolderMatchingService = require('../services/FolderMatchingService');
let embeddingIndexSingleton = null;
let folderMatcherSingleton = null;

// In-memory cache for image analysis keyed by path|size|mtimeMs
const imageAnalysisCache = new Map();
const MAX_IMAGE_CACHE = 300;
function setImageCache(signature, value) {
  if (!signature) return;
  imageAnalysisCache.set(signature, value);
  if (imageAnalysisCache.size > MAX_IMAGE_CACHE) {
    const first = imageAnalysisCache.keys().next().value;
    imageAnalysisCache.delete(first);
  }
}

// App configuration for image analysis - Optimized for speed
const AppConfig = {
  ai: {
    imageAnalysis: {
      defaultModel: AI_DEFAULTS.IMAGE.MODEL,
      defaultHost: AI_DEFAULTS.IMAGE.HOST,
      timeout: 120000,
      temperature: AI_DEFAULTS.IMAGE.TEMPERATURE,
      maxTokens: AI_DEFAULTS.IMAGE.MAX_TOKENS,
    },
  },
};

// Initialize Ollama client
// Use shared client from ollamaUtils

async function analyzeImageWithOllama(
  imageBase64,
  originalFileName,
  smartFolders = [],
) {
  try {
    const { logger } = require('../../shared/logger');
    logger.info(`Analyzing image content with Ollama`, {
      model: AppConfig.ai.imageAnalysis.defaultModel,
    });

    // Build folder categories string for the prompt (include descriptions)
    const folderCategoriesStr = buildFolderCategoriesString(
      smartFolders,
      'IMAGE CONTENT',
    );

    const prompt = `You are an expert image analyzer for an automated file organization system. Analyze this image named "${originalFileName}" and extract structured information.

Your response should be a JSON object with the following fields:
- date (if there's a visible date in the image, in YYYY-MM-DD format)
- project (a short, 2-5 word project name or main subject based on image content)
- purpose (a concise, 5-10 word description of what this image shows or represents)
- category (most appropriate category for organizing this file; must be one of the folder names above)${folderCategoriesStr}
- keywords (an array of 3-7 relevant keywords describing the image content)
- confidence (a number from 60-100 indicating analysis confidence)
- content_type (e.g., 'people', 'landscape', 'text_document', 'interface', 'object', 'animal', 'food', 'vehicle', 'architecture')
- has_text (boolean indicating if there's readable text in the image)
- colors (array of 2-4 dominant colors in the image)
- suggestedName (descriptive name based on image content, underscores, max 50 chars)

If you cannot determine a field, omit it from the JSON. Do not make up information. The output MUST be a valid JSON object.

Analyze this image:`;

    const cfg = await loadOllamaConfig();
    const modelToUse =
      getOllamaVisionModel() ||
      cfg.selectedVisionModel ||
      AppConfig.ai.imageAnalysis.defaultModel;
    const client = await getOllamaClient();
    const response = await client.generate({
      model: modelToUse,
      prompt,
      images: [imageBase64],
      options: {
        temperature: AppConfig.ai.imageAnalysis.temperature,
        num_predict: AppConfig.ai.imageAnalysis.maxTokens,
      },
      format: 'json',
    });

    if (response.response) {
      try {
        const parsedJson = JSON.parse(response.response);

        // Validate and structure the date
        if (parsedJson.date) {
          try {
            parsedJson.date = new Date(parsedJson.date)
              .toISOString()
              .split('T')[0];
          } catch (e) {
            delete parsedJson.date;
            logger.warn('Ollama returned an invalid date for image, omitting.');
          }
        }

        // Ensure array fields are initialized if undefined
        const finalKeywords = Array.isArray(parsedJson.keywords)
          ? parsedJson.keywords
          : [];
        const finalColors = Array.isArray(parsedJson.colors)
          ? parsedJson.colors
          : [];

        // Ensure confidence is a reasonable number
        if (
          !parsedJson.confidence ||
          parsedJson.confidence < 60 ||
          parsedJson.confidence > 100
        ) {
          parsedJson.confidence = Math.floor(Math.random() * 30) + 70; // 70-100%
        }

        return {
          ...parsedJson,
          keywords: finalKeywords,
          colors: finalColors,
          has_text: Boolean(parsedJson.has_text),
        };
      } catch (e) {
        logger.error('Error parsing Ollama JSON response for image', {
          error: e.message,
        });
        return {
          error: 'Failed to parse image analysis from Ollama.',
          keywords: [],
          confidence: 65,
        };
      }
    }

    return {
      error: 'No content in Ollama response for image',
      keywords: [],
      confidence: 60,
    };
  } catch (error) {
    const { logger } = require('../../shared/logger');
    logger.error('Error calling Ollama API for image', {
      error: error.message,
    });

    // Specific handling for zero-length image error
    if (error.message.includes('zero length image')) {
      return {
        error: 'Image is empty or corrupted - cannot analyze zero-length image',
        keywords: [],
        confidence: 0,
      };
    }
    // Guidance for vision model input failures
    if (error.message.includes('unable to make llava embedding')) {
      return {
        error:
          'Unsupported image format or dimensions for vision model. Convert to PNG/JPG and keep under ~2048px on the longest side.',
        keywords: [],
        confidence: 0,
      };
    }

    return {
      error: `Ollama API error for image: ${error.message}`,
      keywords: [],
      confidence: 60,
    };
  }
}

async function analyzeImageFile(filePath, smartFolders = []) {
  const { logger } = require('../../shared/logger');
  logger.info(`Analyzing image file`, { path: filePath });
  const fileExtension = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath);

  // Check if file extension is supported (include SVG by rasterizing via sharp)
  const supportedExtensions = SUPPORTED_IMAGE_EXTENSIONS;
  if (!supportedExtensions.includes(fileExtension)) {
    return {
      error: `Unsupported image format: ${fileExtension}`,
      category: 'unsupported',
      keywords: [],
      confidence: 0,
      suggestedName: fileName
        .replace(fileExtension, '')
        .replace(/[^a-zA-Z0-9_-]/g, '_'),
    };
  }

  try {
    // First, check if file exists and has content
    const stats = await fs.stat(filePath);
    if (stats.size === 0) {
      logger.error(`Image file is empty`, { path: filePath });
      return {
        error: 'Image file is empty (0 bytes)',
        category: 'error',
        keywords: [],
        confidence: 0,
      };
    }

    logger.debug(`Image file size`, { bytes: stats.size });

    // Read and encode image as base64
    let imageBuffer = await fs.readFile(filePath);

    // Cache quick path: signature based on file stats
    const signature = `${filePath}|${stats.size}|${stats.mtimeMs}`;
    if (imageAnalysisCache.has(signature)) {
      return imageAnalysisCache.get(signature);
    }

    // Preprocess image for vision model compatibility
    // - Convert unsupported formats (svg, tiff, bmp, gif, webp) to PNG
    // - Downscale very large images to avoid model failures
    try {
      const needsFormatConversion = [
        '.svg',
        '.tiff',
        '.tif',
        '.bmp',
        '.gif',
        '.webp',
      ].includes(fileExtension);
      let transformer = null;

      let meta = null;
      try {
        meta = await sharp(imageBuffer).metadata();
      } catch {}

      const maxDimension = 1536; // smaller to speed up vision model
      const shouldResize =
        meta &&
        (Number(meta.width) > maxDimension ||
          Number(meta.height) > maxDimension);

      if (needsFormatConversion || shouldResize) {
        transformer = sharp(imageBuffer);
        if (shouldResize) {
          const resizeOptions = { fit: 'inside', withoutEnlargement: true };
          if (meta && meta.width && meta.height) {
            if (meta.width >= meta.height) resizeOptions.width = maxDimension;
            else resizeOptions.height = maxDimension;
          } else {
            resizeOptions.width = maxDimension;
          }
          transformer = transformer.resize(resizeOptions);
        }
        // Use lower compression level to reduce CPU while keeping size reasonable
        imageBuffer = await transformer.png({ compressionLevel: 5 }).toBuffer();
      }
    } catch (preErr) {
      logger.error(`Failed to pre-process image for analysis`, {
        path: filePath,
        error: preErr.message,
      });
    }

    // Validate buffer is not empty
    if (imageBuffer.length === 0) {
      logger.error(`Image buffer is empty after reading`, { path: filePath });
      return {
        error: 'Image buffer is empty after reading',
        category: 'error',
        keywords: [],
        confidence: 0,
      };
    }

    logger.debug(`Image buffer size`, { bytes: imageBuffer.length });
    const imageBase64 = imageBuffer.toString('base64');

    // Validate base64 encoding
    if (!imageBase64 || imageBase64.length === 0) {
      logger.error(`Image base64 encoding failed`, { path: filePath });
      return {
        error: 'Image base64 encoding failed',
        category: 'error',
        keywords: [],
        confidence: 0,
      };
    }

    logger.debug(`Base64 length`, { chars: imageBase64.length });

    // Analyze with Ollama
    const analysis = await analyzeImageWithOllama(
      imageBase64,
      fileName,
      smartFolders,
    );

    // Ensure category mapping consistency with smart folders
    categoryMappingService.updateSmartFolders(smartFolders);

    // Fix category to match available smart folders
    if (analysis.category) {
      const validCategory = categoryMappingService.findBestCategoryMatch(
        analysis.category,
        {
          project: analysis.project,
          purpose: analysis.purpose,
          content_type: analysis.content_type,
        },
      );
      if (validCategory !== analysis.category) {
        analysis.originalCategory = analysis.category;
        analysis.category = validCategory;
      }
    }

    // Semantic folder refinement using embeddings based on image JSON fields
    try {
      // Reuse single service instances to avoid reloading data repeatedly
      const embeddingIndex =
        embeddingIndexSingleton ||
        (embeddingIndexSingleton = getEmbeddingIndex());
      const folderMatcher =
        folderMatcherSingleton ||
        (folderMatcherSingleton = new FolderMatchingService(embeddingIndex));
      if (smartFolders && smartFolders.length > 0) {
        await Promise.all(
          smartFolders.map((f) => folderMatcher.upsertFolderEmbedding(f)),
        );
      }
      const fileId = `image:${filePath}`;
      const summary = [
        analysis.project,
        analysis.purpose,
        (analysis.keywords || []).join(' '),
        analysis.content_type || '',
      ]
        .filter(Boolean)
        .join('\n');
      await folderMatcher.upsertFileEmbedding(fileId, summary, {
        path: filePath,
      });
      const candidates = await folderMatcher.matchFileToFolders(fileId, 5);
      if (Array.isArray(candidates) && candidates.length > 0) {
        const top = candidates[0];
        if (top.score >= 0.55) {
          // Use category mapping service to ensure consistency
          const refinedCategory = categoryMappingService.findBestCategoryMatch(
            top.name,
          );
          analysis.category = refinedCategory;
        }
        analysis.folderMatchCandidates = candidates;
      }
    } catch {}

    if (analysis && !analysis.error) {
      const normalized = normalizeAnalysisResult(
        {
          ...analysis,
          content_type: analysis.content_type || 'unknown',
          suggestedName:
            analysis.suggestedName ||
            safeSuggestedName(fileName, fileExtension),
        },
        { category: 'image', keywords: [] },
      );
      try {
        setImageCache(signature, normalized);
      } catch {}
      return normalized;
    }

    // Fallback analysis if Ollama fails
    const intelligentCategory = getIntelligentImageCategory(
      fileName,
      fileExtension,
    );
    const intelligentKeywords = getIntelligentImageKeywords(
      fileName,
      fileExtension,
    );

    const result = {
      keywords: Array.isArray(analysis.keywords)
        ? analysis.keywords
        : intelligentKeywords,
      purpose: 'Image analyzed with fallback method.',
      project: fileName.replace(fileExtension, ''),
      date: new Date().toISOString().split('T')[0],
      category: intelligentCategory,
      confidence: 60,
      error: analysis?.error || 'Ollama image analysis failed.',
    };
    try {
      setImageCache(signature, result);
    } catch {}
    return result;
  } catch (error) {
    console.error(`Error processing image ${filePath}:`, error.message);
    return {
      error: `Failed to process image: ${error.message}`,
      category: 'error',
      project: fileName,
      keywords: [],
      confidence: 50,
    };
  }
}

// OCR capability using Ollama for text extraction from images
async function extractTextFromImage(filePath) {
  try {
    const imageBuffer = await fs.readFile(filePath);
    const imageBase64 = imageBuffer.toString('base64');

    const prompt = `Extract all readable text from this image. Return only the text content, maintaining the original structure and formatting as much as possible. If no text is found, return "NO_TEXT_FOUND".`;

    const cfg2 = await loadOllamaConfig();
    const modelToUse2 =
      getOllamaVisionModel() ||
      cfg2.selectedVisionModel ||
      AppConfig.ai.imageAnalysis.defaultModel;
    const client2 = await getOllamaClient();
    const response = await client2.generate({
      model: modelToUse2,
      prompt,
      images: [imageBase64],
      options: {
        temperature: 0.1, // Lower temperature for text extraction
        num_predict: 2000,
      },
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

// Fallback image helpers sourced from fallbackUtils

module.exports = {
  analyzeImageFile,
  extractTextFromImage,
};
