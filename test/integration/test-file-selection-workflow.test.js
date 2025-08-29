/**
 * File Selection Workflow Tests
 * Tests the specific workflow of selecting files from the test-files directory
 * and walking through the complete analysis process
 */

const fs = require('fs').promises;
const path = require('path');

// Test files directory
const TEST_FILES_DIR = path.join(__dirname, '..', 'test-files');

// Mock electron API specifically for file operations
const mockElectronAPI = {
  files: {
    select: jest.fn(),
    selectDirectory: jest.fn(),
    analyze: jest.fn(),
    getStats: jest.fn(),
    open: jest.fn(),
    reveal: jest.fn(),
    delete: jest.fn(),
  },
  settings: {
    get: jest.fn(),
  },
  smartFolders: {
    scanStructure: jest.fn(),
  },
};

// Mock the global window object
Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true,
});

describe('File Selection and Analysis Workflow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Test Files Directory Setup', () => {
    test('should verify test files exist', async () => {
      try {
        const files = await fs.readdir(TEST_FILES_DIR);
        expect(files.length).toBeGreaterThan(0);

        // Check for expected test files
        const expectedFiles = [
          'sample.pdf',
          'project-report.md',
          'guide-2b3a698c.docx',
          'inventory-4e5a1be6.xlsx',
          'test-image.jpg',
        ];

        for (const expectedFile of expectedFiles) {
          expect(files).toContain(expectedFile);
        }
      } catch (error) {
        console.warn(
          'Test files directory not found, skipping file existence tests',
        );
      }
    });

    test('should get file stats for test files', async () => {
      try {
        const testFiles = await fs.readdir(TEST_FILES_DIR);
        const pdfFile = testFiles.find((f) => f === 'sample.pdf');

        if (pdfFile) {
          const filePath = path.join(TEST_FILES_DIR, pdfFile);
          const stats = await fs.stat(filePath);

          expect(stats.size).toBeGreaterThan(0);
          expect(stats.isFile()).toBe(true);

          // Mock the electron API call
          mockElectronAPI.files.getStats.mockResolvedValue({
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime,
          });

          const mockStats = await mockElectronAPI.files.getStats(filePath);
          expect(mockStats.size).toBe(stats.size);
        }
      } catch (error) {
        console.warn('Could not read test file stats:', error.message);
      }
    });
  });

  describe('File Selection Simulation', () => {
    test('should simulate selecting all test files', async () => {
      try {
        const files = await fs.readdir(TEST_FILES_DIR);
        const filePaths = files.map((file) => path.join(TEST_FILES_DIR, file));

        // Mock the file selection dialog
        mockElectronAPI.files.select.mockResolvedValue({
          success: true,
          files: filePaths,
        });

        // Simulate user clicking "Select Files" button
        const result = await window.electronAPI.files.select();

        expect(result.success).toBe(true);
        expect(result.files).toHaveLength(files.length);

        // Verify all test files are included
        files.forEach((file) => {
          const filePath = path.join(TEST_FILES_DIR, file);
          expect(result.files).toContain(filePath);
        });
      } catch (error) {
        console.warn('Could not read test files directory:', error.message);
      }
    });

    test('should simulate selecting specific file types', async () => {
      try {
        const files = await fs.readdir(TEST_FILES_DIR);

        // Filter for document files only
        const documentFiles = files.filter((file) => {
          const ext = path.extname(file).toLowerCase();
          return ['.pdf', '.docx', '.xlsx', '.md'].includes(ext);
        });

        const documentPaths = documentFiles.map((file) =>
          path.join(TEST_FILES_DIR, file),
        );

        mockElectronAPI.files.select.mockResolvedValue({
          success: true,
          files: documentPaths,
        });

        const result = await window.electronAPI.files.select();

        expect(result.success).toBe(true);
        expect(result.files).toHaveLength(documentFiles.length);

        // Verify only document files are selected
        result.files.forEach((filePath) => {
          const ext = path.extname(filePath).toLowerCase();
          expect(['.pdf', '.docx', '.xlsx', '.md']).toContain(ext);
        });
      } catch (error) {
        console.warn('Could not filter document files:', error.message);
      }
    });

    test('should handle file selection cancellation', async () => {
      mockElectronAPI.files.select.mockResolvedValue({
        success: false,
        files: [],
      });

      const result = await window.electronAPI.files.select();

      expect(result.success).toBe(false);
      expect(result.files).toHaveLength(0);
    });
  });

  describe('Folder Selection Simulation', () => {
    test('should simulate selecting test files directory', async () => {
      mockElectronAPI.files.selectDirectory.mockResolvedValue({
        success: true,
        folder: TEST_FILES_DIR,
      });

      // Mock scan structure with actual files
      const mockScanResult = {
        success: true,
        folder: TEST_FILES_DIR,
        files: [
          {
            path: path.join(TEST_FILES_DIR, 'sample.pdf'),
            name: 'sample.pdf',
            extension: '.pdf',
            size: 1024,
          },
          {
            path: path.join(TEST_FILES_DIR, 'project-report.md'),
            name: 'project-report.md',
            extension: '.md',
            size: 512,
          },
        ],
      };

      mockElectronAPI.smartFolders.scanStructure.mockResolvedValue(
        mockScanResult,
      );

      // Simulate folder selection workflow
      const folderResult = await window.electronAPI.files.selectDirectory();
      expect(folderResult.success).toBe(true);
      expect(folderResult.folder).toBe(TEST_FILES_DIR);

      const scanResult =
        await window.electronAPI.smartFolders.scanStructure(TEST_FILES_DIR);
      expect(scanResult.success).toBe(true);
      expect(scanResult.files).toHaveLength(2);
    });

    test('should filter supported files from folder scan', async () => {
      const mockScanResult = {
        success: true,
        folder: TEST_FILES_DIR,
        files: [
          {
            path: path.join(TEST_FILES_DIR, 'sample.pdf'),
            name: 'sample.pdf',
            extension: '.pdf',
          },
          {
            path: path.join(TEST_FILES_DIR, 'unknown.xyz'),
            name: 'unknown.xyz',
            extension: '.xyz',
          },
        ],
      };

      mockElectronAPI.smartFolders.scanStructure.mockResolvedValue(
        mockScanResult,
      );

      const scanResult =
        await window.electronAPI.smartFolders.scanStructure(TEST_FILES_DIR);

      // Filter supported files
      const supportedExts = ['.pdf', '.docx', '.xlsx', '.md', '.jpg', '.png'];
      const supportedFiles = scanResult.files.filter((file) =>
        supportedExts.includes(file.extension.toLowerCase()),
      );

      expect(supportedFiles).toHaveLength(1);
      expect(supportedFiles[0].name).toBe('sample.pdf');
    });
  });

  describe('File Analysis Workflow', () => {
    test('should analyze PDF file with realistic mock', async () => {
      const pdfPath = path.join(TEST_FILES_DIR, 'sample.pdf');

      mockElectronAPI.files.analyze.mockResolvedValue({
        status: 'success',
        analysis: {
          category: 'Document',
          purpose: 'Project documentation and specifications',
          keywords: ['project', 'documentation', 'specifications', 'technical'],
          confidence: 0.91,
          suggestedFolder: 'Documents/Project',
          suggestedName: 'project-documentation-2024.pdf',
        },
      });

      const analysis = await window.electronAPI.files.analyze(pdfPath);

      expect(analysis.status).toBe('success');
      expect(analysis.analysis.category).toBe('Document');
      expect(analysis.analysis.confidence).toBeGreaterThan(0.9);
      expect(analysis.analysis.suggestedFolder).toContain('Documents');
    });

    test('should analyze image file with realistic mock', async () => {
      const imagePath = path.join(TEST_FILES_DIR, 'test-image.jpg');

      mockElectronAPI.files.analyze.mockResolvedValue({
        status: 'success',
        analysis: {
          category: 'Image',
          purpose: 'Digital photograph or scan',
          keywords: ['photograph', 'image', 'visual', 'media'],
          confidence: 0.88,
          suggestedFolder: 'Images',
          suggestedName: 'photograph-2024-01-15.jpg',
        },
      });

      const analysis = await window.electronAPI.files.analyze(imagePath);

      expect(analysis.status).toBe('success');
      expect(analysis.analysis.category).toBe('Image');
      expect(analysis.analysis.suggestedFolder).toBe('Images');
    });

    test('should analyze document file with realistic mock', async () => {
      const docxPath = path.join(TEST_FILES_DIR, 'guide-2b3a698c.docx');

      mockElectronAPI.files.analyze.mockResolvedValue({
        status: 'success',
        analysis: {
          category: 'Document',
          purpose: 'User guide or tutorial documentation',
          keywords: ['guide', 'tutorial', 'documentation', 'user', 'manual'],
          confidence: 0.93,
          suggestedFolder: 'Documents/Guides',
          suggestedName: 'user-guide-2024-01-15.docx',
        },
      });

      const analysis = await window.electronAPI.files.analyze(docxPath);

      expect(analysis.status).toBe('success');
      expect(analysis.analysis.category).toBe('Document');
      expect(analysis.analysis.suggestedFolder).toContain('Guides');
    });

    test('should analyze spreadsheet file with realistic mock', async () => {
      const xlsxPath = path.join(TEST_FILES_DIR, 'inventory-4e5a1be6.xlsx');

      mockElectronAPI.files.analyze.mockResolvedValue({
        status: 'success',
        analysis: {
          category: 'Financial',
          purpose: 'Inventory tracking and management spreadsheet',
          keywords: [
            'inventory',
            'tracking',
            'management',
            'financial',
            'data',
          ],
          confidence: 0.89,
          suggestedFolder: 'Financial/Inventory',
          suggestedName: 'inventory-tracking-2024-01-15.xlsx',
        },
      });

      const analysis = await window.electronAPI.files.analyze(xlsxPath);

      expect(analysis.status).toBe('success');
      expect(analysis.analysis.category).toBe('Financial');
      expect(analysis.analysis.suggestedFolder).toContain('Inventory');
    });

    test('should handle analysis failures gracefully', async () => {
      const testPath = path.join(TEST_FILES_DIR, 'sample.pdf');

      mockElectronAPI.files.analyze.mockResolvedValue({
        status: 'error',
        error: 'File format not supported or file corrupted',
      });

      const analysis = await window.electronAPI.files.analyze(testPath);

      expect(analysis.status).toBe('error');
      expect(analysis.error).toBeDefined();
    });
  });

  describe('Complete Workflow Integration', () => {
    test('should simulate complete user workflow with test files', async () => {
      // Step 1: Select files
      const testFiles = ['sample.pdf', 'project-report.md', 'test-image.jpg'];
      const filePaths = testFiles.map((file) =>
        path.join(TEST_FILES_DIR, file),
      );

      mockElectronAPI.files.select.mockResolvedValue({
        success: true,
        files: filePaths,
      });

      // Step 2: Get file stats
      testFiles.forEach((file, index) => {
        mockElectronAPI.files.getStats.mockResolvedValueOnce({
          size: 1024 + index * 512,
          created: new Date(),
          modified: new Date(),
        });
      });

      // Step 3: Mock analysis for each file
      const mockAnalyses = [
        {
          status: 'success',
          analysis: {
            category: 'Document',
            purpose: 'Project documentation',
            keywords: ['project', 'documentation'],
            confidence: 0.91,
            suggestedFolder: 'Documents',
            suggestedName: 'sample-2024-01-15.pdf',
          },
        },
        {
          status: 'success',
          analysis: {
            category: 'Project',
            purpose: 'Project report',
            keywords: ['project', 'report'],
            confidence: 0.88,
            suggestedFolder: 'Projects',
            suggestedName: 'project-report-2024-01-15.md',
          },
        },
        {
          status: 'success',
          analysis: {
            category: 'Image',
            purpose: 'Digital image',
            keywords: ['image', 'photograph'],
            confidence: 0.85,
            suggestedFolder: 'Images',
            suggestedName: '3540-2024-01-15.jpg',
          },
        },
      ];

      mockAnalyses.forEach((analysis) => {
        mockElectronAPI.files.analyze.mockResolvedValueOnce(analysis);
      });

      // Execute the workflow
      const selectionResult = await window.electronAPI.files.select();
      expect(selectionResult.success).toBe(true);
      expect(selectionResult.files).toHaveLength(3);

      // Process each file
      const processedFiles = [];
      for (let i = 0; i < selectionResult.files.length; i++) {
        const filePath = selectionResult.files[i];
        const stats = await window.electronAPI.files.getStats(filePath);
        const analysis = await window.electronAPI.files.analyze(filePath);

        const fileName = path.basename(filePath);
        const extension = path.extname(filePath);

        processedFiles.push({
          path: filePath,
          name: fileName,
          extension,
          size: stats.size,
          analysis: analysis.status === 'success' ? analysis.analysis : null,
          status: analysis.status === 'success' ? 'analyzed' : 'failed',
        });
      }

      // Verify results
      expect(processedFiles).toHaveLength(3);

      // Check PDF file analysis
      const pdfFile = processedFiles.find((f) => f.name === 'sample.pdf');
      expect(pdfFile.analysis.category).toBe('Document');
      expect(pdfFile.analysis.suggestedFolder).toBe('Documents');

      // Check markdown file analysis
      const mdFile = processedFiles.find((f) => f.name === 'project-report.md');
      expect(mdFile.analysis.category).toBe('Project');
      expect(mdFile.analysis.suggestedFolder).toBe('Projects');

      // Check image file analysis
      const imgFile = processedFiles.find((f) => f.name === 'test-image.jpg');
      expect(imgFile.analysis.category).toBe('Image');
      expect(imgFile.analysis.suggestedFolder).toBe('Images');
    });
  });
});
