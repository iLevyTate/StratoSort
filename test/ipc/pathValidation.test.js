const {
  isSafePath,
  isShellSafePath,
} = require('../../src/main/ipc/pathValidation');

describe('pathValidation', () => {
  test('isSafePath rejects non-strings and long inputs', () => {
    expect(isSafePath(null)).toBe(false);
    expect(isSafePath(123)).toBe(false);
    expect(isSafePath('a'.repeat(5000))).toBe(false);
  });

  test('isSafePath accepts normal paths', () => {
    expect(isSafePath('folder/file.txt')).toBe(true);
    expect(isSafePath('./relative/path.txt')).toBe(true);
  });

  test('isShellSafePath blocks system directories', () => {
    expect(isShellSafePath('/Windows/system32/secret.exe')).toBe(false);
  });

  test('isShellSafePath allows common safe paths', () => {
    expect(isShellSafePath('/home/user/docs')).toBe(true);
    expect(isShellSafePath('C:\\Users\\User\\Documents\\file.txt')).toBe(true);
  });
});
