const { isSafePath } = require('../../src/main/ipc/pathValidation');

describe('files IPC path validation - simple', () => {
  test('safe path passes validation', () => {
    expect(isSafePath('documents/report.pdf')).toBe(true);
  });
  test('traversal path fails validation', () => {
    expect(isSafePath('../secret.txt')).toBe(false);
  });
});
