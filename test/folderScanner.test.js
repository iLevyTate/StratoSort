const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const { scanDirectory } = require('../src/main/folderScanner');

describe('scanDirectory symlink handling', () => {
  test('ignores symbolic links', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scan-'));

    const realFile = path.join(tmpDir, 'real.txt');
    await fs.writeFile(realFile, 'content');

    const symlinkPath = path.join(tmpDir, 'link.txt');
    await fs.symlink(realFile, symlinkPath);

    const items = await scanDirectory(tmpDir);

    await fs.rm(tmpDir, { recursive: true, force: true });

    const names = items.map((item) => item.name);
    expect(names).toContain('real.txt');
    expect(names).not.toContain('link.txt');
    expect(items).toHaveLength(1);
  });
});
