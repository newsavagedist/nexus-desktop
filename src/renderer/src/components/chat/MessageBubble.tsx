import type { Message, ToolEvent } from "../../types"
import Markdown from "../ui/markdown"

interface Props {
  msg: Message
  streamingContent: string
  loading: boolean
  toolEvents: ToolEvent[]
}

export default function MessageBubble({ msg, streamingContent, loading, toolEvents }: Props) {
  const isStreaming = msg.id < 0
  const isUser = msg.role === "user"
  const isSystem = msg.role === "system"
  const isAssistant = msg.role === "assistant"

  const userBubble = "bg-primary text-primary-foreground rounded-3xl px-4 py-3"
  const assistantBubble = "bg-card text-card-foreground rounded-3xl px-4 py-3 border border-border/50"
  const systemBubble = "bg-destructive/10 text-destructive border border-destructive/30 rounded-3xl px-4 py-3"

  return (
    <div className={`flex items-end gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && <span className="text-sm shrink-0">{isAssistant ? "🤖" : "⚠️"}</span>}
      <div className={`max-w-[85%] ${isUser ? userBubble : isSystem ? systemBubble : assistantBubble}`}>
        {isStreaming ? (
          <>
            {toolEvents.length > 0 && (
              <div className="space-y-1 mb-2 pb-2 border-b border-border/50">
                {toolEvents.map((tc) => (
                  <div key={tc.id} className="flex items-center gap-2 text-xs">
                    <span className={
                      tc.status === "running" ? "animate-pulse text-amber-400" :
                      tc.status === "completed" ? "text-emerald-400" : "text-red-400"
                    }>
                      {tc.status === "running" ? "🔧" : tc.status === "completed" ? "✅" : "❌"}
                    </span>
                    <code className="text-muted-foreground">{tc.name}</code>
                  </div>
                ))}
              </div>
            )}
            <p className="whitespace-pre-wrap">{streamingContent || (loading ? "Thinking..." : "")}<span className="animate-pulse">▊</span></p>
          </>
        ) : (
          <Markdown content={msg.content} />
        )}
        {isAssistant && msg.id > 0 && (
          <div className="text-xs text-muted-foreground/60 mt-1.5 flex items-center gap-2 flex-wrap">
            {msg.model && <span>{msg.model}</span>}
            {msg.tokens_used != null && <span>{msg.tokens_used} tok</span>}
            {msg.duration != null && <span>{msg.duration}s</span>}
          </div>
        )}
      </div>
    </div>
  )
}
