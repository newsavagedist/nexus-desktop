import { app, BrowserWindow, Menu, MenuItem } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerIpcHandlers } from './ipc/tools.js'
import { initAutoUpdater } from './updater.js'
import { initRemoteCatalog } from './services/remoteCatalog.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')

const DEV_URL = 'http://localhost:5173'
const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev')

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'DaazNexus',
    webPreferences: {
      preload: path.join(ROOT, 'dist-electron', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL(DEV_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(ROOT, 'src', 'renderer', 'dist', 'index.html'))
  }

  // Electron windows have no native right-click menu by default (unlike a
  // regular browser) — build a minimal Copy/Cut/Paste/Select All one.
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const menu = new Menu()
    if (params.isEditable) {
      menu.append(new MenuItem({ label: 'Cortar', role: 'cut', enabled: params.editFlags.canCut }))
      menu.append(new MenuItem({ label: 'Copiar', role: 'copy', enabled: params.editFlags.canCopy }))
      menu.append(new MenuItem({ label: 'Colar', role: 'paste', enabled: params.editFlags.canPaste }))
      menu.append(new MenuItem({ type: 'separator' }))
      menu.append(new MenuItem({ label: 'Selecionar tudo', role: 'selectAll' }))
    } else if (params.selectionText) {
      menu.append(new MenuItem({ label: 'Copiar', role: 'copy' }))
      menu.append(new MenuItem({ type: 'separator' }))
      menu.append(new MenuItem({ label: 'Selecionar tudo', role: 'selectAll' }))
    } else {
      menu.append(new MenuItem({ label: 'Selecionar tudo', role: 'selectAll' }))
    }
    menu.popup()
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error(`[electron] Failed to load: ${errorDescription} (${errorCode})`)
  })

  mainWindow.webContents.on('console-message', (_event, _level, message) => {
    if (message.includes('[electron]')) {
      console.log(message)
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  registerIpcHandlers()
  initRemoteCatalog() // non-blocking: bundled catalog serves until remote/cache applies
  createWindow()
  initAutoUpdater(isDev)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
