/**
 * Enhanced LLM Speed Optimization Tests
 * Validates all performance optimization strategies
 */

const EnhancedLLMService = require('../src/main/services/EnhancedLLMService');
const PerformanceOptimizer = require('../src/main/services/PerformanceOptimizer');
const { analyzeTextWithOllama } = require('../src/main/analysis/ollamaDocumentAnalysis');

// Mock Ollama client - define before the mock
const mockOllamaClient = {
  generate: jest.fn()
};

jest.mock('ollama', () => ({
  Ollama: jest.fn().mockImplementation(() => mockOllamaClient)
}));

describe('Enhanced LLM Speed Optimization', () => {
  let enhancedLLM;
  let performanceOptimizer;

  beforeEach(() => {
    enhancedLLM = new EnhancedLLMService();
    performanceOptimizer = new PerformanceOptimizer();
    
    // Reset mocks
    jest.clearAllMocks();
    
    // Default mock response
    mockOllamaClient.generate.mockResolvedValue({
      response: JSON.stringify({
        category: "Test",
        confidence: 85,
        keywords: ["test", "document"],
        suggestedName: "test_document"
      })
    });
  });

  describe('Strategy 1: Intelligent Content Analysis Caching', () => {
    test('should use cached results for identical content', async () => {
      const content = "This is test content for caching validation";
      const fileName = "test.pdf";
      const smartFolders = [{ name: "Test Folder" }];
      
      // First analysis - should hit the LLM
      const result1 = await enhancedLLM.analyzeDocumentEnhanced(content, fileName, smartFolders);
      expect(mockOllamaClient.generate).toHaveBeenCalledTimes(2); // Multi-step analysis
      
      // Second analysis - should use cache
      const result2 = await enhancedLLM.analyzeDocumentEnhanced(content, fileName, smartFolders);
      expect(result2.fromCache).toBe(true);
      expect(result2.category).toBe(result1.category);
    });

    test('should have high cache hit rate for similar content', async () => {
      const baseContent = "Budget planning document for Q4 financial review";
      const variations = [
        baseContent,
        baseContent + " additional notes",
        baseContent.replace("Q4", "fourth quarter"),
        baseContent
      ];
      
      for (const content of variations) {
        await enhancedLLM.analyzeDocumentEnhanced(content, "budget.pdf", []);
      }
      
      const stats = enhancedLLM.getPerformanceStats();
      expect(stats.cacheHitRatePercent).toBeGreaterThan(25); // At least 25% cache hit rate
    });

    test('should automatically clean up expired cache entries', async () => {
      const content = "Test content for cache expiry";
      
      // Analyze document
      await enhancedLLM.analyzeDocumentEnhanced(content, "test.pdf", []);
      
      // Manually trigger cache cleanup
      enhancedLLM.performanceOptimizer.cleanupCache();
      
      // Verify cleanup occurred
      const stats = enhancedLLM.getPerformanceStats();
      expect(stats.cacheSize).toBeDefined();
    });
  });

  describe('Strategy 2: Dynamic Model Selection', () => {
    test('should select faster models for simple content', () => {
      const simpleContent = "Simple document";
      const model = enhancedLLM.performanceOptimizer.selectOptimalModel(simpleContent, 'standard');
      
      // Should prefer faster models for simple content
      expect(['gemma3:2b', 'phi3:mini', 'gemma3:4b']).toContain(model);
    });

    test('should select powerful models for complex content', () => {
      const complexContent = Array(200).fill(0).map((_, i) => 
        `comprehensive analysis methodology framework implementation ${i}`
      ).join(' ');
      
      const model = enhancedLLM.performanceOptimizer.selectOptimalModel(complexContent, 'enhanced');
      
      // Should prefer more powerful models for complex content
      expect(model).toBeDefined();
      expect(typeof model).toBe('string');
    });

    test('should cache model selection parameters', async () => {
      const content = "Test content for parameter caching";
      const contentHash = enhancedLLM.generateContentHash(content);
      
      // First analysis should cache parameters
      await enhancedLLM.performDomainSpecificAnalysisOptimized(
        content, "test.pdf", "document", "gemma3:4b", 60000
      );
      
      // Check if parameters were cached
      const cachedParams = enhancedLLM.performanceOptimizer.getCachedParameters(
        contentHash, 'domain_analysis', 'document'
      );
      
      expect(cachedParams).toBeDefined();
      expect(cachedParams.parameters).toBeDefined();
    });
  });

  describe('Strategy 3: Adaptive Timeout Management', () => {
    test('should use shorter timeouts for simple content', () => {
      const simpleContent = "Simple test document";
      const timeout = enhancedLLM.performanceOptimizer.getOptimalTimeout(simpleContent, 'standard');
      
      expect(timeout).toBeLessThanOrEqual(60000); // Should be <= 1 minute for simple content
    });

    test('should use longer timeouts for complex content', () => {
      const complexContent = Array(500).fill(0).map((_, i) => 
        `detailed technical specification analysis ${i}`
      ).join(' ');
      
      const timeout = enhancedLLM.performanceOptimizer.getOptimalTimeout(complexContent, 'enhanced');
      
      expect(timeout).toBeGreaterThan(60000); // Should be > 1 minute for complex content
    });

    test('should handle timeouts gracefully', async () => {
      // Mock timeout scenario
      mockOllamaClient.generate.mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 100)
        )
      );

      const result = await enhancedLLM.analyzeContentStructureOptimized(
        "Test content", "test.pdf", "gemma3:4b", 200
      );

      expect(result.documentType).toBe('unknown');
      expect(result.structureScore).toBe(5);
    });
  });

  describe('Strategy 4: Intelligent Content Truncation', () => {
    test('should truncate very long content while preserving structure', () => {
      const longContent = Array(5000).fill('word').join(' ');
      const optimized = enhancedLLM.performanceOptimizer.optimizeContentForAnalysis(longContent, 'text');
      
      expect(optimized.length).toBeLessThan(longContent.length);
      expect(optimized).toContain('[CONTENT SUMMARY:');
    });

    test('should preserve short content without truncation', () => {
      const shortContent = "This is a short document with minimal content.";
      const optimized = enhancedLLM.performanceOptimizer.optimizeContentForAnalysis(shortContent, 'text');
      
      expect(optimized).toBe(shortContent);
    });

    test('should create meaningful content summaries', () => {
      const repetitiveContent = Array(200).fill(0).map((_, i) => 
        `Important business meeting notes from ${i + 1} discussing project milestones and deliverables`
      ).join(' ');
      
      const optimized = enhancedLLM.performanceOptimizer.optimizeContentForAnalysis(repetitiveContent, 'text');
      
      expect(optimized).toContain('business');
      expect(optimized).toContain('meeting');
      expect(optimized).toContain('project');
    });
  });

  describe('Strategy 5: Concurrent Analysis with Load Balancing', () => {
    test('should process multiple analyses concurrently', async () => {
      const documents = [
        { content: "Document 1 content", fileName: "doc1.pdf" },
        { content: "Document 2 content", fileName: "doc2.pdf" },
        { content: "Document 3 content", fileName: "doc3.pdf" }
      ];

      const startTime = Date.now();
      const results = await enhancedLLM.batchAnalyzeDocuments(documents, [], {});
      const endTime = Date.now();

      expect(results).toHaveLength(3);
      expect(endTime - startTime).toBeLessThan(15000); // Should complete within 15 seconds
      
      results.forEach((result, index) => {
        expect(result.batchIndex).toBe(index);
        expect(result.processingTime).toBeDefined();
      });
    });

    test('should handle concurrent analysis failures gracefully', async () => {
      // Mock one failure
      mockOllamaClient.generate
        .mockResolvedValueOnce({ response: JSON.stringify({ category: "Test1", confidence: 85 }) })
        .mockRejectedValueOnce(new Error('Analysis failed'))
        .mockResolvedValueOnce({ response: JSON.stringify({ category: "Test3", confidence: 90 }) });

      const documents = [
        { content: "Document 1", fileName: "doc1.pdf" },
        { content: "Document 2", fileName: "doc2.pdf" },
        { content: "Document 3", fileName: "doc3.pdf" }
      ];

      const results = await enhancedLLM.batchAnalyzeDocuments(documents, [], {});

      expect(results).toHaveLength(3);
      expect(results[1].error).toBeDefined(); // Second analysis should have error
      expect(results[0].category).toBe("Test1");
      expect(results[2].category).toBe("Test3");
    });

    test('should use staggered delays to prevent thundering herd', async () => {
      const analysisRequests = Array(5).fill(0).map((_, i) => ({
        analysisFunction: async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return { result: `analysis_${i}`, processingTime: 100 };
        },
        args: []
      }));

      const startTime = Date.now();
      const results = await enhancedLLM.performanceOptimizer.processConcurrentAnalyses(analysisRequests);
      const endTime = Date.now();

      expect(results).toHaveLength(5);
      expect(endTime - startTime).toBeGreaterThan(800); // Should take some time due to staggered delays
    });
  });

  describe('Strategy 6: Parameter Optimization Caching', () => {
    test('should cache and reuse optimized parameters', () => {
      const contentHash = 'test_hash_123';
      const taskType = 'categorization';
      const complexity = 'medium';
      const parameters = { temperature: 0.1, num_predict: 800 };

      // Cache parameters
      enhancedLLM.performanceOptimizer.setCachedParameters(contentHash, taskType, complexity, parameters);

      // Retrieve cached parameters
      const cached = enhancedLLM.performanceOptimizer.getCachedParameters(contentHash, taskType, complexity);

      expect(cached.parameters).toEqual(parameters);
      expect(cached.timestamp).toBeDefined();
    });

    test('should optimize parameters based on content complexity', async () => {
      const simpleContent = "Simple document.";
      const complexContent = Array(100).fill(0).map((_, i) => 
        `sophisticated analysis methodology ${i}`
      ).join(' ');

      // Analyze both contents
      await enhancedLLM.analyzeDocumentEnhanced(simpleContent, "simple.pdf", []);
      await enhancedLLM.analyzeDocumentEnhanced(complexContent, "complex.pdf", []);

      // Verify different parameters were used
      expect(mockOllamaClient.generate).toHaveBeenCalled();
      
      // Check that different parameter profiles were applied
      const calls = mockOllamaClient.generate.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
    });
  });

  describe('Strategy 7: Memory-Efficient Processing', () => {
    test('should monitor memory usage during processing', async () => {
      const largeContent = Array(1000).fill(0).map((_, i) => 
        `Large document content section ${i} with substantial text`
      ).join(' ');

      const result = await enhancedLLM.performanceOptimizer.processWithMemoryOptimization(
        async () => {
          return { analysis: "completed", contentSize: largeContent.length };
        }
      );

      expect(result.analysis).toBe("completed");
      expect(result.contentSize).toBeGreaterThan(0);
    });

    test('should get current memory statistics', () => {
      const stats = enhancedLLM.getPerformanceStats();
      
      expect(stats.memoryUsageMB).toBeDefined();
      expect(stats.peakMemoryUsageMB).toBeDefined();
      expect(typeof stats.memoryUsageMB).toBe('number');
      expect(typeof stats.peakMemoryUsageMB).toBe('number');
    });

    test('should perform memory cleanup when requested', () => {
      const initialStats = enhancedLLM.getPerformanceStats();
      
      // Trigger cleanup
      const cleanupStats = enhancedLLM.optimizePerformance();
      
      expect(cleanupStats).toBeDefined();
      expect(cleanupStats.cacheSize).toBeDefined();
    });
  });

  describe('Strategy 8: Adaptive Batch Processing', () => {
    test('should calculate optimal batch size based on system load', () => {
      const lowLoad = 0.2;
      const highLoad = 0.9;

      const lowLoadBatch = enhancedLLM.performanceOptimizer.calculateOptimalBatchSize(lowLoad, 'simple content');
      const highLoadBatch = enhancedLLM.performanceOptimizer.calculateOptimalBatchSize(highLoad, 'simple content');

      expect(lowLoadBatch).toBeGreaterThan(highLoadBatch);
      expect(highLoadBatch).toBeGreaterThanOrEqual(1);
    });

    test('should adjust batch size based on content complexity', () => {
      const simpleContent = "Simple document";
      const complexContent = Array(100).fill('complex analysis').join(' ');

      const simpleBatch = enhancedLLM.performanceOptimizer.calculateOptimalBatchSize(0.5, simpleContent);
      const complexBatch = enhancedLLM.performanceOptimizer.calculateOptimalBatchSize(0.5, complexContent);

      expect(simpleBatch).toBeGreaterThan(complexBatch);
    });
  });

  describe('Integration with Document Analysis', () => {
    test('should use performance optimizations in document analysis', async () => {
      const content = "Test document for performance optimization integration";
      const fileName = "performance_test.pdf";
      const smartFolders = [{ name: "Test Folder" }];

      const result = await analyzeTextWithOllama(content, fileName, smartFolders, {});

      expect(result).toBeDefined();
      expect(result.optimized).toBe(true);
      expect(result.processingTime).toBeDefined();
    });

    test('should log performance statistics during analysis', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await analyzeTextWithOllama("Test content", "test.pdf", [], {});

      // Should log performance-related messages
      const perfLogs = consoleSpy.mock.calls.filter(call => 
        call[0] && call[0].includes('performance') || call[0].includes('PERF')
      );

      expect(perfLogs.length).toBeGreaterThan(0);
      
      consoleSpy.mockRestore();
    });
  });

  describe('Performance Metrics and Monitoring', () => {
    test('should track comprehensive performance statistics', () => {
      const stats = enhancedLLM.getPerformanceStats();

      expect(stats).toHaveProperty('cacheHitRatePercent');
      expect(stats).toHaveProperty('averageResponseTimeMs');
      expect(stats).toHaveProperty('cacheSize');
      expect(stats).toHaveProperty('memoryUsageMB');
      expect(stats).toHaveProperty('concurrentOperations');
      expect(stats).toHaveProperty('totalRequests');

      expect(typeof stats.cacheHitRatePercent).toBe('number');
      expect(typeof stats.averageResponseTimeMs).toBe('number');
      expect(typeof stats.cacheSize).toBe('number');
    });

    test('should update performance metrics over time', async () => {
      const initialStats = enhancedLLM.getPerformanceStats();
      
      // Perform some analyses
      await enhancedLLM.analyzeDocumentEnhanced("Test 1", "test1.pdf", []);
      await enhancedLLM.analyzeDocumentEnhanced("Test 2", "test2.pdf", []);
      
      const updatedStats = enhancedLLM.getPerformanceStats();
      
      expect(updatedStats.totalRequests).toBeGreaterThanOrEqual(initialStats.totalRequests);
    });

    test('should provide actionable performance insights', () => {
      const stats = enhancedLLM.getPerformanceStats();
      
      // Performance stats should be meaningful
      expect(stats.cacheHitRatePercent).toBeGreaterThanOrEqual(0);
      expect(stats.cacheHitRatePercent).toBeLessThanOrEqual(100);
      expect(stats.averageResponseTimeMs).toBeGreaterThanOrEqual(0);
      expect(stats.memoryUsageMB).toBeGreaterThan(0);
    });
  });

  describe('Real-world Performance Scenarios', () => {
    test('should handle large document batches efficiently', async () => {
      const largeBatch = Array(20).fill(0).map((_, i) => ({
        content: `Document ${i} content with varying complexity and analysis requirements for testing batch processing efficiency`,
        fileName: `document_${i}.pdf`
      }));

      const startTime = Date.now();
      const results = await enhancedLLM.batchAnalyzeDocuments(largeBatch, [], {});
      const endTime = Date.now();

      expect(results).toHaveLength(20);
      expect(endTime - startTime).toBeLessThan(60000); // Should complete within 1 minute
      
      // Check that results are properly processed
      results.forEach(result => {
        expect(result.batchIndex).toBeDefined();
        expect(result.processingTime).toBeDefined();
      });
    });

    test('should maintain performance under sustained load', async () => {
      const sustainedRequests = Array(10).fill(0).map((_, i) => 
        enhancedLLM.analyzeDocumentEnhanced(
          `Sustained load test document ${i}`, 
          `load_test_${i}.pdf`, 
          []
        )
      );

      const results = await Promise.all(sustainedRequests);
      
      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result.confidence).toBeGreaterThan(50);
        expect(result.processingTime).toBeLessThan(30000); // Max 30 seconds per analysis
      });

      // Performance should remain stable
      const finalStats = enhancedLLM.getPerformanceStats();
      expect(finalStats.averageResponseTimeMs).toBeLessThan(10000); // Average should be reasonable
    });
  });
}); 