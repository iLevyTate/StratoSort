const { sanitizeLLMFolderName } = require('../src/shared/folderNameUtils');

describe('sanitizeLLMFolderName', () => {
  test('converts simple phrases to PascalCase', () => {
    expect(sanitizeLLMFolderName('financial reports')).toBe('FinancialReports');
    expect(sanitizeLLMFolderName('project-x')).toBe('project-x');
  });

  test('rejects descriptive sentences', () => {
    const sentence =
      'To provide financial assistance for dental treatment to those who cannot afford it';
    expect(sanitizeLLMFolderName(sentence)).toBe('General');
  });

  test('rejects inputs with stopwords or many words', () => {
    expect(sanitizeLLMFolderName('This is a descriptive sentence')).toBe(
      'General',
    );
    expect(sanitizeLLMFolderName('grant funding application for college')).toBe(
      'General',
    );
  });
});
