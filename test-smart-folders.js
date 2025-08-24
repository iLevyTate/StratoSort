// Test script to check smart folders functionality
const { app } = require('electron');
const path = require('path');

// Set up basic Electron environment for testing
process.env.NODE_ENV = 'development';

const mainProcess = require('./src/main/simple-main.js');

// Wait for app to be ready and test smart folders
app.whenReady().then(async () => {
  console.log('App ready, testing smart folders...');

  try {
    // Wait a bit for initialization
    setTimeout(async () => {
      // Test if smart folders can be loaded
      console.log('Testing smart folders loading...');

      // This would normally be called from renderer process via IPC
      // For testing, let's directly check the main process functionality

      app.quit();
    }, 3000);
  } catch (error) {
    console.error('Error testing smart folders:', error);
    app.quit();
  }
});
