/**
 * Mock for node-tesseract-ocr package
 * Provides test-friendly mocks for OCR functionality
 */

const mockTesseract = {
  recognize: jest.fn().mockResolvedValue('Mock OCR extracted text from image'),

  // Config options mock
  PSM: {
    SINGLE_BLOCK: 6,
    SINGLE_WORD: 8,
    SINGLE_CHAR: 10,
  },

  OEM: {
    TESSERACT_ONLY: 0,
    LSTM_ONLY: 1,
    TESSERACT_LSTM_COMBINED: 2,
    DEFAULT: 3,
  },
};

module.exports = mockTesseract;
