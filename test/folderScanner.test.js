const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const { scanDirectory } = require('../src/main/folderScanner');

test('scanDirectory returns [] for non-existent directory', async () => {
  const result = await scanDirectory('/path/that/does/not/exist');
  expect(Array.isArray(result)).toBe(true);
  expect(result.length).toBe(0);
});

describe('scanDirectory symlink handling', () => {
  test('ignores symbolic links', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scan-'));

    const realFile = path.join(tmpDir, 'real.txt');
    await fs.writeFile(realFile, 'content');

    let symlinkPath;
    let symlinkCreated = false;

    try {
      // On Windows, symlink creation might fail due to permissions
      if (process.platform === 'win32') {
        // Try to create symlink, but don't fail the test if it doesn't work
        try {
          symlinkPath = path.join(tmpDir, 'link.txt');
          await fs.symlink(realFile, symlinkPath);
          symlinkCreated = true;
        } catch (symlinkError) {
          // If symlink creation fails on Windows, skip the symlink part of the test
          console.warn(
            'Symlink creation failed on Windows (requires elevated privileges):',
            symlinkError.message,
          );
        }
      } else {
        // On Unix-like systems, symlinks should work
        symlinkPath = path.join(tmpDir, 'link.txt');
        await fs.symlink(realFile, symlinkPath);
        symlinkCreated = true;
      }

      const items = await scanDirectory(tmpDir);

      await fs.rm(tmpDir, { recursive: true, force: true });

      const names = items.map((item) => item.name);
      expect(names).toContain('real.txt');

      if (symlinkCreated) {
        expect(names).not.toContain('link.txt');
        expect(items).toHaveLength(1);
      } else {
        // If symlink wasn't created, just verify the real file is found
        expect(items).toHaveLength(1);
      }
    } catch (error) {
      // Clean up on any error
      try {
        await fs.rm(tmpDir, { recursive: true, force: true });
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      throw error;
    }
  });
});
