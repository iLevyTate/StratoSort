/**
 * Ollama AI Service Mock for Testing
 * Provides controllable mock responses for AI analysis and processing
 */

// Mock Ollama client class
const MockOllamaClient = jest.fn().mockImplementation((config = {}) => ({
  config,
  isConnected: jest.fn(() => true),

  // Core AI methods
  chat: jest.fn().mockImplementation(async (options) => {
    // Default mock response based on the prompt content
    const prompt = options.messages?.[0]?.content || '';
    let mockResponse = '';

    if (
      prompt.toLowerCase().includes('categorize') ||
      prompt.toLowerCase().includes('classify')
    ) {
      mockResponse =
        'Category: Financial\nPurpose: Invoice processing\nKeywords: invoice, payment, financial\nConfidence: 0.92';
    } else if (prompt.toLowerCase().includes('extract')) {
      mockResponse =
        'Extracted text: Sample document content for testing purposes.';
    } else if (prompt.toLowerCase().includes('summarize')) {
      mockResponse =
        'Summary: This is a test document containing sample content for testing AI processing capabilities.';
    } else {
      mockResponse = 'AI analysis completed successfully for test document.';
    }

    return {
      message: { content: mockResponse },
      done: true,
      model: config.model || 'llama2',
      created_at: new Date().toISOString(),
      total_duration: 1000000000, // 1 second in nanoseconds
      load_duration: 500000000, // 0.5 seconds
      prompt_eval_count: 10,
      eval_count: 20,
      eval_duration: 500000000,
    };
  }),

  generate: jest.fn().mockImplementation(async (options) => {
    const prompt = options.prompt || '';
    let mockContent = '';

    if (
      prompt.toLowerCase().includes('organize') ||
      prompt.toLowerCase().includes('folder')
    ) {
      mockContent = 'Suggested organization: Documents/Financial/Invoices';
    } else if (prompt.toLowerCase().includes('analyze')) {
      mockContent =
        'Analysis: This appears to be a business document with financial content.';
    } else {
      mockContent = 'Generated content for testing purposes.';
    }

    return {
      response: mockContent,
      done: true,
      model: options.model || 'llama2',
      created_at: new Date().toISOString(),
      total_duration: 800000000,
      load_duration: 300000000,
      prompt_eval_count: 8,
      eval_count: 15,
      eval_duration: 500000000,
    };
  }),

  // Streaming methods
  chatStream: jest.fn().mockImplementation(async function* (options) {
    const fullResponse = await this.chat(options);
    const words = fullResponse.message.content.split(' ');

    for (let i = 0; i < words.length; i++) {
      yield {
        message: { content: words.slice(0, i + 1).join(' ') },
        done: i === words.length - 1,
        model: options.model || 'llama2',
      };
    }
  }),

  generateStream: jest.fn().mockImplementation(async function* (options) {
    const fullResponse = await this.generate(options);
    const words = fullResponse.response.split(' ');

    for (let i = 0; i < words.length; i++) {
      yield {
        response: words.slice(0, i + 1).join(' '),
        done: i === words.length - 1,
        model: options.model || 'llama2',
      };
    }
  }),

  // Model management methods
  list: jest.fn().mockResolvedValue({
    models: [
      {
        name: 'llama2',
        modified_at: new Date().toISOString(),
        size: 1000000000,
        digest: 'mock-digest-123',
        details: {
          format: 'gguf',
          family: 'llama',
          families: ['llama'],
          parameter_size: '7B',
          quantization_level: 'Q4_0',
        },
      },
      {
        name: 'codellama',
        modified_at: new Date().toISOString(),
        size: 800000000,
        digest: 'mock-digest-456',
        details: {
          format: 'gguf',
          family: 'llama',
          families: ['llama'],
          parameter_size: '7B',
          quantization_level: 'Q4_0',
        },
      },
    ],
  }),

  show: jest.fn().mockImplementation(async (modelName) => {
    return {
      license: 'MIT',
      modelfile: '# Mock model file',
      parameters: 'mock parameters',
      template: 'mock template',
      details: {
        format: 'gguf',
        family: 'llama',
        families: ['llama'],
        parameter_size: '7B',
        quantization_level: 'Q4_0',
      },
      model_info: {
        'general.architecture': 'llama',
        'general.file_type': 2,
      },
    };
  }),

  // Connection and health methods
  ps: jest.fn().mockResolvedValue({
    models: [
      {
        name: 'llama2',
        size: 1000000000,
        size_vram: 500000000,
        digest: 'mock-digest-123',
        details: {
          format: 'gguf',
          family: 'llama',
          families: ['llama'],
          parameter_size: '7B',
          quantization_level: 'Q4_0',
        },
        expires_at: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
      },
    ],
  }),

  // Utility methods for testing
  abort: jest.fn().mockResolvedValue(true),
}));

// Test utilities for configuring mock behavior
const mockUtils = {
  // Configure mock to simulate connection errors
  simulateConnectionError: () => {
    MockOllamaClient.mockImplementation(() => {
      throw new Error('Connection refused');
    });
  },

  // Configure mock to simulate timeout
  simulateTimeout: () => {
    MockOllamaClient.mockImplementation(() => ({
      chat: jest.fn(
        () =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), 100),
          ),
      ),
      generate: jest.fn(
        () =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), 100),
          ),
      ),
    }));
  },

  // Configure mock to return specific responses
  configureResponse: (method, response) => {
    const instance = new MockOllamaClient();
    instance[method].mockResolvedValue(response);
    return instance;
  },

  // Configure mock to simulate streaming responses
  simulateStreamingResponse: (content, chunks = 3) => {
    const words = content.split(' ');
    const chunkSize = Math.ceil(words.length / chunks);
    const chunksArray = [];

    for (let i = 0; i < chunks; i++) {
      const start = i * chunkSize;
      const end = Math.min((i + 1) * chunkSize, words.length);
      chunksArray.push(words.slice(start, end).join(' '));
    }

    return chunksArray;
  },

  // Reset all mock configurations
  reset: () => {
    jest.clearAllMocks();
  },
};

// Export both the mock class and utilities
const mockOllamaService = {
  Ollama: MockOllamaClient,
  utils: mockUtils,
  analyze: jest.fn().mockImplementation(async (content) => {
    // Default analysis response
    return {
      status: 'success',
      analysis: {
        category: 'Financial',
        purpose: 'Document analysis',
        keywords: ['test', 'mock', 'analysis'],
        confidence: 0.85,
        suggestedFolder: 'Financial/Documents',
        suggestedName: 'analyzed-document.pdf',
      },
    };
  }),

  isConnected: jest.fn(() => true),
  connect: jest.fn().mockResolvedValue(true),
  disconnect: jest.fn().mockResolvedValue(true),
};

// Export the mock
module.exports = mockOllamaService;
