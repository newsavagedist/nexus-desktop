import { MODEL_CLASS_INFO } from "../../types"
import type { ModelClassKey, CategorizedProvider } from "../../types"

const MODEL_CLASSES: ModelClassKey[] = ["auto", "cerebro", "trabalhador", "local"]

interface Props {
  modelClass: ModelClassKey
  onModelClassChange: (v: ModelClassKey) => void
  strategy: string
  onStrategyChange: (v: string) => void
  selectedModel: string
  onModelChange: (v: string) => void
  availProviders: Record<string, CategorizedProvider[]> | null
}

function getFilteredModels(classKey: string, availProviders: Record<string, CategorizedProvider[]> | null): string[] {
  if (!availProviders) return []
  const catMap: Record<string, ("free" | "paid" | "local")[]> = {
    auto: ["free", "paid", "local"],
    cerebro: ["paid"],
    trabalhador: ["free"],
    local: ["local"],
  }
  const cats = catMap[classKey] || ["free", "paid", "local"]
  const available: string[] = []
  for (const cat of cats) {
    for (const p of (availProviders[cat] || [])) {
      for (const m of p.models) {
        if (!available.includes(m.id)) available.push(m.id)
      }
    }
  }
  return available
}

export default function ModelSelector({ modelClass, onModelClassChange, strategy, onStrategyChange, selectedModel, onModelChange, availProviders }: Props) {
  const models = getFilteredModels(modelClass, availProviders)

  return (
    <div className="border-b border-border bg-card/50 px-4 py-2 flex items-center gap-3 overflow-x-auto">
      <div className="flex items-center gap-2 shrink-0">
        <select value={modelClass} onChange={(e) => onModelClassChange(e.target.value as ModelClassKey)}
          className="appearance-none bg-secondary text-foreground rounded-full px-3 py-1.5 text-sm border border-input outline-none"
          style={{ color: MODEL_CLASS_INFO[modelClass].color }}>
          {MODEL_CLASSES.map((key) => (
            <option key={key} value={key} className="bg-card text-foreground" style={{ color: MODEL_CLASS_INFO[key].color }}>
              {MODEL_CLASS_INFO[key].icon} {MODEL_CLASS_INFO[key].label}
            </option>
          ))}
        </select>
        <select value={strategy} onChange={(e) => onStrategyChange(e.target.value)}
          className="appearance-none bg-secondary text-muted-foreground rounded-full px-2 py-1.5 text-xs border border-input outline-none">
          <option value="smartest" className="bg-card text-foreground"> Smartest</option>
          <option value="fastest" className="bg-card text-foreground"> Fastest</option>
          <option value="priority" className="bg-card text-foreground"> Manual</option>
        </select>
        {modelClass !== "auto" && models.length > 0 && (
          <select value={selectedModel} onChange={(e) => onModelChange(e.target.value)}
            className="appearance-none bg-secondary text-foreground rounded-full px-3 py-1.5 text-sm border border-input outline-none max-w-[200px]">
            {models.map((m) => (
              <option key={m} value={m} className="bg-card text-foreground">{m}</option>
            ))}
          </select>
        )}
        <span className="hidden sm:inline text-muted-foreground text-xs max-w-64 truncate">
          {MODEL_CLASS_INFO[modelClass].description}
        </span>
      </div>
    </div>
  )
}
