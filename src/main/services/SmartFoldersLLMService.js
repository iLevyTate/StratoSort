const { logger } = require('../../shared/logger');
const { TIMEOUTS } = require('../../shared/constants');

async function enhanceSmartFolderWithLLM(
  folderData,
  existingFolders,
  getOllamaModel,
) {
  try {
    logger.info(
      '[LLM-ENHANCEMENT] Analyzing smart folder for optimization:',
      folderData.name,
    );

    const existingFolderContext = existingFolders.map((f) => ({
      name: f.name,
      description: f.description,
      keywords: f.keywords || [],
      category: f.category || 'general',
    }));

    const prompt = `You are an expert file organization system. Analyze this new smart folder and provide enhancements based on existing folder structure.

NEW FOLDER:
Name: "${folderData.name}"
Path: "${folderData.path}"
Description: "${folderData.description || ''}"

EXISTING FOLDERS:
${existingFolderContext.map((f) => `- ${f.name}: ${f.description} (Category: ${f.category})`).join('\n')}

Please provide a JSON response with the following enhancements:
{
  "improvedDescription": "enhanced description",
  "suggestedKeywords": ["keyword1", "keyword2"],
  "organizationTips": "tips for better organization",
  "confidence": 0.8
}`;

    const { getOllamaHost } = require('../ollamaUtils');
    const host =
      (typeof getOllamaHost === 'function' && getOllamaHost()) ||
      'http://127.0.0.1:11434';
    const modelToUse =
      (typeof getOllamaModel === 'function' && getOllamaModel()) ||
      require('../../shared/constants').DEFAULT_AI_MODELS.TEXT_ANALYSIS;

    // Add timeout handling for LLM requests
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      TIMEOUTS.LLM_ENHANCEMENT,
    );

    const response = await fetch(`${host}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: modelToUse,
        prompt,
        stream: false,
        format: 'json',
        options: { temperature: 0.3, num_predict: 500 },
      }),
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const rawResponse = data.response;

      if (!rawResponse || typeof rawResponse !== 'string') {
        logger.warn('[LLM-ENHANCEMENT] LLM returned empty or invalid response');
        return { error: 'LLM returned empty response' };
      }

      try {
        // First attempt: direct JSON parsing
        const enhancement = JSON.parse(rawResponse.trim());
        if (enhancement && typeof enhancement === 'object') {
          logger.info('[LLM-ENHANCEMENT] Successfully enhanced smart folder');
          return enhancement;
        } else {
          throw new Error('Parsed result is not a valid object');
        }
      } catch (parseError) {
        logger.warn(
          `[LLM-ENHANCEMENT] Direct JSON parsing failed: ${parseError.message}`,
        );
        logger.debug(`[LLM-ENHANCEMENT] Raw LLM response: ${rawResponse}`);

        // Second attempt: try to extract JSON from markdown code blocks
        try {
          const jsonMatch = rawResponse.match(
            /```(?:json)?\s*(\{[\s\S]*?\})\s*```/,
          );
          if (jsonMatch) {
            const extractedJson = jsonMatch[1];
            const enhancement = JSON.parse(extractedJson);
            if (enhancement && typeof enhancement === 'object') {
              logger.info(
                '[LLM-ENHANCEMENT] Successfully parsed JSON from markdown code block',
              );
              return enhancement;
            }
          }
        } catch (codeBlockError) {
          logger.warn(
            `[LLM-ENHANCEMENT] Code block extraction failed: ${codeBlockError.message}`,
          );
        }

        // Third attempt: try to find and fix common JSON issues
        try {
          let cleanedResponse = rawResponse.trim();

          // Remove common prefixes/suffixes that LLMs might add
          cleanedResponse = cleanedResponse
            .replace(/^[^[{]*/, '') // Remove text before first { or [
            .replace(/[^}\]]*$/, ''); // Remove text after last } or ]

          if (cleanedResponse) {
            const enhancement = JSON.parse(cleanedResponse);
            if (enhancement && typeof enhancement === 'object') {
              logger.info('[LLM-ENHANCEMENT] Successfully parsed cleaned JSON');
              return enhancement;
            }
          }
        } catch (cleanupError) {
          logger.warn(
            `[LLM-ENHANCEMENT] Cleaned JSON parsing failed: ${cleanupError.message}`,
          );
        }

        // If all parsing attempts fail, return error with details
        logger.error(
          `[LLM-ENHANCEMENT] Failed to parse LLM response after all attempts`,
        );
        return {
          error: 'Invalid LLM response format',
          details: `Could not parse JSON from response: ${parseError.message}`,
          rawResponse:
            rawResponse.substring(0, 200) +
            (rawResponse.length > 200 ? '...' : ''),
        };
      }
    }
    return { error: 'Invalid LLM response format' };
  } catch (error) {
    const errorMessage =
      error.name === 'AbortError'
        ? 'Request timeout after 30 seconds'
        : error.message;
    logger.error(
      '[LLM-ENHANCEMENT] Failed to enhance smart folder:',
      errorMessage,
    );
    return { error: errorMessage };
  }
}

async function calculateFolderSimilarities(
  suggestedCategory,
  folderCategories,
  getOllamaModel,
) {
  try {
    // Prepare an array of promises for all folders
    const similarityPromises = folderCategories.map(async (folder) => {
      const prompt = `Compare these two categories for semantic similarity:
Category 1: "${suggestedCategory}"
Category 2: "${folder.name}" (Description: "${folder.description}")

Rate similarity from 0.0 to 1.0 where:
- 1.0 = identical meaning
- 0.8+ = very similar concepts
- 0.6+ = related concepts
- 0.4+ = somewhat related
- 0.2+ = loosely related
- 0.0 = unrelated

Respond with only a number between 0.0 and 1.0:`;
      try {
        const { getOllamaHost } = require('../ollamaUtils');
        const host =
          (typeof getOllamaHost === 'function' && getOllamaHost()) ||
          'http://127.0.0.1:11434';
        const modelToUse =
          (typeof getOllamaModel === 'function' && getOllamaModel()) ||
          require('../../shared/constants').DEFAULT_AI_MODELS.TEXT_ANALYSIS;

        // Add timeout handling for similarity requests
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          TIMEOUTS.LLM_SIMILARITY,
        );

        const response = await fetch(`${host}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            model: modelToUse,
            prompt,
            stream: false,
            options: { temperature: 0.1, num_predict: 10 },
          }),
        });

        clearTimeout(timeoutId);
        if (response.ok) {
          const data = await response.json();
          const similarity = parseFloat((data.response || '').trim());
          if (!isNaN(similarity) && similarity >= 0 && similarity <= 1) {
            return {
              name: folder.name,
              id: folder.id,
              confidence: similarity,
              description: folder.description,
            };
          }
        }
      } catch (folderError) {
        // On failure, use basic similarity fallback (as before)
        const errorMessage =
          folderError.name === 'AbortError'
            ? 'Request timeout after 10 seconds'
            : folderError.message;
        logger.warn(
          `[SEMANTIC] Failed to analyze folder ${folder.name}:`,
          errorMessage,
        );
        const basicSimilarity = calculateBasicSimilarity(
          suggestedCategory,
          folder.name,
        );
        return {
          name: folder.name,
          id: folder.id,
          confidence: basicSimilarity,
          description: folder.description,
          fallback: true,
        };
      }
      return null;
    });

    // Await all similarity checks in parallel
    const results = await Promise.all(similarityPromises);
    // Filter out any null results and sort by confidence
    return results
      .filter((res) => res)
      .sort((a, b) => b.confidence - a.confidence);
  } catch (error) {
    logger.error('[SEMANTIC] Folder similarity calculation failed:', error);
    return [];
  }
}

function calculateBasicSimilarity(str1, str2) {
  const s1 = String(str1 || '').toLowerCase();
  const s2 = String(str2 || '').toLowerCase();
  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;
  const words1 = s1.split(/\s+/);
  const words2 = s2.split(/\s+/);
  const overlap = words1.filter((w) => words2.includes(w)).length;
  const total = Math.max(words1.length, words2.length) || 1;
  return overlap / total;
}

module.exports = {
  enhanceSmartFolderWithLLM,
  calculateFolderSimilarities,
  calculateBasicSimilarity,
};
