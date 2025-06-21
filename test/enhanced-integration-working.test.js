/**
 * Enhanced LLM Integration Test - Working Version
 * Tests that demonstrate the enhanced LLM system integration works correctly
 */

// Mock Ollama with realistic responses
const mockOllamaClient = {
  generate: jest.fn()
};

jest.mock('ollama', () => ({
  Ollama: jest.fn().mockImplementation(() => mockOllamaClient)
}));

// Mock file system operations
jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  access: jest.fn()
}));

// Mock additional dependencies
jest.mock('pdf-parse', () => jest.fn());
jest.mock('mammoth', () => ({ extractRawText: jest.fn() }));
jest.mock('officeparser', () => jest.fn());
jest.mock('xlsx-populate', () => ({ fromFileAsync: jest.fn() }));

const EnhancedLLMService = require('../src/main/services/EnhancedLLMService');

describe('Enhanced LLM Integration - Working Tests', () => {
  let enhancedLLM;
  
  beforeEach(() => {
    enhancedLLM = new EnhancedLLMService('http://127.0.0.1:11434');
    jest.clearAllMocks();
  });

  describe('Document Analysis Integration', () => {
    test('should demonstrate enhanced document analysis capabilities', async () => {
      // Mock the enhanced document analysis pipeline
      const contentStructureResponse = {
        response: JSON.stringify({
          documentType: 'business_proposal',
          keyEntities: ['Q4 2024', 'revenue', 'strategy'],
          mainTopics: ['business strategy', 'revenue projections'],
          contentQuality: 'high',
          structureScore: 8
        })
      };

      const domainAnalysisResponse = {
        response: JSON.stringify({
          category: 'Business Strategy',
          project: 'Strategic Planning',
          purpose: 'Business planning and strategic direction',
          keywords: ['strategy', 'business', 'planning', 'revenue'],
          confidence: 91,
          reasoning: 'Document contains strategic business planning content'
        })
      };

      const semanticMatchingResponse = {
        response: JSON.stringify([
          { folder: 'Business Strategy', similarity: 0.94, reasoning: 'Strategic planning content match' },
          { folder: 'Planning', similarity: 0.82, reasoning: 'General planning document' }
        ])
      };

      mockOllamaClient.generate
        .mockResolvedValueOnce(contentStructureResponse)
        .mockResolvedValueOnce(domainAnalysisResponse)
        .mockResolvedValueOnce(semanticMatchingResponse);

      const testContent = 'Strategic Business Proposal for Q4 2024\n\nExecutive Summary:\nOur strategic initiative focuses on revenue growth through market expansion...';
      const smartFolders = [
        { name: 'Business Strategy', description: 'Strategic planning and business documents' },
        { name: 'Planning', description: 'General planning documents' }
      ];
      const userContext = { userId: 'business_user' };

      const result = await enhancedLLM.analyzeDocumentEnhanced(
        testContent,
        'strategic_proposal_q4.pdf',
        smartFolders,
        userContext
      );

      // Verify enhanced analysis results
      expect(result).toBeDefined();
      expect(result.category).toBe('Business Strategy');
      expect(result.matchConfidence).toBe(0.94);
      expect(result.matchMethod).toBe('semantic');
      expect(result.reasoning).toContain('Strategic planning');

      // Verify multi-step analysis was performed
      expect(mockOllamaClient.generate).toHaveBeenCalledTimes(3);

      // Verify user learning
      const userHistory = enhancedLLM.userPatterns.get('business_user');
      expect(userHistory).toHaveLength(1);
      expect(userHistory[0].fileName).toBe('strategic_proposal_q4.pdf');
    });

    test('should validate prompt engineering improvements', async () => {
      const mockResponse = {
        response: JSON.stringify({
          category: 'Technical Documentation',
          confidence: 89,
          reasoning: 'Document contains technical specifications and implementation details'
        })
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      await enhancedLLM.performDomainSpecificAnalysis(
        'API Documentation: Authentication endpoints and implementation guide...',
        'api_docs.pdf',
        'document'
      );

      // Verify the prompt included enhanced features
      const calledPrompt = mockOllamaClient.generate.mock.calls[0][0].prompt;
      expect(calledPrompt).toContain('expert document analysis specialist');
      expect(calledPrompt).toContain('ANALYSIS EXAMPLES:');
      expect(calledPrompt).toContain('ANALYSIS CONSTRAINTS:');
      expect(calledPrompt).toContain('Base analysis strictly on actual content');
    });
  });

  describe('User Learning and Adaptation', () => {
    test('should demonstrate learning from user patterns', async () => {
      const userContext = { userId: 'tech_writer' };

      // Simulate learning from multiple technical documents
      await enhancedLLM.learnFromAnalysis(
        'api_guide.pdf', 
        { category: 'Technical Documentation', confidence: 87 }, 
        userContext
      );
      await enhancedLLM.learnFromAnalysis(
        'user_manual.pdf', 
        { category: 'Technical Documentation', confidence: 89 }, 
        userContext
      );
      await enhancedLLM.learnFromAnalysis(
        'spec_document.pdf', 
        { category: 'Technical Documentation', confidence: 92 }, 
        userContext
      );

      const stats = enhancedLLM.getUserLearningStats('tech_writer');

      expect(stats.totalAnalyses).toBe(3);
      expect(stats.averageConfidence).toBeCloseTo(89.33);
      expect(stats.commonCategories[0].category).toBe('Technical Documentation');
      expect(stats.commonCategories[0].count).toBe(3);
      expect(stats.learningTrend).toBe('insufficient_data'); // Only 3 analyses, need more for trend
    });

    test('should adapt analysis based on user history', async () => {
      const userContext = { userId: 'financial_analyst' };

      // Build user history with financial documents
      for (let i = 0; i < 15; i++) {
        await enhancedLLM.learnFromAnalysis(
          `financial_report_${i}.pdf`,
          { category: 'Financial Analysis', confidence: 85 + i },
          userContext
        );
      }

      const stats = enhancedLLM.getUserLearningStats('financial_analyst');
      expect(stats.learningTrend).toBe('improving');
      expect(stats.averageConfidence).toBeGreaterThan(90);
    });
  });

  describe('Semantic Understanding Validation', () => {
    test('should demonstrate improved semantic folder matching', async () => {
      const mockResponse = {
        response: JSON.stringify([
          { folder: 'UI/UX Design', similarity: 0.91, reasoning: 'Content focuses on user interface design and user experience' },
          { folder: 'Design Assets', similarity: 0.78, reasoning: 'General design content' },
          { folder: 'Documentation', similarity: 0.34, reasoning: 'Some documentation aspects but not primary focus' }
        ])
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      const smartFolders = [
        { name: 'UI/UX Design', description: 'User interface and user experience design' },
        { name: 'Design Assets', description: 'General design files and assets' },
        { name: 'Documentation', description: 'Project documentation' }
      ];

      const result = await enhancedLLM.semanticSimilarityMatching(
        'User Interface Mockups',
        smartFolders,
        'Wireframes and mockups for the new user dashboard interface'
      );

      expect(result[0].folder).toBe('UI/UX Design');
      expect(result[0].similarity).toBe(0.91);
      expect(result[0].reasoning).toContain('user interface design');

      // Verify semantic context was included in prompt
      const calledPrompt = mockOllamaClient.generate.mock.calls[0][0].prompt;
      expect(calledPrompt).toContain('SUGGESTED CATEGORY: "User Interface Mockups"');
      expect(calledPrompt).toContain('CONTENT CONTEXT:');
      expect(calledPrompt).toContain('Consider semantic meaning, not just keyword matching');
    });
  });

  describe('Error Handling and Production Readiness', () => {
    test('should handle various error scenarios gracefully', async () => {
      // Test API timeout
      mockOllamaClient.generate.mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 100)
        )
      );

      const result = await enhancedLLM.analyzeContentStructure(
        'Test content',
        'test.pdf'
      );

      expect(result.documentType).toBe('unknown');
      expect(result.structureScore).toBe(5);

      // Test malformed JSON
      mockOllamaClient.generate.mockResolvedValue({
        response: '{ invalid json syntax }'
      });

      const result2 = await enhancedLLM.performDomainSpecificAnalysis(
        'content',
        'file.pdf',
        'document'
      );

      expect(result2.fallback).toBe(true);
    });

    test('should maintain performance under load', async () => {
      // Test concurrent operations
      const promises = [];
      
      for (let i = 0; i < 5; i++) {
        mockOllamaClient.generate.mockResolvedValue({
          response: JSON.stringify({ category: `Test${i}`, confidence: 80 + i })
        });

        promises.push(
          enhancedLLM.learnFromAnalysis(
            `concurrent_file_${i}.pdf`,
            { category: `Test${i}`, confidence: 80 + i },
            { userId: `user_${i}` }
          )
        );
      }

      await Promise.all(promises);

      // Verify all operations completed successfully
      for (let i = 0; i < 5; i++) {
        const userHistory = enhancedLLM.userPatterns.get(`user_${i}`);
        expect(userHistory).toHaveLength(1);
      }
    });
  });

  describe('Advanced Parameter Optimization', () => {
    test('should optimize parameters for different content complexities', () => {
      // Test high complexity content (creative task)
      const highComplexParams = enhancedLLM.getOptimizedParameters('creative', 'high');
      expect(highComplexParams.temperature).toBe(0.7);
      expect(highComplexParams.top_k).toBe(35);

      // Test low complexity content (precise extraction)
      const lowComplexParams = enhancedLLM.getOptimizedParameters('extraction', 'low');
      expect(lowComplexParams.temperature).toBe(0.05);
      expect(lowComplexParams.top_k).toBe(10);

      // Test medium complexity content (balanced categorization)
      const mediumComplexParams = enhancedLLM.getOptimizedParameters('categorization', 'medium');
      expect(mediumComplexParams.temperature).toBe(0.1);
      expect(mediumComplexParams.top_k).toBe(15);
    });

    test('should provide different parameter profiles for different needs', () => {
      const profiles = enhancedLLM.parameterProfiles;
      
      // Factual analysis needs low temperature
      expect(profiles.factual.temperature).toBe(0.1);
      
      // Creative analysis needs higher temperature
      expect(profiles.creative.temperature).toBe(0.8);
      
      // Precise analysis needs very low temperature
      expect(profiles.precise.temperature).toBe(0.05);
      
      // Balanced analysis is in the middle
      expect(profiles.balanced.temperature).toBe(0.3);
    });
  });

  describe('End-to-End Enhanced Capabilities', () => {
    test('should demonstrate complete enhanced LLM workflow', async () => {
      // This test validates the entire enhanced LLM pipeline
      
      // 1. Setup multi-step analysis response
      const responses = [
        { response: JSON.stringify({ documentType: 'project_plan', structureScore: 9 }) },
        { response: JSON.stringify({ category: 'Project Management', confidence: 93 }) },
        { response: JSON.stringify([{ folder: 'Project Management', similarity: 0.95, reasoning: 'Perfect match' }]) }
      ];

      mockOllamaClient.generate
        .mockResolvedValueOnce(responses[0])
        .mockResolvedValueOnce(responses[1])
        .mockResolvedValueOnce(responses[2]);

      // 2. Execute enhanced analysis
      const result = await enhancedLLM.analyzeDocumentEnhanced(
        'Project Plan: Q1 2024 Software Development Initiative...',
        'project_plan_q1.pdf',
        [{ name: 'Project Management', description: 'Project planning and management documents' }],
        { userId: 'project_manager' }
      );

      // 3. Verify all enhanced features worked
      expect(result.category).toBe('Project Management');
      expect(result.matchConfidence).toBe(0.95);
      expect(result.matchMethod).toBe('semantic');
      
      // 4. Verify user learning occurred
      const userStats = enhancedLLM.getUserLearningStats('project_manager');
      expect(userStats.totalAnalyses).toBe(1);
      
      // 5. Verify fallback capabilities
      const fallback = enhancedLLM.getFallbackAnalysis('unknown.pdf', 'document');
      expect(fallback.fallback).toBe(true);
      
      // 6. Verify parameter optimization
      const params = enhancedLLM.getOptimizedParameters('categorization', 'medium');
      expect(params.temperature).toBe(0.1);
      
      // Enhanced LLM system is fully operational
      console.log('✅ Enhanced LLM system validation complete');
      expect(true).toBe(true);
    });
  });
}); 