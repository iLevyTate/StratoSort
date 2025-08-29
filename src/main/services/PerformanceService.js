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

      const cleanup = () => {
        // Ensure process is killed if still running
        if (!proc.killed) {
          proc.kill('SIGTERM');
        }
        // Remove all listeners to prevent memory leaks
        proc.stdout.removeAllListeners();
        proc.stderr.removeAllListeners();
        proc.removeAllListeners();
      };

      proc.on('error', () => {
        cleanup();
        resolve({ hasNvidiaGpu: false });
      });
      // Add timeout to prevent hanging processes
      const timeoutId = setTimeout(() => {
        cleanup();
        resolve({ hasNvidiaGpu: false });
      }, 5000);

      proc.on('close', (code) => {
        clearTimeout(timeoutId);
        cleanup();
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
  const numCtx = task === 'vision' ? 2048 : 2048;

  // Batch sizing – larger when GPU VRAM is available
  let numBatch = 256;
  if (caps.hasNvidiaGpu) {
    if ((caps.gpuMemoryMB || 0) >= 12000) numBatch = 512;
    else if ((caps.gpuMemoryMB || 0) >= 8000) numBatch = 384;
    else numBatch = 256;
  } else {
    numBatch = 128; // CPU-only safe default
  }

  // GPU offload hints – many Ollama backends accept gpu, num_gpu and num_gpu_layers.
  // Prefer realistic defaults rather than unbounded placeholders. Allow environment
  // overrides for advanced users.
  const envNumGpu = process.env.OLLAMA_NUM_GPU
    ? parseInt(process.env.OLLAMA_NUM_GPU, 10)
    : undefined;
  const envNumGpuLayers = process.env.OLLAMA_GPU_LAYERS
    ? parseInt(process.env.OLLAMA_GPU_LAYERS, 10)
    : undefined;

  const gpuHints = caps.hasNvidiaGpu
    ? {
        gpu: true,
        num_gpu: envNumGpu || 1,
        // choose sensible defaults based on GPU memory if not explicitly configured
        num_gpu_layers:
          typeof envNumGpuLayers === 'number'
            ? envNumGpuLayers
            : (caps.gpuMemoryMB || 0) >= 12000
              ? 40
              : (caps.gpuMemoryMB || 0) >= 8000
                ? 35
                : 20,
      }
    : { gpu: false, num_gpu_layers: 0 };

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

/**
 * Cleanup function to clear cached capabilities and any running processes
 */
function clearCache() {
  cachedCapabilities = null;
}

/**
 * Comprehensive cleanup for the PerformanceService
 */
function destroy() {
  clearCache();

  // Clear any module-level state that might need cleanup
  // Note: No active observers or intervals in this service currently
}

/**
 * Reset and re-detect capabilities (useful for testing or after system changes)
 */
async function resetCapabilities() {
  clearCache();
  return await detectSystemCapabilities();
}

module.exports = {
  detectSystemCapabilities,
  buildOllamaOptions,
  detectNvidiaGpu, // Export for testing
  clearCache, // Export for testing/manual cache clearing
  destroy, // Export for comprehensive cleanup
  resetCapabilities, // Export for resetting capabilities
};
