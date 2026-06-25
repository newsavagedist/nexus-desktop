import { useState, useEffect, useRef, useCallback } from "react"
import { api } from "../api/client"
import type { Message, ModelClassKey, CategorizedProvider, ToolEvent, PermissionRequest } from "../types"
import type { Page } from "../constants"
import ConversationSidebar from "../components/chat/ConversationSidebar"
import ModelSelector from "../components/chat/ModelSelector"
import MessageBubble from "../components/chat/MessageBubble"
import InputArea from "../components/chat/InputArea"
import PermissionModal from "../components/PermissionModal"

interface Props {
  onNavigate: (p: Page) => void
  colorMode: "dark" | "light"
  setColorMode: (m: "dark" | "light") => void
}

export default function ChatPage({ onNavigate, colorMode, setColorMode }: Props) {
  const [convs, setConvs] = useState<{ id: number; title: string }[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [modelClass, setModelClass] = useState<ModelClassKey>("auto")
  const [strategy, setStrategy] = useState("smartest")
  const [selectedModel, setSelectedModel] = useState("")
  const [loading, setLoading] = useState(false)
  const [convId, setConvId] = useState<number | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [availProviders, setAvailProviders] = useState<Record<string, CategorizedProvider[]> | null>(null)
  const [streamingContent, setStreamingContent] = useState("")
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([])
  const [permReq, setPermReq] = useState<PermissionRequest | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const mountedRef = useRef(true)
  const convIdRef = useRef<number | null>(null)
  const streamContentRef = useRef("")
  const cleanupPermRef = useRef<(() => void) | null>(null)

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    onResize()
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  useEffect(() => {
    const nexus = (window as any).nexus
    if (nexus?.permissions?.onRequest) {
      cleanupPermRef.current = nexus.permissions.onRequest((data: PermissionRequest) => setPermReq(data))
    }
    return () => cleanupPermRef.current?.()
  }, [])

  useEffect(() => { api.getAvailableProviders().then(setAvailProviders).catch(() => {}) }, [])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages, streamingContent])

  const loadConvs = useCallback(async () => {
    const list = await api.listConversations().catch(() => null)
    if (list && mountedRef.current) setConvs(list)
    return list
  }, [])

  const switchConv = useCallback(async (id: number) => {
    const conv = await api.getConversation(id).catch(() => null)
    if (conv && mountedRef.current) {
      setConvId(id)
      setMessages(Array.isArray(conv.messages) ? conv.messages : [])
    }
  }, [])

  const newConv = useCallback(async () => {
    const conv = await api.createConversation("Nova conversa").catch(() => null)
    if (conv && mountedRef.current) {
      setConvId(conv.id)
      setMessages([])
      setConvs(prev => prev.some(c => c.id === conv.id) ? prev : [...prev, conv])
    }
  }, [])

  const deleteConv = useCallback(async (id: number) => {
    if (!mountedRef.current) return
    const prevConvs = convs
    setConvs(prev => prev.filter(c => c.id !== id))
    if (convId === id) {
      const next = prevConvs.find(c => c.id !== id)
      if (next) await switchConv(next.id)
      else { setConvId(null); setMessages([]) }
    }
    await api.deleteConversation(id).catch(() => null)
  }, [convId, switchConv, convs])

  useEffect(() => { convIdRef.current = convId }, [convId])

  useEffect(() => {
    (async () => {
      const list = await loadConvs()
      if (!list || list.length === 0) await newConv()
      else if (!convIdRef.current) await switchConv(list[0].id)
    })()
  }, [])

  const sendMessage = async () => {
    if (!input.trim() || loading) return
    let cid = convId
    if (!cid) {
      try {
        const conv = await api.createConversation("Nova conversa")
        setConvId(conv.id); setConvs(prev => [...prev, conv]); cid = conv.id
      } catch { return }
    }
    const content = input.trim()
    setInput(""); setLoading(true)
    setMessages(prev => [...prev, { id: Date.now(), role: "user", content }])
    setToolEvents([])
    streamContentRef.current = ""
    setStreamingContent("")
    setMessages(prev => [...prev, { id: -(Date.now()), role: "assistant", content: "" }])

    try {
      const result = await (window as any).nexus?.providers?.send?.(
        [{ role: 'user', content }],
        { modelClass, model: selectedModel || undefined, strategy },
      )
      if (!mountedRef.current) return
      const finalContent = result?.content || ""
      setStreamingContent(""); streamContentRef.current = ""; setToolEvents([])
      setMessages(prev => prev.map(m =>
        m.id < 0 ? { id: Date.now() + 1, role: "assistant" as const, content: finalContent, model: result?.model, tokens_used: result?.tokensUsed, duration: result?.duration } : m
      ))
    } catch (err: any) {
      if (!mountedRef.current) return
      setToolEvents([]); streamContentRef.current = ""; setStreamingContent("")
      setMessages(prev => prev.map(m => m.id < 0 ? { ...m, content: `Error: ${err.message}` } : m))
    } finally {
      setLoading(false)
      const curTitle = convs.find(c => c.id === cid)?.title
      if (curTitle === "Nova conversa" || !curTitle) {
        await api.updateConversationTitle(cid, content.length > 42 ? content.slice(0, 40) + "…" : content).catch(() => null)
      }
      await loadConvs()
    }
  }



  return (
    <div className="min-h-screen bg-background flex">
      <button onClick={() => setMobileMenuOpen(true)} className="md:hidden fixed top-3 right-4 z-[60] text-muted-foreground hover:text-foreground text-lg p-1">☰</button>

      <ConversationSidebar
        convs={convs} convId={convId} sidebarOpen={sidebarOpen} isMobile={isMobile}
        onSelect={switchConv} onNew={newConv} onDelete={deleteConv}
        onToggle={() => setSidebarOpen(s => !s)} onClose={() => setSidebarOpen(false)}
      />

      {isMobile && mobileMenuOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 z-50" onClick={() => setMobileMenuOpen(false)} />
          <div className="fixed top-0 right-0 z-50 w-56 bg-card border-l border-border h-full p-4 flex flex-col gap-2">
            <div className="flex justify-end mb-2">
              <button onClick={() => setMobileMenuOpen(false)} className="text-muted-foreground hover:text-foreground text-lg p-1">✕</button>
            </div>
            <button onClick={() => { setMobileMenuOpen(false); onNavigate("chat") }} className="flex items-center gap-3 px-3 py-2.5 rounded-full text-sm text-foreground hover:bg-accent"> Chat</button>
            <button onClick={() => { setMobileMenuOpen(false); setSidebarOpen(true) }} className="flex items-center gap-3 px-3 py-2.5 rounded-full text-sm text-foreground hover:bg-accent"> Conversations</button>
            <button onClick={() => { setMobileMenuOpen(false); onNavigate("analytics") }} className="flex items-center gap-3 px-3 py-2.5 rounded-full text-sm text-foreground hover:bg-accent"> Analytics</button>
            <button onClick={() => { setMobileMenuOpen(false); onNavigate("settings") }} className="flex items-center gap-3 px-3 py-2.5 rounded-full text-sm text-foreground hover:bg-accent"> Providers</button>
            <div className="border-t border-border my-2" />
            <button onClick={() => { setMobileMenuOpen(false); setColorMode(colorMode === "dark" ? "light" : "dark") }}
              className="flex items-center gap-3 px-3 py-2.5 rounded-full text-sm text-foreground hover:bg-accent">
              {colorMode === "dark" ? "☀️" : "🌙"} {colorMode === "dark" ? "Light" : "Dark"}
            </button>
          </div>
        </>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-card border-b border-border px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 shrink-0" />
            <h1 className="text-foreground font-bold text-lg">DaazNexus</h1>
          </div>
          <div className="hidden md:flex items-center gap-4">
            <button onClick={() => onNavigate("analytics")} className="text-muted-foreground hover:text-foreground transition-colors text-sm"> Analytics</button>
            <button onClick={() => onNavigate("settings")} className="text-muted-foreground hover:text-foreground transition-colors text-sm"> Providers</button>
            <button onClick={() => setColorMode(colorMode === "dark" ? "light" : "dark")}
              className="text-muted-foreground hover:text-foreground transition-colors text-lg p-1">
              {colorMode === "dark" ? "☀️" : "🌙"}
            </button>
          </div>
        </header>

        <ModelSelector
          modelClass={modelClass} onModelClassChange={setModelClass}
          strategy={strategy} onStrategyChange={setStrategy}
          selectedModel={selectedModel} onModelChange={setSelectedModel}
          availProviders={availProviders}
        />

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="max-w-3xl mx-auto space-y-4">
            {messages.length === 0 ? (
              <div className="text-center text-muted-foreground mt-20">
                <p className="text-lg">What do you want to do today?</p>
              </div>
            ) : (
              messages.map(msg => <MessageBubble key={msg.id} msg={msg} streamingContent={streamingContent} loading={loading} toolEvents={toolEvents} />)
            )}

            <InputArea input={input} onInputChange={setInput} onSend={sendMessage} loading={loading} />
            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>

      {permReq && (
        <PermissionModal
          reqs={[permReq]}
          onRespond={(req, granted) => {
            (window as any).nexus?.permissions?.respond?.(req.id, granted)
            setPermReq(null)
          }}
        />
      )}
    </div>
  )
}
