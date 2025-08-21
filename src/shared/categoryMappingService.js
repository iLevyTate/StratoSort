// Centralized Category-to-Smart-Folder Mapping Service
// Ensures consistent category-destination mapping across all phases

class CategoryMappingService {
  constructor() {
    this.folderCache = new Map();
    this.smartFolders = [];
  }

  /**
   * Initialize or update the service with current smart folders
   */
  updateSmartFolders(smartFolders = []) {
    this.smartFolders = smartFolders.filter(
      (f) =>
        f && f.name && typeof f.name === 'string' && f.name.trim().length > 0,
    );
    this.folderCache.clear();
  }

  /**
   * Get the best smart folder match for a category
   * Returns the folder object or null if no match
   */
  findSmartFolderForCategory(category) {
    if (!category) return null;

    // Check cache first
    if (this.folderCache.has(category)) {
      return this.folderCache.get(category);
    }

    const normalizedCategory = category.toLowerCase().trim();

    // Try exact match first
    let folder = this.smartFolders.find(
      (f) => f?.name?.toLowerCase()?.trim() === normalizedCategory,
    );

    if (folder) {
      this.folderCache.set(category, folder);
      return folder;
    }

    // Try variants
    const variants = [
      normalizedCategory,
      normalizedCategory.replace(/s$/, ''), // Remove plural 's'
      normalizedCategory + 's', // Add plural 's'
      normalizedCategory.replace(/\s+/g, ''), // Remove spaces
      normalizedCategory.replace(/\s+/g, '-'), // Spaces to hyphens
      normalizedCategory.replace(/\s+/g, '_'), // Spaces to underscores
      normalizedCategory.replace(/[-_]/g, ' '), // Hyphens/underscores to spaces
    ];

    for (const variant of variants) {
      folder = this.smartFolders.find((f) => {
        const folderName = f.name.toLowerCase().trim();
        return (
          folderName === variant ||
          folderName.replace(/\s+/g, '') === variant ||
          folderName.replace(/\s+/g, '-') === variant ||
          folderName.replace(/\s+/g, '_') === variant ||
          folderName.replace(/[-_]/g, ' ') === variant
        );
      });

      if (folder) {
        this.folderCache.set(category, folder);
        return folder;
      }
    }

    // No match found
    this.folderCache.set(category, null);
    return null;
  }

  /**
   * Get the destination path for a category
   */
  getDestinationPath(category, defaultLocation) {
    const smartFolder = this.findSmartFolderForCategory(category);

    if (smartFolder) {
      return smartFolder.path || `${defaultLocation}/${smartFolder.name}`;
    }

    // Fallback to category-based path if no smart folder found
    return `${defaultLocation}/${category || 'Uncategorized'}`;
  }

  /**
   * Get valid categories from available smart folders
   * This should be used during analysis to ensure categories match existing folders
   */
  getValidCategories() {
    return this.smartFolders.map((f) => f.name);
  }

  /**
   * Find the best matching category from available smart folders
   * Used during analysis to ensure the returned category has a valid destination
   */
  findBestCategoryMatch(suggestedCategory, analysisContext = {}) {
    if (!suggestedCategory) {
      return this.getDefaultCategory();
    }

    // First try direct mapping
    const directMatch = this.findSmartFolderForCategory(suggestedCategory);
    if (directMatch) {
      return directMatch.name;
    }

    // Try semantic matching based on folder descriptions
    const normalizedSuggestion = suggestedCategory.toLowerCase().trim();

    let bestMatch = null;
    let bestScore = 0;

    for (const folder of this.smartFolders) {
      let score = 0;
      const folderNameLower = folder.name.toLowerCase();

      // Name similarity
      if (
        folderNameLower.includes(normalizedSuggestion) ||
        normalizedSuggestion.includes(folderNameLower)
      ) {
        score += 10;
      }

      // Check folder words
      const folderWords = folderNameLower
        .split(/[\s_-]+/)
        .filter((w) => w.length > 2);

      for (const word of folderWords) {
        if (normalizedSuggestion.includes(word)) {
          score += 8;
        }
      }

      // Check description if available
      if (folder.description) {
        const descWords = folder.description
          .toLowerCase()
          .split(/[\s,.-]+/)
          .filter((w) => w.length > 3);

        for (const word of descWords) {
          if (normalizedSuggestion.includes(word)) {
            score += 6;
          }
        }
      }

      // Check semantic tags and keywords
      if (Array.isArray(folder.semanticTags)) {
        for (const tag of folder.semanticTags) {
          if (normalizedSuggestion.includes(String(tag).toLowerCase())) {
            score += 5;
          }
        }
      }

      if (Array.isArray(folder.keywords)) {
        for (const keyword of folder.keywords) {
          if (normalizedSuggestion.includes(String(keyword).toLowerCase())) {
            score += 4;
          }
        }
      }

      // Update best match if this score is higher
      if (score > bestScore) {
        bestScore = score;
        bestMatch = folder;
      }
    }

    // Return best match if score is sufficient, otherwise use default
    if (bestMatch && bestScore >= 4) {
      return bestMatch.name;
    }

    return this.getDefaultCategory();
  }

  /**
   * Get default category when no match is found
   */
  getDefaultCategory() {
    if (this.smartFolders.length === 0) {
      return 'Uncategorized';
    }

    // Try to find a generic folder
    const genericNames = [
      'General',
      'Documents',
      'Files',
      'Misc',
      'Other',
      'Uncategorized',
    ];

    for (const genericName of genericNames) {
      const match = this.smartFolders.find(
        (f) => f.name.toLowerCase().trim() === genericName.toLowerCase(),
      );
      if (match) {
        return match.name;
      }
    }

    // Return first available folder as last resort
    return this.smartFolders[0].name;
  }

  /**
   * Validate that all files have valid category mappings
   */
  validateCategories(files) {
    const invalidFiles = [];

    for (const file of files) {
      const category = file.analysis?.category;
      if (category) {
        const smartFolder = this.findSmartFolderForCategory(category);
        if (!smartFolder) {
          invalidFiles.push({
            file,
            category,
            suggestedCategory: this.findBestCategoryMatch(category),
          });
        }
      }
    }

    return {
      isValid: invalidFiles.length === 0,
      invalidFiles,
    };
  }

  /**
   * Fix invalid categories in files
   */
  fixInvalidCategories(files) {
    const fixedFiles = files.map((file) => {
      if (file.analysis?.category) {
        const validCategory = this.findBestCategoryMatch(
          file.analysis.category,
        );
        if (validCategory !== file.analysis.category) {
          return {
            ...file,
            analysis: {
              ...file.analysis,
              category: validCategory,
              originalCategory: file.analysis.category, // Keep track of original
            },
          };
        }
      }
      return file;
    });

    return fixedFiles;
  }

  /**
   * Get folder mapping statistics
   */
  getStats() {
    return {
      totalSmartFolders: this.smartFolders.length,
      cachedMappings: this.folderCache.size,
      availableCategories: this.getValidCategories(),
    };
  }
}

// Export singleton instance
const categoryMappingService = new CategoryMappingService();

module.exports = {
  CategoryMappingService,
  categoryMappingService,
};
