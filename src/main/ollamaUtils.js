const { Ollama } = require('ollama');
const { app } = require('electron');
const fs = require('fs').promises;
const path = require('path');

// Path for storing Ollama configuration, e.g., selected model
const getOllamaConfigPath = () => {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'ollama-config.json');
};

let ollamaInstance = null;
let ollamaModel = null; // To store the currently selected/configured model

// Function to initialize or get the Ollama instance
function getOllama() {
  if (!ollamaInstance) {
    // Host is configurable via environment variables
    ollamaInstance = new Ollama({ host: 'http://127.0.0.1:11434' });
  }
  return ollamaInstance;
}

// Function to get the currently configured Ollama model
function getOllamaModel() {
  return ollamaModel;
}

// Function to set/update the Ollama model
async function setOllamaModel(modelName) {
  ollamaModel = modelName;
  try {
    await saveOllamaConfig({ selectedModel: modelName });
    console.log(`[OLLAMA] Model set to: ${modelName} and saved.`);
  } catch (error) {
    console.error(`[OLLAMA] Error saving model selection:`, error);
  }
}

// Load Ollama configuration (e.g., last selected model)
async function loadOllamaConfig() {
  try {
    const filePath = getOllamaConfigPath();
    const data = await fs.readFile(filePath, 'utf-8');
    const config = JSON.parse(data);
    if (config.selectedModel) {
      ollamaModel = config.selectedModel;
      console.log(`[OLLAMA] Loaded selected model: ${ollamaModel}`);
    }
    return config;
  } catch (error) {
    // It's okay if the file doesn't exist on first run
    if (error.code !== 'ENOENT') {
      console.error('[OLLAMA] Error loading Ollama config:', error);
    }
    // Fallback to a default model or leave as null if no configuration is found
    // You might want to fetch available models and pick one if ollamaModel is still null
    // For now, let's assume a default if nothing is loaded.
    if (!ollamaModel) {
        // Try to get the first available model or a known default
        try {
            const ollama = getOllama();
            const modelsResponse = await ollama.list();
            if (modelsResponse.models && modelsResponse.models.length > 0) {
                // Prioritize models like 'llama2', 'mistral', or common ones
                const preferredModels = ['llama3', 'llama2', 'mistral', 'phi'];
                let foundModel = null;
                for (const prefModel of preferredModels) {
                    const model = modelsResponse.models.find(m => m.name.includes(prefModel));
                    if (model) {
                        foundModel = model.name;
                        break;
                    }
                }
                if (!foundModel) {
                     foundModel = modelsResponse.models[0].name; // Fallback to the first model
                }
                await setOllamaModel(foundModel);
                console.log(`[OLLAMA] No saved model found, defaulted to: ${ollamaModel}`);
            } else {
                console.warn('[OLLAMA] No models available from Ollama server.');
            }
        } catch (listError) {
            console.error('[OLLAMA] Error fetching model list during initial load:', listError);
        }
    }
    return { selectedModel: ollamaModel }; 
  }
}

// Save Ollama configuration
async function saveOllamaConfig(config) {
  try {
    const filePath = getOllamaConfigPath();
    await fs.writeFile(filePath, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('[OLLAMA] Error saving Ollama config:', error);
    throw error; // Re-throw to indicate save failure
  }
}

module.exports = {
  getOllama,
  getOllamaModel,
  setOllamaModel,
  loadOllamaConfig,
  saveOllamaConfig,
}; 