const { logger } = require('../../shared/logger');
const path = require('path');
const {
  getOllama,
  getOllamaModel,
  buildOllamaOptions,
} = require('../ollamaUtils');

class OrganizationSuggestionService {
  constructor({ embeddingService, folderMatchingService, settingsService }) {
    this.embeddingService = embeddingService;
    this.folderMatcher = folderMatchingService;
    this.settings = settingsService;

    // Organization strategy templates
    this.strategies = {
      'project-based': {
        name: 'Project-Based',
        description: 'Organize files by project or client',
        pattern: 'Projects/{project_name}/{file_type}',
        priority: ['project', 'client', 'task'],
      },
      'date-based': {
        name: 'Date-Based',
        description: 'Organize files chronologically',
        pattern: 'Archive/{year}/{month}/{category}',
        priority: ['date', 'time_period', 'category'],
      },
      'type-based': {
        name: 'Type-Based',
        description: 'Organize by file type and purpose',
        pattern: '{file_type}/{subcategory}/{project}',
        priority: ['file_type', 'purpose', 'format'],
      },
      'workflow-based': {
        name: 'Workflow-Based',
        description: 'Organize by workflow stage',
        pattern: 'Workflow/{stage}/{project}/{file_type}',
        priority: ['stage', 'status', 'version'],
      },
      hierarchical: {
        name: 'Hierarchical',
        description: 'Multi-level categorization',
        pattern: '{main_category}/{subcategory}/{specific_folder}',
        priority: ['category', 'subcategory', 'tags'],
      },
    };

    // Track user preferences and patterns
    this.userPatterns = new Map();
    this.feedbackHistory = [];
    this.folderUsageStats = new Map();
  }

  /**
   * Get organization suggestions for a single file
   */
  async getSuggestionsForFile(file, smartFolders = [], options = {}) {
    try {
      const suggestions = [];

      // Ensure smart folders have embeddings for semantic matching
      if (smartFolders && smartFolders.length > 0) {
        await this.ensureSmartFolderEmbeddings(smartFolders);
      }

      // 1. Get semantic folder matches from existing smart folders
      const semanticMatches = await this.getSemanticFolderMatches(
        file,
        smartFolders,
      );

      // 2. Get strategy-based suggestions
      const strategyMatches = await this.getStrategyBasedSuggestions(
        file,
        smartFolders,
      );

      // 3. Get pattern-based suggestions from user history
      const patternMatches = this.getPatternBasedSuggestions(
        file,
        smartFolders,
      );

      // 4. Get LLM-powered alternative suggestions
      const llmSuggestions = await this.getLLMAlternativeSuggestions(
        file,
        smartFolders,
      );

      // 5. Get improvement suggestions for existing folders
      const improvementSuggestions = await this.getImprovementSuggestions(
        file,
        smartFolders,
      );

      // Combine and rank all suggestions
      const allSuggestions = [
        ...semanticMatches.map((s) => ({ ...s, source: 'semantic' })),
        ...strategyMatches.map((s) => ({ ...s, source: 'strategy' })),
        ...patternMatches.map((s) => ({ ...s, source: 'pattern' })),
        ...llmSuggestions.map((s) => ({ ...s, source: 'llm' })),
        ...improvementSuggestions.map((s) => ({ ...s, source: 'improvement' })),
      ];

      // Deduplicate and rank
      const rankedSuggestions = this.rankSuggestions(allSuggestions, file);

      // Get folder improvement recommendations
      const folderImprovements = await this.analyzeFolderStructure(
        smartFolders,
        [file],
      );

      return {
        success: true,
        primary: rankedSuggestions[0] || null,
        alternatives: rankedSuggestions.slice(1, 5),
        strategies: this.getApplicableStrategies(file),
        confidence: this.calculateConfidence(rankedSuggestions[0]),
        explanation: this.generateExplanation(rankedSuggestions[0], file),
        folderImprovements,
      };
    } catch (error) {
      logger.error(
        '[OrganizationSuggestionService] Failed to get suggestions:',
        error,
      );
      return {
        success: false,
        error: error.message,
        fallback: this.getFallbackSuggestion(file, smartFolders),
      };
    }
  }

