/**
 * Model Verification Service for AI-First Operations
 * Ensures required Ollama models are available before analysis
 */

const { Ollama } = require('ollama');
const { ModelMissingError, OllamaConnectionError } = require('../errors/AnalysisError');
const { DEFAULT_AI_MODELS } = require('../../shared/constants');

class ModelVerifier {
  constructor() {
    this.ollamaHost = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
    this.ollama = new Ollama({ host: this.ollamaHost });
    this.essentialModels = [
      DEFAULT_AI_MODELS.TEXT_ANALYSIS, // gemma3:4b
      DEFAULT_AI_MODELS.IMAGE_ANALYSIS, // gemma3:4b (multimodal)
      DEFAULT_AI_MODELS.AUDIO_ANALYSIS, // whisper
      'mxbai-embed-large' // For semantic search
    ];
    this.recommendedModels = [
      ...DEFAULT_AI_MODELS.FALLBACK_MODELS, // llama3.2, llama3, mistral, phi3
      'whisper:medium', // Better accuracy Whisper model
      'whisper:large' // Highest accuracy Whisper model
    ];
  }

  async checkOllamaConnection() {
    try {
      const response = await fetch(`${this.ollamaHost}/api/tags`);
      if (response.ok) {
        return { connected: true };
      }
      return { connected: false, error: 'HTTP error: ' + response.status };
    } catch (error) {
      return {
        connected: false,
        error: error.message,
        suggestion: 'Make sure Ollama is running. Use: ollama serve'
      };
    }
  }

  // Compatibility wrapper used by existing analysers
  async verifyConnection() {
    const status = await this.checkOllamaConnection();
    if (!status.connected) {
      throw new OllamaConnectionError(this.ollamaHost);
    }
    return true;
  }

  async getInstalledModels() {
    try {
      const models = await this.ollama.list();
      return {
        success: true,
        models: models.models || [],
        total: models.models?.length || 0
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        models: [],
        total: 0
      };
    }
  }

  async verifyEssentialModels() {
    console.log('[ModelVerifier] Checking essential models...');
    
    const connectionCheck = await this.checkOllamaConnection();
    if (!connectionCheck.connected) {
      return {
        success: false,
        error: 'Ollama connection failed',
        details: connectionCheck,
        missingModels: this.essentialModels
      };
    }

    const modelsResult = await this.getInstalledModels();
    if (!modelsResult.success) {
      return {
        success: false,
        error: 'Could not fetch model list',
        details: modelsResult,
        missingModels: this.essentialModels
      };
    }

    const installedModelNames = modelsResult.models.map(m => m.name.toLowerCase());
    const missingModels = [];
    const availableModels = [];

    for (const modelName of this.essentialModels) {
      const normalizedName = modelName.toLowerCase();
      const isInstalled = installedModelNames.some(installed => 
        installed === normalizedName || 
        installed.startsWith(normalizedName + ':') ||
        normalizedName.startsWith(installed.split(':')[0])
      );

      if (isInstalled) {
        availableModels.push(modelName);
      } else {
        missingModels.push(modelName);
      }
    }

    // Special check for Whisper models
    const whisperVariants = ['whisper', 'whisper:base', 'whisper:small', 'whisper:medium', 'whisper:large'];
    const hasWhisper = whisperVariants.some(variant => 
      installedModelNames.some(installed => 
        installed === variant.toLowerCase() || installed.startsWith('whisper')
      )
    );

    console.log(`[ModelVerifier] Found ${availableModels.length}/${this.essentialModels.length} essential models`);
    console.log(`[ModelVerifier] Whisper available: ${hasWhisper}`);

    return {
      success: missingModels.length === 0,
      availableModels,
      missingModels,
      hasWhisper,
      installationCommands: this.generateInstallCommands(missingModels),
      recommendations: this.generateRecommendations(missingModels, hasWhisper)
    };
  }

  // Compatibility wrapper around verifyEssentialModels used by analysers
  async verifyAnalysisType(type = 'document') {
    // Ensure connection first
    await this.verifyConnection();

    const result = await this.verifyEssentialModels();

    if (result.success || result.availableModels.length > 0) {
      return true;
    }

    // Fallback: allow recommended models if available
    const installed = await this.getInstalledModels();
    if (installed.success) {
      const installedNames = installed.models.map(m => m.name.toLowerCase());
      const hasRecommended = this.recommendedModels.some(rec =>
        installedNames.some(name =>
          name === rec.toLowerCase() ||
          name.startsWith(rec.toLowerCase() + ':') ||
          rec.toLowerCase().startsWith(name.split(':')[0])
        )
      );

      if (hasRecommended) {
        console.log(
          `[ModelVerifier] Proceeding with recommended model for ${type} analysis`
        );
        return true;
      }
    }

    throw new ModelMissingError(result.missingModels[0] || this.essentialModels[0]);
  }

