# NewDisc

Clone do Discord (MVP) — chat em servidores/canais em tempo real, voz/vídeo/tela
e app desktop. Monolito **NestJS** + **Next.js** + **Tauri** num monorepo.

## Stack

| Camada  | Tecnologia |
|---------|------------|
| Cliente | Next.js (App Router), React, Tailwind, TanStack Query, Zustand |
| Backend | NestJS (REST + WebSocket via Socket.IO), Prisma |
| Banco   | PostgreSQL |
| Mídia   | LiveKit (Cloud no MVP → self-host depois) |
| Desktop | Tauri 2 |
| Monorepo| pnpm workspaces + Turborepo |

## Estrutura

```
apps/
  api/       # NestJS — auth, guilds, channels, messages, gateway (ws), voice
  web/       # Next.js — login/registro + app de chat de 3 colunas
  desktop/   # Tauri — embrulha a web num instalador
packages/
  shared/    # tipos e schemas (zod) compartilhados api ↔ web
```

## Rodando (dev)

Pré-requisitos: **Node 20+**, **pnpm 9+**, **Docker**, (para o desktop) **Rust**.

```bash
# 1. variáveis de ambiente
cp .env.example .env
#    preencha as credenciais do LiveKit Cloud (cloud.livekit.io)

# 2. banco
pnpm db:up                 # sobe o Postgres via docker-compose

# 3. dependências
pnpm install

# 4. schema do banco
pnpm db:migrate            # prisma migrate dev

# 5. subir api + web juntos
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:3333/api  (health: `/api/health`)

## App desktop

O app desktop (Tauri 2) embrulha o cliente web numa janela nativa e num
instalador Windows (`.exe` NSIS + `.msi`).

```bash
# dev (abre janela nativa carregando a web em http://localhost:3000)
pnpm --filter @newdisc/desktop dev

# build do instalador (Windows: .exe/.msi)
#   antes: gere os ícones (ver apps/desktop/src-tauri/icons/README.md)
pnpm --filter @newdisc/desktop build
```

O build embute a web como HTML estático: o Next liga `output: "export"` sozinho
quando roda dentro do Tauri. Detalhes e alternativas: `apps/desktop/README.md`.

### Recursos nativos

- **System tray (bandeja):** ícone na bandeja com menu de contexto
  (*Abrir NewDisc*, *Sair*). Fechar a janela **minimiza para a bandeja** em vez
  de encerrar o app; o clique esquerdo no ícone (ou o item *Abrir NewDisc*)
  restaura a janela. Implementado em `src-tauri/src/main.rs` com
  `tauri::tray::TrayIconBuilder` (feature `tray-icon` no `Cargo.toml`).
- **Notificações nativas:** plugin `tauri-plugin-notification` registrado no
  `main.rs`, com permissão `notification:default` em
  `src-tauri/capabilities/default.json`. O lado web usa a ponte isolada
  `apps/web/lib/desktop.ts` (`notify(title, body)`): dentro do Tauri usa a
  notificação nativa; no navegador, cai para a Notification API do browser. Para
  ligar, chame `notify(...)` ao receber `message.new` (instruções no topo do
  arquivo). A ponte depende de `withGlobalTauri: true` (já ligado em
  `tauri.conf.json`), que expõe `window.__TAURI__` — sem dependência npm nova.

### Auto-update (esboçado — sem servidor ainda)

O `tauri-plugin-updater` já está **registrado** no `main.rs` e **configurado**
em `tauri.conf.json` (`plugins.updater`) com um endpoint *placeholder* e um
campo `pubkey` a preencher. Como JSON não aceita comentários, os valores levam
nomes autoexplicativos (`releases.newdisc.dev/...`, `COLOQUE_AQUI_A_CHAVE...`).
Ainda **não há servidor real** — para ativar de verdade:

1. Gere o par de chaves de assinatura:
   `pnpm --filter @newdisc/desktop tauri signer generate`.
2. Cole a **chave pública** em `plugins.updater.pubkey` no `tauri.conf.json`.
3. Aponte `plugins.updater.endpoints` para o servidor/CDN real de releases.
4. Troque `bundle.createUpdaterArtifacts` para `true` e assine o build exportando
   `TAURI_SIGNING_PRIVATE_KEY` (e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) no build.

### Permissões (capabilities)

Tauri 2 exige capabilities explícitas: ver `src-tauri/capabilities/default.json`
(janela principal + `notification:default` + `updater:default` + permissões de
janela usadas pelo tray). O Tauri carrega automaticamente todos os arquivos da
pasta `capabilities/`.

## Roadmap (sprint de 5 dias)

1. **Dia 1** — fundação: monorepo, auth, banco, shell web.
2. **Dia 2** — backend do chat: guilds/channels/messages + gateway ws.
3. **Dia 3** — frontend do chat: layout de 3 colunas, mensagens ao vivo.
4. **Dia 4** — voz via LiveKit Cloud.
5. **Dia 5** — empacotamento desktop + instalador.

Escopo detalhado e cortes conscientes: ver o documento de escopo do projeto.