  /**
   * Get suggestions for batch organization
   */
  async getBatchSuggestions(files, smartFolders = []) {
    try {
      // Analyze files for common patterns
      const patterns = this.analyzeFilePatterns(files);

      // Group files by suggested organization
      const groups = new Map();

      for (const file of files) {
        const suggestion = await this.getSuggestionsForFile(file, smartFolders);
        const key = suggestion.primary?.folder || 'Uncategorized';

        if (!groups.has(key)) {
          groups.set(key, {
            folder: suggestion.primary?.folder || key,
            files: [],
            confidence: 0,
            strategy: suggestion.primary?.strategy,
          });
        }

        const group = groups.get(key);
        group.files.push({
          ...file,
          suggestion: suggestion.primary,
          alternatives: suggestion.alternatives,
        });
        group.confidence =
          (group.confidence + (suggestion.confidence || 0)) / 2;
      }

      // Generate batch recommendations
      const recommendations = await this.generateBatchRecommendations(
        groups,
        patterns,
      );

      return {
        success: true,
        groups: Array.from(groups.values()),
        patterns,
        recommendations,
        suggestedStrategy: this.selectBestStrategy(patterns, files),
      };
    } catch (error) {
      logger.error(
        '[OrganizationSuggestionService] Batch suggestions failed:',
        error,
      );
      return {
        success: false,
        error: error.message,
        groups: [],
      };
    }
  }

  /**
   * Ensure smart folders have embeddings
   */
  async ensureSmartFolderEmbeddings(smartFolders) {
    try {
      // Process all folder embeddings in parallel for better performance
      await Promise.all(
        smartFolders.map((folder) =>
          this.folderMatcher.upsertFolderEmbedding(folder),
        ),
      );
    } catch (error) {
      logger.warn(
        '[OrganizationSuggestionService] Failed to ensure folder embeddings:',
        error,
      );
    }
  }

  /**
   * Get semantic folder matches using embeddings
   */
  async getSemanticFolderMatches(file, smartFolders) {
    try {
      // Always generate fresh embeddings for better matching
      const fileId = `file:${file.path}`;
      const summary = this.generateFileSummary(file);

      await this.folderMatcher.upsertFileEmbedding(fileId, summary, {
        path: file.path,
        name: file.name,
        analysis: file.analysis,
      });

      // Query against smart folder embeddings
      const matches = await this.folderMatcher.matchFileToFolders(fileId, 8);

      // Map matches to smart folders
      const suggestions = [];
      for (const match of matches) {
        // Extract metadata from match (match.metadata contains name, path, description)
        const matchMetadata = match.metadata || {};
        const matchId = match.id || match.folderId;

        // Find corresponding smart folder
        const smartFolder = smartFolders.find(
          (f) =>
            f.id === matchId ||
            f.name === matchMetadata.name ||
            f.path === matchMetadata.path,
        );

        if (smartFolder || match.score > 0.4) {
          suggestions.push({
            folder: smartFolder?.name || matchMetadata.name || 'General',
            path: smartFolder?.path || matchMetadata.path || '',
            score: match.score,
            confidence: match.score,
            description:
              smartFolder?.description || matchMetadata.description || '',
            method: 'semantic_embedding',
            isSmartFolder: !!smartFolder,
          });
        }
      }

      return suggestions;
    } catch (error) {
      logger.warn(
        '[OrganizationSuggestionService] Semantic matching failed:',
        error,
      );
      return [];
    }
  }

  /**
   * Get strategy-based organization suggestions
   */
  async getStrategyBasedSuggestions(file, smartFolders) {
    const suggestions = [];

    for (const [strategyId, strategy] of Object.entries(this.strategies)) {
      const score = this.scoreFileForStrategy(file, strategy);

      if (score > 0.3) {
        const folder = this.mapFileToStrategy(file, strategy, smartFolders);
        const matchingFolder = smartFolders.find(
          (f) => f.name.toLowerCase() === folder.name.toLowerCase(),
        );
        suggestions.push({
          folder: folder.name,
          path: folder.path,
          score,
          confidence: score,
          strategy: strategyId,
          strategyName: strategy.name,
          pattern: strategy.pattern,
          description: matchingFolder?.description || '',
          isSmartFolder: Boolean(matchingFolder),
          method: 'strategy_based',
        });
      }
    }

    return suggestions.sort((a, b) => b.score - a.score);
  }

  /**
   * Get pattern-based suggestions from user history
   */
  getPatternBasedSuggestions(file, smartFolders = []) {
    const suggestions = [];

    // Look for similar files in user patterns
    for (const [pattern, data] of this.userPatterns) {
      const similarity = this.calculatePatternSimilarity(file, pattern);

      if (similarity > 0.5) {
        const matched = smartFolders.find(
          (f) =>
            f.name.toLowerCase() === String(data.folder || '').toLowerCase(),
        );
        suggestions.push({
          folder: data.folder,
          path: matched?.path || data.path,
          score: similarity * data.confidence,
          confidence: similarity * data.confidence,
          pattern: pattern,
          description: matched?.description || '',
          isSmartFolder: Boolean(matched),
          method: 'user_pattern',
          usageCount: data.count,
        });
      }
    }

    return suggestions.sort((a, b) => b.score - a.score).slice(0, 3);
  }