  generateInstallCommands(missingModels) {
    if (missingModels.length === 0) return [];

    return [
      '# Install missing models with these commands:',
      '',
      ...missingModels.map(model => {
        // Special handling for Whisper
        if (model === 'whisper') {
          return [
            `ollama pull whisper`,
            `# Alternative Whisper models:`,
            `# ollama pull whisper:medium  # Better accuracy`,
            `# ollama pull whisper:large   # Highest accuracy`
          ].join('\n');
        }
        return `ollama pull ${model}`;
      }),
      '',
      '# Verify installation:',
      'ollama list'
    ];
  }

  generateRecommendations(missingModels, hasWhisper) {
    const recommendations = [];

    if (missingModels.includes('gemma3:4b')) {
      recommendations.push({
        type: 'critical',
        message: 'Gemma3:4b is required for document and image analysis',
        action: 'Run: ollama pull gemma3:4b'
      });
    }

    if (!hasWhisper) {
      recommendations.push({
        type: 'important',
        message: 'Whisper is required for audio transcription and analysis',
        action: 'Run: ollama pull whisper (or whisper:medium for better accuracy)'
      });
    }

    if (missingModels.includes('mxbai-embed-large')) {
      recommendations.push({
        type: 'feature',
        message: 'mxbai-embed-large enables semantic search capabilities',
        action: 'Run: ollama pull mxbai-embed-large'
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        type: 'success',
        message: 'All essential models are installed and ready!',
        action: null
      });
    }

    return recommendations;
  }

  async testModelFunctionality() {
    console.log('[ModelVerifier] Testing model functionality...');
    
    const tests = [];

    // Test text analysis
    try {
      const textTest = await this.ollama.generate({
        model: DEFAULT_AI_MODELS.TEXT_ANALYSIS,
        prompt: 'Respond with just "OK" if you can process this message.',
        options: { temperature: 0 }
      });
      
      tests.push({
        model: DEFAULT_AI_MODELS.TEXT_ANALYSIS,
        type: 'text',
        success: textTest.response?.toLowerCase().includes('ok'),
        response: textTest.response?.substring(0, 100)
      });
    } catch (error) {
      tests.push({
        model: DEFAULT_AI_MODELS.TEXT_ANALYSIS,
        type: 'text',
        success: false,
        error: error.message
      });
    }

    // Test Whisper (if available)
    try {
      // We can't easily test audio without a file, so just check if model responds
      const whisperTest = await this.ollama.list();
      const hasWhisper = whisperTest.models?.some(m => m.name.toLowerCase().includes('whisper'));
      
      tests.push({
        model: 'whisper',
        type: 'audio',
        success: hasWhisper,
        response: hasWhisper ? 'Model available' : 'Model not found'
      });
    } catch (error) {
      tests.push({
        model: 'whisper',
        type: 'audio',
        success: false,
        error: error.message
      });
    }

    // Test embeddings model
    try {
      const embeddingTest = await this.ollama.embeddings({
        model: 'mxbai-embed-large',
        prompt: 'test'
      });
      
      tests.push({
        model: 'mxbai-embed-large',
        type: 'embeddings',
        success: Array.isArray(embeddingTest.embedding) && embeddingTest.embedding.length > 0,
        response: `Generated ${embeddingTest.embedding?.length || 0} dimensions`
      });
    } catch (error) {
      tests.push({
        model: 'mxbai-embed-large',
        type: 'embeddings',
        success: false,
        error: error.message
      });
    }

    const successfulTests = tests.filter(t => t.success).length;
    console.log(`[ModelVerifier] ${successfulTests}/${tests.length} functionality tests passed`);

    return {
      success: successfulTests >= Math.ceil(tests.length * 0.5), // At least half should work
      tests,
      summary: {
        total: tests.length,
        successful: successfulTests,
        failed: tests.length - successfulTests
      }
    };
  }

  async getSystemStatus() {
    const connection = await this.checkOllamaConnection();
    const models = await this.verifyEssentialModels();
    const functionality = await this.testModelFunctionality();

    return {
      timestamp: new Date().toISOString(),
      connection,
      models,
      functionality,
      overall: {
        healthy: connection.connected && models.success && functionality.success,
        issues: [
          ...(!connection.connected ? ['Ollama not connected'] : []),
          ...(models.missingModels.length > 0 ? [`Missing models: ${models.missingModels.join(', ')}`] : []),
          ...(!functionality.success ? ['Model functionality issues'] : [])
        ]
      }
    };
  }
}

module.exports = ModelVerifier;
module.exports.ModelVerifier = ModelVerifier;
