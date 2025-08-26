const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../../shared/logger');
const {
  SUPPORTED_TEXT_EXTENSIONS,
  SUPPORTED_DOCUMENT_EXTENSIONS,
  SUPPORTED_ARCHIVE_EXTENSIONS,
} = require('../../shared/constants');

// Enforce required dependency for AI-first operation
const {
  extractTextFromPdf,
  ocrPdfIfNeeded,
  extractTextFromDoc,
  extractTextFromDocx,
  extractTextFromXlsx,
  extractTextFromPptx,
  extractTextFromXls,
  extractTextFromPpt,
  extractTextFromOdfZip,
  extractTextFromEpub,
  extractTextFromEml,
  extractTextFromMsg,
  extractTextFromKml,
  extractTextFromKmz,
  extractPlainTextFromRtf,
  extractPlainTextFromHtml,
} = require('./documentExtractors');
const { analyzeTextWithOllama } = require('./documentLlm');
const { normalizeAnalysisResult } = require('./utils');
const {
  getIntelligentCategory,
  getIntelligentKeywords,
  safeSuggestedName,
} = require('./fallbackUtils');
// Note: Service imports moved to analysisUtils.js to avoid circular dependencies

// Import shared analysis utilities
const {
  getSharedServices,
  performSemanticAnalysis,
  handleAnalysisError,
  validateAnalysisResult,
} = require('./analysisUtils');

// Import error handling system
const { FileProcessingError } = require('../errors/AnalysisError');

// AppConfig now provided by documentLlm.js

// Analysis queue and processing state
const analysisQueue = [];
const isProcessing = { value: false };

// Circuit breaker for LLM service resilience
// Protects against cascading failures with configurable thresholds
const circuitBreaker = {
  failures: 0,
  lastFailureTime: 0,
  failureThreshold: 3,
  recoveryTimeout: 30000, // 30 seconds
  state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN

  async call(serviceCall) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.recoveryTimeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error(
          'Circuit breaker is OPEN - service temporarily unavailable',
        );
      }
    }

    try {
      const result = await serviceCall();
      if (this.state === 'HALF_OPEN') {
        this.reset();
      }
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  },

  recordFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  },

  reset() {
    this.failures = 0;
    this.state = 'CLOSED';
  },
};

// Optimized cache system with simplified memory management
const analysisCache = new Map();
const cacheStats = {
  hits: 0,
  misses: 0,
  evictions: 0,
  maxSize: 200, // Reduced from 500 for better performance
};

// Simplified TTL - 4 hours for all files (reduced complexity)
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

// Get file modification time for cache validation
async function getFileCacheKey(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return `${filePath}:${stats.mtime.getTime()}:${stats.size}`;
  } catch {
    return `${filePath}:${Date.now()}`;
  }
}

// Check if cached result is still valid - simplified
function isCacheValid(cachedResult) {
  return Date.now() - cachedResult.timestamp < CACHE_TTL;
}

