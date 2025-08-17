const fs = require('fs').promises;
const path = require('path');

const DEFAULT_IGNORE_PATTERNS = [
  '.DS_Store',
  'Thumbs.db',
  'desktop.ini',
  '.git',
  'node_modules',
  '__pycache__',
  // Add more common patterns if needed
];

async function scanDirectory(
  dirPath,
  ignorePatterns = DEFAULT_IGNORE_PATTERNS,
) {
  const items = [];
  try {
    const dirents = await fs.readdir(dirPath, { withFileTypes: true });

    for (const dirent of dirents) {
      if (dirent.isSymbolicLink()) {
        continue;
      }
      const itemName = dirent.name;
      const itemPath = path.join(dirPath, itemName);

      // Check against ignore patterns
      if (
        ignorePatterns.some((pattern) => {
          if (pattern.startsWith('*.')) {
            // Basic wildcard for extensions
            return itemName.endsWith(pattern.substring(1));
          }
          return itemName === pattern;
        })
      ) {
        continue;
      }

      const stats = await fs.stat(itemPath);
      const itemInfo = {
        name: itemName,
        path: itemPath,
        type: dirent.isDirectory() ? 'folder' : 'file',
        size: stats.size,
        modified: stats.mtime,
      };

      if (dirent.isDirectory()) {
        itemInfo.children = await scanDirectory(itemPath, ignorePatterns);
      }
      items.push(itemInfo);
    }
  } catch (error) {
    console.error(`Error scanning directory ${dirPath}:`, error);
    // Optionally, rethrow or return a specific error structure
    if (error.code === 'EACCES' || error.code === 'EPERM') {
      // Handle permission errors gracefully, e.g., by skipping the directory
      return [
        {
          name: path.basename(dirPath),
          path: dirPath,
          type: 'folder',
          error: 'Permission Denied',
          children: [],
        },
      ];
    }
    // For other errors, you might want to propagate them
    throw error;
  }
  return items;
}

module.exports = { scanDirectory, DEFAULT_IGNORE_PATTERNS };
