describe('GpuManager', () => {
  test('parseNvidiaSmiOutput parses nvidia-smi output correctly', () => {
    const {
      parseNvidiaSmiOutput,
    } = require('../../src/main/services/GpuManager');

    const mockOutput =
      'GPU 0: GeForce RTX 3090 (UUID: GPU-12345678-1234-1234-1234-123456789012)\nGPU 1: Tesla V100 (UUID: GPU-87654321-4321-4321-4321-210987654321)\n';

    const result = parseNvidiaSmiOutput(mockOutput);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([
      { id: 0, name: 'GeForce RTX 3090' },
      { id: 1, name: 'Tesla V100' },
    ]);
  });

  test('parseNvidiaSmiOutput handles empty output', () => {
    const {
      parseNvidiaSmiOutput,
    } = require('../../src/main/services/GpuManager');

    expect(parseNvidiaSmiOutput('')).toEqual([]);
    expect(parseNvidiaSmiOutput(null)).toEqual([]);
    expect(parseNvidiaSmiOutput(undefined)).toEqual([]);
  });

  test('parseNvidiaSmiOutput handles malformed lines', () => {
    const {
      parseNvidiaSmiOutput,
    } = require('../../src/main/services/GpuManager');

    const mockOutput =
      'GPU 0: GeForce RTX 3090 (UUID: GPU-12345678-1234-1234-1234-123456789012)\nSome invalid line\nGPU 1: Tesla V100 (UUID: GPU-87654321-4321-4321-4321-210987654321)\n';

    const result = parseNvidiaSmiOutput(mockOutput);

    expect(result).toEqual([
      { id: 0, name: 'GeForce RTX 3090' },
      { id: 1, name: 'Tesla V100' },
    ]);
  });
});
