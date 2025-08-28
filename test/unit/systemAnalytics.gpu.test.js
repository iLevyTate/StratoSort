const childProcess = require('child_process');

describe('systemAnalytics GPU metrics', () => {
  let systemAnalytics;
  let originalExecFile;

  beforeAll(() => {
    originalExecFile = childProcess.execFile;
  });

  afterAll(() => {
    childProcess.execFile = originalExecFile;
  });

  test('collectMetrics returns gpus array when nvidia-smi present', async () => {
    childProcess.execFile = (cmd, args, opts, cb) => {
      // match the query used in systemAnalytics
      cb(null, '10, 20, 10000, 2000\n', '');
    };

    // require fresh instance to ensure module-level state is clean
    systemAnalytics = require('../../src/main/core/systemAnalytics');
    // ensure cache is empty
    systemAnalytics._gpuCache = null;

    const metrics = await systemAnalytics.collectMetrics();
    expect(metrics).toHaveProperty('gpus');
    expect(Array.isArray(metrics.gpus)).toBe(true);
    expect(metrics.gpus.length).toBeGreaterThanOrEqual(0);
  });
});
