import React from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { codeToHtml } from "shiki"

interface MarkdownProps {
  content: string
  className?: string
}

export default function Markdown({ content, className }: MarkdownProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className: _cn, children, ...props }) {
            const match = /language-(\w+)/.exec(_cn || "")
            const lang = match ? match[1] : ""
            const code = String(children).replace(/\n$/, "")
            if (lang && code) {
              return <CodeBlock code={code} lang={lang} />
            }
            return (
              <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
                {children}
              </code>
            )
          },
          pre({ children }) {
            return <>{children}</>
          },
          a({ href, children }) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 hover:text-primary/80">
                {children}
              </a>
            )
          },
          p({ children }) {
            return <p className="leading-relaxed my-1.5">{children}</p>
          },
          ul({ children }) {
            return <ul className="list-disc pl-5 my-1 space-y-0.5">{children}</ul>
          },
          ol({ children }) {
            return <ol className="list-decimal pl-5 my-1 space-y-0.5">{children}</ol>
          },
          blockquote({ children }) {
            return (
              <blockquote className="border-l-2 border-primary/30 pl-3 my-2 text-muted-foreground italic">
                {children}
              </blockquote>
            )
          },
          h1({ children }) { return <h1 className="text-lg font-bold mt-4 mb-2">{children}</h1> },
          h2({ children }) { return <h2 className="text-base font-bold mt-3 mb-1.5">{children}</h2> },
          h3({ children }) { return <h3 className="text-sm font-semibold mt-3 mb-1">{children}</h3> },
          table({ children }) {
            return (
              <div className="overflow-x-auto my-2">
                <table className="border-collapse border border-border text-sm">
                  {children}
                </table>
              </div>
            )
          },
          th({ children }) {
            return <th className="border border-border px-2 py-1 bg-muted font-medium text-left">{children}</th>
          },
          td({ children }) {
            return <td className="border border-border px-2 py-1">{children}</td>
          },
          hr() { return <hr className="border-border my-3" /> },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [html, setHtml] = React.useState<string | null>(null)

  React.useEffect(() => {
    codeToHtml(code, {
      lang,
      theme: "github-dark",
    })
      .then(setHtml)
      .catch(() => setHtml(null))
  }, [code, lang])

  if (!html) {
    return (
      <pre className="bg-muted/50 rounded-lg p-3 overflow-x-auto my-2 text-sm">
        <code>{code}</code>
      </pre>
    )
  }

  return (
    <div
      className="rounded-lg overflow-hidden my-2 text-sm"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
