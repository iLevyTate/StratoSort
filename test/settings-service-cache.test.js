const os = require('os');
const path = require('path');

describe('SettingsService cache', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('load uses cache within TTL and avoids extra disk reads', async () => {
    jest.doMock('electron', () => ({
      app: {
        getPath: () => path.join(os.tmpdir(), 'stratosort-test-settings'),
      },
    }));

    const fs = require('fs');
    const readSpy = jest.spyOn(fs.promises, 'readFile');

    const SettingsService = require('../src/main/services/SettingsService');
    const svc = new SettingsService();

    // First load: file may not exist -> defaults
    const s1 = await svc.load();
    // Save to create file
    const merged = await svc.save({ notifications: false, theme: 'light' });
    expect(merged.notifications).toBe(false);
    expect(merged.theme).toBe('light');

    readSpy.mockClear();
    const s2 = await svc.load();
    const s3 = await svc.load();

    // Within TTL, subsequent loads should not trigger readFile
    expect(readSpy).toHaveBeenCalledTimes(0);
    expect(s2.theme).toBe('light');
    expect(s3.notifications).toBe(false);
  });
});
