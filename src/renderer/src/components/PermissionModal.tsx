import type { PermissionRequest } from "../types"

export default function PermissionModal({ reqs, onRespond }: { reqs: PermissionRequest[]; onRespond: (req: PermissionRequest, granted: boolean) => void }) {
  if (reqs.length === 0) return null
  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center backdrop-blur-sm">
      <div className="bg-neutral-900 border border-amber-700/50 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl">⚠️</span>
          <div>
            <h3 className="text-lg font-semibold text-white">Permission Required</h3>
            <p className="text-xs text-amber-400 font-medium">Potentially dangerous tool</p>
          </div>
        </div>
        {reqs.map((req) => {
          const isDangerous = req.action.toLowerCase().includes("bash") || req.action.toLowerCase().includes("write") || req.action.toLowerCase().includes("delete") || req.action.toLowerCase().includes("rm")
          let parsedArgs: Record<string, unknown> = {}
          try { parsedArgs = JSON.parse(req.detail) } catch { /* */ }
          return (
            <div key={req.id} className="mb-4">
              <div className="bg-neutral-800/60 rounded-xl p-4 mb-4 border border-amber-800/30">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${isDangerous ? "bg-red-900/50 text-red-300 border border-red-700/50" : "bg-amber-900/50 text-amber-300 border border-amber-700/50"}`}>
                    {isDangerous ? "🔥 DANGEROUS" : "⚠️ ATTENTION"}
                  </span>
                  <code className="text-sm text-white font-mono font-bold">{req.action}</code>
                </div>
                {Object.keys(parsedArgs).length > 0 && (
                  <div className="bg-neutral-950/50 rounded-lg p-2 mt-2 space-y-1">
                    {Object.entries(parsedArgs).map(([k, v]) => (
                      <div key={k} className="flex gap-2 text-xs">
                        <span className="text-neutral-500 shrink-0">{k}:</span>
                        <span className="text-neutral-300 font-mono break-all">{typeof v === "string" ? v : JSON.stringify(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {!Object.keys(parsedArgs).length && req.detail && (
                  <p className="text-xs text-neutral-400 mt-2 break-all font-mono">{req.detail}</p>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => onRespond(req, true)}
                  className="flex-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5">
                  <span>✅</span> Allow
                </button>
                <button onClick={() => onRespond(req, false)}
                  className="flex-1 px-3 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5">
                  <span>🚫</span> Deny
                </button>
              </div>
            </div>
          )
        })}
        <p className="text-[10px] text-neutral-600 text-center mt-3">This operation will be logged for audit</p>
      </div>
    </div>
  )
}
