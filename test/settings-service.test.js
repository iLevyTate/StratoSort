const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const fsSync = require('fs');
const { app } = require('electron');

const SettingsService = require('../src/main/services/SettingsService');

describe('SettingsService atomic save', () => {
  test('interrupted write leaves original file intact', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'settings-test-'));
    app.getPath.mockReturnValue(tempDir);

    const service = new SettingsService();
    const filePath = path.join(tempDir, 'settings.json');
    await fs.writeFile(filePath, JSON.stringify({ theme: 'dark' }, null, 2));

    const renameMock = jest
      .spyOn(fsSync.promises, 'rename')
      .mockRejectedValueOnce(new Error('simulated failure'));

    await expect(service.save({ theme: 'light' })).rejects.toThrow(
      'simulated failure',
    );

    const content = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    expect(content.theme).toBe('dark');

    renameMock.mockRestore();
  });
});
