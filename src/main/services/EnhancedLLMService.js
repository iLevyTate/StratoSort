/**
 * Enhanced LLM Service - Advanced AI Capabilities for StratoSort
 * Implements industry best practices from HatchWorks and other leading AI companies
 * 
 * Features:
 * - Advanced prompt engineering with examples and context
 * - Multi-step analysis for complex tasks
 * - Contextual learning from user patterns
 * - Confidence-based processing
 * - Domain-specific optimization
 * - Iterative refinement
 * - Parameter optimization
 */

const { Ollama } = require('ollama');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const PerformanceOptimizer = require('./PerformanceOptimizer');

class EnhancedLLMService {
  constructor(host = 'http://127.0.0.1:11434') {
    this.ollama = new Ollama({ host });
    this.host = host;
    this.analysisHistory = new Map();
    this.userPatterns = new Map();
    this.domainTemplates = new Map();
    this.performanceOptimizer = new PerformanceOptimizer();
    
    // Initialize domain-specific templates
    this.initializeDomainTemplates();
    
    console.log('[ENHANCED-LLM] Service initialized with performance optimization');
    
    // Advanced parameter configurations
    this.parameterProfiles = {
      creative: { temperature: 0.8, top_p: 0.9, top_k: 40 },
      balanced: { temperature: 0.3, top_p: 0.8, top_k: 30 },
      factual: { temperature: 0.1, top_p: 0.7, top_k: 20 },
      precise: { temperature: 0.05, top_p: 0.6, top_k: 10 }
    };
  }

  /**
   * Initialize domain-specific prompt templates with examples
   */
  initializeDomainTemplates() {
    this.domainTemplates.set('document', {
      systemPrompt: `You are an expert document analysis specialist with expertise in content categorization, information extraction, and semantic understanding.`,
      
      examples: [
        {
          input: "Invoice from ABC Corp dated 2024-01-15 for $1,250.00 for consulting services",
          output: {
            category: "Financial Planning",
            project: "Business Expenses",
            purpose: "Invoice payment tracking and record keeping",
            keywords: ["invoice", "consulting", "payment", "business"],
            confidence: 95,
            suggestedName: "abc_corp_consulting_invoice_2024_01_15"
          }
        },
        {
          input: "Research paper on machine learning applications in healthcare diagnostics",
          output: {
            category: "Research",
            project: "ML Healthcare",
            purpose: "Academic research on AI diagnostic applications",
            keywords: ["machine learning", "healthcare", "diagnostics", "AI"],
            confidence: 92,
            suggestedName: "ml_healthcare_diagnostics_research_paper"
          }
        }
      ],
      
      constraints: [
        "Base analysis strictly on actual content, not filename assumptions",
        "Extract concrete themes and topics from text",
        "Prioritize factual accuracy over creative interpretation",
        "Use domain-specific terminology when present"
      ]
    });

    this.domainTemplates.set('image', {
      systemPrompt: `You are an expert visual content analyzer with specialized knowledge in image categorization, object recognition, and visual context understanding.`,
      
      examples: [
        {
          input: "Screenshot of a software interface showing dashboard metrics",
          output: {
            category: "Screenshots",
            project: "UI Documentation",
            purpose: "Software interface documentation and reference",
            keywords: ["screenshot", "dashboard", "interface", "metrics"],
            content_type: "interface",
            has_text: true,
            confidence: 88,
            suggestedName: "dashboard_metrics_screenshot"
          }
        },
        {
          input: "Company logo with blue and white colors on transparent background",
          output: {
            category: "Logos",
            project: "Brand Assets",
            purpose: "Corporate identity and branding material",
            keywords: ["logo", "brand", "corporate", "identity"],
            content_type: "object",
            colors: ["blue", "white"],
            confidence: 94,
            suggestedName: "company_logo_blue_white"
          }
        }
      ],
      
      constraints: [
        "Identify specific visual elements and context",
        "Recognize text within images when present",
        "Analyze color schemes and visual composition",
        "Categorize based on visual content, not assumptions"
      ]
    });

    this.domainTemplates.set('audio', {
      systemPrompt: `You are an expert audio content analyzer with specialized knowledge in speech recognition, audio categorization, and conversational analysis.`,
      
      examples: [
        {
          input: "Meeting recording discussing Q4 budget planning and resource allocation",
          output: {
            category: "Financial Planning",
            project: "Budget Planning",
            purpose: "Quarterly budget discussion and resource planning",
            keywords: ["meeting", "budget", "planning", "Q4", "resources"],
            content_type: "conversation",
            speaker_count: 3,
            confidence: 90,
            suggestedName: "q4_budget_planning_meeting"
          }
        }
      ],
      
      constraints: [
        "Analyze conversational content and context",
        "Identify speaker patterns and interaction types",
        "Extract key topics from spoken content",
        "Consider audio quality and clarity in confidence scoring"
      ]
    });
  }

