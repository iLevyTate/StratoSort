/**
 * Enhanced Document Analysis Test Suite
 * Tests advanced document analysis features including prompt engineering and semantic validation
 */

// Mock Ollama before requiring the analysis module
const mockOllamaClient = {
  generate: jest.fn()
};

jest.mock('ollama', () => ({
  Ollama: jest.fn().mockImplementation(() => mockOllamaClient)
}));

// Mock enhanced LLM service
const mockEnhancedLLM = {
  analyzeDocumentEnhanced: jest.fn(),
  enhancedFolderMatching: jest.fn(),
  learnFromAnalysis: jest.fn()
};

jest.mock('../src/main/services/EnhancedLLMService', () => {
  return jest.fn().mockImplementation(() => mockEnhancedLLM);
});

// Since the module doesn't export individual functions, let's mock the entire module
jest.mock('../src/main/analysis/ollamaDocumentAnalysis', () => ({
  analyzeTextWithOllama: jest.fn()
}));

const { analyzeTextWithOllama } = require('../src/main/analysis/ollamaDocumentAnalysis');

describe('Enhanced Document Analysis', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Advanced Prompt Engineering', () => {
    test('should use enhanced analysis for complex documents with smart folders', async () => {
      const mockEnhancedResult = {
        category: "Financial Planning",
        project: "Budget Analysis",
        confidence: 94,
        enhanced: true,
        multiStep: true
      };

      mockEnhancedLLM.analyzeDocumentEnhanced.mockResolvedValue(mockEnhancedResult);

      const textContent = "A".repeat(1500); // Long content to trigger enhanced analysis
      const fileName = "budget_report.pdf";
      const smartFolders = [{ name: "Financial Planning" }];
      const userContext = { userId: "test_user" };

      const result = await analyzeTextWithOllama(textContent, fileName, smartFolders, userContext);

      expect(mockEnhancedLLM.analyzeDocumentEnhanced).toHaveBeenCalledWith(
        textContent, fileName, smartFolders, userContext
      );
      expect(result.enhanced).toBe(true);
      expect(result.multiStep).toBe(true);
    });

    test('should use advanced prompts with examples and constraints', async () => {
      const mockResponse = {
        response: JSON.stringify({
          category: "Research",
          project: "Market Analysis",
          purpose: "Competitive research and market insights",
          keywords: ["market", "analysis", "competition", "research"],
          confidence: 88,
          suggestedName: "market_analysis_report_2024",
          reasoning: "Document contains market research data and competitive analysis"
        })
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      const textContent = "Market analysis report focusing on competitive landscape...";
      const fileName = "market_report.pdf";
      const smartFolders = [
        { name: "Research", description: "Research documents and analysis" },
        { name: "Reports", description: "Business reports" }
      ];

      const result = await analyzeTextWithOllama(textContent, fileName, smartFolders);

      expect(mockOllamaClient.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemma3:4b',
          format: 'json',
          prompt: expect.stringContaining('📚 ANALYSIS EXAMPLES'),
          options: expect.objectContaining({
            temperature: expect.any(Number),
            num_predict: expect.any(Number)
          })
        })
      );

      expect(result.category).toBe("Research");
      expect(result.reasoning).toContain("competitive analysis");
    });

    test('should include folder constraints in prompts', async () => {
      const mockResponse = {
        response: JSON.stringify({
          category: "Financial Planning",
          confidence: 90
        })
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      const smartFolders = [
        { name: "Financial Planning" },
        { name: "Research" },
        { name: "Projects" }
      ];

      await analyzeTextWithOllama("Budget document", "budget.pdf", smartFolders);

      const generatedPrompt = mockOllamaClient.generate.mock.calls[0][0].prompt;
      
      expect(generatedPrompt).toContain('🎯 CRITICAL FOLDER CONSTRAINTS');
      expect(generatedPrompt).toContain('"Financial Planning", "Research", "Projects"');
      expect(generatedPrompt).toContain('YOU MUST:');
      expect(generatedPrompt).toContain('Choose category EXACTLY from this list');
    });
  });

  describe('Content Complexity Assessment', () => {
    test('should assess high complexity content correctly', async () => {
      const mockResponse = {
        response: JSON.stringify({ category: "Test", confidence: 85 })
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      // Create high complexity content
      const complexContent = Array(300).fill(0).map((_, i) => 
        `sophisticated analysis methodology implementation framework ${i} comprehensive evaluation`
      ).join(' ');

      await analyzeTextWithOllama(complexContent, "complex.pdf", []);

      const generatedOptions = mockOllamaClient.generate.mock.calls[0][0].options;
      
      // High complexity should use higher temperature and more tokens
      expect(generatedOptions.temperature).toBe(0.15);
      expect(generatedOptions.num_predict).toBe(1000);
      expect(generatedOptions.top_k).toBe(25);
    });

    test('should assess low complexity content correctly', async () => {
      const mockResponse = {
        response: JSON.stringify({ category: "Test", confidence: 85 })
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      const simpleContent = "This is a simple document with basic text and few words.";

      await analyzeTextWithOllama(simpleContent, "simple.pdf", []);

      const generatedOptions = mockOllamaClient.generate.mock.calls[0][0].options;
      
      // Low complexity should use very low temperature and fewer tokens
      expect(generatedOptions.temperature).toBe(0.05);
      expect(generatedOptions.num_predict).toBe(600);
      expect(generatedOptions.top_k).toBe(15);
    });

    test('should assess medium complexity content correctly', async () => {
      const mockResponse = {
        response: JSON.stringify({ category: "Test", confidence: 85 })
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      const mediumContent = Array(50).fill(0).map((_, i) => 
        `document analysis process step ${i} implementation details`
      ).join(' ');

      await analyzeTextWithOllama(mediumContent, "medium.pdf", []);

      const generatedOptions = mockOllamaClient.generate.mock.calls[0][0].options;
      
      // Medium complexity should use balanced parameters
      expect(generatedOptions.temperature).toBe(0.1);
      expect(generatedOptions.num_predict).toBe(800);
      expect(generatedOptions.top_k).toBe(20);
    });
  });

  describe('Enhanced Response Processing', () => {
    test('should validate and correct category mismatches', async () => {
      mockEnhancedLLM.enhancedFolderMatching.mockResolvedValue({
        category: "Financial Planning",
        matchConfidence: 0.92,
        matchMethod: 'semantic'
      });

      const mockResponse = {
        response: JSON.stringify({
          category: "Finance", // Incorrect category
          confidence: 85,
          keywords: ["budget", "financial"]
        })
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      const smartFolders = [{ name: "Financial Planning" }];
      const result = await analyzeTextWithOllama("Budget document", "budget.pdf", smartFolders);

      expect(mockEnhancedLLM.enhancedFolderMatching).toHaveBeenCalledWith(
        "Finance",
        smartFolders,
        {},
        "Budget document"
      );
      expect(result.category).toBe("Financial Planning");
      expect(result.corrected).toBe(true);
    });

    test('should handle malformed JSON responses gracefully', async () => {
      const mockResponse = {
        response: "Invalid JSON: { category: Financial Planning, confidence }"
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      const smartFolders = [{ name: "Documents" }];
      const result = await analyzeTextWithOllama("Test content", "test.pdf", smartFolders);

      expect(result.partial).toBe(true);
      expect(result.category).toBe("Documents");
    });

    test('should extract partial information from malformed responses', async () => {
      const mockResponse = {
        response: `{
          "category": "Research",
          "keywords": ["research", "analysis", "study"]
          // Missing closing brace and other malformation
        `
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      const smartFolders = [{ name: "Research" }];
      const result = await analyzeTextWithOllama("Research document", "research.pdf", smartFolders);

      expect(result.category).toBe("Research");
      expect(result.partial).toBe(true);
    });
  });

  describe('Fallback Analysis', () => {
    test('should use basic analysis fallback when enhanced analysis fails', async () => {
      mockEnhancedLLM.analyzeDocumentEnhanced.mockRejectedValue(new Error('Enhanced analysis failed'));

      const textContent = "A".repeat(1500); // Trigger enhanced analysis
      const smartFolders = [{ name: "Documents" }];

      const result = await analyzeTextWithOllama(textContent, "test.pdf", smartFolders);

      expect(result.fallback).toBe(true);
      expect(result.enhanced).toBe(false);
      expect(result.category).toBe("Documents");
    });

    test('should extract keywords for fallback analysis', async () => {
      mockOllamaClient.generate.mockRejectedValue(new Error('API Error'));

      const content = "financial budget analysis quarterly report revenue expenses planning";
      const result = await analyzeTextWithOllama(content, "test.pdf", []);

      expect(result.fallback).toBe(true);
      expect(result.keywords).toContain("financial");
      expect(result.keywords).toContain("budget");
      expect(result.keywords).toContain("analysis");
    });
  });

  describe('Semantic Validation', () => {
    test('should use semantic matching for category correction', async () => {
      mockEnhancedLLM.enhancedFolderMatching.mockResolvedValue({
        category: "Financial Documents",
        matchConfidence: 0.88,
        matchMethod: 'semantic',
        reasoning: "Content relates to financial planning and budgets"
      });

      const mockResponse = {
        response: JSON.stringify({
          category: "Budget Docs", // Non-matching category
          confidence: 82
        })
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      const smartFolders = [{ name: "Financial Documents" }];
      const result = await analyzeTextWithOllama("Budget planning document", "budget.pdf", smartFolders);

      expect(result.category).toBe("Financial Documents");
      expect(result.matchConfidence).toBe(0.88);
      expect(result.reasoning).toContain("financial planning");
    });

    test('should use fallback folder when no semantic match found', async () => {
      mockEnhancedLLM.enhancedFolderMatching.mockResolvedValue(null);

      const mockResponse = {
        response: JSON.stringify({
          category: "Unknown Category",
          confidence: 75
        })
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      const smartFolders = [{ name: "Default Folder" }, { name: "Other Folder" }];
      const result = await analyzeTextWithOllama("Some document", "doc.pdf", smartFolders);

      expect(result.category).toBe("Default Folder");
      expect(result.fallback).toBe(true);
    });
  });

  describe('Enhanced Metadata', () => {
    test('should include enhanced metadata in results', async () => {
      const mockResponse = {
        response: JSON.stringify({
          category: "Research",
          confidence: 90,
          reasoning: "Document contains research methodology and analysis"
        })
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      const result = await analyzeTextWithOllama("Research document", "research.pdf", []);

      expect(result.enhanced).toBe(true);
      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp)).toBeInstanceOf(Date);
    });

    test('should validate confidence scores', async () => {
      const mockResponse = {
        response: JSON.stringify({
          category: "Test",
          confidence: 150 // Invalid confidence > 100
        })
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      const result = await analyzeTextWithOllama("Test document", "test.pdf", []);

      expect(result.confidence).toBeGreaterThanOrEqual(75);
      expect(result.confidence).toBeLessThanOrEqual(95);
    });

    test('should ensure keywords are arrays', async () => {
      const mockResponse = {
        response: JSON.stringify({
          category: "Test",
          confidence: 80,
          keywords: "not an array" // Invalid keywords format
        })
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      const result = await analyzeTextWithOllama("Test document", "test.pdf", []);

      expect(Array.isArray(result.keywords)).toBe(true);
    });
  });

  describe('Integration with Learning', () => {
    test('should not call learning for basic analysis', async () => {
      const mockResponse = {
        response: JSON.stringify({
          category: "Documents",
          confidence: 80
        })
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      const shortContent = "Simple document";
      await analyzeTextWithOllama(shortContent, "simple.pdf", [], { userId: "test" });

      expect(mockEnhancedLLM.learnFromAnalysis).not.toHaveBeenCalled();
    });

    test('should maintain backward compatibility for calls without userContext', async () => {
      const mockResponse = {
        response: JSON.stringify({
          category: "Test",
          confidence: 85
        })
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      // Call without userContext (backward compatibility)
      const result = await analyzeTextWithOllama("Test content", "test.pdf", []);

      expect(result).toBeDefined();
      expect(result.category).toBe("Test");
    });
  });
}); 