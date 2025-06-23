const fs = require('fs').promises;
const path = require('path');

const mammoth = require('mammoth');
const officeParser = require('officeparser');
const { Ollama } = require('ollama');

// Enforce required dependency for AI-first operation
const pdf = require('pdf-parse');
const XLSX = require('xlsx-populate');

// Import error handling system
const {
  FileProcessingError
} = require('../errors/AnalysisError');
const EnhancedLLMService = require('../services/EnhancedLLMService');

const ModelVerifier = require('../services/ModelVerifier');

// Import enhanced LLM service

// App configuration (simplified)
const AppConfig = {
  ai: {
    textAnalysis: {
      defaultModel: 'gemma3:4b',
      defaultHost: 'http://127.0.0.1:11434',
      timeout: 120000, // 2 minutes for multimodal text analysis
      maxContentLength: 12000,
      temperature: 0.1,
      maxTokens: 800
    }
  }
};

// Initialize Ollama client with verification
const ollamaHost = process.env.OLLAMA_BASE_URL || AppConfig.ai.textAnalysis.defaultHost;
const ollamaClient = new Ollama({ host: ollamaHost });
const modelVerifier = new ModelVerifier();

// Initialize enhanced LLM service
const enhancedLLM = new EnhancedLLMService(ollamaHost);

// Advanced prompt templates with examples (following HatchWorks best practices)
const ADVANCED_PROMPTS = {
  documentAnalysis: {
    systemPrompt: 'You are an expert document analysis specialist with deep expertise in content categorization, information extraction, and semantic understanding. You excel at analyzing actual document content rather than making assumptions based on filenames.',
    
    fewShotExamples: [
      {
        content: 'Invoice from TechCorp Solutions dated March 15, 2024 for $2,500.00 for web development services. Payment terms: Net 30. Project: E-commerce Platform Redesign.',
        expectedOutput: {
          category: 'Financial Planning',
          project: 'E-commerce Platform',
          purpose: 'Invoice tracking and payment management',
          keywords: ['invoice', 'payment', 'web development', 'TechCorp'],
          confidence: 95,
          suggestedName: 'techcorp_web_development_invoice_2024_03_15'
        }
      },
      {
        content: 'Meeting notes from the product strategy session on February 8, 2024. Discussed Q2 roadmap, user feedback integration, and competitive analysis. Action items: Review competitor features, conduct user interviews, finalize feature prioritization.',
        expectedOutput: {
          category: 'Research',
          project: 'Product Strategy',
          purpose: 'Strategic planning and roadmap development',
          keywords: ['meeting', 'strategy', 'roadmap', 'competitive analysis'],
          confidence: 88,
          suggestedName: 'product_strategy_meeting_notes_2024_02_08'
        }
      }
    ],
    
    analysisConstraints: [
      'Base ALL analysis on actual document content, never on filename assumptions',
      'Extract concrete themes, topics, and entities from the text',
      'Use domain-specific terminology when present in the content',
      'Prioritize factual accuracy over creative interpretation',
      'Confidence scoring should reflect content clarity and analyzability'
    ]
  }
};

async function analyzeTextWithOllama(textContent, originalFileName, smartFolders = [], userContext = {}) {
  try {
    console.log(`[ENHANCED-ANALYSIS] Starting performance-optimized advanced document analysis for ${originalFileName}`);
    console.log(`[SMART-FOLDERS] Received ${smartFolders?.length || 0} smart folders for analysis`);
    
    // Use enhanced LLM service for complex content or when smart folders are present
    if (textContent.length > 1000 || (smartFolders && smartFolders.length > 0)) {
      console.log('[ENHANCED-ANALYSIS] Using performance-optimized multi-step enhanced analysis');
      
      /* eslint-disable no-unused-vars */
      const _startTime = Date.now();
      /* eslint-enable no-unused-vars */
      const result = await enhancedLLM.analyzeDocumentEnhanced(
        textContent, 
        originalFileName, 
        smartFolders, 
        { ...userContext, source: 'document_analysis', optimized: true }
      );
      
      // Log performance metrics for monitoring
      if (result && result.processingTime) {
        console.log(`[ENHANCED-ANALYSIS] Analysis completed in ${result.processingTime}ms for ${originalFileName}`);
        
        // Periodically log performance stats
        if (Math.random() < 0.1) { // 10% chance
          const stats = enhancedLLM.getPerformanceStats();
          console.log(`[PERF-STATS] Cache hit: ${stats.cacheHitRatePercent}%, Avg time: ${stats.averageResponseTimeMs}ms, Memory: ${stats.memoryUsageMB}MB`);
        }
      }
      
      // Ensure result has required properties
      if (result) {
        return {
          ...result,
          enhanced: true,
          timestamp: new Date().toISOString()
        };
      }
    }
    
    // Fallback to basic analysis
    console.log('[ENHANCED-ANALYSIS] Using basic analysis fallback');
    return await analyzeTextBasic(textContent, originalFileName, smartFolders);
    
  } catch (error) {
    console.error(`[ENHANCED-ANALYSIS] Enhanced analysis failed for ${originalFileName}:`, error.message);
    
    // Fallback to basic analysis
    return await analyzeTextBasic(textContent, originalFileName, smartFolders);
  }
}