  /**
   * Enhanced document analysis with multi-step processing + Performance Optimization
   */
  async analyzeDocumentEnhanced(textContent, originalFileName, smartFolders = [], userContext = {}) {
    console.log(`[ENHANCED-LLM] Starting optimized multi-step document analysis for ${originalFileName}`);
    
    const startTime = Date.now();
    
    try {
      // PERFORMANCE OPTIMIZATION 1: Check cache first
      const contentHash = this.generateContentHash(textContent);
      const cachedResult = await this.performanceOptimizer.getCachedAnalysis(
        contentHash, 'document', smartFolders
      );
      
      if (cachedResult) {
        console.log(`[ENHANCED-LLM] Using cached analysis for ${originalFileName} (${Date.now() - startTime}ms)`);
        return cachedResult;
      }
      
      // PERFORMANCE OPTIMIZATION 2: Optimize content length
      const optimizedContent = this.performanceOptimizer.optimizeContentForAnalysis(textContent, 'text');
      
      // PERFORMANCE OPTIMIZATION 3: Select optimal model and timeout
      const contentComplexity = this.performanceOptimizer.assessContentComplexity(textContent);
      const optimalModel = this.performanceOptimizer.selectOptimalModel(contentComplexity, 'enhanced');
      const optimalTimeout = this.performanceOptimizer.getOptimalTimeout(contentComplexity, 'enhanced');
      
      console.log(`[ENHANCED-LLM] Using ${optimalModel} with ${optimalTimeout}ms timeout for ${contentComplexity} content`);
      
      // PERFORMANCE OPTIMIZATION 4: Process with memory optimization
      const result = await this.performanceOptimizer.processWithMemoryOptimization(async () => {
        // Step 1: Initial content understanding
        const contentAnalysis = await this.analyzeContentStructureOptimized(
          optimizedContent, originalFileName, optimalModel, optimalTimeout
        );
        
        // Step 2: Domain-specific analysis
        const domainAnalysis = await this.performDomainSpecificAnalysisOptimized(
          optimizedContent, originalFileName, 'document', optimalModel, optimalTimeout
        );
        
        // Step 3: Smart folder matching with context
        const folderAnalysis = await this.enhancedFolderMatching(
          domainAnalysis.category, 
          smartFolders, 
          userContext,
          optimizedContent
        );
        
        // Step 4: Iterative refinement based on confidence
        const finalAnalysis = await this.refineAnalysis(
          { ...contentAnalysis, ...domainAnalysis, ...folderAnalysis },
          optimizedContent,
          originalFileName,
          smartFolders
        );
        
        return finalAnalysis;
      });
      
      // Step 5: Learn from this analysis for future improvements
      await this.learnFromAnalysis(originalFileName, result, userContext);
      
      // Mark as enhanced analysis
      result.enhanced = true;
      result.multiStep = true;
      result.processingTime = Date.now() - startTime;
      result.optimized = true;
      
      // PERFORMANCE OPTIMIZATION 5: Cache the result
      this.performanceOptimizer.setCachedAnalysis(contentHash, 'document', smartFolders, result);
      
      console.log(`[ENHANCED-LLM] Optimized analysis completed for ${originalFileName} (${result.processingTime}ms)`);
      return result;
      
    } catch (error) {
      console.error('[ENHANCED-LLM] Enhanced analysis failed:', error.message);
      return this.getFallbackAnalysis(originalFileName, 'document');
    }
  }

  /**
   * Analyze content structure and extract key information
   */
  async analyzeContentStructure(textContent, fileName) {
    const prompt = `Analyze the structure and key information in this document content:

CONTENT ANALYSIS TASK:
1. Identify the document type and format
2. Extract any dates, names, and key entities
3. Summarize the main topics and themes
4. Assess content quality and completeness

Content: ${textContent.substring(0, 4000)}

Respond with JSON containing:
{
  "documentType": "type of document",
  "keyEntities": ["entity1", "entity2"],
  "mainTopics": ["topic1", "topic2"],
  "contentQuality": "high|medium|low",
  "structureScore": 1-10
}`;

    try {
      const response = await this.ollama.generate({
        model: 'gemma3:4b',
        prompt,
        options: this.parameterProfiles.factual,
        format: 'json'
      });

      return JSON.parse(response.response);
    } catch (error) {
      console.error('[ENHANCED-LLM] Content structure analysis failed:', error.message);
      return {
        documentType: 'unknown',
        keyEntities: [],
        mainTopics: [],
        contentQuality: 'medium',
        structureScore: 5
      };
    }
  }

