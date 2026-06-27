import { getProvider, getModelsByClass, listAvailable } from './catalog.js'
import { resolveKey } from './keyVault.js'
import { getClient, type ChatMessage, type ChatResult } from './providerClients.js'
import { checkAndRecord } from './rateLimiter.js'
import { recordAttempt } from './analytics.js'

const MAX_TOOL_ITERATIONS = 50
const TIMEOUT = 30000
const MAX_RETRIES = 20
const EMPTY_CONTENT_RETRIES = 2

const cooldownCache = new Map<string, number>()

const AUTO_FALLBACK_ORDER = ['trabalhador', 'cerebro', 'local']

function isOnCooldown(model: string): boolean {
  const expiry = cooldownCache.get(model)
  if (!expiry) return false
  if (Date.now() / 1000 > expiry) {
    cooldownCache.delete(model)
    return false
  }
  return true
}

function markCooldown(model: string, duration = 30): void {
  cooldownCache.set(model, Date.now() / 1000 + duration)
}

function shortError(err: any): string {
  if (err?.status) return `HTTP ${err.status}`
  if (err?.name === 'AbortError') return 'timeout'
  return err?.message?.slice(0, 60) || String(err)
}

async function filterModelsWithKeys(models: string[]): Promise<string[]> {
  const available: string[] = []
  for (const model of models) {
    const provider = getProvider(model)
    if (!provider) continue
    if (!provider.requiresKey) {
      available.push(model)
    } else {
      const key = resolveKey(provider.id)
      if (key) available.push(model)
    }
  }
  return available
}

function prioritizeVision(models: string[]): string[] {
  const visionIds = new Set(listAvailable().filter(m => m.vision).map(m => m.id))
  const v = models.filter(m => visionIds.has(m))
  const rest = models.filter(m => !visionIds.has(m))
  return [...v, ...rest]
}

type ToolNotify = (ev: { id: string; name: string; args: Record<string, unknown>; status: 'running' | 'completed' | 'failed'; result?: string; started_at: number; completed_at?: number }) => void

async function executeToolLoop(
  client: any, apiKey: string, model: string,
  workingMsgs: ChatMessage[], maxTokens: number, tools?: any[],
  requestPermission?: (action: string, detail: string) => Promise<boolean>,
  isCancelled?: () => boolean,
  notifyTool?: ToolNotify,
  workingDir?: string,
): Promise<[ChatResult, ChatMessage[]]> {
  const seenCalls = new Set<string>()
  let result = await Promise.race([
    client.chat(apiKey, model, workingMsgs, { maxTokens, tools }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT)),
  ])

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    if (isCancelled?.()) break
    if (!needsToolCall(result)) break

    const callSigs = (result.toolCalls || []).map((tc: any) =>
      `${tc.function.name}(${tc.function.arguments || ''})`,
    )
    if (callSigs.every((sig: string) => seenCalls.has(sig))) break
    callSigs.forEach((sig: string) => seenCalls.add(sig))

    const resultsList: [any, string][] = []
    for (const tc of result.toolCalls || []) {
      if (isCancelled?.()) break
      const started_at = Date.now()
      const tcId = tc.id || `${tc.function.name}-${started_at}`
      let args: Record<string, unknown> = {}
      try { args = JSON.parse(tc.function.arguments || '{}') } catch { /* */ }
      notifyTool?.({ id: tcId, name: tc.function.name, args, status: 'running', started_at })
      try {
        const r = await executeToolCall(tc, requestPermission, workingDir)
        notifyTool?.({ id: tcId, name: tc.function.name, args, status: 'completed', result: r, started_at, completed_at: Date.now() })
        resultsList.push([tc, r])
      } catch (e: any) {
        notifyTool?.({ id: tcId, name: tc.function.name, args, status: 'failed', result: e.message, started_at, completed_at: Date.now() })
        resultsList.push([tc, `Error: ${e.message}`])
      }
    }

    workingMsgs = [
      ...workingMsgs,
      ...toolCallsToMessages(result.toolCalls),
      ...toolResultsToMessages(resultsList),
    ]

    result = await Promise.race([
      client.chat(apiKey, model, workingMsgs, { maxTokens, tools }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT)),
    ])
  }

  if (needsToolCall(result)) {
    result = await client.chat(apiKey, model, workingMsgs, { maxTokens, tools: undefined })
  }

  return [result, workingMsgs]
}