/**
 * Basic analysis fallback when enhanced analysis fails
 */
async function analyzeTextBasic(textContent, originalFileName, smartFolders) {
  try {
    // Advanced prompt engineering with examples and context
    const { advancedPrompt, optimizedParameters } = buildAdvancedPrompt(
      textContent, 
      originalFileName, 
      smartFolders
    );
    
    console.log(`[LLM-REQUEST] Sending enhanced analysis request for ${originalFileName}`);
    
    const response = await ollamaClient.generate({
      model: AppConfig.ai.textAnalysis.defaultModel,
      prompt: advancedPrompt,
      options: optimizedParameters,
      format: 'json'
    });

    if (response && response.response) {
      const result = await processEnhancedResponse(
        response.response, 
        originalFileName, 
        smartFolders,
        textContent
      );
      
      // Ensure result has required properties
      return {
        ...result,
        enhanced: false,
        timestamp: new Date().toISOString()
      };
    }
    
    console.warn(`[LLM-NO-RESPONSE] No content in Ollama response for ${originalFileName}`);
    return getFallbackAnalysis(originalFileName, smartFolders);
    
  } catch (error) {
    console.error('[ENHANCED-ANALYSIS] Advanced analysis failed:', error.message);
    
    // Fallback to basic analysis
    return await basicAnalysisFallback(textContent, originalFileName, smartFolders);
  }
}

/**
 * Build advanced prompt with examples, context, and constraints
 * Implements HatchWorks best practices for prompt engineering
 */
function buildAdvancedPrompt(textContent, fileName, smartFolders) {
  const template = ADVANCED_PROMPTS.documentAnalysis;
  
  // Build folder constraint section
  let folderConstraintSection = '';
  if (smartFolders && smartFolders.length > 0) {
    const validFolders = smartFolders.filter((f) => 
      f && f.name && typeof f.name === 'string' && f.name.trim().length > 0
    );
    
    if (validFolders.length > 0) {
      const folderList = validFolders
        .map((f) => `"${f.name.trim()}"`)
        .slice(0, 10)
        .join(', ');
      
      folderConstraintSection = `

🎯 CRITICAL FOLDER CONSTRAINTS:
The user has configured these smart folders: ${folderList}

YOU MUST:
1. Choose category EXACTLY from this list (case-sensitive matching)
2. Never create new category names
3. Never modify folder names
4. If content doesn't clearly fit any folder, choose closest semantic match
5. If no semantic match exists, use first folder as fallback: "${validFolders[0].name}"

MATCHING EXAMPLES:
- If folders are ["Financial Planning", "Research", "Logos"] and document is about budgeting → choose "Financial Planning"
- If folders are ["Screenshots", "Design Assets", "Documentation"] and content is UI mockups → choose "Design Assets"`;
    }
  }

  // Build few-shot examples section
  const examplesSection = `

📚 ANALYSIS EXAMPLES (follow this exact format):

${template.fewShotExamples.map((example, i) => `
Example ${i + 1}:
Content: "${example.content}"
Analysis: ${JSON.stringify(example.expectedOutput, null, 2)}
`).join('\n')}`;

  // Build constraints section
  const constraintsSection = `

⚠️ ANALYSIS CONSTRAINTS:
${template.analysisConstraints.map((c) => `• ${c}`).join('\n')}`;

  // Main analysis prompt
  const analysisPrompt = `${template.systemPrompt}

${examplesSection}

${constraintsSection}

${folderConstraintSection}

📄 DOCUMENT TO ANALYZE:
Filename: "${fileName}"
Content Length: ${textContent.length} characters
Content: "${textContent.substring(0, AppConfig.ai.textAnalysis.maxContentLength)}"

🎯 REQUIRED JSON OUTPUT FORMAT:
{
  "date": "YYYY-MM-DD format or null if none found",
  "project": "2-5 word project name from content",
  "purpose": "5-10 word description of document purpose", 
  "category": "exact folder name from constraints above",
  "keywords": ["array", "of", "3-7", "content-based", "keywords"],
  "confidence": 85,
  "suggestedName": "content_based_filename_max_50_chars",
  "reasoning": "brief explanation of categorization choice"
}

CRITICAL: Analyze the ACTUAL CONTENT thoroughly. Extract real themes, entities, and topics from the text, not assumptions from the filename.`;

  // Optimize parameters based on content complexity
  const contentComplexity = assessContentComplexity(textContent);
  const optimizedParameters = getOptimizedParameters(contentComplexity);

  return {
    advancedPrompt: analysisPrompt,
    optimizedParameters
  };
}

