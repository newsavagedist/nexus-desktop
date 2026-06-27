import { autoUpdater } from 'electron-updater'
import { BrowserWindow, ipcMain } from 'electron'

function send(event: string, data?: unknown) {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) win.webContents.send(event, data)
}

export function initAutoUpdater(isDev: boolean) {
  if (isDev) return

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    send('nexus:update:available', { version: info.version })
  })

  autoUpdater.on('download-progress', (progress) => {
    send('nexus:update:progress', { percent: Math.round(progress.percent) })
  })

  autoUpdater.on('update-downloaded', () => {
    send('nexus:update:ready')
  })

  autoUpdater.on('error', (err) => {
    console.log('[updater] error:', err?.message)
  })

  ipcMain.handle('nexus:update:download', () => autoUpdater.downloadUpdate())
  ipcMain.handle('nexus:update:install', () => autoUpdater.quitAndInstall())

  // Check silently 5s after launch so the app is fully loaded
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000)
}
