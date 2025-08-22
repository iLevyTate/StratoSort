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

function buildFolderCategoriesString(smartFolders = [], contentType) {
  if (!Array.isArray(smartFolders) || smartFolders.length === 0) return '';
  const validFolders = smartFolders
    .filter((f) => f && typeof f.name === 'string' && f.name.trim().length > 0)
    .slice(0, 10)
    .map((f) => ({
      name: f.name.trim().slice(0, 50),
      description: (f.description || '').trim().slice(0, 140),
    }));
  if (validFolders.length === 0) return '';
  const folderListDetailed = validFolders
    .map(
      (f, i) =>
        `${i + 1}. "${f.name}" — ${f.description || 'no description provided'}`,
    )
    .join('\n');
  return `\n\nAVAILABLE SMART FOLDERS (name — description):\n${folderListDetailed}\n\nSELECTION RULES (CRITICAL):\n- Choose the category by comparing the ${contentType} to the folder DESCRIPTIONS above.\n- Output the category EXACTLY as one of the folder names above (verbatim).\n- Do NOT invent new categories. If unsure, choose the closest match by description or use the first folder as a fallback.`;
}

module.exports = { normalizeAnalysisResult, buildFolderCategoriesString };
