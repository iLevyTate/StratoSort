/**
 * Model Verification Service for AI-First Operations
 * Ensures required Ollama models are available before analysis
 */

const { Ollama } = require('ollama');
const { ModelMissingError, OllamaConnectionError } = require('../errors/AnalysisError');

class ModelVerifier {
  constructor(host = 'http://127.0.0.1:11434') {
    this.ollamaClient = new Ollama({ host });
    this.verifiedModels = new Set();
    this.lastCheck = null;
    this.cacheTimeout = 300000; // 5 minutes
    
    // Required models for different analysis types
    this.requiredModels = {
      'document': ['gemma3:4b', 'llama3.2', 'llama3'],
      'image': ['gemma3:4b', 'llava'],
      'audio': [], // Audio transcription not available through Ollama
      'all': ['gemma3:4b', 'llama3.2', 'llama3', 'llava']
    };
  }

  /**
   * Verify Ollama connection
   */
  async verifyConnection() {
    try {
      await this.ollamaClient.list();
      return true;
    } catch (error) {
      throw new OllamaConnectionError();
    }
  }

  /**
   * Get available models from Ollama
   */
  async getAvailableModels() {
    try {
      const response = await this.ollamaClient.list();
      return response.models.map(model => model.name);
    } catch (error) {
      throw new OllamaConnectionError();
    }
  }

  /**
   * Verify if a specific model is available
   */
  async verifyModel(modelName, useCache = true) {
    const now = Date.now();
    
    // Check cache first
    if (useCache && 
        this.verifiedModels.has(modelName) && 
        this.lastCheck && 
        (now - this.lastCheck) < this.cacheTimeout) {
      return true;
    }

    try {
      const availableModels = await this.getAvailableModels();
      const hasModel = availableModels.some(available => 
        available.includes(modelName) || modelName.includes(available.split(':')[0])
      );

      if (!hasModel) {
        throw new ModelMissingError(modelName);
      }

      // Update cache
      this.verifiedModels.add(modelName);
      this.lastCheck = now;
      
      console.log(`✅ Model verified: ${modelName}`);
      return true;
    } catch (error) {
      if (error instanceof ModelMissingError) {
        throw error;
      }
      throw new OllamaConnectionError();
    }
  }

  /**
   * Verify models required for specific analysis type
   */
  async verifyAnalysisType(analysisType) {
    const requiredModels = this.requiredModels[analysisType];
    
    if (!requiredModels) {
      throw new Error(`Unknown analysis type: ${analysisType}`);
    }

    const verificationPromises = requiredModels.map(model => 
      this.verifyModel(model).catch(error => ({ error, model }))
    );
    
    const results = await Promise.all(verificationPromises);
    const failures = results.filter(result => result.error);
    
    if (failures.length > 0) {
      // Try to find at least one working model for the analysis type
      const successfulModels = results.filter(result => !result.error);
      
      if (successfulModels.length === 0) {
        throw failures[0].error; // Throw first failure
      }
      
      console.log(`⚠️ Some models missing for ${analysisType}, but proceeding with available models`);
      return true;
    }
    
    console.log(`✅ All models verified for ${analysisType} analysis`);
    return true;
  }

  /**
   * Verify all required models
   */
  async verifyAllModels() {
    try {
      await this.verifyConnection();
      
      const availableModels = await this.getAvailableModels();
      console.log(`📋 Available models: ${availableModels.join(', ')}`);
      
      // Check for essential models
      const essentialModels = ['gemma3:4b', 'llama3.2', 'llama3', 'llava'];
      const missingEssential = [];
      
      for (const model of essentialModels) {
        const hasModel = availableModels.some(available => 
          available.includes(model) || model.includes(available.split(':')[0])
        );
        
        if (!hasModel) {
          missingEssential.push(model);
        } else {
          this.verifiedModels.add(model);
        }
      }
      
      if (missingEssential.length > 0) {
        console.log(`⚠️ Missing essential models: ${missingEssential.join(', ')}`);
        console.log(`💡 Install with: ${missingEssential.map(m => `ollama pull ${m}`).join(' && ')}`);
        
        // Only fail if NO models are available
        if (availableModels.length === 0) {
          throw new ModelMissingError(missingEssential[0]);
        }
      }
      
      this.lastCheck = Date.now();
      return {
        available: availableModels,
        missing: missingEssential,
        hasEssentials: missingEssential.length === 0
      };
      
    } catch (error) {
      if (error instanceof ModelMissingError || error instanceof OllamaConnectionError) {
        throw error;
      }
      throw new OllamaConnectionError();
    }
  }

  /**
   * Get recommended model for analysis type
   */
  getRecommendedModel(analysisType) {
    const recommendations = {
      'document': 'gemma3:4b',
      'image': 'gemma3:4b',
      'audio': null // Audio transcription not available through Ollama
    };
    
    return recommendations[analysisType] || 'gemma3:4b';
  }

  /**
   * Clear verification cache
   */
  clearCache() {
    this.verifiedModels.clear();
    this.lastCheck = null;
    console.log('🧹 Model verification cache cleared');
  }

  /**
   * Get cache status
   */
  getCacheStatus() {
    const now = Date.now();
    const isValid = this.lastCheck && (now - this.lastCheck) < this.cacheTimeout;
    
    return {
      verifiedModels: Array.from(this.verifiedModels),
      lastCheck: this.lastCheck,
      cacheValid: isValid,
      cacheAge: this.lastCheck ? now - this.lastCheck : null
    };
  }
}

module.exports = ModelVerifier; 