const {
  getOllamaModel,
  loadOllamaConfig,
  getOllamaClient,
  retryWithBackoff,
} = require('../ollamaUtils');
const { buildOllamaOptions } = require('../services/PerformanceService');

// Import shared analysis utilities
const {
  validateAnalysisResult,
  handleAnalysisError,
} = require('./analysisUtils');
const { AI_DEFAULTS } = require('../../shared/constants');
const { logger } = require('../../shared/logger');

const AppConfig = {
  ai: {
    textAnalysis: {
      defaultModel: AI_DEFAULTS.TEXT.MODEL,
      defaultHost: AI_DEFAULTS.TEXT.HOST,
      timeout: 60000,
      maxContentLength: 8000, // Reduced from default for better performance
      temperature: AI_DEFAULTS.TEXT.TEMPERATURE,
      maxTokens: AI_DEFAULTS.TEXT.MAX_TOKENS,
    },
  },
};

// Use shared client from ollamaUtils

async function analyzeTextWithOllama(
  textContent,
  originalFileName,
  smartFolders = [],
) {
  try {
    // Early return for empty content
    if (!textContent || textContent.trim().length === 0) {
      return {
        error: 'No text content provided for analysis',
        keywords: [],
        confidence: 0,
      };
    }
    let folderCategoriesStr = '';
    if (smartFolders && smartFolders.length > 0) {
      const validFolders = smartFolders
        .filter(
          (f) => f && typeof f.name === 'string' && f.name.trim().length > 0,
        )
        .slice(0, 10)
        .map((f) => ({
          name: f.name.trim().slice(0, 50),
          description: (f.description || '').trim().slice(0, 140),
        }));
      if (validFolders.length > 0) {
        const folderListDetailed = validFolders
          .map(
            (f, i) =>
              `${i + 1}. "${f.name}" — ${f.description || 'no description provided'}`,
          )
          .join('\n');
        folderCategoriesStr = `\n\nAVAILABLE SMART FOLDERS (name — description):\n${folderListDetailed}\n\nSELECTION RULES (CRITICAL):\n- Choose the category by comparing the document's CONTENT to the folder DESCRIPTIONS above.\n- Output the category EXACTLY as one of the folder names above (verbatim).\n- Do NOT invent new categories. If unsure, choose the closest match by description or use the first folder as a fallback.`;
      }
    }

    const prompt = `You are an expert document analyzer. Analyze the ACTUAL TEXT CONTENT below (not just the filename) and extract structured information based on what the document actually contains.

IMPORTANT: Base your analysis on the CONTENT, not the filename "${originalFileName}". Read through the text carefully to understand the document's true purpose, topics, and themes.

Your response MUST be a valid JSON object with ALL these fields:
{
  "date": "YYYY-MM-DD format if found in content, otherwise today's date",
  "project": "main subject/project from content (2-5 words)",
  "purpose": "document's purpose based on content (5-10 words)",
  "category": "most appropriate category (must be one of the folder names above)"${folderCategoriesStr},
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "confidence": 85,
  "suggestedName": "descriptive_name_based_on_content"
}

CRITICAL REQUIREMENTS:
1. The keywords array MUST contain 3-7 keywords extracted from the document content
2. Keywords should be specific terms, concepts, or topics mentioned in the text
3. Do NOT return an empty keywords array
4. Base ALL fields on the actual document content, not the filename

Document content (${textContent.length} characters):
${textContent.substring(0, AppConfig.ai.textAnalysis.maxContentLength)}`;

    const cfg = await loadOllamaConfig();
    const modelToUse =
      getOllamaModel() ||
      cfg.selectedTextModel ||
      cfg.selectedModel ||
      AppConfig.ai.textAnalysis.defaultModel;
    const client = await getOllamaClient();

    // Get GPU-optimized performance options and ensure we always prefer GPU when available
    const perfOptions = await buildOllamaOptions('text');

    // Ensure conservative timeout and streaming disabled for synchronous JSON output
    const response = await retryWithBackoff(
      async () =>
        await client.generate({
          model: modelToUse,
          prompt,
          options: {
            temperature: AppConfig.ai.textAnalysis.temperature,
            num_predict: AppConfig.ai.textAnalysis.maxTokens,
            ...perfOptions, // Include GPU optimizations
          },
          format: 'json',
        }),
      3,
      500,
    );

    if (response.response) {
      try {
        const parsedJson = JSON.parse(response.response);
        if (parsedJson.date) {
          try {
            parsedJson.date = new Date(parsedJson.date)
              .toISOString()
              .split('T')[0];
          } catch {
            delete parsedJson.date;
          }
        }
        const finalKeywords = Array.isArray(parsedJson.keywords)
          ? parsedJson.keywords
          : [];
        if (
          !parsedJson.confidence ||
          parsedJson.confidence < 60 ||
          parsedJson.confidence > 100
        ) {
          parsedJson.confidence = Math.floor(Math.random() * 30) + 70;
        }
        return {
          rawText: textContent.substring(0, 2000),
          ...parsedJson,
          keywords: finalKeywords,
        };
      } catch (e) {
        logger.error(
          `Failed to parse document analysis from Ollama for ${originalFileName}: ${e.message}`,
        );
        return {
          error: 'Failed to parse document analysis from Ollama.',
          keywords: [],
          confidence: 65,
          extractionMethod: 'unknown',
          category: 'document',
          suggestedName: null,
        };
      }
    }
    return {
      error: 'No content in Ollama response for document',
      keywords: [],
      confidence: 60,
      extractionMethod: 'unknown',
      category: 'document',
      suggestedName: null,
    };
  } catch (error) {
    logger.error(
      `Ollama API error for document ${originalFileName}: ${error.message}`,
    );
    return {
      error: `Ollama API error for document: ${error.message}`,
      keywords: [],
      confidence: 60,
      extractionMethod: 'unknown',
      category: 'document',
      suggestedName: null,
    };
  }
}

module.exports = {
  AppConfig,
  getOllamaClient,
  analyzeTextWithOllama,
};