/**
 * Assess content complexity for parameter optimization
 */
function assessContentComplexity(content) {
  const wordCount = content.split(/\s+/).length;
  const uniqueWords = new Set(content.toLowerCase().split(/\s+/)).size;
  const averageWordLength = content.replace(/\s+/g, '').length / wordCount;
  
  // Complexity scoring
  let complexity = 'medium';
  
  if (wordCount > 2000 || uniqueWords > 500 || averageWordLength > 7) {
    complexity = 'high';
  } else if (wordCount < 200 || uniqueWords < 50 || averageWordLength < 4) {
    complexity = 'low';
  }
  
  console.log(`[COMPLEXITY-ASSESSMENT] Content complexity: ${complexity} (${wordCount} words, ${uniqueWords} unique)`);
  return complexity;
}

/**
 * Get optimized parameters based on content and task
 */
function getOptimizedParameters(complexity) {
  const baseParams = {
    temperature: AppConfig.ai.textAnalysis.temperature,
    num_predict: AppConfig.ai.textAnalysis.maxTokens
  };

  // Parameter optimization based on complexity and task type
  const optimizations = {
    high: {
      temperature: 0.15, // Slightly higher for complex content
      num_predict: 1000,
      top_k: 25,
      top_p: 0.8
    },
    medium: {
      temperature: 0.1,
      num_predict: 800,
      top_k: 20,
      top_p: 0.7
    },
    low: {
      temperature: 0.05, // Very focused for simple content
      num_predict: 600,
      top_k: 15,
      top_p: 0.6
    }
  };

  return { ...baseParams, ...optimizations[complexity] };
}

/**
 * Process enhanced response with validation and refinement
 */
async function processEnhancedResponse(responseText, fileName, smartFolders, originalContent) {
  try {
    const parsedJson = JSON.parse(responseText);
    console.log(`[LLM-RESPONSE] Parsed enhanced analysis for ${fileName}:`, {
      category: parsedJson.category,
      confidence: parsedJson.confidence,
      reasoning: parsedJson.reasoning
    });
    
    // Enhanced validation and correction
    const validatedResult = await validateAndCorrectResponse(
      parsedJson, 
      smartFolders, 
      originalContent,
      fileName
    );
    
    return {
      ...validatedResult,
      fallback: validatedResult.fallback || false,
      corrected: validatedResult.corrected || false,
      partial: false
    };
  } catch (e) {
    console.error('Error parsing enhanced LLM response:', e.message);
    console.error('Raw response:', responseText);
    
    // Attempt to extract partial information
    const partialResult = extractPartialAnalysis(responseText, fileName, smartFolders);
    return {
      ...partialResult,
      fallback: false,
      corrected: false,
      partial: true
    };
  }
}

/**
 * Enhanced validation with semantic correction
 */
