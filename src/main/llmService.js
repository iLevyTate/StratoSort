const { Ollama } = require('ollama');
const { logger } = require('../shared/logger');
const { DEFAULT_AI_MODELS } = require('../shared/constants');

// Initialize Ollama instance
let ollamaInstance = null;
let selectedModel = DEFAULT_AI_MODELS.TEXT_ANALYSIS;

/**
 * Get or create Ollama instance
 */
function getOllama() {
  if (!ollamaInstance) {
    const host = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
    ollamaInstance = new Ollama({ host });
    logger.info('Ollama instance initialized', { host });
  }
  return ollamaInstance;
}

/**
 * Get the currently selected Ollama model
 */
function getOllamaModel() {
  return selectedModel;
}

/**
 * Set the selected Ollama model
 */
function setOllamaModel(modelName) {
  selectedModel = modelName;
  logger.info('Ollama model updated', { model: modelName });
}

/**
 * Test if Ollama is available and the model is working
 */
async function testOllamaConnection() {
  try {
    const ollama = getOllama();
    const response = await ollama.generate({
      model: selectedModel,
      prompt: 'Hello',
      options: { num_predict: 1 }
    });
    return { success: true, model: selectedModel };
  } catch (error) {
    logger.error('Ollama connection test failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Formats the scanned directory structure into a prompt for the LLM.
 * @param {Array<Object>} directoryStructure - The output from scanDirectory.
 * @returns {string} A text prompt for the LLM.
 */
function formatPromptForLLM(directoryStructure) {
  let prompt = "Analyze the following file and folder structure:\n\n";
  
  // Simplify the structure to avoid overly verbose output
  const simplifiedStructure = simplifyDirectoryStructure(directoryStructure);
  prompt += JSON.stringify(simplifiedStructure, null, 2);

  prompt += "\n\nPlease suggest logical organization patterns to improve this structure. ";
  prompt += "For each suggestion, explain your reasoning and list concrete actions ";
  prompt += "(e.g., create new folders, move files/folders, rename items). ";
  prompt += "Focus on clarity and ease of future navigation. ";
  prompt += "Return your response as a JSON object with 'suggestions' array containing objects with 'action', 'reasoning', and 'priority' fields.";

  return prompt;
}

/**
 * Simplify directory structure for more efficient LLM processing
 */
function simplifyDirectoryStructure(structure, maxDepth = 3, currentDepth = 0) {
  if (currentDepth >= maxDepth) return '[... truncated ...]';
  
  return structure.map(item => {
    const simplified = {
      name: item.name,
      type: item.type,
      size: item.size
    };
    
    if (item.type === 'folder' && item.children && item.children.length > 0) {
      simplified.children = simplifyDirectoryStructure(item.children, maxDepth, currentDepth + 1);
      simplified.childCount = item.children.length;
    }
    
    return simplified;
  });
}

/**
 * Gets organization suggestions from an LLM.
 * @param {Array<Object>} directoryStructure - The output from scanDirectory.
 * @returns {Promise<Object>} An object containing the LLM's suggestions.
 */
async function getOrganizationSuggestions(directoryStructure) {
  const ollama = getOllama();
  const model = getOllamaModel();

  if (!ollama || !model) {
    logger.error('Ollama instance or model not configured');
    return {
      error: 'LLM not configured',
      suggestions: []
    };
  }

  const prompt = formatPromptForLLM(directoryStructure);

  try {
    logger.info('Sending organization request to LLM', { 
      model, 
      structureSize: directoryStructure.length 
    });
    
    const startTime = Date.now();
    
    const response = await ollama.generate({
      model: model,
      prompt: prompt,
      format: 'json',
      options: {
        temperature: 0.3, // Lower temperature for more consistent suggestions
        num_predict: 1000,
        stop: ['\n\n', '###']
      }
    });

    const duration = Date.now() - startTime;
    logger.performance('LLM organization suggestions', duration, { model });

    if (!response.response) {
      throw new Error('Empty response from LLM');
    }

    // Parse the JSON response
    let suggestions;
    try {
      const parsedResponse = JSON.parse(response.response);
      suggestions = parsedResponse.suggestions || parsedResponse;
    } catch (parseError) {
      logger.warn('Failed to parse LLM JSON response, using text parsing', { 
        error: parseError.message 
      });
      suggestions = parseTextResponse(response.response);
    }

    logger.info('LLM organization suggestions received', { 
      suggestionsCount: Array.isArray(suggestions) ? suggestions.length : 0 
    });

    return {
      suggestions: Array.isArray(suggestions) ? suggestions : [suggestions],
      model: model,
      processingTime: duration
    };

  } catch (error) {
    logger.error('Error getting suggestions from LLM', { 
      error: error.message,
      model 
    });
    
    return {
      error: error.message || 'Failed to get suggestions from LLM',
      suggestions: [],
      fallbackSuggestions: getFallbackSuggestions(directoryStructure)
    };
  }
}

/**
 * Parse text response when JSON parsing fails
 */
function parseTextResponse(responseText) {
  const suggestions = [];
  const lines = responseText.split('\n');
  
  let currentSuggestion = null;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // Look for suggestion patterns
    if (trimmed.toLowerCase().includes('suggestion') || 
        trimmed.toLowerCase().includes('organize') ||
        trimmed.toLowerCase().includes('create folder')) {
      
      if (currentSuggestion) {
        suggestions.push(currentSuggestion);
      }
      
      currentSuggestion = {
        action: trimmed,
        reasoning: '',
        priority: 'medium'
      };
    } else if (currentSuggestion && 
               (trimmed.toLowerCase().includes('reason') || 
                trimmed.toLowerCase().includes('because'))) {
      currentSuggestion.reasoning = trimmed;
    }
  }
  
  if (currentSuggestion) {
    suggestions.push(currentSuggestion);
  }
  
  return suggestions;
}

/**
 * Provide fallback suggestions when LLM fails
 */
function getFallbackSuggestions(directoryStructure) {
  return [
    {
      action: "Create 'Documents' folder for text files",
      reasoning: "Group all text-based files for easier access",
      priority: "high"
    },
    {
      action: "Create 'Media' folder for images and videos", 
      reasoning: "Separate media files from documents",
      priority: "medium"
    },
    {
      action: "Create 'Archives' folder for compressed files",
      reasoning: "Keep archive files organized and separate",
      priority: "low"
    }
  ];
}

module.exports = { 
  getOrganizationSuggestions, 
  formatPromptForLLM,
  getOllama,
  getOllamaModel,
  setOllamaModel,
  testOllamaConnection
}; 