import { useRef, useEffect, useCallback } from "react"
import { X, RefreshCw, Maximize2 } from "lucide-react"
import type { Artifact } from "../ui/artifact-context"
import type { Lang } from "../../i18n"
import { t } from "../../i18n"

interface Props {
  artifact: Artifact
  onClose: () => void
  lang: Lang
}

function buildHtml(content: string, lang: string): string {
  if (lang === "svg") {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fff}</style></head><body>${content}</body></html>`
  }
  // If content doesn't have <html>, wrap it
  if (!/<html/i.test(content)) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{font-family:system-ui,sans-serif;margin:0;padding:16px}</style></head><body>${content}</body></html>`
  }
  return content
}

export default function ArtifactPanel({ artifact, onClose, lang }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const render = useCallback(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    const html = buildHtml(artifact.content, artifact.lang)
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document
      if (doc) {
        doc.open()
        doc.write(html)
        doc.close()
      }
    } catch {
      iframe.srcdoc = html
    }
  }, [artifact.content, artifact.lang])

  useEffect(() => { render() }, [render])

  const openExternal = () => {
    const html = buildHtml(artifact.content, artifact.lang)
    const blob = new Blob([html], { type: "text/html" })
    const url = URL.createObjectURL(blob)
    window.open(url, "_blank")
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }

  return (
    <div className="w-full md:w-[48%] md:min-w-[340px] md:max-w-[640px] border-l border-border flex flex-col bg-background shrink-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card shrink-0">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          {artifact.lang.toUpperCase()} {t(lang, "artifactPreview")}
        </span>
        {artifact.streaming && (
          <span className="text-[10px] text-primary/70 animate-pulse">{t(lang, "artifactLive")}</span>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          <button onClick={render}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title={t(lang, "artifactRefresh")}>
            <RefreshCw size={13} />
          </button>
          <button onClick={openExternal}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title={t(lang, "artifactOpenWindow")}>
            <Maximize2 size={13} />
          </button>
          <button onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title={t(lang, "artifactClose")}>
            <X size={13} />
          </button>
        </div>
      </div>
      <iframe
        ref={iframeRef}
        className="flex-1 w-full border-none bg-white"
        sandbox="allow-scripts allow-same-origin"
        title={t(lang, "artifactTitle")}
      />
    </div>
  )
}
