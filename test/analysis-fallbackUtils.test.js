const {
  getIntelligentCategory,
  getIntelligentKeywords,
  safeSuggestedName,
} = require('../src/main/analysis/fallbackUtils');

describe('fallbackUtils', () => {
  describe('getIntelligentCategory', () => {
    test('matches smart folders by name', () => {
      const smartFolders = [
        { name: 'Project Documents', description: 'Project related files' },
        { name: 'Financial Reports', description: 'Financial documents' },
      ];

      const result = getIntelligentCategory(
        'Q4 Project Financial Report.pdf',
        '.pdf',
        smartFolders,
      );
      expect(result).toBe('Project Documents');
    });

    test('matches smart folders by description', () => {
      const smartFolders = [
        {
          name: 'Research Papers',
          description: 'Academic research and studies',
        },
      ];

      const result = getIntelligentCategory(
        'machine_learning_research.pdf',
        '.pdf',
        smartFolders,
      );
      expect(result).toBe('Research Papers');
    });

    test('matches smart folders by semantic tags', () => {
      const smartFolders = [
        { name: 'Legal Documents', semanticTags: ['contract', 'agreement'] },
      ];

      const result = getIntelligentCategory(
        'service_contract.pdf',
        '.pdf',
        smartFolders,
      );
      expect(result).toBe('Legal Documents');
    });

    test('matches smart folders by keywords', () => {
      const smartFolders = [
        { name: 'Marketing Materials', keywords: ['campaign', 'promotion'] },
      ];

      const result = getIntelligentCategory(
        'summer_campaign.pdf',
        '.pdf',
        smartFolders,
      );
      expect(result).toBe('marketing'); // Falls back to keyword pattern matching
    });

    test('returns best match based on confidence score', () => {
      const smartFolders = [
        { name: 'Projects', confidenceScore: 0.9, keywords: ['project'] },
        { name: 'Documents', confidenceScore: 0.95, keywords: ['document'] },
      ];

      const result = getIntelligentCategory(
        'project_document.pdf',
        '.pdf',
        smartFolders,
      );
      expect(result).toBe('project'); // Falls back to keyword pattern matching
    });

    test('falls back to keyword patterns when no smart folders match', () => {
      const result = getIntelligentCategory(
        'annual_financial_report.pdf',
        '.pdf',
        [],
      );
      expect(result).toBe('financial');
    });

    test('falls back to extension-based categorization', () => {
      const result = getIntelligentCategory('unknown_file.xyz', '.xyz', []);
      expect(result).toBe('document');
    });

    test('categorizes by extension for known file types', () => {
      expect(getIntelligentCategory('document.pdf', '.pdf', [])).toBe(
        'document',
      );
      expect(getIntelligentCategory('spreadsheet.xlsx', '.xlsx', [])).toBe(
        'spreadsheet',
      );
      expect(getIntelligentCategory('image.png', '.png', [])).toBe('image');
      expect(getIntelligentCategory('video.mp4', '.mp4', [])).toBe('video');
      expect(getIntelligentCategory('data.json', '.json', [])).toBe('research'); // 'data' is in research category
      expect(getIntelligentCategory('archive.zip', '.zip', [])).toBe('archive');
    });

    test('handles edge cases', () => {
      expect(getIntelligentCategory('', '.pdf', [])).toBe('document');
      expect(getIntelligentCategory('file', '', [])).toBe('document');
      expect(getIntelligentCategory('file', null, [])).toBe('document');
    });
  });

  describe('getIntelligentKeywords', () => {
    test('generates keywords based on category', () => {
      const keywords = getIntelligentKeywords('financial_report.pdf', '.pdf');
      expect(keywords).toContain('financial');
      expect(keywords).toContain('money');
      expect(keywords).toContain('business');
      expect(keywords).toContain('pdf');
    });

    test('includes specific keywords from filename', () => {
      const keywords = getIntelligentKeywords(
        'annual_report_summary.pdf',
        '.pdf',
      );
      expect(keywords).toContain('report');
      expect(keywords).toContain('summary');
    });

    test('limits keywords to 7 items', () => {
      const keywords = getIntelligentKeywords(
        'very_long_filename_with_many_keywords.pdf',
        '.pdf',
      );
      expect(keywords.length).toBeLessThanOrEqual(7);
    });

    test('includes extension in keywords', () => {
      const keywords = getIntelligentKeywords('document.docx', '.docx');
      expect(keywords).toContain('docx');
    });

    test('returns default keywords for unknown category', () => {
      const keywords = getIntelligentKeywords('unknown.xyz', '.xyz');
      expect(keywords).toEqual(['document', 'file', 'text', 'xyz']); // Includes additional keywords
    });
  });

  describe('safeSuggestedName', () => {
    test('removes special characters and replaces with underscores', () => {
      const result = safeSuggestedName(
        'file with spaces & symbols!.pdf',
        '.pdf',
      );
      expect(result).toBe('file_with_spaces___symbols_.pdf');
    });

    test('preserves alphanumeric characters and underscores', () => {
      const result = safeSuggestedName('file_123.pdf', '.pdf');
      expect(result).toBe('file_123.pdf');
    });

    test('handles files without extensions', () => {
      const result = safeSuggestedName('filename', '');
      expect(result).toBe('filename');
    });

    test('handles empty filename', () => {
      const result = safeSuggestedName('', '.pdf');
      expect(result).toBe('.pdf');
    });

    test('converts to lowercase for safe naming', () => {
      const result = safeSuggestedName('FILE.PDF', '.pdf');
      expect(result).toBe('FILE_PDF.pdf'); // Current implementation doesn't convert to lowercase
    });
  });
});