function needsToolCall(result: ChatResult): boolean {
  return !!(result.toolCalls?.length)
}

async function runToolsAndContinue(
  client: any,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  toolCalls: any[],
  maxTokens: number,
  tools: any[],
  requestPermission?: (action: string, detail: string) => Promise<boolean>,
  isCancelled?: () => boolean,
  notifyTool?: ToolNotify,
  workingDir?: string,
): Promise<string> {
  if (isCancelled?.()) return ''
  const resultsList: [any, string][] = []
  for (const tc of toolCalls) {
    if (isCancelled?.()) break
    const started_at = Date.now()
    const tcId = tc.id || `${tc.function.name}-${started_at}`
    let args: Record<string, unknown> = {}
    try { args = JSON.parse(tc.function.arguments || '{}') } catch { /* */ }
    notifyTool?.({ id: tcId, name: tc.function.name, args, status: 'running', started_at })
    try {
      const r = await executeToolCall(tc, requestPermission, workingDir)
      notifyTool?.({ id: tcId, name: tc.function.name, args, status: 'completed', result: r, started_at, completed_at: Date.now() })
      resultsList.push([tc, r])
    } catch (e: any) {
      notifyTool?.({ id: tcId, name: tc.function.name, args, status: 'failed', result: e.message, started_at, completed_at: Date.now() })
      resultsList.push([tc, `Error: ${e.message}`])
    }
  }
  if (isCancelled?.()) return ''
  const workingMsgs: ChatMessage[] = [
    ...messages,
    ...toolCallsToMessages(toolCalls),
    ...toolResultsToMessages(resultsList),
  ]
  if (isCancelled?.()) return ''
  const [result] = await executeToolLoop(client, apiKey, model, workingMsgs, maxTokens, tools.length ? tools : undefined, requestPermission, isCancelled, notifyTool, workingDir)
  return result.content || ''
}

function toolCallsToMessages(toolCalls: any[]): ChatMessage[] {
  return [{
    role: 'assistant' as const,
    content: null,
    toolCalls: toolCalls.map(tc => ({
      id: tc.id,
      type: 'function',
      function: { name: tc.function.name, arguments: tc.function.arguments },
    })),
  }]
}

function toolResultsToMessages(results: [any, string][]): ChatMessage[] {
  return results.map(([tc, content]) => ({
    role: 'tool' as const,
    toolCallId: tc.id,
    content,
  }))
}

