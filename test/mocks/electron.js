module.exports = {
  ipcRenderer: {
    invoke: jest.fn(),
    on: jest.fn(),
    send: jest.fn()
  },
  ipcMain: {
    _handlers: new Map(),
    handle: jest.fn(function(channel, handler) {
      module.exports.ipcMain._handlers.set(channel, handler);
    })
  },
  dialog: {
    showOpenDialog: jest.fn(async () => ({ canceled: true, filePaths: [] }))
  },
  shell: {
    openPath: jest.fn(async () => {}),
    showItemInFolder: jest.fn(async () => {})
  },
  app: {
    getPath: jest.fn(() => '/test/path')
  }
};