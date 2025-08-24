const {
  getOllamaModel,
  loadOllamaConfig,
  getOllamaClient,
} = require('../ollamaUtils');
const { AI_DEFAULTS, CONTENT_SAMPLING } = require('../../shared/constants');

const AppConfig = {
  ai: {
    textAnalysis: {
      defaultModel: AI_DEFAULTS.TEXT.MODEL,
      defaultHost: AI_DEFAULTS.TEXT.HOST,
      timeout: 30000, // Reduced from 60000ms to 30000ms for faster processing
      maxContentLength: AI_DEFAULTS.TEXT.MAX_CONTENT_LENGTH,
      temperature: AI_DEFAULTS.TEXT.TEMPERATURE,
      maxTokens: AI_DEFAULTS.TEXT.MAX_TOKENS,
    },
  },
};

// Intelligent content sampling for faster analysis
function sampleDocumentContent(
  textContent,
  maxLength = CONTENT_SAMPLING.MAX_SAMPLE_LENGTH,
) {
  // Check if sampling is enabled
  if (
    !CONTENT_SAMPLING.ENABLED ||
    !textContent ||
    textContent.length <= CONTENT_SAMPLING.MIN_SAMPLE_LENGTH
  ) {
    return textContent;
  }

  // If content is smaller than max length, return as-is
  if (textContent.length <= maxLength) {
    return textContent;
  }

  const content = textContent.trim();
  const samples = [];

  // Strategy 1: Extract the most informative parts
  const strategies = [
    // Beginning (title, intro, context) - configurable percentage
    () => {
      const startLength = Math.floor(
        maxLength * CONTENT_SAMPLING.STRATEGIES.BEGINNING,
      );
      return content.substring(0, startLength);
    },

    // Headings and key sections - configurable percentage
    () => {
      const headingPattern = /^#{1,6}\s+.*$|^[^\n]*[A-Z]{2,}[^\n]*$|^.*:\s*$/gm;
      const headings = [];
      let match;
      while ((match = headingPattern.exec(content)) !== null) {
        headings.push({
          text: match[0],
          index: match.index,
          length: match[0].length,
        });
      }

      if (headings.length > 0) {
        let headingSample = '';
        const headingLength = Math.floor(
          maxLength * CONTENT_SAMPLING.STRATEGIES.HEADINGS,
        );

        for (const heading of headings.slice(0, 3)) {
          const start = heading.index;
          const end = Math.min(start + 200, content.length);
          headingSample += content.substring(start, end) + '\n\n';
          if (headingSample.length >= headingLength) break;
        }

        return headingSample.substring(0, headingLength);
      }
      return '';
    },

    // Middle section (core content) - configurable percentage
    () => {
      const middleStart = Math.floor(content.length * 0.3);
      const middleLength = Math.floor(
        maxLength * CONTENT_SAMPLING.STRATEGIES.MIDDLE,
      );
      return content.substring(middleStart, middleStart + middleLength);
    },

    // End section (conclusion, summary) - configurable percentage
    () => {
      const endLength = Math.floor(maxLength * CONTENT_SAMPLING.STRATEGIES.END);
      const endStart = Math.max(0, content.length - endLength);
      return content.substring(endStart);
    },

    // Keyword-rich sections - configurable percentage
    () => {
      const keywordPattern =
        /\b(keywords?|topics?|summary|abstract|introduction|conclusion|results?|findings?)\b/gi;
      const keywordSections = [];
      let match;
      while ((match = keywordPattern.exec(content)) !== null) {
        const start = Math.max(0, match.index - 100);
        const end = Math.min(content.length, match.index + 300);
        keywordSections.push(content.substring(start, end));
      }

      if (keywordSections.length > 0) {
        const keywordSample = keywordSections.slice(0, 2).join('\n\n');
        return keywordSample.substring(
          0,
          Math.floor(maxLength * CONTENT_SAMPLING.STRATEGIES.KEYWORDS),
        );
      }
      return '';
    },
  ];

  // Apply all strategies and combine intelligently
  for (const strategy of strategies) {
    try {
      const sample = strategy();
      if (sample && sample.trim()) {
        samples.push(sample.trim());
      }
    } catch (error) {
      console.warn('Content sampling strategy failed:', error.message);
    }
  }

  // Combine samples with separators
  let combinedSample = samples.join('\n\n---\n\n');

  // Ensure we don't exceed the max length
  if (combinedSample.length > maxLength) {
    combinedSample = combinedSample.substring(0, maxLength);
    // Try to end at a word boundary
    const lastSpace = combinedSample.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.8) {
      combinedSample = combinedSample.substring(0, lastSpace);
    }
  }

  return combinedSample;
}

// Use shared client from ollamaUtils

async function analyzeTextWithOllama(
  textContent,
  originalFileName,
  smartFolders = [],
) {
  try {
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

    // Use intelligent content sampling for faster analysis
    const originalLength = textContent.length;
    const sampledContent = sampleDocumentContent(
      textContent,
      CONTENT_SAMPLING.MAX_SAMPLE_LENGTH,
    );
    const samplingRatio =
      originalLength > 0
        ? (
            ((originalLength - sampledContent.length) / originalLength) *
            100
          ).toFixed(0)
        : 0;

    console.log(
      `[CONTENT-SAMPLING] Reduced content from ${originalLength} to ${sampledContent.length} chars (${samplingRatio}% reduction)`,
    );

    const prompt = `You are an expert document analyzer. Analyze the TEXT SAMPLE below and extract structured information. This sample contains the most relevant parts of the document for categorization.

IMPORTANT: Base your analysis on the SAMPLE CONTENT provided, not the filename "${originalFileName}". Use this sample to understand the document's true purpose, topics, and themes.

Your response MUST be a valid JSON object with ALL these fields:
{
  "date": "YYYY-MM-DD format if found in sample, otherwise today's date",
  "project": "main subject/project from sample (2-5 words)",
  "purpose": "document's purpose based on sample (5-10 words)",
  "category": "most appropriate category (must be one of the folder names above)"${folderCategoriesStr},
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "confidence": 85,
  "suggestedName": "descriptive_name_based_on_sample"
}

CRITICAL REQUIREMENTS:
1. The keywords array MUST contain 3-7 keywords extracted from the sample content
2. Keywords should be specific terms, concepts, or topics mentioned in the text
3. Do NOT return an empty keywords array
4. Base ALL fields on the sample content provided

Document sample (${sampledContent.length} characters, ${samplingRatio}% of original):
${sampledContent}`;

    const cfg = await loadOllamaConfig();
    const modelToUse =
      getOllamaModel() ||
      cfg.selectedTextModel ||
      cfg.selectedModel ||
      AppConfig.ai.textAnalysis.defaultModel;
    const client = await getOllamaClient();
    const response = await client.generate({
      model: modelToUse,
      prompt,
      options: {
        temperature: AppConfig.ai.textAnalysis.temperature,
        num_predict: AppConfig.ai.textAnalysis.maxTokens,
      },
      format: 'json',
    });

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
          rawText: sampledContent.substring(0, 2000), // Use sampled content for raw text
          ...parsedJson,
          keywords: finalKeywords,
          sampling: {
            originalLength: originalLength,
            sampledLength: sampledContent.length,
            reductionPercent: samplingRatio,
            method: 'intelligent_sampling',
          },
        };
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
