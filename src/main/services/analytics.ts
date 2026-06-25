import fs from 'node:fs'
import path from 'node:path'

const ANALYTICS_PATH = path.join(
  process.env.HOME || process.env.USERPROFILE || '.',
  '.daaznexus',
  'analytics.jsonl',
)

interface Attempt {
  timestamp: string
  provider: string
  model: string
  success: boolean
  tokens: number
  error?: string
}

const pending: Attempt[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

function flush(): void {
  if (!pending.length) return
  try {
    fs.mkdirSync(path.dirname(ANALYTICS_PATH), { recursive: true })
    const lines = pending.map(a => JSON.stringify(a)).join('\n') + '\n'
    fs.appendFileSync(ANALYTICS_PATH, lines, 'utf-8')
    pending.length = 0
  } catch { /* silent */ }
}

function scheduleFlush(): void {
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(flush, 2000)
}

export function recordAttempt(
  provider: string, model: string,
  success: boolean, tokens = 0, error?: string,
): void {
  pending.push({
    timestamp: new Date().toISOString(),
    provider,
    model,
    success,
    tokens,
    error,
  })
  scheduleFlush()
}

export function getUsage(days = 30): Record<string, { tokens: number; requests: number; errors: number }> {
  const cutoff = Date.now() - days * 86400_000
  const result: Record<string, { tokens: number; requests: number; errors: number }> = {}

  try {
    const data = fs.readFileSync(ANALYTICS_PATH, 'utf-8')
    for (const line of data.trim().split('\n')) {
      if (!line) continue
      try {
        const a: Attempt = JSON.parse(line)
        const ts = new Date(a.timestamp).getTime()
        if (ts < cutoff) continue
        if (!result[a.provider]) {
          result[a.provider] = { tokens: 0, requests: 0, errors: 0 }
        }
        result[a.provider].tokens += a.tokens || 0
        result[a.provider].requests += 1
        if (!a.success) result[a.provider].errors += 1
      } catch { /* skip */ }
    }
  } catch { /* no data yet */ }

  return result
}

export function getTimeline(days = 7): { day: string; tokens: number; requests: number }[] {
  const cutoff = Date.now() - days * 86400_000
  const dayMap = new Map<string, { tokens: number; requests: number }>()

  try {
    const data = fs.readFileSync(ANALYTICS_PATH, 'utf-8')
    for (const line of data.trim().split('\n')) {
      if (!line) continue
      try {
        const a: Attempt = JSON.parse(line)
        const ts = new Date(a.timestamp).getTime()
        if (ts < cutoff) continue
        const day = a.timestamp.slice(0, 10)
        const entry = dayMap.get(day) || { tokens: 0, requests: 0 }
        entry.tokens += a.tokens || 0
        entry.requests += 1
        dayMap.set(day, entry)
      } catch { /* skip */ }
    }
  } catch { /* no data */ }

  return Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, data]) => ({ day, ...data }))
}

export function getErrorDistribution(days = 7): { provider: string; error: string; count: number }[] {
  const cutoff = Date.now() - days * 86400_000
  const counter = new Map<string, number>()

  try {
    const data = fs.readFileSync(ANALYTICS_PATH, 'utf-8')
    for (const line of data.trim().split('\n')) {
      if (!line) continue
      try {
        const a: Attempt = JSON.parse(line)
        if (a.success || !a.error) continue
        const ts = new Date(a.timestamp).getTime()
        if (ts < cutoff) continue
        const key = `${a.provider}:${a.error}`
        counter.set(key, (counter.get(key) || 0) + 1)
      } catch { /* skip */ }
    }
  } catch { /* no data */ }

  return Array.from(counter.entries())
    .map(([key, count]) => {
      const [provider, ...rest] = key.split(':')
      return { provider, error: rest.join(':'), count }
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 50)
}

process.on('exit', flush)
process.on('SIGINT', () => { flush(); process.exit() })
process.on('SIGTERM', () => { flush(); process.exit() })
