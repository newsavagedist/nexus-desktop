import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { Star, X, Plus } from "lucide-react"
import type { Lang } from "../../i18n"

type Prompt = { id: string; text: string; label: string }

const STORAGE_KEY = "daaznexus_prompts"

function load(): Prompt[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") } catch { return [] }
}
function save(prompts: Prompt[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts))
}

interface Props {
  lang: Lang
  currentInput: string
  onSelect: (text: string) => void
}

export default function PromptLibrary({ lang, currentInput, onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const [prompts, setPrompts] = useState<Prompt[]>(load)
  const [adding, setAdding] = useState(false)
  const [newLabel, setNewLabel] = useState("")
  const [newText, setNewText] = useState("")
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (btnRef.current && !btnRef.current.contains(target)) {
        const panel = document.getElementById("prompt-library-panel")
        if (!panel || !panel.contains(target)) setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  const toggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPos({ top: rect.top - 8, left: rect.left })
    }
    setOpen(p => !p)
  }

  const addPrompt = () => {
    const text = newText.trim() || currentInput.trim()
    const label = newLabel.trim() || text.slice(0, 40)
    if (!text) return
    const updated = [{ id: Date.now().toString(), text, label }, ...prompts]
    setPrompts(updated); save(updated)
    setAdding(false); setNewLabel(""); setNewText("")
  }

  const remove = (id: string) => {
    const updated = prompts.filter(p => p.id !== id)
    setPrompts(updated); save(updated)
  }

  const panel = open ? createPortal(
    <div
      id="prompt-library-panel"
      style={{ position: "fixed", bottom: `calc(100vh - ${pos.top}px)`, left: pos.left, zIndex: 9999 }}
      className="w-80 bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50">
        <span className="text-sm font-medium text-foreground">
          {lang === "pt" ? "Prompts guardados" : "Saved prompts"}
        </span>
        <button
          onClick={() => { setAdding(p => !p); setNewText(currentInput) }}
          className="flex items-center gap-1 text-xs text-primary/80 hover:text-primary transition-colors">
          <Plus size={13} />
          {lang === "pt" ? "Guardar atual" : "Save current"}
        </button>
      </div>

      {adding && (
        <div className="px-4 py-3 border-b border-border/50 space-y-2 bg-muted/20">
          <input
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            placeholder={lang === "pt" ? "Nome (opcional)" : "Name (optional)"}
            className="w-full bg-background text-sm text-foreground placeholder:text-muted-foreground/50 outline-none border border-border/50 rounded-lg px-3 py-1.5 focus:border-primary/40"
          />
          <textarea
            value={newText}
            onChange={e => setNewText(e.target.value)}
            placeholder={lang === "pt" ? "Texto do prompt..." : "Prompt text..."}
            className="w-full bg-background text-sm text-foreground placeholder:text-muted-foreground/50 outline-none border border-border/50 rounded-lg px-3 py-1.5 focus:border-primary/40 resize-none"
            rows={3}
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setAdding(false)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1">
              {lang === "pt" ? "Cancelar" : "Cancel"}
            </button>
            <button onClick={addPrompt} className="text-xs bg-primary text-primary-foreground rounded-full px-3 py-1 hover:opacity-90 transition-opacity">
              {lang === "pt" ? "Guardar" : "Save"}
            </button>
          </div>
        </div>
      )}

      <div className="max-h-64 overflow-y-auto">
        {prompts.length === 0 ? (
          <p className="text-center text-muted-foreground/50 text-xs py-8">
            {lang === "pt" ? "Sem prompts guardados ainda." : "No saved prompts yet."}
          </p>
        ) : prompts.map(p => (
          <div key={p.id}
            className="group flex items-start gap-2 px-4 py-2.5 hover:bg-accent/50 transition-colors cursor-pointer border-b border-border/30 last:border-0"
            onClick={() => { onSelect(p.text); setOpen(false) }}>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{p.label}</p>
              {p.text !== p.label && (
                <p className="text-[11px] text-muted-foreground/60 truncate mt-0.5">{p.text}</p>
              )}
            </div>
            <button onClick={e => { e.stopPropagation(); remove(p.id) }}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground/50 hover:text-destructive transition-all shrink-0 mt-0.5">
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>,
    document.body
  ) : null

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        className={`rounded-full w-10 h-10 flex items-center justify-center transition-colors shrink-0 ${open ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground hover:text-foreground"}`}
        title={lang === "pt" ? "Biblioteca de prompts" : "Prompt library"}>
        <Star size={18} />
      </button>
      {panel}
    </>
  )
}