// Simplified cache management - LRU eviction
function manageCacheSize() {
  if (analysisCache.size > cacheStats.maxSize) {
    // Remove oldest entries (LRU-like behavior)
    const entries = Array.from(analysisCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

    // Remove 30% oldest entries
    const toRemove = Math.ceil(analysisCache.size * 0.3);
    for (let i = 0; i < toRemove; i++) {
      if (entries[i]) {
        analysisCache.delete(entries[i][0]);
        cacheStats.evictions++;
      }
    }
  }
}

// Note: getSharedServices is now imported from analysisUtils.js

// Reduced concurrency for better performance and stability
const MAX_CONCURRENT_ANALYSIS = 2;
let activeAnalysisCount = 0;

async function processAnalysisQueue() {
  if (isProcessing.value || analysisQueue.length === 0) return;

  isProcessing.value = true;

  while (
    analysisQueue.length > 0 &&
    activeAnalysisCount < MAX_CONCURRENT_ANALYSIS
  ) {
    const { filePath, smartFolders, resolve, reject } = analysisQueue.shift();
    activeAnalysisCount++;

    // Process analysis in background
    analyzeDocumentFile(filePath, smartFolders)
      .then(resolve)
      .catch(reject)
      .finally(() => {
        activeAnalysisCount--;
        // Continue processing queue
        setImmediate(() => processAnalysisQueue());
      });
  }

  isProcessing.value = false;
}

// LLM moved to documentLlm.js

// Content optimization functions - reduced for performance
function optimizeContentForAnalysis(textContent, maxLength = 8000) {
  if (!textContent || textContent.length <= maxLength) {
    return textContent;
  }

  // Early return for very short content
  if (textContent.length < 100) {
    return textContent;
  }

  // Smart chunking: prioritize beginning, middle, and end of document
  const chunkSize = Math.floor(maxLength / 3);
  const start = textContent.slice(0, chunkSize);
  const middle = textContent.slice(
    Math.floor(textContent.length / 2 - chunkSize / 2),
    Math.floor(textContent.length / 2 + chunkSize / 2),
  );
  const end = textContent.slice(-chunkSize);

  return `${start}\n\n[...content optimized for analysis...]\n\n${middle}\n\n[...content optimized for analysis...]\n\n${end}`;
}

function extractKeySections(textContent, maxLength = 8000) {
  if (!textContent || textContent.length <= maxLength) {
    return textContent;
  }

  // Extract title, headers, and first/last paragraphs
  const lines = textContent.split('\n');
  const keySections = [];

  for (const line of lines) {
    // Prioritize headers and titles
    if (
      line.match(/^#{1,6}\s/) ||
      line.match(/^[A-Z][A-Z\s]{2,}$/) ||
      line.length < 100
    ) {
      keySections.push(line);
    }
  }

  // Add first and last paragraphs
  const firstParagraph = lines.slice(0, 5).join('\n');
  const lastParagraph = lines.slice(-5).join('\n');

  keySections.unshift(firstParagraph);
  keySections.push(lastParagraph);

  return keySections.join('\n\n').slice(0, maxLength);
}

// Stream large documents in chunks to prevent memory issues
async function streamAnalyzeLargeDocument(
  textContent,
  originalFileName,
  smartFolders = [],
) {
  logger.info(`[STREAMING] Processing large document in chunks`, {
    totalLength: textContent.length,
    fileName: originalFileName,
  });

  // Split content into smaller chunks for better performance
  const chunkSize = 6000;
  const overlap = 300;
  const chunks = [];

  for (let i = 0; i < textContent.length; i += chunkSize - overlap) {
    const chunk = textContent.slice(i, i + chunkSize);
    if (chunk.trim().length > 100) {
      // Only include meaningful chunks
      chunks.push({
        content: chunk,
        start: i,
        end: Math.min(i + chunkSize, textContent.length),
      });
    }
  }

  logger.debug(`[STREAMING] Split into ${chunks.length} chunks`);

  // Analyze first chunk for main metadata
  const firstChunk = chunks[0];
  const firstAnalysis = await circuitBreaker.call(async () =>
    analyzeTextWithOllama(firstChunk.content, originalFileName, smartFolders),
  );

  // If only one chunk, return the analysis
  if (chunks.length === 1) {
    return firstAnalysis;
  }

  // Analyze additional chunks for keywords and context
  const additionalKeywords = new Set();
  const additionalContext = [];

  for (let i = 1; i < Math.min(chunks.length, 3); i++) {
    // Limit to first 3 chunks
    try {
      const chunkAnalysis = await circuitBreaker.call(async () =>
        analyzeTextWithOllama(
          chunks[i].content,
          `${originalFileName}_chunk_${i}`,
          smartFolders,
        ),
      );

      if (chunkAnalysis.keywords && Array.isArray(chunkAnalysis.keywords)) {
        chunkAnalysis.keywords.forEach((keyword) =>
          additionalKeywords.add(keyword),
        );
      }

      if (chunkAnalysis.purpose) {
        additionalContext.push(chunkAnalysis.purpose);
      }
    } catch (error) {
      logger.warn(`[STREAMING] Failed to analyze chunk ${i}:`, error.message);
    }
  }

  // Merge results from streaming analysis
  const mergedKeywords = [
    ...(firstAnalysis.keywords || []),
    ...Array.from(additionalKeywords),
  ].slice(0, 7); // Limit to 7 keywords total

  const enhancedPurpose = firstAnalysis.purpose;
  if (additionalContext.length > 0) {
    // Enhance purpose with additional context if it provides new information
    const contextSummary = additionalContext.slice(0, 2).join('; ');
    if (
      contextSummary.length > 0 &&
      !enhancedPurpose.includes(contextSummary)
    ) {
      firstAnalysis.purpose = `${enhancedPurpose}; Additional context: ${contextSummary}`;
    }
  }

  return {
    ...firstAnalysis,
    keywords: mergedKeywords,
    streamingInfo: {
      totalChunks: chunks.length,
      chunksAnalyzed: Math.min(chunks.length, 3),
      totalLength: textContent.length,
    },
  };
}

// Public function for queued analysis
async function queueDocumentAnalysis(filePath, smartFolders = []) {
  return new Promise((resolve, reject) => {
    analysisQueue.push({ filePath, smartFolders, resolve, reject });
    processAnalysisQueue();
  });
}

async function analyzeDocumentFile(filePath, smartFolders = []) {
  logger.info(`[DOC] Analyzing document file`, { path: filePath });
  const fileExtension = path.extname(filePath).toLowerCase();

  // Check cache first with memory awareness
  const stats = await fs.stat(filePath);
  const cacheKey = await getFileCacheKey(filePath);
  const cachedResult = analysisCache.get(cacheKey);

  if (cachedResult && isCacheValid(cachedResult)) {
    cacheStats.hits++;
    logger.info(`[CACHE] Hit - using cached analysis result`, {
      path: filePath,
      cacheAge: Date.now() - cachedResult.timestamp,
      hits: cacheStats.hits,
      misses: cacheStats.misses,
    });
    return cachedResult.data;
  }

  cacheStats.misses++;
  logger.debug(`[CACHE] Miss - analyzing fresh`, {
    hits: cacheStats.hits,
    misses: cacheStats.misses,
    hitRate:
      ((cacheStats.hits / (cacheStats.hits + cacheStats.misses)) * 100).toFixed(
        1,
      ) + '%',
  });

  // Get shared services for better performance
  const { modelVerifier, embeddingIndex, folderMatcher } =
    await getSharedServices();
  const fileName = path.basename(filePath);

  // Pre-flight checks for AI-first operation (graceful fallback if Ollama unavailable)
  try {
    const connectionCheck = await modelVerifier.checkOllamaConnection();
    if (!connectionCheck.connected) {
      logger.warn(
        `[ANALYSIS-FALLBACK] Ollama unavailable (${connectionCheck.error}). Using filename-based analysis for ${fileName}.`,
      );
      const intelligentCategory = getIntelligentCategory(
        fileName,
        fileExtension,
        smartFolders,
      );
      const intelligentKeywords = getIntelligentKeywords(
        fileName,
        fileExtension,
      );
      return {
        purpose: `${intelligentCategory.charAt(0).toUpperCase() + intelligentCategory.slice(1)} document (fallback)`,
        project: fileName.replace(fileExtension, ''),
        category: intelligentCategory,
        date: new Date().toISOString().split('T')[0],
        keywords: intelligentKeywords,
        confidence: 65,
        suggestedName: safeSuggestedName(fileName, fileExtension),
        extractionMethod: 'filename_fallback',
      };
    }
  } catch (error) {
    logger.error(
      `Pre-flight verification failed for ${fileName}: ${error.message}`,
    );
    const intelligentCategory = getIntelligentCategory(
      fileName,
      fileExtension,
      smartFolders,
    );
    const intelligentKeywords = getIntelligentKeywords(fileName, fileExtension);
    return {
      purpose: `${intelligentCategory.charAt(0).toUpperCase() + intelligentCategory.slice(1)} document (fallback)`,
      project: fileName.replace(fileExtension, ''),
      category: intelligentCategory,
      date: new Date().toISOString().split('T')[0],
      keywords: intelligentKeywords,
      confidence: 65,
      suggestedName: safeSuggestedName(fileName, fileExtension),
      extractionMethod: 'filename_fallback',
    };
  }

  try {
    let extractedText = null;

    if (fileExtension === '.pdf') {
      try {
        extractedText = await extractTextFromPdf(filePath, fileName);
        if (!extractedText || extractedText.trim().length === 0) {
          // Try OCR fallback for image-only PDFs
          const ocrText = await ocrPdfIfNeeded(filePath);
          extractedText = ocrText || '';
        }
      } catch (pdfError) {
        logger.error(`Error parsing PDF`, {
          fileName,
          error: pdfError.message,
        });
        // Attempt OCR fallback before giving up
        try {
          const ocrText = await ocrPdfIfNeeded(filePath);
          if (ocrText && ocrText.trim().length > 0) {
            extractedText = ocrText;
          } else {
            throw new FileProcessingError('PDF_PROCESSING_FAILURE', fileName, {
              originalError: pdfError.message,
              suggestion:
                'PDF may be corrupted, password-protected, or image-based',
            });
          }
        } catch (ocrErr) {
          throw new FileProcessingError('PDF_PROCESSING_FAILURE', fileName, {
            originalError: pdfError.message,
            suggestion:
              'PDF may be corrupted, password-protected, or image-based',
          });
        }
      }
    } else if ([...SUPPORTED_TEXT_EXTENSIONS, '.doc'].includes(fileExtension)) {
      // Read text files directly
      try {
        if (fileExtension === '.doc') {
          extractedText = await extractTextFromDoc(filePath);
        } else {
          // Regular text file reading with basic format-aware cleanup
          const raw = await fs.readFile(filePath, 'utf8');
          if (fileExtension === '.rtf') {
            extractedText = extractPlainTextFromRtf(raw);
          } else if (
            fileExtension === '.html' ||
            fileExtension === '.htm' ||
            fileExtension === '.xml'
          ) {
            extractedText = extractPlainTextFromHtml(raw);
          } else {
            extractedText = raw;
          }
        }

        if (!extractedText || extractedText.trim().length === 0) {
          throw new FileProcessingError('FILE_EMPTY', fileName, {
            suggestion: 'File appears to be empty or unreadable',
          });
        }

        logger.debug(`Extracted characters from text file`, {
          fileName,
          length: extractedText.length,
        });
      } catch (textError) {
        logger.error(`Error reading text file`, {
          fileName,
          error: textError.message,
        });
        throw new FileProcessingError('DOCUMENT_ANALYSIS_FAILURE', fileName, {
          originalError: textError.message,
          suggestion: 'File may be corrupted or access denied',
        });
      }
    } else if (SUPPORTED_DOCUMENT_EXTENSIONS.includes(fileExtension)) {
      // Extract content from extended document set
      try {
        logger.info(`Extracting content from document`, {
          fileName,
          fileExtension,
        });

        if (fileExtension === '.docx') {
          extractedText = await extractTextFromDocx(filePath);
        } else if (fileExtension === '.xlsx') {
          extractedText = await extractTextFromXlsx(filePath);
        } else if (fileExtension === '.pptx') {
          extractedText = await extractTextFromPptx(filePath);
        } else if (fileExtension === '.xls') {
          extractedText = await extractTextFromXls(filePath);
        } else if (fileExtension === '.ppt') {
          extractedText = await extractTextFromPpt(filePath);
        } else if (
          fileExtension === '.odt' ||
          fileExtension === '.ods' ||
          fileExtension === '.odp'
        ) {
          extractedText = await extractTextFromOdfZip(filePath);
        } else if (fileExtension === '.epub') {
          extractedText = await extractTextFromEpub(filePath);
        } else if (fileExtension === '.eml') {
          extractedText = await extractTextFromEml(filePath);
        } else if (fileExtension === '.msg') {
          extractedText = await extractTextFromMsg(filePath);
        } else if (fileExtension === '.kml') {
          extractedText = await extractTextFromKml(filePath);
        } else if (fileExtension === '.kmz') {
          extractedText = await extractTextFromKmz(filePath);
        }

        logger.debug(`Extracted characters from office document`, {
          fileName,
          length: extractedText.length,
        });
      } catch (officeError) {
        logger.error(`Error extracting office content`, {
          fileName,
          error: officeError.message,
        });

        // Fall back to intelligent filename-based analysis
        const intelligentCategory = getIntelligentCategory(
          fileName,
          fileExtension,
          smartFolders,
        );
        const intelligentKeywords = getIntelligentKeywords(
          fileName,
          fileExtension,
        );

        let purpose = 'Office document (content extraction failed)';
        const confidence = 70;

        if (fileExtension === '.docx') {
          purpose =
            'Word document - content extraction failed, using filename analysis';
        } else if (fileExtension === '.xlsx') {
          purpose =
            'Excel spreadsheet - content extraction failed, using filename analysis';
        } else if (fileExtension === '.pptx') {
          purpose =
            'PowerPoint presentation - content extraction failed, using filename analysis';
        }

        return {
          purpose,
          project: fileName.replace(fileExtension, ''),
          category: intelligentCategory,
          date: new Date().toISOString().split('T')[0],
          keywords: intelligentKeywords,
          confidence,
          suggestedName: safeSuggestedName(fileName, fileExtension),
          extractionError: officeError.message,
        };
      }
    } else if (SUPPORTED_ARCHIVE_EXTENSIONS.includes(fileExtension)) {
      // Archive metadata inspection (best-effort)
      const archiveInfo = await tryExtractArchiveMetadata(filePath);
      const keywords =
        archiveInfo.keywords?.slice(0, 7) ||
        getIntelligentKeywords(fileName, fileExtension);
      const category = 'archive';
      return {
        purpose: archiveInfo.summary || 'Archive file',
        project: fileName.replace(fileExtension, ''),
        category,
        date: new Date().toISOString().split('T')[0],
        keywords,
        confidence: 70,
        suggestedName: safeSuggestedName(fileName, fileExtension),
        extractionMethod: 'archive',
      };
    } else {
      // Placeholder for other document types
      logger.warn(`[FILENAME-FALLBACK] No content parser`, {
        extension: fileExtension,
        fileName,
      });

      // Intelligent category detection based on filename and extension
      const intelligentCategory = getIntelligentCategory(
        fileName,
        fileExtension,
        smartFolders,
      );
      const intelligentKeywords = getIntelligentKeywords(
        fileName,
        fileExtension,
      );

      return {
        purpose: `${intelligentCategory.charAt(0).toUpperCase() + intelligentCategory.slice(1)} document`,
        project: fileName.replace(fileExtension, ''),
        category: intelligentCategory,
        date: new Date().toISOString().split('T')[0],
        keywords: intelligentKeywords,
        confidence: 75, // Higher confidence for pattern-based detection
        suggestedName: safeSuggestedName(fileName, fileExtension),
        extractionMethod: 'filename', // Mark that this used filename-only analysis
      };
    }

    // If PDF had no extractable text, attempt OCR on a rasterized page
    if (
      fileExtension === '.pdf' &&
      (!extractedText || extractedText.trim().length === 0)
    ) {
      const ocrText = await ocrPdfIfNeeded(filePath);
      if (ocrText) extractedText = ocrText;
    }

    if (extractedText && extractedText.trim().length > 0) {
      logger.info(`[CONTENT-ANALYSIS] Processing`, {
        fileName,
        extractedChars: extractedText.length,
      });
      logger.debug(`[CONTENT-PREVIEW]`, {
        preview: extractedText.substring(0, 200),
        originalLength: extractedText.length,
      });

      // Stream large documents to prevent memory issues - lower threshold for performance
      let analysis;
      if (extractedText.length > 12000) {
        logger.info(
          `[STREAMING] Large document detected, using streaming analysis`,
        );
        analysis = await circuitBreaker.call(async () =>
          streamAnalyzeLargeDocument(extractedText, fileName, smartFolders),
        );
      } else {
        // Optimize content for analysis to improve performance
        const optimizedText =
          extractedText.length > 8000
            ? optimizeContentForAnalysis(extractedText, 12000)
            : extractedText;

        logger.debug(`[CONTENT-OPTIMIZATION]`, {
          originalLength: extractedText.length,
          optimizedLength: optimizedText.length,
          wasOptimized: optimizedText !== extractedText,
        });

        analysis = await circuitBreaker.call(async () =>
          analyzeTextWithOllama(optimizedText, fileName, smartFolders),
        );
      }

      // Attempt semantic folder refinement using shared utilities
      const fileId = `file:${filePath}`;
      const summaryForEmbedding = [
        analysis.project,
        analysis.purpose,
        (analysis.keywords || []).join(' '),
        extractedText.slice(0, 2000),
      ]
        .filter(Boolean)
        .join('\n');

      analysis = await performSemanticAnalysis(
        analysis,
        fileId,
        summaryForEmbedding,
        embeddingIndex,
        folderMatcher,
        smartFolders,
        filePath,
      );

      if (analysis && !analysis.error) {
        logger.info(`[AI-ANALYSIS-SUCCESS]`, {
          fileName,
          category: analysis.category,
          keywords: analysis.keywords,
        });
        const finalResult = normalizeAnalysisResult(
          {
            ...analysis,
            contentLength: extractedText.length,
            extractionMethod: 'content',
          },
          { category: 'document', keywords: [], confidence: 0 },
        );

        // Cache successful analysis result - simplified
        analysisCache.set(cacheKey, {
          data: finalResult,
          timestamp: Date.now(),
        });

        // Simple cache management
        manageCacheSize();

        return finalResult;
      }

      logger.warn(
        `[AI-ANALYSIS-FAILED] Content extracted but AI analysis failed`,
        { fileName },
      );
      return normalizeAnalysisResult(
        {
          rawText: extractedText.substring(0, 500),
          keywords: Array.isArray(analysis.keywords)
            ? analysis.keywords
            : ['document', 'analysis_failed'],
          purpose: 'Text extracted, but Ollama analysis failed.',
          project: fileName,
          date: new Date().toISOString().split('T')[0],
          category: 'document',
          confidence: 60,
          error:
            analysis?.error || 'Ollama analysis failed for document content.',
          contentLength: extractedText.length,
          extractionMethod: 'content',
        },
        { category: 'document', keywords: [], confidence: 60 },
      );
    }

    logger.error(`[EXTRACTION-FAILED] Could not extract any text content`, {
      fileName,
    });
    return {
      error: 'Could not extract text or analyze document.',
      project: fileName,
      category: 'document',
      date: new Date().toISOString().split('T')[0],
      keywords: [],
      confidence: 50,
      extractionMethod: 'failed',
    };
  } catch (error) {
    return handleAnalysisError(error, {
      type: 'Document Analysis',
      filePath,
      fileName,
      extractionMethod: 'error_fallback',
      fallbackCategory: 'document',
      confidence: 50,
    });
  }
}

// Text normalization helpers moved to documentExtractors

// Best-effort archive metadata extraction (ZIP only without external deps)
async function tryExtractArchiveMetadata(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const info = { keywords: [], summary: '' };
  if (ext === '.zip') {
    try {
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(filePath);
      const entries = zip.getEntries().slice(0, 50);
      const names = entries.map((e) => e.entryName);
      info.keywords = deriveKeywordsFromFilenames(names);
      info.summary = `ZIP archive with ${zip.getEntries().length} entries`;
      return info;
    } catch (e) {
      info.summary = 'ZIP archive (content listing unavailable)';
      info.keywords = [];
      return info;
    }
  }
  info.summary = `${ext.substring(1).toUpperCase()} archive`;
  info.keywords = [];
  return info;
}

function deriveKeywordsFromFilenames(names) {
  const exts = {};
  const tokens = new Set();
  names.forEach((n) => {
    const b = n.split('/').pop();
    const e = (b.includes('.') ? b.split('.').pop() : '').toLowerCase();
    if (e) exts[e] = (exts[e] || 0) + 1;
    b.replace(/[^a-zA-Z0-9]+/g, ' ')
      .toLowerCase()
      .split(' ')
      .forEach((w) => {
        if (w && w.length > 2 && w.length < 20) tokens.add(w);
      });
  });
  const topExts = Object.entries(exts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);
  return [...topExts, ...Array.from(tokens)].slice(0, 15);
}

// Fallback helpers removed; sourced from fallbackUtils

module.exports = {
  analyzeDocumentFile,
  queueDocumentAnalysis,
  getSharedServices,
};
