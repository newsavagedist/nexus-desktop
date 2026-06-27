import { useRef, useEffect } from "react"
import type { Lang } from "../../i18n"
import { t } from "../../i18n"

interface Props {
  lang: Lang
  input: string
  onInputChange: (v: string) => void
  onSend: () => void
  onStop?: () => void
  onFilePaste?: (file: File) => void
  loading: boolean
  disabled?: boolean
  hasFiles?: boolean
  uploadButton?: React.ReactNode
  filePreviews?: React.ReactNode
}

export default function InputArea({ lang, input, onInputChange, onSend, onStop, onFilePaste, loading, disabled, hasFiles, uploadButton, filePreviews }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = textareaRef.current
    if (el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 192) + "px" }
  }, [input])

  return (
    <div className="flex flex-col gap-2 bg-card border border-border rounded-3xl px-4 py-3 focus-within:border-ring transition-colors">
      {filePreviews}
      <div className="flex gap-2 items-end">
        {uploadButton}
        <textarea ref={textareaRef}
          className="flex-1 bg-transparent text-foreground outline-none resize-none max-h-48 py-2 text-sm"
          placeholder={t(lang, "messagePlaceholder")} rows={1} value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend() } }}
          onPaste={(e) => {
            if (!onFilePaste) return
            const items = Array.from(e.clipboardData?.items || [])
            const imageItem = items.find(i => i.type.startsWith("image/"))
            if (imageItem) {
              e.preventDefault()
              const file = imageItem.getAsFile()
              if (file) onFilePaste(file)
            }
          }}
          disabled={loading || disabled} />
        {loading && onStop ? (
          <button
            onClick={onStop}
            className="bg-destructive/90 hover:bg-destructive text-white rounded-full px-4 py-2 font-medium shrink-0 h-10 transition-all flex items-center gap-1.5 text-sm">
            <span className="w-2.5 h-2.5 rounded-sm bg-white inline-block shrink-0" />
            {t(lang, "stop")}
          </button>
        ) : (
          <button className="bg-primary text-primary-foreground rounded-full px-4 py-2 font-medium shrink-0 h-10 transition-all hover:opacity-90 disabled:opacity-40"
            onClick={onSend} disabled={loading || disabled || (!input.trim() && !hasFiles)}>→</button>
        )}
      </div>
    </div>
  )
}
