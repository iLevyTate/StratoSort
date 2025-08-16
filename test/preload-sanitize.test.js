const { SecureIPCManager } = require('../src/preload/preload');

describe('SecureIPCManager sanitization', () => {
  let manager;

  beforeEach(() => {
    manager = new SecureIPCManager();
  });

  test('sanitizes nested payloads', () => {
    const payload = [
      {
        level1: {
          level2: '<img src="x" onerror="alert(1)">',
        },
      },
    ];
    const [sanitized] = manager.sanitizeArguments(payload);
    expect(sanitized.level1.level2).toBe('');
  });

  test('strips dangerous attributes', () => {
    const payload = ['<div onclick="evil()" data-id="1">safe</div>'];
    const [sanitized] = manager.sanitizeArguments(payload);
    expect(sanitized).toBe('safe');
  });

  test('handles malformed html', () => {
    const payload = ['<img src=x onerror="alert(1)><script>alert(1)</script>'];
    const [sanitized] = manager.sanitizeArguments(payload);
    expect(sanitized).toBe('');
  });
});
