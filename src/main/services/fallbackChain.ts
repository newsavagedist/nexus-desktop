import { getProvider, getModelsByClass, listAvailable } from './catalog.js'
import { resolveKey } from './keyVault.js'
import { getClient, type ChatMessage, type ChatResult } from './providerClients.js'
import { checkAndRecord } from './rateLimiter.js'
import { recordAttempt } from './analytics.js'

const MAX_TOOL_ITERATIONS = 10
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

async function executeToolLoop(
  client: any, apiKey: string, model: string,
  workingMsgs: ChatMessage[], maxTokens: number, tools?: any[],
  onToolCall?: (evt: any) => void,
): Promise<[ChatResult, ChatMessage[]]> {
  const seenCalls = new Set<string>()
  let result = await Promise.race([
    client.chat(apiKey, model, workingMsgs, { maxTokens, tools }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT)),
  ])

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    if (!needsToolCall(result)) break

    const callSigs = (result.toolCalls || []).map((tc: any) =>
      `${tc.function.name}(${tc.function.arguments || ''})`,
    )
    if (callSigs.every((sig: string) => seenCalls.has(sig))) break
    callSigs.forEach((sig: string) => seenCalls.add(sig))

    const resultsList: [any, string][] = []
    for (const tc of result.toolCalls || []) {
      const fnName = tc.function.name
      try {
        const r = await executeToolCall(tc)
        resultsList.push([tc, r])
      } catch (e: any) {
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

async function executeToolCall(tc: any): Promise<string> {
  const name = tc.function.name
  const args = JSON.parse(tc.function.arguments || '{}')

  switch (name) {
    case 'read_file': {
      const fs = await import('node:fs/promises')
      return await fs.readFile(args.path, 'utf-8')
    }
    case 'write_file': {
      const fs = await import('node:fs/promises')
      await fs.writeFile(args.path, args.content, 'utf-8')
      return `File written: ${args.path}`
    }
    case 'list_dir': {
      const fs = await import('node:fs/promises')
      const entries = await fs.readdir(args.path)
      return entries.join('\n')
    }
    case 'bash': {
      const { execa } = await import('execa')
      const result = await execa(args.command, { shell: true, timeout: 30000 })
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
            for await (const chunk of (client as any).chatStream(apiKey, m, messages, { maxTokens })) {
              sent = true
              yield chunk
            }
            if (sent) {
              checkAndRecord(provider.id, 0)
              recordAttempt(provider.id, m, true)
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
        try {
          for await (const chunk of (client as any).chatStream(apiKey, m, messages, { maxTokens })) {
            if (typeof chunk === 'string' && chunk.startsWith('__TOKENS_USED__')) {
              totalTokens = parseInt(chunk.split('__')[2], 10) || 0
              continue
            }
            if (chunk) {
              holdFirst = false
              yield chunk
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
