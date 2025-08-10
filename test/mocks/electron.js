const fs = require('fs');
const path = require('path');
const os = require('os');

// Ensure a writable temp directory is used for tests
const userDataPath = path.join(os.tmpdir(), 'stratosort-tests-userdata');
try {
  fs.mkdirSync(userDataPath, { recursive: true });
} catch {}

module.exports = {
  ipcRenderer: {
    invoke: jest.fn(),
    on: jest.fn(),
    send: jest.fn()
  },
  app: {
    getPath: jest.fn(() => userDataPath)
  }
}; 