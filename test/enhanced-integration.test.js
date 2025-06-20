/**
 * Enhanced LLM Integration Test Suite
 * Tests end-to-end functionality of the enhanced LLM system
 */

// Mock Ollama before requiring modules
const mockOllamaClient = {
  generate: jest.fn()
};

jest.mock('ollama', () => ({
  Ollama: jest.fn().mockImplementation(() => mockOllamaClient)
}));

// Mock file system operations
const mockFs = {
  readFile: jest.fn(),
  access: jest.fn()
};

jest.mock('fs/promises', () => mockFs);

// Mock the analysis modules
jest.mock('../src/main/analysis/ollamaDocumentAnalysis', () => ({
  analyzeTextWithOllama: jest.fn()
}));

jest.mock('../src/main/analysis/ollamaImageAnalysis', () => ({
  analyzeImageWithOllama: jest.fn()
}));

const EnhancedLLMService = require('../src/main/services/EnhancedLLMService');
const { analyzeTextWithOllama } = require('../src/main/analysis/ollamaDocumentAnalysis');  
const { analyzeImageWithOllama } = require('../src/main/analysis/ollamaImageAnalysis');

describe('Enhanced LLM Integration', () => {
  let enhancedLLM;
  
  beforeEach(() => {
    jest.clearAllMocks();
    enhancedLLM = new EnhancedLLMService('http://127.0.0.1:11434');
  });

  describe('End-to-End Document Analysis Pipeline', () => {
    test('should complete full enhanced document analysis workflow', async () => {
      // Mock multi-step responses
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
          project: "Quarterly Analysis",
          purpose: "Financial performance review and budget planning",
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

      mockOllamaClient.generate
        .mockResolvedValueOnce(contentStructureResponse)   // Content structure
        .mockResolvedValueOnce(domainAnalysisResponse)     // Domain analysis
        .mockResolvedValueOnce(semanticMatchingResponse);  // Semantic matching

      const textContent = "Quarterly Financial Report Q1 2024\n\nRevenue Analysis:\nTotal revenue increased by 15% compared to previous quarter...\n\nBudget Performance:\nOverall budget adherence at 94%...";
      const fileName = "q1_financial_report.pdf";
      const smartFolders = [
        { name: "Financial Planning", description: "Budget and financial documents" },
        { name: "Reports", description: "Business reports and analytics" }
      ];
      const userContext = { userId: "test_user" };

      const result = await analyzeTextWithOllama(textContent, fileName, smartFolders, userContext);

      // Verify enhanced analysis was used
      expect(result.enhanced).toBe(true);
      expect(result.multiStep).toBe(true);
      expect(result.category).toBe("Financial Planning");
      expect(result.confidence).toBe(94);
      expect(result.keywords).toContain("budget");
      expect(result.matchConfidence).toBe(0.95);

      // Verify all analysis steps were called
      expect(mockOllamaClient.generate).toHaveBeenCalledTimes(3);
    });

    test('should handle partial failures in multi-step analysis', async () => {
      // Mock successful content structure but failed domain analysis
      const contentStructureResponse = {
        response: JSON.stringify({
          documentType: "report",
          contentQuality: "medium"
        })
      };

      mockOllamaClient.generate
        .mockResolvedValueOnce(contentStructureResponse)   // Content structure succeeds
        .mockRejectedValueOnce(new Error('Domain analysis failed')); // Domain analysis fails

      const textContent = "A".repeat(1500); // Trigger enhanced analysis
      const result = await analyzeTextWithOllama(
        textContent, 
        "test.pdf", 
        [{ name: "Documents" }], 
        { userId: "test" }
      );

      expect(result.fallback).toBe(true);
      expect(result.category).toBe("Documents");
    });
  });

  describe('End-to-End Image Analysis Pipeline', () => {
    test('should complete full enhanced image analysis workflow', async () => {
      const mockImageBase64 = 'data:image/png;base64,test';

      const visualAnalysisResponse = {
        response: JSON.stringify({
          category: "Screenshots",
          content_type: "interface",
          has_text: true,
          colors: ["blue", "white", "gray"],
          confidence: 91,
          reasoning: "UI interface screenshot with clear navigation elements"
        })
      };

      const textExtractionResponse = {
        response: JSON.stringify({
          hasText: true,
          text: "Dashboard - Analytics Overview\nRevenue: $45,320\nUsers: 1,247",
          textType: "interface",
          confidence: 88
        })
      };

      const semanticMatchingResponse = {
        response: JSON.stringify([
          { folder: "UI Documentation", similarity: 0.93, reasoning: "Interface documentation screenshot" },
          { folder: "Screenshots", similarity: 0.89, reasoning: "General screenshot content" }
        ])
      };

      mockOllamaClient.generate
        .mockResolvedValueOnce(visualAnalysisResponse)    // Visual analysis
        .mockResolvedValueOnce(textExtractionResponse)    // Text extraction
        .mockResolvedValueOnce(semanticMatchingResponse); // Semantic matching

      const smartFolders = [
        { name: "UI Documentation", description: "Interface and user experience documentation" },
        { name: "Screenshots", description: "Screen captures and interface images" }
      ];
      const userContext = { userId: "test_user" };

      const result = await analyzeImageWithOllama(
        mockImageBase64,
        "dashboard_capture.png", 
        smartFolders, 
        userContext
      );

      expect(result.enhanced).toBe(true);
      expect(result.multiStep).toBe(true);
      expect(result.category).toBe("UI Documentation");
      expect(result.extractedText).toBe("Dashboard - Analytics Overview\nRevenue: $45,320\nUsers: 1,247");
      expect(result.textConfidence).toBe(88);
      expect(result.matchConfidence).toBe(0.93);

      // Should call visual analysis, text extraction, and semantic matching
      expect(mockOllamaClient.generate).toHaveBeenCalledTimes(3);
    });

    test('should skip text extraction when no text is detected', async () => {
      const visualAnalysisResponse = {
        response: JSON.stringify({
          category: "Photos",
          content_type: "landscape",
          has_text: false,
          confidence: 87
        })
      };

      const semanticMatchingResponse = {
        response: JSON.stringify([
          { folder: "Nature Photos", similarity: 0.91, reasoning: "Beautiful landscape photography" }
        ])
      };

      mockOllamaClient.generate
        .mockResolvedValueOnce(visualAnalysisResponse)    // Visual analysis
        .mockResolvedValueOnce(semanticMatchingResponse); // Semantic matching (no text extraction)

      const result = await analyzeImageWithOllama(
        'data:image/jpg;base64,landscape',
        "mountain_view.jpg", 
        [{ name: "Nature Photos" }], 
        { userId: "test" }
      );

      expect(result.extractedText).toBe('');
      expect(result.textConfidence).toBe(0);
      expect(mockOllamaClient.generate).toHaveBeenCalledTimes(2); // No text extraction call
    });
  });

  describe('User Learning Integration', () => {
    test('should learn from successful analyses and improve over time', async () => {
      const userContext = { userId: "learning_user" };

      // Simulate multiple analyses to build learning history
      const analyses = [
        { fileName: "budget_q1.pdf", category: "Financial Planning", confidence: 85 },
        { fileName: "budget_q2.pdf", category: "Financial Planning", confidence: 88 },
        { fileName: "revenue_report.pdf", category: "Financial Planning", confidence: 90 },
        { fileName: "ui_mockup.png", category: "Design Assets", confidence: 82 },
        { fileName: "logo_design.png", category: "Design Assets", confidence: 91 }
      ];

      // Add learning data
      for (const analysis of analyses) {
        await enhancedLLM.learnFromAnalysis(analysis.fileName, analysis, userContext);
      }

      // Get learning statistics
      const stats = enhancedLLM.getUserLearningStats("learning_user");

      expect(stats.totalAnalyses).toBe(5);
      expect(stats.averageConfidence).toBeCloseTo(87.2);
      expect(stats.commonCategories).toHaveLength(2);
      expect(stats.commonCategories[0].category).toBe("Financial Planning");
      expect(stats.commonCategories[0].count).toBe(3);
      expect(stats.learningTrend).toBe('improving');
    });

    test('should use learning data to improve analysis accuracy', async () => {
      const userContext = { userId: "experienced_user" };

      // Build learning history for user
      const historicalAnalyses = [
        { fileName: "budget_2023.pdf", category: "Financial Planning", confidence: 90 },
        { fileName: "expense_report.pdf", category: "Financial Planning", confidence: 88 },
        { fileName: "financial_summary.pdf", category: "Financial Planning", confidence: 92 }
      ];

      for (const analysis of historicalAnalyses) {
        await enhancedLLM.learnFromAnalysis(analysis.fileName, analysis, userContext);
      }

      // Mock enhanced analysis that should benefit from learning
      const enhancedResponse = {
        response: JSON.stringify({
          category: "Financial Planning",
          confidence: 95, // Higher confidence due to learning
          project: "Budget Analysis",
          learningBoost: true
        })
      };

      mockOllamaClient.generate.mockResolvedValue(enhancedResponse);

      const result = await enhancedLLM.analyzeDocumentEnhanced(
        "Budget analysis for Q3 2024 with detailed expense breakdowns",
        "budget_q3.pdf",
        [{ name: "Financial Planning" }],
        userContext
      );

      expect(result.confidence).toBe(95);
      expect(result.learningBoost).toBe(true);
    });
  });

  describe('Cross-Platform Integration', () => {
    test('should work across different file types and maintain consistency', async () => {
      const testFiles = [
        {
          type: 'document',
          content: "Meeting notes from quarterly review session",
          fileName: "meeting_notes.pdf",
          expectedCategory: "Meeting Notes"
        },
        {
          type: 'image',
          content: 'data:image/png;base64,meeting_whiteboard',
          fileName: "whiteboard_capture.png",
          expectedCategory: "Meeting Notes"
        }
      ];

      const smartFolders = [
        { name: "Meeting Notes", description: "Meeting records and notes" },
        { name: "Documents", description: "General documents" }
      ];

      const userContext = { userId: "consistent_user" };

      // Mock responses for both file types
      mockOllamaClient.generate.mockResolvedValue({
        response: JSON.stringify({
          category: "Meeting Notes",
          confidence: 89,
          keywords: ["meeting", "notes", "review"]
        })
      });

      const results = [];
      for (const testFile of testFiles) {
        let result;
        if (testFile.type === 'document') {
          result = await analyzeTextWithOllama(
            testFile.content,
            testFile.fileName,
            smartFolders,
            userContext
          );
        } else {
          result = await analyzeImageWithOllama(
            testFile.content,
            testFile.fileName,
            smartFolders,
            userContext
          );
        }
        results.push(result);
      }

      // Both should be categorized consistently
      expect(results[0].category).toBe(results[1].category);
      expect(results[0].category).toBe("Meeting Notes");
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should gracefully handle Ollama service unavailability', async () => {
      mockOllamaClient.generate.mockRejectedValue(new Error('ECONNREFUSED: Connection refused'));

      const result = await analyzeTextWithOllama(
        "Test document content",
        "test.pdf",
        [{ name: "Documents" }],
        { userId: "test" }
      );

      expect(result.fallback).toBe(true);
      expect(result.error).toContain('ECONNREFUSED');
      expect(result.category).toBe("Documents");
    });

    test('should handle malformed responses and extract partial data', async () => {
      const malformedResponse = {
        response: `{
          "category": "Research",
          "confidence": 85,
          "keywords": ["research", "analysis"]
          // Missing closing brace and other fields
        `
      };

      mockOllamaClient.generate.mockResolvedValue(malformedResponse);

      const result = await analyzeTextWithOllama(
        "Research document content",
        "research.pdf",
        [{ name: "Research" }]
      );

      expect(result.category).toBe("Research");
      expect(result.partial).toBe(true);
      expect(result.keywords).toContain("research");
    });

    test('should maintain service stability during high load', async () => {
      // Simulate concurrent analysis requests
      const concurrentPromises = [];
      
      for (let i = 0; i < 10; i++) {
        mockOllamaClient.generate.mockResolvedValue({
          response: JSON.stringify({
            category: "Test",
            confidence: 80 + i
          })
        });

        const promise = analyzeTextWithOllama(
          `Test document ${i}`,
          `test_${i}.pdf`,
          [{ name: "Test" }],
          { userId: `user_${i}` }
        );
        concurrentPromises.push(promise);
      }

      const results = await Promise.all(concurrentPromises);

      // All should complete successfully
      expect(results).toHaveLength(10);
      results.forEach((result, index) => {
        expect(result.category).toBe("Test");
        expect(result.confidence).toBe(80 + index);
      });
    });
  });

  describe('Performance and Efficiency', () => {
    test('should complete analysis within reasonable time limits', async () => {
      mockOllamaClient.generate.mockImplementation(() => 
        new Promise(resolve => 
          setTimeout(() => resolve({
            response: JSON.stringify({ category: "Test", confidence: 85 })
          }), 100) // 100ms delay
        )
      );

      const startTime = Date.now();
      
      const result = await analyzeTextWithOllama(
        "Test content",
        "test.pdf",
        [{ name: "Test" }]
      );

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      expect(result.category).toBe("Test");
    });

    test('should optimize parameters based on content complexity', async () => {
      mockOllamaClient.generate.mockResolvedValue({
        response: JSON.stringify({ category: "Test", confidence: 85 })
      });

      // Test high complexity content
      const complexContent = Array(200).fill(0).map((_, i) => 
        `sophisticated analysis methodology framework implementation comprehensive evaluation ${i}`
      ).join(' ');

      await analyzeTextWithOllama(complexContent, "complex.pdf", []);

      const complexCall = mockOllamaClient.generate.mock.calls[0][0];
      expect(complexCall.options.temperature).toBe(0.15);
      expect(complexCall.options.num_predict).toBe(1000);

      jest.clearAllMocks();

      // Test simple content
      const simpleContent = "This is a simple document.";
      await analyzeTextWithOllama(simpleContent, "simple.pdf", []);

      const simpleCall = mockOllamaClient.generate.mock.calls[0][0];
      expect(simpleCall.options.temperature).toBe(0.05);
      expect(simpleCall.options.num_predict).toBe(600);
    });
  });

  describe('Semantic Understanding Validation', () => {
    test('should demonstrate improved semantic understanding', async () => {
      const semanticTestCases = [
        {
          content: "Annual budget planning and financial forecasting for fiscal year 2024",
          expectedFolder: "Financial Planning",
          folders: ["Financial Planning", "Reports", "Planning"]
        },
        {
          content: "User interface mockups and wireframe designs for mobile application",
          expectedFolder: "Design Assets",
          folders: ["Design Assets", "UI/UX", "Mobile"]
        },
        {
          content: "Meeting agenda and action items from quarterly business review",
          expectedFolder: "Meeting Notes",
          folders: ["Meeting Notes", "Business", "Reviews"]
        }
      ];

      for (const testCase of semanticTestCases) {
        const mockResponse = {
          response: JSON.stringify({
            category: testCase.expectedFolder,
            confidence: 92,
            reasoning: `Semantic analysis identified content as ${testCase.expectedFolder.toLowerCase()}`
          })
        };

        mockOllamaClient.generate.mockResolvedValue(mockResponse);

        const result = await analyzeTextWithOllama(
          testCase.content,
          "test.pdf",
          testCase.folders.map(name => ({ name }))
        );

        expect(result.category).toBe(testCase.expectedFolder);
        expect(result.reasoning).toContain("semantic analysis");
      }
    });
  });
}); 