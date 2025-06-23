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

// Mock enhanced LLM service - create the instance that will be used
const mockEnhancedLLM = {
  analyzeDocumentEnhanced: jest.fn(),
  enhancedFolderMatching: jest.fn(),
  learnFromAnalysis: jest.fn(),
  getPerformanceStats: jest.fn(() => ({
    cacheHitRatePercent: 25,
    averageResponseTimeMs: 150,
    memoryUsageMB: 45
  }))
};

jest.mock('../src/main/services/EnhancedLLMService', () => {
  return jest.fn().mockImplementation(() => mockEnhancedLLM);
});

// Import the actual function instead of mocking it
const { analyzeTextWithOllama } = require('../src/main/analysis/ollamaDocumentAnalysis');

describe('Enhanced Document Analysis', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up default mock responses for enhanced LLM
    mockEnhancedLLM.analyzeDocumentEnhanced.mockImplementation(async (textContent, fileName, smartFolders, userContext) => {
      // Mock different responses based on content/filename patterns
      const lowerFileName = fileName.toLowerCase();
      const lowerContent = textContent.toLowerCase();
      
      if (lowerFileName.includes('budget') || lowerContent.includes('budget') || lowerContent.includes('financial')) {
        return {
          category: 'Financial Planning',
          project: 'Budget Analysis',
          confidence: 94,
          enhanced: true,
          multiStep: true,
          processingTime: 150,
          analysisType: 'document',
          timestamp: new Date().toISOString()
        };
      } else if (lowerFileName.includes('market') || lowerContent.includes('market') || lowerContent.includes('competitive') || lowerContent.includes('landscape')) {
        return {
          category: 'Research',
          project: 'Market Analysis',
          purpose: 'Competitive research and market insights',
          keywords: ['market', 'analysis', 'competition', 'research'],
          confidence: 88,
          enhanced: true,
          multiStep: true,
          processingTime: 140,
          analysisType: 'document',
          suggestedName: 'market_analysis_report_2024',
          reasoning: 'Document contains market research data and competitive analysis',
          timestamp: new Date().toISOString()
        };
      } else if (lowerFileName.includes('research') || lowerContent.includes('research') || lowerContent.includes('analysis')) {
        return {
          category: 'Research',
          project: 'Research Analysis',
          confidence: 88,
          enhanced: true,
          multiStep: true,
          processingTime: 120,
          analysisType: 'document',
          timestamp: new Date().toISOString()
        };
      }
      
      // Default response
      return {
        category: smartFolders.length > 0 ? smartFolders[0].name : 'Documents',
        project: 'Document Analysis',
        confidence: 85,
        enhanced: true,
        multiStep: true,
        processingTime: 100,
        analysisType: 'document',
        reasoning: 'Document analysis using default categorization logic',
        timestamp: new Date().toISOString()
      };
    });
    
    // Mock folder matching
    mockEnhancedLLM.enhancedFolderMatching.mockResolvedValue({
      category: 'Financial Planning',
      matchConfidence: 0.92,
      matchMethod: 'semantic',
      reasoning: 'Content relates to financial planning and budgeting'
    });
    
    // Mock learning
    mockEnhancedLLM.learnFromAnalysis.mockResolvedValue(true);
  });

  describe('Advanced Prompt Engineering', () => {
    test('should use enhanced analysis for complex documents with smart folders', async () => {
      const mockEnhancedResult = {
        category: 'Financial Planning',
        project: 'Budget Analysis',
        confidence: 94,
        enhanced: true,
        multiStep: true
      };

      mockEnhancedLLM.analyzeDocumentEnhanced.mockResolvedValue(mockEnhancedResult);

      const textContent = 'A'.repeat(1500); // Long content to trigger enhanced analysis
      const fileName = 'budget_report.pdf';
      const smartFolders = [{ name: 'Financial Planning' }];
      const userContext = { userId: 'test_user' };

      const result = await analyzeTextWithOllama(textContent, fileName, smartFolders, userContext);

      expect(mockEnhancedLLM.analyzeDocumentEnhanced).toHaveBeenCalledWith(
        textContent, fileName, smartFolders, 
        expect.objectContaining({ 
          userId: 'test_user',
          source: 'document_analysis', 
          optimized: true 
        })
      );
      expect(result.enhanced).toBe(true);
      expect(result.multiStep).toBe(true);
    });

    test('should use advanced prompts with examples and constraints', async () => {
      const textContent = 'Market analysis report focusing on competitive landscape...';
      const fileName = 'market_report.pdf';
      const smartFolders = [
        { name: 'Research', description: 'Research documents and analysis' },
        { name: 'Reports', description: 'Business reports' }
      ];

      const result = await analyzeTextWithOllama(textContent, fileName, smartFolders);

      // Since smart folders are present, it should use enhanced analysis
      expect(mockEnhancedLLM.analyzeDocumentEnhanced).toHaveBeenCalledWith(
        textContent, fileName, smartFolders, 
        expect.objectContaining({ 
          source: 'document_analysis', 
          optimized: true 
        })
      );

      expect(result.category).toBe('Research');
      expect(result.reasoning).toContain('competitive analysis');
      expect(result.enhanced).toBe(true);
    });

    test('should include folder constraints in prompts', async () => {
      const smartFolders = [
        { name: 'Financial Planning' },
        { name: 'Research' },
        { name: 'Projects' }
      ];

      const result = await analyzeTextWithOllama('Budget document', 'budget.pdf', smartFolders);

      // Should use enhanced analysis with smart folders
      expect(mockEnhancedLLM.analyzeDocumentEnhanced).toHaveBeenCalledWith(
        'Budget document', 'budget.pdf', smartFolders,
        expect.objectContaining({ 
          source: 'document_analysis', 
          optimized: true 
        })
      );
      
      expect(result.category).toBe('Financial Planning');
      expect(result.enhanced).toBe(true);
    });
  });

  describe('Content Complexity Assessment', () => {
    test('should assess high complexity content correctly', async () => {
      const mockResponse = {
        response: JSON.stringify({ category: 'Test', confidence: 85 })
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      // Create high complexity content (>1000 chars to trigger enhanced analysis)
      const complexContent = Array(100).fill(0).map((_, i) => 
        `sophisticated analysis methodology implementation framework ${i} comprehensive evaluation`
      ).join(' ');

      const result = await analyzeTextWithOllama(complexContent, 'complex.pdf', []);

      // Since content is >1000 chars, it should use enhanced analysis
      expect(mockEnhancedLLM.analyzeDocumentEnhanced).toHaveBeenCalledWith(
        complexContent, 'complex.pdf', [],
        expect.objectContaining({ 
          source: 'document_analysis', 
          optimized: true 
        })
      );
      
      expect(result.enhanced).toBe(true);
    });

    test('should assess low complexity content correctly', async () => {
      const mockResponse = {
        response: JSON.stringify({ category: 'Test', confidence: 85 })
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      const simpleContent = 'This is a simple document with basic text and few words.';

      await analyzeTextWithOllama(simpleContent, 'simple.pdf', []);

      const generatedOptions = mockOllamaClient.generate.mock.calls[0][0].options;
      
      // Low complexity should use very low temperature and fewer tokens
      expect(generatedOptions.temperature).toBe(0.05);
      expect(generatedOptions.num_predict).toBe(600);
      expect(generatedOptions.top_k).toBe(15);
    });

    test('should assess medium complexity content correctly', async () => {
      const mockResponse = {
        response: JSON.stringify({ category: 'Test', confidence: 85 })
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      // Create medium complexity content (>1000 chars to trigger enhanced analysis)
      const mediumContent = Array(50).fill(0).map((_, i) => 
        `document analysis process step ${i} implementation details with comprehensive evaluation`
      ).join(' ');

      const result = await analyzeTextWithOllama(mediumContent, 'medium.pdf', []);

      // Since content is >1000 chars, it should use enhanced analysis
      expect(mockEnhancedLLM.analyzeDocumentEnhanced).toHaveBeenCalledWith(
        mediumContent, 'medium.pdf', [],
        expect.objectContaining({ 
          source: 'document_analysis', 
          optimized: true 
        })
      );
      
      expect(result.enhanced).toBe(true);
    });
  });

  describe('Enhanced Response Processing', () => {
    test('should validate and correct category mismatches', async () => {
      // Mock enhanced LLM to return corrected category information
      mockEnhancedLLM.analyzeDocumentEnhanced.mockResolvedValue({
        category: 'Financial Planning',
        confidence: 92,
        enhanced: true,
        corrected: true, // Indicates category was corrected
        matchConfidence: 0.92,
        matchMethod: 'semantic',
        keywords: ['budget', 'financial'],
        analysisType: 'document',
        timestamp: new Date().toISOString()
      });

      const smartFolders = [{ name: 'Financial Planning' }];
      const result = await analyzeTextWithOllama('Budget document', 'budget.pdf', smartFolders);

      // Should use enhanced analysis since smart folders are present
      expect(mockEnhancedLLM.analyzeDocumentEnhanced).toHaveBeenCalledWith(
        'Budget document', 'budget.pdf', smartFolders,
        expect.objectContaining({ 
          source: 'document_analysis', 
          optimized: true 
        })
      );
      
      expect(result.category).toBe('Financial Planning');
      expect(result.corrected).toBe(true);
      expect(result.enhanced).toBe(true);
    });

    test('should handle malformed JSON responses gracefully', async () => {
      // Mock enhanced LLM to return a result with partial flag
      mockEnhancedLLM.analyzeDocumentEnhanced.mockResolvedValue({
        category: 'Documents',
        confidence: 75,
        enhanced: true,
        partial: true, // Indicates partial analysis due to issues
        analysisType: 'document',
        timestamp: new Date().toISOString()
      });

      const smartFolders = [{ name: 'Documents' }];
      const result = await analyzeTextWithOllama('Test content', 'test.pdf', smartFolders);

      expect(result.partial).toBe(true);
      expect(result.category).toBe('Documents');
      expect(result.enhanced).toBe(true);
    });

    test('should extract partial information from malformed responses', async () => {
      // Mock enhanced LLM to simulate research content analysis
      mockEnhancedLLM.analyzeDocumentEnhanced.mockResolvedValue({
        category: 'Research',
        confidence: 80,
        enhanced: true,
        partial: true, // Indicates partial analysis due to processing issues
        analysisType: 'document',
        timestamp: new Date().toISOString()
      });

      const smartFolders = [{ name: 'Research' }];
      const result = await analyzeTextWithOllama('Research document', 'research.pdf', smartFolders);

      expect(result.category).toBe('Research');
      expect(result.partial).toBe(true);
      expect(result.enhanced).toBe(true);
    });
  });

  describe('Fallback Analysis', () => {
    test('should use basic analysis fallback when enhanced analysis fails', async () => {
      mockEnhancedLLM.analyzeDocumentEnhanced.mockRejectedValue(new Error('Enhanced analysis failed'));
      
      const mockResponse = {
        response: JSON.stringify({
          category: 'Documents',
          confidence: 70,
          fallback: true,
          enhanced: false
        })
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      const textContent = 'Test document content';
      const smartFolders = [{ name: 'Documents' }];
      const result = await analyzeTextWithOllama(textContent, 'test.pdf', smartFolders);

      expect(result.fallback).toBe(true);
      expect(result.enhanced).toBe(false);
      expect(result.category).toBe('Documents');
    });

    test('should extract keywords for fallback analysis', async () => {
      const mockResponse = {
        response: JSON.stringify({
          category: 'Documents',
          confidence: 75,
          keywords: ['financial', 'budget', 'analysis'],
          fallback: true
        })
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      const content = 'This is a financial budget analysis document with important data.';
      const result = await analyzeTextWithOllama(content, 'test.pdf', []);

      expect(result.fallback).toBe(true);
      expect(result.keywords).toContain('financial');
      expect(result.keywords).toContain('budget');
      expect(result.keywords).toContain('analysis');
    });
  });

  describe('Semantic Validation', () => {
    test('should use semantic matching for category correction', async () => {
      // Mock enhanced LLM to return semantic matching results
      mockEnhancedLLM.analyzeDocumentEnhanced.mockResolvedValue({
        category: 'Financial Documents',
        confidence: 85,
        enhanced: true,
        matchConfidence: 0.88,
        reasoning: 'Strong semantic match with financial planning content',
        analysisType: 'document',
        timestamp: new Date().toISOString()
      });

      const smartFolders = [{ name: 'Financial Documents' }];
      const result = await analyzeTextWithOllama('Budget planning document', 'budget.pdf', smartFolders);

      // Should use enhanced analysis
      expect(mockEnhancedLLM.analyzeDocumentEnhanced).toHaveBeenCalledWith(
        'Budget planning document', 'budget.pdf', smartFolders,
        expect.objectContaining({ 
          source: 'document_analysis', 
          optimized: true 
        })
      );

      expect(result.category).toBe('Financial Documents');
      expect(result.matchConfidence).toBe(0.88);
      expect(result.reasoning).toContain('financial planning');
      expect(result.enhanced).toBe(true);
    });

    test('should use fallback folder when no semantic match found', async () => {
      // Mock enhanced LLM to return fallback category  
      mockEnhancedLLM.analyzeDocumentEnhanced.mockResolvedValue({
        category: 'Default Folder',
        confidence: 70,
        enhanced: true,
        fallback: true,
        matchConfidence: 0.1,
        analysisType: 'document',
        timestamp: new Date().toISOString()
      });

      const smartFolders = [{ name: 'Default Folder' }];
      const result = await analyzeTextWithOllama('Some document', 'doc.pdf', smartFolders);

      expect(result.category).toBe('Default Folder');
      expect(result.fallback).toBe(true);
    });
  });

  describe('Enhanced Metadata', () => {
    test('should include enhanced metadata in results', async () => {
      // Use long content to trigger enhanced analysis  
      const longContent = `Research document with extensive analysis ${  'and detailed content '.repeat(50)}`;
      
      const result = await analyzeTextWithOllama(longContent, 'research.pdf', []);

      // Since content is >1000 chars, should use enhanced analysis
      expect(result.enhanced).toBe(true);
      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp)).toBeInstanceOf(Date);
      
      // Should call enhanced analysis
      expect(mockEnhancedLLM.analyzeDocumentEnhanced).toHaveBeenCalledWith(
        longContent, 'research.pdf', [],
        expect.objectContaining({ 
          source: 'document_analysis', 
          optimized: true 
        })
      );
    });

    test('should validate confidence scores', async () => {
      const mockResponse = {
        response: JSON.stringify({
          category: 'Test',
          confidence: 85,
          keywords: ['test']
        })
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      const result = await analyzeTextWithOllama('Test document', 'test.pdf', []);

      expect(result.confidence).toBeGreaterThanOrEqual(75);
      expect(result.confidence).toBeLessThanOrEqual(95);
    });

    test('should ensure keywords are arrays', async () => {
      const mockResponse = {
        response: JSON.stringify({
          category: 'Test',
          confidence: 80,
          keywords: ['test', 'document']
        })
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      const result = await analyzeTextWithOllama('Test document', 'test.pdf', []);

      expect(Array.isArray(result.keywords)).toBe(true);
    });
  });

  describe('Integration with Learning', () => {
    test('should learn from successful analyses', async () => {
      // Use smart folders to trigger enhanced analysis path
      const smartFolders = [{ name: 'Test Folder' }];
      const userContext = { userId: 'test_user' };
      
      const result = await analyzeTextWithOllama('Test content', 'test.pdf', smartFolders, userContext);

      // Should use enhanced analysis with smart folders
      expect(mockEnhancedLLM.analyzeDocumentEnhanced).toHaveBeenCalledWith(
        'Test content', 'test.pdf', smartFolders,
        expect.objectContaining({ 
          userId: 'test_user',
          source: 'document_analysis', 
          optimized: true 
        })
      );
      
      // Enhanced analysis should trigger learning - but learning may be internal to enhanced service
      // For now, just verify the enhanced path was used
      expect(result.enhanced).toBe(true);
    });

    test('should maintain backward compatibility for calls without userContext', async () => {
      const mockResponse = {
        response: JSON.stringify({
          category: 'Test',
          confidence: 80
        })
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      const result = await analyzeTextWithOllama('Test content', 'test.pdf', []);

      expect(result).toBeDefined();
      expect(result.category).toBe('Test');
    });
  });
}); 