const fs = require('fs').promises;
const path = require('path');
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
  extractTextFromLargeFile,
} = require('./documentExtractors');
const { analyzeTextWithOllama } = require('./documentLlm');
const { normalizeAnalysisResult } = require('./utils');
const {
  getIntelligentCategory,
  getIntelligentKeywords,
  safeSuggestedName,
} = require('./fallbackUtils');
const EmbeddingIndexService = require('../services/EmbeddingIndexService');
const FolderMatchingService = require('../services/FolderMatchingService');

// Import error handling system
const { FileProcessingError } = require('../errors/AnalysisError');
const ModelVerifier = require('../services/ModelVerifier');

// AppConfig now provided by documentLlm.js

const modelVerifier = new ModelVerifier();
const embeddingIndex = new EmbeddingIndexService();
const folderMatcher = new FolderMatchingService(embeddingIndex);

// Import the cache service for performance optimization
const { CACHE_CONFIG } = require('../../shared/constants');

// Create a simple cache instance for analysis results
class AnalysisCache {
  constructor() {
    this.cache = new Map();
    this.cachePath = path.join(
      require('electron').app.getPath('userData'),
      'analysis-cache.json',
    );
    this.loadCache();
  }

  generateKey(filePath, contentLength) {
    const fileHash = crypto.createHash('md5').update(filePath).digest('hex');
    return `${fileHash}_${contentLength}`;
  }

  get(key) {
    if (!CACHE_CONFIG.ENABLED) return null;
    const item = this.cache.get(key);
    if (!item) return null;

    const now = Date.now();
    if (now - item.timestamp > CACHE_CONFIG.TTL.ANALYSIS) {
      this.cache.delete(key);
      return null;
    }

    return item.data;
  }

  set(key, data) {
    if (!CACHE_CONFIG.ENABLED) return;

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });

    // Enforce cache size limits
    if (this.cache.size > CACHE_CONFIG.MAX_SIZE.ANALYSIS_CACHE) {
      const oldestKey = Array.from(this.cache.keys())[0];
      this.cache.delete(oldestKey);
    }
  }

  async loadCache() {
    try {
      const data = await fs.readFile(this.cachePath, 'utf8');
      const cacheData = JSON.parse(data);
      const now = Date.now();

      for (const [key, item] of Object.entries(cacheData)) {
        if (now - item.timestamp < CACHE_CONFIG.TTL.ANALYSIS) {
          this.cache.set(key, item);
        }
      }
      console.log(
        `[ANALYSIS-CACHE] Loaded ${this.cache.size} cached analysis results`,
      );
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn('[ANALYSIS-CACHE] Failed to load cache:', error.message);
      }
    }
  }
}

const analysisCache = new AnalysisCache();

// LLM moved to documentLlm.js

// Pre-warm embeddings for a batch of files to optimize performance
async function prewarmEmbeddingsForBatch(smartFolders = []) {
  if (smartFolders && smartFolders.length > 0) {
    console.log(
      `[BATCH-OPTIMIZATION] Pre-warming embeddings for ${smartFolders.length} smart folders`,
    );
    try {
      await folderMatcher.prewarmFolderEmbeddings(smartFolders);
      console.log(`[BATCH-OPTIMIZATION] Embedding pre-warming completed`);
    } catch (error) {
      console.warn(
        `[BATCH-OPTIMIZATION] Embedding pre-warming failed:`,
        error.message,
      );
    }
  }
}

