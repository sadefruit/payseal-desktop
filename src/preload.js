const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('payseal', {
  // File operations
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  getPendingFile: () => ipcRenderer.invoke('get-pending-file'),

  // Auth
  login: (credentials) => ipcRenderer.invoke('login', credentials),
  me: (opts) => ipcRenderer.invoke('me', opts),

  // Documents
  seal: (data) => ipcRenderer.invoke('seal', data),

  // Storage
  store: {
    get: (key) => ipcRenderer.invoke('store-get', key),
    set: (key, value) => ipcRenderer.invoke('store-set', key, value),
    delete: (key) => ipcRenderer.invoke('store-delete', key),
  },

  // Window controls
  close: () => ipcRenderer.send('close-window'),
  minimize: () => ipcRenderer.send('minimize-window'),
  openExternal: (url) => ipcRenderer.send('open-external', url),

  // Listen for file opened event (warm-start case)
  onFileOpened: (callback) => {
    ipcRenderer.on('file-opened', (event, filePath) => callback(filePath))
  },
})