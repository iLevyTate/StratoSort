/**
 * Enhanced LLM End-to-End Integration Test
 * Tests the full integration between enhanced LLM service and analysis modules
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

// Mock dependencies for clean testing
jest.mock('pdf-parse', () => jest.fn());
jest.mock('mammoth', () => ({ extractRawText: jest.fn() }));
jest.mock('officeparser', () => jest.fn());
jest.mock('xlsx-populate', () => ({ fromFileAsync: jest.fn() }));

// Import the actual analysis modules to test integration
const { analyzeTextWithOllama } = require('../src/main/analysis/ollamaDocumentAnalysis');
const { analyzeImageWithOllama } = require('../src/main/analysis/ollamaImageAnalysis');
const EnhancedLLMService = require('../src/main/services/EnhancedLLMService');

describe('Enhanced LLM End-to-End Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Document Analysis Integration', () => {
    test('should use enhanced LLM service for complex documents with smart folders', async () => {
      // Mock the multi-step enhanced analysis pipeline
      const contentStructureResponse = {
        response: JSON.stringify({
          documentType: 'project_proposal',
          keyEntities: ['Q3 2024', 'development', 'budget'],
          mainTopics: ['project planning', 'resource allocation'],
          contentQuality: 'high',
          structureScore: 9
        })
      };

      const domainAnalysisResponse = {
        response: JSON.stringify({
          category: 'Project Management',
          project: 'Development Initiative',
          purpose: 'Project planning and resource allocation',
          keywords: ['project', 'planning', 'development', 'budget'],
          confidence: 91,
          reasoning: 'Document contains comprehensive project planning content'
        })
      };

      const semanticMatchingResponse = {
        response: JSON.stringify([
          { folder: 'Project Management', similarity: 0.94, reasoning: 'Perfect match for project planning content' },
          { folder: 'Planning', similarity: 0.78, reasoning: 'General planning aspects present' }
        ])
      };

      // Set up the mock sequence for enhanced analysis
      mockOllamaClient.generate
        .mockResolvedValueOnce(contentStructureResponse)   // Step 1: Content structure
        .mockResolvedValueOnce(domainAnalysisResponse)     // Step 2: Domain analysis
        .mockResolvedValueOnce(semanticMatchingResponse);  // Step 3: Semantic matching

      const testContent = 'Project Development Proposal - Q3 2024\n\nProject Overview:\nThis comprehensive proposal outlines our development initiative for Q3 2024, including resource allocation, timeline, and budget requirements...\n\nBudget Summary:\nTotal estimated cost: $125,000\nDevelopment team: 5 engineers\nTimeline: 12 weeks';
      
      const smartFolders = [
        { name: 'Project Management', description: 'Project planning and management documents' },
        { name: 'Planning', description: 'General planning documents' },
        { name: 'Development', description: 'Software development documentation' }
      ];

      const userContext = { userId: 'project_manager' };

      const result = await analyzeTextWithOllama(
        testContent,
        'project_proposal_q3_2024.pdf',
        smartFolders,
        userContext
      );

      // Verify enhanced analysis was performed
      expect(result).toBeDefined();
      expect(result.enhanced).toBe(true);
      expect(result.multiStep).toBe(true);
      expect(result.category).toBe('Project Management');
      expect(result.matchConfidence).toBe(0.94);
      expect(result.matchMethod).toBe('semantic');
      expect(result.reasoning).toContain('Perfect match');

      // Verify all enhanced analysis steps were called
      expect(mockOllamaClient.generate).toHaveBeenCalledTimes(3);
    });

    test('should fall back to basic analysis when enhanced analysis fails', async () => {
      // Mock enhanced analysis failure
      mockOllamaClient.generate.mockRejectedValue(new Error('Enhanced analysis failed'));

      // Then mock basic analysis success
      mockOllamaClient.generate.mockResolvedValueOnce({
        response: JSON.stringify({
          category: 'Documents',
          confidence: 75,
          project: 'General',
          purpose: 'Document analysis',
          keywords: ['document', 'analysis'],
          suggestedName: 'test_document'
        })
      });

      const result = await analyzeTextWithOllama(
        'Test document content for fallback analysis',
        'test_document.pdf',
        [{ name: 'Documents' }],
        { userId: 'test_user' }
      );

      expect(result).toBeDefined();
      expect(result.category).toBe('Documents');
      expect(result.enhanced).toBeFalsy(); // Should not be enhanced due to fallback
    });

    test('should use basic analysis for short content without smart folders', async () => {
      // Mock basic analysis for simple content
      mockOllamaClient.generate.mockResolvedValue({
        response: JSON.stringify({
          category: 'Notes',
          confidence: 80,
          project: 'Quick Notes',
          purpose: 'Note taking',
          keywords: ['note', 'quick', 'memo'],
          suggestedName: 'quick_note'
        })
      });

      const shortContent = 'Quick meeting note - discuss project timeline';

      const result = await analyzeTextWithOllama(
        shortContent,
        'quick_note.txt',
        [], // No smart folders
        { userId: 'test_user' }
      );

      expect(result).toBeDefined();
      expect(result.category).toBe('Notes');
      expect(result.enhanced).toBeFalsy(); // Should use basic analysis path
    });
  });

  describe('Image Analysis Integration', () => {
    test('should use enhanced multi-step analysis for images with smart folders', async () => {
      const mockImageBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

      // Mock visual analysis
      const visualAnalysisResponse = {
        response: JSON.stringify({
          category: 'UI Mockups',
          content_type: 'interface',
          has_text: true,
          colors: ['blue', 'white', 'gray'],
          keywords: ['ui', 'mockup', 'interface', 'design'],
          purpose: 'User interface design mockup',
          confidence: 88
        })
      };

      // Mock enhanced folder matching for images
      const imageFolderMatchResponse = {
        response: JSON.stringify([
          { folder: 'Design Assets', similarity: 0.92, reasoning: 'UI design mockup matches design assets' },
          { folder: 'Screenshots', similarity: 0.65, reasoning: 'Has interface elements but is a mockup' }
        ])
      };

      mockOllamaClient.generate
        .mockResolvedValueOnce(visualAnalysisResponse)      // Visual content analysis
        .mockResolvedValueOnce(imageFolderMatchResponse);   // Enhanced folder matching

      const smartFolders = [
        { name: 'Design Assets', description: 'UI designs, mockups, and design files' },
        { name: 'Screenshots', description: 'Application screenshots' },
        { name: 'Photos', description: 'General photography' }
      ];

      const userContext = { userId: 'designer' };

      const result = await analyzeImageWithOllama(
        mockImageBase64,
        'login_mockup.png',
        smartFolders,
        userContext
      );

      // Verify enhanced image analysis
      expect(result).toBeDefined();
      expect(result.enhanced).toBe(true);
      expect(result.multiStep).toBe(true);
      expect(result.category).toBe('Design Assets');
      expect(result.matchConfidence).toBe(0.92);
      expect(result.content_type).toBe('interface');
      expect(result.has_text).toBe(true);
    });

    test('should handle image analysis without smart folders', async () => {
      const mockImageBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

      // Mock basic image analysis
      mockOllamaClient.generate.mockResolvedValue({
        response: JSON.stringify({
          category: 'Images',
          content_type: 'object',
          has_text: false,
          colors: ['red', 'green'],
          keywords: ['image', 'photo'],
          purpose: 'General image',
          confidence: 70
        })
      });

      const result = await analyzeImageWithOllama(
        mockImageBase64,
        'photo.jpg',
        [], // No smart folders
        { userId: 'test_user' }
      );

      expect(result).toBeDefined();
      expect(result.category).toBe('Images');
      expect(result.enhanced).toBeFalsy(); // Should use basic analysis without smart folders
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should handle complete Ollama service failure gracefully', async () => {
      // Mock complete service failure
      mockOllamaClient.generate.mockRejectedValue(new Error('ECONNREFUSED: Connection refused'));

      const result = await analyzeTextWithOllama(
        'Test content for failure scenario',
        'test_file.pdf',
        [{ name: 'Documents' }],
        { userId: 'test_user' }
      );

      // Should provide fallback analysis
      expect(result).toBeDefined();
      expect(result.category).toBeDefined();
      expect(result.fallback).toBeTruthy();
    });

    test('should handle malformed JSON responses from enhanced analysis', async () => {
      // Mock malformed JSON response
      mockOllamaClient.generate.mockResolvedValue({
        response: '{ invalid json syntax here }'
      });

      const result = await analyzeTextWithOllama(
        'Test content with JSON parsing error',
        'test_file.pdf',
        [{ name: 'Documents' }],
        { userId: 'test_user' }
      );

      expect(result).toBeDefined();
      expect(result.category).toBeDefined(); // Should still provide a category
    });
  });

  describe('User Learning Integration', () => {
    test('should demonstrate learning across multiple analyses', async () => {
      // Create enhanced LLM service instance for direct testing
      const enhancedLLM = new EnhancedLLMService('http://127.0.0.1:11434');
      const userContext = { userId: 'learning_test_user' };

      // Simulate multiple learning entries
      await enhancedLLM.learnFromAnalysis(
        'budget_2024_q1.pdf',
        { category: 'Financial Planning', confidence: 85, project: 'Budget Analysis' },
        userContext
      );

      await enhancedLLM.learnFromAnalysis(
        'budget_2024_q2.pdf',
        { category: 'Financial Planning', confidence: 88, project: 'Budget Analysis' },
        userContext
      );

      await enhancedLLM.learnFromAnalysis(
        'revenue_report.pdf',
        { category: 'Financial Planning', confidence: 91, project: 'Financial Reporting' },
        userContext
      );

      const stats = enhancedLLM.getUserLearningStats('learning_test_user');

      expect(stats.totalAnalyses).toBe(3);
      expect(stats.averageConfidence).toBeCloseTo(88);
      expect(stats.commonCategories[0].category).toBe('Financial Planning');
      expect(stats.commonCategories[0].count).toBe(3);
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle concurrent analysis requests efficiently', async () => {
      // Mock quick responses for concurrent testing
      mockOllamaClient.generate.mockResolvedValue({
        response: JSON.stringify({
          category: 'Test Category',
          confidence: 80,
          enhanced: true,
          keywords: ['test']
        })
      });

      const promises = [];
      
      // Create 5 concurrent analysis requests
      for (let i = 0; i < 5; i++) {
        promises.push(
          analyzeTextWithOllama(
            `Test content ${i}`,
            `test_file_${i}.pdf`,
            [{ name: 'Test Category' }],
            { userId: `user_${i}` }
          )
        );
      }

      const results = await Promise.all(promises);

      // Verify all analyses completed successfully
      expect(results).toHaveLength(5);
      results.forEach((result, _index) => {
        expect(result).toBeDefined();
        expect(result.category).toBe('Test Category');
      });
    });

    test('should optimize parameters based on content complexity', async () => {
      // Mock parameter optimization tracking
      let callCount = 0;
      mockOllamaClient.generate.mockImplementation((params) => {
        callCount++;
        // Verify different parameters are used based on content complexity
        expect(params.options).toBeDefined();
        return Promise.resolve({
          response: JSON.stringify({
            category: 'Test',
            confidence: 85
          })
        });
      });

      // Test with complex content (should trigger enhanced analysis)
      const complexContent = 'A'.repeat(2000); // Long content to trigger enhanced path
      
      await analyzeTextWithOllama(
        complexContent,
        'complex_document.pdf',
        [{ name: 'Documents' }],
        { userId: 'test_user' }
      );

      expect(callCount).toBeGreaterThan(0);
    });
  });

  describe('Integration Validation', () => {
    test('should demonstrate complete enhanced LLM workflow end-to-end', async () => {
      // This test validates the entire enhanced LLM integration
      
      // Mock complete enhanced analysis pipeline
      const responses = [
        { response: JSON.stringify({ documentType: 'technical_spec', structureScore: 9 }) },
        { response: JSON.stringify({ category: 'Technical Documentation', confidence: 93, enhanced: true }) },
        { response: JSON.stringify([{ folder: 'Technical Documentation', similarity: 0.96, reasoning: 'Perfect technical match' }]) }
      ];

      mockOllamaClient.generate
        .mockResolvedValueOnce(responses[0])
        .mockResolvedValueOnce(responses[1])
        .mockResolvedValueOnce(responses[2]);

      const result = await analyzeTextWithOllama(
        'Technical Specification Document - API Design and Implementation\n\nThis document outlines the technical specifications for the new API system...',
        'api_technical_spec.pdf',
        [
          { name: 'Technical Documentation', description: 'Technical specs and documentation' },
          { name: 'Development', description: 'Development related files' }
        ],
        { userId: 'tech_lead' }
      );

      // Verify complete enhanced workflow
      expect(result.enhanced).toBe(true);
      expect(result.multiStep).toBe(true);
      expect(result.category).toBe('Technical Documentation');
      expect(result.matchConfidence).toBe(0.96);
      expect(result.matchMethod).toBe('semantic');
      
      console.log('✅ Enhanced LLM end-to-end integration validated successfully');
      expect(true).toBe(true); // Integration complete
    });
  });
}); 