async function executeToolCall(
  tc: any,
  requestPermission?: (action: string, detail: string) => Promise<boolean>,
  workingDir?: string,
): Promise<string> {
  const nodePath = await import('node:path')
  const name = tc.function.name
  const args = JSON.parse(tc.function.arguments || '{}')

  // Resolve a file path: absolute paths are kept as-is; relative paths are
  // resolved against workingDir when set, otherwise left for the OS to handle.
  const resolve = (p: string): string => {
    if (!p) return p
    if (nodePath.isAbsolute(p)) return p
    if (workingDir) return nodePath.resolve(workingDir, p)
    return p
  }

  switch (name) {
    case 'read_file': {
      const fs = await import('node:fs/promises')
      return await fs.readFile(resolve(args.path), 'utf-8')
    }
    case 'write_file': {
      const resolved = resolve(args.path)
      if (requestPermission) {
        const ok = await requestPermission('write_file', `Write to: ${resolved}`)
        if (!ok) return 'Permission denied.'
      }
      const fs = await import('node:fs/promises')
      await fs.mkdir(nodePath.dirname(resolved), { recursive: true })
      await fs.writeFile(resolved, args.content, 'utf-8')
      return `File written: ${resolved}`
    }
    case 'list_dir': {
      const fs = await import('node:fs/promises')
      const entries = await fs.readdir(resolve(args.path))
      return entries.join('\n')
    }
    case 'create_dir': {
      const resolved = resolve(args.path)
      if (requestPermission) {
        const ok = await requestPermission('create_dir', `Create directory: ${resolved}`)
        if (!ok) return 'Permission denied.'
      }
      const fs = await import('node:fs/promises')
      await fs.mkdir(resolved, { recursive: true })
      return `Directory created: ${resolved}`
    }
    case 'delete_file': {
      const resolved = resolve(args.path)
      if (requestPermission) {
        const ok = await requestPermission('delete_file', `Delete: ${resolved}`)
        if (!ok) return 'Permission denied.'
      }
      const fs = await import('node:fs/promises')
      await fs.unlink(resolved)
      return `File deleted: ${resolved}`
    }
    case 'file_info': {
      const fs = await import('node:fs/promises')
      const stat = await fs.stat(resolve(args.path))
      return JSON.stringify({ size: stat.size, isDirectory: stat.isDirectory(), mtime: stat.mtime })
    }
    case 'bash': {
      if (requestPermission) {
        const ok = await requestPermission('bash', `Run: ${args.command}`)
        if (!ok) return 'Permission denied.'
      }
      const { execa } = await import('execa')
      // cwd makes relative paths work correctly in shell commands
      const execOpts: any = { shell: true, timeout: 30000 }
      if (workingDir) execOpts.cwd = workingDir
      const result = await execa(args.command, execOpts)
      return result.stdout
    }
    case 'web_search': {
      return `[web_search:${args.query}] mock — implement search later`
    }
    default:
      return `Unknown tool: ${name}`
  }
}

async function tryModels(
  models: string[], messages: ChatMessage[],
  maxTokens: number, tools?: any[],
): Promise<ChatResult> {
  const errors: string[] = []
  let emptyCount = 0

  for (const model of models) {
    if (isOnCooldown(model)) continue

    const provider = getProvider(model)
    if (!provider) continue

    const apiKey = resolveKey(provider.id)
    if (!apiKey && provider.requiresKey) continue

    const client = getClient(provider.id)

    try {
      const startTime = Date.now()
      let workingMsgs = [...messages]
      const [result] = await executeToolLoop(client, apiKey!, model, workingMsgs, maxTokens, tools)

      result.duration = (Date.now() - startTime) / 1000

      if (!result.content && !result.toolCalls) {
        emptyCount++
        errors.push(`${model}: empty completion`)
        recordAttempt(provider.id, model, false, 0, 'empty completion')
        if (emptyCount >= EMPTY_CONTENT_RETRIES) emptyCount = 0
        markCooldown(model, 15)
        continue
      }

      checkAndRecord(provider.id, result.tokensUsed || 0)
      recordAttempt(provider.id, model, true, result.tokensUsed || 0)
      cooldownCache.delete(model)
      return result
    } catch (err: any) {
      errors.push(`${model}: ${shortError(err)}`)
      recordAttempt(provider.id, model, false, 0, err.message?.slice(0, 100))
      markCooldown(model, err.name === 'AbortError' ? 10 : 15)
    }
  }

  throw new Error(`No model responded. Errors: ${errors.join('; ')}`)
}

function sortByStrategy(models: string[], strategy: string): string[] {
  if (strategy === 'smartest') {
    const allM = new Map(listAvailable().map(m => [m.id, m.intelligenceScore]))
    return [...models].sort((a, b) => (allM.get(b) || 5) - (allM.get(a) || 5))
  }
  if (strategy === 'fastest') {
    const allM = new Map(listAvailable().map(m => [m.id, m.speedScore]))
    return [...models].sort((a, b) => (allM.get(b) || 5) - (allM.get(a) || 5))
  }
  return models
}

