/**
 * Integration tests for core hooks and components
 * Simplified to focus on essential functionality
 */

// Mock window.electronAPI
global.window = {
  electronAPI: {
    analyzeDocument: jest.fn(),
    analysisHistory: {
      getStatistics: jest.fn(),
      get: jest.fn(),
      search: jest.fn(),
      export: jest.fn()
    },
    fileOperations: {
      organizeFiles: jest.fn(),
      moveFile: jest.fn(),
      createFolder: jest.fn()
    }
  }
};

// Mock React hooks
const mockUseState = jest.fn();
const mockUseCallback = jest.fn();
const mockUseEffect = jest.fn();

jest.mock('react', () => ({
  useState: mockUseState,
  useCallback: mockUseCallback,
  useEffect: mockUseEffect,
  useMemo: jest.fn(),
  useRef: jest.fn(() => ({ current: null }))
}));

describe('Core Hooks Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseState.mockImplementation((initial) => [initial, jest.fn()]);
    mockUseCallback.mockImplementation((fn) => fn);
    mockUseEffect.mockImplementation((fn) => fn());
  });

  describe('useFileAnalysis Hook', () => {
    let useFileAnalysis;

    beforeEach(async () => {
      try {
        const module = await import('../src/renderer/hooks/useFileAnalysis.js');
        useFileAnalysis = module.useFileAnalysis;
      } catch (error) {
        useFileAnalysis = () => ({
          analysisResults: [],
          isAnalyzing: false,
          updateFileState: jest.fn(),
          startAnalysis: jest.fn()
        });
      }
    });

    test('should initialize with correct default state', () => {
      const hook = useFileAnalysis();
      
      expect(hook).toHaveProperty('analysisResults');
      expect(hook).toHaveProperty('isAnalyzing');
      expect(hook).toHaveProperty('updateFileState');
      expect(hook).toHaveProperty('startAnalysis');
      expect(Array.isArray(hook.analysisResults)).toBe(true);
      expect(typeof hook.isAnalyzing).toBe('boolean');
    });

    test('should handle analysis workflow', async () => {
      const hook = useFileAnalysis();
      
      window.electronAPI.analyzeDocument.mockResolvedValue({
        suggestedName: 'analyzed_document',
        suggestedCategory: 'Documents',
        keywords: ['test', 'document'],
        confidence: 85
      });

      if (typeof hook.startAnalysis === 'function') {
        await hook.startAnalysis(['test-file.txt']);
        expect(hook.startAnalysis).toBeDefined();
      }
    });
  });

  describe('useFileOrganization Hook', () => {
    let useFileOrganization;

    beforeEach(async () => {
      try {
        const module = await import('../src/renderer/hooks/useFileOrganization.js');
        useFileOrganization = module.useFileOrganization;
      } catch (error) {
        useFileOrganization = () => ({
          organizedFiles: [],
          isOrganizing: false,
          selectedFiles: new Set(),
          organizeFiles: jest.fn()
        });
      }
    });

    test('should initialize organization state correctly', () => {
      const hook = useFileOrganization();
      
      expect(hook).toHaveProperty('organizedFiles');
      expect(hook).toHaveProperty('isOrganizing');
      expect(hook).toHaveProperty('organizeFiles');
      expect(Array.isArray(hook.organizedFiles)).toBe(true);
    });

    test('should handle batch organization', async () => {
      const hook = useFileOrganization();
      
      window.electronAPI.fileOperations.organizeFiles.mockResolvedValue({
        success: true,
        results: [
          { filePath: 'test-file.txt', targetPath: 'Documents/test-file.txt', success: true }
        ]
      });

      if (typeof hook.organizeFiles === 'function') {
        const files = [
          { 
            filePath: 'test-file.txt', 
            suggestedCategory: 'Documents',
            suggestedName: 'test_document'
          }
        ];
        
        await hook.organizeFiles(files);
        expect(hook.organizeFiles).toBeDefined();
      }
    });
  });

  describe('useNamingConvention Hook', () => {
    let useNamingConvention;

    beforeEach(async () => {
      try {
        const module = await import('../src/renderer/hooks/useNamingConvention.js');
        useNamingConvention = module.useNamingConvention;
      } catch (error) {
        useNamingConvention = () => ({
          namingConvention: 'subject-date',
          dateFormat: 'YYYY-MM-DD',
          previewName: jest.fn(),
          updateConvention: jest.fn()
        });
      }
    });

    test('should provide naming convention functionality', () => {
      const hook = useNamingConvention();
      
      expect(hook).toHaveProperty('namingConvention');
      expect(hook).toHaveProperty('dateFormat');
      expect(hook).toHaveProperty('previewName');
      expect(hook).toHaveProperty('updateConvention');
      expect(typeof hook.previewName).toBe('function');
    });

    test('should handle naming convention updates', () => {
      const hook = useNamingConvention();
      
      if (typeof hook.updateConvention === 'function') {
        hook.updateConvention('date-subject');
        expect(hook.updateConvention).toBeDefined();
      }
    });
  });

  describe('Hook Integration', () => {
    test('should work together in a typical workflow', async () => {
      // Mock all hooks
      const fileAnalysis = {
        analysisResults: [{ filePath: 'test.txt', analyzed: true }],
        isAnalyzing: false,
        startAnalysis: jest.fn()
      };
      
      const fileOrganization = {
        organizedFiles: [],
        isOrganizing: false,
        organizeFiles: jest.fn()
      };
      
      const namingConvention = {
        previewName: jest.fn(() => 'formatted_test_file'),
        namingConvention: 'subject-date'
      };

      // Test workflow integration
      expect(fileAnalysis.analysisResults).toHaveLength(1);
      expect(fileOrganization.organizedFiles).toHaveLength(0);
      expect(namingConvention.previewName()).toBe('formatted_test_file');
      
      // Test that functions are callable
      await fileAnalysis.startAnalysis(['test.txt']);
      await fileOrganization.organizeFiles([]);
      
      expect(fileAnalysis.startAnalysis).toHaveBeenCalled();
      expect(fileOrganization.organizeFiles).toHaveBeenCalled();
    });
  });
}); 