  /**
   * Perform domain-specific analysis with examples and constraints
   */
  async performDomainSpecificAnalysis(content, fileName, domain) {
    const template = this.domainTemplates.get(domain);
    if (!template) {
      throw new Error(`No template found for domain: ${domain}`);
    }

    // Build advanced prompt with examples and constraints
    let prompt = `${template.systemPrompt}

ANALYSIS EXAMPLES:
${template.examples.map((ex, i) => `
Example ${i + 1}:
Input: "${ex.input}"
Output: ${JSON.stringify(ex.output, null, 2)}
`).join('\n')}

ANALYSIS CONSTRAINTS:
${template.constraints.map(c => `- ${c}`).join('\n')}

Now analyze this content following the same pattern:
Content: "${content.substring(0, 6000)}"
Filename: "${fileName}"

Provide detailed JSON analysis with all relevant fields:`;

    try {
      console.log(`[ENHANCED-LLM] Performing ${domain} analysis with examples and constraints`);
      
      const response = await this.ollama.generate({
        model: 'gemma3:4b',
        prompt,
        options: {
          ...this.parameterProfiles.balanced,
          num_predict: 800
        },
        format: 'json'
      });

      const analysis = JSON.parse(response.response);
      console.log(`[ENHANCED-LLM] Domain analysis complete:`, {
        domain,
        category: analysis.category,
        confidence: analysis.confidence
      });

      return analysis;
    } catch (error) {
      console.error(`[ENHANCED-LLM] Domain analysis failed for ${domain}:`, error.message);
      return this.getFallbackAnalysis(fileName, domain);
    }
  }

  /**
   * Enhanced folder matching with semantic similarity and context
   */
  async enhancedFolderMatching(suggestedCategory, smartFolders, userContext, content) {
    if (!smartFolders || smartFolders.length === 0) {
      return { category: suggestedCategory, matchConfidence: 0 };
    }

    console.log(`[ENHANCED-LLM] Performing enhanced folder matching for category: ${suggestedCategory}`);

    try {
      // Semantic similarity matching using LLM
      const semanticScores = await this.semanticSimilarityMatching(suggestedCategory, smartFolders, content);
      
      // Select best match
      const bestMatch = semanticScores.reduce((best, current) => 
        current.similarity > best.similarity ? current : best
      );

      return {
        category: bestMatch.folder,
        matchConfidence: bestMatch.similarity,
        matchMethod: 'semantic',
        reasoning: bestMatch.reasoning
      };
    } catch (error) {
      console.error('[ENHANCED-LLM] Enhanced folder matching failed:', error.message);
      return { 
        category: smartFolders[0]?.name || suggestedCategory, 
        matchConfidence: 0.5,
        matchMethod: 'fallback'
      };
    }
  }

  /**
   * Semantic similarity matching using LLM
   */
  async semanticSimilarityMatching(category, smartFolders, content) {
    const folderDescriptions = smartFolders.map(f => ({
      name: f.name,
      description: f.description || '',
      keywords: f.keywords || []
    }));

    const prompt = `Analyze semantic similarity between the suggested category and available folders:

SUGGESTED CATEGORY: "${category}"
CONTENT CONTEXT: "${content.substring(0, 2000)}"

AVAILABLE FOLDERS:
${folderDescriptions.map((f, i) => `${i + 1}. ${f.name}: ${f.description}
   Keywords: ${f.keywords.join(', ')}`).join('\n')}

Rate each folder's similarity to the suggested category (0.0-1.0):
Consider semantic meaning, not just keyword matching.

Respond with JSON array:
[
  {"folder": "FolderName1", "similarity": 0.85, "reasoning": "why it matches"},
  {"folder": "FolderName2", "similarity": 0.23, "reasoning": "why it doesn't match"}
]`;

    try {
      const response = await this.ollama.generate({
        model: 'gemma3:4b',
        prompt,
        options: this.parameterProfiles.factual,
        format: 'json'
      });

      return JSON.parse(response.response);
    } catch (error) {
      console.error('[ENHANCED-LLM] Semantic matching failed:', error.message);
      return smartFolders.map(f => ({ folder: f.name, similarity: 0.5, reasoning: 'fallback' }));
    }
  }

