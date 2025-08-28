const path = require('path');

describe('GpuManager', () => {
  const childProcess = require('child_process');
  let originalExecFile;

  beforeAll(() => {
    originalExecFile = childProcess.execFile;
  });

  afterAll(() => {
    childProcess.execFile = originalExecFile;
  });

  test('detectNvidiaGpus parses CSV output', async () => {
    childProcess.execFile = (cmd, args, opts, cb) => {
      cb(null, '0, GeForce RTX 3090\n1, Tesla V100\n', '');
    };

    const { detectNvidiaGpus } = require('../../src/main/services/GpuManager');
    const gpus = await detectNvidiaGpus();
    expect(Array.isArray(gpus)).toBe(true);
    expect(gpus).toEqual([
      { id: 0, name: 'GeForce RTX 3090' },
      { id: 1, name: 'Tesla V100' },
    ]);
  });

  test('initializeGpuEnvironment sets CUDA_VISIBLE_DEVICES and respects preferredGpuId', async () => {
    childProcess.execFile = (cmd, args, opts, cb) => {
      cb(null, '0, GPU-A\n1, GPU-B\n', '');
    };

    // clear env from previous runs
    delete process.env.CUDA_VISIBLE_DEVICES;
    delete process.env.OLLAMA_SKIP_CUDA_VISIBLE_DEVICES;

    const {
      initializeGpuEnvironment,
    } = require('../../src/main/services/GpuManager');
    const ok = await initializeGpuEnvironment({ preferredGpuId: 1 });
    expect(ok).toBe(true);
    expect(process.env.CUDA_VISIBLE_DEVICES).toBe('1');
  });

  test('initializeGpuEnvironment respects OLLAMA_SKIP_CUDA_VISIBLE_DEVICES', async () => {
    childProcess.execFile = (cmd, args, opts, cb) => {
      cb(null, '0, GPU-A\n', '');
    };

    process.env.OLLAMA_SKIP_CUDA_VISIBLE_DEVICES = 'true';
    delete process.env.CUDA_VISIBLE_DEVICES;

    const {
      initializeGpuEnvironment,
    } = require('../../src/main/services/GpuManager');
    const ok = await initializeGpuEnvironment({ preferredGpuId: 0 });
    expect(ok).toBe(true);
    // when skipped, we do not force CUDA_VISIBLE_DEVICES
    expect(process.env.CUDA_VISIBLE_DEVICES).toBeUndefined();
    delete process.env.OLLAMA_SKIP_CUDA_VISIBLE_DEVICES;
  });
});
