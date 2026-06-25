interface Conv {
  id: number
  title: string
}

interface Props {
  convs: Conv[]
  convId: number | null
  sidebarOpen: boolean
  isMobile: boolean
  onSelect: (id: number) => void
  onNew: () => void
  onDelete: (id: number) => void
  onToggle: () => void
  onClose: () => void
}

export default function ConversationSidebar({
  convs, convId, sidebarOpen, isMobile, onSelect, onNew, onDelete, onToggle, onClose,
}: Props) {
  if (isMobile && !sidebarOpen) return null

  return (
    <>
      {!isMobile && (
        <div className={`${sidebarOpen ? "w-60" : "w-0"} hidden md:flex transition-all duration-200 bg-card border-r border-border flex-col overflow-hidden shrink-0`}>
          <div className="p-3 border-b border-border">
            <button onClick={() => { onNew(); if (isMobile) onClose() }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-full text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
              <span className="text-lg leading-none">+</span> New conversation
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {convs.length === 0 && <p className="text-muted-foreground/50 text-center py-8 text-xs">No conversations</p>}
            {convs.map((c) => (
              <div key={c.id}
                className={`group flex items-center gap-1 px-3 py-2 rounded-full text-sm cursor-pointer transition-colors ${
                  c.id === convId ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                }`}
                onClick={() => { onSelect(c.id); if (isMobile) onClose() }}>
                <span className="flex-1 truncate">{c.title}</span>
                <button onClick={(e) => { e.stopPropagation(); onDelete(c.id) }}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all text-lg leading-none px-1">×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {isMobile && sidebarOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 z-30" onClick={onClose} />
          <div className="fixed inset-y-0 left-0 z-40 w-60 bg-card border-r border-border flex flex-col">
            <div className="p-3 border-b border-border flex items-center gap-2">
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none p-1">✕</button>
              <div className="flex-1" />
              <button onClick={() => { onNew(); onClose() }} className="text-muted-foreground hover:text-foreground text-lg leading-none p-1">+</button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {convs.map((c) => (
                <div key={c.id}
                  className={`flex items-center gap-1 px-3 py-2 rounded-full text-sm cursor-pointer transition-colors ${
                    c.id === convId ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  }`}
                  onClick={() => { onSelect(c.id); onClose() }}>
                  <span className="flex-1 truncate">{c.title}</span>
                  <button onClick={(e) => { e.stopPropagation(); onDelete(c.id) }} className="text-muted-foreground hover:text-destructive transition-all text-lg leading-none px-1">×</button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <button onClick={onToggle}
        className="fixed top-3 left-3 z-[61] text-muted-foreground hover:text-foreground text-lg leading-none p-1">
        {sidebarOpen && !isMobile ? "◀" : "▶"}
      </button>
    </>
  )
}
