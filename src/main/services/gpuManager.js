// Compatibility wrapper for case-sensitive import paths.
// Some modules or build steps may require 'GpuManager' instead of 'gpuManager'.
module.exports = require('./gpuManager');

const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);

function log(message) {
  console.log(`[GpuManager] ${message}`);
}

async function detectNvidiaGpus() {
  try {
    const { stdout } = await execPromise('nvidia-smi -L');
    if (!stdout) return [];
    return stdout
      .trim()
      .split('\n')
      .map((line) => {
        const m = line.match(/^GPU (\d+):\s+(.+?)\s+\(UUID:/);
        if (m) return { id: Number(m[1]), name: m[2].trim() };
        return null;
      })
      .filter(Boolean);
  } catch (e) {
    log('nvidia-smi not available');
    return [];
  }
}

async function initializeGpuEnvironment({ preferredGpuId = null } = {}) {
  log('Initializing GPU environment');
  const gpus = await detectNvidiaGpus();
  if (!gpus || gpus.length === 0) {
    log('No NVIDIA GPUs detected');
    return false;
  }

  const selected =
    preferredGpuId !== null
      ? gpus.find((g) => g.id === preferredGpuId) || gpus[0]
      : gpus[0];

  // Allow explicit opt-out so advanced users or system-wide Ollama can manage GPU selection
  if (process.env.OLLAMA_SKIP_CUDA_VISIBLE_DEVICES === 'true') {
    log(
      'Skipping setting CUDA_VISIBLE_DEVICES due to OLLAMA_SKIP_CUDA_VISIBLE_DEVICES=true',
    );
    return true;
  }

  process.env.CUDA_VISIBLE_DEVICES = String(selected.id);
  log(`CUDA_VISIBLE_DEVICES=${process.env.CUDA_VISIBLE_DEVICES}`);
  return true;
}

module.exports = { initializeGpuEnvironment, detectNvidiaGpus };
