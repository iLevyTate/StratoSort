// Shared utilities for document and image analysis

// Import dependencies
const EmbeddingIndexService = require('../services/EmbeddingIndexService');
const FolderMatchingService = require('../services/FolderMatchingService');
const ModelVerifier = require('../services/ModelVerifier');

// Shared service instances for performance
let modelVerifier;
let embeddingIndex;
let folderMatcher;

// Memory management: Cache for folder embeddings to avoid repeated computation
const folderEmbeddingCache = new Map();
const MAX_CACHE_SIZE = 20; // Limit cached embeddings

// Cleanup function for memory management
function cleanupEmbeddingCache() {
  if (folderEmbeddingCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(folderEmbeddingCache.entries());
    entries.sort((a, b) => (a[1].lastUsed || 0) - (b[1].lastUsed || 0));
    const excess = folderEmbeddingCache.size - MAX_CACHE_SIZE;
    const toDeleteCount = Math.max(1, Math.min(excess, 5));
    const toDelete = entries.slice(0, toDeleteCount); // Remove oldest entries up to 5 or until within limit
    toDelete.forEach(([key]) => folderEmbeddingCache.delete(key));
  }
}

// Initialize services lazily to avoid circular dependencies
async function getSharedServices() {
  if (!modelVerifier) {
    modelVerifier = new ModelVerifier();
    embeddingIndex = new EmbeddingIndexService();
    await embeddingIndex.initialize();
    folderMatcher = new FolderMatchingService(embeddingIndex);
  }
  return { modelVerifier, embeddingIndex, folderMatcher };
}

// Cleanup function for shared services
async function cleanupSharedServices() {
  try {
    if (embeddingIndex && typeof embeddingIndex.destroy === 'function') {
      await embeddingIndex.destroy();
    }
  } catch (error) {
    console.error('[ANALYSIS-UTILS] Failed to cleanup shared services:', error);
  }
}

// Perform semantic folder matching with embeddings and caching
async function performSemanticAnalysis(
  analysis,
  fileId,
  summaryForEmbedding,
  embeddingIndex,
  folderMatcher,
  smartFolders,
  filePath,
) {
  try {
    // Guard: gracefully skip semantic refinement if shared services are unavailable
    if (!folderMatcher) {
      return analysis;
    }
    // Ensure folder embeddings exist with bounded concurrency and caching
    if (smartFolders && smartFolders.length > 0) {
      const uncachedFolders = [];
      const now = Date.now();

      // Check cache first
      for (const folder of smartFolders) {
        const cacheKey = `${folder.id}-${folder.name}`;
        const cached = folderEmbeddingCache.get(cacheKey);

        if (cached && now - cached.timestamp < 300000) {
          // 5 minutes TTL
          cached.lastUsed = now;
        } else {
          uncachedFolders.push(folder);
        }
      }

      // Process uncached folders with bounded concurrency
      if (uncachedFolders.length > 0) {
        const batchSize = 3; // Process 3 folders at a time
        for (let i = 0; i < uncachedFolders.length; i += batchSize) {
          const batch = uncachedFolders.slice(i, i + batchSize);
          await Promise.all(
            batch.map(async (f) => {
              await folderMatcher.upsertFolderEmbedding(f);
              // Cache the result
              const cacheKey = `${f.id}-${f.name}`;
              folderEmbeddingCache.set(cacheKey, {
                timestamp: Date.now(),
                lastUsed: Date.now(),
                folder: f,
              });
            }),
          );
        }

        // Cleanup old cache entries
        cleanupEmbeddingCache();
      }
    }

    // Create file embedding for semantic matching
    await folderMatcher.upsertFileEmbedding(fileId, summaryForEmbedding, {
      path: filePath,
    });

    // Find best folder matches
    const candidates = await folderMatcher.matchFileToFolders(fileId, 5);
    if (Array.isArray(candidates) && candidates.length > 0) {
      const top = candidates[0];
      if (top.score >= 0.55) {
        analysis.category = top.name; // Refine to closest folder name
      }
      analysis.folderMatchCandidates = candidates;
    }
  } catch (e) {
    // Non-fatal; continue without refinement
    console.warn(
      `[SEMANTIC] Failed to perform semantic analysis for ${fileId}:`,
      e.message,
    );
  }

  return analysis;
}

