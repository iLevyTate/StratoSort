const { Ollama } = require('ollama');
const { withErrorLogging, withValidation } = require('./withErrorLogging');
let z; try { z = require('zod'); } catch { z = null; }

function registerOllamaIpc({ ipcMain, IPC_CHANNELS, logger, systemAnalytics, getOllama, getOllamaModel, getOllamaVisionModel, getOllamaEmbeddingModel, getOllamaHost }) {
  ipcMain.handle(IPC_CHANNELS.OLLAMA.GET_MODELS, withErrorLogging(logger, async () => {
    try {
      const ollama = getOllama();
      const response = await ollama.list();
      const models = response.models || [];
      const categories = { text: [], vision: [], embedding: [] };
      for (const m of models) {
        const name = m.name || '';
        if (/llava|vision|clip|sam/gi.test(name)) categories.vision.push(name); else if (/embed|embedding/gi.test(name)) categories.embedding.push(name); else categories.text.push(name);
      }
      // Ensure we update health on every models fetch
      systemAnalytics.ollamaHealth = { status: 'healthy', host: getOllamaHost ? getOllamaHost() : undefined, modelCount: models.length, lastCheck: Date.now() };
      return {
        models: models.map(m => m.name),
        categories,
        selected: { textModel: getOllamaModel(), visionModel: getOllamaVisionModel(), embeddingModel: typeof getOllamaEmbeddingModel === 'function' ? getOllamaEmbeddingModel() : null },
        ollamaHealth: systemAnalytics.ollamaHealth,
        host: typeof getOllamaHost === 'function' ? getOllamaHost() : undefined
      };
    } catch (error) {
      logger.error('[IPC] Error fetching Ollama models:', error);
      if (error.cause && error.cause.code === 'ECONNREFUSED') {
        systemAnalytics.ollamaHealth = { status: 'unhealthy', error: 'Connection refused. Ensure Ollama is running.', lastCheck: Date.now() };
      }
      return {
        models: [],
        categories: { text: [], vision: [], embedding: [] },
        selected: { textModel: getOllamaModel(), visionModel: getOllamaVisionModel(), embeddingModel: typeof getOllamaEmbeddingModel === 'function' ? getOllamaEmbeddingModel() : null },
        error: error.message,
        host: typeof getOllamaHost === 'function' ? getOllamaHost() : undefined,
        ollamaHealth: systemAnalytics.ollamaHealth
      };
    }
  }));

  const hostSchema = z ? z.string().url().or(z.string().length(0)).optional() : null;
  ipcMain.handle(IPC_CHANNELS.OLLAMA.TEST_CONNECTION, (z && hostSchema)
    ? withValidation(logger, hostSchema, async (event, hostUrl) => {
      try {
        const testUrl = hostUrl || 'http://127.0.0.1:11434';
        const testOllama = new Ollama({ host: testUrl });
        const response = await testOllama.list();
        systemAnalytics.ollamaHealth = { status: 'healthy', host: testUrl, modelCount: response.models.length, lastCheck: Date.now() };
        return { success: true, host: testUrl, modelCount: response.models.length, models: response.models.map(m => m.name), ollamaHealth: systemAnalytics.ollamaHealth };
      } catch (error) {
        logger.error('[IPC] Ollama connection test failed:', error);
        systemAnalytics.ollamaHealth = { status: 'unhealthy', host: hostUrl || 'http://localhost:11434', error: error.message, lastCheck: Date.now() };
        return { success: false, host: hostUrl || 'http://127.0.0.1:11434', error: error.message, ollamaHealth: systemAnalytics.ollamaHealth };
      }
    })
    : withErrorLogging(logger, async (event, hostUrl) => {
    try {
      const testUrl = hostUrl || 'http://127.0.0.1:11434';
      const testOllama = new Ollama({ host: testUrl });
      const response = await testOllama.list();
      systemAnalytics.ollamaHealth = { status: 'healthy', host: testUrl, modelCount: response.models.length, lastCheck: Date.now() };
      return { success: true, host: testUrl, modelCount: response.models.length, models: response.models.map(m => m.name), ollamaHealth: systemAnalytics.ollamaHealth };
    } catch (error) {
      logger.error('[IPC] Ollama connection test failed:', error);
      systemAnalytics.ollamaHealth = { status: 'unhealthy', host: hostUrl || 'http://localhost:11434', error: error.message, lastCheck: Date.now() };
      return { success: false, host: hostUrl || 'http://127.0.0.1:11434', error: error.message, ollamaHealth: systemAnalytics.ollamaHealth };
    }
    })
  );

  // Pull models (best-effort, returns status per model)
  ipcMain.handle(IPC_CHANNELS.OLLAMA.PULL_MODELS, withErrorLogging(logger, async (_event, models = []) => {
    try {
      const ollama = getOllama();
      const results = [];
      for (const model of Array.isArray(models) ? models : []) {
        try {
          await ollama.pull({ model });
          results.push({ model, success: true });
        } catch (e) {
          results.push({ model, success: false, error: e.message });
        }
      }
      return { success: true, results };
    } catch (error) {
      logger.error('[IPC] Pull models failed:', error);
      return { success: false, error: error.message };
    }
  }));
}

module.exports = registerOllamaIpc;


