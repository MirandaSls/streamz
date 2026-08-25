# Pendências de ambiente

Coisas que **você precisa instalar/configurar** para rodar o projeto de ponta a
ponta. Nada disso bloqueia escrever código — bloqueia apenas *executar*. Marque
conforme resolver.

## 1. Postgres — subir o banco (única coisa que falta)
O projeto roda **só em Postgres**, em dev e em prod: um `schema.prisma`, os enums
no banco e migrations versionadas. Não há mais SQLite nem `db push`. O que falta
é ter um Postgres de pé.

- [x] `schema.prisma` é o Postgres (`provider = "postgresql"`, enums
      `UserStatus`, `ChannelType`, `MemberRole`). A variante
      `schema.postgres.prisma` foi apagada.
- [x] **Migration inicial** em `apps/api/prisma/migrations/20260825000000_init/`
      — confere com o schema atual (`prisma migrate diff --from-empty`).
- [ ] Subir o banco — escolha um:
  - **Docker Desktop**: `pnpm db:up` (sobe só o Postgres, exposto apenas em
      `127.0.0.1:5432`). `DATABASE_URL=`
      `postgresql://newdisc:newdisc@localhost:5432/newdisc?schema=public`.
      Credenciais diferentes: exporte `POSTGRES_USER`/`POSTGRES_PASSWORD`/
      `POSTGRES_DB` antes do compose e reflita na `DATABASE_URL`.
  - **Gerenciado**: banco grátis em [neon.tech](https://neon.tech) ou
      [supabase.com](https://supabase.com); colar a URL em `DATABASE_URL`.
- [ ] Aplicar o schema: **`pnpm db:migrate`** em dev (gera e aplica migrations),
      **`pnpm db:deploy`** em prod/CI (só aplica o que já existe).

> **Ao mudar um modelo:** edite o `schema.prisma` e rode `pnpm db:migrate`. Toda
> mudança vira migration versionada — `prisma db push` não faz parte do fluxo,
> porque deixa o banco fora de sincronia com o histórico sem deixar rastro.

## 1b. Cloudflare R2 (bloqueia os anexos)
O código de anexos está pronto (upload, storage, render); falta só a credencial
para testar ponta a ponta — mesmo padrão do LiveKit.

- [ ] Criar um bucket em [dash.cloudflare.com](https://dash.cloudflare.com) → R2 e
      um **API Token** (S3). Preencher no `.env`: `R2_ACCOUNT_ID`,
      `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
- [ ] (Opcional) `R2_PUBLIC_BASE_URL` com o domínio público do bucket (r2.dev ou
      domínio próprio). Sem ela, os anexos são servidos pelo proxy da API em
      `/api/uploads/file/:id` — funciona só com as credenciais acima.

## 2. LiveKit (bloqueia a voz — Dia 4)
O código de voz é **agnóstico de provedor** (só usa `LIVEKIT_URL/KEY/SECRET`).
Duas formas de rodar — escolha uma:

**Opção A — Self-host via Docker (preparado):**
- [x] Serviço `livekit` no `docker-compose.yml` (profile `livekit`) + config em
      `livekit.yaml` + scripts `pnpm livekit:up` / `livekit:down`.
- [ ] Trocar o `keys:` do `livekit.yaml` e o `LIVEKIT_API_SECRET` do `.env` por um
      secret aleatório (>= 32 chars) — os dois precisam **bater**.
- [ ] `pnpm livekit:up` e usar no `.env` (Opção A): `LIVEKIT_URL=ws://localhost:7880`,
      `NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880`, `LIVEKIT_API_KEY=devkey`.

**Opção B — LiveKit Cloud:**
- [ ] Criar conta e um *project* em [cloud.livekit.io](https://cloud.livekit.io).
- [ ] Copiar **URL** (`wss://...`), **API Key** e **API Secret** para o `.env`
      (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`,
      `NEXT_PUBLIC_LIVEKIT_URL`).

## 3. Rust / cargo (bloqueia o build do desktop — Dia 5)
- [ ] Instalar via [rustup.rs](https://rustup.rs). Necessário para o Tauri.
- [ ] Gerar os ícones do app:
      `pnpm --filter @newdisc/desktop tauri icon caminho/logo.png`

## 4. Segredos do `.env`
- [ ] Trocar `JWT_SECRET` e `JWT_REFRESH_SECRET` por strings aleatórias longas
      (ex.: `openssl rand -hex 32`).

## 5. Mais adiante (pós-MVP)
- [ ] Assinatura de código do instalador Windows (Azure Trusted Signing) — remove
      o alerta do SmartScreen ao enviar o `.exe`.
- [ ] Migrar a mídia de LiveKit Cloud para **self-host** (call sem limite de
      tempo) quando o MVP estiver validado.

## 6. Backlog de escopo (próximos blocos)
Ordem sugerida dos próximos blocos de features:

- [x] ~~**Anexos/imagens nas mensagens**~~ — feito: módulos `storage` (cliente
      S3→Cloudflare R2) e `uploads` (`POST /uploads` com validação por
      magic-bytes + `GET /uploads/file/:id` como proxy), modelo `Attachment`
      vinculado por id no envio da mensagem, e composer com input/drag-drop/colar
      + render inline de imagens e card de arquivo. _Typecheck ok nos 3 pacotes;
      o upload real depende das credenciais `R2_*` (sem elas, responde 503)._
- [x] ~~**Convites de verdade**~~ — feito: modelo `Invite` (código, expiração,
      limite de usos), endpoints criar/preview/redeem, UI de criar convite e
      entrar por código. Verificado ponta a ponta. O `POST /guilds/:id/join`
      antigo foi **removido** (furava os convites).
- [x] ~~**Moderação**~~ — feito: kick, ban (bloqueia reentrada por convite),
      unban e lista de bans, com hierarquia de papéis; UI de expulsar/banir no
      hover da lista de membros. Verificado ponta a ponta. O usuário expulso/
      banido agora **sai da tela em tempo real** (evento WS `guild.removed`).
- [x] ~~**DMs 1-a-1**~~ — feito: canal de DM canonicalizado por dupla, lista,
      histórico e envio em tempo real (salas por usuário no gateway); UI com
      botão ✉️ no rail e 💬 na lista de membros. Verificado ponta a ponta.
- [x] ~~**Grupos de DM** (3+ pessoas)~~ — feito: modelo baseado em
      participantes (`DMParticipant`), `POST /dms/group`, título/avatar por
      conversa e modal de criar grupo a partir dos contatos. _Typecheck ok;
      falta validar ponta a ponta._
- [x] ~~**Busca de mensagens** e **carregar histórico antigo**~~ — feito: busca
      por conteúdo no canal + scroll infinito (paginação por cursor, preservando
      a posição de rolagem). Verificado com 120 mensagens (50+50+20) e busca.
- [x] ~~**Threads**~~ — feito: `Message.parentId`, timeline mostra só raízes,
      `GET .../:messageId/thread`, contador de respostas e painel lateral de
      thread com envio em tempo real. _Typecheck ok; falta validar ponta a ponta._
- [ ] **Stickers, emojis animados** (dependem de storage de assets — ver Anexos).

### Lacunas conhecidas
- [x] ~~**Presença em tempo real**~~ — implementado: o gateway conta conexões por
      usuário e emite `presence.update` (ONLINE/OFFLINE) no connect/disconnect,
      atualizando o DB e a lista de membros ao vivo. Verificado com 2 usuários.
- [x] ~~**Permissões de canal**~~ — feito o essencial: canais **privados**
      (allowlist `ChannelMember` além de OWNER/ADMIN) e **somente-leitura** (só
      moderação posta), com autorização central (`assertCanView/PostChannel`),
      lista de canais escondendo privados e UI de criar/gerenciar acesso.
      _Ainda um corte:_ não há matriz de overrides por papel/permissão fina
      (ex.: silenciar, gerenciar mensagens) — só os dois modos acima.
- [ ] **DM não tem as features de mensagem** (reação, anexo, edição, remoção,
      thread, busca) porque vive em tabelas separadas de `Channel`/`Message`.
      Proposta de unificação, com SQL de migração e plano de execução, em
      [`docs/adr/0001-unificar-dm-em-channel-message.md`](docs/adr/0001-unificar-dm-em-channel-message.md)
      — mudança cross-cutting, decidir antes de implementar.

---
_Status atual: backend em Postgres (schema único + migration inicial; falta só
subir o banco); chat de texto (editar/apagar/reagir), threads, DMs 1-a-1 e em grupo, moderação em tempo real e canais privados/somente-
leitura implementados (features novas com typecheck ok, faltando validação ponta
a ponta com o servidor rodando). Falta provisionar o Postgres, credenciais do
LiveKit e o Rust para o build desktop._
