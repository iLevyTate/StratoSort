/**
 * Enhanced LLM Service Test Suite
 * Tests advanced AI capabilities including multi-step analysis, semantic matching, and learning
 */

const EnhancedLLMService = require('../src/main/services/EnhancedLLMService');

// Mock Ollama client
const mockOllamaClient = {
  generate: jest.fn()
};

// Mock the Ollama constructor
jest.mock('ollama', () => ({
  Ollama: jest.fn().mockImplementation(() => mockOllamaClient)
}));

describe('EnhancedLLMService', () => {
  let enhancedLLM;
  
  beforeEach(() => {
    enhancedLLM = new EnhancedLLMService('http://127.0.0.1:11434');
    jest.clearAllMocks();
  });

  describe('Domain Template Initialization', () => {
    test('should initialize document domain templates correctly', () => {
      const documentTemplate = enhancedLLM.domainTemplates.get('document');
      
      expect(documentTemplate).toBeDefined();
      expect(documentTemplate.systemPrompt).toContain('expert document analysis specialist');
      expect(documentTemplate.examples).toHaveLength(2);
      expect(documentTemplate.constraints).toContain('Base analysis strictly on actual content, not filename assumptions');
    });

    test('should initialize image domain templates correctly', () => {
      const imageTemplate = enhancedLLM.domainTemplates.get('image');
      
      expect(imageTemplate).toBeDefined();
      expect(imageTemplate.systemPrompt).toContain('expert visual content analyzer');
      expect(imageTemplate.examples).toHaveLength(2);
      expect(imageTemplate.constraints).toContain('Identify specific visual elements and context');
    });
  });

  describe('Enhanced Document Analysis', () => {
    const mockDocumentResponse = {
      response: JSON.stringify({
        category: 'Financial Planning',
        project: 'Budget Analysis',
        purpose: 'Quarterly financial review and planning',
        keywords: ['budget', 'financial', 'quarterly', 'analysis'],
        confidence: 92,
        suggestedName: 'q1_budget_analysis_2024'
      })
    };

    beforeEach(() => {
      mockOllamaClient.generate.mockResolvedValue(mockDocumentResponse);
    });

    test('should perform enhanced document analysis with multi-step processing', async () => {
      const textContent = 'Quarterly budget report for Q1 2024. Revenue increased by 15% compared to last quarter.';
      const fileName = 'budget_report.pdf';
      const smartFolders = [
        { name: 'Financial Planning', description: 'Budget and financial documents' },
        { name: 'Reports', description: 'Business reports and analytics' }
      ];
      const userContext = { userId: 'test_user' };

      const result = await enhancedLLM.analyzeDocumentEnhanced(
        textContent, fileName, smartFolders, userContext
      );

      expect(result).toBeDefined();
      expect(result.category).toBe('Financial Planning');
      expect(result.confidence).toBe(92);
      expect(result.enhanced).toBe(true); // Note: Mock needs to return enhanced: true
      expect(mockOllamaClient.generate).toHaveBeenCalled();
    });

    test('should handle enhanced analysis failure gracefully', async () => {
      mockOllamaClient.generate.mockRejectedValue(new Error('API Error'));

      const result = await enhancedLLM.analyzeDocumentEnhanced(
        'test content', 'test.pdf', [], {}
      );

      expect(result).toBeDefined();
      expect(result.fallback).toBe(true);
      expect(result.category).toBe('Documents');
    });

    test('should perform content structure analysis', async () => {
      const structureResponse = {
        response: JSON.stringify({
          documentType: 'financial_report',
          keyEntities: ['Q1 2024', 'revenue', 'budget'],
          mainTopics: ['financial performance', 'budget analysis'],
          contentQuality: 'high',
          structureScore: 8
        })
      };

      mockOllamaClient.generate.mockResolvedValue(structureResponse);

      const result = await enhancedLLM.analyzeContentStructure(
        'Detailed quarterly financial report...', 'report.pdf'
      );

      expect(result.documentType).toBe('financial_report');
      expect(result.keyEntities).toContain('revenue');
      expect(result.structureScore).toBe(8);
    });
  });

  describe('Semantic Folder Matching', () => {
    const mockSemanticResponse = {
      response: JSON.stringify([
        { folder: 'Financial Planning', similarity: 0.92, reasoning: 'Content focuses on budget and financial analysis' },
        { folder: 'Reports', similarity: 0.75, reasoning: 'Document is structured as a business report' },
        { folder: 'Projects', similarity: 0.23, reasoning: 'No specific project context identified' }
      ])
    };

    beforeEach(() => {
      mockOllamaClient.generate.mockResolvedValue(mockSemanticResponse);
    });

    test('should perform semantic similarity matching', async () => {
      const suggestedCategory = 'Budget Analysis';
      const smartFolders = [
        { name: 'Financial Planning', description: 'Budget and financial documents' },
        { name: 'Reports', description: 'Business reports' },
        { name: 'Projects', description: 'Project documentation' }
      ];
      const content = 'Quarterly budget analysis with revenue projections';

      const result = await enhancedLLM.semanticSimilarityMatching(
        suggestedCategory, smartFolders, content
      );

      expect(result).toHaveLength(3);
      expect(result[0].folder).toBe('Financial Planning');
      expect(result[0].similarity).toBe(0.92);
      expect(result[0].reasoning).toContain('budget and financial');
    });

    test('should handle semantic matching failure', async () => {
      mockOllamaClient.generate.mockRejectedValue(new Error('Semantic matching failed'));

      const result = await enhancedLLM.semanticSimilarityMatching(
        'category', [{ name: 'Test' }], 'content'
      );

      expect(result).toHaveLength(1);
      expect(result[0].folder).toBe('Test');
      expect(result[0].similarity).toBe(0.5);
      expect(result[0].reasoning).toBe('fallback');
    });

    test('should perform enhanced folder matching with context', async () => {
      const result = await enhancedLLM.enhancedFolderMatching(
        'Budget Report',
        [{ name: 'Financial Planning' }, { name: 'Reports' }],
        { userId: 'test_user' },
        'Budget analysis document'
      );

      expect(result.category).toBe('Financial Planning');
      expect(result.matchConfidence).toBe(0.92);
      expect(result.matchMethod).toBe('semantic');
    });
  });

  describe('User Learning and Patterns', () => {
    test('should learn from analysis results', async () => {
      const fileName = 'budget_2024.pdf';
      const analysis = {
        category: 'Financial Planning',
        confidence: 88,
        project: 'Budget Analysis'
      };
      const userContext = { userId: 'test_user' };

      await enhancedLLM.learnFromAnalysis(fileName, analysis, userContext);

      const userHistory = enhancedLLM.userPatterns.get('test_user');
      expect(userHistory).toHaveLength(1);
      expect(userHistory[0].fileName).toBe(fileName);
      expect(userHistory[0].analysis.category).toBe('Financial Planning');
    });

    test('should maintain learning history size limit', async () => {
      const userContext = { userId: 'test_user' };
      
      // Add 105 entries to exceed the 100 limit
      for (let i = 0; i < 105; i++) {
        await enhancedLLM.learnFromAnalysis(
          `file_${i}.pdf`,
          { category: 'Test', confidence: 80 },
          userContext
        );
      }

      const userHistory = enhancedLLM.userPatterns.get('test_user');
      expect(userHistory).toHaveLength(100);
      expect(userHistory[0].fileName).toBe('file_5.pdf'); // First 5 should be removed
    });

    test('should provide user learning statistics', async () => {
      const userContext = { userId: 'stats_user' };
      
      // Add some learning data
      await enhancedLLM.learnFromAnalysis('file1.pdf', { category: 'Financial Planning', confidence: 85 }, userContext);
      await enhancedLLM.learnFromAnalysis('file2.pdf', { category: 'Financial Planning', confidence: 90 }, userContext);
      await enhancedLLM.learnFromAnalysis('file3.pdf', { category: 'Reports', confidence: 80 }, userContext);

      const stats = enhancedLLM.getUserLearningStats('stats_user');

      expect(stats.totalAnalyses).toBe(3);
      expect(stats.averageConfidence).toBeCloseTo(85);
      expect(stats.commonCategories).toHaveLength(2);
      expect(stats.commonCategories[0].category).toBe('Financial Planning');
      expect(stats.commonCategories[0].count).toBe(2);
    });

    test('should calculate learning trends correctly', () => {
      // Mock history with improving trend
      const improvingHistory = [];
      for (let i = 0; i < 20; i++) {
        improvingHistory.push({
          confidence: i < 10 ? 70 + i : 80 + (i - 10) // 70-79, then 80-89
        });
      }

      const trend = enhancedLLM.calculateLearningTrend(improvingHistory);
      expect(trend).toBe('improving');

      // Test insufficient data
      const shortHistory = [{ confidence: 80 }, { confidence: 85 }];
      const shortTrend = enhancedLLM.calculateLearningTrend(shortHistory);
      expect(shortTrend).toBe('insufficient_data');
    });
  });

  describe('Parameter Optimization', () => {
    test('should optimize parameters for different task types', () => {
      const categorizationParams = enhancedLLM.getOptimizedParameters('categorization', 'medium');
      expect(categorizationParams.temperature).toBe(0.1);
      expect(categorizationParams.top_k).toBe(15);

      const summarizationParams = enhancedLLM.getOptimizedParameters('summarization', 'high');
      expect(summarizationParams.temperature).toBe(0.3);
      expect(summarizationParams.num_predict).toBe(1200);

      const creativeParams = enhancedLLM.getOptimizedParameters('creative', 'low');
      expect(creativeParams.temperature).toBe(0.7);
      expect(creativeParams.top_k).toBe(35);
    });

    test('should provide different parameter profiles', () => {
      expect(enhancedLLM.parameterProfiles.factual.temperature).toBe(0.1);
      expect(enhancedLLM.parameterProfiles.creative.temperature).toBe(0.8);
      expect(enhancedLLM.parameterProfiles.precise.temperature).toBe(0.05);
      expect(enhancedLLM.parameterProfiles.balanced.temperature).toBe(0.3);
    });
  });

  describe('Analysis Refinement', () => {
    test('should refine analysis for low confidence results', async () => {
      const lowConfidenceAnalysis = {
        category: 'Unknown',
        confidence: 65,
        project: 'Test'
      };

      const refinedResponse = {
        response: JSON.stringify({
          category: 'Financial Planning',
          confidence: 85,
          project: 'Budget Analysis'
        })
      };

      mockOllamaClient.generate.mockResolvedValue(refinedResponse);

      const result = await enhancedLLM.refineAnalysis(
        lowConfidenceAnalysis,
        'Budget document content',
        'budget.pdf',
        []
      );

      expect(result.confidence).toBe(85);
      expect(result.refined).toBe(true);
    });

    test('should not refine high confidence results', async () => {
      const highConfidenceAnalysis = {
        category: 'Financial Planning',
        confidence: 92,
        project: 'Budget Analysis'
      };

      const result = await enhancedLLM.refineAnalysis(
        highConfidenceAnalysis,
        'content',
        'file.pdf',
        []
      );

      expect(result.confidence).toBe(92);
      expect(result.refined).toBeUndefined();
      expect(mockOllamaClient.generate).not.toHaveBeenCalled();
    });
  });

  describe('Helper Methods', () => {
    test('should provide fallback analysis', () => {
      const fallback = enhancedLLM.getFallbackAnalysis('test.pdf', 'document');
      
      expect(fallback.category).toBe('Documents');
      expect(fallback.confidence).toBe(50);
      expect(fallback.fallback).toBe(true);
    });

    test('should combine analysis results correctly', () => {
      const initial = { category: 'Test', confidence: 70 };
      const refined = { category: 'Better', confidence: 85, keywords: ['test'] };

      const combined = enhancedLLM.combineAnalysisResults(initial, refined);

      expect(combined.category).toBe('Better');
      expect(combined.confidence).toBe(85);
      expect(combined.keywords).toEqual(['test']);
      expect(combined.refined).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle Ollama API errors gracefully', async () => {
      mockOllamaClient.generate.mockRejectedValue(new Error('Connection failed'));

      const result = await enhancedLLM.analyzeDocumentEnhanced(
        'test content',
        'test.pdf',
        [{ name: 'Test Folder' }],
        {}
      );

      expect(result.fallback).toBe(true);
      expect(result.category).toBe('Documents');
    });

    test('should handle malformed JSON responses', async () => {
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
  });
}); 