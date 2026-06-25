import { ipcMain, BrowserWindow } from 'electron'
import { readFile, writeFile, listDir, fileInfo, deleteFile, createDir } from '../tools/filesystem.js'
import { runBash } from '../tools/bash.js'
import { resolvePermission, getPolicy, setRule, setDefault } from './permissions.js'
import { listProviders, getModelsByClass, getModelsByProvider, getProvider } from '../services/catalog.js'
import { resolveKey, saveSystemKey, deleteSystemKey, listVaultProviders } from '../services/keyVault.js'
import { routeWithFallback } from '../services/fallbackChain.js'

export function registerIpcHandlers(): void {

  ipcMain.handle('nexus:tools:run', async (_event, name: string, args: any) => {
    switch (name) {
      case 'read_file': return readFile(args.path)
      case 'write_file': return writeFile(args.path, args.content)
      case 'list_dir': return listDir(args.path)
      case 'file_info': return fileInfo(args.path)
      case 'delete_file': return deleteFile(args.path)
      case 'create_dir': return createDir(args.path)
      case 'bash': return runBash(args.command, args.timeout)
      default: return { success: false, error: `Unknown tool: ${name}` }
    }
  })

  ipcMain.handle('nexus:permissions:request', async (_event, action: string, detail: string) => {
    const allWindows = BrowserWindow.getAllWindows()
    const win = allWindows[0]
    if (!win) return false

    return new Promise<boolean>((resolve) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const timer = setTimeout(() => {
        resolve(false)
      }, 60000)

      win.webContents.send('nexus:permission:request', { id, action, detail })

      const handler = (_: any, responseId: string, granted: boolean) => {
        if (responseId !== id) return
        ipcMain.removeListener('nexus:permissions:response', handler)
        clearTimeout(timer)
        resolve(granted)
      }
      ipcMain.on('nexus:permissions:response', handler)
    })
  })

  ipcMain.handle('nexus:permissions:getPolicy', () => getPolicy())
  ipcMain.handle('nexus:permissions:setPolicy', (_event, pattern: string, decision: string) => {
    if (pattern === '__default__') {
      setDefault(decision as 'allow' | 'deny' | 'ask')
    } else {
      setRule(pattern, decision as 'allow' | 'deny' | 'ask')
    }
    return getPolicy()
  })

  ipcMain.handle('nexus:providers:list', () => listProviders())
  ipcMain.handle('nexus:providers:modelsByClass', (_event, modelClass: string) => getModelsByClass(modelClass))
  ipcMain.handle('nexus:providers:modelsByProvider', (_event, providerId: string) => getModelsByProvider(providerId))
  ipcMain.handle('nexus:providers:getProvider', (_event, modelId: string) => getProvider(modelId))

  ipcMain.handle('nexus:providers:send', async (_event, messages: any[], options: any) => {
    return routeWithFallback(
      messages,
      options.modelClass,
      options.model,
      options.strategy,
      options.maxTokens,
      options.tools,
    )
  })

  ipcMain.handle('nexus:vault:getKeys', () => {
    const providers = listVaultProviders()
    const result: Record<string, boolean> = {}
    for (const p of providers) {
      result[p] = true
    }
    return result
  })

  ipcMain.handle('nexus:vault:setKey', (_event, provider: string, key: string) => {
    saveSystemKey(provider, key)
    return true
  })

  ipcMain.handle('nexus:vault:deleteKey', (_event, provider: string) => {
    return deleteSystemKey(provider)
  })

  ipcMain.handle('nexus:vault:resolveKey', (_event, provider: string) => {
    return resolveKey(provider)
  })

  ipcMain.on('nexus:window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })
  ipcMain.on('nexus:window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win?.isMaximized()) win.unmaximize()
    else win?.maximize()
  })
  ipcMain.on('nexus:window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })
}
