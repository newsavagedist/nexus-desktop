import { createRequire } from 'node:module'
const { autoUpdater } = createRequire(import.meta.url)('electron-updater')
import { BrowserWindow, ipcMain } from 'electron'

function send(event: string, data?: unknown) {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) win.webContents.send(event, data)
}

export function initAutoUpdater(isDev: boolean) {
  if (isDev) return

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info: any) => {
    send('nexus:update:available', { version: info.version })
  })

  autoUpdater.on('download-progress', (progress: any) => {
    send('nexus:update:progress', { percent: Math.round(progress.percent) })
  })

  autoUpdater.on('update-downloaded', () => {
    send('nexus:update:ready')
  })

  autoUpdater.on('error', (err: any) => {
    console.log('[updater] error:', err?.message)
    send('nexus:update:error', { message: err?.message ?? 'unknown error' })
  })

  ipcMain.handle('nexus:update:download', () => autoUpdater.downloadUpdate())
  ipcMain.handle('nexus:update:install', () => {
    autoUpdater.quitAndInstall()
    // On unsigned macOS builds, Squirrel.Mac can silently refuse to apply the
    // update — quitAndInstall() never rejects, it just waits forever for an
    // event that won't come. If the app hasn't quit by now, assume that's
    // what happened and tell the user instead of leaving the button dead.
    setTimeout(() => {
      send('nexus:update:error', {
        message: 'Não foi possível instalar automaticamente (a app não está assinada digitalmente no macOS). Fecha a app e reinstala manualmente com o .dmg mais recente em github.com/newsavagedist/nexus-desktop/releases/latest.',
        phase: 'install',
      })
    }, 6000)
  })

  // Check silently 5s after launch so the app is fully loaded
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000)
}