// Standardized error handling for analysis failures
function handleAnalysisError(error, context = {}) {
  const { logger } = require('../../shared/logger');

  // Log the error with context
  logger.error(`[ANALYSIS-ERROR] ${context.type || 'Unknown'} failed`, {
    error: error.message,
    path: context.filePath,
    fileName: context.fileName,
    ...context,
  });

  // Return standardized error response
  return {
    error: `Analysis failed: ${error.message}`,
    keywords: [],
    confidence: Math.max(0, (context.confidence || 60) - 20), // Reduce confidence on error
    extractionMethod: context.extractionMethod || 'error',
    category: context.fallbackCategory || 'document',
    project: context.fileName || 'unknown',
    date: new Date().toISOString().split('T')[0],
  };
}

// Validate and normalize analysis results
function validateAnalysisResult(result, defaults = {}) {
  if (!result || typeof result !== 'object') {
    return {
      error: 'Invalid analysis result structure',
      keywords: defaults.keywords || [],
      confidence: 0,
      ...defaults,
    };
  }

  // Ensure required fields exist with proper types
  const validated = {
    category:
      typeof result.category === 'string' && result.category.trim()
        ? result.category.trim()
        : defaults.category || 'document',
    keywords: Array.isArray(result.keywords)
      ? result.keywords.filter(
          (k) => typeof k === 'string' && k.trim().length > 0,
        )
      : defaults.keywords || [],
    confidence:
      typeof result.confidence === 'number' &&
      result.confidence >= 0 &&
      result.confidence <= 100
        ? result.confidence
        : defaults.confidence || 0,
    suggestedName:
      typeof result.suggestedName === 'string'
        ? result.suggestedName
        : defaults.suggestedName || null,
    extractionMethod:
      result.extractionMethod || defaults.extractionMethod || 'unknown',
  };

  // Add optional fields if they exist and are valid
  if (typeof result.project === 'string') validated.project = result.project;
  if (typeof result.purpose === 'string') validated.purpose = result.purpose;
  if (typeof result.date === 'string' || result.date instanceof Date) {
    validated.date =
      typeof result.date === 'string'
        ? result.date
        : result.date.toISOString().split('T')[0];
  }

  // Return only validated fields to avoid including unexpected/unwanted data from result
  return validated;
}

// Memory usage monitoring for analysis processes
function getMemoryUsage() {
  const usage = process.memoryUsage();
  return {
    rss: Math.round(usage.rss / 1024 / 1024), // MB
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
    external: Math.round(usage.external / 1024 / 1024), // MB
    percentage: Math.round((usage.heapUsed / usage.heapTotal) * 100),
  };
}

// Check if system resources are under pressure
function isResourceConstrained() {
  // Prefer exported getter if tests/mock replaced it; fall back to local function
  const memGetter =
    (module.exports && module.exports.getMemoryUsage) || getMemoryUsage;
  const mem = memGetter();
  // mem.rss may be in bytes or MB depending on caller; normalize to MB
  let rssMB = Number(mem.rss) || 0;
  if (rssMB > 1024 * 1024) {
    // likely bytes -> convert to MB
    rssMB = Math.round(rssMB / 1024 / 1024);
  }
  return mem.percentage > 85 || rssMB > 2048; // Over 85% heap usage or 2GB RSS
}

// Async delay utility for rate limiting
function delay(ms) {
  if (!ms || ms <= 0) {
    // Prefer setImmediate for zero-delay to yield to the event loop quickly
    return new Promise((resolve) => {
      if (typeof setImmediate === 'function') return setImmediate(resolve);
      return setTimeout(resolve, 0);
    });
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Batch processing helper with concurrency control
async function processBatch(items, processor, options = {}) {
  const { concurrency = 3, delayMs = 100, onProgress = null } = options;

  const results = [];
  const batches = [];

  // Split into batches
  for (let i = 0; i < items.length; i += concurrency) {
    batches.push(items.slice(i, i + concurrency));
  }

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchPromises = batch.map(processor);

    const batchResults = await Promise.allSettled(batchPromises);
    results.push(...batchResults);

    if (onProgress) {
      onProgress(i + 1, batches.length, results.length);
    }

    // Small delay between batches to prevent overwhelming the system
    if (i < batches.length - 1 && delayMs > 0) {
      await delay(delayMs);
    }
  }

  return results;
}

module.exports = {
  getSharedServices,
  performSemanticAnalysis,
  handleAnalysisError,
  validateAnalysisResult,
  cleanupSharedServices,
  // Utility functions for memory management and batch processing
  getMemoryUsage,
  isResourceConstrained,
  delay,
  processBatch,
};
