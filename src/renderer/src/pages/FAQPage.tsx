import type { Page } from "../constants"
import type { Lang } from "../i18n"

function faqContent(lang: Lang) {
  const en = [
    {
      q: "How do I get started?",
      a: "Go to ⚙ Providers to add API keys for free providers like Groq, OpenRouter, or Gemini. After adding a key, the models will appear in your chat model selector.",
    },
    {
      q: "Why don't I see any models in the selector?",
      a: "You need to configure at least one API key first. Go to ⚙ Providers, pick a provider (e.g. Groq — free), add your API key, and click Save. Models will appear in the dropdown after that.",
    },
    {
      q: "Where do I get free API keys?",
      a: (
        <>
          Each provider has a "Get API Key" link next to its name. Here are the easiest free ones:
          <ul className="list-disc list-inside mt-2 space-y-1 text-neutral-400">
            <li><strong className="text-white">Groq:</strong> console.groq.com — fastest free LLM</li>
            <li><strong className="text-white">OpenRouter:</strong> openrouter.ai — many models in one place</li>
            <li><strong className="text-white">Gemini:</strong> aistudio.google.com — Google's free tier</li>
            <li><strong className="text-white">GitHub Models:</strong> github.com/marketplace/models — free with GitHub account</li>
            <li><strong className="text-white">Mistral:</strong> console.mistral.ai — free experimental plan</li>
          </ul>
        </>
      ),
    },
    {
      q: "What do Smartest, Fastest and Manual mean?",
      a: (
        <>
          These control how the fallback chain picks and orders models when more than one is available:
          <ul className="list-disc list-inside mt-2 space-y-2 text-neutral-400">
            <li><strong className="text-white">Smartest</strong> — tries the most capable model first. Best for complex questions, reasoning, and code.</li>
            <li><strong className="text-white">Fastest</strong> — tries the lowest-latency model first. Best for quick answers.</li>
            <li><strong className="text-white">Manual</strong> — uses the catalogue order as-is, with no reordering.</li>
          </ul>
          <p className="mt-2">In all three modes, if the first model fails the system automatically falls back to the next one.</p>
        </>
      ),
    },
    {
      q: "What are System Instructions?",
      a: (
        <>
          <p className="mb-2">The system instructions bar (just above the chat) lets you define how the model should behave for the <strong className="text-white">entire conversation</strong> — without repeating yourself in every message.</p>
          <p className="mb-2"><strong className="text-white">The big advantage:</strong> instead of writing "respond concisely, in bullet points, using Python for code examples" in every single message, you write it once at the top and the model follows it automatically.</p>
          <p className="mb-1 text-neutral-300">Real use cases:</p>
          <ul className="list-disc list-inside mb-2 space-y-1 text-neutral-400">
            <li>Code conversation → <em>"Act as a senior engineer. Always show clean, commented code."</em></li>
            <li>Writing conversation → <em>"Write in a persuasive tone, short sentences, no long introductions."</em></li>
            <li>Learning conversation → <em>"Explain everything as if I'm a beginner, using simple analogies."</em></li>
            <li>Translation → <em>"Translate everything I write into formal English."</em></li>
          </ul>
          <p className="text-neutral-500 text-xs">Saves automatically as you type. Each conversation has its own instructions.</p>
        </>
      ),
    },
    {
      q: "What is the Prompt Library (⭐)?",
      a: (
        <>
          The ⭐ button next to the input lets you save and reuse prompts you use frequently.
          <ul className="list-disc list-inside mt-2 space-y-1 text-neutral-400">
            <li>Click <strong className="text-white">⭐</strong> to open the library</li>
            <li>Click <strong className="text-white">"Save current"</strong> to save whatever you've typed</li>
            <li>Click any saved prompt to instantly fill the input</li>
            <li>Hover a prompt and click <strong className="text-white">×</strong> to delete it</li>
          </ul>
          <p className="mt-2">Prompts are saved locally — they persist across sessions.</p>
        </>
      ),
    },
    {
      q: "What are Memories (🧠)?",
      a: (
        <>
          <p className="mb-2">The 🧠 Memories page lets you store personal facts the assistant will use in <strong className="text-white">every conversation</strong>.</p>
          <p className="mb-1 text-neutral-300">Examples of useful memories:</p>
          <ul className="list-disc list-inside mb-2 space-y-1 text-neutral-400">
            <li><em>"I'm a Python developer working on a FastAPI project."</em></li>
            <li><em>"I prefer concise answers with code examples."</em></li>
            <li><em>"Always respond in Portuguese."</em></li>
          </ul>
          <p className="text-neutral-500 text-xs">Add facts via the 🧠 button in the header. They are stored locally and injected into every chat.</p>
        </>
      ),
    },
    {
      q: "What are Artifacts (▶ Preview)?",
      a: (
        <>
          When the model generates HTML or SVG code, a <strong className="text-white">▶ Preview</strong> button appears in the code block. Clicking it opens a live preview panel on the right side of the screen.
          <ul className="list-disc list-inside mt-2 space-y-1 text-neutral-400">
            <li>HTML pages, components, and charts render in real-time</li>
            <li>SVG graphics display with correct proportions</li>
            <li>Use <strong className="text-white">Open in new window</strong> to see the full result</li>
          </ul>
        </>
      ),
    },
  ]

  const pt = [
    {
      q: "Como começar?",
      a: "Vai a ⚙ Providers para adicionar chaves de API de providers gratuitos como Groq, OpenRouter ou Gemini. Depois de adicionar uma chave, os modelos aparecerão no seletor de modelos do chat.",
    },
    {
      q: "Porque é que não vejo nenhum modelo no seletor?",
      a: "Precisas de configurar pelo menos uma chave de API primeiro. Vai a ⚙ Providers, escolhe um provider (ex. Groq — grátis), adiciona a tua chave e clica em Guardar.",
    },
    {
      q: "Onde obtenho chaves de API gratuitas?",
      a: (
        <>
          Cada provider tem um link "Obter API Key" ao lado do nome. Aqui estão os mais fáceis e gratuitos:
          <ul className="list-disc list-inside mt-2 space-y-1 text-neutral-400">
            <li><strong className="text-white">Groq:</strong> console.groq.com — LLM gratuito mais rápido</li>
            <li><strong className="text-white">OpenRouter:</strong> openrouter.ai — muitos modelos num só sítio</li>
            <li><strong className="text-white">Gemini:</strong> aistudio.google.com — nível gratuito da Google</li>
            <li><strong className="text-white">GitHub Models:</strong> github.com/marketplace/models — grátis com conta GitHub</li>
            <li><strong className="text-white">Mistral:</strong> console.mistral.ai — plano experimental gratuito</li>
          </ul>
        </>
      ),
    },
    {
      q: "O que significam Smartest, Fastest e Manual?",
      a: (
        <>
          Controlam como a cadeia de fallback escolhe e ordena os modelos:
          <ul className="list-disc list-inside mt-2 space-y-2 text-neutral-400">
            <li><strong className="text-white">Smartest</strong> — tenta o modelo mais capaz primeiro. Melhor para perguntas complexas e código.</li>
            <li><strong className="text-white">Fastest</strong> — tenta o modelo de menor latência primeiro. Melhor para respostas rápidas.</li>
            <li><strong className="text-white">Manual</strong> — usa a ordem do catálogo tal como está.</li>
          </ul>
          <p className="mt-2">Nos três modos, se o primeiro modelo falhar o sistema faz fallback automaticamente para o próximo.</p>
        </>
      ),
    },
    {
      q: "Para que servem as Instruções do Sistema?",
      a: (
        <>
          <p className="mb-2">A barra de instruções do sistema (logo acima do chat) permite definir como o modelo se deve comportar durante <strong className="text-white">toda a conversa</strong>.</p>
          <p className="mb-2"><strong className="text-white">A grande vantagem:</strong> em vez de escrever "responde de forma concisa, usando Python para exemplos" em cada mensagem, escreves uma vez no topo e o modelo segue automaticamente.</p>
          <p className="mb-1 text-neutral-300">Exemplos reais:</p>
          <ul className="list-disc list-inside mb-2 space-y-1 text-neutral-400">
            <li>Código → <em>"Age como engenheiro sénior. Mostra sempre código limpo."</em></li>
            <li>Escrita → <em>"Escreve de forma persuasiva, frases curtas."</em></li>
            <li>Aprendizagem → <em>"Explica tudo como se eu fosse iniciante."</em></li>
            <li>Tradução → <em>"Traduz tudo o que eu escrevo para inglês formal."</em></li>
          </ul>
          <p className="text-neutral-500 text-xs">Guarda automaticamente. Cada conversa tem as suas próprias instruções.</p>
        </>
      ),
    },
    {
      q: "Para que serve a Biblioteca de Prompts (⭐)?",
      a: (
        <>
          O botão ⭐ ao lado do input permite guardar e reutilizar prompts frequentes.
          <ul className="list-disc list-inside mt-2 space-y-1 text-neutral-400">
            <li>Clica em <strong className="text-white">⭐</strong> para abrir a biblioteca</li>
            <li>Clica em <strong className="text-white">"Guardar atual"</strong> para guardar o que tens escrito</li>
            <li>Clica num prompt guardado para preencher o input automaticamente</li>
            <li>Passa o rato e clica em <strong className="text-white">×</strong> para apagar</li>
          </ul>
          <p className="mt-2">Os prompts são guardados localmente e persistem entre sessões.</p>
        </>
      ),
    },
    {
      q: "Para que servem as Memórias (🧠)?",
      a: (
        <>
          <p className="mb-2">A página 🧠 Memórias permite guardar factos pessoais que o assistente vai usar em <strong className="text-white">todas as conversas</strong>.</p>
          <p className="mb-1 text-neutral-300">Exemplos de memórias úteis:</p>
          <ul className="list-disc list-inside mb-2 space-y-1 text-neutral-400">
            <li><em>"Sou developer Python a trabalhar num projeto FastAPI."</em></li>
            <li><em>"Prefiro respostas concisas com exemplos de código."</em></li>
            <li><em>"Responde sempre em português."</em></li>
          </ul>
          <p className="text-neutral-500 text-xs">Adiciona factos via o botão 🧠 no cabeçalho. São guardados localmente e injetados em cada conversa.</p>
        </>
      ),
    },
    {
      q: "O que são os Artefactos (▶ Preview)?",
      a: (
        <>
          Quando o modelo gera código HTML ou SVG, aparece um botão <strong className="text-white">▶ Preview</strong> no bloco de código. Clicando nele, abre um painel de pré-visualização ao vivo no lado direito.
          <ul className="list-disc list-inside mt-2 space-y-1 text-neutral-400">
            <li>Páginas HTML, componentes e gráficos renderizam em tempo real</li>
            <li>SVGs mostram-se com as proporções corretas</li>
            <li>Usa <strong className="text-white">Abrir em nova janela</strong> para ver o resultado completo</li>
          </ul>
        </>
      ),
    },
  ]

  return lang === "pt" ? pt : en
}