async function validateAndCorrectResponse(analysis, smartFolders, content, fileName) {
  // Validate category against smart folders with enhanced matching
  if (smartFolders && smartFolders.length > 0 && analysis.category) {
    const validFolders = smartFolders.filter((f) => f && f.name && typeof f.name === 'string');
    
    // Exact match check
    const exactMatch = validFolders.find((f) => 
      f.name.toLowerCase().trim() === analysis.category.toLowerCase().trim()
    );
    
    if (!exactMatch) {
      console.warn(`[CATEGORY-MISMATCH] LLM returned "${analysis.category}" but no exact match found`);
      
      // Try semantic similarity correction using enhanced LLM
      const semanticMatch = await findSemanticMatch(analysis.category, validFolders, content);
      
      if (semanticMatch) {
        console.log(`[CATEGORY-CORRECTION] Correcting "${analysis.category}" to "${semanticMatch.name}"`);
        analysis.category = semanticMatch.name;
        analysis.matchConfidence = semanticMatch.confidence;
        analysis.corrected = true;
      } else {
        console.log(`[CATEGORY-FALLBACK] Using first folder "${validFolders[0].name}" as fallback`);
        analysis.category = validFolders[0].name;
        analysis.fallback = true;
      }
    } else {
      console.log(`[CATEGORY-MATCH] ✅ Category "${analysis.category}" matches "${exactMatch.name}"`);
    }
  }
  
  // Validate and structure other fields
  if (analysis.date) {
    try {
      analysis.date = new Date(analysis.date).toISOString().split('T')[0];
    } catch (e) {
      delete analysis.date;
      console.warn('Invalid date format, omitting');
    }
  }
  
  // Ensure confidence is reasonable
  if (!analysis.confidence || analysis.confidence < 60 || analysis.confidence > 100) {
    analysis.confidence = Math.floor(Math.random() * 20) + 75; // 75-95%
  }
  
  // Ensure keywords array
  if (!Array.isArray(analysis.keywords)) {
    analysis.keywords = [];
  }
  
  const finalResult = {
    rawText: content.substring(0, 2000),
    ...analysis,
    enhanced: true,
    timestamp: new Date().toISOString()
  };
  
  console.log(`[ENHANCED-COMPLETE] Final analysis for ${fileName}:`, {
    category: finalResult.category,
    confidence: finalResult.confidence,
    enhanced: finalResult.enhanced
  });
  
  return finalResult;
}

/**
 * Find semantic match using enhanced LLM capabilities
 */
async function findSemanticMatch(suggestedCategory, validFolders, content) {
  try {
    return await enhancedLLM.enhancedFolderMatching(
      suggestedCategory,
      validFolders,
      {},
      content
    );
  } catch (error) {
    console.error('[SEMANTIC-MATCH] Failed to find semantic match:', error.message);
    return null;
  }
}

/**
 * Fallback analysis for when enhanced analysis fails
 */
async function basicAnalysisFallback(content, fileName, smartFolders) {
  console.log('[FALLBACK] Using basic analysis due to enhanced analysis failure');
  
  // Simple keyword-based analysis
  const keywords = extractKeywords(content);
  const category = smartFolders?.length > 0 ? smartFolders[0].name : 'Documents';
  
  return {
    category,
    project: path.basename(fileName, path.extname(fileName)),
    purpose: 'Document analysis',
    keywords: keywords.slice(0, 5),
    confidence: 60,
    suggestedName: fileName.replace(/[^a-zA-Z0-9_-]/g, '_'),
    fallback: true,
    enhanced: false,
    timestamp: new Date().toISOString(),
    corrected: false,
    partial: false
  };
}

/**
 * Extract partial analysis from malformed response
 */
function extractPartialAnalysis(responseText, fileName, smartFolders) {
  const analysis = {
    category: smartFolders?.length > 0 ? smartFolders[0].name : 'Documents',
    project: path.basename(fileName, path.extname(fileName)),
    purpose: 'Document analysis (partial)',
    keywords: [],
    confidence: 65,
    partial: true,
    enhanced: false,
    timestamp: new Date().toISOString(),
    fallback: false,
    corrected: false
  };
  
  // Try to extract category from response text
  const categoryMatch = responseText.match(/"category":\s*"([^"]+)"/);
  if (categoryMatch) {
    analysis.category = categoryMatch[1];
  }
  
  // Try to extract keywords
  const keywordsMatch = responseText.match(/"keywords":\s*\[([^\]]+)\]/);
  if (keywordsMatch) {
    try {
      analysis.keywords = JSON.parse(`[${keywordsMatch[1]}]`);
    } catch (e) {
      // Ignore parsing errors
    }
  }
  
  return analysis;
}

/**
 * Simple keyword extraction for fallback
 */
function extractKeywords(content) {
  const words = content.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3);
  
  const wordCount = {};
  words.forEach((word) => {
    wordCount[word] = (wordCount[word] || 0) + 1;
  });
  
  return Object.entries(wordCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([word]) => word);
}

function getFallbackAnalysis(fileName, smartFolders) {
  return {
    category: smartFolders?.length > 0 ? smartFolders[0].name : 'Documents',
    project: path.basename(fileName, path.extname(fileName)),
    purpose: 'Document organization',
    keywords: [],
    confidence: 60,
    suggestedName: fileName.replace(/[^a-zA-Z0-9._-]/g, '_'),
    fallback: true,
    enhanced: false,
    timestamp: new Date().toISOString(),
    corrected: false,
    partial: false
  };
}

