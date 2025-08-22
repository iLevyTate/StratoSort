const {
  getOllamaModel,
  loadOllamaConfig,
  getOllamaClient,
} = require('../ollamaUtils');
const crypto = require('crypto');
const { AI_DEFAULTS } = require('../../shared/constants');
const { buildFolderCategoriesString } = require('./utils');

const AppConfig = {
  ai: {
    textAnalysis: {
      defaultModel: AI_DEFAULTS.TEXT.MODEL,
      defaultHost: AI_DEFAULTS.TEXT.HOST,
      timeout: 60000,
      maxContentLength: AI_DEFAULTS.TEXT.MAX_CONTENT_LENGTH,
      temperature: AI_DEFAULTS.TEXT.TEMPERATURE,
      maxTokens: AI_DEFAULTS.TEXT.MAX_TOKENS,
    },
  },
};

// Use shared client from ollamaUtils

// Simple bounded in-memory cache for analysis results to avoid re-calling LLM
const ANALYSIS_CACHE_MAX_ENTRIES = 200;
const analysisCache = new Map(); // key -> result

function getCacheKey(textContent, model, smartFolders) {
  const hasher = crypto.createHash('sha1');
  hasher.update(textContent);
  hasher.update('|');
  hasher.update(String(model || ''));
  hasher.update('|');
  try {
    const foldersKey = Array.isArray(smartFolders)
      ? smartFolders
          .map((f) => `${f?.name || ''}:${(f?.description || '').slice(0, 64)}`)
          .join(',')
      : '';
    hasher.update(foldersKey);
  } catch {}
  return hasher.digest('hex');
}

function setCache(key, value) {
  analysisCache.set(key, value);
  if (analysisCache.size > ANALYSIS_CACHE_MAX_ENTRIES) {
    const firstKey = analysisCache.keys().next().value;
    analysisCache.delete(firstKey);
  }
}

function normalizeTextForModel(input, maxLen) {
  if (!input) return '';
  let text = String(input);
  // Remove null bytes and collapse excessive whitespace to reduce tokens
  text = text.replace(/\u0000/g, '');
  text = text.replace(/[\t\x0B\f\r]+/g, ' ');
  text = text.replace(/\s{2,}/g, ' ').trim();
  if (typeof maxLen === 'number' && maxLen > 0 && text.length > maxLen) {
    return text.slice(0, maxLen);
  }
  return text;
}

async function analyzeTextWithOllama(
  textContent,
  originalFileName,
  smartFolders = [],
) {
  try {
    const cfg = await loadOllamaConfig();
    const modelToUse =
      getOllamaModel() ||
      cfg.selectedTextModel ||
      cfg.selectedModel ||
      AppConfig.ai.textAnalysis.defaultModel;

    // Normalize and truncate text to reduce token count
    const truncated = normalizeTextForModel(
      textContent,
      AppConfig.ai.textAnalysis.maxContentLength,
    );

    // Fast-path: return cached result if available
    const cacheKey = getCacheKey(truncated, modelToUse, smartFolders);
    if (analysisCache.has(cacheKey)) {
      return analysisCache.get(cacheKey);
    }

    const folderCategoriesStr = buildFolderCategoriesString(
      smartFolders,
      "the document's CONTENT",
    );

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

Document content (${truncated.length} characters):
${truncated}`;

    const client = await getOllamaClient();
    const generatePromise = client.generate({
      model: modelToUse,
      prompt,
      options: {
        temperature: AppConfig.ai.textAnalysis.temperature,
        num_predict: AppConfig.ai.textAnalysis.maxTokens,
      },
      format: 'json',
    });
    const response = await Promise.race([
      generatePromise,
      new Promise((_, reject) => {
        const t = setTimeout(
          () => reject(new Error('LLM request timed out')),
          AppConfig.ai.textAnalysis.timeout,
        );
        try {
          t.unref();
        } catch {}
      }),
    ]);

    if (response.response) {
      try {
        console.log('[AI-DEBUG] Raw AI response:', response.response);
        const parsedJson = JSON.parse(response.response);
        console.log(
          '[AI-DEBUG] Parsed AI result fields:',
          Object.keys(parsedJson),
        );
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
        const result = {
          rawText: textContent.substring(0, 2000),
          ...parsedJson,
          keywords: finalKeywords,
        };
        console.log('[AI-DEBUG] Final result fields:', Object.keys(result));
        console.log(
          '[AI-DEBUG] suggestedName in result:',
          result.suggestedName,
        );
        setCache(cacheKey, result);
        return result;
      } catch (e) {
        return {
          error: 'Failed to parse document analysis from Ollama.',
          keywords: [],
          confidence: 65,
        };
      }
    }
    return {
      error: 'No content in Ollama response for document',
      keywords: [],
      confidence: 60,
    };
  } catch (error) {
    return {
      error: `Ollama API error for document: ${error.message}`,
      keywords: [],
      confidence: 60,
    };
  }
}

module.exports = {
  AppConfig,
  getOllamaClient,
  analyzeTextWithOllama,
};
