/**
 * Model Manager Service - Universal Ollama Model Support
 * Ensures the application works with ANY available Ollama model
 */

const { Ollama } = require('ollama');
const { app } = require('electron');

const fs = require('fs').promises;
const path = require('path');

class ModelManager {
  constructor(host = 'http://127.0.0.1:11434') {
    this.ollamaClient = new Ollama({ host });
    this.host = host;
    this.availableModels = [];
    this.selectedModel = null;
    this.modelCapabilities = new Map();
    this.lastHealthCheck = null;
    this.configPath = path.join(app.getPath('userData'), 'model-config.json');
    
    // Model categories and their capabilities
    this.modelCategories = {
      'text': ['llama', 'mistral', 'phi', 'gemma', 'qwen', 'codellama', 'neural-chat', 'orca', 'vicuna', 'alpaca'],
      'vision': ['llava', 'bakllava', 'moondream', 'gemma3'],
      'code': ['codellama', 'codegemma', 'starcoder', 'deepseek-coder'],
      'chat': ['llama', 'mistral', 'phi', 'gemma', 'neural-chat', 'orca', 'vicuna']
    };
    
    // Fallback model preferences (in order of preference)
    this.fallbackPreferences = [
      'gemma3:4b', 'llama3.2', 'llama3.1', 'llama3', 'llama2',
      'mistral', 'phi3', 'phi', 'gemma2', 'gemma',
      'qwen2', 'qwen', 'neural-chat', 'orca-mini'
    ];
  }

  /**
   * Initialize the model manager
   */
  async initialize() {
    try {
      console.log('[MODEL-MANAGER] Initializing...');
      
      // Load saved configuration
      await this.loadConfig();
      
      // Discover available models
      await this.discoverModels();
      
      // Ensure we have a working model
      await this.ensureWorkingModel();
      
      console.log(`[MODEL-MANAGER] Initialized with model: ${this.selectedModel}`);
      return true;
    } catch (error) {
      console.error('[MODEL-MANAGER] Initialization failed:', error);
      return false;
    }
  }

  /**
   * Discover all available models from Ollama
   */
  async discoverModels() {
    try {
      const response = await this.ollamaClient.list();
      this.availableModels = response.models || [];
      
      // Analyze model capabilities
      for (const model of this.availableModels) {
        this.analyzeModelCapabilities(model);
      }
      
      console.log(`[MODEL-MANAGER] Discovered ${this.availableModels.length} models`);
      return this.availableModels;
    } catch (error) {
      console.error('[MODEL-MANAGER] Failed to discover models:', error);
      this.availableModels = [];
      return [];
    }
  }

  /**
   * Analyze what a model can do based on its name and metadata
   */
  analyzeModelCapabilities(model) {
    const modelName = model.name.toLowerCase();
    const capabilities = {
      text: false,
      vision: false,
      code: false,
      chat: false,
      size: model.size || 0,
      modified: model.modified_at || null
    };

    // Check capabilities based on model name patterns
    for (const [capability, patterns] of Object.entries(this.modelCategories)) {
      capabilities[capability] = patterns.some((pattern) => 
        modelName.includes(pattern.toLowerCase())
      );
    }

    // Special cases
    if (modelName.includes('llava') || modelName.includes('vision') || modelName.includes('gemma3')) {
      capabilities.vision = true;
    }
    
    if (modelName.includes('code') || modelName.includes('coder')) {
      capabilities.code = true;
    }

    // Most models can do basic text and chat
    if (!capabilities.vision && !capabilities.code) {
      capabilities.text = true;
      capabilities.chat = true;
    }

    this.modelCapabilities.set(model.name, capabilities);
    return capabilities;
  }

  /**
   * Ensure we have a working model selected
   */
  async ensureWorkingModel() {
    // If we have a selected model, verify it still exists
    if (this.selectedModel) {
      const modelExists = this.availableModels.some((m) => m.name === this.selectedModel);
      if (modelExists && await this.testModel(this.selectedModel)) {
        console.log(`[MODEL-MANAGER] Using existing model: ${this.selectedModel}`);
        return this.selectedModel;
      }
    }

    // Find the best available model
    const bestModel = await this.findBestModel();
    if (bestModel) {
      await this.setSelectedModel(bestModel);
      return bestModel;
    }

    throw new Error('No working Ollama models found');
  }

  /**
   * Find the best available model based on preferences and capabilities
   */
  async findBestModel() {
    if (this.availableModels.length === 0) {
      return null;
    }

    // Try preferred models first
    for (const preferred of this.fallbackPreferences) {
      const model = this.availableModels.find((m) => 
        m.name.toLowerCase().includes(preferred.toLowerCase())
      );
      
      if (model && await this.testModel(model.name)) {
        console.log(`[MODEL-MANAGER] Selected preferred model: ${model.name}`);
        return model.name;
      }
    }

    // If no preferred model works, try any text-capable model
    for (const model of this.availableModels) {
      const capabilities = this.modelCapabilities.get(model.name);
      if (capabilities && (capabilities.text || capabilities.chat)) {
        if (await this.testModel(model.name)) {
          console.log(`[MODEL-MANAGER] Selected fallback model: ${model.name}`);
          return model.name;
        }
      }
    }

    // Last resort: try the first available model
    const firstModel = this.availableModels[0];
    if (await this.testModel(firstModel.name)) {
      console.log(`[MODEL-MANAGER] Selected first available model: ${firstModel.name}`);
      return firstModel.name;
    }

    return null;
  }

