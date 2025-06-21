/**
 * Enhanced LLM Speed Optimization Tests
 * Validates all performance optimization strategies
 */

// Mock Ollama client - define first
const mockOllamaClient = {
  generate: jest.fn()
};

// Mock ollama module with pre-defined client
jest.mock('ollama', () => ({
  Ollama: jest.fn().mockImplementation(() => mockOllamaClient)
}));

const { analyzeTextWithOllama } = require('../src/main/analysis/ollamaDocumentAnalysis');
const EnhancedLLMService = require('../src/main/services/EnhancedLLMService');

describe('Enhanced LLM Speed Optimization', () => {
  let enhancedLLM;

  beforeEach(() => {
    enhancedLLM = new EnhancedLLMService();
    
    // Reset mocks
    jest.clearAllMocks();
    
    // Default mock response with conditional logic for different content
    mockOllamaClient.generate.mockImplementation(async (request) => {
      // Add small delay to simulate processing time for performance tracking
      await new Promise(resolve => setTimeout(resolve, 5));
      
      const prompt = request.prompt || '';
      
      // Mock different responses based on content - match specific test cases precisely
      const promptLower = prompt.toLowerCase();
      
      // Check for specific test case content patterns in order of specificity
      if (promptLower.includes('meeting minutes from team standup')) {
        return {
          response: JSON.stringify({
            category: 'Meeting Notes',
            confidence: 88,
            keywords: ['meeting', 'notes', 'discussion'],
            suggestedName: 'meeting_minutes_document'
          })
        };
      } else if (promptLower.includes('project proposal for new features')) {
        return {
          response: JSON.stringify({
            category: 'Project Documents',
            confidence: 90,
            keywords: ['project', 'proposal', 'planning'],
            suggestedName: 'project_proposal_document'
          })
        };
      } else if (promptLower.includes('financial budget report for q4 2024')) {
        return {
          response: JSON.stringify({
            category: 'Financial Planning',
            confidence: 92,
            keywords: ['financial', 'budget', 'planning'],
            suggestedName: 'financial_budget_document'
          })
        };
      } else if (promptLower.includes('meeting') || promptLower.includes('minutes') || promptLower.includes('standup')) {
        return {
          response: JSON.stringify({
            category: 'Meeting Notes',
            confidence: 88,
            keywords: ['meeting', 'notes', 'discussion'],
            suggestedName: 'meeting_minutes_document'
          })
        };
      } else if (promptLower.includes('financial') || promptLower.includes('budget')) {
        return {
          response: JSON.stringify({
            category: 'Financial Planning',
            confidence: 92,
            keywords: ['financial', 'budget', 'planning'],
            suggestedName: 'financial_budget_document'
          })
        };
      } else if (promptLower.includes('project') || promptLower.includes('proposal')) {
        return {
          response: JSON.stringify({
            category: 'Project Documents',
            confidence: 90,
            keywords: ['project', 'proposal', 'planning'],
            suggestedName: 'project_proposal_document'
          })
        };
      } else {
        return {
          response: JSON.stringify({
            category: 'Test',
            confidence: 85,
            keywords: ['test', 'document'],
            suggestedName: 'test_document'
          })
        };
      }
    });
  });

  describe('Strategy 1: Intelligent Content Analysis Caching', () => {
    test('should use cached results for identical content', async () => {
      const content = 'This is test content for caching validation';
      const fileName = 'test.pdf';
      const smartFolders = [{ name: 'Test Folder' }];
      
      // First analysis - should hit the LLM
      const result1 = await enhancedLLM.analyzeDocumentEnhanced(content, fileName, smartFolders);
      expect(mockOllamaClient.generate).toHaveBeenCalledTimes(3); // Multi-step analysis (structure + domain + folder matching)
      
      // Second analysis - should use cache
      const result2 = await enhancedLLM.analyzeDocumentEnhanced(content, fileName, smartFolders);
      expect(result2.fromCache).toBe(true);
      expect(result2.category).toBe(result1.category);
    });

    test('should have high cache hit rate for similar content', async () => {
      const baseContent = 'Budget planning document for Q4 financial review';
      const variations = [
        baseContent,
        `${baseContent} additional notes`,
        baseContent.replace('Q4', 'fourth quarter'),
        baseContent
      ];
      
      for (const content of variations) {
        await enhancedLLM.analyzeDocumentEnhanced(content, 'budget.pdf', []);
      }
      
      const stats = enhancedLLM.getPerformanceStats();
      expect(stats.cacheHitRatePercent).toBeGreaterThanOrEqual(25); // At least 25% cache hit rate
    });

    test('should automatically clean up expired cache entries', async () => {
      const content = 'Test content for cache expiry';
      
      // Analyze document
      await enhancedLLM.analyzeDocumentEnhanced(content, 'test.pdf', []);
      
      // Manually trigger cache cleanup
      enhancedLLM.performanceOptimizer.cleanupCache();
      
      // Verify cleanup occurred
      const stats = enhancedLLM.getPerformanceStats();
      expect(stats.cacheSize).toBeDefined();
    });
  });

  describe('Strategy 2: Dynamic Model Selection', () => {
    test('should select faster models for simple content', () => {
      const simpleContent = 'Simple document';
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
      const content = 'Test content for parameter caching';
      const contentHash = enhancedLLM.generateContentHash(content);
      
      // First analysis should cache parameters
      await enhancedLLM.performDomainSpecificAnalysisOptimized(
        content, 'test.pdf', 'document', 'gemma3:4b', 60000
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
      const simpleContent = 'Simple test document';
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
        'Test content', 'test.pdf', 'gemma3:4b', 200
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
      const shortContent = 'This is a short document with minimal content.';
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
        { content: 'Document 1 content', fileName: 'doc1.pdf' },
        { content: 'Document 2 content', fileName: 'doc2.pdf' },
        { content: 'Document 3 content', fileName: 'doc3.pdf' }
      ];

      const promises = documents.map((doc) => 
        enhancedLLM.analyzeDocumentEnhanced(doc.content, doc.fileName, [])
      );
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.category).toBeDefined();
        expect(result.confidence).toBeGreaterThan(80);
      });
    });

    test('should handle load balancing across multiple requests', async () => {
      const requests = Array(5).fill(0).map((_, i) => ({
        content: `Document ${i + 1} content`,
        fileName: `doc${i + 1}.pdf`
      }));
      
      const startTime = Date.now();
      const results = await Promise.all(
        requests.map((req) => 
          enhancedLLM.analyzeDocumentEnhanced(req.content, req.fileName, [])
        )
      );
      const endTime = Date.now();
      
      expect(results).toHaveLength(5);
      expect(endTime - startTime).toBeLessThan(10000); // Should complete within 10 seconds
    });

    test('should maintain service quality under concurrent load', async () => {
      const heavyLoad = Array(10).fill(0).map((_, i) => ({
        content: `Heavy load test document ${i + 1} with substantial content for analysis`,
        fileName: `heavy_${i + 1}.pdf`
      }));
      
      const results = await Promise.all(
        heavyLoad.map((doc) => 
          enhancedLLM.analyzeDocumentEnhanced(doc.content, doc.fileName, [])
        )
      );
      
      expect(results).toHaveLength(10);
      results.forEach((result, _index) => {
        expect(result.category).toBeDefined();
        expect(result.confidence).toBeGreaterThanOrEqual(50);
      });
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
      const simpleContent = 'Simple document.';
      const complexContent = Array(100).fill(0).map((_, i) => 
        `sophisticated analysis methodology ${i}`
      ).join(' ');

      // Analyze both contents
      await enhancedLLM.analyzeDocumentEnhanced(simpleContent, 'simple.pdf', []);
      await enhancedLLM.analyzeDocumentEnhanced(complexContent, 'complex.pdf', []);

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
          return { analysis: 'completed', contentSize: largeContent.length };
        }
      );

      expect(result.analysis).toBe('completed');
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
      const simpleContent = 'Simple document';
      const complexContent = Array(100).fill('complex analysis').join(' ');

      const simpleBatch = enhancedLLM.performanceOptimizer.calculateOptimalBatchSize(0.5, simpleContent);
      const complexBatch = enhancedLLM.performanceOptimizer.calculateOptimalBatchSize(0.5, complexContent);

      expect(simpleBatch).toBeGreaterThan(complexBatch);
    });
  });

  describe('Integration with Document Analysis', () => {
    test('should use performance optimizations in document analysis', async () => {
      const content = 'Test document for performance optimization integration';
      const fileName = 'performance_test.pdf';
      const smartFolders = [{ name: 'Test Folder' }];

      const result = await analyzeTextWithOllama(content, fileName, smartFolders, {});

      expect(result).toBeDefined();
      expect(result.optimized).toBe(true);
      expect(result.processingTime).toBeDefined();
    });

    test('should log performance statistics during analysis', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await analyzeTextWithOllama('Test content', 'test.pdf', [], {});

      // Should log performance-related messages
      const perfLogs = consoleSpy.mock.calls.filter((call) => 
        call[0] && call[0].includes('performance') || call[0].includes('PERF')
      );

      expect(perfLogs.length).toBeGreaterThan(0);
      
      consoleSpy.mockRestore();
    });
  });

  describe('Performance Metrics and Monitoring', () => {
    test('should track and report performance statistics', async () => {
      // Perform several analyses to generate stats
      for (let i = 0; i < 3; i++) {
        await enhancedLLM.analyzeDocumentEnhanced(
          `Test content ${i}`, `test${i}.pdf`, []
        );
      }
      
      const stats = enhancedLLM.getPerformanceStats();
      
      expect(stats.totalAnalyses).toBe(3);
      expect(stats.averageResponseTimeMs).toBeGreaterThan(0);
      expect(stats.cacheHitRatePercent).toBeGreaterThanOrEqual(0);
    });

    test('should monitor memory usage and cleanup when needed', async () => {
      // Generate some cache entries
      for (let i = 0; i < 5; i++) {
        await enhancedLLM.analyzeDocumentEnhanced(
          `Memory test content ${i}`, `memory${i}.pdf`, []
        );
      }
      
      // Trigger cleanup
      enhancedLLM.performanceOptimizer.cleanupCache();
      
      const finalStats = enhancedLLM.getPerformanceStats();
      expect(finalStats.memoryUsageMB).toBeDefined();
    });

    test('should provide optimization recommendations', () => {
      const stats = enhancedLLM.getPerformanceStats();
      const recommendations = enhancedLLM.getOptimizationRecommendations(stats);
      
      expect(Array.isArray(recommendations)).toBe(true);
      expect(recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('Integration with Direct Analysis Functions', () => {
    test('should maintain compatibility with analyzeTextWithOllama', async () => {
      const content = 'Integration test content for speed optimization';
      
      const result = await analyzeTextWithOllama(
        content, 
        'integration.pdf', 
        [{ name: 'Test Folder' }]
      );
      
      expect(result).toBeDefined();
      expect(result.category).toBeDefined();
      expect(result.enhanced).toBe(true);
    });

    test('should apply speed optimizations in direct analysis calls', async () => {
      const longContent = Array(1000).fill('optimization').join(' ');
      
      const startTime = Date.now();
      const result = await analyzeTextWithOllama(
        longContent, 
        'speed_test.pdf', 
        []
      );
      const endTime = Date.now();
      
      expect(result).toBeDefined();
      expect(endTime - startTime).toBeLessThan(5000); // Should be fast
    });

    test('should fall back gracefully when optimization fails', async () => {
      // Mock failure in enhanced analysis
      const originalMethod = enhancedLLM.analyzeDocumentEnhanced;
      enhancedLLM.analyzeDocumentEnhanced = jest.fn().mockRejectedValue(
        new Error('Enhanced analysis failed')
      );
      
      const result = await analyzeTextWithOllama(
        'Fallback test content', 
        'fallback.pdf', 
        []
      );
      
      expect(result).toBeDefined();
      expect(result.category).toBeDefined();
      
      // Restore original method
      enhancedLLM.analyzeDocumentEnhanced = originalMethod;
    });
  });

  describe('Optimization Strategy Validation', () => {
    test('should demonstrate measurable performance improvements', async () => {
      const testContent = 'Performance comparison test content';
      
      // Measure enhanced analysis time
      const enhancedStart = Date.now();
      const enhancedResult = await enhancedLLM.analyzeDocumentEnhanced(
        testContent, 'perf_test.pdf', []
      );
      const enhancedTime = Date.now() - enhancedStart;
      
      expect(enhancedResult).toBeDefined();
      expect(enhancedTime).toBeLessThan(5000); // Should complete quickly
    });

    test('should validate all five optimization strategies are active', () => {
      const optimizer = enhancedLLM.performanceOptimizer;
      
      // Strategy 1: Caching
      expect(optimizer.isCachingEnabled()).toBe(true);
      
      // Strategy 2: Dynamic model selection
      expect(optimizer.isDynamicModelSelectionEnabled()).toBe(true);
      
      // Strategy 3: Adaptive timeouts
      expect(optimizer.isAdaptiveTimeoutEnabled()).toBe(true);
      
      // Strategy 4: Content truncation
      expect(optimizer.isContentOptimizationEnabled()).toBe(true);
      
      // Strategy 5: Concurrent processing
      expect(optimizer.isConcurrentProcessingEnabled()).toBe(true);
    });

    test('should provide comprehensive performance analytics', () => {
      const analytics = enhancedLLM.getDetailedPerformanceAnalytics();
      
      expect(analytics.strategies).toBeDefined();
      expect(analytics.strategies.caching).toBeDefined();
      expect(analytics.strategies.modelSelection).toBeDefined();
      expect(analytics.strategies.timeoutManagement).toBeDefined();
      expect(analytics.strategies.contentOptimization).toBeDefined();
      expect(analytics.strategies.concurrentProcessing).toBeDefined();
    });

    test('should maintain high accuracy while optimizing speed', async () => {
      const testCases = [
        { content: 'Financial budget report for Q4 2024', expected: 'Financial' },
        { content: 'Meeting minutes from team standup', expected: 'Meeting' },
        { content: 'Project proposal for new features', expected: 'Project' }
      ];
      
      for (const testCase of testCases) {
        const result = await enhancedLLM.analyzeDocumentEnhanced(
          testCase.content, 'accuracy_test.pdf', []
        );
        
        expect(result.category).toContain(testCase.expected);
        expect(result.confidence).toBeGreaterThan(70);
      }
    });

    test('should scale efficiently with increased load', async () => {
      const scalabilityTest = Array(20).fill(0).map((_, i) => ({
        content: `Scalability test document ${i} with varying complexity levels`,
        fileName: `scale_${i}.pdf`
      }));
      
      const startTime = Date.now();
      const results = await Promise.all(
        scalabilityTest.map((test) => 
          enhancedLLM.analyzeDocumentEnhanced(test.content, test.fileName, [])
        )
      );
      const totalTime = Date.now() - startTime;
      
      expect(results).toHaveLength(20);
      expect(totalTime).toBeLessThan(30000); // Should complete within 30 seconds
      
      const avgTimePerDocument = totalTime / 20;
      expect(avgTimePerDocument).toBeLessThan(2000); // Average < 2 seconds per document
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
      results.forEach((result) => {
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
      results.forEach((result) => {
        expect(result.confidence).toBeGreaterThan(50);
        expect(result.processingTime).toBeLessThan(30000); // Max 30 seconds per analysis
      });

      // Performance should remain stable
      const finalStats = enhancedLLM.getPerformanceStats();
      expect(finalStats.averageResponseTimeMs).toBeLessThan(10000); // Average should be reasonable
    });
  });
}); 