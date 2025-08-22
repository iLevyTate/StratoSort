const AutoOrganizeService = require('../src/main/services/AutoOrganizeService');

describe('AutoOrganizeService.applyNamingConvention', () => {
  test('uses suggestedName when applying naming conventions', () => {
    const service = new AutoOrganizeService({
      suggestionService: {},
      settingsService: {},
      folderMatchingService: {},
      undoRedoService: {},
    });

    const file = {
      name: 'oldfile.pdf',
      analysis: {
        suggestedName: 'new_name',
        date: '2024-05-01',
      },
    };

    const naming = {
      convention: 'subject-date',
      dateFormat: 'YYYYMMDD',
      separator: '-',
      caseConvention: 'kebab-case',
    };

    const result = service.applyNamingConvention(file, naming);
    expect(result).toBe('new-name-20240501.pdf');
  });

  test('falls back to original name when no suggestedName provided', () => {
    const service = new AutoOrganizeService({
      suggestionService: {},
      settingsService: {},
      folderMatchingService: {},
      undoRedoService: {},
    });

    const file = {
      name: 'oldfile.pdf',
      analysis: {
        date: '2024-05-01',
      },
    };

    const naming = {
      convention: 'subject-date',
      dateFormat: 'YYYYMMDD',
      separator: '-',
      caseConvention: 'kebab-case',
    };

    const result = service.applyNamingConvention(file, naming);
    expect(result).toBe('oldfile-20240501.pdf');
  });
});
