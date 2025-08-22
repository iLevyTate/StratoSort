const { normalizeAnalysisResult } = require('../src/main/analysis/utils');

describe('normalizeAnalysisResult', () => {
  test('preserves fallback contentLength of 0', () => {
    const result = normalizeAnalysisResult({}, { contentLength: 0 });
    expect(result.contentLength).toBe(0);
  });
});
