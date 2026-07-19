import { app, ipcMain, BrowserWindow, dialog } from 'electron'
import { readFile, writeFile, listDir, fileInfo, deleteFile, createDir } from '../tools/filesystem.js'
import { runBash } from '../tools/bash.js'
import { checkOrRequestPermission, resolvePermissionWithAlways, getPolicy, setRule, setDefault } from './permissions.js'
import { listProviders, getModelsByClass, getModelsByProvider, getProvider } from '../services/catalog.js'
import { resolveKey, saveSystemKey, deleteSystemKey, listVaultProviders } from '../services/keyVault.js'
import { routeWithFallback, routeWithFallbackStream, getCooldownState } from '../services/fallbackChain.js'
import type { ChatMessage } from '../services/providerClients.js'

const activeStreams = new Map<string, boolean>()

// PLAN mode (tools off, the default) has no file/command access at all — the
// model must never pretend otherwise. Told explicitly so it doesn't fabricate
// tool output as plain text and instead tells the user to switch to BUILD.
const PLAN_MODE_SYSTEM_PROMPT: Record<string, string> = {
  pt: 'Estás em modo PLAN no DaazNexus Desktop. Neste modo não tens acesso a nenhuma ferramenta — não podes ler, criar, alterar ou apagar ficheiros, nem executar comandos no computador do utilizador, e nunca deves fingir ou simular que o fizeste. Podes discutir, planear e escrever o conteúdo do que seria feito diretamente na conversa. Se o pedido implicar essas ações (ex: gravar um ficheiro, correr um comando), diz claramente que precisas que o utilizador mude para o modo BUILD (botão junto ao seletor de modelo, no topo do chat) para executares.',
  en: 'You are in PLAN mode in DaazNexus Desktop. In this mode you have no tool access at all — you cannot read, create, modify or delete files, nor run commands on the user\'s computer, and you must never pretend or simulate having done so. You can discuss, plan, and write out the content of what would be done directly in the conversation. If the request implies such actions (e.g. saving a file, running a command), clearly say you need the user to switch to BUILD mode (button next to the model selector, top of the chat) for you to execute it.',
}

// BUILD mode (tools on) grants real, executed access to the user's disk and
// shell via function calling. Models — especially smaller/free ones — tend
// to fall back on their trained "I'm a hosted LLM with no file access"
// disclaimer out of habit, even right after a tool result confirms success.
// Spelling this out, and telling the model to trust its own tool results
// over that instinct, measurably reduces that failure mode.
const BUILD_MODE_SYSTEM_PROMPT: Record<string, string> = {
  pt: 'Estás em modo BUILD no DaazNexus Desktop, uma aplicação de secretária (Electron) com acesso real ao computador do utilizador — não é um sandbox nem uma simulação. As ferramentas bash, read_file, write_file, list_dir, create_dir, delete_file e file_info executam mesmo no disco e terminal do utilizador, mediante permissão explícita já concedida por ele. Quando chamas uma ferramenta e recebes um resultado de sucesso (ex: "File written: /caminho"), isso significa que a ação REALMENTE aconteceu — confia nesse resultado e não digas ao utilizador que não tens acesso ao sistema de ficheiros, que estás num "ambiente isolado" ou que "simulaste" a ação. Se o resultado da ferramenta indicar um erro, reporta esse erro específico, não uma explicação genérica de falta de acesso.',
  en: 'You are in BUILD mode in DaazNexus Desktop, a desktop (Electron) application with real access to the user\'s computer — this is not a sandbox or a simulation. The bash, read_file, write_file, list_dir, create_dir, delete_file and file_info tools genuinely execute on the user\'s disk and shell, with permission already explicitly granted by them. When you call a tool and get back a success result (e.g. "File written: /path"), that means the action REALLY happened — trust that result, and do not tell the user you lack filesystem access, that you\'re in an "isolated environment", or that you "simulated" the action. If a tool result reports an error, relay that specific error, not a generic no-access disclaimer.',
}

function withModeSystemPrompt(messages: ChatMessage[], toolsEnabled: boolean, lang?: string): ChatMessage[] {
  const table = toolsEnabled ? BUILD_MODE_SYSTEM_PROMPT : PLAN_MODE_SYSTEM_PROMPT
  const text = table[lang === 'en' ? 'en' : 'pt']
  return [{ role: 'system', content: text }, ...messages]
}

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
    // PLAN mode (default) vs BUILD mode: tools are only attached in BUILD.
    const toolsEnabled = options?.toolsEnabled === true
    const tools = toolsEnabled ? DESKTOP_TOOLS : undefined
    // Tag permission prompts with the conversation they came from so the
    // renderer can show several at once (one per concurrently streaming
    // conversation) instead of one clobbering another.
    const requestPermission = (action: string, detail: string) =>
      checkOrRequestPermission(action, detail, 60000, { convId: options?.convId })
    return routeWithFallback(
      withModeSystemPrompt(messages, toolsEnabled, options?.lang),
      options.modelClass,
      options.model,
      options.strategy,
      options.maxTokens,
      tools,
      undefined,
      // Same permission gate as the streaming path: without it, gated tools
      // (bash/filesystem) are denied instead of silently executed.
      requestPermission,
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
    // PLAN mode (default) vs BUILD mode: tools are only attached in BUILD.
    const toolsEnabled = options?.toolsEnabled === true
    const tools = toolsEnabled ? DESKTOP_TOOLS : undefined
    // Tag permission prompts with the conversation they came from so the
    // renderer can show several at once (one per concurrently streaming
    // conversation) instead of one clobbering another.
    const requestPermission = (action: string, detail: string) =>
      checkOrRequestPermission(action, detail, 60000, { convId: options?.convId })
    try {
      const gen = routeWithFallbackStream(
        withModeSystemPrompt(messages, toolsEnabled, options?.lang),
        options.modelClass,
        options.model,
        options.strategy,
        options.maxTokens,
        tools,
        requestPermission,
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

  ipcMain.handle('nexus:app:getVersion', () => app.getVersion())

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
