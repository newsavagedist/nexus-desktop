// Real web search via a local SearXNG instance — ports backend/services/web_search.py
// so the Desktop app stops relying on a model's own (often outdated or invented)
// knowledge for anything time-sensitive. Deliberately NOT gated behind BUILD mode:
// unlike bash/write_file, a read-only web search carries none of the risk PLAN mode
// exists to block, so it runs regardless of which mode the user is in.
const SEARXNG_URL = process.env.SEARXNG_URL || 'http://127.0.0.1:8888'

// Same keyword heuristic as the backend (services/web_search.py) — kept in sync
// deliberately, both sides should trigger enrichment on the same kinds of questions.
const REALTIME_KEYWORDS = [
  'preço', 'preco', 'price', 'valor', 'cotação', 'cotacao', 'quanto custa',
  'how much', 'custo', 'custa', 'mercado', 'market',
  'bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'cripto',
  'acção', 'acao', 'stock', 'bolsa', 'nasdaq', 's&p',
  'euro', 'dólar', 'dollar', 'usd', 'eur',
  'notícia', 'noticia', 'news', 'última hora', 'hoje', 'today', 'agora', 'now',
  'actual', 'atual', 'current', 'recente', 'recent', 'último', 'ultimo',
  'latest', 'live', 'em directo', 'em direto',
  'tempo', 'weather', 'clima', 'temperatura', 'chuva', 'rain',
  'resultado', 'result', 'jogo', 'game', 'placar', 'score',
  'liga', 'league', 'championship',
  'esta semana', 'this week', 'este mês', 'this month',
  'ontem', 'yesterday', 'amanhã', 'tomorrow',
]

export function needsWebSearch(text: string): boolean {
  const t = text.toLowerCase()
  return REALTIME_KEYWORDS.some(kw => t.includes(kw))
}

interface SearxngResult {
  title?: string
  content?: string
  url?: string
}

export async function webSearch(query: string, maxResults = 5): Promise<string> {
  try {
    const url = new URL('/search', SEARXNG_URL)
    url.searchParams.set('q', query)
    url.searchParams.set('format', 'json')
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!resp.ok) return ''
    const data = await resp.json()
    const results: SearxngResult[] = data.results || []
    if (!results.length) return ''

    const now = new Date().toLocaleString('pt-PT')
    const lines = [`[Pesquisa web — ${now}]`]
    for (const r of results.slice(0, maxResults)) {
      const title = (r.title || '').trim()
      const content = (r.content || '').trim().slice(0, 350)
      if (title || content) {
        lines.push(`\n${title}`)
        if (content) lines.push(content)
        if (r.url) lines.push(`Fonte: ${r.url}`)
      }
    }
    return lines.join('\n')
  } catch (e) {
    console.warn('[webSearch] failed:', e)
    return ''
  }
}

// Returns the system-message content to inject, or '' if this message doesn't
// look like it needs current info (or the search came back empty).
export async function maybeEnrichWithWeb(lastUserMessage: string): Promise<string> {
  if (!lastUserMessage || !needsWebSearch(lastUserMessage)) return ''
  const query = lastUserMessage.trim().slice(0, 200)
  const results = await webSearch(query)
  if (!results) return ''
  return (
    'Os seguintes resultados de pesquisa foram obtidos automaticamente. ' +
    'Usa-os directamente para responder com dados actualizados. ' +
    'Não simules ferramentas nem visitas a websites — apenas usa a informação abaixo:\n\n' +
    results
  )
}
