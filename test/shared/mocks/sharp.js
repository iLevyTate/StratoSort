/**
 * Mock for sharp package
 * Provides test-friendly mocks for image processing
 */

const mockSharp = jest.fn(() => ({
  resize: jest.fn().mockReturnThis(),
  toFormat: jest.fn().mockReturnThis(),
  toBuffer: jest.fn().mockResolvedValue(Buffer.from('mock-image-buffer')),
  metadata: jest.fn().mockResolvedValue({
    width: 1920,
    height: 1080,
    format: 'jpeg',
    size: 100000,
    channels: 3,
    density: 72,
  }),
  extract: jest.fn().mockReturnThis(),
  trim: jest.fn().mockReturnThis(),
  png: jest.fn().mockReturnThis(),
  jpeg: jest.fn().mockReturnThis(),
  webp: jest.fn().mockReturnThis(),
}));

// Static methods
mockSharp.cache = jest.fn();
mockSharp.concurrency = jest.fn();
mockSharp.counters = jest.fn().mockReturnValue({
  queue: 0,
  process: 0,
});

module.exports = mockSharp;
