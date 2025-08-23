const { normalizeAnalysisResult } = require('../src/main/analysis/utils');

describe('analysis utils', () => {
  describe('normalizeAnalysisResult', () => {
    test('returns normalized result with default values', () => {
      const raw = {};
      const result = normalizeAnalysisResult(raw);

      expect(result).toEqual({
        category: 'document',
        keywords: [],
        confidence: 0,
        suggestedName: null,
        extractionMethod: null,
        contentLength: null,
      });
    });

    test('preserves valid values from raw result', () => {
      const raw = {
        category: 'financial',
        keywords: ['budget', 'report'],
        confidence: 85,
        suggestedName: 'budget_report.pdf',
        extractionMethod: 'pdf-parser',
        contentLength: 1024,
        extraField: 'extra value',
      };

      const result = normalizeAnalysisResult(raw);

      expect(result.category).toBe('financial');
      expect(result.keywords).toEqual(['budget', 'report']);
      expect(result.confidence).toBe(85);
      expect(result.suggestedName).toBe('budget_report.pdf');
      expect(result.extractionMethod).toBe('pdf-parser');
      expect(result.contentLength).toBe(1024);
      expect(result.extraField).toBe('extra value');
    });

    test('applies fallback values for invalid data', () => {
      const raw = {
        category: '',
        keywords: 'not an array',
        confidence: 'invalid number',
        suggestedName: 123,
        contentLength: 'invalid number',
      };

      const fallback = {
        category: 'fallback-category',
        keywords: ['fallback', 'keywords'],
        confidence: 75,
        suggestedName: 'fallback-name.pdf',
        extractionMethod: 'fallback-method',
        contentLength: 512,
      };

      const result = normalizeAnalysisResult(raw, fallback);

      expect(result.category).toBe('fallback-category');
      expect(result.keywords).toEqual(['fallback', 'keywords']);
      expect(result.confidence).toBe(75);
      expect(result.suggestedName).toBe('fallback-name.pdf');
      expect(result.extractionMethod).toBe('fallback-method');
      expect(result.contentLength).toBe(512);
    });

    test('handles edge cases', () => {
      expect(normalizeAnalysisResult(null)).toEqual({
        category: 'document',
        keywords: [],
        confidence: 0,
        suggestedName: null,
        extractionMethod: null,
        contentLength: null,
      });

      expect(normalizeAnalysisResult(undefined)).toEqual({
        category: 'document',
        keywords: [],
        confidence: 0,
        suggestedName: null,
        extractionMethod: null,
        contentLength: null,
      });

      expect(normalizeAnalysisResult('string')).toEqual({
        category: 'document',
        keywords: [],
        confidence: 0,
        suggestedName: null,
        extractionMethod: null,
        contentLength: null,
      });
    });

    test('trims whitespace from category', () => {
      const raw = { category: '  financial  ' };
      const result = normalizeAnalysisResult(raw);
      expect(result.category).toBe('financial');
    });

    test('filters out non-array keywords', () => {
      const raw = { keywords: null };
      const result = normalizeAnalysisResult(raw, { keywords: ['fallback'] });
      expect(result.keywords).toEqual(['fallback']);
    });

    test('validates confidence range', () => {
      expect(normalizeAnalysisResult({ confidence: -5 }).confidence).toBe(0);
      expect(normalizeAnalysisResult({ confidence: 150 }).confidence).toBe(150);
      expect(normalizeAnalysisResult({ confidence: 75 }).confidence).toBe(75);
    });

    test('handles non-string suggestedName', () => {
      const raw = { suggestedName: 123 };
      const result = normalizeAnalysisResult(raw, {
        suggestedName: 'fallback.pdf',
      });
      expect(result.suggestedName).toBe('fallback.pdf');
    });

    test('handles non-number contentLength', () => {
      const raw = { contentLength: 'not a number' };
      const result = normalizeAnalysisResult(raw, { contentLength: 256 });
      expect(result.contentLength).toBe(256);
    });

    test('preserves fallback contentLength of 0', () => {
      const result = normalizeAnalysisResult({}, { contentLength: 0 });
      expect(result.contentLength).toBe(0);
    });
  });
});
