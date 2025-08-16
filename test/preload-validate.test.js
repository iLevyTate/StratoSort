const { SecureIPCManager } = require('../src/preload/preload');

describe('preload: SecureIPCManager channel validation', () => {
  test('blocks unauthorized channel', async () => {
    const mgr = new SecureIPCManager();
    await expect(mgr.safeInvoke('unknown-channel')).rejects.toThrow(
      'Unauthorized IPC channel',
    );
  });
});
