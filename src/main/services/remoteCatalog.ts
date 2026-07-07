// Remote model catalog consumption.
//
// Fetches https://chat.daazlabs.com/api/catalog on startup (non-blocking) and
// every 24h, converts it to the bundled ProviderInfo/ModelInfo shapes and
// swaps it in as the effective catalog (see catalog.ts). The raw server JSON
// is cached in userData/catalog-cache.json so an offline start still uses the
// last known catalog. Any malformed data is discarded defensively — worst
// case the app keeps running on the bundled catalog.

import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import {
  PROVIDERS, setEffectiveProviders,
  type ProviderInfo, type ModelInfo,
} from './catalog.js'

const CATALOG_URL = 'https://chat.daazlabs.com/api/catalog'
const FETCH_TIMEOUT_MS = 5000
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000
const CACHE_FILE = 'catalog-cache.json'

// Providers whose base_url is desktop-specific: the desktop intentionally
// points local runtimes at localhost, while the server catalog describes its
// own (server-side) endpoints. The bundled base_url always wins for these.
const BASE_URL_OVERRIDE_IDS = new Set(['ollama', 'llamacpp'])

function cachePath(): string {
  return path.join(app.getPath('userData'), CACHE_FILE)
}

// --- snake_case JSON -> camelCase ProviderInfo/ModelInfo, defensively ------

function toModel(raw: any): ModelInfo | null {
  if (!raw || typeof raw !== 'object') return null
  if (typeof raw.id !== 'string' || !raw.id) return null
  // Only active models may appear in selectors and routing.
  if (raw.status !== 'active') return null
  return {
    id: raw.id,
    context: typeof raw.context === 'number' && raw.context > 0 ? raw.context : 8192,
    vision: raw.vision === true,
    tools: raw.tools === true,
    free: raw.free === true,
    paid: raw.paid === true,
    intelligenceScore: typeof raw.intelligence_score === 'number' ? raw.intelligence_score : 5,
    speedScore: typeof raw.speed_score === 'number' ? raw.speed_score : 5,
  }
}

function toProvider(raw: any): ProviderInfo | null {
  if (!raw || typeof raw !== 'object') return null
  if (typeof raw.id !== 'string' || !raw.id) return null
  if (typeof raw.base_url !== 'string' || !raw.base_url) return null
  if (!Array.isArray(raw.models)) return null
  const models = raw.models.map(toModel).filter((m: ModelInfo | null): m is ModelInfo => m !== null)
  return {
    id: raw.id,
    name: typeof raw.name === 'string' && raw.name ? raw.name : raw.id,
    baseUrl: raw.base_url,
    apiType: typeof raw.api_type === 'string' && raw.api_type ? raw.api_type : 'openai',
    registerUrl: typeof raw.register_url === 'string' ? raw.register_url : '',
    requiresKey: raw.requires_key !== false,
    models,
  }
}

// --- merge rules ------------------------------------------------------------
// - Server entry present  -> replaces the bundled provider (active models only),
//   except desktop-specific base_url overrides which are preserved.
// - Bundled provider missing from server -> bundled version kept (server may
//   lag behind the desktop).
// - Server-only providers -> appended (new providers become usable without a
//   desktop release; unknown api_type falls back to the OpenAI client).
function mergeCatalog(remote: ProviderInfo[]): ProviderInfo[] {
  const remoteById = new Map(remote.map(p => [p.id, p]))
  const merged: ProviderInfo[] = []
  const seen = new Set<string>()
  for (const bundled of PROVIDERS) {
    const r = remoteById.get(bundled.id)
    if (r) {
      merged.push(BASE_URL_OVERRIDE_IDS.has(bundled.id) ? { ...r, baseUrl: bundled.baseUrl } : r)
    } else {
      merged.push(bundled)
    }
    seen.add(bundled.id)
  }
  for (const r of remote) {
    if (!seen.has(r.id)) merged.push(r)
  }
  return merged
}

// Parse a raw server payload and, if valid, install it as the effective
// catalog. Returns true when the catalog was applied.
function applyRawCatalog(raw: any): boolean {
  try {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.providers)) return false
    const remote = raw.providers
      .map(toProvider)
      .filter((p: ProviderInfo | null): p is ProviderInfo => p !== null)
    if (!remote.length) return false
    setEffectiveProviders(mergeCatalog(remote))
    return true
  } catch (err) {
    console.warn('[catalog] failed to apply remote catalog:', err)
    return false
  }
}

// --- cache ------------------------------------------------------------------

async function readCache(): Promise<any | null> {
  try {
    const text = await fs.readFile(cachePath(), 'utf-8')
    const parsed = JSON.parse(text)
    return parsed?.catalog ?? null
  } catch {
    return null
  }
}

async function writeCache(raw: any): Promise<void> {
  try {
    const payload = JSON.stringify({ fetchedAt: new Date().toISOString(), catalog: raw })
    await fs.writeFile(cachePath(), payload, 'utf-8')
  } catch (err) {
    console.warn('[catalog] failed to write cache:', err)
  }
}

// --- fetch ------------------------------------------------------------------

async function fetchRemote(): Promise<any | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const resp = await fetch(CATALOG_URL, { signal: ctrl.signal })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    return await resp.json()
  } finally {
    clearTimeout(timer)
  }
}

function broadcastCatalogUpdated(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    try { win.webContents.send('nexus:catalog:updated') } catch { /* window closing */ }
  }
}

async function refresh(): Promise<void> {
  try {
    const raw = await fetchRemote()
    if (applyRawCatalog(raw)) {
      await writeCache(raw)
      broadcastCatalogUpdated()
      console.log('[catalog] remote catalog applied')
      return
    }
    console.warn('[catalog] remote catalog rejected (malformed/empty), keeping current')
  } catch (err: any) {
    const msg = err?.name === 'AbortError' ? 'timeout' : (err?.message || String(err))
    console.warn(`[catalog] remote fetch failed (${msg}), keeping current catalog`)
  }
}

// Non-blocking init: apply the on-disk cache immediately (if any), then try
// the network; refresh again every 24h. Never throws.
export function initRemoteCatalog(): void {
  void (async () => {
    try {
      const cached = await readCache()
      if (cached && applyRawCatalog(cached)) {
        console.log('[catalog] cached catalog applied')
      }
      await refresh()
    } catch (err) {
      console.warn('[catalog] init failed, using bundled catalog:', err)
    }
  })()

  const timer = setInterval(() => { void refresh() }, REFRESH_INTERVAL_MS)
  timer.unref?.()
}
