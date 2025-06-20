/**
 * Enhanced LLM Validation Test Suite
 * Practical tests that validate the enhanced LLM functionality works correctly
 */

// Mock Ollama with realistic responses
const mockOllamaClient = {
  generate: jest.fn()
};

jest.mock('ollama', () => ({
  Ollama: jest.fn().mockImplementation(() => mockOllamaClient)
}));

const EnhancedLLMService = require('../src/main/services/EnhancedLLMService');

describe('Enhanced LLM Validation', () => {
  let enhancedLLM;
  
  beforeEach(() => {
    enhancedLLM = new EnhancedLLMService('http://127.0.0.1:11434');
    jest.clearAllMocks();
  });

  describe('Core Service Functionality', () => {
    test('should initialize with all required components', () => {
      // Verify service initializes with all enhanced capabilities
      expect(enhancedLLM.domainTemplates).toBeDefined();
      expect(enhancedLLM.domainTemplates.size).toBeGreaterThan(0);
      expect(enhancedLLM.parameterProfiles).toBeDefined();
      expect(enhancedLLM.userPatterns).toBeDefined();
      expect(enhancedLLM.ollama).toBeDefined();
      
      // Verify specific domain templates exist
      expect(enhancedLLM.domainTemplates.has('document')).toBe(true);
      expect(enhancedLLM.domainTemplates.has('image')).toBe(true);
      
      // Verify parameter profiles are configured
      expect(enhancedLLM.parameterProfiles.factual).toBeDefined();
      expect(enhancedLLM.parameterProfiles.creative).toBeDefined();
      expect(enhancedLLM.parameterProfiles.balanced).toBeDefined();
      expect(enhancedLLM.parameterProfiles.precise).toBeDefined();
    });

    test('should provide optimized parameters for different scenarios', () => {
      // Test parameter optimization for different task types
      const categorizationParams = enhancedLLM.getOptimizedParameters('categorization', 'medium');
      expect(categorizationParams.temperature).toBe(0.1); // Low temperature for precise categorization
      expect(categorizationParams.top_k).toBe(15);
      
      const creativeParams = enhancedLLM.getOptimizedParameters('creative', 'high');
      expect(creativeParams.temperature).toBe(0.7); // Higher temperature for creative tasks
      expect(creativeParams.top_k).toBe(35);
      
      const extractionParams = enhancedLLM.getOptimizedParameters('extraction', 'low');
      expect(extractionParams.temperature).toBe(0.05); // Very low for precise extraction
    });
  });

  describe('Document Analysis Pipeline', () => {
    test('should perform enhanced document analysis with multi-step processing', async () => {
      // Mock the multi-step analysis responses
      const contentStructureResponse = {
        response: JSON.stringify({
          documentType: "financial_report",
          keyEntities: ["Q1 2024", "revenue", "budget"],
          mainTopics: ["financial performance", "budget analysis"],
          contentQuality: "high",
          structureScore: 9
        })
      };

      const domainAnalysisResponse = {
        response: JSON.stringify({
          category: "Financial Planning",
          project: "Budget Analysis",
          purpose: "Financial performance review and planning",
          keywords: ["budget", "financial", "revenue", "quarterly"],
          confidence: 94,
          reasoning: "Comprehensive financial analysis document"
        })
      };

      const semanticMatchingResponse = {
        response: JSON.stringify([
          { folder: "Financial Planning", similarity: 0.95, reasoning: "Perfect match for budget analysis" },
          { folder: "Reports", similarity: 0.78, reasoning: "General report structure" }
        ])
      };

      // Set up mock responses in sequence
      mockOllamaClient.generate
        .mockResolvedValueOnce(contentStructureResponse)   // Content structure analysis
        .mockResolvedValueOnce(domainAnalysisResponse)     // Domain-specific analysis  
        .mockResolvedValueOnce(semanticMatchingResponse);  // Semantic folder matching

      const textContent = "Quarterly Financial Report Q1 2024\n\nRevenue Analysis:\nTotal revenue increased by 15% compared to previous quarter...\n\nBudget Performance:\nOverall budget adherence at 94%...";
      const fileName = "q1_financial_report.pdf";
      const smartFolders = [
        { name: "Financial Planning", description: "Budget and financial documents" },
        { name: "Reports", description: "Business reports and analytics" }
      ];
      const userContext = { userId: "test_user" };

      const result = await enhancedLLM.analyzeDocumentEnhanced(
        textContent, 
        fileName, 
        smartFolders, 
        userContext
      );

      // Verify the enhanced analysis worked
      expect(result).toBeDefined();
      expect(result.category).toBe("Financial Planning");
      expect(result.matchConfidence).toBe(0.95);
      expect(result.matchMethod).toBe('semantic');
      
      // Verify all analysis steps were called
      expect(mockOllamaClient.generate).toHaveBeenCalledTimes(3);
      
      // Verify user learning was recorded
      const userHistory = enhancedLLM.userPatterns.get("test_user");
      expect(userHistory).toHaveLength(1);
      expect(userHistory[0].fileName).toBe(fileName);
    });

    test('should handle analysis failures gracefully with fallbacks', async () => {
      // Mock API failure
      mockOllamaClient.generate.mockRejectedValue(new Error('API connection failed'));

      const result = await enhancedLLM.analyzeDocumentEnhanced(
        "Test document content",
        "test.pdf",
        [{ name: "Documents" }],
        { userId: "test_user" }
      );

      // Should return fallback analysis
      expect(result).toBeDefined();
      expect(result.category).toBe('Documents');
      expect(result.confidence).toBe(50);
      expect(result.fallback).toBe(true);
    });
  });

  describe('Semantic Folder Matching', () => {
    test('should perform intelligent semantic matching between categories and folders', async () => {
      const mockResponse = {
        response: JSON.stringify([
          { folder: "Financial Planning", similarity: 0.92, reasoning: "Content focuses on budget and financial analysis" },
          { folder: "Reports", similarity: 0.75, reasoning: "Document is structured as a business report" },
          { folder: "Projects", similarity: 0.23, reasoning: "No specific project context identified" }
        ])
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      const suggestedCategory = "Budget Analysis";
      const smartFolders = [
        { name: "Financial Planning", description: "Budget and financial documents" },
        { name: "Reports", description: "Business reports" },
        { name: "Projects", description: "Project documentation" }
      ];
      const content = "Quarterly budget analysis with revenue projections";

      const result = await enhancedLLM.semanticSimilarityMatching(
        suggestedCategory,
        smartFolders,
        content
      );

      expect(result).toHaveLength(3);
      expect(result[0].folder).toBe("Financial Planning");
      expect(result[0].similarity).toBe(0.92);
      expect(result[0].reasoning).toContain("budget and financial");
      
      // Verify the LLM was called with appropriate context
      expect(mockOllamaClient.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemma3:4b',
          format: 'json',
          prompt: expect.stringContaining('SUGGESTED CATEGORY: "Budget Analysis"')
        })
      );
    });

    test('should enhance folder matching with context and reasoning', async () => {
      const mockResponse = {
        response: JSON.stringify([
          { folder: "UI Documentation", similarity: 0.93, reasoning: "Interface documentation screenshot" }
        ])
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      const result = await enhancedLLM.enhancedFolderMatching(
        "UI Design",
        [{ name: "UI Documentation" }],
        { userId: "test" },
        "User interface design mockups"
      );

      expect(result.category).toBe("UI Documentation");
      expect(result.matchConfidence).toBe(0.93);
      expect(result.matchMethod).toBe('semantic');
      expect(result.reasoning).toContain("Interface documentation");
    });
  });

  describe('User Learning System', () => {
    test('should learn from user analysis patterns', async () => {
      const userContext = { userId: "learning_user" };
      
      // Simulate multiple analyses
      await enhancedLLM.learnFromAnalysis("budget_q1.pdf", { category: "Financial Planning", confidence: 85 }, userContext);
      await enhancedLLM.learnFromAnalysis("budget_q2.pdf", { category: "Financial Planning", confidence: 88 }, userContext);
      await enhancedLLM.learnFromAnalysis("revenue_report.pdf", { category: "Financial Planning", confidence: 90 }, userContext);
      await enhancedLLM.learnFromAnalysis("ui_mockup.png", { category: "Design Assets", confidence: 82 }, userContext);

      const stats = enhancedLLM.getUserLearningStats("learning_user");

      expect(stats.totalAnalyses).toBe(4);
      expect(stats.averageConfidence).toBeCloseTo(86.25);
      expect(stats.commonCategories).toHaveLength(2);
      expect(stats.commonCategories[0].category).toBe("Financial Planning");
      expect(stats.commonCategories[0].count).toBe(3);
    });

    test('should calculate learning trends accurately', () => {
      // Test improving trend
      const improvingHistory = [];
      for (let i = 0; i < 20; i++) {
        improvingHistory.push({
          confidence: 70 + i // Gradually improving confidence scores
        });
      }

      const trend = enhancedLLM.calculateLearningTrend(improvingHistory);
      expect(trend).toBe('improving');

      // Test insufficient data
      const shortHistory = [{ confidence: 80 }];
      const shortTrend = enhancedLLM.calculateLearningTrend(shortHistory);
      expect(shortTrend).toBe('insufficient_data');
    });

    test('should limit user history to prevent memory issues', async () => {
      const userContext = { userId: "heavy_user" };
      
      // Add 105 entries to exceed the 100 limit
      for (let i = 0; i < 105; i++) {
        await enhancedLLM.learnFromAnalysis(
          `file_${i}.pdf`,
          { category: "Test", confidence: 80 },
          userContext
        );
      }

      const userHistory = enhancedLLM.userPatterns.get("heavy_user");
      expect(userHistory).toHaveLength(100); // Should be capped at 100
    });
  });

  describe('Advanced Prompt Engineering', () => {
    test('should use domain-specific templates with examples and constraints', async () => {
      const mockResponse = {
        response: JSON.stringify({
          category: "Research",
          confidence: 88,
          reasoning: "Document contains research methodology"
        })
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      const result = await enhancedLLM.performDomainSpecificAnalysis(
        "Market research analysis document content...",
        "research.pdf",
        "document"
      );

      expect(result.category).toBe("Research");
      expect(result.confidence).toBe(88);
      
      // Verify the prompt included examples and constraints
      const calledPrompt = mockOllamaClient.generate.mock.calls[0][0].prompt;
      expect(calledPrompt).toContain('ANALYSIS EXAMPLES:');
      expect(calledPrompt).toContain('ANALYSIS CONSTRAINTS:');
      expect(calledPrompt).toContain('expert document analysis specialist');
    });
  });

  describe('Error Handling and Robustness', () => {
    test('should handle malformed JSON responses gracefully', async () => {
      mockOllamaClient.generate.mockResolvedValue({
        response: "Invalid JSON: { category: Financial Planning, confidence }"
      });

      const result = await enhancedLLM.performDomainSpecificAnalysis(
        "content",
        "file.pdf",
        "document"
      );

      expect(result.fallback).toBe(true);
      expect(result.category).toBe('Documents');
    });

    test('should handle API connection errors', async () => {
      mockOllamaClient.generate.mockRejectedValue(new Error('ECONNREFUSED: Connection refused'));

      const result = await enhancedLLM.analyzeContentStructure(
        "content",
        "file.pdf"
      );

      expect(result.documentType).toBe('unknown');
      expect(result.structureScore).toBe(5);
      expect(result.contentQuality).toBe('medium');
    });

    test('should provide appropriate fallback analysis', () => {
      const documentFallback = enhancedLLM.getFallbackAnalysis('test.pdf', 'document');
      expect(documentFallback.category).toBe('Documents');
      expect(documentFallback.confidence).toBe(50);
      expect(documentFallback.fallback).toBe(true);

      const imageFallback = enhancedLLM.getFallbackAnalysis('test.png', 'image');
      expect(imageFallback.category).toBe('Images');
      expect(imageFallback.confidence).toBe(50);
      expect(imageFallback.fallback).toBe(true);
    });
  });

  describe('Performance and Efficiency', () => {
    test('should optimize parameters based on task requirements', () => {
      // Test categorization task (needs precision)
      const catParams = enhancedLLM.getOptimizedParameters('categorization', 'medium');
      expect(catParams.temperature).toBe(0.1); // Low for precision
      expect(catParams.top_k).toBe(15); // Limited options

      // Test creative task (needs variety)  
      const creativeParams = enhancedLLM.getOptimizedParameters('creative', 'high');
      expect(creativeParams.temperature).toBe(0.7); // Higher for creativity
      expect(creativeParams.top_k).toBe(35); // More options

      // Test extraction task (needs accuracy)
      const extractParams = enhancedLLM.getOptimizedParameters('extraction', 'low');
      expect(extractParams.temperature).toBe(0.05); // Very low for accuracy
      expect(extractParams.top_k).toBe(10); // Very focused
    });

    test('should combine analysis results intelligently', () => {
      const initial = { category: "Test", confidence: 70, project: "A" };
      const refined = { category: "Better", confidence: 85, keywords: ["test"], project: "B" };

      const combined = enhancedLLM.combineAnalysisResults(initial, refined);

      expect(combined.category).toBe("Better"); // Refined takes precedence
      expect(combined.confidence).toBe(85); // Higher confidence
      expect(combined.keywords).toEqual(["test"]); // Refined data included
      expect(combined.project).toBe("B"); // Refined values override
      expect(combined.refined).toBe(true); // Marked as refined
    });
  });

  describe('Integration Validation', () => {
    test('should demonstrate end-to-end enhanced capabilities', async () => {
      // This test validates that all enhanced features work together
      
      // 1. Parameter optimization
      const params = enhancedLLM.getOptimizedParameters('categorization', 'medium');
      expect(params.temperature).toBe(0.1);
      
      // 2. User learning
      await enhancedLLM.learnFromAnalysis(
        'test.pdf', 
        { category: 'Test', confidence: 85 }, 
        { userId: 'integration_test' }
      );
      
      // 3. Learning statistics
      const stats = enhancedLLM.getUserLearningStats('integration_test');
      expect(stats.totalAnalyses).toBe(1);
      
      // 4. Fallback handling
      const fallback = enhancedLLM.getFallbackAnalysis('unknown.pdf', 'document');
      expect(fallback.fallback).toBe(true);
      
      // 5. Result combination
      const combined = enhancedLLM.combineAnalysisResults(
        { category: 'A', confidence: 70 },
        { category: 'B', confidence: 85 }
      );
      expect(combined.confidence).toBe(85);
      
      // All enhanced features are working correctly
      expect(true).toBe(true); // Integration successful
    });
  });
}); 