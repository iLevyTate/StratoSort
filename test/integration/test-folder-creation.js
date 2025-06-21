const fs = require('fs').promises;
const os = require('os');
const path = require('path');

// Test the folder creation logic
async function testFolderCreation() {
  console.log('🧪 Testing Stratosort Folder Creation Logic...\n');
    
  try {
    // 1. Test getting Documents path
    const documentsPath = path.join(os.homedir(), 'Documents');
    console.log(`📁 Documents Path: ${documentsPath}`);
        
    // 2. Test creating Stratosort-Organized base folder
    const stratosortBasePath = path.join(documentsPath, 'Stratosort-Organized');
    console.log(`📂 Stratosort Base Path: ${stratosortBasePath}`);
        
    try {
      await fs.mkdir(stratosortBasePath, { recursive: true });
      console.log('✅ Stratosort-Organized folder created/exists');
    } catch (error) {
      console.log(`❌ Error creating base folder: ${error.message}`);
      return;
    }
        
    // 3. Test creating sample folders inside Stratosort-Organized
    const testFolders = [
      'Financial Documents',
      'Project Files',
      'Personal Documents',
      'General Documents'
    ];
        
    for (const folderName of testFolders) {
      try {
        const fullPath = path.join(stratosortBasePath, folderName);
        await fs.mkdir(fullPath, { recursive: true });
        console.log(`✅ Created: ${fullPath}`);
      } catch (error) {
        console.log(`❌ Failed to create ${folderName}: ${error.message}`);
      }
    }
        
    // 4. Verify folder structure
    console.log('\n📋 Verifying folder structure...');
    try {
      const items = await fs.readdir(stratosortBasePath, { withFileTypes: true });
      const folders = items.filter((item) => item.isDirectory()).map((item) => item.name);
      console.log('📂 Found folders:', folders);
            
      if (folders.length === testFolders.length) {
        console.log('✅ All folders created successfully!');
      } else {
        console.log(`⚠️  Expected ${testFolders.length} folders, found ${folders.length}`);
      }
    } catch (error) {
      console.log(`❌ Error reading folder structure: ${error.message}`);
    }
        
    // 5. Test folder path resolution
    console.log('\n🔍 Testing path resolution...');
    const testPath = path.join(stratosortBasePath, 'Test Folder');
    console.log(`Test Path: ${testPath}`);
    console.log(`Path exists: ${require('fs').existsSync(testPath) ? 'Yes' : 'No'}`);
        
    console.log('\n🎉 Folder creation test completed!');
        
  } catch (error) {
    console.error('💥 Test failed:', error);
  }
}

// Run the test
testFolderCreation().then(() => {
  console.log('\n✨ Test finished. Press Ctrl+C to exit.');
}); 