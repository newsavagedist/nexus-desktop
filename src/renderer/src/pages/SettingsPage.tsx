import { useState, useEffect } from "react"
import { api } from "../api/client"
import type { CategorizedProvider } from "../types"
import type { Page } from "../constants"
import { DEFAULT_THEME_COLOR } from "../constants"

type ProviderTab = "free" | "paid" | "local"

const PROVIDER_TABS: { key: ProviderTab; label: string; color: string }[] = [
  { key: "free", label: "FREE", color: "#34d399" },
  { key: "paid", label: "PAID", color: "#a78bfa" },
  { key: "local", label: "LOCAL", color: "#fbbf24" },
]

const PROVIDER_COLORS: Record<string, string> = {
  groq: "#f97316", openrouter: "#8b5cf6", gemini: "#4285f4", github: "#6e40c9",
  deepseek: "#06b6d4", mistral: "#ec4899", anthropic: "#d97706", openai: "#10b981",
  xai: "#e11d48", perplexity: "#0ea5e9", cohere: "#14b8a6", together: "#eab308",
  replicate: "#d946ef", huggingface: "#facc15", cerebras: "#3b82f6", nvidia: "#76b900",
  cloudflare: "#f38020", zhipu: "#8b5cf6", kilo: "#a855f7", pollinations: "#22d3ee",
  ovh: "#00a3ff", opencodezen: "#6366f1",
}

interface SettingsPageProps {
  themeColor: string
  setThemeColor: (c: string) => void
  onNavigate: (p: Page) => void
}

export default function SettingsPage({ themeColor, setThemeColor, onNavigate }: SettingsPageProps) {
  const [tab, setTab] = useState<ProviderTab>("free")
  const [categorized, setCategorized] = useState<Record<string, CategorizedProvider[]> | null>(null)
  const [configs, setConfigs] = useState<Record<string, { api_key: string; has_api_key: boolean }>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ id: string; text: string; ok: boolean } | null>(null)

  const loadCategorized = () => api.getProvidersCategorized().then(setCategorized).catch(() => {})

  useEffect(() => {
    loadCategorized()
    const nexus = (window as any).nexus
    nexus?.vault?.getKeys?.().then((keys: Record<string, boolean>) => {
      const cfgs: Record<string, { api_key: string; has_api_key: boolean }> = {}
      for (const k of Object.keys(keys)) {
        cfgs[k] = { api_key: "", has_api_key: true }
      }
      setConfigs(cfgs)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!categorized) return
    const nexus = (window as any).nexus
    nexus?.vault?.getKeys?.().then((keys: Record<string, boolean>) => {
      setConfigs((prev) => {
        const next = { ...prev }
        for (const p of [...categorized.free, ...categorized.paid, ...categorized.local]) {
          if (!next[p.id]) {
            next[p.id] = { api_key: "", has_api_key: !!keys[p.id] }
          }
        }
        return next
      })
    }).catch(() => {})
  }, [categorized])

  const save = async (providerId: string) => {
    setSaving(providerId)
    try {
      const cfg = configs[providerId]
      if (cfg?.api_key) {
        const nexus = (window as any).nexus
        await nexus?.vault?.setKey?.(providerId, cfg.api_key)
        setConfigs((prev) => ({ ...prev, [providerId]: { ...prev[providerId], api_key: "", has_api_key: true } }))
      }
      setMsg({ id: providerId, text: "Saved ✅", ok: true })
    } catch (err) {
      setMsg({ id: providerId, text: `Error: ${err instanceof Error ? err.message : "?"}`, ok: false })
    }
    setSaving(null)
    setTimeout(() => setMsg(null), 3000)
  }

  const providers = categorized?.[tab] || []

  return (
    <div className="min-h-screen bg-neutral-950">
      <header className="bg-neutral-900 border-b border-neutral-800 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <h1 className="text-white font-bold text-lg"> Providers</h1>
          <button onClick={() => onNavigate("chat")} className="text-neutral-400 hover:text-white transition-colors text-sm">← Back to chat</button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 pt-6">
        <div className="bg-neutral-900 border border-violet-500/30 rounded-xl p-5 border-l-4 border-l-violet-500">
          <h2 className="text-white font-bold text-lg mb-2">Provider API Keys</h2>
          <p className="text-neutral-400 text-sm">Add your API keys for each provider. Keys are encrypted and stored locally.</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 pt-3">
        <div className="flex gap-1 bg-neutral-900 rounded-xl p-1 border border-neutral-800">
          {PROVIDER_TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 py-2 rounded-lg font-medium transition-all ${tab === t.key ? "bg-neutral-800 text-white" : "text-neutral-500 hover:text-neutral-300"}`}
              style={tab === t.key ? { color: t.color } : undefined}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 space-y-3">
        {providers.length === 0 && <p className="text-neutral-500 text-center py-8 text-sm">No providers in this category.</p>}

        {providers.map((p) => {
          const cfg = configs[p.id] || { api_key: "", has_api_key: false }
          const hasKey = cfg.has_api_key === true
          return (
            <div key={p.id} className={`bg-neutral-900 border rounded-xl p-4 transition-colors ${hasKey ? "border-green-700/50 border-l-green-500" : "border-neutral-800"}`}>
              <h3 className="text-white font-medium text-sm mb-3 flex items-center gap-2 flex-wrap" style={{ color: PROVIDER_COLORS[p.id] || "#888" }}>
                <span style={{ color: hasKey ? "#34d399" : "#666", fontSize: "10px" }}>●</span>
                {p.name}
                {hasKey && <span className="text-green-400 text-xs font-normal">🔑 Key saved</span>}
                {p.register_url && (
                  <a href={p.register_url} target="_blank" rel="noopener noreferrer"
                    className="text-[var(--theme-primary)] hover:text-violet-300 underline ml-1 text-xs">
                    Get API Key
                  </a>
                )}
              </h3>
              {p.requires_key !== false && (
                <div className="mb-3">
                  <label className="text-xs text-neutral-500 block mb-1">API Key</label>
                  <input className={`w-full rounded-lg px-3 py-2 border outline-none font-mono text-sm ${hasKey ? "bg-green-900/20 text-green-300 border-green-700/50" : "bg-neutral-800 text-white border-neutral-700"}`}
                    type="password" value={cfg.api_key}
                    onChange={(e) => setConfigs((prev) => ({ ...prev, [p.id]: { ...prev[p.id], api_key: e.target.value } }))}
                    placeholder={hasKey ? "•••••••• (saved — type to change)" : "sk-..."} />
                </div>
              )}
              <div className="flex items-center gap-2">
                <button className="bg-[var(--theme-primary)] text-white rounded-lg px-4 py-2 font-medium text-sm"
                  onClick={() => save(p.id)} disabled={saving === p.id}>
                  {saving === p.id ? "Saving..." : "Save"}
                </button>
                {msg?.id === p.id && <span className={`text-xs ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</span>}
              </div>
            </div>
          )
        })}
      </div>

      <div className="max-w-3xl mx-auto px-4 pb-6">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <h3 className="text-white font-medium mb-3"> Theme</h3>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-neutral-400">Accent Color</label>
            <input type="color" value={themeColor}
              onChange={(e) => setThemeColor(e.target.value)}
              className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-0" />
            <span className="text-neutral-500">{themeColor}</span>
            <button onClick={() => setThemeColor(DEFAULT_THEME_COLOR)}
              className="text-neutral-500 hover:text-white ml-auto transition-colors text-sm">Reset</button>
          </div>
        </div>
      </div>
    </div>
  )
}
