# Nexus Desktop — Plano de Limpeza + Implementação (Electron)

> Este documento foi preparado numa sessão de análise (cópia Windows). A execução real é no Ubuntu, na localização final `/home/daazlabs/projects/daaznexus/` — decisão tomada depois de uma primeira tentativa de limpeza "no sítio" ter corrido mal (um agente restaurou o design antigo por engano). Por isso a Parte 1 já não é "apagar o que está a mais" — é "copiar só o que está confirmado limpo (`CHAT/`) para um sítio novo, e só apagar o antigo depois de confirmar que o novo funciona".

---

## PARTE 1 — Mover para a localização final

Como só vais copiar o conteúdo do `CHAT/` (já confirmado autónomo e limpo de referências Tauri nas sessões anteriores), não há lista de "apagar X, Y, Z" — o lixo do Tauri (`src-tauri/`, `DESIGN-BACKUP/`, `ui/src.backup/`, scripts `tauri:*`) simplesmente nunca é copiado, porque nunca esteve dentro de `CHAT/`.

### Passo 0 — Parar o que estiver a correr no sítio actual

```bash
cd /caminho/atual/para/daazlabs-nexus   # onde o código está hoje
docker compose down
```

### Passo 1 — Copiar (não mover ainda) para a localização nova

```bash
mkdir -p /home/daazlabs/projects
ls /home/daazlabs/projects/        # confirmar que não existe já um "daaznexus" com outra coisa lá dentro
cp -r /caminho/atual/para/daazlabs-nexus /home/daazlabs/projects/daaznexus
cd /home/daazlabs/projects/daaznexus
ls -la                              # confirmar que veio tudo: backend/, ui/, data/, docker-compose.yml, .env, package.json, scripts/, venv/
```

`cp -r` em vez de `mv` de propósito — só apagas o `daazlabs-nexus` antigo no Passo 5, depois de confirmares que o novo local funciona. Até lá tens as duas cópias e zero risco.

### Passo 2 — Criar `nexus-desktop/` dentro da localização nova

```bash
cd /home/daazlabs/projects/daaznexus
mkdir -p nexus-desktop
git init nexus-desktop
cp NEXUS-DESKTOP-SETUP.md nexus-desktop/SETUP.md
```

`nexus-desktop/` com `git init` próprio = histórico zero, independente do resto do repositório.

### Passo 3 — Preservar os 2 documentos que não estão no git

`DAAZNEXUS-VISION.md` e `DaazNexus_Conceito.md` continuam sem estar commitados (`PROJECTO-NEXUS.md` e `NEXUS-UI-REDESIGN.md` já estão seguros no histórico do git). Faz isto já na localização nova:

```bash
cd /home/daazlabs/projects/daaznexus
git add DAAZNEXUS-VISION.md DaazNexus_Conceito.md
git commit -m "docs: preservar documentos de visao apos mudanca de localizacao"
```

Sugestão: move os 4 docs para `nexus-desktop/docs/` depois de criares a estrutura na Parte 2.

### Passo 4 — Rebuild e testar a partir da localização nova

```bash
cd /home/daazlabs/projects/daaznexus
docker compose build --no-cache
docker compose up -d
docker compose logs -f --tail=50
curl -I http://localhost:3001
```

### Passo 5 — Verificar configuração externa antes de apagar o antigo

Este é o único risco real de mudar de pasta: qualquer coisa **fora deste repositório** que aponte para o caminho antigo continua a apontar para lá até a actualizares — `systemd`, Cloudflare Tunnel/`cloudflared`, cron, scripts de arranque.

```bash
sudo systemctl list-units --type=service | grep -i daaznexus
cat /etc/cloudflared/config.yml 2>/dev/null   # ou onde estiver a config do tunnel
crontab -l 2>/dev/null | grep -i daazlabs-nexus
```

Actualiza o que encontrares para apontar para `/home/daazlabs/projects/daaznexus/`. Só depois de confirmares que `chat.daazlabs.com` e `localhost:3001` respondem a partir da localização nova é que apagas o `daazlabs-nexus` antigo:

```bash
rm -rf /caminho/atual/para/daazlabs-nexus
```

### Passo 6 (opcional) — Confirmação final de zero resíduos Tauri

Já não é crítico — só copiaste o que estava dentro de `CHAT/`, confirmado limpo nas sessões anteriores. Mas se quiseres ter a certeza:

```bash
cd /home/daazlabs/projects/daaznexus
grep -ril "tauri" . \
  --include="*.py" --include="*.ts" --include="*.tsx" \
  --include="*.json" --include="*.toml" --include="*.yml" --include="*.yaml" \
  --include="Dockerfile*" --include="*.conf" \
  2>/dev/null | grep -v node_modules | grep -v venv | grep -v "/\.git/"
```

---

## PARTE 2 — Implementar o Nexus Desktop (Electron)

### Estrutura do projecto

```
nexus-desktop/
├── package.json
├── electron-builder.yml
├── src/
│   ├── main/                      # Processo principal Electron (Node) — substitui o FastAPI
│   │   ├── index.ts                # ciclo de vida da app, criação de janela, tray
│   │   ├── ipc/
│   │   │   ├── tools.ts            # handlers IPC para fs/bash
│   │   │   └── permissions.ts      # gate de permissões (ver correções abaixo)
│   │   ├── services/                # Provider Router portado de backend/services/*.py
│   │   │   ├── catalog.ts
│   │   │   ├── keyVault.ts
│   │   │   ├── fallbackChain.ts
│   │   │   ├── rateLimiter.ts
│   │   │   ├── healthChecker.ts
│   │   │   ├── providerClients.ts
│   │   │   └── analytics.ts
│   │   ├── tools/                   # portado de backend/tools/*.py
│   │   │   ├── filesystem.ts
│   │   │   └── bash.ts
│   │   └── db.ts                    # better-sqlite3 ou node:sqlite
│   ├── preload/
│   │   └── index.ts                 # contextBridge — única ponte exposta ao renderer
│   └── renderer/                    # React — ponto de partida: CHAT/ui/src
│       ├── App.tsx
│       ├── pages/ (ChatPage, SettingsPage, AnalyticsPage — sem LoginPage/JWT)
│       └── components/
```

