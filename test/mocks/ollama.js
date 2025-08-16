// Simple mock for Ollama used by unit tests

// Provide a mock class with the minimal API used by analysis modules
class Ollama {
  constructor() {}
  async generate() {
    return {
      response: JSON.stringify({
        category: 'General',
        keywords: ['mock'],
        confidence: 80,
        suggestedName: 'mock_file',
      }),
    };
  }
  async embeddings() {
    return { embedding: Array.from({ length: 10 }, () => 0.1) };
  }
  async list() {
    return { models: [{ name: 'llama3.2:latest' }] };
  }
}

const mockOllamaService = {
  analyze: jest.fn(),
  isConnected: jest.fn(),
};

module.exports = { mockOllamaService, Ollama };
