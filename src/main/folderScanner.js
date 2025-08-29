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
  depth = 0,
  maxDepth = 10,
) {
  // Prevent infinite recursion by limiting depth
  if (depth > maxDepth) {
    return [];
  }

  // Validate input parameters
  if (!dirPath || typeof dirPath !== 'string') {
    throw new Error('Invalid directory path provided');
  }

  if (!Array.isArray(ignorePatterns)) {
    ignorePatterns = DEFAULT_IGNORE_PATTERNS;
  }

  const items = [];
  let dirents;

  try {
    dirents = await fs.readdir(dirPath, { withFileTypes: true });

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

      try {
        const stats = await fs.stat(itemPath);
        const itemInfo = {
          name: itemName,
          path: itemPath,
          type: dirent.isDirectory() ? 'folder' : 'file',
          size: stats.size,
          modified: stats.mtime,
        };

        if (dirent.isDirectory()) {
          try {
            itemInfo.children = await scanDirectory(
              itemPath,
              ignorePatterns,
              depth + 1,
              maxDepth,
            );
          } catch (subdirError) {
            // If subdirectory scan fails, still include the directory but with empty children
            console.warn(
              `Failed to scan subdirectory ${itemPath}:`,
              subdirError.message,
            );
            itemInfo.children = [];
            itemInfo.error = 'Failed to scan subdirectory';
          }
        }
        items.push(itemInfo);
      } catch (statError) {
        // Skip files/directories that can't be stat'ed (permission issues, etc.)
        console.warn(`Failed to stat ${itemPath}:`, statError.message);
        continue;
      }
    }
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      // Directory no longer exists; skip gracefully
      return [];
    }
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