### Fase 1 — Scaffold Electron

```bash
cd nexus-desktop
npm create vite@latest src/renderer -- --template react-ts
npm install electron electron-builder --save-dev
npm install execa better-sqlite3
```

Criar `src/main/index.ts` com uma janela básica (`BrowserWindow`) a carregar o build do Vite. Confirmar que abre no Ubuntu antes de avançar — não acumular fases sem validar a anterior.

### Fase 2 — Portar o Provider Router para TypeScript

Ordem sugerida (cada um é maioritariamente chamadas HTTP + bookkeeping, sem dependências Python específicas — porta-se de forma direta):

1. `catalog.ts` ← `backend/services/catalog.py`
2. `keyVault.ts` ← `backend/services/key_vault.py` (usar `node:crypto` para AES-256-GCM, equivalente directo)
3. `providerClients.ts` ← `backend/services/provider_clients.py`
4. `fallbackChain.ts` ← `backend/services/fallback_chain.py`
5. `rateLimiter.ts` ← `backend/services/rate_limiter.py`
6. `healthChecker.ts` ← `backend/services/health_checker.py`
7. `analytics.ts` ← `backend/services/analytics.py`

Testar cada serviço isoladamente (uma chamada manual) antes de ligar à UI.

### Fase 3 — Portar as tools, corrigindo os 2 bugs conhecidos

Ao portar `backend/tools/filesystem.py` e `backend/tools/permissions.py`, **não copiar o comportamento tal como está** — tinha dois problemas de segurança identificados nesta análise:

1. `read_file`/`list_dir`/`file_info` não tinham **nenhuma** verificação de permissão. No desktop não há utilizadores remotos, mas mesmo assim a leitura deve respeitar a mesma política de "ask" que `write_file`/`delete_file`/`bash`, por consistência.
2. A verificação de permissões fazia `pattern in action` (substring) — uma regra com `pattern=""` dava match em tudo. Implementar com comparação exacta ou glob real (ex: `minimatch`), nunca substring solta.

Para `bash.ts`: não usar `child_process.exec`/`shell: true` directamente (no Windows isso invoca `cmd.exe`, no Linux/Mac invoca `/bin/sh` — comportamento diferente). Usar `execa`, que trata isto de forma consistente entre os 3 SO.

IPC: expor só métodos nomeados via `contextBridge.exposeInMainWorld` no preload (ex: `window.nexus.tools.run(name, args)`). Nunca activar `nodeIntegration` no renderer nem expor `ipcRenderer` em bruto — é a prática de segurança standard do Electron.

### Fase 4 — Adaptar a UI

Copiar `ui/src/` (caminho achatado, sem prefixo `CHAT/`) para `nexus-desktop/src/renderer/` como ponto de partida (o React não muda entre web e desktop). **Nota:** se `CHAT-UI-REDESIGN-JAN.md` já tiver sido implementado nessa altura, este `ui/src/` já vem com os componentes inspirados no Jan (Button, MessageBubble, Markdown, ConversationSidebar, etc.) — partes de um trabalho, não duplicar.

Remover:
- `LoginPage.tsx` e todo o fluxo JWT — desktop é single-user local, não há "login".
- Chamadas `fetch('/api/...')` → substituir por `window.nexus.*` (chamadas IPC ao processo principal).

Manter: `ChatPage`, `SettingsPage` (chaves dos providers), `AnalyticsPage`, a lógica de streaming/markdown.

### Fase 5 — Sistema de permissões na UI

Recriar o popup de confirmação (o antigo `PermissionModal.tsx` serve de referência visual) ligado aos eventos IPC de `permissions.ts` — pedido aparece, utilizador aceita/rejeita, resposta volta para o `bash.ts`/`filesystem.ts` que estava em espera.

### Fase 6 — Empacotamento (Windows/Mac/Linux)

`electron-builder` com targets `nsis` (Windows), `dmg` (Mac), `AppImage` ou `deb` (Linux). Build local no Ubuntu cobre Linux; Windows e Mac precisam de CI (GitHub Actions com matriz `windows-latest` / `macos-latest` / `ubuntu-latest`) ou máquinas próprias — `electron-builder` não faz cross-compile de verdade para Mac/Windows a partir de Linux com garantia total (sobretudo assinatura de código).

### Fase 7 — Modelos locais (Ollama)

Mesma ideia do plano original: o serviço `providerClients.ts` chama a API HTTP local do Ollama (`http://localhost:11434`) tal como qualquer outro provider — não precisa de tratamento especial.

---

## O que NÃO fazer (lições desta análise)

- Não voltar a partilhar literalmente `backend/`/`ui/src` entre o build web e o desktop — foi a causa da tools router ter ficado exposta na web sem querer.
- Não meter JWT/multi-utilizador no desktop — é um único utilizador local.
- Não assumir que `shell: true` se comporta igual em Windows e Linux/Mac.
- Não saltar a Fase 6 (CI multi-SO) — desenvolver só no Ubuntu não apanha bugs específicos de Windows/Mac.
