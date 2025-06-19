/**
 * Ollama Service Mock for Testing
 * Provides Jest mocks for Ollama functionality
 */

const mockOllamaService = {
  analyze: jest.fn().mockResolvedValue({
    status: 'success',
    analysis: {
      category: 'Financial',
      purpose: 'Invoice processing',
      keywords: ['invoice', 'payment', 'financial'],
      confidence: 0.92,
      suggestedFolder: 'Financial/Invoices',
      suggestedName: 'Invoice_Test_2024-06-04.pdf'
    }
  }),
  
  isConnected: jest.fn().mockReturnValue(true),
  
  processDocument: jest.fn().mockResolvedValue({
    status: 'processed',
    analysis: {
      category: 'Document',
      confidence: 0.8,
      keywords: ['test']
    }
  }),
  
  generate: jest.fn().mockResolvedValue({
    response: JSON.stringify({
      category: 'Financial',
      purpose: 'Test document',
      keywords: ['test', 'mock'],
      confidence: 0.85
    })
  }),
  
  list: jest.fn().mockResolvedValue({
    models: [
      { name: 'llama3.2:latest' },
      { name: 'llava:latest' }
    ]
  })
};

// Export both individual mocks and the service
module.exports = {
  Ollama: jest.fn().mockImplementation(() => mockOllamaService),
  mockOllamaService,
  ...mockOllamaService
}; 