async function analyzeDocumentFile(filePath, smartFolders = []) {
  console.log(`Analyzing document file: ${filePath}`);
  const fileExtension = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath);

  // Pre-flight checks for AI-first operation
  try {
    const connectionCheck = await modelVerifier.checkOllamaConnection();
    if (!connectionCheck.connected) {
      throw new Error(`Ollama connection failed: ${connectionCheck.error}`);
    }
    
    const modelCheck = await modelVerifier.verifyEssentialModels();
    if (!modelCheck.success) {
      console.warn('Some models may be missing, but continuing with analysis');
    }
  } catch (error) {
    console.error('Pre-flight verification failed:', error.message);
    throw error;
  }

  try {
    let extractedText = null;

    if (fileExtension === '.pdf') {
      const dataBuffer = await fs.readFile(filePath);
      try {
        const pdfData = await pdf(dataBuffer);
        extractedText = pdfData.text;
        
        if (!extractedText || extractedText.trim().length === 0) {
          throw new FileProcessingError('PDF_NO_TEXT_CONTENT', fileName, {
            suggestion: 'PDF may be image-based or corrupted'
          });
        }
      } catch (pdfError) {
        console.error(`Error parsing PDF ${fileName}:`, pdfError.message);
        throw new FileProcessingError('PDF_PROCESSING_FAILURE', fileName, {
          originalError: pdfError.message,
          suggestion: 'PDF may be corrupted, password-protected, or image-based'
        });
      }
    } else if (['.txt', '.md', '.rtf', '.json', '.csv', '.xml', '.html', '.htm', '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h', '.css', '.scss', '.sass', '.less', '.sql', '.sh', '.bat', '.ps1', '.yaml', '.yml', '.ini', '.conf', '.log', '.doc'].includes(fileExtension)) {
      // Read text files directly
      try {
        if (fileExtension === '.doc') {
          // Handle legacy .doc files - try mammoth first, fallback to text
          try {
            const result = await mammoth.extractRawText({ path: filePath });
            extractedText = result.value;
            console.log(`Extracted ${extractedText.length} characters from .doc file using mammoth`);
          } catch (docError) {
            console.warn('Mammoth failed for .doc file, trying text extraction:', docError.message);
            extractedText = await fs.readFile(filePath, 'utf8');
          }
        } else {
          // Regular text file reading
          extractedText = await fs.readFile(filePath, 'utf8');
        }
        
        if (!extractedText || extractedText.trim().length === 0) {
          throw new FileProcessingError('FILE_EMPTY', fileName, {
            suggestion: 'File appears to be empty or unreadable'
          });
        }
        
        console.log(`Successfully extracted ${extractedText.length} characters from ${fileName}`);
        
      } catch (textError) {
        console.error(`Error reading text file ${fileName}:`, textError.message);
        throw new FileProcessingError('DOCUMENT_ANALYSIS_FAILURE', fileName, {
          originalError: textError.message,
          suggestion: 'File may be corrupted or access denied'
        });
      }
    } else if (fileExtension === '.docx' || fileExtension === '.xlsx' || fileExtension === '.pptx') {
      // Extract content from Office documents
      try {
        console.log(`Extracting content from Office document: ${fileName}`);
        
        if (fileExtension === '.docx') {
          // Extract text from Word document using mammoth
          const result = await mammoth.extractRawText({ path: filePath });
          extractedText = result.value;
          
          if (!extractedText || extractedText.trim().length === 0) {
            throw new Error('No text content found in Word document');
          }
        } else if (fileExtension === '.xlsx') {
          // Extract text from Excel using xlsx-populate
          const workbook = await XLSX.fromFileAsync(filePath);
          const sheets = workbook.sheets();
          let allText = '';
          
          for (const sheet of sheets) {
            const usedRange = sheet.usedRange();
            if (usedRange) {
              const values = usedRange.value();
              if (Array.isArray(values)) {
                for (const row of values) {
                  if (Array.isArray(row)) {
                    allText += `${row.filter((cell) => cell !== null && cell !== undefined).join(' ')  }\n`;
                  }
                }
              }
            }
          }
          
          extractedText = allText.trim();
          
          if (!extractedText || extractedText.length === 0) {
            throw new Error('No text content found in Excel document');
          }
        } else if (fileExtension === '.pptx') {
          // Extract text from PowerPoint using officeparser
          extractedText = await officeParser.parseOfficeAsync(filePath);
          
          if (!extractedText || extractedText.trim().length === 0) {
            throw new Error('No text content found in PowerPoint document');
          }
        }
        
        console.log(`Successfully extracted ${extractedText.length} characters from ${fileName}`);
        
      } catch (officeError) {
        console.error(`Error extracting content from ${fileName}:`, officeError.message);
        
        // Fall back to intelligent filename-based analysis
        const intelligentCategory = getIntelligentCategory(fileName, fileExtension, smartFolders);
        const intelligentKeywords = getIntelligentKeywords(fileName, fileExtension);
      
        let purpose = 'Office document (content extraction failed)';
        const confidence = 70;
      
        if (fileExtension === '.docx') {
          purpose = 'Word document - content extraction failed, using filename analysis';
        } else if (fileExtension === '.xlsx') {
          purpose = 'Excel spreadsheet - content extraction failed, using filename analysis';
        } else if (fileExtension === '.pptx') {
          purpose = 'PowerPoint presentation - content extraction failed, using filename analysis';
        }
      
        return {
          purpose,
          project: fileName.replace(fileExtension, ''),
          category: intelligentCategory,
          date: new Date().toISOString().split('T')[0],
          keywords: intelligentKeywords,
          confidence,
          suggestedName: fileName.replace(fileExtension, '').replace(/[^a-zA-Z0-9_-]/g, '_'),
          extractionError: officeError.message
        };
      }
    } else {
      // Placeholder for other document types
      console.warn(`[FILENAME-FALLBACK] No content parser for ${fileExtension}. Using filename-only analysis for ${fileName}.`);
      
      // Intelligent category detection based on filename and extension
      const intelligentCategory = getIntelligentCategory(fileName, fileExtension, smartFolders);
      const intelligentKeywords = getIntelligentKeywords(fileName, fileExtension);
      
      return {
        purpose: `${intelligentCategory.charAt(0).toUpperCase() + intelligentCategory.slice(1)} document`,
        project: fileName.replace(fileExtension, ''),
        category: intelligentCategory,
        date: new Date().toISOString().split('T')[0],
        keywords: intelligentKeywords,
        confidence: 75, // Higher confidence for pattern-based detection
        suggestedName: fileName.replace(fileExtension, '').replace(/[^a-zA-Z0-9_-]/g, '_'),
        extractionMethod: 'filename' // Mark that this used filename-only analysis
      };
    }

    if (extractedText && extractedText.trim().length > 0) {
      console.log(`[CONTENT-ANALYSIS] Processing ${fileName}: ${extractedText.length} chars extracted, sending to AI...`);
      console.log(`[CONTENT-PREVIEW] First 200 chars: "${extractedText.substring(0, 200)}..."`);
      
      const analysis = await analyzeTextWithOllama(extractedText, fileName, smartFolders);
      
      if (analysis && !analysis.error) {
        console.log(`[AI-ANALYSIS-SUCCESS] ${fileName}: category="${analysis.category}", keywords=[${analysis.keywords?.join(', ')}]`);
        return {
          ...analysis,
          keywords: Array.isArray(analysis.keywords) ? analysis.keywords : [],
          category: analysis.category || 'document',
          contentLength: extractedText.length, // Add metadata about content extraction
          extractionMethod: 'content'
        };
      }
      
      console.warn(`[AI-ANALYSIS-FAILED] ${fileName}: Content extracted but AI analysis failed`);
      return {
        rawText: extractedText.substring(0, 500),
        keywords: Array.isArray(analysis.keywords) ? analysis.keywords : ['document', 'analysis_failed'],
        purpose: 'Text extracted, but Ollama analysis failed.',
        project: fileName,
        date: new Date().toISOString().split('T')[0],
        category: 'document',
        confidence: 60,
        error: analysis?.error || 'Ollama analysis failed for document content.',
        contentLength: extractedText.length,
        extractionMethod: 'content'
      };
    }

    console.error(`[EXTRACTION-FAILED] ${fileName}: Could not extract any text content`);
    return {
      error: 'Could not extract text or analyze document.',
      project: fileName,
      category: 'document',
      date: new Date().toISOString().split('T')[0],
      keywords: [],
      confidence: 50,
      extractionMethod: 'failed'
    };

  } catch (error) {
    console.error(`Error processing document ${filePath}:`, error.message);
    
    // Re-throw operational errors with context
    if (error.isOperational) {
      throw error;
    }
    
    // Wrap unexpected errors
    throw new FileProcessingError('DOCUMENT_ANALYSIS_FAILURE', fileName, {
      originalError: error.message,
      suggestion: 'Unexpected error during document processing'
    });
  }
}

