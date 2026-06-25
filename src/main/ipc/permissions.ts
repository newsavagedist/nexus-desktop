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

const pending = new Map<string, (granted: boolean) => void>()
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
): Promise<boolean> {
  ensureLoaded()

  const rule = matchRule(action, detail)
  if (rule === 'allow') return true
  if (rule === 'deny') return false
  if (defaultPolicy === 'allow') return true
  if (defaultPolicy === 'deny') return false

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      resolve(false)
    }, timeoutMs)

    pending.set(id, (granted: boolean) => {
      clearTimeout(timer)
      resolve(granted)
    })

    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      win.webContents.send('nexus:permission:request', { id, action, detail })
    } else {
      pending.delete(id)
      clearTimeout(timer)
      resolve(false)
    }
  })
}

export function resolvePermission(id: string, granted: boolean): boolean {
  const cb = pending.get(id)
  if (!cb) return false
  pending.delete(id)
  cb(granted)
  return true
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
