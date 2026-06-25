const WINDOW_SECONDS = 60

const PROVIDER_LIMITS: Record<string, [number, number]> = {
  groq: [30, 15000],
  openrouter: [20, 100000],
  gemini: [60, 1000000],
  github: [30, 50000],
  deepseek: [500, 1000000],
  mistral: [5, 50000],
  anthropic: [5, 40000],
  openai: [500, 200000],
  ollama: [100, 500000],
  llamacpp: [100, 500000],
}

interface WindowEntry {
  requests: number
  tokens: number
}

const windows = new Map<number, Map<string, WindowEntry>>()

function getOrCreateWindow(provider: string, now: number): WindowEntry {
  const windowStart = now - (now % WINDOW_SECONDS)
  let timeWindow = windows.get(windowStart)
  if (!timeWindow) {
    windows.clear()
    timeWindow = new Map()
    windows.set(windowStart, timeWindow)
  }
  let entry = timeWindow.get(provider)
  if (!entry) {
    entry = { requests: 0, tokens: 0 }
    timeWindow.set(provider, entry)
  }
  return entry
}

export function checkAndRecord(provider: string, tokens = 0): boolean {
  const [maxRpm, maxTpm] = PROVIDER_LIMITS[provider] || [30, 50000]
  const now = Math.floor(Date.now() / 1000)

  const entry = getOrCreateWindow(provider, now)
  if (entry.requests >= maxRpm) return false
  if (entry.tokens >= maxTpm) return false

  entry.requests += 1
  entry.tokens += tokens
  return true
}