  /**
   * Test if a model is working
   */
  async testModel(modelName, timeout = 10000) {
    try {
      console.log(`[MODEL-MANAGER] Testing model: ${modelName}`);
      
      const testPromise = this.ollamaClient.generate({
        model: modelName,
        prompt: 'Hello',
        options: {
          num_predict: 5,
          temperature: 0.1
        }
      });

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Model test timeout')), timeout)
      );

      await Promise.race([testPromise, timeoutPromise]);
      console.log(`[MODEL-MANAGER] Model ${modelName} is working`);
      return true;
    } catch (error) {
      console.log(`[MODEL-MANAGER] Model ${modelName} failed test: ${error.message}`);
      return false;
    }
  }

  /**
   * Get the best model for a specific task
   */
  getBestModelForTask(task = 'text') {
    if (!this.selectedModel) {
      return null;
    }

    // For now, return the selected model for all tasks
    // In the future, we could have task-specific model selection
    const capabilities = this.modelCapabilities.get(this.selectedModel);
    
    switch (task) {
      case 'vision':
      case 'image':
        // Look for vision-capable models
        for (const model of this.availableModels) {
          const caps = this.modelCapabilities.get(model.name);
          if (caps && caps.vision) {
            return model.name;
          }
        }
        // Fallback to selected model if no vision model available
        return this.selectedModel;
        
      case 'code':
        // Look for code-capable models
        for (const model of this.availableModels) {
          const caps = this.modelCapabilities.get(model.name);
          if (caps && caps.code) {
            return model.name;
          }
        }
        // Fallback to selected model
        return this.selectedModel;
        
      default:
        return this.selectedModel;
    }
  }

  /**
   * Set the selected model
   */
  async setSelectedModel(modelName) {
    if (!this.availableModels.some((m) => m.name === modelName)) {
      throw new Error(`Model ${modelName} is not available`);
    }

    this.selectedModel = modelName;
    await this.saveConfig();
    console.log(`[MODEL-MANAGER] Selected model set to: ${modelName}`);
  }

  /**
   * Get model information
   */
  getModelInfo(modelName = null) {
    const targetModel = modelName || this.selectedModel;
    if (!targetModel) return null;

    const model = this.availableModels.find((m) => m.name === targetModel);
    const capabilities = this.modelCapabilities.get(targetModel);

    return {
      name: targetModel,
      size: model?.size || 0,
      modified: model?.modified_at || null,
      capabilities: capabilities || {},
      isSelected: targetModel === this.selectedModel
    };
  }

  /**
   * Generate text with automatic fallback
   */
  async generateWithFallback(prompt, options = {}) {
    const modelsToTry = [
      this.selectedModel,
      ...this.fallbackPreferences.filter((p) => 
        this.availableModels.some((m) => m.name.includes(p))
      )
    ].filter(Boolean);

    for (const modelName of modelsToTry) {
      try {
        console.log(`[MODEL-MANAGER] Attempting generation with: ${modelName}`);
        
        const response = await this.ollamaClient.generate({
          model: modelName,
          prompt,
          options: {
            temperature: 0.1,
            num_predict: 500,
            ...options
          }
        });

        if (response.response && response.response.trim()) {
          return {
            response: response.response,
            model: modelName,
            success: true
          };
        }
      } catch (error) {
        console.log(`[MODEL-MANAGER] Model ${modelName} failed: ${error.message}`);
        continue;
      }
    }

    throw new Error('All models failed to generate response');
  }

  /**
   * Load configuration from disk
   */
  async loadConfig() {
    try {
      const data = await fs.readFile(this.configPath, 'utf-8');
      const config = JSON.parse(data);
      this.selectedModel = config.selectedModel || null;
      console.log(`[MODEL-MANAGER] Loaded config: ${this.selectedModel}`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('[MODEL-MANAGER] Error loading config:', error);
      }
    }
  }

  /**
   * Save configuration to disk
   */
  async saveConfig() {
    try {
      const config = {
        selectedModel: this.selectedModel,
        lastUpdated: new Date().toISOString()
      };
      await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
    } catch (error) {
      console.error('[MODEL-MANAGER] Error saving config:', error);
    }
  }

  /**
   * Get health status
   */
  async getHealthStatus() {
    try {
      const models = await this.discoverModels();
      const selectedWorking = this.selectedModel ? 
        await this.testModel(this.selectedModel) : false;

      return {
        connected: true,
        modelsAvailable: models.length,
        selectedModel: this.selectedModel,
        selectedModelWorking: selectedWorking,
        lastCheck: new Date().toISOString()
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message,
        modelsAvailable: 0,
        selectedModel: null,
        selectedModelWorking: false,
        lastCheck: new Date().toISOString()
      };
    }
  }

  /**
   * Get all available models with their capabilities
   */
  getAllModelsWithCapabilities() {
    return this.availableModels.map((model) => ({
      name: model.name,
      size: model.size,
      modified: model.modified_at,
      capabilities: this.modelCapabilities.get(model.name) || {},
      isSelected: model.name === this.selectedModel
    }));
  }
}

module.exports = ModelManager; 