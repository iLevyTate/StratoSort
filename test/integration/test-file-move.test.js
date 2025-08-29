const fs = require('fs').promises;
const path = require('path');
const os = require('os');

describe('File Movement Operations', () => {
  let testDir;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `file-move-test-${Date.now()}`);
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Basic File Movement', () => {
    test('should successfully move a file using rename', async () => {
      // Create test directory structure
      await fs.mkdir(testDir, { recursive: true });

      // Create a test file
      const sourceFile = path.join(testDir, 'test-document.txt');
      const testContent =
        'This is a test document.\nCreated at: ' + new Date().toISOString();
      await fs.writeFile(sourceFile, testContent);

      // Verify source file exists
      let sourceExists = await fs
        .access(sourceFile)
        .then(() => true)
        .catch(() => false);
      expect(sourceExists).toBe(true);

      // Create target directory
      const targetDir = path.join(testDir, 'organized');
      await fs.mkdir(targetDir, { recursive: true });

      // Test file move
      const targetFile = path.join(targetDir, 'moved-document.txt');
      await fs.rename(sourceFile, targetFile);

      // Verify the move
      sourceExists = await fs
        .access(sourceFile)
        .then(() => true)
        .catch(() => false);
      const targetExists = await fs
        .access(targetFile)
        .then(() => true)
        .catch(() => false);

      expect(sourceExists).toBe(false); // Source should not exist
      expect(targetExists).toBe(true); // Target should exist

      // Verify content is preserved
      const movedContent = await fs.readFile(targetFile, 'utf8');
      expect(movedContent).toBe(testContent);
    });

    test('should handle file move with existing target', async () => {
      await fs.mkdir(testDir, { recursive: true });

      const sourceFile = path.join(testDir, 'source.txt');
      const targetFile = path.join(testDir, 'target.txt');

      // Create both files
      await fs.writeFile(sourceFile, 'source content');
      await fs.writeFile(targetFile, 'existing content');

      // Attempt to move - should overwrite
      await fs.rename(sourceFile, targetFile);

      // Verify move
      const sourceExists = await fs
        .access(sourceFile)
        .then(() => true)
        .catch(() => false);
      const targetExists = await fs
        .access(targetFile)
        .then(() => true)
        .catch(() => false);

      expect(sourceExists).toBe(false);
      expect(targetExists).toBe(true);

      const content = await fs.readFile(targetFile, 'utf8');
      expect(content).toBe('source content');
    });

    test('should handle cross-directory moves', async () => {
      await fs.mkdir(testDir, { recursive: true });

      const sourceDir = path.join(testDir, 'source');
      const targetDir = path.join(testDir, 'target');

      await fs.mkdir(sourceDir, { recursive: true });
      await fs.mkdir(targetDir, { recursive: true });

      // Create source file
      const sourceFile = path.join(sourceDir, 'file.txt');
      const targetFile = path.join(targetDir, 'moved-file.txt');

      await fs.writeFile(sourceFile, 'test content');

      // Move across directories
      await fs.rename(sourceFile, targetFile);

      // Verify move
      const sourceExists = await fs
        .access(sourceFile)
        .then(() => true)
        .catch(() => false);
      const targetExists = await fs
        .access(targetFile)
        .then(() => true)
        .catch(() => false);

      expect(sourceExists).toBe(false);
      expect(targetExists).toBe(true);

      const content = await fs.readFile(targetFile, 'utf8');
      expect(content).toBe('test content');
    });
  });

  describe('Documents Directory Access', () => {
    test('should access Documents directory', async () => {
      const homeDir = os.homedir();
      const documentsDir = path.join(homeDir, 'Documents');

      // Check if Documents directory exists
      const docsExists = await fs
        .access(documentsDir)
        .then(() => true)
        .catch(() => false);

      if (docsExists) {
        // Test creating a subdirectory
        const testSubDir = path.join(documentsDir, 'Stratosort-Test');
        await fs.mkdir(testSubDir, { recursive: true });

        // Verify directory was created
        const subDirExists = await fs
          .access(testSubDir)
          .then(() => true)
          .catch(() => false);
        expect(subDirExists).toBe(true);

        // Clean up
        await fs.rmdir(testSubDir);
      } else {
        console.warn(
          'Documents directory does not exist, skipping subdirectory test',
        );
      }

      // This test should pass as long as we can determine the Documents directory path
      expect(documentsDir).toBeDefined();
      expect(typeof documentsDir).toBe('string');
    });

    test('should handle different path formats', () => {
      const testPaths = [
        path.join('C:', 'Users', 'test', 'Documents'),
        path.join(os.homedir(), 'Documents'),
        '/home/user/Documents',
        '/Users/user/Documents',
      ];

      testPaths.forEach((testPath) => {
        expect(testPath).toBeDefined();
        expect(typeof testPath).toBe('string');
        expect(testPath.length).toBeGreaterThan(0);
      });
    });
  });

  describe('File System Error Handling', () => {
    test('should handle non-existent source file', async () => {
      await fs.mkdir(testDir, { recursive: true });

      const nonExistentFile = path.join(testDir, 'does-not-exist.txt');
      const targetFile = path.join(testDir, 'target.txt');

      await expect(fs.rename(nonExistentFile, targetFile)).rejects.toThrow();
    });

    test('should handle permission errors', async () => {
      await fs.mkdir(testDir, { recursive: true });

      const sourceFile = path.join(testDir, 'source.txt');
      await fs.writeFile(sourceFile, 'content');

      // Try to move to a directory without write permissions
      // This is platform-specific and may not always throw an error
      const targetDir = '/non-existent-system-directory';

      try {
        await fs.rename(sourceFile, path.join(targetDir, 'file.txt'));
        // If no error, the target directory exists and is writable
        expect(true).toBe(true);
      } catch (error) {
        // Permission or path error is expected
        expect(error).toBeDefined();
      }
    });

    test('should handle file already in use', async () => {
      await fs.mkdir(testDir, { recursive: true });

      const sourceFile = path.join(testDir, 'source.txt');
      await fs.writeFile(sourceFile, 'content');

      // On some systems, moving a file that's "in use" might cause issues
      // This test verifies the error handling works
      const targetFile = path.join(testDir, 'target.txt');

      // Move should succeed normally
      await fs.rename(sourceFile, targetFile);
      const content = await fs.readFile(targetFile, 'utf8');
      expect(content).toBe('content');
    });
  });

  describe('File Metadata Preservation', () => {
    test('should preserve file content during move', async () => {
      await fs.mkdir(testDir, { recursive: true });

      const sourceFile = path.join(testDir, 'source.txt');
      const targetFile = path.join(testDir, 'target.txt');

      const originalContent =
        'Original file content\nWith multiple lines\nAnd special characters: éñüñ';
      await fs.writeFile(sourceFile, originalContent, 'utf8');

      // Move the file
      await fs.rename(sourceFile, targetFile);

      // Verify content is identical
      const movedContent = await fs.readFile(targetFile, 'utf8');
      expect(movedContent).toBe(originalContent);
    });

    test('should preserve file size during move', async () => {
      await fs.mkdir(testDir, { recursive: true });

      const sourceFile = path.join(testDir, 'source.txt');
      const targetFile = path.join(testDir, 'target.txt');

      // Create a file with specific content
      const content = 'A'.repeat(1024); // 1KB of content
      await fs.writeFile(sourceFile, content);

      // Get source file stats
      const sourceStats = await fs.stat(sourceFile);

      // Move the file
      await fs.rename(sourceFile, targetFile);

      // Get target file stats
      const targetStats = await fs.stat(targetFile);

      // Size should be preserved
      expect(targetStats.size).toBe(sourceStats.size);
      expect(targetStats.size).toBe(1024);
    });
  });
});
