import { useRef, useEffect } from "react"

interface Props {
  input: string
  onInputChange: (v: string) => void
  onSend: () => void
  loading: boolean
}

export default function InputArea({ input, onInputChange, onSend, loading }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = "auto"
      el.style.height = Math.min(el.scrollHeight, 192) + "px"
    }
  }, [input])

  return (
    <div className="flex gap-2 bg-card border border-border rounded-3xl px-4 py-3 focus-within:border-ring transition-colors">
      <textarea ref={textareaRef}
        className="flex-1 bg-transparent text-foreground outline-none resize-none max-h-48 py-2 text-sm"
        placeholder="Message..."
        rows={1}
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend() } }}
        disabled={loading} />
      <button
        className="bg-primary text-primary-foreground rounded-full px-4 py-2 font-medium shrink-0 h-10 self-end transition-all hover:opacity-90 disabled:opacity-40"
        onClick={onSend}
        disabled={loading || !input.trim()}>
        {loading ? "..." : "→"}
      </button>
    </div>
  )
}
