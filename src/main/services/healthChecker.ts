import { listProviders } from './catalog.js'
import { resolveKey } from './keyVault.js'

const CHECK_INTERVAL = 1800_000
const MAX_FAILURES = 3

const failureCount = new Map<string, number>()

let disabledProviders = new Set<string>()

async function checkHealthLightweight(baseUrl: string, apiKey: string, apiType: string): Promise<boolean> {
  const base = baseUrl.replace(/\/+$/, '')
  // Gemini authenticates via a `?key=` query param, not a Bearer header —
  // sending Authorization here would 401 on a perfectly healthy provider.
  const url = apiType === 'google' ? `${base}/models?key=${apiKey}` : `${base}/models`
  try {
    const resp = await fetch(url, {
      headers: apiType === 'google' ? {} : { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    })
    return resp.status === 200
  } catch {
    return false
  }
}

function disableProvider(providerId: string): void {
  disabledProviders.add(providerId)
}

export async function runHealthCheck(): Promise<void> {
  for (const provider of listProviders()) {
    if (!provider.requiresKey) continue
    const apiKey = resolveKey(provider.id)
    if (!apiKey) continue

    const ok = await checkHealthLightweight(provider.baseUrl, apiKey, provider.apiType)
    if (ok) {
      failureCount.set(provider.id, 0)
      disabledProviders.delete(provider.id)
    } else {
      const count = (failureCount.get(provider.id) || 0) + 1
      failureCount.set(provider.id, count)
      if (count >= MAX_FAILURES) {
        disableProvider(provider.id)
      }
    }
  }
}

export function startHealthChecker(): void {
  setInterval(runHealthCheck, CHECK_INTERVAL)
  runHealthCheck()
}

export function getHealthStatus(): Record<string, { healthy: boolean; failures: number; models: string[] }> {
  const result: Record<string, any> = {}
  for (const provider of listProviders()) {
    result[provider.id] = {
      healthy: !disabledProviders.has(provider.id),
      failures: failureCount.get(provider.id) || 0,
      models: provider.models.map(m => m.id),
    }
  }
  return result
}

export function isProviderDisabled(providerId: string): boolean {
  return disabledProviders.has(providerId)
}
