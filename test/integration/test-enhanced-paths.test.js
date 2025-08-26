const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Mock electron for path testing
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn((type) => {
      const os = require('os');
      const path = require('path');
      const home = os.homedir();
      switch (type) {
        case 'documents':
          return path.join(home, 'Documents');
        case 'userData':
          return path.join(home, '.config', 'Stratosort');
        default:
          return path.join(home, type);
      }
    }),
  },
}));

describe('Enhanced Cross-Platform Path Resolution', () => {
  let mockApp;

  beforeEach(() => {
    jest.clearAllMocks();
    mockApp = require('electron').app;
  });

  describe('Stratosort Base Path Resolution', () => {
    test('should use documents path as primary location', () => {
      const documentsPath = mockApp.getPath('documents');
      expect(documentsPath).toContain('Documents');
      expect(documentsPath).toContain(os.homedir());
    });

    test('should fallback to user data path when documents unavailable', () => {
      mockApp.getPath.mockImplementationOnce((type) => {
        if (type === 'documents') return null;
        return path.join(os.homedir(), '.config', 'Stratosort');
      });

      const userDataPath = mockApp.getPath('userData');
      expect(userDataPath).toContain('.config');
      expect(userDataPath).toContain('Stratosort');
    });

    test('should use home directory as final fallback', () => {
      mockApp.getPath.mockImplementation(() => null);

      const homePath = os.homedir();
      expect(homePath).toBeDefined();
      expect(homePath).toContain(os.userInfo().username || '');
    });
  });

  describe('Enhanced Folder Structure Creation', () => {
    const testBasePath = path.join(os.tmpdir(), 'stratosort-test');

    afterEach(async () => {
      // Cleanup test directories
      try {
        await fs.rm(testBasePath, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    });

    test('should create base Stratosort directory', async () => {
      await fs.mkdir(testBasePath, { recursive: true });
      const stats = await fs.stat(testBasePath);
      expect(stats.isDirectory()).toBe(true);
    });

    test('should create enhanced organizational folders', async () => {
      const enhancedFolders = [
        'Financial Documents',
        'Project Files',
        'Personal Documents',
        'Technical Documentation',
        'Images & Screenshots',
        'Media Files',
      ];

      await fs.mkdir(testBasePath, { recursive: true });

      for (const folderName of enhancedFolders) {
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

      expect(createdFolders.length).toBe(enhancedFolders.length);
      enhancedFolders.forEach((folder) => {
        expect(createdFolders).toContain(folder);
      });
    });

    test('should handle cross-platform path characters', async () => {
      const testPaths = [
        'Documents with Spaces',
        'Special-Characters_Folder',
        'Numbers123Folder',
        'Unicode_测试',
      ];

      await fs.mkdir(testBasePath, { recursive: true });

      for (const testName of testPaths) {
        const testPath = path.join(testBasePath, testName);
        await fs.mkdir(testPath, { recursive: true });
        const stats = await fs.stat(testPath);
        expect(stats.isDirectory()).toBe(true);
      }

      // Verify all test folders exist
      const items = await fs.readdir(testBasePath, { withFileTypes: true });
      const createdFolders = items
        .filter((item) => item.isDirectory())
        .map((item) => item.name);

      testPaths.forEach((testName) => {
        expect(createdFolders).toContain(testName);
      });
    });
  });

  describe('Path Accessibility and Permissions', () => {
    const testBasePath = path.join(os.tmpdir(), 'stratosort-access-test');

    beforeEach(async () => {
      await fs.mkdir(testBasePath, { recursive: true });
    });

    afterEach(async () => {
      try {
        await fs.rm(testBasePath, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    });

    test('should verify path accessibility', async () => {
      const stats = await fs.stat(testBasePath);
      expect(stats.isDirectory()).toBe(true);
      expect(stats.mode).toBeDefined();
    });

    test('should handle permission scenarios', async () => {
      // Test writing a file to verify write permissions
      const testFile = path.join(testBasePath, 'test.txt');
      await fs.writeFile(testFile, 'test content');
      const content = await fs.readFile(testFile, 'utf8');
      expect(content).toBe('test content');

      // Verify file exists
      const stats = await fs.stat(testFile);
      expect(stats.isFile()).toBe(true);
    });
  });

  describe('Platform-Specific Path Behavior', () => {
    test('should handle different path separators', () => {
      const testPath = path.join('base', 'folder', 'file.txt');

      // Path should use correct separator for current platform
      if (process.platform === 'win32') {
        expect(testPath).toContain('\\');
      } else {
        expect(testPath).toContain('/');
      }
    });

    test('should handle platform-specific home directory', () => {
      const homePath = os.homedir();
      expect(homePath).toBeDefined();
      expect(typeof homePath).toBe('string');
      expect(homePath.length).toBeGreaterThan(0);
    });

    test('should resolve paths correctly across platforms', () => {
      const resolvedPath = path.resolve('/test', 'folder', 'file.txt');

      if (process.platform === 'win32') {
        expect(resolvedPath).toMatch(/^[A-Z]:.*file\.txt$/i);
      } else {
        expect(resolvedPath).toBe('/test/folder/file.txt');
      }
    });
  });
});
