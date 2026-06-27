import type { PermissionRequest } from "../types"

export default function PermissionModal({ reqs, onRespond }: {
  reqs: PermissionRequest[]
  onRespond: (req: PermissionRequest, granted: boolean, always?: boolean) => void
}) {
  if (reqs.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 items-end pointer-events-none">
      {reqs.map((req) => {
        const isDangerous = /bash|delete|rm/.test(req.action.toLowerCase())
        let parsedArgs: Record<string, unknown> = {}
        try { parsedArgs = JSON.parse(req.detail) } catch { /* */ }
        const detailText = Object.keys(parsedArgs).length > 0
          ? Object.entries(parsedArgs).map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join(" · ")
          : req.detail

        return (
          <div key={req.id} data-perm-id={req.id}
            className={`perm-toast pointer-events-auto w-72 bg-card border rounded-xl shadow-2xl overflow-hidden ${isDangerous ? "border-red-700/50" : "border-amber-700/40"}`}>
            <div className="px-3 pt-3 pb-2">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs shrink-0">{isDangerous ? "🔥" : "⚠️"}</span>
                <code className="text-xs font-mono font-bold text-foreground truncate">{req.action}</code>
              </div>
              {detailText && (
                <p className="text-[10px] text-muted-foreground font-mono truncate leading-relaxed">{detailText}</p>
              )}
            </div>
            <div className="flex border-t border-border">
              <button onClick={() => onRespond(req, false)}
                className="flex-1 py-2 text-xs font-semibold text-white bg-red-700/80 hover:bg-red-700 transition-colors border-r border-border">
                Deny
              </button>
              <button onClick={() => onRespond(req, true)}
                className="flex-1 py-2 text-xs font-semibold text-white bg-emerald-700/80 hover:bg-emerald-700 transition-colors border-r border-border">
                Allow
              </button>
              <button onClick={() => onRespond(req, true, true)}
                className="flex-1 py-2 text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
                Always
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