  /**
   * Get LLM-powered alternative suggestions
   */
  async getLLMAlternativeSuggestions(file, smartFolders) {
    try {
      const ollama = getOllama();
      const model = getOllamaModel();

      if (!ollama || !model) {
        return [];
      }

      const prompt = `Given this file analysis, suggest 3 alternative organization approaches:

File: ${file.name}
Type: ${file.extension}
Analysis: ${JSON.stringify(file.analysis || {}, null, 2).slice(0, 500)}

Available folders: ${smartFolders.map((f) => `${f.name}: ${f.description}`).join(', ')}

Suggest creative but practical organization alternatives that might not be obvious.
Consider: workflow stages, temporal organization, project grouping, or functional categorization.

Return JSON: {
  "suggestions": [
    {
      "folder": "folder name",
      "reasoning": "why this makes sense",
      "confidence": 0.0-1.0,
      "strategy": "organization principle used"
    }
  ]
}`;

      const perfOptions = await buildOllamaOptions('text');
      const response = await ollama.generate({
        model,
        prompt,
        format: 'json',
        options: {
          ...perfOptions,
          temperature: 0.7,
          num_predict: 500,
        },
      });

      const parsed = JSON.parse(response.response);
      return (parsed.suggestions || []).map((s) => {
        // Validate and sanitize folder name
        let folderName = s.folder || 'General';

        // If folder name is too long or contains description text, truncate it
        if (folderName.length > 50 || folderName.includes('To provide')) {
          logger.warn(
            '[OrganizationSuggestionService] LLM returned invalid folder name:',
            {
              original: folderName,
              file: file.name,
            },
          );

          // Try to extract a valid folder name
          if (folderName.includes(':')) {
            folderName = folderName.split(':')[0].trim();
          } else if (folderName.includes('\\')) {
            folderName = folderName.split('\\')[0].trim();
          } else {
            // Take first few words
            folderName = folderName.split(' ').slice(0, 2).join(' ');
          }

          // Final sanitization
          if (folderName.length > 50) {
            folderName = 'General';
          }
        }

        const matched = smartFolders.find(
          (f) => f.name.toLowerCase() === folderName.toLowerCase(),
        );

        return {
          folder: folderName,
          path: matched?.path || undefined,
          score: s.confidence || 0.5,
          confidence: s.confidence || 0.5,
          reasoning: s.reasoning,
          strategy: s.strategy,
          description: matched?.description || '',
          isSmartFolder: Boolean(matched),
          method: 'llm_creative',
        };
      });
    } catch (error) {
      logger.warn(
        '[OrganizationSuggestionService] LLM suggestions failed:',
        error,
      );
      return [];
    }
  }

  /**
   * Rank and deduplicate suggestions
   */
  rankSuggestions(suggestions, file) {
    // Deduplicate by folder name
    const uniqueSuggestions = new Map();

    for (const suggestion of suggestions) {
      const key = suggestion.folder?.toLowerCase();
      if (!key) continue;

      if (!uniqueSuggestions.has(key)) {
        // Initialize sources list for confidence aggregation
        uniqueSuggestions.set(key, {
          ...suggestion,
          sources: suggestion.source ? [suggestion.source] : [],
        });
      } else {
        // Merge scores if duplicate
        const existing = uniqueSuggestions.get(key);
        existing.score = Math.max(existing.score, suggestion.score);
        existing.confidence = Math.max(
          existing.confidence,
          suggestion.confidence,
        );

        // Keep the source that provided higher confidence
        if (suggestion.confidence > existing.confidence) {
          existing.source = suggestion.source;
          existing.method = suggestion.method;
        }

        // Merge sources array for multi-source agreement boosting
        if (suggestion.source) {
          const set = new Set(existing.sources || []);
          set.add(suggestion.source);
          existing.sources = Array.from(set);
        }
      }
    }

    // Apply weighting based on source
    const weighted = Array.from(uniqueSuggestions.values()).map((s) => ({
      ...s,
      weightedScore: this.applySourceWeight(s),
    }));

    // Sort by weighted score
    return weighted.sort((a, b) => b.weightedScore - a.weightedScore);
  }

