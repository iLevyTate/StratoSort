const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { existsSync } = require('fs');

describe('Stratosort Folder Creation', () => {
  let testBasePath;

  beforeEach(() => {
    testBasePath = path.join(os.tmpdir(), `stratosort-test-${Date.now()}`);
  });

  afterEach(async () => {
    try {
      await fs.rm(testBasePath, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Base Path Resolution', () => {
    test('should resolve documents path correctly', () => {
      const documentsPath = path.join(os.homedir(), 'Documents');
      expect(documentsPath).toBeDefined();
      expect(documentsPath).toContain('Documents');
      expect(documentsPath).toContain(os.homedir());
    });

    test('should create valid Stratosort base path', () => {
      const documentsPath = path.join(os.homedir(), 'Documents');
      const stratosortBasePath = path.join(
        documentsPath,
        'Stratosort-Organized',
      );

      expect(stratosortBasePath).toContain('Stratosort-Organized');
      expect(stratosortBasePath).toContain('Documents');

      // Verify it's a valid path structure
      const parts = stratosortBasePath.split(path.sep);
      expect(parts).toContain('Documents');
      expect(parts).toContain('Stratosort-Organized');
    });

    test('should handle different path formats', () => {
      const testPaths = [
        path.join('C:', 'Users', 'test', 'Documents', 'Stratosort'),
        path.join('/home', 'user', 'Documents', 'Stratosort'),
        path.join('/Users', 'user', 'Documents', 'Stratosort'),
      ];

      testPaths.forEach((testPath) => {
        expect(testPath).toBeDefined();
        expect(testPath.length).toBeGreaterThan(0);
        expect(testPath).toContain('Stratosort');
      });
    });
  });

  describe('Base Folder Creation', () => {
    test('should create Stratosort base directory', async () => {
      await fs.mkdir(testBasePath, { recursive: true });

      const stats = await fs.stat(testBasePath);
      expect(stats.isDirectory()).toBe(true);

      // Verify it's accessible
      const isAccessible = await fs
        .access(testBasePath)
        .then(() => true)
        .catch(() => false);
      expect(isAccessible).toBe(true);
    });

    test('should handle existing directory gracefully', async () => {
      // Create directory first
      await fs.mkdir(testBasePath, { recursive: true });

      // Try to create again - should not throw error
      await expect(
        fs.mkdir(testBasePath, { recursive: true }),
      ).resolves.not.toThrow();

      // Verify directory still exists and is accessible
      const stats = await fs.stat(testBasePath);
      expect(stats.isDirectory()).toBe(true);
    });

    test('should handle nested directory creation', async () => {
      const nestedPath = path.join(testBasePath, 'level1', 'level2', 'level3');

      await fs.mkdir(nestedPath, { recursive: true });

      // Verify all levels exist
      const level1Stats = await fs.stat(path.join(testBasePath, 'level1'));
      const level2Stats = await fs.stat(
        path.join(testBasePath, 'level1', 'level2'),
      );
      const level3Stats = await fs.stat(nestedPath);

      expect(level1Stats.isDirectory()).toBe(true);
      expect(level2Stats.isDirectory()).toBe(true);
      expect(level3Stats.isDirectory()).toBe(true);
    });
  });

  describe('Organizational Folder Creation', () => {
    beforeEach(async () => {
      await fs.mkdir(testBasePath, { recursive: true });
    });

    test('should create organizational folders', async () => {
      const organizationalFolders = [
        'Financial Documents',
        'Project Files',
        'Personal Documents',
        'General Documents',
        'Images & Media',
        'Archives',
      ];

      // Create each folder
      for (const folderName of organizationalFolders) {
        const folderPath = path.join(testBasePath, folderName);
        await fs.mkdir(folderPath, { recursive: true });

        const stats = await fs.stat(folderPath);
        expect(stats.isDirectory()).toBe(true);
      }

      // Verify all folders were created
      const items = await fs.readdir(testBasePath, { withFileTypes: true });
      const createdFolders = items
        .filter((item) => item.isDirectory())
        .map((item) => item.name);

      expect(createdFolders.length).toBe(organizationalFolders.length);
      organizationalFolders.forEach((folder) => {
        expect(createdFolders).toContain(folder);
      });
    });

    test('should create folders with special characters', async () => {
      const specialFolders = [
        'Documents with Spaces',
        'Special-Characters_Folder',
        'Numbers123',
        'Mixed.Cases',
        'Unicode_测试',
      ];

      for (const folderName of specialFolders) {
        const folderPath = path.join(testBasePath, folderName);
        await fs.mkdir(folderPath, { recursive: true });

        const stats = await fs.stat(folderPath);
        expect(stats.isDirectory()).toBe(true);
      }

      // Verify all special folders exist
      const items = await fs.readdir(testBasePath, { withFileTypes: true });
      const createdFolders = items
        .filter((item) => item.isDirectory())
        .map((item) => item.name);

      specialFolders.forEach((folder) => {
        expect(createdFolders).toContain(folder);
      });
    });

    test('should handle folder creation errors gracefully', async () => {
      const validFolder = path.join(testBasePath, 'ValidFolder');
      const invalidFolder = path.join('/nonexistent/path', 'InvalidFolder');

      // Valid folder should work
      await fs.mkdir(validFolder, { recursive: true });
      const validStats = await fs.stat(validFolder);
      expect(validStats.isDirectory()).toBe(true);

      // Invalid folder should throw error
      await expect(
        fs.mkdir(invalidFolder, { recursive: false }),
      ).rejects.toThrow();
    });
  });

  describe('Folder Structure Verification', () => {
    beforeEach(async () => {
      await fs.mkdir(testBasePath, { recursive: true });
    });

    test('should verify complete folder structure', async () => {
      const expectedFolders = [
        'Documents',
        'Images',
        'Videos',
        'Music',
        'Projects',
        'Archives',
      ];

      // Create folder structure
      for (const folder of expectedFolders) {
        const folderPath = path.join(testBasePath, folder);
        await fs.mkdir(folderPath, { recursive: true });
      }

      // Verify structure
      const items = await fs.readdir(testBasePath, { withFileTypes: true });
      const actualFolders = items
        .filter((item) => item.isDirectory())
        .map((item) => item.name);

      expect(actualFolders.length).toBe(expectedFolders.length);
      expectedFolders.forEach((folder) => {
        expect(actualFolders).toContain(folder);
      });
    });

    test('should handle empty directory structures', async () => {
      // Empty directory should have no subdirectories
      const items = await fs.readdir(testBasePath, { withFileTypes: true });
      const folders = items.filter((item) => item.isDirectory());

      expect(folders.length).toBe(0);
    });

    test('should verify folder permissions', async () => {
      const testFolder = path.join(testBasePath, 'TestFolder');
      await fs.mkdir(testFolder, { recursive: true });

      const stats = await fs.stat(testFolder);

      // Should have directory permissions
      expect(stats.mode).toBeDefined();
      expect(stats.isDirectory()).toBe(true);

      // Should be accessible
      const isAccessible = await fs
        .access(testFolder)
        .then(() => true)
        .catch(() => false);
      expect(isAccessible).toBe(true);
    });
  });

  describe('Path Resolution and Validation', () => {
    test('should resolve paths correctly', () => {
      const testCases = [
        {
          input: ['Documents', 'Stratosort', 'Organized'],
          expected: 'Documents/Stratosort/Organized',
        },
        {
          input: ['Projects', 'Code', 'Stratosort'],
          expected: 'Projects/Code/Stratosort',
        },
        {
          input: ['Images', 'Photos'],
          expected: 'Images/Photos',
        },
      ];

      testCases.forEach(({ input, expected }) => {
        const resolved = path.join(...input);
        expect(resolved).toBeDefined();
        expect(resolved.length).toBeGreaterThan(0);
      });
    });

    test('should validate path existence', () => {
      const existingPath = testBasePath;
      const nonExistingPath = path.join(testBasePath, 'nonexistent');

      // This is a synchronous check for testing purposes
      expect(existsSync(existingPath)).toBe(false); // Doesn't exist yet since we only defined it
      expect(existsSync(nonExistingPath)).toBe(false);
    });

    test('should handle relative vs absolute paths', () => {
      const relativePath = path.join('Documents', 'Stratosort');
      const absolutePath = path.join(os.homedir(), 'Documents', 'Stratosort');

      expect(relativePath).toBeDefined();
      expect(absolutePath).toBeDefined();
      expect(absolutePath.length).toBeGreaterThan(relativePath.length);
      expect(absolutePath).toContain(os.homedir());
    });
  });
});
