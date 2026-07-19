# DaazNexus Desktop

Chat com 30+ modelos de IA num único app. Versão desktop do [chat.daazlabs.com](https://chat.daazlabs.com) — sem servidor, sem login, tudo local.

---

## Download

**[→ Descarregar a última versão](https://github.com/daazlabs/nexus-desktop/releases/latest)**

| Sistema | Ficheiro |
|---------|----------|
| Windows | `DaazNexus-Setup-*.exe` |
| macOS (Apple Silicon / Intel) | `DaazNexus-*-arm64.dmg` |
| Linux | `DaazNexus-*.AppImage` ou `nexus-desktop_*.deb` |

---

## Instalação

### Windows

1. Descarregar o ficheiro `.exe`
2. Executar o instalador
3. O app abre directamente — adicionar a API key em Settings para começar

### Linux

**AppImage:**
```bash
chmod +x DaazNexus-*.AppImage
./DaazNexus-*.AppImage
```

**Debian/Ubuntu (.deb):**
```bash
sudo dpkg -i nexus-desktop_*.deb
```

---

### macOS — Instrução importante

O app não está assinado com certificado Apple. O macOS pode mostrar o erro **"DaazNexus está danificado e não pode ser aberto"** ao tentar instalar. Isto é normal para apps independentes — não é um vírus.

**Como resolver (escolhe uma das opções):**

#### Opção A — Antes de instalar (recomendada)

No Terminal, antes de montar o DMG:

```bash
xattr -d com.apple.quarantine ~/Downloads/DaazNexus-*.dmg
```

Depois abre o DMG e arrasta o app para Applications normalmente.

#### Opção B — Depois de instalar

Se já instalaste e deu erro:

```bash
sudo xattr -rd com.apple.quarantine /Applications/DaazNexus.app
```

#### Opção C — Sem terminal (mais fácil)

1. No Finder, **clica com o botão direito** no DMG → **"Abrir"**
2. No diálogo de aviso, clica **"Abrir"** novamente
3. Arrasta para Applications
4. Na primeira vez que abrires o app, volta a fazer **botão direito → "Abrir"**

O macOS vai lembrar a tua escolha e não volta a pedir.

#### Opção D — Script automático (recomendada para atualizações)

Como o macOS nunca completa o update automático sozinho (app não assinada), a forma mais rápida de atualizar é:

1. Descarrega o `.dmg` da [última versão](https://github.com/daazlabs/nexus-desktop/releases/latest) — fica em `~/Downloads`
2. Descarrega o [`install-mac.command`](https://raw.githubusercontent.com/daazlabs/nexus-desktop/main/install-mac.command)
3. Dá duplo-clique no `install-mac.command` no Finder

O script remove a quarentena, substitui a versão antiga em `/Applications` e pergunta se queres abrir o app — tudo automático, sem arrastar nada.

> Se o Finder recusar abrir o `.command` por não ter permissão de execução, corre uma vez no Terminal: `chmod +x ~/Downloads/install-mac.command`

---

## Funcionalidades

- **30+ providers de IA** — Groq, Gemini, OpenRouter, DeepSeek, Claude, GPT-4, Ollama, llama.cpp e mais
- **Modo Auto** — escolhe o melhor modelo disponível automaticamente
- **Tools nativas** — acesso ao sistema de ficheiros, bash, com popup de permissão
- **Projectos** — agrupa conversas por projecto com instruções customizadas
- **Offline** — modelos locais via Ollama ou llama.cpp sem internet
- **Memórias** — guarda factos sobre ti entre conversas
- **Streaming** — respostas em tempo real
- **Sem login** — app local, as tuas chaves ficam encriptadas no teu computador

---

## Primeiros passos

1. Abre o app → vai para **Settings**
2. Adiciona pelo menos uma API key (Groq é gratuito: [console.groq.com/keys](https://console.groq.com/keys))
3. Volta ao chat e começa a conversar

Para modelos locais, instala [Ollama](https://ollama.com/download) e corre `ollama pull qwen3.5:9b`.

---

## Construir a partir do código

```bash
git clone https://github.com/daazlabs/nexus-desktop.git
cd nexus-desktop
npm install
cd src/renderer && npm install && cd ../..
npm run build
npm run start        # desenvolvimento
npm run dist         # empacotar para distribuição
```
