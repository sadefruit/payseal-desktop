const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const https = require('https')

const API_BASE = 'payseal.io'

// Helper: make HTTPS POST request with redirect following
function httpsPost(reqPath, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)

    function doRequest(hostname, path) {
      const options = {
        hostname,
        port: 443,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          'x-payseal-client': 'desktop',
          'Host': hostname,
          ...extraHeaders,
        },
      }

      const req = https.request(options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const location = res.headers.location
          console.log('[REDIRECT] to:', location)
          try {
            const url = new URL(location)
            doRequest(url.hostname, url.pathname + url.search)
          } catch {
            doRequest(hostname, location)
          }
          return
        }

        let responseData = ''
        res.on('data', chunk => { responseData += chunk })
        res.on('end', () => {
          console.log('[RESPONSE] raw:', responseData.substring(0, 200))
          try {
            resolve({ status: res.statusCode, data: JSON.parse(responseData) })
          } catch (e) {
            reject(new Error('Invalid JSON response: ' + responseData.substring(0, 100)))
          }
        })
      })

      req.on('error', reject)
      req.write(data)
      req.end()
    }

    doRequest(API_BASE, reqPath)
  })
}

let mainWindow = null
let pendingFilePath = null
const isMac = process.platform === 'darwin'

// ── Single instance lock (Windows: prevents double-launch on right-click) ────
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (event, argv) => {
    const fp = getFileFromArgs(argv)
    if (fp) {
      pendingFilePath = fp
      if (mainWindow) {
        mainWindow.webContents.send('file-opened', fp)
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.focus()
      }
    }
  })
}

function createWindow(filePath) {
  if (mainWindow) {
    mainWindow.focus()
    if (filePath) {
      pendingFilePath = filePath
      mainWindow.webContents.send('file-opened', filePath)
    }
    return
  }

  mainWindow = new BrowserWindow({
    width: 440,
    height: 640,
    minWidth: 400,
    minHeight: 580,
    resizable: false,
    frame: isMac ? true : false,
    backgroundColor: '#ffffff',
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    trafficLightPosition: isMac ? { x: 12, y: 13 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  })

  mainWindow.loadFile(path.join(__dirname, 'index.html'))

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    // Store filePath as pending — renderer will pull it via getPendingFile()
    if (filePath) pendingFilePath = filePath
  })

  mainWindow.on('closed', () => { mainWindow = null })

  // Open DevTools for debugging
  // mainWindow.webContents.openDevTools()
}

function getFileFromArgs(argv) {
  const args = argv || process.argv
  return args.find(arg =>
    arg !== process.execPath &&
    !arg.startsWith('--') &&
    arg.endsWith('.pdf') &&
    fs.existsSync(arg)
  ) || null
}

app.on('open-file', (event, filePath) => {
  event.preventDefault()
  pendingFilePath = filePath
  if (mainWindow) {
    mainWindow.webContents.send('file-opened', filePath)
    mainWindow.focus()
  } else if (app.isReady()) {
    createWindow(filePath)
  }
})

app.whenReady().then(() => {
  createWindow(getFileFromArgs())
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

// ── IPC handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('get-pending-file', async () => {
  const fp = pendingFilePath
  pendingFilePath = null
  return fp
})

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const buffer = fs.readFileSync(filePath)
    return { ok: true, base64: `data:application/pdf;base64,${buffer.toString('base64')}`, fileName: path.basename(filePath) }
  } catch (err) { return { ok: false, error: err.message } }
})

ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select a payslip', filters: [{ name: 'PDF Files', extensions: ['pdf'] }], properties: ['openFile'],
  })
  if (result.canceled || !result.filePaths.length) return { ok: false }
  const filePath = result.filePaths[0]
  const buffer = fs.readFileSync(filePath)
  return { ok: true, base64: `data:application/pdf;base64,${buffer.toString('base64')}`, fileName: path.basename(filePath), filePath }
})

ipcMain.handle('login', async (event, { email, password }) => {
  try {
    console.log('[LOGIN] Connecting to payseal.io...')
    const { status, data } = await httpsPost('/api/auth/desktop-login', { email, password })
    console.log('[LOGIN] Status:', status, 'Data:', JSON.stringify(data))
    if (status !== 200) return { ok: false, error: data.error || 'Login failed' }
    return { ok: true, user: data.user, token: data.token }
  } catch (err) {
    console.error('[LOGIN] Error:', err.message)
    return { ok: false, error: 'Connection failed: ' + err.message }
  }
})

ipcMain.handle('seal', async (event, { fileBase64, fileName, recipientEmail, recipientName, token }) => {
  try {
    console.log('[SEAL] Sealing document...')
    const { status, data } = await httpsPost('/api/documents/desktop-seal',
      { fileBase64, fileName, recipientEmail, recipientName },
      { 'Authorization': `Bearer ${token}` }
    )
    console.log('[SEAL] Status:', status)
    if (status !== 201) return { ok: false, error: data.error || 'Sealing failed' }
    return { ok: true, sealId: data.sealId, hash: data.hash }
  } catch (err) {
    console.error('[SEAL] Error:', err.message)
    return { ok: false, error: 'Connection failed: ' + err.message }
  }
})

ipcMain.on('close-window', () => mainWindow?.close())
ipcMain.on('minimize-window', () => mainWindow?.minimize())
ipcMain.on('open-external', (event, url) => shell.openExternal(url))

const Store = require('electron-store')
const store = new Store()
ipcMain.handle('store-get', (event, key) => store.get(key))
ipcMain.handle('store-set', (event, key, value) => { store.set(key, value); return true })
ipcMain.handle('store-delete', (event, key) => { store.delete(key); return true })