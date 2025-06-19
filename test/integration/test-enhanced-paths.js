const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Simulate the enhanced getStratosortBasePath function
function getStratosortBasePath() {
    try {
        // Simulate app.getPath('documents') - use the OS documents path
        const documentsPath = path.join(os.homedir(), 'Documents');
        if (documentsPath) {
            return path.join(documentsPath, 'Stratosort');
        }
    } catch (error) {
        console.warn('[PATH] Documents path not available:', error.message);
    }
    
    try {
        // Simulate app.getPath('userData') - use a user data equivalent
        const userDataPath = path.join(os.homedir(), '.config', 'Stratosort');
        return path.join(userDataPath, 'Stratosort');
    } catch (error) {
        console.warn('[PATH] User data path not available:', error.message);
    }
    
    // Final fallback to home directory
    const homePath = os.homedir();
    return path.join(homePath, 'Stratosort');
}

// Test the enhanced folder creation logic
async function testEnhancedPaths() {
    console.log('🧪 Testing Enhanced Cross-Platform Stratosort Paths...\n');
    
    try {
        // 1. Test the enhanced path resolution
        const stratosortBasePath = getStratosortBasePath();
        console.log(`📁 Enhanced Stratosort Base Path: ${stratosortBasePath}`);
        console.log(`🖥️  Platform: ${process.platform}`);
        console.log(`🏠 Home Directory: ${os.homedir()}`);
        
        // 2. Test creating the base Stratosort folder
        try {
            await fs.mkdir(stratosortBasePath, { recursive: true });
            console.log('✅ Enhanced Stratosort base folder created/exists');
        } catch (error) {
            console.log(`❌ Error creating base folder: ${error.message}`);
            return;
        }
        
        // 3. Test creating enhanced organizational structure
        const enhancedFolders = [
            'Financial Documents',
            'Project Files', 
            'Personal Documents',
            'Technical Documentation',
            'Images & Screenshots',
            'Media Files'
        ];
        
        console.log('\n📂 Creating enhanced folder structure...');
        for (const folderName of enhancedFolders) {
            try {
                const fullPath = path.join(stratosortBasePath, folderName);
                await fs.mkdir(fullPath, { recursive: true });
                console.log(`✅ Created: ${fullPath}`);
            } catch (error) {
                console.log(`❌ Failed to create ${folderName}: ${error.message}`);
            }
        }
        
        // 4. Verify cross-platform path handling
        console.log('\n🔍 Testing cross-platform path resolution...');
        const testPaths = [
            'Documents with Spaces',
            'Special-Characters_Folder',
            'Numbers123Folder',
            '中文文件夹' // Unicode test
        ];
        
        for (const testName of testPaths) {
            const testPath = path.join(stratosortBasePath, testName);
            try {
                await fs.mkdir(testPath, { recursive: true });
                console.log(`✅ Cross-platform test: ${testName} → ${testPath}`);
            } catch (error) {
                console.log(`❌ Failed cross-platform test: ${testName} - ${error.message}`);
            }
        }
        
        // 5. Verify folder structure
        console.log('\n📋 Verifying enhanced folder structure...');
        try {
            const items = await fs.readdir(stratosortBasePath, { withFileTypes: true });
            const folders = items.filter(item => item.isDirectory()).map(item => item.name);
            console.log('📂 Found folders:', folders);
            
            const expectedCount = enhancedFolders.length + testPaths.length;
            if (folders.length >= expectedCount) {
                console.log('✅ Enhanced folder structure created successfully!');
            } else {
                console.log(`⚠️  Expected at least ${expectedCount} folders, found ${folders.length}`);
            }
        } catch (error) {
            console.log(`❌ Error reading folder structure: ${error.message}`);
        }
        
        // 6. Test path accessibility
        console.log('\n🔐 Testing path accessibility...');
        try {
            const stats = await fs.stat(stratosortBasePath);
            console.log(`✅ Base path accessible: ${stats.isDirectory() ? 'Directory' : 'File'}`);
            console.log(`📊 Permissions: Read ${stats.mode & 0o444 ? '✅' : '❌'} Write ${stats.mode & 0o222 ? '✅' : '❌'}`);
        } catch (error) {
            console.log(`❌ Path accessibility test failed: ${error.message}`);
        }
        
        console.log('\n🎉 Enhanced path testing completed!');
        console.log(`🚀 Stratosort will use: ${stratosortBasePath}`);
        
    } catch (error) {
        console.error('💥 Enhanced path test failed:', error);
    }
}

// Run the enhanced test
testEnhancedPaths().then(() => {
    console.log('\n✨ Enhanced testing finished. Press Ctrl+C to exit.');
}); 