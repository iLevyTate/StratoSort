const { logger } = require('../../shared/logger');
const {
  getOllama,
  getOllamaModel,
  getOllamaVisionModel,
  getOllamaEmbeddingModel,
  getOllamaHost,
  setOllamaModel,
  setOllamaVisionModel,
  setOllamaEmbeddingModel,
  setOllamaHost,
  loadOllamaConfig,
  saveOllamaConfig,
} = require('../ollamaUtils');
const { buildOllamaOptions } = require('./PerformanceService');
const systemAnalytics = require('../core/systemAnalytics');

/**
 * Centralized service for Ollama operations
 * Reduces code duplication and provides consistent error handling
 */
class OllamaService {
  constructor() {
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return { success: true };
    try {
      await loadOllamaConfig();
      this.initialized = true;
      logger.info('[OllamaService] Initialized successfully');
      return { success: true };
    } catch (error) {
      logger.error('[OllamaService] Failed to initialize:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get the current Ollama configuration
   */
  async getConfig() {
    const initResult = await this.initialize();
    if (!initResult.success) {
      return { success: false, error: initResult.error };
    }
    return {
      success: true,
      config: {
        host: getOllamaHost(),
        textModel: getOllamaModel(),
        visionModel: getOllamaVisionModel(),
        embeddingModel: getOllamaEmbeddingModel(),
      },
    };
  }

  /**
   * Update Ollama configuration
   */
  async updateConfig(config) {
    const initResult = await this.initialize();
    if (!initResult.success) {
      return { success: false, error: initResult.error };
    }
    try {
      if (config.host) await setOllamaHost(config.host);
      if (config.textModel) await setOllamaModel(config.textModel);
      if (config.visionModel) await setOllamaVisionModel(config.visionModel);
      if (config.embeddingModel)
        await setOllamaEmbeddingModel(config.embeddingModel);

      await saveOllamaConfig();
      logger.info('[OllamaService] Configuration updated');
      return { success: true };
    } catch (error) {
      logger.error('[OllamaService] Failed to update config:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Test connection to Ollama server
   */
  async testConnection(hostUrl) {
    try {
      const ollama = getOllama();
      const testHost = hostUrl || getOllamaHost();

      // Try to list models as a connection test
      const response = await ollama.list();
      const modelCount = response?.models?.length || 0;

      return {
        success: true,
        ollamaHealth: {
          status: 'healthy',
          modelCount,
          host: testHost,
        },
        modelCount,
      };
    } catch (error) {
      logger.error('[OllamaService] Connection test failed:', error);
      return {
        success: false,
        error: error.message,
        ollamaHealth: {
          status: 'unhealthy',
          error: error.message,
          host: hostUrl || getOllamaHost(),
        },
      };
    }
  }

  /**
   * Get available models organized by category
   */
  async getModels() {
    try {
      const ollama = getOllama();
      const response = await ollama.list();
      const models = response?.models || [];

      // Categorize models
      const categories = {
        text: [],
        vision: [],
        embedding: [],
      };

      models.forEach((model) => {
        const name = model.name || model;
        const lowerName = name.toLowerCase();

        // Categorize based on model name patterns
        if (lowerName.includes('embed') || lowerName.includes('mxbai')) {
          categories.embedding.push(name);
        } else if (
          lowerName.includes('llava') ||
          lowerName.includes('vision')
        ) {
          categories.vision.push(name);
        } else {
          categories.text.push(name);
        }
      });

      return {
        success: true,
        models,
        categories,
        selected: {
          textModel: getOllamaModel(),
          visionModel: getOllamaVisionModel(),
          embeddingModel: getOllamaEmbeddingModel(),
        },
        host: getOllamaHost(),
        ollamaHealth: {
          status: 'healthy',
          modelCount: models.length,
        },
      };
    } catch (error) {
      logger.error('[OllamaService] Failed to get models:', error);
      return {
        success: false,
        error: error.message,
        models: [],
        categories: { text: [], vision: [], embedding: [] },
        ollamaHealth: {
          status: 'unhealthy',
          error: error.message,
        },
      };
    }
  }

  /**
   * Pull models from Ollama registry
   */
  async pullModels(modelNames) {
    if (!Array.isArray(modelNames) || modelNames.length === 0) {
      return { success: false, error: 'No models specified', results: [] };
    }

    const results = [];
    const ollama = getOllama();

    for (const modelName of modelNames) {
      try {
        logger.info(`[OllamaService] Pulling model: ${modelName}`);
        await ollama.pull({ model: modelName });
        results.push({ model: modelName, success: true });
      } catch (error) {
        logger.error(`[OllamaService] Failed to pull ${modelName}:`, error);
        results.push({
          model: modelName,
          success: false,
          error: error.message,
        });
      }
    }

    return {
      success: results.some((r) => r.success),
      results,
    };
  }

  /**
   * Generate embeddings for text
   */
  async generateEmbedding(text, options = {}) {
    const startTime = Date.now();
    const model = options.model || getOllamaEmbeddingModel();
    const callId = `embed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Log queue status before enqueueing
    if (OllamaService._embedQueue) {
      logger.queueMetrics('embeddings', {
        running: OllamaService._embedQueue.running,
        queued: OllamaService._embedQueue.queue.length,
        maxConcurrent: OllamaService._embedQueue.maxConcurrent,
      });
    }

    try {
      const ollama = getOllama();

      // Get GPU-optimized performance options for embeddings
      const perfOptions = await buildOllamaOptions('embeddings');

      // Rate-limit embeddings: simple token bucket style using a per-process queue
      // Keep it lightweight — queue requests if too many concurrent embeddings
      if (!OllamaService._embedQueue) {
        OllamaService._embedQueue = { running: 0, maxConcurrent: 3, queue: [] };
      }

      const enqueue = () =>
        new Promise((resolve, reject) => {
          OllamaService._embedQueue.queue.push({
            text,
            model,
            options,
            perfOptions,
            resolve,
            reject,
            callId,
            enqueueTime: Date.now(),
          });
          process.nextTick(() => processEmbedQueue());
        });

      const processEmbedQueue = async () => {
        const q = OllamaService._embedQueue;
        if (q.running >= q.maxConcurrent) return;
        const item = q.queue.shift();
        if (!item) return;

        const queueWaitTime = Date.now() - item.enqueueTime;
        q.running++;

        // Log queue processing start
        logger.ollamaCall('embedding_start', item.model, 0, {
          callId: item.callId,
          queueWaitTime: `${queueWaitTime}ms`,
          queuePosition: q.queue.length,
          textLength: item.text?.length || 0,
        });

        try {
          const apiStartTime = Date.now();
          const response = await ollama.embeddings({
            model: item.model,
            prompt: (item.text || '').slice(0, 2048),
            options: {
              ...item.perfOptions,
              ...((item.options && item.options.ollamaOptions) || {}),
            },
          });
          const apiDuration = Date.now() - apiStartTime;

          // Log successful embedding
          logger.ollamaCall('embedding_success', item.model, apiDuration, {
            callId: item.callId,
            queueWaitTime: `${queueWaitTime}ms`,
            totalTime: `${Date.now() - item.enqueueTime}ms`,
            embeddingLength: response.embedding?.length || 0,
            textLength: item.text?.length || 0,
          });

          item.resolve(response);
        } catch (err) {
          const apiDuration = Date.now() - (item.enqueueTime + queueWaitTime);

          // Log failed embedding
          logger.ollamaCall('embedding_error', item.model, apiDuration, {
            callId: item.callId,
            queueWaitTime: `${queueWaitTime}ms`,
            error: err.message,
            textLength: item.text?.length || 0,
          });

          item.reject(err);
        } finally {
          q.running--;
          process.nextTick(() => processEmbedQueue());
        }
      };

      const response = await enqueue();
      const totalDuration = Date.now() - startTime;

      // Track successful Ollama call
      try {
        systemAnalytics.recordOllamaCall(
          'embedding',
          model,
          totalDuration,
          true,
          {
            callId,
            textLength: text?.length || 0,
          },
        );
      } catch (metricsError) {
        logger.debug(
          'Failed to record embedding metrics:',
          metricsError.message,
        );
      }

      return {
        success: true,
        embedding: response.embedding,
        metadata: {
          callId,
          model,
          totalDuration: `${totalDuration}ms`,
        },
      };
    } catch (error) {
      const totalDuration = Date.now() - startTime;

      // Track failed Ollama call
      try {
        systemAnalytics.recordOllamaCall(
          'embedding',
          model,
          totalDuration,
          false,
          {
            callId,
            error: error.message,
            textLength: text?.length || 0,
          },
        );
      } catch (metricsError) {
        logger.debug(
          'Failed to record embedding error metrics:',
          metricsError.message,
        );
      }

      logger.error('[OllamaService] Failed to generate embedding:', {
        callId,
        model,
        totalDuration: `${totalDuration}ms`,
        error: error.message,
        textLength: text?.length || 0,
      });

      return {
        success: false,
        error: error.message,
        metadata: {
          callId,
          model,
          totalDuration: `${totalDuration}ms`,
        },
      };
    }
  }

  /**
   * Analyze text with LLM
   */
  async analyzeText(prompt, options = {}) {
    const startTime = Date.now();
    const model = options.model || getOllamaModel();
    const callId = `text_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Log queue status before enqueueing
    if (OllamaService._genQueue) {
      logger.queueMetrics('text_generation', {
        running: OllamaService._genQueue.running,
        queued: OllamaService._genQueue.queue.length,
        maxConcurrent: OllamaService._genQueue.maxConcurrent,
      });
    }

    try {
      const ollama = getOllama();

      // Get GPU-optimized performance options for text tasks
      const perfOptions = await buildOllamaOptions('text');

      // Queue/limit concurrent generate requests to avoid overwhelming Ollama
      if (!OllamaService._genQueue) {
        OllamaService._genQueue = { running: 0, maxConcurrent: 2, queue: [] };
      }

      const enqueueGen = (payload) =>
        new Promise((resolve, reject) => {
          OllamaService._genQueue.queue.push({
            payload: {
              ...payload,
              callId,
              enqueueTime: Date.now(),
            },
            resolve,
            reject,
          });
          process.nextTick(() => processGenQueue());
        });

      const processGenQueue = async () => {
        const q = OllamaService._genQueue;
        if (q.running >= q.maxConcurrent) return;
        const item = q.queue.shift();
        if (!item) return;

        const queueWaitTime = Date.now() - item.payload.enqueueTime;
        q.running++;

        // Log queue processing start
        logger.ollamaCall('text_analysis_start', item.payload.model, 0, {
          callId: item.payload.callId,
          queueWaitTime: `${queueWaitTime}ms`,
          queuePosition: q.queue.length,
          promptLength: item.payload.prompt?.length || 0,
        });

        try {
          const apiStartTime = Date.now();
          const response = await ollama.generate({
            model: item.payload.model,
            prompt: item.payload.prompt,
            options: {
              ...item.payload.perfOptions,
              ...((item.payload.options &&
                item.payload.options.ollamaOptions) ||
                {}),
            },
            stream: false,
          });
          const apiDuration = Date.now() - apiStartTime;

          // Log successful text analysis
          logger.ollamaCall(
            'text_analysis_success',
            item.payload.model,
            apiDuration,
            {
              callId: item.payload.callId,
              queueWaitTime: `${queueWaitTime}ms`,
              totalTime: `${Date.now() - item.payload.enqueueTime}ms`,
              promptLength: item.payload.prompt?.length || 0,
              responseLength: response.response?.length || 0,
            },
          );

          item.resolve(response);
        } catch (err) {
          const apiDuration =
            Date.now() - (item.payload.enqueueTime + queueWaitTime);

          // Log failed text analysis
          logger.ollamaCall(
            'text_analysis_error',
            item.payload.model,
            apiDuration,
            {
              callId: item.payload.callId,
              queueWaitTime: `${queueWaitTime}ms`,
              error: err.message,
              promptLength: item.payload.prompt?.length || 0,
            },
          );

          item.reject(err);
        } finally {
          q.running--;
          process.nextTick(() => processGenQueue());
        }
      };

      const resp = await enqueueGen({ model, prompt, perfOptions, options });
      const totalDuration = Date.now() - startTime;

      // Track successful Ollama call
      try {
        systemAnalytics.recordOllamaCall(
          'text_analysis',
          model,
          totalDuration,
          true,
          {
            callId,
            promptLength: prompt?.length || 0,
            responseLength: resp.response?.length || 0,
          },
        );
      } catch (metricsError) {
        logger.debug(
          'Failed to record text analysis metrics:',
          metricsError.message,
        );
      }

      return {
        success: true,
        response: resp.response,
        metadata: {
          callId,
          model,
          totalDuration: `${totalDuration}ms`,
        },
      };
    } catch (error) {
      const totalDuration = Date.now() - startTime;

      // Track failed Ollama call
      try {
        systemAnalytics.recordOllamaCall(
          'text_analysis',
          model,
          totalDuration,
          false,
          {
            callId,
            error: error.message,
            promptLength: prompt?.length || 0,
          },
        );
      } catch (metricsError) {
        logger.debug(
          'Failed to record text analysis error metrics:',
          metricsError.message,
        );
      }

      logger.error('[OllamaService] Failed to analyze text:', {
        callId,
        model,
        totalDuration: `${totalDuration}ms`,
        error: error.message,
        promptLength: prompt?.length || 0,
      });

      return {
        success: false,
        error: error.message,
        metadata: {
          callId,
          model,
          totalDuration: `${totalDuration}ms`,
        },
      };
    }
  }

  /**
   * Analyze image with vision model
   */
  async analyzeImage(prompt, imageBase64, options = {}) {
    const startTime = Date.now();
    const model = options.model || getOllamaVisionModel();
    const callId = `vision_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Log queue status before enqueueing
    if (OllamaService._imgQueue) {
      logger.queueMetrics('vision_analysis', {
        running: OllamaService._imgQueue.running,
        queued: OllamaService._imgQueue.queue.length,
        maxConcurrent: OllamaService._imgQueue.maxConcurrent,
      });
    }

    try {
      const ollama = getOllama();

      // Get GPU-optimized performance options for vision tasks
      const perfOptions = await buildOllamaOptions('vision');

      // Queue image generate requests as they tend to be heavier
      if (!OllamaService._imgQueue) {
        OllamaService._imgQueue = { running: 0, maxConcurrent: 1, queue: [] };
      }

      const enqueueImg = (payload) =>
        new Promise((resolve, reject) => {
          OllamaService._imgQueue.queue.push({
            payload: {
              ...payload,
              callId,
              enqueueTime: Date.now(),
            },
            resolve,
            reject,
          });
          process.nextTick(() => processImgQueue());
        });

      const processImgQueue = async () => {
        const q = OllamaService._imgQueue;
        if (q.running >= q.maxConcurrent) return;
        const item = q.queue.shift();
        if (!item) return;

        const queueWaitTime = Date.now() - item.payload.enqueueTime;
        q.running++;

        // Log queue processing start
        logger.ollamaCall('vision_analysis_start', item.payload.model, 0, {
          callId: item.payload.callId,
          queueWaitTime: `${queueWaitTime}ms`,
          queuePosition: q.queue.length,
          promptLength: item.payload.prompt?.length || 0,
          imageSize: item.payload.imageBase64?.length || 0,
        });

        try {
          const apiStartTime = Date.now();
          const response = await ollama.generate({
            model: item.payload.model,
            prompt: item.payload.prompt,
            images: [item.payload.imageBase64],
            options: {
              ...item.payload.perfOptions,
              ...((item.payload.options &&
                item.payload.options.ollamaOptions) ||
                {}),
            },
            stream: false,
          });
          const apiDuration = Date.now() - apiStartTime;

          // Log successful vision analysis
          logger.ollamaCall(
            'vision_analysis_success',
            item.payload.model,
            apiDuration,
            {
              callId: item.payload.callId,
              queueWaitTime: `${queueWaitTime}ms`,
              totalTime: `${Date.now() - item.payload.enqueueTime}ms`,
              promptLength: item.payload.prompt?.length || 0,
              imageSize: item.payload.imageBase64?.length || 0,
              responseLength: response.response?.length || 0,
            },
          );

          item.resolve(response);
        } catch (err) {
          const apiDuration =
            Date.now() - (item.payload.enqueueTime + queueWaitTime);

          // Log failed vision analysis
          logger.ollamaCall(
            'vision_analysis_error',
            item.payload.model,
            apiDuration,
            {
              callId: item.payload.callId,
              queueWaitTime: `${queueWaitTime}ms`,
              error: err.message,
              promptLength: item.payload.prompt?.length || 0,
              imageSize: item.payload.imageBase64?.length || 0,
            },
          );

          item.reject(err);
        } finally {
          q.running--;
          process.nextTick(() => processImgQueue());
        }
      };

      const resp = await enqueueImg({
        model,
        prompt,
        imageBase64,
        perfOptions,
        options,
      });
      const totalDuration = Date.now() - startTime;

      // Track successful Ollama call
      try {
        systemAnalytics.recordOllamaCall(
          'vision_analysis',
          model,
          totalDuration,
          true,
          {
            callId,
            promptLength: prompt?.length || 0,
            imageSize: imageBase64?.length || 0,
            responseLength: resp.response?.length || 0,
          },
        );
      } catch (metricsError) {
        logger.debug(
          'Failed to record vision analysis metrics:',
          metricsError.message,
        );
      }

      return {
        success: true,
        response: resp.response,
        metadata: {
          callId,
          model,
          totalDuration: `${totalDuration}ms`,
        },
      };
    } catch (error) {
      const totalDuration = Date.now() - startTime;

      // Track failed Ollama call
      try {
        systemAnalytics.recordOllamaCall(
          'vision_analysis',
          model,
          totalDuration,
          false,
          {
            callId,
            error: error.message,
            promptLength: prompt?.length || 0,
            imageSize: imageBase64?.length || 0,
          },
        );
      } catch (metricsError) {
        logger.debug(
          'Failed to record vision analysis error metrics:',
          metricsError.message,
        );
      }

      logger.error('[OllamaService] Failed to analyze image:', {
        callId,
        model,
        totalDuration: `${totalDuration}ms`,
        error: error.message,
        promptLength: prompt?.length || 0,
        imageSize: imageBase64?.length || 0,
      });

      return {
        success: false,
        error: error.message,
        metadata: {
          callId,
          model,
          totalDuration: `${totalDuration}ms`,
        },
      };
    }
  }
}

// Export singleton instance
module.exports = new OllamaService();
