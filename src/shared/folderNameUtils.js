const { FOLDER_NAME_PATTERNS } = require('./constants');

const STOPWORDS = [
  'to',
  'for',
  'the',
  'and',
  'with',
  'from',
  'that',
  'this',
  'provide',
  'ensure',
  'help',
  'assist',
];

function sanitizeLLMFolderName(rawName) {
  if (!rawName) return 'General';
  let candidate = String(rawName)
    .split(/[\\/:,.;?!\n]/)[0]
    .replace(/^["']|["']$/g, '')
    .trim();
  candidate = candidate.replace(/[^A-Za-z0-9 _-]/g, '').trim();
  const words = candidate.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 3) return 'General';
  if (words.some((w) => STOPWORDS.includes(w.toLowerCase()))) return 'General';

  if (words.length > 1) {
    candidate = words
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join('');
  } else {
    candidate = words[0];
    if (!FOLDER_NAME_PATTERNS.some((r) => r.test(candidate))) {
      candidate = candidate.charAt(0).toUpperCase() + candidate.slice(1);
    }
  }

  let normalized = candidate.replace(/[^A-Za-z0-9_-]/g, '');
  if (normalized.length > 50) {
    normalized = normalized.slice(0, 50);
  }
  if (!normalized || !FOLDER_NAME_PATTERNS.some((r) => r.test(normalized))) {
    return 'General';
  }
  return normalized;
}

module.exports = { sanitizeLLMFolderName };