  /**
   * Iterative refinement based on confidence levels
   */
  async refineAnalysis(initialAnalysis, content, fileName, smartFolders) {
    const confidence = initialAnalysis.confidence || 0;
    
    // If confidence is low, try alternative approaches
    if (confidence < 70) {
      console.log(`[ENHANCED-LLM] Low confidence (${confidence}%), attempting refinement`);
      
      try {
        // Try different parameter settings for refinement
        const refinedAnalysis = await this.performDomainSpecificAnalysis(
          content, 
          fileName, 
          'document'
        );
        
        // Combine and validate results
        return this.combineAnalysisResults(initialAnalysis, refinedAnalysis);
      } catch (error) {
        console.error('[ENHANCED-LLM] Refinement failed:', error.message);
        return initialAnalysis;
      }
    }

    return initialAnalysis;
  }

  /**
   * Learn from analysis for future improvements
   */
  async learnFromAnalysis(fileName, analysis, userContext) {
    const userId = userContext.userId || 'default';
    const userHistory = this.userPatterns.get(userId) || [];
    
    userHistory.push({
      timestamp: new Date().toISOString(),
      fileName,
      originalCategory: analysis.category,
      chosenFolder: analysis.category,
      confidence: analysis.confidence,
      analysis: analysis
    });
    
    // Keep only recent history (last 100 entries)
    if (userHistory.length > 100) {
      userHistory.splice(0, userHistory.length - 100);
    }
    
    this.userPatterns.set(userId, userHistory);
    
    console.log(`[ENHANCED-LLM] Learned from analysis: ${fileName} -> ${analysis.category}`);
  }

  /**
   * Advanced parameter optimization based on task type
   */
  getOptimizedParameters(taskType, contentComplexity = 'medium') {
    const baseProfile = this.parameterProfiles[
      contentComplexity === 'high' ? 'creative' :
      contentComplexity === 'low' ? 'precise' : 'balanced'
    ];

    const taskOptimizations = {
      categorization: { temperature: 0.1, top_k: 15 },
      summarization: { temperature: 0.3, top_k: 25 },
      extraction: { temperature: 0.05, top_k: 10 },
      creative: { temperature: 0.7, top_k: 35 }
    };

    return {
      ...baseProfile,
      ...taskOptimizations[taskType],
      num_predict: taskType === 'summarization' ? 1200 : 800
    };
  }

  // Helper methods
  getFallbackAnalysis(fileName, domain) {
    return {
      category: domain === 'image' ? 'Images' : 'Documents',
      project: path.basename(fileName, path.extname(fileName)),
      purpose: `${domain} file analysis`,
      keywords: [domain, 'file'],
      confidence: 50,
      suggestedName: fileName.replace(/[^a-zA-Z0-9_-]/g, '_'),
      fallback: true
    };
  }

  combineAnalysisResults(initial, refined) {
    return {
      ...initial,
      ...refined,
      confidence: Math.max(initial.confidence || 0, refined.confidence || 0),
      refined: true
    };
  }

  /**
   * Get user learning statistics
   */
  getUserLearningStats(userId = 'default') {
    const history = this.userPatterns.get(userId) || [];
    return {
      totalAnalyses: history.length,
      averageConfidence: history.reduce((sum, h) => sum + h.confidence, 0) / history.length || 0,
      commonCategories: this.getTopCategories(history),
      learningTrend: this.calculateLearningTrend(history)
    };
  }

  getTopCategories(history) {
    const categoryCount = {};
    history.forEach(h => {
      categoryCount[h.chosenFolder] = (categoryCount[h.chosenFolder] || 0) + 1;
    });
    
    return Object.entries(categoryCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([category, count]) => ({ category, count }));
  }

  calculateLearningTrend(history) {
    if (history.length < 10) return 'insufficient_data';
    
    const recent = history.slice(-10);
    const older = history.slice(-20, -10);
    
    const recentAvg = recent.reduce((sum, h) => sum + h.confidence, 0) / recent.length;
    const olderAvg = older.reduce((sum, h) => sum + h.confidence, 0) / older.length;
    
    const improvement = recentAvg - olderAvg;
    
    if (improvement > 5) return 'improving';
    if (improvement < -5) return 'declining';
    return 'stable';
  }

