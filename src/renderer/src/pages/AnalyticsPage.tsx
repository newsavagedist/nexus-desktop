import { useState, useEffect } from "react"
import { api } from "../api/client"
import type { Page } from "../constants"
import type { Lang } from "../i18n"

interface ModelRow { model: string; tokens: number; requests: number; errors: number }
interface DayRow { day: string; tokens: number; requests: number }

export default function AnalyticsPage({ onNavigate, lang }: { onNavigate: (p: Page) => void; lang: Lang }) {
  const [usage, setUsage] = useState<Record<string, ModelRow[]>>({})
  const [timeline, setTimeline] = useState<DayRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.getUserAnalytics(30).then(setUsage).catch(() => {}),
      api.getTimeline(14).then(setTimeline).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

  const allRows = Object.values(usage).flat()
  const totalReqs = allRows.reduce((a, m) => a + m.requests, 0)
  const totalErrs = allRows.reduce((a, m) => a + m.errors, 0)
  const maxReqs = Math.max(1, ...allRows.map(r => r.requests))
  const maxDay = Math.max(1, ...timeline.map(d => d.requests))

  const label = lang === "pt"

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <h1 className="text-foreground font-bold text-lg">{label ? "Estatísticas" : "Analytics"}</h1>
          <button onClick={() => onNavigate("chat")} className="text-muted-foreground hover:text-foreground transition-colors text-sm">
            ← {label ? "Chat" : "Back to chat"}
          </button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto p-4 space-y-4">
        {loading ? (
          <p className="text-muted-foreground text-center py-8 text-sm">{label ? "A carregar…" : "Loading…"}</p>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-card border border-border rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-primary">{totalReqs}</p>
                <p className="text-muted-foreground text-xs mt-1">{label ? "Respostas geradas" : "Responses generated"}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-destructive">{totalErrs}</p>
                <p className="text-muted-foreground text-xs mt-1">{label ? "Erros" : "Errors"}</p>
              </div>
            </div>

            {allRows.length === 0 && timeline.length === 0 ? (
              <div className="bg-card border border-border rounded-xl p-8 text-center">
                <p className="text-3xl mb-2">📊</p>
                <p className="text-muted-foreground text-sm">{label ? "Sem dados ainda. Envia mensagens para começar." : "No data yet. Send messages to get started."}</p>
              </div>
            ) : (
              <>
                {/* Model breakdown */}
                {allRows.length > 0 && (
                  <div className="bg-card border border-border rounded-xl p-4">
                    <h2 className="text-sm font-semibold text-foreground mb-3">{label ? "Por modelo (últimos 30 dias)" : "By model (last 30 days)"}</h2>
                    <div className="space-y-2.5">
                      {allRows.sort((a, b) => b.requests - a.requests).map(row => (
                        <div key={row.model}>
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs font-mono text-foreground truncate max-w-[60%]">{row.model}</span>
                            <span className="text-xs text-muted-foreground">{row.requests} {label ? "respostas" : "responses"}{row.errors > 0 ? ` · ${row.errors} err` : ""}</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(row.requests / maxReqs) * 100}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Timeline */}
                {timeline.length > 0 && (
                  <div className="bg-card border border-border rounded-xl p-4">
                    <h2 className="text-sm font-semibold text-foreground mb-3">{label ? "Atividade recente (14 dias)" : "Recent activity (14 days)"}</h2>
                    <div className="flex items-end gap-1 h-16">
                      {timeline.map(d => (
                        <div key={d.day} className="flex-1 flex flex-col items-center gap-0.5" title={`${d.day}: ${d.requests}`}>
                          <div className="w-full bg-primary/80 rounded-sm transition-all"
                            style={{ height: `${Math.max(4, (d.requests / maxDay) * 52)}px` }} />
                          <span className="text-[9px] text-muted-foreground hidden sm:block">{d.day.slice(5)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            <p className="text-[10px] text-muted-foreground text-center">{label ? "Dados locais — histórico de conversas guardado neste dispositivo." : "Local data — conversation history stored on this device."}</p>
          </>
        )}
      </div>
    </div>
  )
}
