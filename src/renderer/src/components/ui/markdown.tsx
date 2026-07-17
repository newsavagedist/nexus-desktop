import React from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { codeToHtml } from "shiki"
import { useArtifact } from "./artifact-context"
import type { Lang } from "../../i18n"
import { t } from "../../i18n"

interface Props { content: string; className?: string; lang?: Lang }

type ContentPart =
  | { type: "think"; text: string }
  | { type: "attachment"; name: string; text: string }
  | { type: "text"; text: string }

function splitAttachments(text: string): ContentPart[] {
  const parts: ContentPart[] = []
  const regex = /<attachment name="([^"]*)">([\s\S]*?)<\/attachment>/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index).trim()
      if (before) parts.push({ type: "text", text: before })
    }
    parts.push({ type: "attachment", name: match[1], text: match[2].trim() })
    lastIndex = match.index + match[0].length
  }
  const remaining = text.slice(lastIndex).trim()
  if (remaining) parts.push({ type: "text", text: remaining })
  return parts
}

function parseContent(content: string): ContentPart[] {
  const parts: ContentPart[] = []
  const regex = /<think>([\s\S]*?)<\/think>/gi
  let lastIndex = 0
  let match: RegExpExecArray | null

  regex.lastIndex = 0
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index).trim()
      if (text) parts.push(...splitAttachments(text))
    }
    const think = match[1].trim()
    if (think) parts.push({ type: "think", text: think })
    lastIndex = match.index + match[0].length
  }

  const remaining = content.slice(lastIndex).trim()
  if (remaining) parts.push(...splitAttachments(remaining))

  if (parts.length === 0) parts.push({ type: "text", text: content.trim() })
  return parts
}

function ThinkCollapsible({ content, lang }: { content: string; lang: Lang }) {
  const [open, setOpen] = React.useState(false)
  return (
    <div className="mb-3 text-xs rounded-xl border border-border/40 bg-muted/20 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>💭</span>
        <span>{t(lang, "markdownReasoning")}</span>
        <span className="ml-auto opacity-50">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-3 pb-2 pt-1 border-t border-border/30 text-muted-foreground/70 whitespace-pre-wrap leading-relaxed font-mono text-[11px] max-h-64 overflow-y-auto">
          {content}
        </div>
      )}
    </div>
  )
}

function AttachmentCollapsible({ name, content, lang }: { name: string; content: string; lang: Lang }) {
  const [open, setOpen] = React.useState(false)
  return (
    <div className="mb-3 text-xs rounded-xl border border-border/40 bg-muted/20 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>📎</span>
        <span className="truncate">{name}</span>
        <span className="ml-auto opacity-50">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-3 pb-2 pt-1 border-t border-border/30 max-h-[400px] overflow-y-auto">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={makeMDComponents(lang)}>{content}</ReactMarkdown>
        </div>
      )}
    </div>
  )
}

function makeMDComponents(contentLang?: Lang): React.ComponentProps<typeof ReactMarkdown>["components"] {
  return {
    code({ className: _cn, children, ...props }) {
      const match = /language-(\w+)/.exec(_cn || "")
      const codeLang = match ? match[1] : ""
      if (codeLang && String(children)) return <CodeBlock code={String(children).replace(/\n$/, "")} lang={codeLang} contentLang={contentLang} />
      return <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono" {...props}>{children}</code>
    },
    pre({ children }) { return <>{children}</> },
    a({ href, children }) { return <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">{children}</a> },
    p({ children }) { return <p className="leading-relaxed my-1.5">{children}</p> },
    ul({ children }) { return <ul className="list-disc pl-5 my-1 space-y-0.5">{children}</ul> },
    ol({ children }) { return <ol className="list-decimal pl-5 my-1 space-y-0.5">{children}</ol> },
    blockquote({ children }) { return <blockquote className="border-l-2 border-primary/30 pl-3 my-2 text-muted-foreground italic">{children}</blockquote> },
    h1({ children }) { return <h1 className="text-lg font-bold mt-4 mb-2">{children}</h1> },
    h2({ children }) { return <h2 className="text-base font-bold mt-3 mb-1.5">{children}</h2> },
    h3({ children }) { return <h3 className="text-sm font-semibold mt-3 mb-1">{children}</h3> },
    table({ children }) { return <div className="overflow-x-auto my-2"><table className="border-collapse border border-border text-sm">{children}</table></div> },
    th({ children }) { return <th className="border border-border px-2 py-1 bg-muted font-medium text-left">{children}</th> },
    td({ children }) { return <td className="border border-border px-2 py-1">{children}</td> },
    hr() { return <hr className="border-border my-3" /> },
  }
}

export default function Markdown({ content, className, lang: contentLang }: Props) {
  const parts = parseContent(content)
  const fallbackLang = (typeof document !== "undefined" ? (document.documentElement.lang as Lang) : undefined) || "pt"
  const activeLang = contentLang || fallbackLang
  return (
    <div className={className}>
      {parts.map((part, i) =>
        part.type === "think"
          ? <ThinkCollapsible key={i} content={part.text} lang={activeLang} />
          : part.type === "attachment"
          ? <AttachmentCollapsible key={i} name={part.name} content={part.text} lang={activeLang} />
          : <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={makeMDComponents(activeLang)}>{part.text}</ReactMarkdown>
      )}
    </div>
  )
}

const PREVIEWABLE = new Set(["html", "svg"])

function CodeBlock({ code, lang: codeLang, contentLang }: { code: string; lang: string; contentLang?: Lang }) {
  const [html, setHtml] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)
  const { openArtifact } = useArtifact()

  React.useEffect(() => {
    codeToHtml(code, { lang: PREVIEWABLE.has(codeLang) ? "html" : codeLang, theme: "github-dark" }).then(setHtml).catch(() => setHtml(null))
  }, [code, codeLang])

  const copy = () => {
    navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
  }

  return (
    <div className="rounded-lg overflow-hidden my-2 text-sm border border-border/30">
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/40 border-b border-border/20">
        <span className="text-[11px] text-muted-foreground/70 font-mono">{codeLang}</span>
        <div className="flex items-center gap-2">
          {PREVIEWABLE.has(codeLang) && (
            <button
              onClick={() => openArtifact(code, codeLang)}
              className="text-[11px] text-primary/80 hover:text-primary font-medium transition-colors">
              {t(contentLang || "pt", "markdownPreview")}
            </button>
          )}
          <button onClick={copy} className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors">
            {copied ? t(contentLang || "pt", "markdownCopied") : t(contentLang || "pt", "markdownCopy")}
          </button>
        </div>
      </div>
      {html
        ? <div dangerouslySetInnerHTML={{ __html: html }} />
        : <pre className="bg-muted/50 p-3 overflow-x-auto"><code>{code}</code></pre>
      }
    </div>
  )
}
