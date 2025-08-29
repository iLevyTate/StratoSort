const createPerfMonitor = require('../src/main/utils/perfMonitor');

describe('perfMonitor', () => {
  test('measure_sync returns value', () => {
    const logs = [];
    const mockLogger = {
      debug: (...args) => logs.push(args.join(' ')),
    };
    const perf = createPerfMonitor(mockLogger);
    const result = perf.measure('sync-test', () => {
      // simulate work
      for (let i = 0; i < 1000; i++);
      return 42;
    });
    expect(result).toBe(42);
  });

  test('measure_async returns resolved value', async () => {
    const mockLogger = {
      debug: () => {},
    };
    const perf = createPerfMonitor(mockLogger);
    const result = perf.measure('async-test', () => Promise.resolve(7));
    await expect(result).resolves.toBe(7);
  });

  test('mark does not throw', () => {
    const mockLogger = { debug: () => {} };
    const perf = createPerfMonitor(mockLogger);
    expect(() => perf.mark('foo')).not.toThrow();
  });
});