  /**
   * Apply source-based weighting to scores
   */
  applySourceWeight(suggestion) {
    const weights = {
      semantic: 1.2, // Semantic matches are usually good
      user_pattern: 1.5, // User patterns are highly relevant
      strategy: 1.0, // Strategy-based are standard
      llm: 0.8, // LLM suggestions need validation
      pattern: 1.1, // Pattern matches are reliable
      llm_creative: 0.7, // Creative suggestions are experimental
    };

    const weight = weights[suggestion.source] || 1.0;
    return (suggestion.score || 0) * weight;
  }

  /**
   * Calculate confidence for a suggestion
   */
  calculateConfidence(suggestion) {
    if (!suggestion) return 0;

    let confidence = suggestion.confidence || suggestion.score || 0;

    // Boost confidence if multiple sources agree
    if (suggestion.sources && suggestion.sources.length > 1) {
      confidence = Math.min(1.0, confidence * 1.2);
    }

    // Boost if matches user pattern
    if (suggestion.source === 'user_pattern') {
      confidence = Math.min(1.0, confidence * 1.3);
    }

    return Math.round(confidence * 100) / 100;
  }

  /**
   * Generate human-readable explanation for suggestion
   */
  generateExplanation(suggestion, file) {
    if (!suggestion) {
      return 'No clear match found. Consider creating a new folder.';
    }

    // User-friendly explanations without technical jargon
    const explanations = {
      semantic: `This file's content is similar to other files in "${suggestion.folder}"`,
      user_pattern: `You've organized similar files this way before`,
      strategy: `Using ${suggestion.strategyName || 'your preferred'} organization method`,
      llm: `Based on the file's content and purpose`,
      pattern: `This is where ${file.extension.toUpperCase()} files usually go`,
      llm_creative:
        suggestion.reasoning || 'Alternative way to organize this file',
      folder_improvement: `"${suggestion.folder}" could be enhanced for this type of file`,
      improvement:
        suggestion.improvement ||
        `Suggested improvement for better organization`,
      new_folder_suggestion: 'A new folder would be perfect for this file type',
    };

    // Add confidence-based prefix for clarity
    let prefix = '';
    if (suggestion.confidence >= 0.8) {
      prefix = '✅ ';
    } else if (suggestion.confidence >= 0.5) {
      prefix = '👍 ';
    } else {
      prefix = '💡 ';
    }

    return (
      prefix +
      (explanations[suggestion.source] ||
        explanations[suggestion.method] ||
        'Based on file analysis')
    );
  }

  /**
   * Analyze patterns in a batch of files
   */
  analyzeFilePatterns(files) {
    const patterns = {
      projects: new Set(),
      dates: new Set(),
      types: new Set(),
      categories: new Set(),
      commonWords: {},
    };

    for (const file of files) {
      if (file.analysis) {
        if (file.analysis.project) patterns.projects.add(file.analysis.project);
        if (file.analysis.category)
          patterns.categories.add(file.analysis.category);
        if (file.analysis.documentDate)
          patterns.dates.add(file.analysis.documentDate);
      }

      // Extract common words from filenames
      const words = file.name.toLowerCase().split(/[^a-z0-9]+/);
      for (const word of words) {
        if (word.length > 3) {
          patterns.commonWords[word] = (patterns.commonWords[word] || 0) + 1;
        }
      }

      patterns.types.add(file.extension);
    }

    // Find most common patterns
    return {
      hasCommonProject: patterns.projects.size === 1,
      project:
        patterns.projects.size === 1 ? Array.from(patterns.projects)[0] : null,
      hasDatePattern: patterns.dates.size > 0,
      dateRange:
        patterns.dates.size > 0 ? this.getDateRange(patterns.dates) : null,
      fileTypes: Array.from(patterns.types),
      dominantCategory: this.findDominantCategory(patterns.categories),
      commonTerms: Object.entries(patterns.commonWords)
        .filter(([_, count]) => count > files.length * 0.3)
        .map(([word]) => word),
    };
  }

  /**
   * Generate batch organization recommendations
   */
  async generateBatchRecommendations(groups, patterns) {
    const recommendations = [];

    // Check if files belong to same project
    if (patterns.hasCommonProject) {
      recommendations.push({
        type: 'project_grouping',
        description: `All files appear to be related to "${patterns.project}"`,
        suggestion: `Consider creating a dedicated project folder: Projects/${patterns.project}`,
        confidence: 0.9,
      });
    }

    // Check for temporal patterns
    if (patterns.hasDatePattern) {
      recommendations.push({
        type: 'temporal_organization',
        description: `Files span ${patterns.dateRange.description}`,
        suggestion:
          'Consider organizing by date for better chronological tracking',
        confidence: 0.7,
      });
    }

    // Check for workflow patterns
    const workflowIndicators = [
      'draft',
      'final',
      'review',
      'approved',
      'v1',
      'v2',
    ];
    const hasWorkflow = patterns.commonTerms.some((term) =>
      workflowIndicators.includes(term.toLowerCase()),
    );

    if (hasWorkflow) {
      recommendations.push({
        type: 'workflow_organization',
        description: 'Files show versioning or workflow stages',
        suggestion:
          'Consider organizing by workflow stage for better process management',
        confidence: 0.8,
      });
    }

    return recommendations;
  }

