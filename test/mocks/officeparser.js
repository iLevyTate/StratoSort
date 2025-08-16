/**
 * Mock for officeparser package
 * Provides test-friendly mocks for document parsing
 */

const mockOfficeParser = {
  parseOfficeAsync: jest.fn().mockResolvedValue({
    text: 'Mock document text content',
    metadata: {
      title: 'Mock Document Title',
      author: 'Mock Author',
      pages: 1,
      wordCount: 10,
    },
  }),

  parseOffice: jest.fn().mockReturnValue({
    text: 'Mock document text content',
    metadata: {
      title: 'Mock Document Title',
      author: 'Mock Author',
      pages: 1,
      wordCount: 10,
    },
  }),
};

module.exports = mockOfficeParser;
