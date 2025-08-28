const { app } = require('electron');

function log(msg) {
  try {
    const { logger } = require('../../shared/logger');
    logger.info(`[GpuAssertions] ${msg}`);
  } catch (e) {
    console.log(`[GpuAssertions] ${msg}`);
  }
}

/**
 * Non-fatal check for Electron/Chromium graphics pipeline availability.
 * Returns true if GPU appears usable for the renderer; false otherwise.
 */
function assertAppGraphics() {
  try {
    if (typeof app.getGPUFeatureStatus === 'function') {
      const status = app.getGPUFeatureStatus();
      log(`Electron GPU feature status: ${JSON.stringify(status)}`);

      // If critical features are disabled, consider graphics not available.
      const critical = [
        'gpu_compositing',
        'gpu_rasterization',
        '2d_canvas',
        'webgl',
      ];
      const unavailable = critical.filter(
        (k) => status[k] === 'disabled' || status[k] === 'unavailable',
      );
      if (unavailable.length > 0) {
        log(`Graphics: missing features: ${unavailable.join(', ')}`);
        return false;
      }
      return true;
    }
    log('app.getGPUFeatureStatus not available; assuming graphics available');
    return true;
  } catch (error) {
    log(`Graphics assertion failed: ${error.message}`);
    return false;
  }
}

/**
 * Configure CUDA-visible devices for Ollama. This is the Ollama-focused GPU assertion
 * and may throw if the machine cannot meet Ollama's GPU requirements.
 * @returns {Promise<boolean>} true when configured
 */
async function configureOllamaCuda({ preferredGpuId = null } = {}) {
  try {
    const gm = require('./gpuManager');
    const ok = await gm.initializeGpuEnvironment({ preferredGpuId });
    log(`Ollama CUDA configuration result: ${ok}`);
    return ok;
  } catch (error) {
    log(`Ollama CUDA configuration failed: ${error?.message || error}`);
    throw error;
  }
}

module.exports = { assertAppGraphics, configureOllamaCuda };