  /**
   * Enhanced image analysis with multi-step processing
   */
  async analyzeImageEnhanced(imageBase64, originalFileName, smartFolders = [], userContext = {}) {
    console.log(`[ENHANCED-LLM] Starting multi-step image analysis for ${originalFileName}`);
    
    try {
      // Step 1: Visual content analysis
      const visualAnalysis = await this.analyzeVisualContent(imageBase64, originalFileName);
      
      // Step 2: Text extraction if text is detected
      const textAnalysis = visualAnalysis.has_text ? 
        await this.analyzeImageText(imageBase64, originalFileName) : null;
      
      // Step 3: Smart folder matching with visual context
      const folderAnalysis = await this.enhancedFolderMatching(
        visualAnalysis.category,
        smartFolders,
        userContext,
        `Image: ${visualAnalysis.purpose} - Visual elements: ${visualAnalysis.keywords?.join(', ')}`
      );
      
      // Step 4: Combine results
      const finalAnalysis = {
        ...visualAnalysis,
        ...folderAnalysis,
        extractedText: textAnalysis?.text || '',
        textConfidence: textAnalysis?.confidence || 0,
        enhanced: true,
        multiStep: true
      };
      
      // Step 5: Learn from this analysis
      await this.learnFromAnalysis(originalFileName, finalAnalysis, userContext);
      
      return finalAnalysis;
    } catch (error) {
      console.error('[ENHANCED-LLM] Enhanced image analysis failed:', error.message);
      return this.getFallbackAnalysis(originalFileName, 'image');
    }
  }

  /**
   * Analyze visual content of images
   */
  async analyzeVisualContent(imageBase64, fileName) {
    const prompt = `Analyze this image and provide detailed visual analysis:

VISUAL ANALYSIS TASK:
1. Identify the main content type (screenshot, photo, diagram, logo, etc.)
2. Determine if there is readable text present
3. Identify the dominant colors
4. Extract key visual elements and objects
5. Determine the likely purpose or context

Respond with JSON containing:
{
  "category": "descriptive category",
  "content_type": "interface|object|person|document|other",
  "has_text": true|false,
  "colors": ["color1", "color2"],
  "keywords": ["keyword1", "keyword2"],
  "purpose": "description of purpose",
  "confidence": 70-95
}`;

    try {
      const response = await this.ollama.generate({
        model: 'gemma3:4b',
        prompt,
        images: [imageBase64],
        options: {
          ...this.parameterProfiles.balanced,
          temperature: 0.2, // Slightly higher for visual creativity
          num_predict: 1000
        },
        format: 'json'
      });

      return JSON.parse(response.response);
    } catch (error) {
      console.error('[ENHANCED-LLM] Visual content analysis failed:', error.message);
      return {
        category: 'Images',
        content_type: 'object',
        has_text: false,
        colors: [],
        keywords: ['image'],
        purpose: 'Visual content',
        confidence: 50
      };
    }
  }

  /**
   * Analyze and extract text from images
   */
  async analyzeImageText(imageBase64, fileName) {
    const prompt = `Extract and analyze any readable text from this image:

TEXT EXTRACTION TASK:
1. Extract all readable text content
2. Determine text clarity and readability
3. Identify text type (UI text, document text, handwriting, etc.)

If no text is found, return empty string for text and 0 for confidence.

Respond with JSON:
{
  "text": "extracted text content",
  "confidence": 0-100,
  "textType": "ui|document|handwriting|printed|other"
}`;

    try {
      const response = await this.ollama.generate({
        model: 'gemma3:4b',
        prompt,
        images: [imageBase64],
        options: {
          ...this.parameterProfiles.precise,
          temperature: 0.1, // Very low for text extraction
          num_predict: 1500
        },
        format: 'json'
      });

      return JSON.parse(response.response);
    } catch (error) {
      console.error('[ENHANCED-LLM] Image text analysis failed:', error.message);
      return {
        text: '',
        confidence: 0,
        textType: 'other'
      };
    }
  }

  /**
   * PERFORMANCE-OPTIMIZED HELPER METHODS
   */