  /**
   * Record user feedback for learning
   */
  recordFeedback(file, suggestion, accepted) {
    this.feedbackHistory.push({
      timestamp: Date.now(),
      file: { name: file.name, type: file.extension },
      suggestion,
      accepted,
    });

    // Update user patterns
    if (accepted && suggestion) {
      const pattern = this.extractPattern(file, suggestion);

      if (!this.userPatterns.has(pattern)) {
        this.userPatterns.set(pattern, {
          folder: suggestion.folder,
          path: suggestion.path,
          count: 0,
          confidence: 0.5,
        });
      }

      const data = this.userPatterns.get(pattern);
      data.count++;
      data.confidence = Math.min(1.0, data.confidence + 0.1);
    }

    // Trim history if too large
    if (this.feedbackHistory.length > 1000) {
      this.feedbackHistory = this.feedbackHistory.slice(-500);
    }
  }

  /**
   * Helper methods
   */

  generateFileSummary(file) {
    const parts = [
      file.name,
      file.extension,
      file.analysis?.project,
      file.analysis?.purpose,
      file.analysis?.category,
      (file.analysis?.keywords || []).join(' '),
    ].filter(Boolean);

    return parts.join(' ');
  }

  scoreFileForStrategy(file, strategy) {
    let score = 0;
    const analysis = file.analysis || {};

    for (const priority of strategy.priority) {
      if (analysis[priority]) {
        score += 0.3;
      }
    }

    // Check if filename matches strategy pattern
    const patternMatch = this.matchesStrategyPattern(
      file.name,
      strategy.pattern,
    );
    if (patternMatch) {
      score += 0.4;
    }

    return Math.min(1.0, score);
  }

  mapFileToStrategy(file, strategy, smartFolders) {
    const analysis = file.analysis || {};
    const pattern = strategy.pattern;

    // Replace pattern variables with actual values
    const folderPath = pattern
      .replace('{project_name}', analysis.project || 'General')
      .replace('{file_type}', this.getFileTypeCategory(file.extension))
      .replace('{year}', new Date().getFullYear())
      .replace('{month}', String(new Date().getMonth() + 1).padStart(2, '0'))
      .replace('{category}', analysis.category || 'Uncategorized')
      .replace('{stage}', analysis.stage || 'Working')
      .replace('{main_category}', analysis.category || 'Documents')
      .replace('{subcategory}', analysis.subcategory || 'General')
      // Never use purpose as a folder name - it's a description field
      .replace(
        '{specific_folder}',
        analysis.subcategory || analysis.project || 'Misc',
      );

    // Find matching smart folder or create suggestion
    const matchingFolder = smartFolders.find(
      (f) => f.name.toLowerCase() === path.basename(folderPath).toLowerCase(),
    );

    return {
      name: matchingFolder?.name || path.basename(folderPath),
      path: matchingFolder?.path || folderPath,
    };
  }

  getFileTypeCategory(extension) {
    const categories = {
      documents: ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'],
      spreadsheets: ['xls', 'xlsx', 'csv', 'ods'],
      presentations: ['ppt', 'pptx', 'odp'],
      images: ['jpg', 'jpeg', 'png', 'gif', 'svg', 'bmp'],
      videos: ['mp4', 'avi', 'mov', 'wmv', 'flv'],
      audio: ['mp3', 'wav', 'flac', 'aac', 'm4a'],
      code: ['js', 'py', 'java', 'cpp', 'html', 'css'],
      archives: ['zip', 'rar', '7z', 'tar', 'gz'],
    };

    for (const [category, extensions] of Object.entries(categories)) {
      if (extensions.includes(extension.toLowerCase())) {
        return category.charAt(0).toUpperCase() + category.slice(1);
      }
    }

    return 'Files';
  }

  matchesStrategyPattern(filename, pattern) {
    // Simple pattern matching - could be enhanced
    const patternParts = pattern.toLowerCase().split('/');
    const nameParts = filename.toLowerCase().split(/[_\-\s.]/);

    return patternParts.some((part) =>
      nameParts.some(
        (namePart) => namePart.includes(part) || part.includes(namePart),
      ),
    );
  }

