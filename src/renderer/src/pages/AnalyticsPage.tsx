import { useState, useEffect } from "react"
import { api } from "../api/client"
import type { Page } from "../constants"

export default function AnalyticsPage({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const [usage, setUsage] = useState<Record<string, { model: string; tokens: number; requests: number; errors: number }[]>>({})
  const [timeline, setTimeline] = useState<{ day: string; tokens: number; requests: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.getUserAnalytics(30).then(setUsage).catch(() => {}),
      api.getTimeline(7).then(setTimeline).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

  const totalTokens = Object.values(usage).flat().reduce((a, m) => a + (m.tokens || 0), 0)
  const totalReqs = Object.values(usage).flat().reduce((a, m) => a + (m.requests || 0), 0)
  const totalErrs = Object.values(usage).flat().reduce((a, m) => a + (m.errors || 0), 0)

  return (
    <div className="min-h-screen bg-neutral-950">
      <header className="bg-neutral-900 border-b border-neutral-800 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <h1 className="text-white font-bold text-lg"> Analytics</h1>
          <button onClick={() => onNavigate("chat")} className="text-neutral-400 hover:text-white transition-colors text-sm">← Back to chat</button>
        </div>
      </header>
      <div className="max-w-5xl mx-auto p-4 space-y-4">
        {loading ? (
          <p className="text-neutral-500 text-center py-8">Loading...</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold" style={{ color: 'var(--theme-primary)' }}>{(totalTokens / 1000).toFixed(1)}k</p>
                <p className="text-neutral-500 text-xs mt-1">Tokens consumed</p>
              </div>
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-emerald-400">{totalReqs}</p>
                <p className="text-neutral-500 text-xs mt-1">Requests made</p>
              </div>
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-red-400">{totalErrs}</p>
                <p className="text-neutral-500 text-xs mt-1">Errors</p>
              </div>
            </div>

            {Object.keys(usage).length === 0 && timeline.length === 0 && (
              <p className="text-neutral-500 text-center py-8 text-sm">No usage data yet. Send some messages to start.</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
