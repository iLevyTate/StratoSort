/**
 * Enhanced LLM Functionality Test Suite
 * Tests the enhanced AI capabilities and integration
 */

// Mock Ollama before requiring services
const mockOllamaClient = {
  generate: jest.fn()
};

jest.mock('ollama', () => ({
  Ollama: jest.fn().mockImplementation(() => mockOllamaClient)
}));

const EnhancedLLMService = require('../src/main/services/EnhancedLLMService');

describe('Enhanced LLM Functionality', () => {
  let enhancedLLM;
  
  beforeEach(() => {
    enhancedLLM = new EnhancedLLMService('http://127.0.0.1:11434');
    jest.clearAllMocks();
  });

  describe('Service Initialization', () => {
    test('should initialize with domain templates', () => {
      expect(enhancedLLM.domainTemplates).toBeDefined();
      expect(enhancedLLM.domainTemplates.has('document')).toBe(true);
      expect(enhancedLLM.domainTemplates.has('image')).toBe(true);
    });

    test('should have parameter profiles configured', () => {
      expect(enhancedLLM.parameterProfiles).toBeDefined();
      expect(enhancedLLM.parameterProfiles.factual).toBeDefined();
      expect(enhancedLLM.parameterProfiles.creative).toBeDefined();
      expect(enhancedLLM.parameterProfiles.balanced).toBeDefined();
      expect(enhancedLLM.parameterProfiles.precise).toBeDefined();
    });

    test('should initialize user patterns tracking', () => {
      expect(enhancedLLM.userPatterns).toBeDefined();
      expect(enhancedLLM.userPatterns instanceof Map).toBe(true);
    });
  });

  describe('Content Structure Analysis', () => {
    test('should analyze document structure successfully', async () => {
      const mockResponse = {
        response: JSON.stringify({
          documentType: 'financial_report',
          keyEntities: ['Q1 2024', 'revenue', 'budget'],
          mainTopics: ['financial performance', 'budget analysis'],
          contentQuality: 'high',
          structureScore: 8
        })
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      const result = await enhancedLLM.analyzeContentStructure(
        'Quarterly Financial Report Q1 2024...', 
        'report.pdf'
      );

      expect(result.documentType).toBe('financial_report');
      expect(result.keyEntities).toContain('revenue');
      expect(result.structureScore).toBe(8);
      expect(mockOllamaClient.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemma3:4b',
          format: 'json'
        })
      );
    });

    test('should handle structure analysis failure gracefully', async () => {
      mockOllamaClient.generate.mockRejectedValue(new Error('API Error'));

      const result = await enhancedLLM.analyzeContentStructure(
        'test content', 
        'test.pdf'
      );

      expect(result.documentType).toBe('unknown');
      expect(result.structureScore).toBe(5);
      expect(result.contentQuality).toBe('medium');
    });
  });

  describe('Semantic Folder Matching', () => {
    test('should perform semantic similarity matching', async () => {
      const mockResponse = {
        response: JSON.stringify([
          { folder: 'Financial Planning', similarity: 0.92, reasoning: 'Perfect match for budget content' },
          { folder: 'Reports', similarity: 0.65, reasoning: 'General report structure' },
          { folder: 'Projects', similarity: 0.23, reasoning: 'No project context' }
        ])
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      const smartFolders = [
        { name: 'Financial Planning', description: 'Budget and financial documents' },
        { name: 'Reports', description: 'Business reports' },
        { name: 'Projects', description: 'Project documentation' }
      ];

      const result = await enhancedLLM.semanticSimilarityMatching(
        'Budget Analysis',
        smartFolders,
        'Quarterly budget analysis content'
      );

      expect(result).toHaveLength(3);
      expect(result[0].folder).toBe('Financial Planning');
      expect(result[0].similarity).toBe(0.92);
      expect(result[0].reasoning).toContain('budget');
    });

    test('should handle semantic matching API failures', async () => {
      mockOllamaClient.generate.mockRejectedValue(new Error('Matching failed'));

      const smartFolders = [{ name: 'Test Folder' }];
      const result = await enhancedLLM.semanticSimilarityMatching(
        'Test Category', 
        smartFolders, 
        'content'
      );

      expect(result).toHaveLength(1);
      expect(result[0].folder).toBe('Test Folder');
      expect(result[0].similarity).toBe(0.5);
      expect(result[0].reasoning).toBe('fallback');
    });

    test('should perform enhanced folder matching with context', async () => {
      const mockResponse = {
        response: JSON.stringify([
          { folder: 'Design Assets', similarity: 0.89, reasoning: 'UI design content match' }
        ])
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      const result = await enhancedLLM.enhancedFolderMatching(
        'UI Design',
        [{ name: 'Design Assets' }],
        { userId: 'test' },
        'User interface design mockups'
      );

      expect(result.category).toBe('Design Assets');
      expect(result.matchConfidence).toBe(0.89);
      expect(result.matchMethod).toBe('semantic');
    });
  });

  describe('Domain-Specific Analysis', () => {
    test('should perform document domain analysis', async () => {
      const mockResponse = {
        response: JSON.stringify({
          category: 'Research',
          project: 'Market Analysis',
          purpose: 'Competitive research and insights',
          keywords: ['research', 'market', 'analysis'],
          confidence: 88,
          reasoning: 'Document contains research methodology'
        })
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      const result = await enhancedLLM.performDomainSpecificAnalysis(
        'Market research analysis document content...',
        'research.pdf',
        'document'
      );

      expect(result.category).toBe('Research');
      expect(result.confidence).toBe(88);
      expect(result.keywords).toContain('research');
    });

    test('should handle domain analysis failure', async () => {
      mockOllamaClient.generate.mockRejectedValue(new Error('Domain analysis failed'));

      const result = await enhancedLLM.performDomainSpecificAnalysis(
        'content',
        'test.pdf',
        'document'
      );

      expect(result.fallback).toBe(true);
      expect(result.category).toBe('Documents');
    });
  });

  describe('User Learning System', () => {
    test('should learn from analysis results', async () => {
      const userContext = { userId: 'learning_user' };
      const analysis = {
        category: 'Financial Planning',
        confidence: 88,
        project: 'Budget Analysis'
      };

      await enhancedLLM.learnFromAnalysis('budget.pdf', analysis, userContext);

      const userHistory = enhancedLLM.userPatterns.get('learning_user');
      expect(userHistory).toHaveLength(1);
      expect(userHistory[0].fileName).toBe('budget.pdf');
      expect(userHistory[0].analysis.category).toBe('Financial Planning');
    });

    test('should maintain learning history limit', async () => {
      const userContext = { userId: 'heavy_user' };
      
      // Add 105 entries to exceed the 100 limit
      for (let i = 0; i < 105; i++) {
        await enhancedLLM.learnFromAnalysis(
          `file_${i}.pdf`,
          { category: 'Test', confidence: 80 },
          userContext
        );
      }

      const userHistory = enhancedLLM.userPatterns.get('heavy_user');
      expect(userHistory).toHaveLength(100);
    });

    test('should provide user learning statistics', async () => {
      const userContext = { userId: 'stats_user' };
      
      // Add learning data
      await enhancedLLM.learnFromAnalysis('file1.pdf', { category: 'Financial Planning', confidence: 85 }, userContext);
      await enhancedLLM.learnFromAnalysis('file2.pdf', { category: 'Financial Planning', confidence: 90 }, userContext);
      await enhancedLLM.learnFromAnalysis('file3.pdf', { category: 'Research', confidence: 82 }, userContext);

      const stats = enhancedLLM.getUserLearningStats('stats_user');

      expect(stats.totalAnalyses).toBe(3);
      expect(stats.averageConfidence).toBeCloseTo(85.67, 1);
      expect(stats.commonCategories[0].category).toBe('Financial Planning');
      expect(stats.commonCategories[0].count).toBe(2);
    });

    test('should calculate learning trends', () => {
      // Test improving trend
      const improvingHistory = [];
      for (let i = 0; i < 20; i++) {
        improvingHistory.push({ confidence: 70 + i });
      }

      const improvingTrend = enhancedLLM.calculateLearningTrend(improvingHistory);
      expect(improvingTrend).toBe('improving');

      // Test insufficient data
      const shortHistory = [{ confidence: 80 }];
      const shortTrend = enhancedLLM.calculateLearningTrend(shortHistory);
      expect(shortTrend).toBe('insufficient_data');
    });
  });

  describe('Parameter Optimization', () => {
    test('should provide optimized parameters for different tasks', () => {
      const categorizationParams = enhancedLLM.getOptimizedParameters('categorization', 'medium');
      expect(categorizationParams.temperature).toBe(0.1);
      expect(categorizationParams.top_k).toBe(15);

      const creativeParams = enhancedLLM.getOptimizedParameters('creative', 'high');
      expect(creativeParams.temperature).toBe(0.7);
      expect(creativeParams.num_predict).toBe(800);

      const summarizationParams = enhancedLLM.getOptimizedParameters('summarization', 'low');
      expect(summarizationParams.temperature).toBe(0.3);
      expect(summarizationParams.num_predict).toBe(1200);
    });

    test('should have different parameter profiles', () => {
      expect(enhancedLLM.parameterProfiles.factual.temperature).toBe(0.1);
      expect(enhancedLLM.parameterProfiles.creative.temperature).toBe(0.8);
      expect(enhancedLLM.parameterProfiles.precise.temperature).toBe(0.05);
      expect(enhancedLLM.parameterProfiles.balanced.temperature).toBe(0.3);
    });
  });

  describe('Analysis Refinement', () => {
    test('should refine low confidence analyses', async () => {
      const lowConfidenceAnalysis = {
        category: 'Unknown',
        confidence: 65,
        project: 'Test'
      };

      const refinedResponse = {
        response: JSON.stringify({
          category: 'Research',
          confidence: 85,
          project: 'Analysis',
          refined: true
        })
      };

      mockOllamaClient.generate.mockResolvedValue(refinedResponse);

      const result = await enhancedLLM.refineAnalysis(
        lowConfidenceAnalysis,
        'Research content',
        'research.pdf',
        []
      );

      expect(result.confidence).toBeGreaterThan(65);
      expect(result.refined).toBe(true);
    });

    test('should not refine high confidence analyses', async () => {
      const highConfidenceAnalysis = {
        category: 'Research',
        confidence: 92
      };

      const result = await enhancedLLM.refineAnalysis(
        highConfidenceAnalysis,
        'content',
        'file.pdf',
        []
      );

      expect(result.confidence).toBe(92);
      expect(mockOllamaClient.generate).not.toHaveBeenCalled();
    });
  });

  describe('Fallback Handling', () => {
    test('should provide appropriate fallback analysis', () => {
      const fallback = enhancedLLM.getFallbackAnalysis('test.pdf', 'document');
      
      expect(fallback.category).toBe('Documents');
      expect(fallback.confidence).toBe(50);
      expect(fallback.fallback).toBe(true);
    });

    test('should combine analysis results correctly', () => {
      const initial = { category: 'Test', confidence: 70, project: 'A' };
      const refined = { category: 'Better', confidence: 85, keywords: ['test'], project: 'B' };

      const combined = enhancedLLM.combineAnalysisResults(initial, refined);

      expect(combined.category).toBe('Better');
      expect(combined.confidence).toBe(85);
      expect(combined.keywords).toEqual(['test']);
      expect(combined.project).toBe('B'); // Refined values take precedence
      expect(combined.refined).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle JSON parsing errors gracefully', async () => {
      mockOllamaClient.generate.mockResolvedValue({
        response: 'Invalid JSON response'
      });

      const result = await enhancedLLM.performDomainSpecificAnalysis(
        'content',
        'file.pdf',
        'document'
      );

      expect(result.fallback).toBe(true);
    });

    test('should handle Ollama connection errors', async () => {
      mockOllamaClient.generate.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await enhancedLLM.analyzeContentStructure(
        'content',
        'file.pdf'
      );

      expect(result.documentType).toBe('unknown');
      expect(result.structureScore).toBe(5);
    });
  });

  describe('Integration with Document Analysis', () => {
    test('should complete full enhanced document analysis workflow', async () => {
      // Mock all the steps of enhanced analysis
      const contentStructureResponse = {
        response: JSON.stringify({
          documentType: 'report',
          keyEntities: ['Q1', 'revenue'],
          mainTopics: ['financial'],
          contentQuality: 'high',
          structureScore: 9
        })
      };

      const domainAnalysisResponse = {
        response: JSON.stringify({
          category: 'Financial Planning',
          confidence: 94,
          project: 'Analysis'
        })
      };

      const semanticMatchingResponse = {
        response: JSON.stringify([
          { folder: 'Financial Planning', similarity: 0.95, reasoning: 'Perfect match' }
        ])
      };

      mockOllamaClient.generate
        .mockResolvedValueOnce(contentStructureResponse)   // Content structure
        .mockResolvedValueOnce(domainAnalysisResponse)     // Domain analysis
        .mockResolvedValueOnce(semanticMatchingResponse);  // Semantic matching

      const result = await enhancedLLM.analyzeDocumentEnhanced(
        'Financial report content...',
        'report.pdf',
        [{ name: 'Financial Planning' }],
        { userId: 'test' }
      );

      expect(result).toBeDefined();
      // The exact structure depends on how analyzeDocumentEnhanced combines results
      expect(mockOllamaClient.generate).toHaveBeenCalledTimes(3);
    });
  });
}); 