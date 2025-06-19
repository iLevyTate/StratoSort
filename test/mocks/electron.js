module.exports = {
  ipcRenderer: {
    invoke: jest.fn(),
    on: jest.fn(),
    send: jest.fn()
  },
  app: {
    getPath: jest.fn(() => '/test/path')
  }
}; 