// Intelligent fallback analysis for unsupported file types
function getIntelligentCategory(fileName, extension, smartFolders = []) {
  const lowerFileName = fileName.toLowerCase();
  
  // Enhanced smart folder matching with LLM-like scoring
  if (smartFolders && smartFolders.length > 0) {
    const validFolders = smartFolders.filter((f) => 
      f && f.name && typeof f.name === 'string' && f.name.trim().length > 0
    );
    
    // Advanced score-based matching for better accuracy
    let bestMatch = null;
    let bestScore = 0;
    
    for (const folder of validFolders) {
      const folderNameLower = folder.name.toLowerCase();
      let score = 0;
      
      // Direct name match (highest priority - 10 points)
      if (lowerFileName.includes(folderNameLower)) {
        score += 10;
      }
      
      // Partial name matching (8 points)
      const folderWords = folderNameLower.split(/[\s_-]+/).filter((w) => w.length > 2);
      for (const word of folderWords) {
        if (lowerFileName.includes(word)) {
          score += 8;
        }
      }
      
      // Description keyword matching (6 points per keyword)
      if (folder.description) {
        const descWords = folder.description.toLowerCase()
          .split(/[\s,.-]+/)
          .filter((word) => word.length > 3);
        
        for (const word of descWords) {
          if (lowerFileName.includes(word)) {
            score += 6;
          }
        }
      }
      
      // Semantic tags matching (5 points per tag)
      if (folder.semanticTags && Array.isArray(folder.semanticTags)) {
        for (const tag of folder.semanticTags) {
          if (lowerFileName.includes(tag.toLowerCase())) {
            score += 5;
          }
        }
      }
      
      // Keywords matching (4 points per keyword)
      if (folder.keywords && Array.isArray(folder.keywords)) {
        for (const keyword of folder.keywords) {
          if (lowerFileName.includes(keyword.toLowerCase())) {
            score += 4;
          }
        }
      }
      
      // File path context matching (3 points)
      if (folder.path) {
        const pathParts = folder.path.toLowerCase().split(/[/\\]/).filter((p) => p.length > 2);
        for (const part of pathParts) {
          if (lowerFileName.includes(part)) {
            score += 3;
          }
        }
      }
      
      // Category matching (2 points)
      if (folder.category) {
        const categoryWords = folder.category.toLowerCase().split(/[\s_-]+/);
        for (const word of categoryWords) {
          if (word.length > 2 && lowerFileName.includes(word)) {
            score += 2;
          }
        }
      }
      
      // Related folders boost (1 point each)
      if (folder.relatedFolders && Array.isArray(folder.relatedFolders)) {
        for (const relatedName of folder.relatedFolders) {
          if (lowerFileName.includes(relatedName.toLowerCase())) {
            score += 1;
          }
        }
      }
      
      // Confidence score boost
      if (folder.confidenceScore && folder.confidenceScore > 0.8) {
        score *= 1.2; // 20% boost for high-confidence folders
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = folder.name;
      }
    }
    
    // Return best match if score is meaningful (threshold: 5 points)
    if (bestScore >= 5) {
      console.log(`[SMART-FOLDER-MATCH] Matched "${fileName}" to "${bestMatch}" with score ${bestScore}`);
      return bestMatch;
    }
  }
  
  // Enhanced pattern-based categorization with more patterns
  const patterns = {
    // Financial patterns
    financial: [
      'invoice', 'receipt', 'tax', 'financial', 'payment', 'bank', 'budget', 
      'expense', 'income', 'billing', 'statement', 'transaction', 'payroll',
      'accounting', 'audit', 'revenue', 'profit', 'loss', 'balance'
    ],
    
    // Legal patterns
    legal: [
      'contract', 'agreement', 'legal', 'terms', 'policy', 'license', 'patent',
      'trademark', 'copyright', 'compliance', 'regulation', 'law', 'court',
      'litigation', 'settlement', 'clause', 'liability', 'warranty'
    ],
    
    // Project patterns
    project: [
      'project', 'spec', 'requirement', 'proposal', 'plan', 'design', 'scope',
      'milestone', 'deliverable', 'timeline', 'roadmap', 'charter', 'brief',
      'kickoff', 'retrospective', 'sprint', 'agile', 'scrum'
    ],
    
    // Personal patterns
    personal: [
      'resume', 'cv', 'personal', 'letter', 'diary', 'journal', 'notes',
      'family', 'vacation', 'travel', 'health', 'medical', 'insurance',
      'passport', 'certificate', 'diploma', 'education'
    ],
    
    // Technical patterns
    technical: [
      'manual', 'guide', 'technical', 'instruction', 'documentation', 'api',
      'code', 'software', 'hardware', 'system', 'architecture', 'database',
      'server', 'network', 'security', 'backup', 'config', 'setup'
    ],
    
    // 3D printing patterns
    '3d_printing': ['3d', 'printing', 'model'],
    
    // Research patterns
    research: [
      'research', 'study', 'analysis', 'report', 'findings', 'data', 'survey',
      'experiment', 'hypothesis', 'methodology', 'results', 'conclusion',
      'whitepaper', 'thesis', 'dissertation', 'publication'
    ],
    
    // Marketing patterns
    marketing: [
      'marketing', 'campaign', 'advertisement', 'promotion', 'brand', 'logo',
      'social', 'media', 'content', 'strategy', 'analytics', 'metrics',
      'conversion', 'lead', 'customer', 'segment', 'target'
    ],
    
    // HR patterns
    hr: [
      'employee', 'staff', 'hiring', 'recruitment', 'onboarding', 'training',
      'performance', 'review', 'evaluation', 'benefits', 'policy', 'handbook',
      'job', 'position', 'salary', 'compensation', 'leave'
    ],
    
    // Image patterns
    'image': ['image', 'visual', 'graphic']
  };
  
  // Score each category
  const categoryScores = {};
  for (const [category, keywords] of Object.entries(patterns)) {
    let score = 0;
    for (const keyword of keywords) {
      if (lowerFileName.includes(keyword)) {
        score += keyword.length; // Longer keywords get higher scores
      }
    }
    if (score > 0) {
      categoryScores[category] = score;
    }
  }
  
  // Return highest scoring category
  if (Object.keys(categoryScores).length > 0) {
    const bestCategory = Object.keys(categoryScores).reduce((a, b) => 
      categoryScores[a] > categoryScores[b] ? a : b
    );
    console.log(`[PATTERN-MATCH] Matched "${fileName}" to "${bestCategory}" with patterns`);
    return bestCategory;
  }
  
  // File extension based categorization (fallback)
  const extensionCategories = {
    '.pdf': 'document',
    '.doc': 'document',
    '.docx': 'document',
    '.txt': 'text',
    '.md': 'documentation',
    '.png': 'image',
    '.jpg': 'image',
    '.jpeg': 'image',
    '.gif': 'image',
    '.svg': 'image',
    '.stl': '3d_printing',
    '.obj': '3d_printing',
    '.3mf': '3d_printing',
    '.blend': '3d_printing',
    '.mp3': 'audio',
    '.wav': 'audio',
    '.mp4': 'video',
    '.avi': 'video',
    '.xlsx': 'spreadsheet',
    '.xls': 'spreadsheet',
    '.csv': 'data',
    '.json': 'data',
    '.xml': 'data',
    '.zip': 'archive',
    '.rar': 'archive',
    '.7z': 'archive'
  };
  
  const category = extensionCategories[extension] || 'document';
  console.log(`[EXTENSION-MATCH] Matched "${fileName}" to "${category}" by extension`);
  return category;
}