  calculatePatternSimilarity(file, pattern) {
    // Simple similarity calculation - could use more sophisticated methods
    const filePattern = this.extractPattern(file);

    if (filePattern === pattern) return 1.0;

    const fileParts = filePattern.split(':');
    const patternParts = pattern.split(':');

    let matches = 0;
    for (let i = 0; i < Math.min(fileParts.length, patternParts.length); i++) {
      if (fileParts[i] === patternParts[i]) {
        matches++;
      }
    }

    return matches / Math.max(fileParts.length, patternParts.length);
  }

  extractPattern(file, suggestion = null) {
    const parts = [
      file.extension,
      file.analysis?.category || 'unknown',
      suggestion?.folder || 'unknown',
    ];

    return parts.join(':').toLowerCase();
  }

  getDateRange(dates) {
    const dateArray = Array.from(dates).sort();

    if (dateArray.length === 0) return null;
    if (dateArray.length === 1) {
      return {
        start: dateArray[0],
        end: dateArray[0],
        description: `Single date: ${dateArray[0]}`,
      };
    }

    return {
      start: dateArray[0],
      end: dateArray[dateArray.length - 1],
      description: `${dateArray[0]} to ${dateArray[dateArray.length - 1]}`,
    };
  }

  findDominantCategory(categories) {
    const categoryArray = Array.from(categories);

    if (categoryArray.length === 0) return null;
    if (categoryArray.length === 1) return categoryArray[0];

    // Find most common category
    const counts = {};
    for (const cat of categoryArray) {
      counts[cat] = (counts[cat] || 0) + 1;
    }

    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }

  selectBestStrategy(patterns, files) {
    let bestStrategy = null;
    let bestScore = 0;

    for (const [strategyId, strategy] of Object.entries(this.strategies)) {
      let score = 0;

      // Score based on pattern match
      if (patterns.hasCommonProject && strategy.priority.includes('project')) {
        score += 0.4;
      }
      if (patterns.hasDatePattern && strategy.priority.includes('date')) {
        score += 0.3;
      }
      if (
        patterns.commonTerms.length > 0 &&
        strategy.priority.includes('category')
      ) {
        score += 0.2;
      }

      // Score based on file diversity
      const typeCount = patterns.fileTypes.length;
      if (typeCount > 3 && strategyId === 'type-based') {
        score += 0.3;
      }

      if (score > bestScore) {
        bestScore = score;
        bestStrategy = { id: strategyId, ...strategy, score };
      }
    }

    return bestStrategy;
  }

  getFallbackSuggestion(file, smartFolders) {
    // Simple fallback based on file type
    const category = this.getFileTypeCategory(file.extension);
    const matchingFolder = smartFolders.find((f) =>
      f.name.toLowerCase().includes(category.toLowerCase()),
    );

    return {
      folder: matchingFolder?.name || category,
      path: matchingFolder?.path || `Documents/${category}`,
      confidence: 0.3,
      method: 'fallback',
    };
  }

  /**
   * Get applicable organization strategies for a file
   */
  getApplicableStrategies(file) {
    return Object.entries(this.strategies)
      .map(([id, strategy]) => ({
        id,
        ...strategy,
        applicability: this.scoreFileForStrategy(file, strategy),
      }))
      .filter((s) => s.applicability > 0.2)
      .sort((a, b) => b.applicability - a.applicability);
  }

  /**
   * Get improvement suggestions for existing organization
   */
  async getImprovementSuggestions(file, smartFolders) {
    const suggestions = [];

    // Analyze if file fits better in a different existing folder
    for (const folder of smartFolders) {
      // Check if folder could be improved for this type of file
      const fitScore = this.calculateFolderFitScore(file, folder);

      if (fitScore > 0.3 && fitScore < 0.7) {
        // Folder is somewhat relevant but could be better
        suggestions.push({
          folder: folder.name,
          path: folder.path,
          score: fitScore + 0.2, // Boost score for improvement
          confidence: fitScore,
          description: folder.description,
          improvement: this.suggestFolderImprovement(file, folder),
          method: 'folder_improvement',
        });
      }
    }

    // Suggest new smart folders if no good matches
    if (suggestions.length === 0) {
      const newFolderSuggestion = await this.suggestNewSmartFolder(
        file,
        smartFolders,
      );
      if (newFolderSuggestion) {
        suggestions.push(newFolderSuggestion);
      }
    }

    return suggestions;
  }