  /**
   * Generate content hash for caching
   */
  generateContentHash(content) {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * Optimized content structure analysis with performance enhancements
   */
  async analyzeContentStructureOptimized(textContent, fileName, model = 'gemma3:4b', timeout = 60000) {
    const prompt = `Analyze the structure and key information in this document content:

CONTENT ANALYSIS TASK:
1. Identify the document type and format
2. Extract any dates, names, and key entities
3. Summarize the main topics and themes
4. Assess content quality and completeness

Content: ${textContent.substring(0, 4000)}

Respond with JSON containing:
{
  "documentType": "type of document",
  "keyEntities": ["entity1", "entity2"],
  "mainTopics": ["topic1", "topic2"],
  "contentQuality": "high|medium|low",
  "structureScore": 1-10
}`;

    try {
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Content structure analysis timeout')), timeout)
      );

      const analysisPromise = this.ollama.generate({
        model,
        prompt,
        options: this.parameterProfiles.factual,
        format: 'json'
      });

      const response = await Promise.race([analysisPromise, timeoutPromise]);
      return JSON.parse(response.response);
    } catch (error) {
      console.error('[ENHANCED-LLM] Optimized content structure analysis failed:', error.message);
      return {
        documentType: 'unknown',
        keyEntities: [],
        mainTopics: [],
        contentQuality: 'medium',
        structureScore: 5
      };
    }
  }

  /**
   * Optimized domain-specific analysis with performance enhancements
   */
  async performDomainSpecificAnalysisOptimized(content, fileName, domain, model = 'gemma3:4b', timeout = 60000) {
    const template = this.domainTemplates.get(domain);
    if (!template) {
      throw new Error(`No template found for domain: ${domain}`);
    }

    // Check parameter cache first
    const contentHash = this.generateContentHash(content);
    const cachedParams = this.performanceOptimizer.getCachedParameters(contentHash, 'domain_analysis', domain);
    
    let optimizedParams;
    if (cachedParams) {
      optimizedParams = cachedParams.parameters;
    } else {
      optimizedParams = {
        ...this.parameterProfiles.balanced,
        num_predict: Math.min(800, Math.max(400, content.length / 10))
      };
      this.performanceOptimizer.setCachedParameters(contentHash, 'domain_analysis', domain, optimizedParams);
    }

    // Build optimized prompt
    const prompt = `${template.systemPrompt}

ANALYSIS EXAMPLES:
${template.examples.slice(0, 2).map((ex, i) => `
Example ${i + 1}:
Input: "${ex.input}"
Output: ${JSON.stringify(ex.output, null, 2)}
`).join('\n')}

ANALYSIS CONSTRAINTS:
${template.constraints.slice(0, 3).map(c => `- ${c}`).join('\n')}

Now analyze this content following the same pattern:
Content: "${content.substring(0, 6000)}"
Filename: "${fileName}"

Provide detailed JSON analysis with all relevant fields:`;

    try {
      console.log(`[ENHANCED-LLM] Performing optimized ${domain} analysis with ${model}`);
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Domain analysis timeout')), timeout)
      );

      const analysisPromise = this.ollama.generate({
        model,
        prompt,
        options: optimizedParams,
        format: 'json'
      });

      const response = await Promise.race([analysisPromise, timeoutPromise]);
      const analysis = JSON.parse(response.response);
      
      console.log(`[ENHANCED-LLM] Optimized domain analysis complete:`, {
        domain,
        category: analysis.category,
        confidence: analysis.confidence,
        model
      });

      return analysis;
    } catch (error) {
      console.error(`[ENHANCED-LLM] Optimized domain analysis failed for ${domain}:`, error.message);
      return this.getFallbackAnalysis(fileName, domain);
    }
  }

  /**
   * Batch process multiple analyses with performance optimization
   */
  async batchAnalyzeDocuments(documents, smartFolders = [], userContext = {}) {
    console.log(`[ENHANCED-LLM] Starting batch analysis of ${documents.length} documents`);
    
    const analysisRequests = documents.map(doc => ({
      analysisFunction: this.analyzeDocumentEnhanced.bind(this),
      args: [doc.content, doc.fileName, smartFolders, userContext]
    }));

    const results = await this.performanceOptimizer.processConcurrentAnalyses(analysisRequests);
    
    console.log(`[ENHANCED-LLM] Batch analysis completed: ${results.length} results`);
    return results;
  }

  /**
   * Get comprehensive performance statistics
   */
  getPerformanceStats() {
    return this.performanceOptimizer.getPerformanceStats();
  }

  /**
   * Optimize system performance based on current load
   */
  optimizePerformance() {
    // Clear old caches
    this.performanceOptimizer.cleanupCache();
    
    // Force memory cleanup
    this.performanceOptimizer.performMemoryCleanup();
    
    console.log('[ENHANCED-LLM] Performance optimization completed');
    
    return this.getPerformanceStats();
  }
}

module.exports = EnhancedLLMService; 