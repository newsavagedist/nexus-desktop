import type { ModelClassKey, CategorizedProvider } from "../../types"
import type { Lang } from "../../i18n"
import { t } from "../../i18n"

const MODEL_CLASSES: ModelClassKey[] = ["auto", "cerebro", "trabalhador", "local"]

interface Props {
  lang: Lang
  modelClass: ModelClassKey
  onModelClassChange: (v: ModelClassKey) => void
  strategy: string
  onStrategyChange: (v: string) => void
  selectedModel: string
  onModelChange: (v: string) => void
  availProviders: Record<string, CategorizedProvider[]> | null
  cooldowns?: Record<string, number>
  toolsEnabled: boolean
  onToolsToggle: (v: boolean) => void
}

function getFilteredModels(classKey: string, availProviders: Record<string, CategorizedProvider[]> | null): string[] {
  if (!availProviders) return []
  const catMap: Record<string, ("free" | "paid" | "local")[]> = {
    auto: ["free", "paid", "local"], cerebro: ["paid"], trabalhador: ["free"], local: ["local"],
  }
  const cats = catMap[classKey] || ["free", "paid", "local"]
  const available: string[] = []
  for (const cat of cats) for (const p of (availProviders[cat] || [])) for (const m of p.models) if (!available.includes(m.id)) available.push(m.id)
  return available
}

function fmtCooldown(secs: number): string {
  if (secs >= 60) return `${Math.ceil(secs / 60)}m`
  return `${secs}s`
}

export default function ModelSelector({ lang, modelClass, onModelClassChange, strategy, onStrategyChange, selectedModel, onModelChange, availProviders, cooldowns, toolsEnabled, onToolsToggle }: Props) {
  const models = getFilteredModels(modelClass, availProviders)
  const cooledModels = Object.keys(cooldowns ?? {})
  const activeCooldowns = cooledModels.length > 0

  const classLabels: Record<string, string> = {
    auto: t(lang, "classAuto"),
    cerebro: t(lang, "classBrain"),
    trabalhador: t(lang, "classWorker"),
    local: t(lang, "classLocal"),
  }

  return (
    <div className="border-b border-border bg-card/50 px-4 py-2 flex items-center gap-3 overflow-x-auto">
      <div className="flex items-center gap-2 shrink-0">
        <select value={modelClass} onChange={e => onModelClassChange(e.target.value as ModelClassKey)}
          className="appearance-none bg-secondary text-muted-foreground rounded-full px-3 py-1.5 text-sm border border-input outline-none">
          {MODEL_CLASSES.map(key => (
            <option key={key} value={key} className="bg-card text-muted-foreground">{classLabels[key]}</option>
          ))}
        </select>
        <select value={strategy} onChange={e => onStrategyChange(e.target.value)}
          className="appearance-none bg-secondary text-muted-foreground rounded-full px-2 py-1.5 text-xs border border-input outline-none">
          <option value="smartest" className="bg-card text-muted-foreground">{t(lang, "strategySmartest")}</option>
          <option value="fastest" className="bg-card text-muted-foreground">{t(lang, "strategyFastest")}</option>
          <option value="priority" className="bg-card text-muted-foreground">{t(lang, "strategyManual")}</option>
        </select>
        {modelClass !== "auto" && models.length > 0 && (
          <select value={selectedModel} onChange={e => onModelChange(e.target.value)}
            className="appearance-none bg-secondary text-muted-foreground rounded-full px-3 py-1.5 text-sm border border-input outline-none max-w-[200px]">
            <option value="" className="bg-card text-muted-foreground">— auto —</option>
            {models.map(m => {
              const cd = cooldowns?.[m]
              return (
                <option key={m} value={m} className="bg-card text-muted-foreground">
                  {cd ? `⏸ ${m} (${fmtCooldown(cd)})` : m}
                </option>
              )
            })}
          </select>
        )}
        {modelClass !== "auto" && models.length === 0 && availProviders && (
          <span className="text-muted-foreground/50 text-xs">{t(lang, "noModels")}</span>
        )}
        {/* Local tools opt-in toggle — off by default; when off the model gets no bash/filesystem tools */}
        <button
          type="button"
          onClick={() => onToolsToggle(!toolsEnabled)}
          title={t(lang, "localTools")}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs border transition-colors shrink-0 ${
            toolsEnabled
              ? "bg-primary/15 text-primary border-primary/40"
              : "bg-secondary text-muted-foreground border-input"
          }`}>
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${toolsEnabled ? "bg-primary" : "bg-muted-foreground/40"}`} />
          🛠 {t(lang, "localTools")}
        </button>
      </div>

      {/* Cooldown status strip — visible in AUTO mode when models are cooling down */}
      {activeCooldowns && (
        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          <span className="text-[10px] text-muted-foreground/60">{lang === "pt" ? "limite:" : "limit:"}</span>
          {cooledModels.slice(0, 3).map(m => (
            <span key={m} className="flex items-center gap-1 text-[10px] bg-destructive/10 text-destructive/80 border border-destructive/20 rounded-full px-2 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-destructive/60 shrink-0" />
              <span className="max-w-[80px] truncate">{m}</span>
              <span className="opacity-70">{fmtCooldown(cooldowns![m])}</span>
            </span>
          ))}
          {cooledModels.length > 3 && (
            <span className="text-[10px] text-muted-foreground/50">+{cooledModels.length - 3}</span>
          )}
        </div>
      )}
    </div>
  )
}
