import { useState, useEffect, useRef, useCallback } from "react"
import { api } from "../api/client"
import type { Message, ModelClassKey, CategorizedProvider, ToolEvent, PermissionRequest } from "../types"
import { MODEL_CLASS_INFO } from "../types"
import PermissionModal from "../components/PermissionModal"
import type { Page } from "../constants"

const MODEL_CLASSES: ModelClassKey[] = ["auto", "cerebro", "trabalhador", "local"]

interface ChatPageProps {
  onNavigate: (p: Page) => void
  colorMode: "dark" | "light"
  setColorMode: (m: "dark" | "light") => void
}

export default function ChatPage({ onNavigate, colorMode, setColorMode }: ChatPageProps) {
  const [convs, setConvs] = useState<{ id: number; title: string }[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [modelClass, setModelClass] = useState<ModelClassKey>("auto")
  const [routingStrategy, setRoutingStrategy] = useState<string>("smartest")
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
  const abortRef = useRef<AbortController | null>(null)
  const cleanupPermRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    onResize()
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  useEffect(() => {
    const nexus = (window as any).nexus
    if (nexus?.permissions?.onRequest) {
      cleanupPermRef.current = nexus.permissions.onRequest((data: PermissionRequest) => {
        setPermReq(data)
      })
    }
    return () => cleanupPermRef.current?.()
  }, [])

  useEffect(() => {
    api.getAvailableProviders().then(setAvailProviders).catch(() => {})
  }, [])

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
      const msgs = Array.isArray(conv.messages) ? conv.messages : []
      setMessages(msgs)
    }
  }, [])

  const newConv = useCallback(async () => {
    const conv = await api.createConversation("Nova conversa").catch(() => null)
    if (conv && mountedRef.current) {
      setConvId(conv.id)
      setMessages([])
      setConvs((prev) => (prev.some((c) => c.id === conv.id) ? prev : [...prev, conv]))
    }
  }, [])

  const deleteConv = useCallback(async (id: number) => {
    if (!mountedRef.current) return
    const prevConvs = convs
    setConvs((prev) => prev.filter((c) => c.id !== id))
    if (convId === id) {
      const next = prevConvs.find((c) => c.id !== id)
      if (next) await switchConv(next.id)
      else { setConvId(null); setMessages([]) }
    }
    await api.deleteConversation(id).catch(() => null)
  }, [convId, switchConv, convs])

  useEffect(() => { convIdRef.current = convId }, [convId])

  useEffect(() => {
    (async () => {
      const list = await loadConvs()
      if (!list || list.length === 0) {
        await newConv()
      } else if (!convIdRef.current) {
        await switchConv(list[0].id)
      }
    })()
  }, [])

  const sendMessage = async () => {
    if ((!input.trim()) || loading) return
    let cid = convId
    if (!cid) {
      try {
        const conv = await api.createConversation("Nova conversa")
        setConvId(conv.id)
        setConvs((prev) => [...prev, conv])
        cid = conv.id
      } catch {
        setMessages((prev) => [...prev, { id: Date.now(), role: "system", content: "Error creating conversation" }])
        return
      }
    }

    const content = input.trim()
    setInput("")
    setLoading(true)
    setMessages((prev) => [...prev, { id: Date.now(), role: "user", content }])
    setToolEvents([])
    streamContentRef.current = ""
    setStreamingContent("")
    const placeholderId = -(Date.now())
    setMessages((prev) => [...prev, { id: placeholderId, role: "assistant", content: "" }])

    const nexus = (window as any).nexus
    abortRef.current = new AbortController()

    try {
      const result = await nexus.providers?.send?.(
        [{ role: 'user', content }],
        { modelClass, model: selectedModel || undefined, strategy: routingStrategy },
      )

      if (!mountedRef.current) return
      const finalContent = result?.content || ""
      setStreamingContent("")
      streamContentRef.current = ""
      setToolEvents([])
      setMessages((prev) =>
        prev.map((m) =>
          m.id < 0 ? {
            id: Date.now() + 1,
            role: "assistant" as const,
            content: finalContent,
            model: result?.model,
            tokens_used: result?.tokensUsed,
            duration: result?.duration,
          } : m
        )
      )
    } catch (err: any) {
      if (!mountedRef.current) return
      setToolEvents([])
      streamContentRef.current = ""
      setStreamingContent("")
      setMessages((prev) =>
        prev.map((m) =>
          m.id < 0 ? { ...m, content: `Error: ${err.message}` } : m
        )
      )
    } finally {
      setLoading(false)
      const curTitle = convs.find((c) => c.id === cid)?.title
      if (curTitle === "Nova conversa" || !curTitle) {
        await api.updateConversationTitle(cid, content.length > 42 ? content.slice(0, 40) + "…" : content).catch(() => null)
      }
      await loadConvs()
    }
  }

  function getFilteredModels(classKey: string): string[] {
    if (!availProviders) return []
    const catMap: Record<string, ("free" | "paid" | "local")[]> = {
      auto: ["free", "paid", "local"],
      cerebro: ["paid"],
      trabalhador: ["free"],
      local: ["local"],
    }
    const cats = catMap[classKey] || ["free", "paid", "local"]
    const available: string[] = []
    for (const cat of cats) {
      for (const p of (availProviders[cat] || [])) {
        for (const m of p.models) {
          if (!available.includes(m.id)) available.push(m.id)
        }
      }
    }
    return available
  }

  useEffect(() => {
    const models = getFilteredModels(modelClass)
    if (models.length > 0) {
      if (!models.includes(selectedModel)) setSelectedModel(models[0])
    } else {
      setSelectedModel("")
    }
  }, [modelClass, availProviders])

  return (
    <div className="min-h-screen bg-neutral-950 flex">

      <button onClick={() => setMobileMenuOpen(true)} className="md:hidden fixed top-3 right-4 z-[60] text-neutral-400 hover:text-white text-lg leading-none p-1">☰</button>

      <div className={`${sidebarOpen ? "w-60" : "w-0"} hidden md:flex transition-all duration-200 bg-neutral-900 border-r border-neutral-800 flex-col overflow-hidden shrink-0`}>
        <div className="p-3 border-b border-neutral-800">
          <button onClick={() => { newConv(); if (isMobile) setSidebarOpen(false) }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors">
            <span className="text-lg leading-none">+</span> New conversation
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {convs.length === 0 && <p className="text-neutral-600 text-center py-8">No conversations</p>}
          {convs.map((c) => (
            <div key={c.id} className={`group flex items-center gap-1 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors ${c.id === convId ? "bg-neutral-800 text-white" : "text-neutral-400 hover:text-white hover:bg-neutral-800/50"}`} onClick={() => { switchConv(c.id); if (isMobile) setSidebarOpen(false) }}>
              <span className="flex-1 truncate">{c.title}</span>
              <button onClick={(e) => { e.stopPropagation(); deleteConv(c.id) }} className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 transition-all text-lg leading-none px-1">×</button>
            </div>
          ))}
        </div>
      </div>

      {isMobile && sidebarOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 z-30" onClick={() => setSidebarOpen(false)} />
          <div className="fixed inset-y-0 left-0 z-40 w-60 bg-neutral-900 border-r border-neutral-800 flex flex-col">
            <div className="p-3 border-b border-neutral-800 flex items-center gap-2">
              <button onClick={() => setSidebarOpen(false)} className="text-neutral-500 hover:text-white text-lg leading-none p-1">✕</button>
              <div className="flex-1" />
              <button onClick={() => { newConv(); setSidebarOpen(false) }} className="text-neutral-400 hover:text-white text-lg leading-none p-1">+</button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {convs.length === 0 && <p className="text-neutral-600 text-center py-8">No conversations</p>}
              {convs.map((c) => (
                <div key={c.id} className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors ${c.id === convId ? "bg-neutral-800 text-white" : "text-neutral-400 hover:text-white hover:bg-neutral-800/50"}`} onClick={() => { switchConv(c.id); setSidebarOpen(false) }}>
                  <span className="flex-1 truncate">{c.title}</span>
                  <button onClick={(e) => { e.stopPropagation(); deleteConv(c.id) }} className="text-neutral-500 hover:text-red-400 transition-all text-lg leading-none px-1">×</button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {isMobile && mobileMenuOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 z-50" onClick={() => setMobileMenuOpen(false)} />
          <div className="fixed top-0 right-0 z-50 w-56 bg-neutral-900 border-l border-neutral-800 h-full p-4 flex flex-col gap-2">
            <div className="flex justify-end mb-2">
              <button onClick={() => setMobileMenuOpen(false)} className="text-neutral-400 hover:text-white text-lg leading-none p-1">✕</button>
            </div>
            <button onClick={() => { setMobileMenuOpen(false); onNavigate("chat") }} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-neutral-200 hover:bg-neutral-800 transition-colors"> Chat</button>
            <button onClick={() => { setMobileMenuOpen(false); setSidebarOpen(true) }} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-neutral-200 hover:bg-neutral-800 transition-colors"> Conversations</button>
            <button onClick={() => { setMobileMenuOpen(false); onNavigate("analytics") }} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-neutral-200 hover:bg-neutral-800 transition-colors"> Analytics</button>
            <button onClick={() => { setMobileMenuOpen(false); onNavigate("settings") }} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-neutral-200 hover:bg-neutral-800 transition-colors"> Providers</button>
            <div className="border-t border-neutral-800 my-2" />
            <button onClick={() => { setMobileMenuOpen(false); setColorMode(colorMode === "dark" ? "light" : "dark") }} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-neutral-200 hover:bg-neutral-800 transition-colors">{colorMode === "dark" ? "☀️" : "🌙"} {colorMode === "dark" ? "Light" : "Dark"} mode</button>
          </div>
        </>
      )}

      <button onClick={() => setSidebarOpen((s) => !s)} className="fixed top-3 left-3 z-[61] text-neutral-500 hover:text-white text-lg leading-none p-1">{sidebarOpen ? "◀" : "▶"}</button>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-neutral-900 border-b border-neutral-800 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 shrink-0" />
            <h1 className="text-white font-bold text-lg">DaazNexus</h1>
          </div>
          <div className="hidden md:flex items-center gap-4">
            <button onClick={() => onNavigate("analytics")} className="text-neutral-400 hover:text-white transition-colors"> Analytics</button>
            <button onClick={() => onNavigate("settings")} className="text-neutral-400 hover:text-white transition-colors"> Providers</button>
            <button onClick={() => setColorMode(colorMode === "dark" ? "light" : "dark")} className="text-neutral-400 hover:text-white transition-colors text-lg leading-none p-1">{colorMode === "dark" ? "☀️" : "🌙"}</button>
          </div>
        </header>

        <div className="border-b border-neutral-800 bg-neutral-900/50 px-4 py-2 flex items-center gap-3 overflow-x-auto">
          <div className="flex items-center gap-2 shrink-0">
            <select value={modelClass} onChange={(e) => setModelClass(e.target.value as ModelClassKey)}
              className="appearance-none bg-neutral-800 text-white rounded-lg px-3 py-1.5 border border-neutral-700 outline-none"
              style={{ color: MODEL_CLASS_INFO[modelClass].color }}>
              {MODEL_CLASSES.map((key) => {
                const info = MODEL_CLASS_INFO[key]
                return <option key={key} value={key} className="bg-neutral-900 text-white" style={{ color: info.color }}>{info.icon} {info.label}</option>
              })}
            </select>
            <select value={routingStrategy} onChange={(e) => setRoutingStrategy(e.target.value)}
              className="appearance-none bg-neutral-800 text-neutral-400 rounded-lg px-2 py-1.5 border border-neutral-700 outline-none text-xs">
              <option value="smartest" className="bg-neutral-900 text-white"> Smartest</option>
              <option value="fastest" className="bg-neutral-900 text-white"> Fastest</option>
              <option value="priority" className="bg-neutral-900 text-white"> Manual</option>
            </select>
            {modelClass !== "auto" && getFilteredModels(modelClass).length > 0 && (
              <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}
                className="appearance-none bg-neutral-800 text-white rounded-lg px-3 py-1.5 border border-neutral-700 outline-none max-w-[200px]">
                {getFilteredModels(modelClass).map((m) => (
                  <option key={m} value={m} className="bg-neutral-900 text-white">{m}</option>
                ))}
              </select>
            )}
            <span className="hidden sm:inline text-neutral-500 max-w-64 truncate">{MODEL_CLASS_INFO[modelClass].description}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-full px-2 md:px-4 py-4">
            {messages.length === 0 ? (
              <div className="text-center text-neutral-500 mt-20">
                <p className="text-lg">What do you want to do today?</p>
                <p className="text-sm mt-2">Class: <strong>{MODEL_CLASS_INFO[modelClass].label}</strong></p>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex items-end gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    {msg.role !== "user" && <span className="text-sm shrink-0">{msg.role === "assistant" ? "🤖" : "⚠️"}</span>}
                    <div className={`max-w-[90%] rounded-2xl px-4 py-3 ${msg.role === "user" ? "bg-[var(--theme-primary)] text-white" : msg.role === "system" ? "bg-red-900/30 text-red-300 border border-red-800/50" : "bg-neutral-800 text-neutral-200"}`}>
                      {msg.id < 0 ? (
                        <>
                          {toolEvents.length > 0 && (
                            <div className="space-y-1 mb-2 pb-2 border-b border-neutral-700/50">
                              {toolEvents.map((tc) => (
                                <div key={tc.id} className="flex items-center gap-2 text-xs">
                                  <span className={tc.status === "running" ? "animate-pulse text-amber-400" : tc.status === "completed" ? "text-emerald-400" : "text-red-400"}>
                                    {tc.status === "running" ? "🔧" : tc.status === "completed" ? "✅" : "❌"}
                                  </span>
                                  <code className="text-neutral-300">{tc.name}</code>
                                </div>
                              ))}
                            </div>
                          )}
                          <p className="whitespace-pre-wrap">{streamingContent || (loading ? "Thinking..." : "")}<span className="animate-pulse">▊</span></p>
                        </>
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      )}
                      {msg.role === "assistant" && msg.id > 0 && (
                        <div className="text-xs text-neutral-500 mt-1.5 flex items-center gap-2 flex-wrap">
                          {msg.model && <span>{msg.model}</span>}
                          {msg.tokens_used != null && <span>{msg.tokens_used} tok</span>}
                          {msg.duration != null && <span>{msg.duration}s</span>}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 bg-neutral-900 border border-neutral-800 rounded-2xl px-4 py-3 focus-within:border-neutral-700 transition-colors mt-4">
              <textarea className="flex-1 bg-transparent text-white outline-none resize-none max-h-48 py-2" placeholder="Message..." rows={1} value={input}
                onChange={(e) => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 192) + "px" }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage() } }} disabled={loading} />
              <button className="bg-[var(--theme-primary)] text-white rounded-xl px-4 py-2 font-medium shrink-0 h-10" onClick={sendMessage} disabled={loading || !input.trim()}>
                {loading ? "..." : "→"}
              </button>
            </div>
            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>

      {permReq && (
        <PermissionModal
          reqs={[permReq]}
          onRespond={(req, granted) => {
            const nexus = (window as any).nexus
            nexus?.permissions?.respond?.(req.id, granted)
            setPermReq(null)
          }}
        />
      )}
    </div>
  )
}