export function getCooldownState(): Record<string, number> {
  const now = Date.now() / 1000
  const result: Record<string, number> = {}
  for (const [model, expiry] of cooldownCache) {
    const remaining = Math.ceil(expiry - now)
    if (remaining > 0) result[model] = remaining
  }
  return result
}

export async function routeWithFallback(
  messages: ChatMessage[],
  modelClass = 'trabalhador',
  model?: string,
  strategy = 'priority',
  maxTokens = 4096,
  tools?: any[],
  fallbackOrder?: string[],
): Promise<ChatResult> {
  const hasImages = messages.some(m => m.images?.length)

  if (model) {
    const filtered = await filterModelsWithKeys([model])
    if (filtered.length) {
      try {
        return await tryModels(filtered, messages, maxTokens, tools)
      } catch {
        console.warn(`[fallback] model override "${model}" failed, falling back`)
      }
    }
  }

  let fbOrder: string[]
  if (modelClass === 'auto') {
    fbOrder = [...(fallbackOrder || AUTO_FALLBACK_ORDER)]
  } else if (modelClass === 'local') {
    fbOrder = ['local']
  } else {
    const chosen = await filterModelsWithKeys(getModelsByClass(modelClass))
    fbOrder = chosen.length ? [modelClass] : [modelClass, 'local']
  }

  const lastErrors = new Map<string, string>()

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    for (const attemptClass of fbOrder) {
      let models = getModelsByClass(attemptClass)
      models = await filterModelsWithKeys(models)
      if (!models.length) {
        if (!lastErrors.has(attemptClass)) {
          lastErrors.set(attemptClass, 'no usable models (missing API keys or all on cooldown)')
        }
        continue
      }
      if (hasImages) models = prioritizeVision(models)
      models = sortByStrategy(models, strategy)

      for (const m of models) {
        if (isOnCooldown(m)) continue
        const provider = getProvider(m)
        if (!provider) continue
        const apiKey = resolveKey(provider.id)
        if (!apiKey && provider.requiresKey) continue
        const client = getClient(provider.id)

        try {
          const startTime = Date.now()
          let workingMsgs = [...messages]
          const [result] = await executeToolLoop(client, apiKey!, m, workingMsgs, maxTokens, tools)

          if (result.content) {
            result.duration = (Date.now() - startTime) / 1000
            checkAndRecord(provider.id, result.tokensUsed || 0)
            recordAttempt(provider.id, m, true, result.tokensUsed || 0)
            cooldownCache.delete(m)
            return result
          } else {
            recordAttempt(provider.id, m, false, 0, 'empty completion')
            markCooldown(m, 10)
            lastErrors.set(attemptClass, `${m}: empty completion`)
          }
        } catch (err: any) {
          recordAttempt(provider.id, m, false, 0, err.message?.slice(0, 100))
          markCooldown(m, 10)
          lastErrors.set(attemptClass, `${m}: ${shortError(err)}`)
        }
      }
    }
  }

  const details = Array.from(lastErrors.entries()).map(([c, e]) => `[${c}] ${e}`).join('; ')
  throw new Error(
    `All providers failed for class "${modelClass}" after ${MAX_RETRIES} attempts. Errors: ${details}`,
  )
}

