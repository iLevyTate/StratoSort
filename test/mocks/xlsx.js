/**
 * Mock for xlsx-populate package
 * Provides test-friendly mocks for Excel file processing
 */

const mockWorkbook = {
  sheet: jest.fn().mockReturnValue({
    name: jest.fn().mockReturnValue('Sheet1'),
    cell: jest.fn().mockReturnValue({
      value: jest.fn().mockReturnValue('Mock Cell Value'),
      style: jest.fn().mockReturnThis(),
    }),
    range: jest.fn().mockReturnValue({
      value: jest.fn().mockReturnValue([
        ['A1', 'B1'],
        ['A2', 'B2'],
      ]),
      style: jest.fn().mockReturnThis(),
    }),
    usedRange: jest.fn().mockReturnValue({
      value: jest.fn().mockReturnValue([
        ['Header1', 'Header2'],
        ['Data1', 'Data2'],
      ]),
    }),
  }),
  sheets: jest
    .fn()
    .mockReturnValue([{ name: jest.fn().mockReturnValue('Sheet1') }]),
  addSheet: jest.fn().mockReturnValue({
    name: jest.fn().mockReturnValue('NewSheet'),
  }),
  deleteSheet: jest.fn().mockReturnThis(),
  toFileAsync: jest.fn().mockResolvedValue(Buffer.from('mock-xlsx-buffer')),
};

const mockXlsx = {
  fromFileAsync: jest.fn().mockResolvedValue(mockWorkbook),
  fromDataAsync: jest.fn().mockResolvedValue(mockWorkbook),
  fromBlankAsync: jest.fn().mockResolvedValue(mockWorkbook),

  // Additional utilities
  dateToExcel: jest.fn().mockReturnValue(44197), // Mock Excel date serial
  excelToDate: jest.fn().mockReturnValue(new Date('2024-01-01')),
};

module.exports = mockXlsx;
