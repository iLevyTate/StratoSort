const path = require('path');

/**
 * Basic safe path validation to prevent directory traversal and malformed inputs.
 * Returns true if the inputPath is considered safe; false otherwise.
 */
function isSafePath(inputPath) {
  if (typeof inputPath !== 'string') return false;
  const normalized = path.normalize(inputPath);
  // Reject any directory traversal attempts
  if (normalized.includes('../') || normalized.includes('..\\')) return false;
  // Reject control characters and null bytes
  if (
    inputPath.includes('\0') ||
    inputPath.includes('\n') ||
    inputPath.includes('\r')
  )
    return false;
  // Basic length guard
  if (inputPath.length > 4096) return false;
  return true;
}

/**
 * Shell-safe path validation: build on top of isSafePath and block absolute system dirs.
 */
function isShellSafePath(inputPath) {
  if (!isSafePath(inputPath)) return false;
  const lower = inputPath.toLowerCase();
  const sensitivePaths = [
    '/system',
    '/windows',
    '/boot',
    '/etc',
    '/usr',
    '/bin',
    '/sbin',
    'c:\\windows',
    'c:\\system32',
    'c:\\program files',
    'c:\\program files (x86)',
    '/proc',
    '/sys',
    '/dev',
  ];
  return !sensitivePaths.some((s) => lower.includes(s.toLowerCase()));
}

module.exports = { isSafePath, isShellSafePath };