export async function* routeWithFallbackStream(
  messages: ChatMessage[],
  modelClass = 'trabalhador',
  model?: string,
  strategy = 'priority',
  maxTokens = 4096,
  tools?: any[],
  requestPermission?: (action: string, detail: string) => Promise<boolean>,
  isCancelled?: () => boolean,
  temperature?: number,
  notifyTool?: ToolNotify,
  workingDir?: string,
): AsyncGenerator<string> {
  const hasImages = messages.some(m => m.images?.length)

  if (model) {
    const filtered = await filterModelsWithKeys([model])
    if (filtered.length) {
      const m = filtered[0]
      const provider = getProvider(m)
      const apiKey = resolveKey(provider?.id || '')
      if (provider && apiKey) {
        const client = getClient(provider.id)
        if ('chatStream' in client) {
          try {
            let sent = false
            let pendingCalls: any[] | null = null
            for await (const chunk of (client as any).chatStream(apiKey, m, messages, { maxTokens, tools, temperature })) {
              if (typeof chunk === 'string' && chunk.startsWith('__TOKENS_USED__')) continue
              if (typeof chunk === 'string' && chunk.startsWith('__TOOL_CALLS__:')) {
                pendingCalls = JSON.parse(chunk.slice('__TOOL_CALLS__:'.length))
                sent = true
                continue
              }
              if (chunk) {
                sent = true
                yield chunk
              }
            }
            if (pendingCalls) {
              const finalContent = await runToolsAndContinue(client, apiKey!, m, messages, pendingCalls, maxTokens, tools || [], requestPermission, isCancelled, notifyTool, workingDir)
              if (finalContent) yield finalContent
            }
            if (sent) {
              checkAndRecord(provider.id, 0)
              recordAttempt(provider.id, m, true)
              yield `__MODEL__:${m}`
              return
            }
          } catch (err) {
            console.warn(`[stream] override "${model}" failed:`, err)
          }
        }
      }
    }
  }

  let fbOrder: string[]
  if (modelClass === 'auto') {
    fbOrder = [...AUTO_FALLBACK_ORDER]
  } else if (modelClass === 'local') {
    fbOrder = ['local']
  } else {
    const chosen = await filterModelsWithKeys(getModelsByClass(modelClass))
    fbOrder = chosen.length ? [modelClass] : [modelClass, 'local']
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    for (const attemptClass of fbOrder) {
      let models = getModelsByClass(attemptClass)
      models = await filterModelsWithKeys(models)
      if (!models.length) continue
      if (hasImages) models = prioritizeVision(models)
      models = sortByStrategy(models, strategy)

      for (const m of models) {
        if (isOnCooldown(m)) continue
        const provider = getProvider(m)
        if (!provider) continue
        const apiKey = resolveKey(provider.id)
        if (!apiKey && provider.requiresKey) continue
        const client = getClient(provider.id)
        if (!('chatStream' in client)) continue

        let holdFirst = true
        let totalTokens = 0
        let pendingCalls: any[] | null = null
        try {
          for await (const chunk of (client as any).chatStream(apiKey, m, messages, { maxTokens, tools, temperature })) {
            if (typeof chunk === 'string' && chunk.startsWith('__TOKENS_USED__')) {
              totalTokens = parseInt(chunk.split('__')[2], 10) || 0
              continue
            }
            if (typeof chunk === 'string' && chunk.startsWith('__TOOL_CALLS__:')) {
              pendingCalls = JSON.parse(chunk.slice('__TOOL_CALLS__:'.length))
              continue
            }
            if (chunk) {
              holdFirst = false
              yield chunk
            }
          }

          if (pendingCalls) {
            const finalContent = await runToolsAndContinue(client, apiKey!, m, messages, pendingCalls, maxTokens, tools || [], requestPermission, isCancelled, notifyTool)
            if (finalContent) {
              holdFirst = false
              yield finalContent
            }
          }

          if (holdFirst) {
            recordAttempt(provider.id, m, false, 0, 'empty stream')
            markCooldown(m, 10)
            continue
          }

          checkAndRecord(provider.id, totalTokens)
          recordAttempt(provider.id, m, true, totalTokens)
          cooldownCache.delete(m)
          yield `__MODEL__:${m}`
          return
        } catch (err: any) {
          if (holdFirst) {
            recordAttempt(provider.id, m, false, 0, err.message?.slice(0, 100))
            markCooldown(m, 15)
            continue
          } else {
            throw err
          }
        }
      }
    }
  }

  throw new Error(`All providers failed for class "${modelClass}" after ${MAX_RETRIES} attempts.`)
}
