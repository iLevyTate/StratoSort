const os = require('os');
const { spawn } = require('child_process');

/**
 * PerformanceService
 * - Detects system capabilities (CPU threads, GPU availability)
 * - Builds tuned Ollama options to maximize throughput, preferring GPU when available
 */

let cachedCapabilities = null;

async function detectNvidiaGpu() {
  return new Promise((resolve) => {
    try {
      const proc = spawn(
        process.platform === 'win32' ? 'nvidia-smi.exe' : 'nvidia-smi',
        ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'],
      );

      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d) => {
        stdout += d.toString();
      });
      proc.stderr.on('data', (d) => {
        stderr += d.toString();
      });
      proc.on('error', () => resolve({ hasNvidiaGpu: false }));
      proc.on('close', (code) => {
        if (code === 0 && stdout.trim()) {
          const lines = stdout.trim().split(/\r?\n/);
          const first = lines[0] || '';
          const [name, mem] = first.split(',').map((s) => s && s.trim());
          const gpuMemoryMB = Number(mem) || null;
          resolve({
            hasNvidiaGpu: true,
            gpuName: name || 'NVIDIA GPU',
            gpuMemoryMB,
          });
        } else {
          resolve({ hasNvidiaGpu: false });
        }
      });
    } catch {
      resolve({ hasNvidiaGpu: false });
    }
  });
}

async function detectSystemCapabilities() {
  if (cachedCapabilities) return cachedCapabilities;

  const cpuThreads = Array.isArray(os.cpus()) ? os.cpus().length : 4;
  const nvidia = await detectNvidiaGpu();

  cachedCapabilities = {
    cpuThreads,
    hasNvidiaGpu: Boolean(nvidia.hasNvidiaGpu),
    gpuName: nvidia.gpuName || null,
    gpuMemoryMB: nvidia.gpuMemoryMB || null,
  };
  return cachedCapabilities;
}

/**
 * Build Ollama generation options tuned for performance, preferring GPU when available.
 * task: 'text' | 'vision' | 'audio' | 'embeddings'
 */
async function buildOllamaOptions(task = 'text') {
  const caps = await detectSystemCapabilities();

  // Base threading and context
  const numThread = Math.max(2, Math.min(caps.cpuThreads || 4, 16));

  // Context window: keep moderate to avoid RAM spikes, tune by task
  let numCtx = 2048;
  if (task === 'vision') {
    numCtx = 2048;
  } else if (task === 'embeddings') {
    // Embeddings don't need large context windows
    numCtx = 512;
  }

  // Batch sizing – larger when GPU VRAM is available
  let numBatch = 256;
  if (caps.hasNvidiaGpu) {
    if ((caps.gpuMemoryMB || 0) >= 12000) numBatch = 512;
    else if ((caps.gpuMemoryMB || 0) >= 8000) numBatch = 384;
    else numBatch = 256;
  } else {
    numBatch = 128; // CPU-only safe default
  }

  // GPU offload hint – many Ollama backends accept num_gpu/num_gpu_layers; unknown keys are ignored
  // We set an aggressive hint when GPU is present.
  const gpuHints = caps.hasNvidiaGpu
    ? { num_gpu: 9999, num_gpu_layers: 9999 }
    : { num_gpu_layers: 0 };

  // mmap tends to help on desktop, mlock can cause permissions issues; leave disabled by default
  const memoryHints = { use_mmap: true, use_mlock: false };

  return {
    // Threading + context
    num_thread: numThread,
    num_ctx: numCtx,
    num_batch: numBatch,
    // GPU
    ...gpuHints,
    // Memory hints
    ...memoryHints,
  };
}

module.exports = {
  detectSystemCapabilities,
  buildOllamaOptions,
  detectNvidiaGpu, // Export for testing
};
