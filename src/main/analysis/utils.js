function normalizeAnalysisResult(raw, fallback = {}) {
  const result = raw && typeof raw === 'object' ? { ...raw } : {};
  const normalized = {
    category:
      typeof result.category === 'string' && result.category.trim()
        ? result.category
        : fallback.category || 'document',
    keywords: Array.isArray(result.keywords)
      ? result.keywords
      : fallback.keywords || [],
    confidence:
      typeof result.confidence === 'number'
        ? result.confidence
        : fallback.confidence || 0,
    suggestedName:
      typeof result.suggestedName === 'string'
        ? result.suggestedName
        : fallback.suggestedName || null,
    extractionMethod:
      result.extractionMethod || fallback.extractionMethod || null,
    contentLength:
      typeof result.contentLength === 'number'
        ? result.contentLength
        : fallback.contentLength || null,
  };
  return { ...result, ...normalized };
}

module.exports = { normalizeAnalysisResult };
