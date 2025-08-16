const { logger } = require('../../shared/logger');

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
    const response = await fetch(`${host}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelToUse,
        prompt,
        stream: false,
        format: 'json',
        options: { temperature: 0.3, num_predict: 500 },
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const enhancement = JSON.parse(data.response);
      if (enhancement && typeof enhancement === 'object') {
        logger.info('[LLM-ENHANCEMENT] Successfully enhanced smart folder');
        return enhancement;
      }
    }
    return { error: 'Invalid LLM response format' };
  } catch (error) {
    logger.error(
      '[LLM-ENHANCEMENT] Failed to enhance smart folder:',
      error.message,
    );
    return { error: error.message };
  }
}

async function calculateFolderSimilarities(
  suggestedCategory,
  folderCategories,
  getOllamaModel,
) {
  try {
    const similarities = [];
    for (const folder of folderCategories) {
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
        const response = await fetch(`${host}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: modelToUse,
            prompt,
            stream: false,
            options: { temperature: 0.1, num_predict: 10 },
          }),
        });
        if (response.ok) {
          const data = await response.json();
          const similarity = parseFloat((data.response || '').trim());
          if (!isNaN(similarity) && similarity >= 0 && similarity <= 1) {
            similarities.push({
              name: folder.name,
              id: folder.id,
              confidence: similarity,
              description: folder.description,
            });
          }
        }
      } catch (folderError) {
        logger.warn(
          `[SEMANTIC] Failed to analyze folder ${folder.name}:`,
          folderError.message,
        );
        const basicSimilarity = calculateBasicSimilarity(
          suggestedCategory,
          folder.name,
        );
        similarities.push({
          name: folder.name,
          id: folder.id,
          confidence: basicSimilarity,
          description: folder.description,
          fallback: true,
        });
      }
    }
    return similarities.sort((a, b) => b.confidence - a.confidence);
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
