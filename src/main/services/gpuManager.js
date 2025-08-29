const { execFile } = require('child_process');
const util = require('util');
const { logger } = require('../../shared/logger');

const execFilePromise = util.promisify(execFile);

// Exported for testing
function parseNvidiaSmiOutput(stdout) {
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
}

async function detectNvidiaGpus() {
  try {
    const { stdout } = await execFilePromise('nvidia-smi', ['-L']);
    return parseNvidiaSmiOutput(stdout);
  } catch (e) {
    logger.debug('nvidia-smi not available');
    return [];
  }
}

async function initializeGpuEnvironment({ preferredGpuId = null } = {}) {
  logger.debug('Initializing GPU environment');
  const gpus = await detectNvidiaGpus();
  if (!gpus || gpus.length === 0) {
    logger.debug('No NVIDIA GPUs detected');
    return false;
  }

  const selected =
    preferredGpuId !== null
      ? gpus.find((g) => g.id === preferredGpuId) || gpus[0]
      : gpus[0];

  // Allow explicit opt-out so advanced users or system-wide Ollama can manage GPU selection
  if (process.env.OLLAMA_SKIP_CUDA_VISIBLE_DEVICES === 'true') {
    logger.debug(
      'Skipping setting CUDA_VISIBLE_DEVICES due to OLLAMA_SKIP_CUDA_VISIBLE_DEVICES=true',
    );
    return true;
  }

  process.env.CUDA_VISIBLE_DEVICES = String(selected.id);
  logger.debug(`CUDA_VISIBLE_DEVICES=${process.env.CUDA_VISIBLE_DEVICES}`);
  return true;
}

module.exports = {
  initializeGpuEnvironment,
  detectNvidiaGpus,
  parseNvidiaSmiOutput,
};
