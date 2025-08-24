// Debug script to test smart folders functionality
const { app } = require('electron');
const path = require('path');

// Set up basic Electron environment for testing
process.env.NODE_ENV = 'development';

console.log('Starting smart folders debug test...');

app.whenReady().then(async () => {
  console.log('App ready, testing smart folders...');

  try {
    // Load the main process modules
    const { loadCustomFolders } = require('./src/main/core/customFolders');

    // Test loading custom folders directly
    console.log('Testing loadCustomFolders...');
    const customFolders = await loadCustomFolders();
    console.log('Custom folders loaded:', customFolders);
    console.log('Number of folders:', customFolders ? customFolders.length : 0);

    if (customFolders && customFolders.length > 0) {
      console.log('First folder:', JSON.stringify(customFolders[0], null, 2));
    }

    // Test the smart folders IPC handler
    console.log('Testing smart folders IPC handler...');
    const { registerSmartFoldersIpc } = require('./src/main/ipc/smartFolders');

    // Mock the required dependencies
    const mockIpcMain = {
      handle: (channel, handler) => {
        console.log(`Registered IPC handler for: ${channel}`);
        return handler;
      },
    };

    const mockLogger = {
      info: (message, ...args) => console.log('[INFO]', message, ...args),
      error: (message, ...args) => console.error('[ERROR]', message, ...args),
      warn: (message, ...args) => console.warn('[WARN]', message, ...args),
    };

    const IPC_CHANNELS = require('./src/shared/constants').IPC_CHANNELS;

    const getCustomFolders = () => customFolders;
    const setCustomFolders = (folders) => {
      console.log('setCustomFolders called with:', folders.length, 'folders');
    };
    const saveCustomFolders = async (folders) => {
      console.log('saveCustomFolders called with:', folders.length, 'folders');
    };

    // Register the IPC handler
    registerSmartFoldersIpc({
      ipcMain: mockIpcMain,
      IPC_CHANNELS,
      logger: mockLogger,
      getCustomFolders,
      setCustomFolders,
      saveCustomFolders,
      buildOllamaOptions: () => ({}),
      getOllamaModel: () => 'llama3.2:latest',
      scanDirectory: () => Promise.resolve([]),
    });

    console.log('Smart folders debug test completed successfully');
  } catch (error) {
    console.error('Error in smart folders debug test:', error);
  } finally {
    app.quit();
  }
});