async function analyzeDocumentFile(filePath, smartFolders = []) {
  const { logger } = require('../../shared/logger');
  logger.info(`[DOC] Analyzing document file`, { path: filePath });
  const fileExtension = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath);

  // Check for cached analysis results first
  try {
    const fileStats = await fs.stat(filePath);
    const cacheKey = analysisCache.generateKey(filePath, fileStats.size);

    const cachedResult = analysisCache.get(cacheKey);
    if (cachedResult) {
      console.log(`[CACHE-HIT] Using cached analysis for ${fileName}`);
      return {
        ...cachedResult,
        fromCache: true,
        cacheHit: true,
      };
    }
  } catch (cacheError) {
    console.warn('[CACHE-CHECK] Failed to check cache:', cacheError.message);
  }

  // Pre-flight checks for AI-first operation (graceful fallback if Ollama unavailable)
  try {
    const connectionCheck = await modelVerifier.checkOllamaConnection();
    if (!connectionCheck.connected) {
      console.warn(
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
    console.error('Pre-flight verification failed:', error.message);
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

    // Check file size to determine extraction method
    const fileStats = await fs.stat(filePath);
    const fileSizeMB = fileStats.size / (1024 * 1024);
    let useStreaming = fileSizeMB > 10; // Use streaming for files > 10MB

    if (useStreaming) {
      console.log(
        `[STREAMING-MODE] Large file detected (${fileSizeMB.toFixed(1)}MB), using streaming extraction`,
      );
      try {
        extractedText = await extractTextFromLargeFile(filePath);
      } catch (streamingError) {
        console.warn(
          '[STREAMING-MODE] Streaming failed, falling back to normal extraction:',
          streamingError.message,
        );
        useStreaming = false;
      }
    }

    if (!useStreaming && fileExtension === '.pdf') {
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
          // Regular text file reading with basic format-aware cleanup (streaming for large files)
          let raw;
          if (fileSizeMB > 5) {
            // Use streaming for text files > 5MB
            console.log(
              `[STREAMING-MODE] Large text file (${fileSizeMB.toFixed(1)}MB), using streaming read`,
            );
            raw = await extractTextFromLargeFile(filePath);
          } else {
            raw = await fs.readFile(filePath, 'utf8');
          }

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
      });

      const analysis = await analyzeTextWithOllama(
        extractedText,
        fileName,
        smartFolders,
      );

      // Optimized semantic folder refinement with pre-warmed embeddings
      try {
        const fileId = `file:${filePath}`;

        // Pre-warm folder embeddings if not already done (non-blocking)
        if (smartFolders && smartFolders.length > 0) {
          folderMatcher
            .prewarmFolderEmbeddings(smartFolders)
            .catch((err) =>
              console.warn(
                '[FOLDER-PREWARM] Background pre-warming failed:',
                err.message,
              ),
            );
        }

        // Prepare file embedding content immediately after analysis
        const summaryForEmbedding = [
          analysis.project,
          analysis.purpose,
          (analysis.keywords || []).join(' '),
          extractedText.slice(0, 2000),
        ]
          .filter(Boolean)
          .join('\n');

        // Generate file embedding (folder embeddings should already be ready from pre-warming)
        await folderMatcher.upsertFileEmbedding(fileId, summaryForEmbedding, {
          path: filePath,
        });

        // Perform semantic matching
        const candidates = await folderMatcher.matchFileToFolders(fileId, 5);
        if (Array.isArray(candidates) && candidates.length > 0) {
          const top = candidates[0];
          const originalCategory = analysis.category;
          if (top.score >= 0.55) {
            analysis.category = top.name; // refine to closest folder name
            console.log(
              `[SEMANTIC-REFINEMENT] Improved category from "${originalCategory}" to "${top.name}" (score: ${top.score.toFixed(2)})`,
            );
          }
          analysis.folderMatchCandidates = candidates;
        }
      } catch (e) {
        console.warn(
          '[SEMANTIC-REFINEMENT] Failed to perform semantic refinement:',
          e.message,
        );
        // Non-fatal; continue without refinement
      }

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

        // Cache the successful analysis result
        try {
          const fileStats = await fs.stat(filePath);
          const cacheKey = analysisCache.generateKey(filePath, fileStats.size);
          analysisCache.set(cacheKey, finalResult);
          console.log(`[CACHE-STORE] Cached analysis result for ${fileName}`);
        } catch (cacheError) {
          console.warn(
            '[CACHE-STORE] Failed to cache result:',
            cacheError.message,
          );
        }

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
    logger.error(`Error processing document`, {
      path: filePath,
      error: error.message,
    });
    // Graceful fallback to filename-based analysis on any failure
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
      confidence: 60,
      suggestedName: fileName
        .replace(fileExtension, '')
        .replace(/[^a-zA-Z0-9_-]/g, '_'),
      extractionMethod: 'filename_fallback',
    };
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
  prewarmEmbeddingsForBatch,
};
