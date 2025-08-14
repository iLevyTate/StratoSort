const { Ollama } = require('ollama');
// const { buildOllamaOptions } = require('./services/PerformanceService');
const { app } = require('electron');
const fs = require('fs').promises;
const path = require('path');

// Path for storing Ollama configuration, e.g., selected model
const getOllamaConfigPath = () => {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'ollama-config.json');
};

let ollamaInstance = null;
let ollamaHost = 'http://127.0.0.1:11434';
// Selected models persisted in userData config
let selectedTextModel = null;
let selectedVisionModel = null;
let selectedEmbeddingModel = null;

// Function to initialize or get the Ollama instance
function getOllama() {
  if (!ollamaInstance) {
    // Host is configurable via environment variables or saved config
    ollamaInstance = new Ollama({ host: ollamaHost });
  }
  return ollamaInstance;
}

// Function to get the currently configured Ollama text model
function getOllamaModel() {
  return selectedTextModel;
}

// Function to get the currently configured Ollama vision model
function getOllamaVisionModel() {
  return selectedVisionModel;
}

function getOllamaEmbeddingModel() {
  return selectedEmbeddingModel;
}

// Function to set/update the Ollama model
async function setOllamaModel(modelName) {
  selectedTextModel = modelName;
  try {
    const current = await loadOllamaConfig();
    await saveOllamaConfig({
      ...current,
      selectedTextModel: modelName,
      // Keep legacy field for backward compatibility
      selectedModel: modelName
    });
    console.log(`[OLLAMA] Text model set to: ${modelName} and saved.`);
  } catch (error) {
    console.error(`[OLLAMA] Error saving text model selection:`, error);
  }
}

async function setOllamaVisionModel(modelName) {
  selectedVisionModel = modelName;
  try {
    const current = await loadOllamaConfig();
    await saveOllamaConfig({
      ...current,
      selectedVisionModel: modelName
    });
    console.log(`[OLLAMA] Vision model set to: ${modelName} and saved.`);
  } catch (error) {
    console.error(`[OLLAMA] Error saving vision model selection:`, error);
  }
}

async function setOllamaEmbeddingModel(modelName) {
  selectedEmbeddingModel = modelName;
  try {
    const current = await loadOllamaConfig();
    await saveOllamaConfig({
      ...current,
      selectedEmbeddingModel: modelName
    });
    console.log(`[OLLAMA] Embedding model set to: ${modelName} and saved.`);
  } catch (error) {
    console.error(`[OLLAMA] Error saving embedding model selection:`, error);
  }
}

function getOllamaHost() {
  return ollamaHost;
}

async function setOllamaHost(host) {
  try {
    if (typeof host === 'string' && host.trim()) {
      ollamaHost = host.trim();
      // Recreate client with new host
      ollamaInstance = new Ollama({ host: ollamaHost });
      const current = await loadOllamaConfig();
      await saveOllamaConfig({ ...current, host: ollamaHost });
      console.log(`[OLLAMA] Host set to: ${ollamaHost}`);
    }
  } catch (error) {
    console.error('[OLLAMA] Error setting host:', error);
  }
}

// Load Ollama configuration (e.g., last selected model)
async function loadOllamaConfig() {
  try {
    const filePath = getOllamaConfigPath();
    const data = await fs.readFile(filePath, 'utf-8');
    const config = JSON.parse(data);
    // Support legacy and new keys
    if (config.selectedTextModel || config.selectedModel) {
      selectedTextModel = config.selectedTextModel || config.selectedModel;
      console.log(`[OLLAMA] Loaded selected text model: ${selectedTextModel}`);
    }
    if (config.selectedVisionModel) {
      selectedVisionModel = config.selectedVisionModel;
      console.log(`[OLLAMA] Loaded selected vision model: ${selectedVisionModel}`);
    }
    if (config.selectedEmbeddingModel) {
      selectedEmbeddingModel = config.selectedEmbeddingModel;
      console.log(`[OLLAMA] Loaded selected embedding model: ${selectedEmbeddingModel}`);
    }
    if (config.host) {
      ollamaHost = config.host;
      ollamaInstance = new Ollama({ host: ollamaHost });
      console.log(`[OLLAMA] Loaded host: ${ollamaHost}`);
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
    if (!selectedTextModel) {
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
                console.log(`[OLLAMA] No saved text model found, defaulted to: ${selectedTextModel}`);
            } else {
                console.warn('[OLLAMA] No models available from Ollama server.');
            }
        } catch (listError) {
            console.error('[OLLAMA] Error fetching model list during initial load:', listError);
        }
    }
    return { selectedTextModel, selectedVisionModel, host: ollamaHost };
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
  // Backwards-compatible alias for modules expecting a client getter
  getOllamaClient: getOllama,
  getOllamaModel,
  getOllamaVisionModel,
  getOllamaEmbeddingModel,
  setOllamaModel,
  setOllamaVisionModel,
  setOllamaEmbeddingModel,
  getOllamaHost,
  setOllamaHost,
  getOllamaConfigPath,
  loadOllamaConfig,
  saveOllamaConfig,
}; 