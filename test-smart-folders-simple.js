// Simple test to check smart folders loading
const { loadCustomFolders } = require('./src/main/core/customFolders');

async function testSmartFolders() {
  try {
    console.log('Testing loadCustomFolders...');
    const customFolders = await loadCustomFolders();
    console.log('Custom folders loaded:', customFolders);
    console.log('Number of folders:', customFolders ? customFolders.length : 0);

    if (customFolders && customFolders.length > 0) {
      console.log('First folder:', JSON.stringify(customFolders[0], null, 2));
      console.log('All folders:', JSON.stringify(customFolders, null, 2));
    } else {
      console.log('No custom folders found!');
    }

    // Test the IPC handler logic
    console.log('\nTesting IPC handler logic...');
    const foldersWithStatus = await Promise.all(
      customFolders.map(async (folder) => {
        try {
          const fs = require('fs').promises;
          const stats = await fs.stat(folder.path || '/nonexistent');
          return { ...folder, physicallyExists: stats.isDirectory() };
        } catch {
          return { ...folder, physicallyExists: false };
        }
      }),
    );

    console.log(
      'Folders with status:',
      JSON.stringify(foldersWithStatus, null, 2),
    );
  } catch (error) {
    console.error('Error testing smart folders:', error);
  }
}

testSmartFolders();
