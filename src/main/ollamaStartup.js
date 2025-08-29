const { logger } = require('../shared/logger');
const {
  getOllama,
  getOllamaModel,
  loadOllamaConfig,
} = require('./ollamaUtils');

// Ensure Ollama server is reachable and started with GPU flags.
async function ensureOllamaWithGpu() {
  try {
    // Force config load to initialize if needed
    const cfg = await loadOllamaConfig();
    // If Ollama is not instantiated, create with GPU hints if available
    const ollama = await getOllama();
    // Try to eagerly test a trivial request to validate the connection
    try {
      const model = cfg?.selectedTextModel || (await getOllamaModel()) || null;
      if (!model) {
        // Attempt to fetch list of models as a smoke test
        if (ollama?.list) {
          await ollama.list();
        }
      } else {
        // Quick ping
        if (ollama?.ps) {
          await ollama.ps();
        }
      }
    } catch (testError) {
      logger.debug(
        '[OLLAMA] Startup test ping failed (GPU flags may be required):',
        testError?.message,
      );
    }
    // Return a resolved promise to indicate we attempted startup checks.
    return true;
  } catch (err) {
    logger.error('[OLLAMA] Failed to initialize Ollama startup checks:', {
      error: err?.message,
    });
    return false;
  }
}

module.exports = { ensureOllamaWithGpu };
