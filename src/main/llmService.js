const {
  getOllama, // Function to get the Ollama instance (you might have this elsewhere)
  getOllamaModel, // Function to get the selected Ollama model (you might have this elsewhere)
  // ... any other necessary Ollama utilities
} = require('./ollamaUtils'); // Assuming ollama utilities are in ollamaUtils.js

/**
 * Formats the scanned directory structure into a prompt for the LLM.
 * @param {Array<Object>} directoryStructure - The output from scanDirectory.
 * @returns {string} A text prompt for the LLM.
 */
function formatPromptForLLM(directoryStructure) {
  let prompt = "Analyze the following file and folder structure:\n\n";
  prompt += JSON.stringify(directoryStructure, (key, value) => {
    // Custom replacer to avoid overly verbose output or circular structures if any
    if (key === 'path' && typeof value === 'string') {
      // Optionally, you might want to simplify paths or make them relative
      // For now, keeping them as is, but be mindful of very long paths
    }
    return value;
  }, 2);

  prompt += "\n\nPlease suggest logical organization patterns to improve this structure. "
  prompt += "For each suggestion, explain your reasoning and list concrete actions "
  prompt += "(e.g., create new folders, move files/folders, rename items). "
  prompt += "Focus on clarity and ease of future navigation.";

  return prompt;
}

/**
 * Gets organization suggestions from an LLM.
 * @param {Array<Object>} directoryStructure - The output from scanDirectory.
 * @returns {Promise<Object>} An object containing the LLM's suggestions.
 */
async function getOrganizationSuggestions(directoryStructure) {
  const ollama = getOllama(); // You'll need to implement or import this
  const model = getOllamaModel(); // You'll need to implement or import this

  if (!ollama || !model) {
    console.error('Ollama instance or model not configured.');
    return {
      error: 'LLM not configured',
      suggestions: []
    };
  }

  const prompt = formatPromptForLLM(directoryStructure);

  try {
    console.log(`Sending prompt to LLM (${model}):\n`, prompt.substring(0, 500) + '...'); // Log a snippet
    
    // This is a placeholder for the actual Ollama API call
    // You'll need to replace this with the correct way to stream or get a response
    // from your Ollama setup, using the 'prompt' variable.
    const response = await ollama.generate({
      model: model,
      prompt: prompt,
      stream: false, // Set to true if you want to stream and handle chunks
      // Add any other parameters required by your Ollama setup (e.g. system prompt, options)
    });

    console.log('LLM response received.');

    // Basic parsing assuming the response.response is a string containing suggestions.
    // You'll likely need more sophisticated parsing based on how your LLM formats its output.
    // It's often better to ask the LLM to format its output as JSON if possible.
    const suggestionsText = response.response; 
    
    // For now, we'll return the raw text. Ideally, parse this into a structured array.
    return {
      suggestions: suggestionsText // Or parsedSuggestions (e.g., JSON.parse(suggestionsText))
    };

  } catch (error) {
    console.error('Error getting suggestions from LLM:', error);
    return {
      error: error.message || 'Failed to get suggestions from LLM',
      suggestions: []
    };
  }
}

module.exports = { getOrganizationSuggestions, formatPromptForLLM }; 