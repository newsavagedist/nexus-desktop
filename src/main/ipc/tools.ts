import { ipcMain, BrowserWindow, dialog } from 'electron'
import { readFile, writeFile, listDir, fileInfo, deleteFile, createDir } from '../tools/filesystem.js'
import { runBash } from '../tools/bash.js'
import { checkOrRequestPermission, resolvePermissionWithAlways, getPolicy, setRule, setDefault } from './permissions.js'
import { listProviders, getModelsByClass, getModelsByProvider, getProvider } from '../services/catalog.js'
import { resolveKey, saveSystemKey, deleteSystemKey, listVaultProviders } from '../services/keyVault.js'
import { routeWithFallback, routeWithFallbackStream, getCooldownState } from '../services/fallbackChain.js'

const activeStreams = new Map<string, boolean>()

const DESKTOP_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'bash',
      description: 'Execute a shell command and return its stdout.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to run.' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'read_file',
      description: 'Read the full contents of a file as text.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute or relative path to the file.' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'write_file',
      description: 'Write text content to a file, creating it if it does not exist.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to write to.' },
          content: { type: 'string', description: 'Content to write.' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_dir',
      description: 'List files and subdirectories inside a directory.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path to list.' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_dir',
      description: 'Create a directory and any missing parent directories.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path to create.' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'delete_file',
      description: 'Delete a file permanently.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file to delete.' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'file_info',
      description: 'Get metadata about a file or directory (size, type, modification time).',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file or directory.' },
        },
        required: ['path'],
      },
    },
  },
]

export function registerIpcHandlers(): void {

  ipcMain.on('nexus:permissions:response', (_event, id: string, granted: boolean, always: boolean) => {
    resolvePermissionWithAlways(id, granted, always ?? false)
  })

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
    return checkOrRequestPermission(action, detail)
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
    // Local tools are opt-in: only attach them when the renderer explicitly
    // enabled them. Missing/old renderers default to no tools.
    const tools = options?.toolsEnabled === true ? DESKTOP_TOOLS : undefined
    return routeWithFallback(
      messages,
      options.modelClass,
      options.model,
      options.strategy,
      options.maxTokens,
      tools,
      undefined,
      // Same permission gate as the streaming path: without it, gated tools
      // (bash/filesystem) are denied instead of silently executed.
      checkOrRequestPermission,
    )
  })

  ipcMain.on('nexus:stream:start', async (event, { id, messages, options }: { id: string; messages: any[]; options: any }) => {
    activeStreams.set(id, true)
    let fullContent = ''
    let usedModel = ''
    const notifyTool = (ev: any) => {
      const chunk = `__TOOL_EVENT__:${JSON.stringify(ev)}`
      event.sender.send('nexus:stream:chunk', { id, chunk })
    }
    // Local tools are opt-in: only attach them when the renderer explicitly
    // enabled them. Missing/old renderers default to no tools.
    const tools = options?.toolsEnabled === true ? DESKTOP_TOOLS : undefined
    try {
      const gen = routeWithFallbackStream(
        messages,
        options.modelClass,
        options.model,
        options.strategy,
        options.maxTokens,
        tools,
        checkOrRequestPermission,
        () => !activeStreams.get(id),
        options.temperature,
        notifyTool,
        options.workingDir,
        options.remoteOllamaUrl,
        options.remoteOllamaKey,
      )
      for await (const chunk of gen) {
        if (!activeStreams.get(id)) break
        if (typeof chunk === 'string' && chunk.startsWith('__MODEL__:')) {
          usedModel = chunk.slice('__MODEL__:'.length)
          continue
        }
        if (typeof chunk === 'string' && chunk.startsWith('__TOOL_EVENT__:')) {
          event.sender.send('nexus:stream:chunk', { id, chunk })
          continue
        }
        fullContent += chunk
        event.sender.send('nexus:stream:chunk', { id, chunk })
      }
      activeStreams.delete(id)
      event.sender.send('nexus:stream:done', { id, result: { content: fullContent, model: usedModel } })
    } catch (err: any) {
      activeStreams.delete(id)
      event.sender.send('nexus:stream:error', { id, error: err?.message || 'Stream failed' })
    }
  })

  ipcMain.on('nexus:stream:cancel', (_event, { id }: { id: string }) => {
    activeStreams.delete(id)
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

  ipcMain.handle('nexus:providers:cooldowns', () => getCooldownState())

  ipcMain.handle('nexus:dialog:openDir', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select project working directory',
    })
    return result.canceled ? null : result.filePaths[0]
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
