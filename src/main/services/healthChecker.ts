import { PROVIDERS } from './catalog.js'
import { resolveKey } from './keyVault.js'

const CHECK_INTERVAL = 1800_000
const MAX_FAILURES = 3

const failureCount = new Map<string, number>()

let disabledProviders = new Set<string>()

async function checkHealthLightweight(baseUrl: string, apiKey: string): Promise<boolean> {
  const url = `${baseUrl.replace(/\/+$/, '')}/models`
  try {
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
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
  for (const provider of PROVIDERS) {
    if (!provider.requiresKey) continue
    const apiKey = resolveKey(provider.id)
    if (!apiKey) continue

    const ok = await checkHealthLightweight(provider.baseUrl, apiKey)
    if (ok) {
      failureCount.set(provider.id, 0)
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
  for (const provider of PROVIDERS) {
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
