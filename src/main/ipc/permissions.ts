import fs from 'node:fs'
import path from 'node:path'
import { minimatch } from 'minimatch'
import { BrowserWindow } from 'electron'

const CONFIG_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.config', 'daaznexus')
const CONFIG_FILE = path.join(CONFIG_DIR, 'permissions.json')

interface PermissionsConfig {
  default: 'allow' | 'deny' | 'ask'
  rules: Record<string, 'allow' | 'deny' | 'ask'>
}

const pending = new Map<string, { action: string; resolve: (granted: boolean) => void }>()
const sessionRules = new Set<string>()
let defaultPolicy: 'allow' | 'deny' | 'ask' = 'ask'
let rules: Record<string, 'allow' | 'deny' | 'ask'> = {}
let loaded = false

function loadConfig(): PermissionsConfig {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
  } catch {
    return { default: 'ask', rules: {} }
  }
}

function saveConfig(cfg: PermissionsConfig): void {
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8')
}

function ensureLoaded(): void {
  if (loaded) return
  const cfg = loadConfig()
  defaultPolicy = cfg.default
  rules = cfg.rules
  loaded = true
}

function matchRule(action: string, detail: string): 'allow' | 'deny' | 'ask' | null {
  for (const [pattern, decision] of Object.entries(rules)) {
    if (minimatch(action, pattern) || minimatch(detail, pattern)) {
      return decision
    }
  }
  return null
}

export async function checkOrRequestPermission(
  action: string, detail: string = '',
  timeoutMs = 60000,
  context?: { convId?: number },
): Promise<boolean> {
  ensureLoaded()

  if (sessionRules.has(action)) {
    console.log(`[perm] session auto-allow: ${action}`)
    return true
  }

  const rule = matchRule(action, detail)
  if (rule === 'allow') return true
  if (rule === 'deny') return false
  if (defaultPolicy === 'allow') return true
  if (defaultPolicy === 'deny') return false

  // Multiple conversations can be streaming (and requesting permission) at
  // once — the id must be unique per request so concurrent prompts each get
  // their own pending entry and their own timer, instead of clobbering one
  // another.
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      console.log(`[perm] TIMEOUT waiting for a decision on '${action}' (id=${id.slice(-6)}) — treating as denied`)
      pending.delete(id)
      resolve(false)
    }, timeoutMs)

    pending.set(id, { action, resolve: (granted: boolean) => {
      clearTimeout(timer)
      resolve(granted)
    }})

    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      console.log(`[perm] request sent to renderer: '${action}' (id=${id.slice(-6)})`)
      win.webContents.send('nexus:permission:request', { id, action, detail, convId: context?.convId })
    } else {
      console.log(`[perm] NO WINDOW FOUND — auto-denying '${action}' without ever showing a prompt (id=${id.slice(-6)})`)
      pending.delete(id)
      clearTimeout(timer)
      resolve(false)
    }
  })
}

export function resolvePermissionWithAlways(id: string, granted: boolean, always: boolean): boolean {
  const entry = pending.get(id)
  if (!entry) { console.log(`[perm] resolve: id not found: ${id}`); return false }
  pending.delete(id)
  if (granted && always) {
    sessionRules.add(entry.action)
    console.log(`[perm] session rule added: ${entry.action} — sessionRules now: [${[...sessionRules].join(', ')}]`)
  }
  console.log(`[perm] resolve: ${entry.action} granted=${granted} always=${always}`)
  entry.resolve(granted)
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    win.webContents.send('nexus:permission:resolved', id)
    console.log(`[perm] sent resolved event to renderer for id=${id.slice(-6)}`)
  } else {
    console.log(`[perm] no window to send resolved event`)
  }
  return true
}

export function addSessionRule(action: string): void {
  sessionRules.add(action)
}

export function clearSessionRules(): void {
  sessionRules.clear()
}

export function setRule(pattern: string, decision: 'allow' | 'deny' | 'ask'): void {
  ensureLoaded()
  rules[pattern] = decision
  saveConfig({ default: defaultPolicy, rules })
}

export function setDefault(decision: 'allow' | 'deny' | 'ask'): void {
  defaultPolicy = decision
  saveConfig({ default: defaultPolicy, rules })
}

export function getPolicy(): { default: string; rules: Record<string, string> } {
  ensureLoaded()
  return { default: defaultPolicy, rules }
}
