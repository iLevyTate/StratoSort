#!/usr/bin/env node

/**
 * Simple test to verify file movement works
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

async function testBasicFileMove() {
  console.log('🧪 TESTING BASIC FILE MOVEMENT');
  console.log('=' .repeat(40));
  
  const testDir = path.join(os.tmpdir(), 'file-move-test');
  console.log('Test directory:', testDir);
  
  try {
    // Create test directory structure
    await fs.mkdir(testDir, { recursive: true });
    
    // Create a test file
    const sourceFile = path.join(testDir, 'test-document.txt');
    const testContent = 'This is a test document.\nCreated at: ' + new Date().toISOString();
    await fs.writeFile(sourceFile, testContent);
    console.log('✅ Created test file:', sourceFile);
    
    // Create target directory
    const targetDir = path.join(testDir, 'organized');
    await fs.mkdir(targetDir, { recursive: true });
    console.log('✅ Created target directory:', targetDir);
    
    // Test file move
    const targetFile = path.join(targetDir, 'moved-document.txt');
    console.log('\n🚀 Moving file...');
    console.log('  From:', sourceFile);
    console.log('  To:', targetFile);
    
    await fs.rename(sourceFile, targetFile);
    
    // Verify the move
    const sourceExists = await fs.access(sourceFile).then(() => true).catch(() => false);
    const targetExists = await fs.access(targetFile).then(() => true).catch(() => false);
    
    console.log('\n📊 Results:');
    console.log('  Source file exists:', sourceExists);
    console.log('  Target file exists:', targetExists);
    
    if (!sourceExists && targetExists) {
      console.log('✅ File move SUCCESSFUL!');
      
      // Read content to verify
      const movedContent = await fs.readFile(targetFile, 'utf8');
      console.log('📄 Content matches:', movedContent === testContent);
    } else {
      console.log('❌ File move FAILED!');
      return false;
    }
    
    // Clean up
    await fs.rm(testDir, { recursive: true, force: true });
    console.log('🧹 Cleaned up test files');
    
    return true;
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {}
    return false;
  }
}

async function testDocumentsDirectory() {
  console.log('\n📁 TESTING DOCUMENTS DIRECTORY ACCESS');
  console.log('=' .repeat(40));
  
  try {
    const homeDir = os.homedir();
    const documentsDir = path.join(homeDir, 'Documents');
    
    console.log('Home directory:', homeDir);
    console.log('Documents directory:', documentsDir);
    
    // Check if Documents directory exists
    const docsExists = await fs.access(documentsDir).then(() => true).catch(() => false);
    console.log('Documents directory exists:', docsExists);
    
    if (docsExists) {
      // Test creating a subdirectory
      const testSubDir = path.join(documentsDir, 'Stratosort-Test');
      await fs.mkdir(testSubDir, { recursive: true });
      console.log('✅ Can create subdirectory in Documents');
      
      // Clean up
      await fs.rmdir(testSubDir);
      console.log('🧹 Cleaned up test subdirectory');
    }
    
    return docsExists;
    
  } catch (error) {
    console.error('❌ Documents directory test failed:', error);
    return false;
  }
}

async function runFileTests() {
  console.log('🔍 FILE SYSTEM OPERATION TESTS\n');
  
  const basicMoveResult = await testBasicFileMove();
  const documentsResult = await testDocumentsDirectory();
  
  console.log('\n📊 TEST SUMMARY:');
  console.log('  Basic File Move:', basicMoveResult ? '✅ WORKING' : '❌ FAILED');
  console.log('  Documents Access:', documentsResult ? '✅ WORKING' : '❌ FAILED');
  
  if (basicMoveResult && documentsResult) {
    console.log('\n✅ File system operations are working correctly!');
    console.log('The issue is likely in the Electron app logic, not file operations.');
  } else {
    console.log('\n❌ File system issues detected!');
    if (!basicMoveResult) {
      console.log('  - Basic file movement is not working');
    }
    if (!documentsResult) {
      console.log('  - Cannot access Documents directory');
    }
  }
}

if (require.main === module) {
  runFileTests();
}

module.exports = { testBasicFileMove, testDocumentsDirectory }; 