  /**
   * Analyze folder structure and suggest improvements
   */
  async analyzeFolderStructure(smartFolders, files = []) {
    const improvements = [];

    // Check for missing common categories
    const missingCategories = this.identifyMissingCategories(
      smartFolders,
      files,
    );
    if (missingCategories.length > 0) {
      improvements.push({
        type: 'missing_categories',
        description: 'Suggested new folders for better organization',
        suggestions: missingCategories,
        priority: 'high',
      });
    }

    // Check for overlapping folders
    const overlaps = this.findOverlappingFolders(smartFolders);
    if (overlaps.length > 0) {
      improvements.push({
        type: 'folder_overlaps',
        description: 'Folders with similar purposes that could be merged',
        suggestions: overlaps,
        priority: 'medium',
      });
    }

    // Check for underutilized folders
    const underutilized = this.findUnderutilizedFolders(smartFolders);
    if (underutilized.length > 0) {
      improvements.push({
        type: 'underutilized_folders',
        description: 'Folders that might be too specific or rarely used',
        suggestions: underutilized,
        priority: 'low',
      });
    }

    // Suggest hierarchy improvements
    const hierarchySuggestions =
      this.suggestHierarchyImprovements(smartFolders);
    if (hierarchySuggestions.length > 0) {
      improvements.push({
        type: 'hierarchy_improvements',
        description: 'Suggestions for better folder hierarchy',
        suggestions: hierarchySuggestions,
        priority: 'medium',
      });
    }

    return improvements;
  }

  /**
   * Calculate how well a file fits in a folder
   */
  calculateFolderFitScore(file, folder) {
    let score = 0;
    const analysis = file.analysis || {};

    // Check name similarity
    const nameSimilarity = this.calculateStringSimilarity(
      file.name.toLowerCase(),
      folder.name.toLowerCase(),
    );
    score += nameSimilarity * 0.3;

    // Check description relevance
    if (folder.description && analysis.purpose) {
      const descSimilarity = this.calculateStringSimilarity(
        analysis.purpose.toLowerCase(),
        folder.description.toLowerCase(),
      );
      score += descSimilarity * 0.3;
    }

    // Check category match
    if (
      analysis.category &&
      folder.name.toLowerCase().includes(analysis.category.toLowerCase())
    ) {
      score += 0.2;
    }

    // Check keywords
    if (folder.keywords && analysis.keywords) {
      const keywordMatch = this.calculateKeywordOverlap(
        folder.keywords,
        analysis.keywords,
      );
      score += keywordMatch * 0.2;
    }

    return Math.min(1.0, score);
  }

  /**
   * Suggest improvement for a folder based on a file
   */
  suggestFolderImprovement(file, folder) {
    const improvements = [];
    const analysis = file.analysis || {};

    // Suggest adding keywords
    if (analysis.keywords && folder.keywords) {
      const newKeywords = analysis.keywords.filter(
        (k) =>
          !folder.keywords.some((fk) => fk.toLowerCase() === k.toLowerCase()),
      );
      if (newKeywords.length > 0) {
        improvements.push(
          `Add keywords: ${newKeywords.slice(0, 3).join(', ')}`,
        );
      }
    }

    // Suggest description enhancement
    if (analysis.purpose && folder.description) {
      if (folder.description.length < 50) {
        improvements.push('Enhance folder description for better matching');
      }
    }

    // Suggest subfolder creation
    if (analysis.subcategory) {
      improvements.push(`Consider subfolder: ${analysis.subcategory}`);
    }

    return (
      improvements.join('; ') || 'Folder is well-suited for this file type'
    );
  }

  /**
   * Suggest a new smart folder based on file patterns
   */
  async suggestNewSmartFolder(file, existingFolders) {
    const analysis = file.analysis || {};

    // Generate a folder name based on file analysis
    let folderName =
      analysis.category || this.getFileTypeCategory(file.extension);

    // Check if similar folder already exists
    const exists = existingFolders.some(
      (f) => f.name.toLowerCase() === folderName.toLowerCase(),
    );

    if (exists) {
      // Modify name to be more specific
      if (analysis.project) {
        folderName = `${analysis.project} - ${folderName}`;
      } else if (analysis.subcategory) {
        folderName = `${folderName} - ${analysis.subcategory}`;
      }
    }

    return {
      folder: folderName,
      path: `Documents/${folderName}`,
      score: 0.6,
      confidence: 0.6,
      description: `Suggested new folder for ${analysis.purpose || file.extension + ' files'}`,
      isNew: true,
      method: 'new_folder_suggestion',
      reasoning: 'No existing folder matches this file type well',
    };
  }