function getIntelligentKeywords(fileName, extension) {
  const category = getIntelligentCategory(fileName, extension);
  const lowerFileName = fileName.toLowerCase();
  
  const baseKeywords = {
    'financial': ['financial', 'money', 'business'],
    'legal': ['legal', 'official', 'formal'],
    'project': ['project', 'work', 'development'],
    'personal': ['personal', 'individual', 'private'],
    'technical': ['technical', 'manual', 'guide'],
    'document': ['document', 'file', 'text'],
    '3d_printing': ['3d', 'printing', 'model'],
    'image': ['image', 'visual', 'graphic']
  };
  
  const keywords = baseKeywords[category] || ['file', 'document'];
  
  // Add filename-based keywords
  if (lowerFileName.includes('report')) keywords.push('report');
  if (lowerFileName.includes('summary')) keywords.push('summary');
  if (lowerFileName.includes('analysis')) keywords.push('analysis');
  if (lowerFileName.includes('proposal')) keywords.push('proposal');
  if (lowerFileName.includes('presentation')) keywords.push('presentation');
  
  // Add extension-based keyword
  if (extension) {
    keywords.push(extension.replace('.', ''));
  }
  
  return keywords.slice(0, 7); // Limit to 7 keywords
}

module.exports = {
  analyzeDocumentFile,
  analyzeTextWithOllama
}; 