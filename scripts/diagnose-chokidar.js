#!/usr/bin/env node

/**
 * Chokidar Diagnostic Script
 * Helps diagnose and troubleshoot chokidar-related issues in StratoSort
 */

const fs = require('fs').promises;
const path = require('path');
const chokidar = require('chokidar');
const os = require('os');

class ChokidarDiagnostic {
  constructor() {
    this.results = {
      system: {},
      chokidar: {},
      filesystem: {},
      recommendations: [],
    };
  }

  async run() {
    console.log('🔍 StratoSort Chokidar Diagnostic Tool');
    console.log('='.repeat(50));

    await this.checkSystemInfo();
    await this.checkChokidarVersion();
    await this.checkFileSystem();
    await this.testChokidarBasic();
    await this.checkDownloadsFolder();
    await this.generateReport();

    return this.results;
  }

  async checkSystemInfo() {
    console.log('\n📊 System Information:');
    this.results.system = {
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      electronVersion: process.versions.electron || 'N/A',
      totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024) + 'GB',
      freeMemory: Math.round(os.freemem() / 1024 / 1024 / 1024) + 'GB',
    };

    Object.entries(this.results.system).forEach(([key, value]) => {
      console.log(`   ${key}: ${value}`);
    });
  }

  async checkChokidarVersion() {
    console.log('\n📦 Chokidar Information:');
    try {
      const packagePath = path.join(
        process.cwd(),
        'node_modules',
        'chokidar',
        'package.json',
      );
      const packageInfo = JSON.parse(await fs.readFile(packagePath, 'utf8'));

      this.results.chokidar = {
        version: packageInfo.version,
        description: packageInfo.description,
        homepage: packageInfo.homepage,
      };

      console.log(`   Version: ${packageInfo.version}`);
      console.log(`   Description: ${packageInfo.description}`);
    } catch (error) {
      console.log('   ❌ Could not read chokidar package info');
      this.results.chokidar.error = error.message;
    }
  }

  async checkFileSystem() {
    console.log('\n💾 File System Check:');
    try {
      const tempDir = os.tmpdir();
      const testFile = path.join(tempDir, 'chokidar-test-' + Date.now());

      // Test file creation
      await fs.writeFile(testFile, 'test content');
      console.log('   ✅ File creation: OK');

      // Test file reading
      const content = await fs.readFile(testFile, 'utf8');
      console.log('   ✅ File reading: OK');

      // Test file deletion
      await fs.unlink(testFile);
      console.log('   ✅ File deletion: OK');

      this.results.filesystem = {
        tempDirAccessible: true,
        fileOperations: 'OK',
      };
    } catch (error) {
      console.log(`   ❌ File system error: ${error.message}`);
      this.results.filesystem.error = error.message;
    }
  }

  async testChokidarBasic() {
    console.log('\n🔍 Basic Chokidar Test:');
    return new Promise((resolve) => {
      const tempDir = os.tmpdir();
      const testDir = path.join(tempDir, 'chokidar-test-dir-' + Date.now());

      // Create test directory
      fs.mkdir(testDir)
        .then(() => {
          const watcher = chokidar.watch(testDir, {
            ignoreInitial: true,
            usePolling: os.platform() === 'win32',
          });

          const events = [];
          watcher.on('add', (filePath) => {
            events.push({ type: 'add', path: filePath });
          });

          watcher.on('ready', async () => {
            console.log('   ✅ Watcher ready');

            // Create test file
            const testFile = path.join(testDir, 'test.txt');
            await fs.writeFile(testFile, 'test content');

            // Wait a bit for the event
            setTimeout(async () => {
              console.log(`   ✅ Events detected: ${events.length}`);

              // Cleanup
              watcher.close();
              await fs.unlink(testFile);
              await fs.rmdir(testDir);

              this.results.chokidar.basicTest = {
                eventsDetected: events.length,
                testSuccessful: events.length > 0,
              };

              resolve();
            }, 1000);
          });

          watcher.on('error', (error) => {
            console.log(`   ❌ Watcher error: ${error.message}`);
            this.results.chokidar.basicTest = {
              error: error.message,
              testSuccessful: false,
            };
            resolve();
          });
        })
        .catch((error) => {
          console.log(
            `   ❌ Could not create test directory: ${error.message}`,
          );
          resolve();
        });
    });
  }

  async checkDownloadsFolder() {
    console.log('\n📁 Downloads Folder Check:');
    try {
      // This would normally use Electron's app.getPath, but we'll check common locations
      const homeDir = os.homedir();
      const possiblePaths = [
        path.join(homeDir, 'Downloads'),
        path.join(homeDir, 'Download'),
        path.join(homeDir, 'downloads'),
      ];

      let foundPath = null;
      for (const testPath of possiblePaths) {
        try {
          await fs.access(testPath);
          foundPath = testPath;
          break;
        } catch (e) {
          // Continue to next path
        }
      }

      if (foundPath) {
        console.log(`   ✅ Downloads folder found: ${foundPath}`);

        // Test creating a file in downloads
        const testFile = path.join(
          foundPath,
          'chokidar-test-' + Date.now() + '.tmp',
        );
        await fs.writeFile(testFile, 'test');
        await fs.unlink(testFile);
        console.log('   ✅ Downloads folder writable');

        this.results.filesystem.downloadsFolder = {
          path: foundPath,
          writable: true,
        };
      } else {
        console.log('   ⚠️  No standard downloads folder found');
        this.results.filesystem.downloadsFolder = {
          found: false,
        };
      }
    } catch (error) {
      console.log(`   ❌ Downloads folder error: ${error.message}`);
      this.results.filesystem.downloadsFolder = {
        error: error.message,
      };
    }
  }

  async generateReport() {
    console.log('\n📋 DIAGNOSTIC REPORT');
    console.log('='.repeat(50));

    // Check for common issues
    if (os.platform() === 'win32') {
      this.results.recommendations.push(
        'Windows detected - chokidar is configured to use polling for better compatibility',
      );
    }

    if (
      this.results.filesystem.downloadsFolder &&
      !this.results.filesystem.downloadsFolder.writable
    ) {
      this.results.recommendations.push(
        'Downloads folder is not writable - this may cause chokidar issues',
      );
    }

    if (
      this.results.chokidar.basicTest &&
      !this.results.chokidar.basicTest.testSuccessful
    ) {
      this.results.recommendations.push(
        'Basic chokidar test failed - there may be file system issues',
      );
    }

    console.log('\n💡 RECOMMENDATIONS:');
    if (this.results.recommendations.length > 0) {
      this.results.recommendations.forEach((rec, index) => {
        console.log(`   ${index + 1}. ${rec}`);
      });
    } else {
      console.log('   ✅ No issues detected');
    }

    console.log('\n🚀 QUICK FIXES:');
    console.log('   1. Restart the application');
    console.log(
      '   2. Set DISABLE_DOWNLOAD_WATCHER=true to disable the watcher temporarily',
    );
    console.log('   3. Check file system permissions');
    console.log('   4. Ensure no antivirus is blocking file operations');

    console.log('\n🔧 ADVANCED DIAGNOSTICS:');
    console.log('   • Check logs for chokidar-specific errors');
    console.log('   • Monitor memory usage for potential leaks');
    console.log('   • Test with smaller file sets');

    console.log('\n' + '='.repeat(50));
  }
}

// Run diagnostics if called directly
if (require.main === module) {
  const diagnostic = new ChokidarDiagnostic();
  diagnostic
    .run()
    .then(() => {
      console.log('\n✅ Chokidar diagnostic completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Diagnostic failed:', error);
      process.exit(1);
    });
}

module.exports = ChokidarDiagnostic;