  /**
   * Identify missing categories in folder structure
   */
  identifyMissingCategories(smartFolders, files) {
    const commonCategories = [
      'Projects',
      'Archive',
      'Templates',
      'Reports',
      'Presentations',
      'Research',
      'Personal',
      'Work',
      'Financial',
      'Legal',
      'Media',
      'Downloads',
    ];

    const existingNames = smartFolders.map((f) => f.name.toLowerCase());
    const missing = [];

    for (const category of commonCategories) {
      const exists = existingNames.some((name) =>
        name.includes(category.toLowerCase()),
      );

      if (!exists) {
        // Check if files would benefit from this category
        const wouldBenefit = files.some((f) => {
          const analysis = f.analysis || {};
          return (
            (analysis.category &&
              analysis.category
                .toLowerCase()
                .includes(category.toLowerCase())) ||
            (f.name && f.name.toLowerCase().includes(category.toLowerCase()))
          );
        });

        if (wouldBenefit) {
          missing.push({
            name: category,
            reason: `Files detected that would fit in ${category} folder`,
            priority: 'high',
          });
        }
      }
    }

    return missing;
  }

  /**
   * Find overlapping folders with similar purposes
   */
  findOverlappingFolders(smartFolders) {
    const overlaps = [];

    for (let i = 0; i < smartFolders.length; i++) {
      for (let j = i + 1; j < smartFolders.length; j++) {
        const similarity = this.calculateFolderSimilarity(
          smartFolders[i],
          smartFolders[j],
        );

        if (similarity > 0.7) {
          overlaps.push({
            folders: [smartFolders[i].name, smartFolders[j].name],
            similarity,
            suggestion: `Consider merging '${smartFolders[i].name}' and '${smartFolders[j].name}'`,
          });
        }
      }
    }

    return overlaps;
  }

  /**
   * Find underutilized folders
   */
  findUnderutilizedFolders(smartFolders) {
    const underutilized = [];

    for (const folder of smartFolders) {
      const usageCount =
        this.folderUsageStats.get(folder.id || folder.name) || 0;

      if (usageCount < 3) {
        underutilized.push({
          name: folder.name,
          usageCount,
          suggestion:
            usageCount === 0
              ? `'${folder.name}' has never been used - consider removing or broadening its scope`
              : `'${folder.name}' is rarely used - consider merging with related folders`,
        });
      }
    }

    return underutilized;
  }

  /**
   * Suggest hierarchy improvements
   */
  suggestHierarchyImprovements(smartFolders) {
    const suggestions = [];

    // Group folders by potential parent categories
    const groups = {};

    for (const folder of smartFolders) {
      const parts = folder.name.split(/[\s\-_]/);
      const potentialParent = parts[0];

      if (!groups[potentialParent]) {
        groups[potentialParent] = [];
      }
      groups[potentialParent].push(folder);
    }

    // Suggest creating parent folders for groups
    for (const [parent, folders] of Object.entries(groups)) {
      if (folders.length > 2) {
        const parentExists = smartFolders.some(
          (f) => f.name.toLowerCase() === parent.toLowerCase(),
        );

        if (!parentExists) {
          suggestions.push({
            type: 'create_parent',
            parent,
            children: folders.map((f) => f.name),
            suggestion: `Create parent folder '${parent}' for related folders`,
          });
        }
      }
    }

    return suggestions;
  }

  /**
   * Calculate similarity between two folders
   */
  calculateFolderSimilarity(folder1, folder2) {
    let similarity = 0;

    // Name similarity
    similarity +=
      this.calculateStringSimilarity(
        folder1.name.toLowerCase(),
        folder2.name.toLowerCase(),
      ) * 0.4;

    // Description similarity
    if (folder1.description && folder2.description) {
      similarity +=
        this.calculateStringSimilarity(
          folder1.description.toLowerCase(),
          folder2.description.toLowerCase(),
        ) * 0.3;
    }

    // Keyword overlap
    if (folder1.keywords && folder2.keywords) {
      similarity +=
        this.calculateKeywordOverlap(folder1.keywords, folder2.keywords) * 0.3;
    }

    return similarity;
  }

  /**
   * Calculate string similarity (simple implementation)
   */
  calculateStringSimilarity(str1, str2) {
    const words1 = str1.split(/\s+/);
    const words2 = str2.split(/\s+/);

    const commonWords = words1.filter((w) => words2.includes(w)).length;
    const totalWords = Math.max(words1.length, words2.length);

    return totalWords > 0 ? commonWords / totalWords : 0;
  }

  /**
   * Calculate keyword overlap
   */
  calculateKeywordOverlap(keywords1, keywords2) {
    const set1 = new Set(keywords1.map((k) => k.toLowerCase()));
    const set2 = new Set(keywords2.map((k) => k.toLowerCase()));

    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }
}

module.exports = OrganizationSuggestionService;
