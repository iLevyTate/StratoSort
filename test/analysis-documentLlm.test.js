// Mock the ollamaUtils module at the top level
jest.mock('../src/main/ollamaUtils', () => ({
  loadOllamaConfig: jest.fn(),
  getOllamaModel: jest.fn(),
  getOllamaClient: jest.fn(),
  retryWithBackoff: jest.fn((fn) => fn()), // Simple mock that just calls the function
}));

const { analyzeTextWithOllama } = require('../src/main/analysis/documentLlm');
const {
  loadOllamaConfig,
  getOllamaModel,
  getOllamaClient,
  retryWithBackoff,
} = require('../src/main/ollamaUtils');

describe('documentLlm', () => {
  let mockClient;

  beforeEach(() => {
    mockClient = {
      generate: jest.fn(),
    };

    // Reset all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('analyzeTextWithOllama', () => {
    test('successfully analyzes text with Ollama', async () => {
      const mockResponse = {
        response: JSON.stringify({
          date: '2023-12-01',
          project: 'Test Project',
          purpose: 'Testing document analysis',
          category: 'Research',
          keywords: ['test', 'analysis', 'document'],
          confidence: 85,
          suggestedName: 'test_document',
        }),
      };

      loadOllamaConfig.mockResolvedValue({ selectedTextModel: 'test-model' });
      getOllamaModel.mockReturnValue('test-model');
      getOllamaClient.mockResolvedValue(mockClient);
      mockClient.generate.mockResolvedValue(mockResponse);

      const result = await analyzeTextWithOllama(
        'Sample document content',
        'test.pdf',
      );

      expect(result).toEqual({
        rawText: 'Sample document content',
        date: '2023-12-01',
        project: 'Test Project',
        purpose: 'Testing document analysis',
        category: 'Research',
        keywords: ['test', 'analysis', 'document'],
        confidence: 85,
        suggestedName: 'test_document',
      });

      expect(retryWithBackoff).toHaveBeenCalled();
      expect(mockClient.generate).toHaveBeenCalledWith({
        model: 'test-model',
        prompt: expect.stringContaining('Sample document content'),
        options: expect.objectContaining({
          temperature: expect.any(Number),
          num_predict: expect.any(Number),
        }),
        format: 'json',
      });
    });

    test('uses smart folders for categorization', async () => {
      const smartFolders = [
        { name: 'Research', description: 'Research documents' },
        { name: 'Projects', description: 'Project documents' },
      ];

      const mockResponse = {
        response: JSON.stringify({
          date: '2023-12-01',
          project: 'Test Project',
          purpose: 'Testing document analysis',
          category: 'Research',
          keywords: ['test', 'research'],
          confidence: 90,
          suggestedName: 'research_doc',
        }),
      };

      loadOllamaConfig.mockResolvedValue({ selectedTextModel: 'test-model' });
      getOllamaModel.mockReturnValue('test-model');
      getOllamaClient.mockResolvedValue(mockClient);
      mockClient.generate.mockResolvedValue(mockResponse);

      const result = await analyzeTextWithOllama(
        'Research content',
        'research.pdf',
        smartFolders,
      );

      expect(result.category).toBe('Research');
      expect(retryWithBackoff).toHaveBeenCalled();
      expect(mockClient.generate).toHaveBeenCalledWith({
        model: 'test-model',
        prompt: expect.stringContaining('AVAILABLE SMART FOLDERS'),
        options: expect.any(Object),
        format: 'json',
      });
    });

    test('filters invalid smart folders', async () => {
      const smartFolders = [
        { name: '', description: 'Empty name' },
        { name: 'Valid', description: 'Valid folder' },
        { name: null, description: 'Null name' },
      ];

      const mockResponse = {
        response: JSON.stringify({
          date: '2023-12-01',
          project: 'Test Project',
          purpose: 'Testing document analysis',
          category: 'Valid',
          keywords: ['test'],
          confidence: 85,
          suggestedName: 'test_doc',
        }),
      };

      loadOllamaConfig.mockResolvedValue({ selectedTextModel: 'test-model' });
      getOllamaModel.mockReturnValue('test-model');
      getOllamaClient.mockResolvedValue(mockClient);
      mockClient.generate.mockResolvedValue(mockResponse);

      await analyzeTextWithOllama('Test content', 'test.pdf', smartFolders);

      expect(retryWithBackoff).toHaveBeenCalled();
      expect(mockClient.generate).toHaveBeenCalledWith({
        model: 'test-model',
        prompt: expect.stringContaining('"Valid"'),
        options: expect.any(Object),
        format: 'json',
      });
    });

    test('handles JSON parsing errors gracefully', async () => {
      const mockResponse = {
        response: 'invalid json',
      };

      loadOllamaConfig.mockResolvedValue({ selectedTextModel: 'test-model' });
      getOllamaModel.mockReturnValue('test-model');
      getOllamaClient.mockResolvedValue(mockClient);
      mockClient.generate.mockResolvedValue(mockResponse);

      const result = await analyzeTextWithOllama('Test content', 'test.pdf');

      expect(retryWithBackoff).toHaveBeenCalled();
      expect(result).toEqual({
        error: 'Failed to parse document analysis from Ollama.',
        keywords: [],
        confidence: 65,
        extractionMethod: 'unknown',
        category: 'document',
        suggestedName: null,
      });
    });

    test('handles empty response from Ollama', async () => {
      const mockResponse = {
        response: null,
      };

      loadOllamaConfig.mockResolvedValue({ selectedTextModel: 'test-model' });
      getOllamaModel.mockReturnValue('test-model');
      getOllamaClient.mockResolvedValue(mockClient);
      mockClient.generate.mockResolvedValue(mockResponse);

      const result = await analyzeTextWithOllama('Test content', 'test.pdf');

      expect(retryWithBackoff).toHaveBeenCalled();
      expect(result).toEqual({
        error: 'No content in Ollama response for document',
        keywords: [],
        confidence: 60,
        extractionMethod: 'unknown',
        category: 'document',
        suggestedName: null,
      });
    });

    test('handles API errors gracefully', async () => {
      loadOllamaConfig.mockRejectedValue(new Error('API Error'));
      getOllamaModel.mockReturnValue('test-model');
      getOllamaClient.mockResolvedValue(mockClient);

      const result = await analyzeTextWithOllama('Test content', 'test.pdf');

      // API error happens before retryWithBackoff is called
      expect(result).toEqual({
        error: 'Ollama API error for document: API Error',
        keywords: [],
        confidence: 60,
        extractionMethod: 'unknown',
        category: 'document',
        suggestedName: null,
      });
    });

    test('validates and normalizes confidence values', async () => {
      const mockResponse = {
        response: JSON.stringify({
          date: '2023-12-01',
          project: 'Test Project',
          purpose: 'Testing document analysis',
          category: 'Research',
          keywords: ['test'],
          confidence: 150, // Invalid confidence
          suggestedName: 'test_doc',
        }),
      };

      loadOllamaConfig.mockResolvedValue({ selectedTextModel: 'test-model' });
      getOllamaModel.mockReturnValue('test-model');
      getOllamaClient.mockResolvedValue(mockClient);
      mockClient.generate.mockResolvedValue(mockResponse);

      const result = await analyzeTextWithOllama('Test content', 'test.pdf');

      // Since confidence 150 is > 100, it gets normalized to a random value 70-100
      expect(result.confidence).toBeGreaterThanOrEqual(70);
      expect(result.confidence).toBeLessThanOrEqual(100);
      expect(retryWithBackoff).toHaveBeenCalled();
    });

    test('handles invalid keywords array', async () => {
      const mockResponse = {
        response: JSON.stringify({
          date: '2023-12-01',
          project: 'Test Project',
          purpose: 'Testing document analysis',
          category: 'Research',
          keywords: 'not an array',
          confidence: 85,
          suggestedName: 'test_doc',
        }),
      };

      loadOllamaConfig.mockResolvedValue({ selectedTextModel: 'test-model' });
      getOllamaModel.mockReturnValue('test-model');
      getOllamaClient.mockResolvedValue(mockClient);
      mockClient.generate.mockResolvedValue(mockResponse);

      const result = await analyzeTextWithOllama('Test content', 'test.pdf');

      expect(retryWithBackoff).toHaveBeenCalled();
      expect(result.keywords).toEqual([]);
    });

    test('parses and normalizes date format', async () => {
      const mockResponse = {
        response: JSON.stringify({
          date: '2023-12-01', // Use ISO format that will parse correctly
          project: 'Test Project',
          purpose: 'Testing document analysis',
          category: 'Research',
          keywords: ['test'],
          confidence: 85,
          suggestedName: 'test_doc',
        }),
      };

      loadOllamaConfig.mockResolvedValue({ selectedTextModel: 'test-model' });
      getOllamaModel.mockReturnValue('test-model');
      getOllamaClient.mockResolvedValue(mockClient);
      mockClient.generate.mockResolvedValue(mockResponse);

      const result = await analyzeTextWithOllama('Test content', 'test.pdf');

      expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(retryWithBackoff).toHaveBeenCalled();
    });

    test('removes invalid date on parsing error', async () => {
      const mockResponse = {
        response: JSON.stringify({
          date: 'invalid date',
          project: 'Test Project',
          purpose: 'Testing document analysis',
          category: 'Research',
          keywords: ['test'],
          confidence: 85,
          suggestedName: 'test_doc',
        }),
      };

      loadOllamaConfig.mockResolvedValue({ selectedTextModel: 'test-model' });
      getOllamaModel.mockReturnValue('test-model');
      getOllamaClient.mockResolvedValue(mockClient);
      mockClient.generate.mockResolvedValue(mockResponse);

      const result = await analyzeTextWithOllama('Test content', 'test.pdf');

      expect(retryWithBackoff).toHaveBeenCalled();
      expect(result.date).toBeUndefined();
    });
  });
});
