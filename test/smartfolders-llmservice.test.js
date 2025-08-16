const {
  enhanceSmartFolderWithLLM,
  calculateFolderSimilarities,
  calculateBasicSimilarity,
} = require('../src/main/services/SmartFoldersLLMService');

describe('SmartFoldersLLMService', () => {
  let originalFetch;
  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = jest.fn();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('enhanceSmartFolderWithLLM returns parsed enhancement', async () => {
    const enhancement = {
      improvedDescription: 'better',
      suggestedKeywords: ['a'],
      organizationTips: 'tips',
      confidence: 0.8,
    };
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: JSON.stringify(enhancement) }),
    });
    const result = await enhanceSmartFolderWithLLM(
      { name: 'Invoices', path: '/tmp', description: 'old' },
      [{ name: 'Receipts', description: 'past' }],
      () => 'model',
    );
    expect(global.fetch).toHaveBeenCalled();
    expect(result).toEqual(enhancement);
  });

  test('calculateFolderSimilarities sorts and falls back on error', async () => {
    const basic = calculateBasicSimilarity('Invoices', 'Misc');
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: '0.9' }),
      })
      .mockRejectedValueOnce(new Error('network'));
    const result = await calculateFolderSimilarities(
      'Invoices',
      [
        { name: 'Billing', description: 'payments', id: 1 },
        { name: 'Misc', description: 'other', id: 2 },
      ],
      () => 'model',
    );
    expect(result[0]).toMatchObject({ name: 'Billing', confidence: 0.9 });
    expect(result[1]).toMatchObject({
      name: 'Misc',
      confidence: basic,
      fallback: true,
    });
  });

  test('calculateBasicSimilarity compares words', () => {
    expect(
      calculateBasicSimilarity('project alpha', 'alpha project'),
    ).toBeCloseTo(1.0);
    expect(
      calculateBasicSimilarity('invoice april', 'invoice'),
    ).toBeGreaterThan(0.5);
  });
});