export default function FAQPage({ onNavigate, lang }: { onNavigate: (p: Page) => void; lang: Lang }) {
  const faqs = faqContent(lang)

  return (
    <div className="min-h-screen bg-neutral-950">
      <header className="bg-neutral-900 border-b border-neutral-800 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <h1 className="text-white font-bold text-lg">❓ FAQ</h1>
          <button onClick={() => onNavigate("chat")} className="text-neutral-400 hover:text-white transition-colors text-sm">← {lang === "pt" ? "Voltar ao chat" : "Back to chat"}</button>
        </div>
      </header>
      <div className="max-w-3xl mx-auto p-4 space-y-3">
        {faqs.map((f, i) => (
          <details key={i} className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden group">
            <summary className="text-white font-medium text-sm px-4 py-3 cursor-pointer hover:bg-neutral-800/50 transition-colors flex items-center justify-between">
              <span>{f.q}</span>
              <span className="text-neutral-500 group-open:hidden">▶</span>
              <span className="text-neutral-500 hidden group-open:inline">▼</span>
            </summary>
            <div className="px-4 pb-4 text-sm text-neutral-400 leading-relaxed border-t border-neutral-800 pt-3 mt-0">
              {f.a}
            </div>
          </details>
        ))}
      </div>
    </div>
  )
}
